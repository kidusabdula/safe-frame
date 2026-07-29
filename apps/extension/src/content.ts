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
 * The production shape of what the web app demonstrates: instead of asking the
 * user to hand us a file, watch whatever the browser is already playing and
 * respond in place. It reuses @safeframe/core untouched — the scoring, smoothing
 * and hysteresis are the same functions the web and mobile apps call, which is
 * the payoff for keeping that package free of DOM and framework dependencies.
 *
 * Honest limits, worth repeating at the call site:
 *  - The guard is *reactive*. A detection lands within one sample interval, so
 *    there is a sub-second window where a flagged frame was on screen. Zero
 *    exposure needs a pre-scan, which streaming does not allow.
 *  - DRM/EME video yields black frames to canvas by design. We detect that and
 *    say so rather than silently reporting everything as safe.
 */

const TAG = "[SafeFrame]";
const SAMPLE_INTERVAL_MS = 400;
const BLUR_PX = 28;
/** Ignore decorative/preview players — YouTube pages are full of them. */
const MIN_VIDEO_PX = 160;

const log = {
  info: (...a: unknown[]) => console.info(TAG, ...a),
  warn: (...a: unknown[]) => console.warn(TAG, ...a),
  error: (...a: unknown[]) => console.error(TAG, ...a),
};

/**
 * The guard's own policy, written as a literal rather than obtained from
 * `resolveConfig()`.
 *
 * Two reasons. First, `resolveConfig` is the Zod entry point, and pulling Zod
 * into a script injected into every page on the web to read four numbers is
 * indefensible — the type import above is erased at build time, so this file
 * ships no schema code at all. Second, a live guard is legitimately not a
 * pre-scan: it sees one frame at a time with no verifier behind it, so its
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

/**
 * Random per-page secret, handed to the inference frame in its URL fragment and
 * required on every message in both directions. This replaced comparing
 * `event.source` to `iframe.contentWindow`, which is fragile across the frame's
 * about:blank → real-document navigation — and when that comparison quietly
 * failed, the symptom was indistinguishable from the model never loading.
 */
const TOKEN =
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : String(Math.random()).slice(2);

let frameWindow: Window | null = null;
let sandboxReady = false;
let sandboxFailed: string | null = null;
let nextRequestId = 1;
const pending = new Map<number, (scores: CategoryScores) => void>();

function mountInferenceFrame(): void {
  if (frameWindow) return;
  const iframe = document.createElement("iframe");
  iframe.src = `${chrome.runtime.getURL("sandbox.html")}#${TOKEN}`;
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0;left:-9999px;top:0;";
  (document.body ?? document.documentElement).appendChild(iframe);
  frameWindow = iframe.contentWindow;
  iframe.addEventListener("error", () => log.error("inference frame failed to load"));
  log.info("inference frame mounted; loading model (bundled, no download)…");
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const msg = event.data as (FromSandbox & { token?: string }) | null;
  if (!msg || typeof msg !== "object" || msg.token !== TOKEN) return;

  if (msg.kind === "safeframe:ready") {
    sandboxReady = true;
    sandboxFailed = null;
    log.info(`guard armed — backend=${msg.backend}, model ready in ${msg.loadMs}ms`);
    return;
  }
  if (msg.kind === "safeframe:result") {
    pending.get(msg.id)?.(msg.scores);
    pending.delete(msg.id);
    return;
  }
  if (msg.kind === "safeframe:error") {
    if (msg.id !== null) pending.delete(msg.id);
    else sandboxFailed = msg.message;
    log.error("inference error:", msg.message);
  }
});

function classify(pixels: ImageData): Promise<CategoryScores> {
  return new Promise((resolve, reject) => {
    if (!frameWindow || !sandboxReady) {
      reject(new Error(sandboxFailed ?? "inference frame not ready yet"));
      return;
    }
    const id = nextRequestId++;
    pending.set(id, resolve);
    const request: ClassifyRequest = {
      kind: "safeframe:classify",
      token: TOKEN,
      id,
      width: pixels.width,
      height: pixels.height,
      buffer: pixels.data.buffer as ArrayBuffer,
    };
    // Transfer, don't copy: the buffer is dead on this side afterwards, which is
    // fine because a fresh readback happens every sample.
    frameWindow.postMessage(request, "*", [request.buffer]);
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error("classification timed out"));
    }, 5000);
  });
}

