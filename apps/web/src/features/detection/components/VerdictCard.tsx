"use client";

import { motion } from "framer-motion";
import { ChevronRight, ShieldAlert, ShieldCheck } from "lucide-react";
import type { DetectionResult } from "@safeframe/core";
import { Card, InfoTip, SkeletonBlock } from "@/components/ui";
import { formatTime } from "./ScoreTimeline";

const CATEGORY_ORDER = ["porn", "hentai", "sexy", "neutral", "drawing"] as const;

const CATEGORY_TIPS: Record<(typeof CATEGORY_ORDER)[number], string> = {
  porn: "Explicit sexual activity. Contributes at full weight to the flag score.",
  hentai: "Drawn or animated sexual content. Contributes at full weight to the flag score.",
  sexy: "Suggestive but non-explicit (swimwear, lingerie). Down-weighted ×0.4 — it cannot flag a video on its own at default thresholds.",
  neutral: "Everyday safe content. Not part of the flag score.",
  drawing: "Non-sexual artwork or animation. Not part of the flag score.",
};

const RING_R = 20;
const RING_C = 2 * Math.PI * RING_R;

export function VerdictCard({
  result,
  onSeek,
}: {
  result: DetectionResult;
  onSeek?: (timeS: number) => void;
}) {
  const flagged = result.contains_inappropriate_content;
  // Full-weight classes only: a high `sexy` peak on a clean verdict is the
  // ×0.4 weighting working as designed and needs no explanation.
  const peakFullWeight = Math.max(
    result.categories.porn,
    result.categories.hentai,
  );
  return (
    <Card className="overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="space-y-5 p-5"
      >
        {/* Verdict banner */}
        <div
          className={`flex items-center gap-3 rounded-xl p-3 ${
            flagged ? "bg-danger-soft" : "bg-success-soft"
          }`}
        >
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${
              flagged
                ? "bg-danger text-primary-foreground"
                : "bg-success text-primary-foreground"
            }`}
          >
            {flagged ? (
              <ShieldAlert className="size-6" />
            ) : (
              <ShieldCheck className="size-6" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={`text-sm font-semibold ${flagged ? "text-danger" : "text-success"}`}
            >
              {flagged
                ? "Inappropriate content detected"
                : "No inappropriate content found"}
            </p>
            <p className="text-xs text-muted-foreground">
              {result.frames_analyzed} frames ·{" "}
              {(result.processing.total_ms / 1000).toFixed(1)}s on-device ·{" "}
              {result.processing.tier2_escalations} tier-2 checks
            </p>
          </div>
          {/* Confidence ring */}
          <div className="relative size-14 shrink-0" aria-hidden>
            <svg viewBox="0 0 48 48" className="size-full -rotate-90">
              <circle
                cx="24"
                cy="24"
                r={RING_R}
                fill="none"
                strokeWidth="4"
                className="stroke-border"
              />
              <motion.circle
                cx="24"
                cy="24"
                r={RING_R}
                fill="none"
                strokeWidth="4"
                strokeLinecap="round"
                className={flagged ? "stroke-danger" : "stroke-success"}
                strokeDasharray={RING_C}
                initial={{ strokeDashoffset: RING_C }}
                animate={{ strokeDashoffset: RING_C * (1 - result.confidence) }}
                transition={{ delay: 0.2, duration: 0.7, ease: "easeOut" }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-foreground tabular-nums">
              {(result.confidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Why a high category peak can still be a clean verdict. Without
            this, a reviewer reads "porn 65%" next to "no content found" as a
            contradiction rather than as smoothing working correctly. */}
        {!flagged && peakFullWeight >= 0.5 && (
          <p className="rounded-xl bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            One or more frames scored high on a full-weight category, but no run
            of frames stayed above the threshold long enough to flag. A verdict
            needs sustained evidence — a single frame is treated as decode noise,
            not as content.
          </p>
        )}

        {/* Category breakdown */}
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Tier-1 screener peaks
            <InfoTip
              wide
              text="The highest score any single frame reached during the scan, as reported by the Tier-1 screener — peak exposure, not an average, and not the same number as the confidence above. Confidence comes from the smoothed, Tier-2-verified score over time, which is why a high peak here can still be a clean verdict."
            />
          </p>
          {CATEGORY_ORDER.map((key, i) => (
            <div key={key} className="flex items-center gap-3">
              <span className="flex w-16 items-center gap-1 text-xs text-muted-foreground capitalize">
                {key}
                <InfoTip text={CATEGORY_TIPS[key]} />
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${result.categories[key] * 100}%` }}
                  transition={{ delay: 0.15 + i * 0.05, duration: 0.5, ease: "easeOut" }}
                  className={`h-full rounded-full ${
                    key === "neutral" || key === "drawing"
                      ? "bg-success"
                      : "bg-danger"
                  }`}
                />
              </div>
              <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                {(result.categories[key] * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>

        {/* Flagged segments — tap to jump the player there */}
        {result.flagged_segments.length > 0 && (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Flagged segments
              <InfoTip
                wide
                text="Time ranges flagged either by the smoothed score holding above the threshold, or by a sustained run of raw over-threshold frames that smoothing would otherwise damp away. Tap one to jump the player to it."
              />
            </p>
            <div className="space-y-1.5">
              {result.flagged_segments.map((seg, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSeek?.(seg.start_s)}
                  disabled={!onSeek}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg bg-danger-soft px-3 text-left transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none"
                >
                  <span className="text-xs font-semibold text-danger tabular-nums">
                    {formatTime(seg.start_s)}–{formatTime(seg.end_s)}
                  </span>
                  <span className="text-xs text-danger/80 capitalize">
                    {seg.dominant_category}
                  </span>
                  <span className="ml-auto text-xs text-danger/80 tabular-nums">
                    peak {(seg.peak_score * 100).toFixed(0)}%
                  </span>
                  {onSeek && <ChevronRight className="size-3.5 text-danger/60" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </Card>
  );
}

export function VerdictSkeleton() {
  return (
    <Card className="space-y-5 p-5">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="size-12 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <SkeletonBlock className="h-4 w-2/3" />
          <SkeletonBlock className="h-3 w-1/2" />
        </div>
        <SkeletonBlock className="size-14 rounded-full" />
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-2.5 w-full" />
        ))}
      </div>
    </Card>
  );
}
