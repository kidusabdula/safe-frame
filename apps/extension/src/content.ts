// Deep imports on purpose. The package barrel re-exports the Zod schema module,
// whose top-level `z.object(...)` calls are side effects a bundler cannot shake
// out — so importing from "@safeframe/core" would drag a validation library into
// a script injected on every page. These three modules are pure functions and
// constants with no runtime dependencies at all. Types still come from the
// barrel, because type imports are erased.
import { combineClassScores } from "@safeframe/core/scoring";
import { createAggregator } from "@safeframe/core/aggregate";
import { MODEL_INPUT_SIZE } from "@safeframe/core/constants";
import type { CategoryScores, DetectionConfig } from "@safeframe/core";
import type { ClassifyRequest, FromSandbox } from "./protocol";

/**
 * SafeFrame live guard, as a content script.
 *
 * This is the production shape of the idea the web app demonstrates: instead of
 * asking the user to hand us a file, watch whatever the browser is already
 * playing and respond in place. It reuses @safeframe/core untouched — the
 * scoring, smoothing and hysteresis are the same functions the web app and the
 * mobile app call, which is the payoff for keeping that package free of any DOM
 * or framework dependency.
 *
 * Honest limits, stated in the docs and worth repeating at the call site:
 *  - The guard is *reactive*. A detection lands within one sample interval, so
 *    there is a sub-second window where a flagged frame was on screen. Zero
 *    exposure needs a pre-scan, which streaming does not allow.
 *  - DRM/EME video yields black frames to canvas by design. We detect that and
 *    say so rather than silently reporting everything as safe.
 */

const SAMPLE_INTERVAL_MS = 400;
const BLUR_PX = 28;
/** Consecutive all-black readbacks before we conclude the frames are protected. */
const BLACK_FRAMES_BEFORE_GIVING_UP = 5;

/**
 * The guard's own policy, written as a literal rather than obtained from
 * `resolveConfig()`.
 *
 * Two reasons. First, `resolveConfig` is the Zod entry point, and pulling Zod
 * into a script that is injected into every page on the web to read four
 * numbers is indefensible — the type import below is erased at build time, so
 * this file ships no schema code at all. Second, a live guard is legitimately
 * not a pre-scan: it sees one frame at a time with no verifier behind it, so its
 * thresholds are its own policy rather than a copy of the scanner's.
 */
const config: DetectionConfig = {
  flagThreshold: 0.6,
  releaseThreshold: 0.4,
  borderlineLow: 0.35,
  borderlineHigh: 0.75,
  sexyWeight: 0.4,
  tier2Weight: 0.65,
  minEvidenceS: 1.5,
  minEvidenceFrames: 3,
  samplingFps: 1000 / SAMPLE_INTERVAL_MS,
  densifyFps: 2,
  densifyWindowS: 2,
  tier2Budget: 0,
  windowSize: 4,
  minFramesForVerdict: 3,
  responseMode: "composite",
  runMode: "live",
  strictPreview: false,
};

/* ── Inference frame ─────────────────────────────────────────────────── */

let frameWindow: Window | null = null;
let sandboxReady = false;
let nextRequestId = 1;
const pending = new Map<number, (scores: CategoryScores) => void>();

function mountInferenceFrame(): void {
  if (frameWindow) return;
  const iframe = document.createElement("iframe");
  iframe.src = chrome.runtime.getURL("sandbox.html");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0;left:-9999px;top:0;";
  document.documentElement.appendChild(iframe);
  frameWindow = iframe.contentWindow;
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!frameWindow || event.source !== frameWindow) return;
  const msg = event.data as FromSandbox | null;
  if (!msg || typeof msg !== "object") return;

  if (msg.kind === "safeframe:ready") {
    sandboxReady = true;
    return;
  }
  if (msg.kind === "safeframe:result") {
    pending.get(msg.id)?.(msg.scores);
    pending.delete(msg.id);
    return;
  }
  if (msg.kind === "safeframe:error") {
    if (msg.id !== null) pending.delete(msg.id);
    console.warn("[SafeFrame] inference error:", msg.message);
  }
});

function classify(pixels: ImageData): Promise<CategoryScores> {
  return new Promise((resolve, reject) => {
    if (!frameWindow || !sandboxReady) {
      reject(new Error("inference frame not ready"));
      return;
    }
    const id = nextRequestId++;
    pending.set(id, resolve);
    const request: ClassifyRequest = {
      kind: "safeframe:classify",
      id,
      width: pixels.width,
      height: pixels.height,
      buffer: pixels.data.buffer as ArrayBuffer,
    };
    // Transfer, don't copy: the buffer is dead on this side afterwards, which
    // is fine because a fresh readback happens every sample.
    frameWindow.postMessage(request, "*", [request.buffer]);
    // Never leak a pending entry if the frame stops answering.
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error("classification timed out"));
    }, 5000);
  });
}

/* ── Overlay (shadow DOM so no page CSS can reach it) ────────────────── */

const OVERLAY_CSS = `
:host { all: initial; }
.card {
  position: fixed;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  box-sizing: border-box;
  text-align: center;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #f5f7fa;
  background: rgba(18, 20, 28, 0.82);
  backdrop-filter: blur(18px);
  border-radius: 12px;
}
.title { font-size: 15px; font-weight: 600; margin: 0; }
.body { font-size: 12.5px; line-height: 1.5; margin: 0; max-width: 34ch; opacity: 0.82; }
.btn {
  min-height: 36px;
  padding: 0 14px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  color: #f5f7fa;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 9px;
  cursor: pointer;
}
.btn:hover { background: rgba(255, 255, 255, 0.2); }
.mark { font-size: 10.5px; letter-spacing: 0.04em; text-transform: uppercase; opacity: 0.6; margin: 0; }
`;

