/// <reference lib="webworker" />
/**
 * Tier-2 classifier — quantized ViT NSFW detector via Transformers.js,
 * isolated in a Web Worker so ONNX inference never blocks the main thread.
 * WebGPU when the device offers it, WASM otherwise.
 *
 * Protocol: {type:"init"} → {type:"ready"|"init-error"}
 *           {type:"classify", id, data, width, height} → {type:"result"|"error"}
 */
import {
  pipeline,
  RawImage,
  type ImageClassificationPipeline,
} from "@huggingface/transformers";
import { TIER2_HF_MODEL } from "@safeframe/core";

export type Tier2Request =
  | { type: "init" }
  | { type: "classify"; id: number; data: ArrayBuffer; width: number; height: number };

export type Tier2Response =
  | { type: "ready"; backend: "webgpu" | "wasm"; loadMs: number }
  | { type: "init-error"; message: string }
  | { type: "result"; id: number; nsfw: number }
  | { type: "error"; id: number; message: string };

let classifier: ImageClassificationPipeline | null = null;

function post(message: Tier2Response): void {
  (self as unknown as Worker).postMessage(message);
}

/**
 * dtype per device is load-bearing, not a tuning knob: int8 (q8) dequantize
 * ops are broken on the WebGPU execution provider and silently return
 * numeric garbage (observed live: safe frames scoring nsfw 0.99). WebGPU
 * gets float weights (fp16, fp32 fallback); q8 stays for wasm, where it is
 * both correct and the bandwidth win it was designed to be.
 */
const ATTEMPTS: ReadonlyArray<{ device: "webgpu" | "wasm"; dtype: "fp16" | "fp32" | "q8" }> = [
  { device: "webgpu", dtype: "fp16" },
  { device: "webgpu", dtype: "fp32" },
  { device: "wasm", dtype: "q8" },
];

async function init(): Promise<void> {
  const t0 = performance.now();
  const hasWebGpu = "gpu" in navigator;
  const attempts = hasWebGpu ? ATTEMPTS : ATTEMPTS.filter((a) => a.device === "wasm");
  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      classifier = await pipeline("image-classification", TIER2_HF_MODEL, {
        dtype: attempt.dtype,
        device: attempt.device,
      });
      post({ type: "ready", backend: attempt.device, loadMs: performance.now() - t0 });
      return;
    } catch (err) {
      lastError = err; // driver quirks / unsupported dtype — fall through
    }
  }
  post({ type: "init-error", message: describe(lastError) });
}

async function classify(req: Extract<Tier2Request, { type: "classify" }>): Promise<void> {
  if (!classifier) {
    post({ type: "error", id: req.id, message: "Tier-2 not initialized" });
    return;
  }
  try {
    const image = new RawImage(
      new Uint8ClampedArray(req.data),
      req.width,
      req.height,
      4,
    );
    const output = await classifier(image);
    // Model labels: "nsfw" | "sfw". Take the nsfw probability.
    const flat = (Array.isArray(output[0]) ? output[0] : output) as Array<{
      label: string;
      score: number;
    }>;
    const nsfw = flat.find((o) => o.label.toLowerCase() === "nsfw")?.score ?? 0;
    post({ type: "result", id: req.id, nsfw: Math.min(1, Math.max(0, nsfw)) });
  } catch (err) {
    post({ type: "error", id: req.id, message: describe(err) });
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

self.addEventListener("message", (event: MessageEvent<Tier2Request>) => {
  const msg = event.data;
  if (msg.type === "init") void init();
  else if (msg.type === "classify") void classify(msg);
});
