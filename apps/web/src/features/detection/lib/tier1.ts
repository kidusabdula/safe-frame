import * as tf from "@tensorflow/tfjs";
import { setWasmPaths } from "@tensorflow/tfjs-backend-wasm";
import * as nsfwjs from "nsfwjs";
import { TIER1_MODEL_ID, type CategoryScores } from "@safeframe/core";

export type Tier1Backend = "webgl" | "wasm";

export interface Tier1 {
  classify(image: ImageData): Promise<CategoryScores>;
  backend: Tier1Backend;
  loadMs: number;
  modelId: typeof TIER1_MODEL_ID;
}

let loadPromise: Promise<Tier1> | null = null;

/**
 * Typed adapter around NSFWJS (MobileNetV2, bundled with the package — no
 * network download for Tier 1). Untyped library output is confined to this
 * file: everything past `classify` speaks CategoryScores only.
 *
 * Backend policy: WebGL where available (fast, works back to 2016-era
 * Chrome), WASM as the fallback (assets self-hosted under /tfjs-wasm/).
 */
export function loadTier1(): Promise<Tier1> {
  loadPromise ??= (async () => {
    const t0 = performance.now();
    const backend = await pickBackend();
    const model = await nsfwjs.load("MobileNetV2");
    // Warm-up: first inference compiles WebGL shaders / WASM kernels.
    const warm = new ImageData(224, 224);
    await model.classify(warm);
    return {
      backend,
      loadMs: performance.now() - t0,
      modelId: TIER1_MODEL_ID,
      async classify(image: ImageData): Promise<CategoryScores> {
        const predictions = await model.classify(image);
        const scores: CategoryScores = {
          porn: 0,
          hentai: 0,
          sexy: 0,
          neutral: 0,
          drawing: 0,
        };
        for (const p of predictions) {
          const key = p.className.toLowerCase();
          if (key in scores) {
            scores[key as keyof CategoryScores] = clamp01(p.probability);
          }
        }
        return scores;
      },
    };
  })();
  return loadPromise;
}

async function pickBackend(): Promise<Tier1Backend> {
  try {
    await tf.setBackend("webgl");
    await tf.ready();
    if (tf.getBackend() === "webgl") return "webgl";
  } catch {
    // fall through to wasm
  }
  setWasmPaths("/tfjs-wasm/");
  await tf.setBackend("wasm");
  await tf.ready();
  if (tf.getBackend() !== "wasm") {
    throw new Error("No usable TensorFlow.js backend (WebGL and WASM failed)");
  }
  return "wasm";
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
