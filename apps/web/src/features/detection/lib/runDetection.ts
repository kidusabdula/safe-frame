import {
  combineClassScores,
  createAggregator,
  frameVerdictZone,
  DetectionResultSchema,
  type DetectionConfig,
  type DetectionResult,
  type DeviceTier,
  type FrameSample,
  type VerdictZone,
} from "@safeframe/core";
import { createFrameGrabber, isTaintedCanvasError } from "./preprocess";
import { baselineTimestamps, densifyTimestamps, SeekQueue } from "./seekQueue";
import type { Tier1 } from "./tier1";
import type { Tier2Client } from "./tier2.client";

export interface TimelinePoint {
  timestamp_s: number;
  p: number;
  windowedScore: number;
  zone: VerdictZone;
  tier2Used: boolean;
  latency_ms: number;
}

export interface DetectionProgress {
  phase: "sampling" | "classifying";
  currentTimeS: number;
  durationS: number;
  framesDone: number;
  framesPlanned: number;
  throughputFps: number;
  tier2Escalations: number;
}

export interface DetectionCallbacks {
  onProgress?: (progress: DetectionProgress) => void;
  onFrame?: (point: TimelinePoint) => void;
}

export interface DetectionDeps {
  tier1: Tier1;
  /** null on low-tier devices — the model is never even downloaded. */
  tier2: Tier2Client | null;
  deviceTier: DeviceTier;
}

export class CorsRestrictedError extends Error {
  constructor() {
    super(
      "This host doesn't permit local analysis — its CORS policy blocks reading video pixels in the browser.",
    );
    this.name = "CorsRestrictedError";
  }
}

/**
 * The product's API: run the full pre-scan pipeline over a video element.
 *
 * Seek loop → 224×224 preprocess → Tier-1 classify → cascade routing
 * (borderline frames escalate to Tier 2 within the per-video budget) →
 * densify around hits → aggregate → validated DetectionResult.
 *
 * Everything happens on this device. The function never touches the network.
 */
export async function runDetection(
  video: HTMLVideoElement,
  config: DetectionConfig,
  deps: DetectionDeps,
  callbacks: DetectionCallbacks = {},
  signal?: AbortSignal,
): Promise<DetectionResult> {
  const t0 = performance.now();
  const durationS = video.duration;
  if (!Number.isFinite(durationS) || durationS <= 0) {
    throw new Error("Video has no readable duration");
  }

  const grabber = createFrameGrabber();
  const aggregator = createAggregator(config);
  const queue = new SeekQueue(1 / (config.densifyFps * 2));
  queue.enqueue(baselineTimestamps(durationS, config.samplingFps));

  let framesDone = 0;
  let tier2Escalations = 0;
  let tier2Failed = false;

  const throwIfAborted = () => {
    if (signal?.aborted) {
      throw new DOMException("Detection cancelled", "AbortError");
    }
  };

  for (let t = queue.next(); t !== undefined; t = queue.next()) {
    throwIfAborted();
    callbacks.onProgress?.({
      phase: "sampling",
      currentTimeS: t,
      durationS,
      framesDone,
      framesPlanned: queue.planned,
      throughputFps: framesDone / ((performance.now() - t0) / 1000),
      tier2Escalations,
    });

    await seekTo(video, t, signal);

    let image: ImageData;
    try {
      image = grabber.grab(video);
    } catch (err) {
      if (isTaintedCanvasError(err)) throw new CorsRestrictedError();
      throw err;
    }

    callbacks.onProgress?.({
      phase: "classifying",
      currentTimeS: t,
      durationS,
      framesDone,
      framesPlanned: queue.planned,
      throughputFps: framesDone / ((performance.now() - t0) / 1000),
      tier2Escalations,
    });

    const frameStart = performance.now();
    const categories = await deps.tier1.classify(image);
    let p = combineClassScores(categories, config.sexyWeight);
    const zone = frameVerdictZone(p, config);
    let tier2Used = false;

    // The cascade: borderline frames get the accurate (expensive) opinion —
    // if the device tier allows it and the per-video budget isn't spent.
    if (
      zone === "borderline" &&
      deps.tier2 !== null &&
      !tier2Failed &&
      tier2Escalations < config.tier2Budget
    ) {
      throwIfAborted();
      try {
        p = await deps.tier2.classify(image);
        tier2Used = true;
        tier2Escalations++;
      } catch {
        // Tier 2 broke mid-run (OOM, worker death): degrade to Tier-1
        // verdicts for the rest of the video rather than failing the scan.
        tier2Failed = true;
      }
    }

    const latency = performance.now() - frameStart;
    const sample: FrameSample = {
      timestamp_s: t,
      p,
      categories,
      latency_ms: latency,
      tier2Used,
    };
    const feedback = aggregator.push(sample);
    framesDone++;

    callbacks.onFrame?.({
      timestamp_s: t,
      p,
      windowedScore: feedback.windowedScore,
      zone,
      tier2Used,
      latency_ms: latency,
    });

    // Densify around anything that isn't clearly safe so short flashes
    // near a hit aren't missed by the 1 fps baseline.
    if (p >= config.releaseThreshold) {
      queue.enqueue(
        densifyTimestamps(t, config.densifyWindowS, config.densifyFps, durationS),
      );
    }

    // Yield to the event loop so the UI (progress, cancel) stays live.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const summary = aggregator.finalize();
  const totalMs = performance.now() - t0;

  const backend =
    tier2Escalations > 0 && deps.tier2 ? deps.tier2.backend : deps.tier1.backend;

  const result: DetectionResult = {
    contains_inappropriate_content: summary.contains_inappropriate_content,
    confidence: summary.confidence,
    categories: summary.categories,
    flagged_segments: summary.flagged_segments,
    frames_analyzed: summary.frames_analyzed,
    video_duration_s: durationS,
    processing: {
      total_ms: totalMs,
      avg_frame_latency_ms: summary.avg_frame_latency_ms,
      p95_frame_latency_ms: summary.p95_frame_latency_ms,
      sampling_fps: config.samplingFps,
      tier2_escalations: summary.tier2_escalations,
    },
    engine: {
      tier1_model: deps.tier1.modelId,
      tier2_model: deps.tier2 ? deps.tier2.modelId : null,
      backend,
      device_tier: deps.deviceTier,
    },
  };

  // Guardrail against pipeline drift: hard parse in dev, safeParse in prod
  // (the caller surfaces a toast on failure rather than crashing the run).
  if (process.env.NODE_ENV !== "production") {
    return DetectionResultSchema.parse(result);
  }
  const checked = DetectionResultSchema.safeParse(result);
  if (!checked.success) {
    console.error("DetectionResult failed schema validation", checked.error);
    return result;
  }
  return checked.data;
}

/** Seek and wait for the frame to actually be presentable. */
function seekTo(
  video: HTMLVideoElement,
  t: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Detection cancelled", "AbortError"));
      return;
    }
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Video decode error while seeking"));
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Detection cancelled", "AbortError"));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
    video.currentTime = Math.min(t, Math.max(0, video.duration - 0.05));
  });
}
