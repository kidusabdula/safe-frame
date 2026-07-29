import type { CategoryScores } from "@safeframe/core";

/**
 * The content script ↔ inference-frame protocol.
 *
 * Frames cross this boundary via `window.postMessage`, which uses structured
 * clone. That matters: `chrome.runtime` messaging is JSON-serialized, so a
 * 224×224×4 pixel buffer would become a ~200 000-element JSON array on every
 * sample. Structured clone moves the ArrayBuffer itself, and transferring it
 * makes the hand-off zero-copy.
 */

export interface ClassifyRequest {
  kind: "safeframe:classify";
  id: number;
  width: number;
  height: number;
  /** RGBA bytes, transferred rather than copied. */
  buffer: ArrayBuffer;
}

export interface ClassifyResponse {
  kind: "safeframe:result";
  id: number;
  scores: CategoryScores;
}

export interface ReadyMessage {
  kind: "safeframe:ready";
}

export interface ErrorMessage {
  kind: "safeframe:error";
  id: number | null;
  message: string;
}

export type ToSandbox = ClassifyRequest;
export type FromSandbox = ClassifyResponse | ReadyMessage | ErrorMessage;
