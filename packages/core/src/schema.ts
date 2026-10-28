// THE source of truth (P1): all shapes derive from these schemas via z.infer.
// zod/mini is the tree-shakeable build of the same validator. The classic
// build ships every locale and every chained method (~260 KB) to the browser.
import * as z from "zod/mini";

/** A probability or score in [0, 1]. */
const unit = () => z.number().check(z.gte(0), z.lte(1));
const nonNegative = () => z.number().check(z.nonnegative());
const count = () => z.int().check(z.nonnegative());

export const CategoryScoresSchema = z.object({
  porn: unit(),
  hentai: unit(),
  sexy: unit(),
  neutral: unit(),
  drawing: unit(),
});
export type CategoryScores = z.infer<typeof CategoryScoresSchema>;

export const FlaggedSegmentSchema = z.object({
  start_s: nonNegative(),
  end_s: nonNegative(),
  peak_score: unit(),
  dominant_category: z.enum(["porn", "hentai", "sexy"]),
});
export type FlaggedSegment = z.infer<typeof FlaggedSegmentSchema>;

export const DetectionResultSchema = z.object({
  contains_inappropriate_content: z.boolean(),
  confidence: unit(),
  categories: CategoryScoresSchema,
  flagged_segments: z.array(FlaggedSegmentSchema),
  frames_analyzed: count(),
  video_duration_s: nonNegative(),
  processing: z.object({
    total_ms: nonNegative(),
    avg_frame_latency_ms: nonNegative(),
    p95_frame_latency_ms: nonNegative(),
    sampling_fps: z.number().check(z.positive()),
    tier2_escalations: count(),
  }),
  engine: z.object({
    tier1_model: z.string(),
    tier2_model: z.nullable(z.string()),
    backend: z.enum(["webgl", "wasm", "webgpu", "onnx-native"]),
    device_tier: z.enum(["low", "mid", "high"]),
  }),
});
export type DetectionResult = z.infer<typeof DetectionResultSchema>;

export const DetectionConfigSchema = z.object({
  flagThreshold: z._default(unit(), 0.6), // segment open
  releaseThreshold: z._default(unit(), 0.4), // segment close (hysteresis)
  borderlineLow: z._default(z.number(), 0.35),
  borderlineHigh: z._default(z.number(), 0.75),
  sexyWeight: z._default(z.number(), 0.4),
  /**
   * How much Tier 2's opinion counts when it arbitrates a borderline frame.
   * Tier 2 dominates the blend (it is the accurate model) but never replaces
   * Tier 1 outright — see fuseTierScores for why that distinction matters.
   */
  tier2Weight: z._default(unit(), 0.65),
  /** Sustained-evidence path: min seconds of consecutive over-threshold frames. */
  minEvidenceS: z._default(z.number(), 1.5),
  /** Sustained-evidence path: min consecutive over-threshold frames. */
  minEvidenceFrames: z._default(z.int(), 3),
  samplingFps: z._default(z.number(), 1),
  densifyFps: z._default(z.number(), 2),
  densifyWindowS: z._default(z.number(), 2),
  tier2Budget: z._default(z.int(), 40),
  windowSize: z._default(z.int(), 5),
  minFramesForVerdict: z._default(z.int(), 5),
  responseMode: z._default(z.enum(["composite", "blur", "pause", "hide", "skip"]), "composite"),
  runMode: z._default(z.enum(["prescan", "live"]), "prescan"),
  /**
   * Strict mode: mount no <video> at all until a verdict exists, so not even a
   * blurred first frame of unvetted content is decoded to screen. Off by
   * default — the default flow mounts the player hard-blurred behind a consent
   * gate, which is friendlier and still never shows a legible unchecked frame.
   */
  strictPreview: z._default(z.boolean(), false),
});
export type DetectionConfig = z.infer<typeof DetectionConfigSchema>;

/** Resolve a full config from a partial override set (defaults applied by Zod). */
export function resolveConfig(partial?: Partial<DetectionConfig>): DetectionConfig {
  return DetectionConfigSchema.parse(partial ?? {});
}
