"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { DetectionConfig, FlaggedSegment } from "@safeframe/core";
import type { TimelinePoint } from "../lib/runDetection";

interface ScoreTimelineProps {
  timeline: readonly TimelinePoint[];
  segments: readonly FlaggedSegment[] | null;
  durationS: number;
  config: DetectionConfig;
  currentTimeS?: number;
  onSeek?: (timeS: number) => void;
}

const W = 100;
const H = 40;
const PAD = 1;
const TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

interface HoverState {
  frac: number; // 0..1 across the plot
  timeS: number;
  point: TimelinePoint | null;
  segment: FlaggedSegment | null;
}

/**
 * Hand-rolled SVG score timeline (no chart library — keeps the bundle
 * honest). Raw per-frame scores render as dots (Tier-2-escalated frames
 * accented), the EWMA-windowed score as a line+gradient area, flagged
 * segments as bands, thresholds as dashed rules. Draws live during the
 * scan, and doubles as a seeker: click or drag anywhere to scrub, with a
 * hover tooltip reading out the nearest frame.
 */
export function ScoreTimeline({
  timeline,
  segments,
  durationS,
  config,
  currentTimeS,
  onSeek,
}: ScoreTimelineProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [hover, setHover] = useState<HoverState | null>(null);

  const x = (t: number) => (durationS > 0 ? (t / durationS) * W : 0);
  const y = (p: number) => H - PAD - p * (H - 2 * PAD);

  const sorted = useMemo(
    () => [...timeline].sort((a, b) => a.timestamp_s - b.timestamp_s),
    [timeline],
  );

  const linePath = useMemo(() => {
    if (sorted.length === 0) return "";
    return sorted
      .map(
        (pt, i) =>
          `${i === 0 ? "M" : "L"}${x(pt.timestamp_s).toFixed(2)},${y(pt.windowedScore).toFixed(2)}`,
      )
      .join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, durationS]);

  const areaPath = useMemo(() => {
    if (sorted.length === 0) return "";
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (!first || !last) return "";
    return `${linePath} L${x(last.timestamp_s).toFixed(2)},${H - PAD} L${x(first.timestamp_s).toFixed(2)},${H - PAD} Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linePath, sorted, durationS]);

  const nearestPoint = useCallback(
    (timeS: number): TimelinePoint | null => {
      if (sorted.length === 0) return null;
      let best = sorted[0] ?? null;
      let bestD = Number.POSITIVE_INFINITY;
      for (const pt of sorted) {
        const d = Math.abs(pt.timestamp_s - timeS);
        if (d < bestD) {
          bestD = d;
          best = pt;
        }
      }
      return best;
    },
    [sorted],
  );

  const fracFromEvent = useCallback((clientX: number): number => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const updateHover = useCallback(
    (clientX: number) => {
      if (durationS <= 0) return;
      const frac = fracFromEvent(clientX);
      const timeS = frac * durationS;
      setHover({
        frac,
        timeS,
        point: nearestPoint(timeS),
        segment:
          segments?.find((s) => timeS >= s.start_s && timeS < s.end_s) ?? null,
      });
    },
    [durationS, fracFromEvent, nearestPoint, segments],
  );

  const seekFromEvent = useCallback(
    (clientX: number) => {
      if (!onSeek || durationS <= 0) return;
      onSeek(fracFromEvent(clientX) * durationS);
    },
    [onSeek, durationS, fracFromEvent],
  );

  const playheadPct =
    currentTimeS !== undefined && durationS > 0
      ? Math.max(0, Math.min(100, (currentTimeS / durationS) * 100))
      : null;

  return (
    <div className="space-y-1.5">
      <div
        ref={wrapRef}
        className="relative touch-none select-none"
        onPointerDown={(e) => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromEvent(e.clientX);
          updateHover(e.clientX);
        }}
        onPointerMove={(e) => {
          updateHover(e.clientX);
          if (draggingRef.current) seekFromEvent(e.clientX);
        }}
        onPointerUp={(e) => {
          draggingRef.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerLeave={() => {
          if (!draggingRef.current) setHover(null);
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Per-frame inappropriate-content score over time — click or drag to seek"
          className="h-32 w-full cursor-crosshair rounded-lg border border-border bg-surface sm:h-36"
        >
          <defs>
            <linearGradient id="sf-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--chart-line)", stopOpacity: 0.28 }} />
              <stop offset="100%" style={{ stopColor: "var(--chart-line)", stopOpacity: 0.02 }} />
            </linearGradient>
          </defs>

          {/* Quarter-time gridlines */}
          {TICKS.slice(1, -1).map((f) => (
            <line
              key={f}
              x1={f * W}
              x2={f * W}
              y1={0}
              y2={H}
              className="stroke-border"
              strokeWidth={0.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* Flagged segment bands */}
          {segments?.map((seg, i) => {
            const active = hover?.segment === seg;
            return (
              <rect
                key={i}
                x={x(seg.start_s)}
                y={0}
                width={Math.max(0.4, x(seg.end_s) - x(seg.start_s))}
                height={H}
                className={active ? "fill-chart-band opacity-100" : "fill-chart-band"}
                opacity={hover?.segment && !active ? 0.5 : 1}
              />
            );
          })}

          {/* Threshold rules: segment-open (danger) and release (muted) */}
          <line
            x1={0}
            x2={W}
            y1={y(config.flagThreshold)}
            y2={y(config.flagThreshold)}
            className="stroke-danger"
            strokeWidth={0.3}
            strokeDasharray="1.5 1.2"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={0}
            x2={W}
            y1={y(config.releaseThreshold)}
            y2={y(config.releaseThreshold)}
            className="stroke-border-strong"
            strokeWidth={0.25}
            strokeDasharray="1 1.4"
            vectorEffect="non-scaling-stroke"
          />

          {/* Windowed score gradient area + line */}
          {areaPath && <path d={areaPath} fill="url(#sf-area)" />}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              className="stroke-chart-line"
              strokeWidth={1.4}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Raw per-frame scores; Tier-2-escalated frames accented */}
          {sorted.map((pt, i) => (
            <circle
              key={i}
              cx={x(pt.timestamp_s)}
              cy={y(pt.p)}
              r={pt.tier2Used ? 0.9 : 0.55}
              className={pt.tier2Used ? "fill-accent" : "fill-muted-foreground/60"}
            />
          ))}
        </svg>

        {/* Hover crosshair (HTML overlay — stays 1px crisp under the stretched SVG) */}
        {hover && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-px bg-foreground/30"
            style={{ left: `${hover.frac * 100}%` }}
          />
        )}

        {/* Playhead + scrub handle */}
        {playheadPct !== null && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0"
            style={{ left: `${playheadPct}%` }}
          >
            <div className="absolute inset-y-0 w-px -translate-x-1/2 bg-foreground/60" />
            <div className="absolute top-0 size-2.5 -translate-x-1/2 -translate-y-1/3 rounded-full border-2 border-surface-elevated bg-primary shadow-sm" />
          </div>
        )}

        {/* Hover tooltip */}
        {hover && (
          <div
            className="pointer-events-none absolute -top-2 z-30 -translate-x-1/2 -translate-y-full"
            style={{
              left: `clamp(3.5rem, ${hover.frac * 100}%, calc(100% - 3.5rem))`,
            }}
          >
            <div className="glass min-w-28 rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed whitespace-nowrap shadow-lg">
              <p className="font-semibold text-foreground tabular-nums">
                {formatTime(hover.timeS)}
                {hover.segment && (
                  <span className="ml-1.5 font-medium text-danger">
                    flagged · {hover.segment.dominant_category}
                  </span>
                )}
              </p>
              {hover.point ? (
                <p className="text-muted-foreground tabular-nums">
                  windowed {(hover.point.windowedScore * 100).toFixed(0)}% · frame{" "}
                  {(hover.point.p * 100).toFixed(0)}%
                  {hover.point.tier2Used && (
                    <span className="text-accent"> · tier-2</span>
                  )}
                </p>
              ) : (
                <p className="text-muted-foreground">no frames yet</p>
              )}
              {onSeek && <p className="text-muted-foreground">click to seek</p>}
            </div>
          </div>
        )}
      </div>

      {/* Time axis + legend */}
      <div className="relative h-4 text-[10px] text-muted-foreground tabular-nums">
        {TICKS.map((f) => (
          <span
            key={f}
            className="absolute"
            style={{
              left: `${f * 100}%`,
              transform:
                f === 0 ? "none" : f === 1 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            {formatTime(f * durationS)}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-0.5 w-4 rounded-full bg-chart-line" /> windowed score
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2 rounded-full bg-muted-foreground/60" /> raw frame
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2 rounded-full bg-accent" /> tier-2 verified
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2 w-3 rounded-sm bg-chart-band" /> flagged region
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-0 w-4 border-t border-dashed border-danger" /> flag threshold
        </span>
      </div>
    </div>
  );
}

export function formatTime(s: number): string {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
