import type { CategoryScores, DetectionConfig } from "./schema";

/**
 * Combine per-class scores into the single inappropriate score `p`.
 * Porn + Hentai contribute at full weight; Sexy is down-weighted so
 * swimwear-type content contributes but cannot flag a video alone at
 * default thresholds (architecture-doc §4).
 */
export function combineClassScores(
  scores: CategoryScores,
  sexyWeight: number = 0.4,
): number {
  const p = scores.porn + scores.hentai + scores.sexy * sexyWeight;
  return clamp01(p);
}

export type VerdictZone = "safe" | "borderline" | "flagged";

/**
 * Route a frame score into the cascade's action zones:
 * safe (< borderlineLow) · borderline (escalate to Tier 2) · flagged (>= borderlineHigh).
 */
export function frameVerdictZone(p: number, config: DetectionConfig): VerdictZone {
  if (p < config.borderlineLow) return "safe";
  if (p < config.borderlineHigh) return "borderline";
  return "flagged";
}

/**
 * Dominant sexual-content class for a segment's dominant_category.
 * Compares each class by its *contribution to p* (sexy is down-weighted
 * exactly as in combineClassScores) — otherwise a frame with porn 0.97 and
 * sexy 0.99 would report "sexy" as dominant, understating severity.
 */
export function dominantSexualCategory(
  scores: CategoryScores,
  sexyWeight: number = 0.4,
): "porn" | "hentai" | "sexy" {
  const sexy = scores.sexy * sexyWeight;
  if (scores.porn >= scores.hentai && scores.porn >= sexy) return "porn";
  if (scores.hentai >= sexy) return "hentai";
  return "sexy";
}

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
