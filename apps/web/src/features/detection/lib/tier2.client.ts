import { TIER2_MODEL_ID } from "@safeframe/core";
import type { Tier2Request, Tier2Response } from "../workers/tier2.worker";

export interface Tier2Client {
  /** NSFW probability for a 224×224 frame, computed off the main thread. */
  classify(image: ImageData): Promise<number>;
  backend: "webgpu" | "wasm";
  loadMs: number;
  modelId: typeof TIER2_MODEL_ID;
  dispose(): void;
}

/**
 * Promise-RPC wrapper over the Tier-2 worker. Created lazily and ONLY when
 * the device tier permits — on low-tier devices this module's create() is
 * never called, so the large model (84–164 MB depending on backend dtype) is never fetched (verifiable in the
 * network tab).
 */
export function createTier2Client(): Promise<Tier2Client> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/tier2.worker.ts", import.meta.url),
      { type: "module" },
    );

    let nextId = 1;
    const inflight = new Map<
      number,
      { resolve: (nsfw: number) => void; reject: (err: Error) => void }
    >();

    worker.addEventListener("message", (event: MessageEvent<Tier2Response>) => {
      const msg = event.data;
      switch (msg.type) {
        case "ready":
          resolve({
            backend: msg.backend,
            loadMs: msg.loadMs,
            modelId: TIER2_MODEL_ID,
            classify(image: ImageData): Promise<number> {
              return new Promise((res, rej) => {
                const id = nextId++;
                inflight.set(id, { resolve: res, reject: rej });
                // Copy the pixel buffer — the caller may reuse its ImageData.
                const data = image.data.slice().buffer;
                const req: Tier2Request = {
                  type: "classify",
                  id,
                  data,
                  width: image.width,
                  height: image.height,
                };
                worker.postMessage(req, [data]);
              });
            },
            dispose() {
              worker.terminate();
              for (const p of inflight.values()) {
                p.reject(new Error("Tier-2 worker disposed"));
              }
              inflight.clear();
            },
          });
          break;
        case "init-error":
          worker.terminate();
          reject(new Error(msg.message));
          break;
        case "result":
          inflight.get(msg.id)?.resolve(msg.nsfw);
          inflight.delete(msg.id);
          break;
        case "error":
          inflight.get(msg.id)?.reject(new Error(msg.message));
          inflight.delete(msg.id);
          break;
      }
    });

    worker.addEventListener("error", (event) => {
      reject(new Error(event.message || "Tier-2 worker failed to start"));
    });

    const init: Tier2Request = { type: "init" };
    worker.postMessage(init);
  });
}