class Overlay {
  private host: HTMLDivElement;
  private card: HTMLDivElement;
  private raf: number | null = null;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onContinue: () => void,
  ) {
    this.host = document.createElement("div");
    const shadow = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = OVERLAY_CSS;

    this.card = document.createElement("div");
    this.card.className = "card";
    this.card.innerHTML = `
      <p class="mark">SafeFrame</p>
      <p class="title">This part is paused</p>
      <p class="body">We couldn't confirm this section is okay to watch, so it's blurred and paused for now. A grown-up can take a look and continue.</p>
    `;
    const button = document.createElement("button");
    button.className = "btn";
    button.textContent = "I'm a grown-up — continue";
    button.addEventListener("click", () => this.onContinue());
    this.card.appendChild(button);

    shadow.append(style, this.card);
  }

  show(): void {
    if (!this.host.isConnected) document.body.appendChild(this.host);
    this.card.style.display = "flex";
    this.track();
  }

  hide(): void {
    this.card.style.display = "none";
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }

  destroy(): void {
    this.hide();
    this.host.remove();
  }

  /**
   * The overlay is fixed-position and follows the video's box every frame.
   * Injecting it into the player's own DOM would be smaller code and would also
   * break the moment a site re-renders its player or goes fullscreen.
   */
  private track = (): void => {
    const rect = this.video.getBoundingClientRect();
    this.card.style.left = `${rect.left}px`;
    this.card.style.top = `${rect.top}px`;
    this.card.style.width = `${rect.width}px`;
    this.card.style.height = `${rect.height}px`;
    this.raf = requestAnimationFrame(this.track);
  };
}

/* ── Per-video guard ─────────────────────────────────────────────────── */

const canvas = document.createElement("canvas");
canvas.width = MODEL_INPUT_SIZE;
canvas.height = MODEL_INPUT_SIZE;
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const guarded = new WeakSet<HTMLVideoElement>();

class VideoGuard {
  private aggregator = createAggregator(config);
  private overlay: Overlay;
  private timer: number | null = null;
  private busy = false;
  private active = false;
  private overridden = false;
  private blackFrames = 0;
  private disabled: string | null = null;

  constructor(private readonly video: HTMLVideoElement) {
    this.overlay = new Overlay(video, () => this.allowThisEpisode());
    this.timer = window.setInterval(() => void this.tick(), SAMPLE_INTERVAL_MS);
  }

  destroy(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.overlay.destroy();
    this.video.style.filter = "";
  }

  private allowThisEpisode(): void {
    // Scoped to the current detection only. When the guard releases, the
    // override dies with it, so the next flagged moment gates again.
    this.overridden = true;
    this.release();
    void this.video.play();
  }

  private engage(): void {
    if (this.active) return;
    this.active = true;
    this.video.style.filter = `blur(${BLUR_PX}px)`;
    this.video.pause();
    this.overlay.show();
  }

  private release(): void {
    this.active = false;
    this.video.style.filter = "";
    this.overlay.hide();
  }

  private async tick(): Promise<void> {
    if (this.disabled || this.busy || !ctx) return;
    const v = this.video;
    if (v.paused || v.ended || v.readyState < 2 || v.videoWidth === 0) return;
    // Don't spend anything on a player that isn't on screen.
    const rect = v.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;

    this.busy = true;
    try {
      ctx.drawImage(v, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
      let pixels: ImageData;
      try {
        pixels = ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
      } catch {
        // Cross-origin video without CORS headers taints the canvas.
        this.disable(
          "this video's pixels can't be read (cross-origin without CORS)",
        );
        return;
      }

      if (this.isBlack(pixels)) {
        this.blackFrames += 1;
        if (this.blackFrames >= BLACK_FRAMES_BEFORE_GIVING_UP) {
          this.disable(
            "frames read back black — this is protected (DRM) content, which no client-side detector can inspect",
          );
        }
        return;
      }
      this.blackFrames = 0;

      const scores = await classify(pixels);
      const p = combineClassScores(scores, config.sexyWeight);
      const { guardActive } = this.aggregator.push({
        timestamp_s: v.currentTime,
        p,
        categories: scores,
      });

      if (guardActive && !this.overridden) this.engage();
      if (!guardActive) {
        // Leaving the flagged region ends the episode *and* its override.
        this.overridden = false;
        if (this.active) this.release();
      }
    } catch {
      // A single failed frame must not kill the guard loop.
    } finally {
      this.busy = false;
    }
  }

  private isBlack(pixels: ImageData): boolean {
    const d = pixels.data;
    let sum = 0;
    // Every 64th pixel is plenty to tell black from not-black.
    for (let i = 0; i < d.length; i += 256) {
      sum += (d[i] ?? 0) + (d[i + 1] ?? 0) + (d[i + 2] ?? 0);
    }
    return sum / (d.length / 256) < 3;
  }

  private disable(reason: string): void {
    this.disabled = reason;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.release();
    console.warn(`[SafeFrame] guard disabled for a video: ${reason}`);
  }
}

/* ── Discovery ───────────────────────────────────────────────────────── */

function attachTo(video: HTMLVideoElement): void {
  if (guarded.has(video)) return;
  guarded.add(video);
  mountInferenceFrame();
  const guard = new VideoGuard(video);
  // Single-page apps tear players down constantly; clean up when they go.
  const observer = new MutationObserver(() => {
    if (!video.isConnected) {
      guard.destroy();
      observer.disconnect();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function scan(): void {
  for (const video of document.querySelectorAll("video")) attachTo(video);
}

scan();
new MutationObserver(scan).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
