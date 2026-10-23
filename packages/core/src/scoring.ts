import type { CategoryScores, DetectionConfig } from "./schema";

/**
 * Combine per-class scores into the single inappropriate score `p`.
 * Porn + Hentai contribute at full weight; Sexy is down-weighted so
 * swimwear-type content contributes but cannot flag a video alone at
 * default thresholds.
 */
export function combineClassScores(
  scores: CategoryScores,
  sexyWeight: number = 0.4,
): number {
  const p = scores.porn + scores.hentai + scores.sexy * sexyWeight;
  return clamp01(p);
}

/**
 * Combine the two tiers' opinions for one escalated frame.
 *
 * Tier 2 exists to *verify* borderline frames, not to overrule them. An earlier
 * build simply assigned `p = tier2Score`, which handed the ViT a unilateral
 * veto: frames whose Tier-1 score sat inside the escalation band were replaced
 * by a lower Tier-2 value and dropped under the flag line, so videos containing
 * real explicit footage came back clean. (Frames scoring above `borderlineHigh`
 * never escalate, which is why the same content flagged correctly whenever
 * Tier 1 happened to be confident — the false negatives tracked escalation
 * count exactly.) Two clauses fix it:
 *
 * 1. Blend rather than replace, so neither tier can erase the other.
 * 2. Floor the result at Tier-1's `porn` score. That is the one unambiguous,
 *    photographic, full-weight class: Tier 2 may overrule "this looks
 *    suggestive", but it may not overrule "this is explicit".
 *
 * `sexy` is excluded from the floor so swimwear still cannot flag on its own,
 * and `hentai` is excluded because NSFWJS assigns cartoons high hentai/drawing
 * scores — flooring on it would resurrect the Big Buck Bunny false positive.
 * `hentai` keeps full weight inside combineClassScores, so confident animated
 * content still flags through the no-escalation path.
 */
export function fuseTierScores(
  tier1Score: number,
  tier2Score: number,
  scores: CategoryScores,
  config: Pick<DetectionConfig, "tier2Weight">,
): number {
  const w = config.tier2Weight;
  const blend = w * tier2Score + (1 - w) * tier1Score;
  return clamp01(Math.max(blend, scores.porn));
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