/* ── Overlay (shadow DOM so no page CSS can reach it) ────────────────── */

const OVERLAY_CSS = `
:host { all: initial; }
.card, .status {
  position: fixed;
  z-index: 2147483647;
  box-sizing: border-box;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #f5f7fa;
}
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  text-align: center;
  background: rgba(18, 20, 28, 0.82);
  backdrop-filter: blur(18px);
  border-radius: 12px;
}
.title { font-size: 15px; font-weight: 600; margin: 0; }
.body { font-size: 12.5px; line-height: 1.5; margin: 0; max-width: 34ch; opacity: 0.82; }
.btn {
  min-height: 36px; padding: 0 14px; font: inherit; font-size: 12.5px; font-weight: 500;
  color: #f5f7fa; background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.22); border-radius: 9px; cursor: pointer;
}
.btn:hover { background: rgba(255,255,255,0.2); }
.mark { font-size: 10.5px; letter-spacing: 0.04em; text-transform: uppercase; opacity: 0.6; margin: 0; }
.status {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 8px; font-size: 11px; font-weight: 500;
  background: rgba(18, 20, 28, 0.7); backdrop-filter: blur(8px);
  border-radius: 7px; pointer-events: none; white-space: nowrap;
}
.dot { width: 7px; height: 7px; border-radius: 50%; background: #9aa4b2; }
.dot.on { background: #4ade80; }
.dot.bad { background: #f87171; }
`;

type GuardState = "warming" | "armed" | "failed";

/**
 * Status chip plus the response card, both tracking the video's box.
 *
 * The chip exists because of how this bug went: without it, "is the guard even
 * running?" was unanswerable from the page, and the only way to find out was to
 * read console noise from three different sources.
 */
