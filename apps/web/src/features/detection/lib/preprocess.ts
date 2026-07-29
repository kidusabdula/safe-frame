import { MODEL_INPUT_SIZE } from "@safeframe/core";

export interface FrameGrabber {
  /** Draw the video's current frame at 224×224 and return its pixels. */
  grab(video: HTMLVideoElement): ImageData;
  kind: "offscreen" | "canvas";
}

/**
 * Frames are downscaled to the models' native 224×224 input before any
 * classifier sees a pixel — full-resolution frames never leave the video
 * element. OffscreenCanvas avoids layout/paint entanglement; the hidden
 * canvas fallback covers older browsers (e.g. 2016-era Chrome).
 */
export function createFrameGrabber(): FrameGrabber {
  const size = MODEL_INPUT_SIZE;

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      return {
        kind: "offscreen",
        grab(video) {
          ctx.drawImage(video, 0, 0, size, size);
          return ctx.getImageData(0, 0, size, size);
        },
      };
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas context unavailable");
  return {
    kind: "canvas",
    grab(video) {
      ctx.drawImage(video, 0, 0, size, size);
      return ctx.getImageData(0, 0, size, size);
    },
  };
}

/** True when getImageData failed because the source is cross-origin tainted. */
export function isTaintedCanvasError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "SecurityError" || err.message.includes("tainted"))
  );
}
