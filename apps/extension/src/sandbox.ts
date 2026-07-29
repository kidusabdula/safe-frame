import * as tf from "@tensorflow/tfjs";
import * as nsfwjs from "nsfwjs";
import { MODEL_INPUT_SIZE } from "@safeframe/core/constants";
import type { CategoryScores } from "@safeframe/core";
import type { ClassifyRequest, FromSandbox } from "./protocol";

/**
 * The inference frame.
 *
 * This runs as an extension page inside a hidden iframe on the host page, for
 * two specific reasons:
 *
 * 1. It gets the *extension's* CSP, which declares 'wasm-unsafe-eval'. A page
 *    like YouTube has its own CSP that would refuse to load our runtime.
 * 2. It can talk to the content script over `postMessage`, which is structured
 *    clone — so pixel buffers transfer instead of being JSON-encoded, which is
 *    what makes per-frame classification affordable at all.
 *
 * An MV3 offscreen document was the obvious alternative and is the wrong tool
 * here: reaching it requires `chrome.runtime` messaging through the service
 * worker, and that path is JSON-only.
 */

const EMPTY: CategoryScores = {
  porn: 0,
  hentai: 0,
  sexy: 0,
  neutral: 0,
  drawing: 0,
};

function post(message: FromSandbox): void {
  window.parent.postMessage(message, "*");
}

const canvas = document.createElement("canvas");
canvas.width = MODEL_INPUT_SIZE;
canvas.height = MODEL_INPUT_SIZE;
const ctx = canvas.getContext("2d", { willReadFrequently: true });

let model: nsfwjs.NSFWJS | null = null;

async function init(): Promise<void> {
  // WebGL only. The WASM backend would mean shipping .wasm binaries as
  // web-accessible resources for a fallback that a machine capable of playing
  // video almost certainly does not need.
  await tf.setBackend("webgl");
  await tf.ready();
  model = await nsfwjs.load("MobileNetV2");
  // Warm-up: the first inference pays for shader compilation.
  await model.classify(canvas);
  post({ kind: "safeframe:ready" });
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
  // Only the embedding content script may drive this frame.
  if (event.source !== window.parent) return;
  const data = event.data as Partial<ClassifyRequest> | null;
  if (!data || data.kind !== "safeframe:classify") return;

  const id = data.id ?? 0;
  void (async () => {
    try {
      if (!model || !ctx) {
        post({ kind: "safeframe:error", id, message: "model not ready" });
        return;
      }
      const { width, height, buffer } = data as ClassifyRequest;
      const pixels = new ImageData(
        new Uint8ClampedArray(buffer),
        width,
        height,
      );
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

void init().catch((err: unknown) => {
  post({
    kind: "safeframe:error",
    id: null,
    message: err instanceof Error ? err.message : String(err),
  });
});
