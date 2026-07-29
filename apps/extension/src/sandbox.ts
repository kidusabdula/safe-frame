import * as tf from "@tensorflow/tfjs";
import * as nsfwjs from "nsfwjs";
import { MODEL_INPUT_SIZE } from "@safeframe/core/constants";
import type { CategoryScores } from "@safeframe/core";
import type { ClassifyRequest, FromSandboxPayload } from "./protocol";

/**
 * The inference frame.
 *
 * Runs as an extension page inside a hidden iframe on the host page, for two
 * specific reasons:
 *
 * 1. It gets the *extension's* CSP, which declares 'wasm-unsafe-eval'. A page
 *    like YouTube has its own CSP that would refuse to load our runtime.
 * 2. It talks to the content script over `postMessage`, which is structured
 *    clone — so pixel buffers transfer instead of being JSON-encoded, which is
 *    what makes per-frame classification affordable at all.
 *
 * An MV3 offscreen document was the obvious alternative and is the wrong tool:
 * reaching it requires `chrome.runtime` messaging, and that path is JSON-only.
 */

const TAG = "[SafeFrame/inference]";
/** Shared secret from the iframe URL fragment — see content.ts for why. */
const TOKEN = location.hash.slice(1);

const EMPTY: CategoryScores = {
  porn: 0,
  hentai: 0,
  sexy: 0,
  neutral: 0,
  drawing: 0,
};

function post(message: FromSandboxPayload): void {
  window.parent.postMessage({ ...message, token: TOKEN }, "*");
}

const canvas = document.createElement("canvas");
canvas.width = MODEL_INPUT_SIZE;
canvas.height = MODEL_INPUT_SIZE;
const ctx = canvas.getContext("2d", { willReadFrequently: true });

let model: nsfwjs.NSFWJS | null = null;
let activeBackend = "none";

/**
 * Pick a backend and *verify* it took.
 *
 * `tf.setBackend()` resolves to a boolean and returns false when the backend is
 * unavailable — most commonly because the browser has run out of WebGL
 * contexts, which caps out around 16 per process and which a heavy host page
 * can exhaust on its own. Ignoring that return value was a real bug: inference
 * silently fell through to the CPU backend at seconds per frame, or stalled,
 * with nothing logged. Now it is explicit and reported to the content script.
 */
async function pickBackend(): Promise<string> {
  for (const candidate of ["webgl", "cpu"]) {
    try {
      const took = await tf.setBackend(candidate);
      await tf.ready();
      if (took && tf.getBackend() === candidate) {
        if (candidate !== "webgl") {
          console.warn(
            `${TAG} WebGL unavailable (host page may have exhausted GPU contexts) — running on ${candidate}, which is much slower.`,
          );
        }
        return candidate;
      }
      console.warn(`${TAG} backend "${candidate}" did not engage`);
    } catch (err) {
      console.warn(`${TAG} backend "${candidate}" threw:`, err);
    }
  }
  throw new Error("no usable TensorFlow.js backend (tried webgl, cpu)");
}

async function init(): Promise<void> {
  const t0 = performance.now();
  activeBackend = await pickBackend();
  console.info(`${TAG} backend=${activeBackend}, loading model…`);

  model = await nsfwjs.load("MobileNetV2");
  if (!ctx) throw new Error("2D canvas context unavailable");
  // Warm-up: the first inference pays for shader compilation.
  await model.classify(canvas);

  const loadMs = Math.round(performance.now() - t0);
  console.info(`${TAG} ready in ${loadMs}ms on ${activeBackend}`);
  post({ kind: "safeframe:ready", backend: activeBackend, loadMs });
}

function toScores(
  predictions: Array<{ className: string; probability: number }>,
): CategoryScores {
  const scores: CategoryScores = { ...EMPTY };
  for (const p of predictions) {
    const key = p.className.toLowerCase();
    if (key in scores) {
      scores[key as keyof CategoryScores] = Math.min(
        1,
        Math.max(0, p.probability),
      );
    }
  }
  return scores;
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const data = event.data as (Partial<ClassifyRequest> & { token?: string }) | null;
  // Token check rather than window identity: see content.ts. Anything without
  // the fragment secret is not our embedder and is ignored.
  if (!data || data.token !== TOKEN || data.kind !== "safeframe:classify") return;

  const id = data.id ?? 0;
  void (async () => {
    try {
      if (!model || !ctx) {
        post({ kind: "safeframe:error", id, message: "model not ready" });
        return;
      }
      const { width, height, buffer } = data as ClassifyRequest;
      const pixels = new ImageData(new Uint8ClampedArray(buffer), width, height);
      ctx.putImageData(pixels, 0, 0);
      const predictions = await model.classify(canvas);
      post({ kind: "safeframe:result", id, scores: toScores(predictions) });
    } catch (err) {
      post({
        kind: "safeframe:error",
        id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  })();
});

// Watchdog: model loading has no progress events, so a stall would otherwise be
// indistinguishable from slowness. Say so instead of leaving a silent frame.
const watchdog = window.setTimeout(() => {
  if (!model) {
    console.error(
      `${TAG} still not ready after 30s — backend=${activeBackend}. The model is bundled, so this is a runtime problem, not a download.`,
    );
    post({
      kind: "safeframe:error",
      id: null,
      message: `model load stalled >30s (backend=${activeBackend})`,
    });
  }
}, 30_000);

void init()
  .then(() => window.clearTimeout(watchdog))
  .catch((err: unknown) => {
    window.clearTimeout(watchdog);
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${TAG} init failed:`, err);
    post({ kind: "safeframe:error", id: null, message });
  });
