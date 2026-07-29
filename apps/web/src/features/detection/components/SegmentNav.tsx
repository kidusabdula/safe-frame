"use client";

import { ShieldCheck, SkipBack, SkipForward } from "lucide-react";
import type { FlaggedSegment } from "@safeframe/core";
import { formatTime } from "./ScoreTimeline";

interface SegmentNavProps {
  segments: readonly FlaggedSegment[];
  currentTimeS: number;
  durationS: number;
  onSeek: (timeS: number) => void;
}

/**
 * Interactive flagged-region navigator under the timeline: jump between
 * flags, or tap a chip to seek straight to that segment. Renders a calm
 * all-clear row when the scan found nothing.
 */
export function SegmentNav({
  segments,
  currentTimeS,
  durationS,
  onSeek,
}: SegmentNavProps) {
  if (segments.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-xs font-medium text-success">
        <ShieldCheck className="size-3.5" /> No flagged regions in this video
      </div>
    );
  }

  const prev = [...segments].reverse().find((s) => s.start_s < currentTimeS - 0.5);
  const next = segments.find((s) => s.start_s > currentTimeS + 0.5);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Jump to previous flagged region"
          disabled={!prev}
          onClick={() => prev && onSeek(prev.start_s)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40"
        >
          <SkipBack className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Jump to next flagged region"
          disabled={!next}
          onClick={() => next && onSeek(next.start_s)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40"
        >
          <SkipForward className="size-4" />
        </button>
        <span className="ml-1 text-xs text-muted-foreground tabular-nums">
          {formatTime(currentTimeS)} / {formatTime(durationS)}
        </span>
      </div>

      <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5">
        {segments.map((seg, i) => {
          const active = currentTimeS >= seg.start_s && currentTimeS < seg.end_s;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSeek(seg.start_s)}
              title={`Seek to ${formatTime(seg.start_s)} — ${seg.dominant_category}, peak ${(seg.peak_score * 100).toFixed(0)}%`}
              className={`min-h-11 rounded-lg px-2.5 text-xs font-medium tabular-nums transition-all focus-visible:outline-2 focus-visible:outline-ring ${
                active
                  ? "bg-danger text-primary-foreground shadow-sm"
                  : "bg-danger-soft text-danger hover:opacity-80"
              }`}
            >
              {i + 1} · {formatTime(seg.start_s)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
