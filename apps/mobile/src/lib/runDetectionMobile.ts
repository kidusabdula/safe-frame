import {
  createAggregator,
  resolveConfig,
  resolveTier,
  samplingFpsForTier,
  DetectionResultSchema,
  type DetectionConfig,
  type DetectionResult,
} from "@safeframe/core";
import { extractFrame, probeDurationS } from "./sampler";
import { frameToTensor } from "./preprocess";
import { loadNsfwSession } from "./onnx";

export interface MobileProgress {
  phase: "loading-model" | "sampling" | "classifying";
  framesDone: number;
  framesPlanned: number;
  currentTimeS: number;
  durationS: number;
}

export interface MobileTimelinePoint {
  timestampS: number;
  p: number;
}

/**
 * The mobile pre-scan: platform thumbnailer → native resize → JPEG decode →
 * ONNX ViT inference → the SAME @safeframe/core aggregator and schema the
 * web app uses. Web and mobile physically cannot return different payload
 * shapes.
 *
 * Single-model pipeline (the ViT is the only classifier here); the binary
 * model's NSFW probability is reported under the `porn` category as the
 * aggregate NSFW class, and `p` feeds the shared EWMA/hysteresis logic
 * directly.
 */
export async function runDetectionMobile(
  videoUri: string,
  configOverrides: Partial<DetectionConfig>,
  onProgress: (progress: MobileProgress) => void,
  onPoint: (point: MobileTimelinePoint) => void,
  isCancelled: () => boolean,
): Promise<DetectionResult> {
  const t0 = Date.now();
  const config = resolveConfig(configOverrides);

  onProgress({
    phase: "loading-model",
    framesDone: 0,
    framesPlanned: 0,
    currentTimeS: 0,
    durationS: 0,
  });
  const session = await loadNsfwSession();
  const durationS = await probeDurationS(videoUri);

  // Device tier from a live micro-benchmark of the actual model (no
  // navigator hints exist in RN). Low tier halves the sampling rate.
  const benchStart = Date.now();
  await session.classify(new Float32Array(3 * 224 * 224));
  const benchMs = Date.now() - benchStart;
  const tier = resolveTier({ hasWebGpu: false, benchMs });
  const fps = samplingFpsForTier(tier, config.samplingFps);

  const step = 1 / fps;
  const timestamps: number[] = [];
  for (let t = step / 2; t < durationS; t += step) timestamps.push(t);
  if (timestamps.length === 0 && durationS > 0) timestamps.push(durationS / 2);

  const aggregator = createAggregator(config);
  let framesDone = 0;

  for (const t of timestamps) {
    if (isCancelled()) {
      throw new Error("cancelled");
    }
    onProgress({
      phase: "sampling",
      framesDone,
      framesPlanned: timestamps.length,
      currentTimeS: t,
      durationS,
    });
    const frameStart = Date.now();
    const frame = await extractFrame(videoUri, t);
    onProgress({
      phase: "classifying",
      framesDone,
      framesPlanned: timestamps.length,
      currentTimeS: t,
      durationS,
    });
    const tensor = await frameToTensor(frame.uri);
    const nsfw = await session.classify(tensor);

    aggregator.push({
      timestamp_s: t,
      p: nsfw,
      categories: {
        porn: nsfw,
        hentai: 0,
        sexy: 0,
        neutral: 1 - nsfw,
        drawing: 0,
      },
      latency_ms: Date.now() - frameStart,
    });
    framesDone++;
    onPoint({ timestampS: t, p: nsfw });
  }

  const summary = aggregator.finalize();
  const result: DetectionResult = {
    contains_inappropriate_content: summary.contains_inappropriate_content,
    confidence: summary.confidence,
    categories: summary.categories,
    flagged_segments: summary.flagged_segments,
    frames_analyzed: summary.frames_analyzed,
    video_duration_s: durationS,
    processing: {
      total_ms: Date.now() - t0,
      avg_frame_latency_ms: summary.avg_frame_latency_ms,
      p95_frame_latency_ms: summary.p95_frame_latency_ms,
      sampling_fps: fps,
      tier2_escalations: 0,
    },
    engine: {
      tier1_model: session.modelId,
      tier2_model: null,
      backend: "onnx-native",
      device_tier: tier,
    },
  };

  return DetectionResultSchema.parse(result);
}
