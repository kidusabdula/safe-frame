// THE source of truth (P1): all shapes derive from these schemas via z.infer.
import { z } from "zod";

export const CategoryScoresSchema = z.object({
  porn: z.number().min(0).max(1),
  hentai: z.number().min(0).max(1),
  sexy: z.number().min(0).max(1),
  neutral: z.number().min(0).max(1),
  drawing: z.number().min(0).max(1),
});
export type CategoryScores = z.infer<typeof CategoryScoresSchema>;

export const FlaggedSegmentSchema = z.object({
  start_s: z.number().nonnegative(),
  end_s: z.number().nonnegative(),
  peak_score: z.number().min(0).max(1),
  dominant_category: z.enum(["porn", "hentai", "sexy"]),
});
export type FlaggedSegment = z.infer<typeof FlaggedSegmentSchema>;

export const DetectionResultSchema = z.object({
  contains_inappropriate_content: z.boolean(),
  confidence: z.number().min(0).max(1),
  categories: CategoryScoresSchema,
  flagged_segments: z.array(FlaggedSegmentSchema),
  frames_analyzed: z.number().int().nonnegative(),
  video_duration_s: z.number().nonnegative(),
  processing: z.object({
    total_ms: z.number().nonnegative(),
    avg_frame_latency_ms: z.number().nonnegative(),
    p95_frame_latency_ms: z.number().nonnegative(),
    sampling_fps: z.number().positive(),
    tier2_escalations: z.number().int().nonnegative(),
  }),
  engine: z.object({
    tier1_model: z.string(),
    tier2_model: z.string().nullable(),
    backend: z.enum(["webgl", "wasm", "webgpu", "onnx-native"]),
    device_tier: z.enum(["low", "mid", "high"]),
  }),
});
export type DetectionResult = z.infer<typeof DetectionResultSchema>;

export const DetectionConfigSchema = z.object({
  flagThreshold: z.number().min(0).max(1).default(0.6), // segment open
  releaseThreshold: z.number().min(0).max(1).default(0.4), // segment close (hysteresis)
  borderlineLow: z.number().default(0.35),
  borderlineHigh: z.number().default(0.75),
  sexyWeight: z.number().default(0.4),
  /**
   * How much Tier 2's opinion counts when it arbitrates a borderline frame.
   * Tier 2 dominates the blend (it is the accurate model) but never replaces
   * Tier 1 outright — see fuseTierScores for why that distinction matters.
   */
  tier2Weight: z.number().min(0).max(1).default(0.65),
  /** Sustained-evidence path: min seconds of consecutive over-threshold frames. */
  minEvidenceS: z.number().default(1.5),
  /** Sustained-evidence path: min consecutive over-threshold frames. */
  minEvidenceFrames: z.number().int().default(3),
  samplingFps: z.number().default(1),
  densifyFps: z.number().default(2),
  densifyWindowS: z.number().default(2),
  tier2Budget: z.number().int().default(40),
  windowSize: z.number().int().default(5),
  minFramesForVerdict: z.number().int().default(5),
  responseMode: z.enum(["composite", "blur", "pause", "hide", "skip"]).default("composite"),
  runMode: z.enum(["prescan", "live"]).default("prescan"),
  /**
   * Strict mode: mount no <video> at all until a verdict exists, so not even a
   * blurred first frame of unvetted content is decoded to screen. Off by
   * default — the default flow mounts the player hard-blurred behind a consent
   * gate, which is friendlier and still never shows a legible unchecked frame.
   */
  strictPreview: z.boolean().default(false),
});
export type DetectionConfig = z.infer<typeof DetectionConfigSchema>;

/** Resolve a full config from a partial override set (defaults applied by Zod). */
export function resolveConfig(partial?: Partial<DetectionConfig>): DetectionConfig {
  return DetectionConfigSchema.parse(partial ?? {});
}
