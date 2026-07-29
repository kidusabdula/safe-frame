import type { CategoryScores } from "@safeframe/core";

/**
 * The content script ↔ inference-frame protocol.
 *
 * Frames cross this boundary via `window.postMessage`, which uses structured
 * clone. That matters: `chrome.runtime` messaging is JSON-serialized, so a
 * 224×224×4 pixel buffer would become a ~200 000-element JSON array on every
 * sample. Structured clone moves the ArrayBuffer itself, and transferring it
 * makes the hand-off zero-copy.
 *
 * Every message carries a `token` — a random value the content script generates
 * and passes to the frame through its URL fragment. Both sides check it. This
 * replaced comparing `event.source` against `iframe.contentWindow`: that
 * identity comparison is fragile across a frame's initial about:blank →
 * real-document navigation, and a message silently failing that check is
 * indistinguishable from the model never loading.
 */

interface Tagged {
  token: string;
}

export interface ClassifyRequest extends Tagged {
  kind: "safeframe:classify";
  id: number;
  width: number;
  height: number;
  /** RGBA bytes, transferred rather than copied. */
  buffer: ArrayBuffer;
}

export interface ClassifyResponse extends Tagged {
  kind: "safeframe:result";
  id: number;
  scores: CategoryScores;
}

export interface ReadyMessage extends Tagged {
  kind: "safeframe:ready";
  /** Which TFJS backend actually engaged — "webgl" or the slower "cpu". */
  backend: string;
  loadMs: number;
}

export interface ErrorMessage extends Tagged {
  kind: "safeframe:error";
  id: number | null;
  message: string;
}

export type ToSandbox = ClassifyRequest;
export type FromSandbox = ClassifyResponse | ReadyMessage | ErrorMessage;

/**
 * `Omit<Union, K>` does NOT distribute over a union — it collapses to the keys
 * the members share, silently discarding the discriminated variants. The
 * conditional type forces distribution so each variant keeps its own fields.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** A message the frame sends, before the transport stamps the token on it. */
export type FromSandboxPayload = DistributiveOmit<FromSandbox, "token">;