class Overlay {
  private host: HTMLDivElement;
  private card: HTMLDivElement;
  private status: HTMLDivElement;
  private dot: HTMLSpanElement;
  private label: HTMLSpanElement;
  private raf: number | null = null;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onContinue: () => void,
  ) {
    this.host = document.createElement("div");
    const shadow = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = OVERLAY_CSS;

    this.status = document.createElement("div");
    this.status.className = "status";
    this.dot = document.createElement("span");
    this.dot.className = "dot";
    this.label = document.createElement("span");
    this.label.textContent = "SafeFrame starting…";
    this.status.append(this.dot, this.label);

    this.card = document.createElement("div");
    this.card.className = "card";
    this.card.style.display = "none";
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

    shadow.append(style, this.status, this.card);
    (document.body ?? document.documentElement).appendChild(this.host);
    this.track();
  }

  setState(state: GuardState, detail: string): void {
    this.dot.className = `dot ${state === "armed" ? "on" : state === "failed" ? "bad" : ""}`;
    this.label.textContent = detail;
  }

  showCard(): void {
    this.card.style.display = "flex";
  }

  hideCard(): void {
    this.card.style.display = "none";
  }

  destroy(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.host.remove();
  }

  /**
   * Fixed-position and follows the video's box every frame. Injecting into the
   * player's own DOM would be less code and would break the moment a site
   * re-renders its player or goes fullscreen.
   */
  private track = (): void => {
    const r = this.video.getBoundingClientRect();
    const visible = r.width > 0 && r.height > 0;
    this.status.style.display = visible ? "flex" : "none";
    if (visible) {
      this.status.style.left = `${r.left + 8}px`;
      this.status.style.top = `${r.top + 8}px`;
      this.card.style.left = `${r.left}px`;
      this.card.style.top = `${r.top}px`;
      this.card.style.width = `${r.width}px`;
      this.card.style.height = `${r.height}px`;
    }
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
  private darkFrames = 0;
  private scored = 0;
  private notReadyLogs = 0;
  private stopped = false;

  constructor(private readonly video: HTMLVideoElement) {
    this.overlay = new Overlay(video, () => this.allowThisEpisode());
    this.timer = window.setInterval(() => void this.tick(), SAMPLE_INTERVAL_MS);
  }

  destroy(): void {
    this.stopped = true;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.overlay.destroy();
    this.video.style.filter = "";
  }

  private allowThisEpisode(): void {
    // Scoped to the current detection only. When the guard releases, the
    // override dies with it, so the next flagged moment gates again.
    this.overridden = true;
    this.release();
    void this.video.play();
    log.info("parent override granted for this detection only");
  }

  private engage(score: number): void {
    if (this.active) return;
    this.active = true;
    this.video.style.filter = `blur(${BLUR_PX}px)`;
    this.video.pause();
    this.overlay.showCard();
    log.warn(`flagged at ${this.video.currentTime.toFixed(1)}s (score ${score.toFixed(2)}) — blurred and paused`);
  }

  private release(): void {
    this.active = false;
    this.video.style.filter = "";
    this.overlay.hideCard();
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.busy || !ctx) return;

    if (sandboxFailed) {
      this.overlay.setState("failed", "SafeFrame unavailable");
      return;
    }
    if (!sandboxReady) {
      this.overlay.setState("warming", "SafeFrame loading model…");
      return;
    }

    const v = this.video;
    if (v.paused || v.ended || v.readyState < 2 || v.videoWidth === 0) return;
    const rect = v.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;

    this.busy = true;
    try {
      ctx.drawImage(v, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
      let pixels: ImageData;
      try {
        pixels = ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
      } catch {
        // Cross-origin video without CORS headers taints the canvas. Permanent
        // for this element — nothing about it will change while it is playing.
        this.giveUp("this video's pixels can't be read (cross-origin without CORS)");
        return;
      }

      if (this.isDark(pixels)) {
        // Deliberately NOT permanent. An earlier version treated five dark
        // readbacks as proof of DRM and disabled itself — which a fade to black
        // in an ordinary music video triggers. Now darkness only skips the
        // frame (nothing to classify) and reports the DRM suspicion once the
        // run is long enough to be implausible for real content.
        this.darkFrames += 1;
        if (this.darkFrames === 25) {
          log.warn(
            "~10s of solid black frames while playing. If this is a protected (DRM) stream, no client-side detector can inspect it. Still watching in case it's just a dark scene.",
          );
          this.overlay.setState("failed", "SafeFrame can't read this stream");
        }
        return;
      }
      if (this.darkFrames > 0) this.darkFrames = 0;

      const scores = await classify(pixels);
      const p = combineClassScores(scores, config.sexyWeight);
      const { guardActive, windowedScore } = this.aggregator.push({
        timestamp_s: v.currentTime,
        p,
        categories: scores,
      });

      this.scored += 1;
      if (this.scored === 1) log.info("first frame classified — guard is live");
      this.overlay.setState(
        "armed",
        `SafeFrame ${Math.round(windowedScore * 100)}`,
      );

      if (guardActive && !this.overridden) this.engage(windowedScore);
      if (!guardActive) {
        // Leaving the flagged region ends the episode *and* its override.
        this.overridden = false;
        if (this.active) this.release();
      }
    } catch (err) {
      // Previously an empty catch, which made this whole path undebuggable.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("not ready")) {
        if (this.notReadyLogs++ === 0) log.info("waiting for the model…");
      } else {
        log.warn("frame skipped:", message);
      }
    } finally {
      this.busy = false;
    }
  }

  /** Mean channel value over a sparse sample — enough to tell black from not. */
  private isDark(pixels: ImageData): boolean {
    const d = pixels.data;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 256) {
      sum += (d[i] ?? 0) + (d[i + 1] ?? 0) + (d[i + 2] ?? 0);
      n += 3;
    }
    return n > 0 && sum / n < 3;
  }

  private giveUp(reason: string): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.stopped = true;
    this.release();
    this.overlay.setState("failed", "SafeFrame can't read this video");
    log.warn(`guard stopped for a video: ${reason}`);
  }
}

/* ── Discovery ───────────────────────────────────────────────────────── */

function usable(video: HTMLVideoElement): boolean {
  const r = video.getBoundingClientRect();
  return r.width >= MIN_VIDEO_PX && r.height >= MIN_VIDEO_PX;
}

function attachTo(video: HTMLVideoElement): void {
  if (guarded.has(video) || !usable(video)) return;
  guarded.add(video);
  mountInferenceFrame();
  log.info("guarding a video element");
  const guard = new VideoGuard(video);
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
// Players are often laid out after insertion, so a video too small to qualify at
// discovery time becomes eligible moments later.
window.setInterval(scan, 2000);
log.info("content script active; watching for video elements");
