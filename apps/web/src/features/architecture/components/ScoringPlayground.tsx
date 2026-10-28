"use client";

import { useId, useMemo, useState } from "react";
import {
  createAggregator,
  resolveConfig,
  type CategoryScores,
  type FrameSample,
} from "@safeframe/core";
import { Badge, InfoTip } from "@/components/ui";

/**
 * Interactive demonstration of the decision layer.
 *
 * This widget imports the *shipped* aggregator from @safeframe/core — the same
 * code path a real scan runs through. Nothing here is a mock or a
 * re-implementation, so what the sliders show is genuinely how the product
 * behaves. That is the point: the scoring rules are pure functions of a number
 * series, which is exactly why they can be unit-tested and replayed offline.
 */

interface Scenario {
  id: string;
  label: string;
  hint: string;
  /** Frame scores at 1 fps. */
  series: number[];
}

const SAFE = 0.04;

function run(length: number, value: number): number[] {
  return Array.from({ length }, () => value);
}

const SCENARIOS: Scenario[] = [
  {
    id: "sustained",
    label: "Sustained explicit",
    hint: "Ten seconds of explicit content in the middle of a safe video. Both the smoother and the raw-evidence pass agree — this is the easy case.",
    series: [...run(8, SAFE), ...run(10, 0.9), ...run(10, SAFE)],
  },
  {
    id: "short",
    label: "Short insert",
    hint: "A three-second insert. The EWMA peaks around 0.57 — under the 0.60 threshold — so hysteresis alone would report this video clean. This is the false negative found in live testing; the sustained-evidence pass is what catches it.",
    series: [...run(12, SAFE), ...run(3, 0.8), ...run(14, SAFE)],
  },
  {
    id: "spike",
    label: "Single-frame spike",
    hint: "One frame scores 0.95, the rest are safe — a decode artefact or a hard cut. Smoothing damps it and the evidence run is too short to qualify, so nothing flags. Correctly ignored.",
    series: [...run(12, SAFE), 0.95, ...run(14, SAFE)],
  },
  {
    id: "swimwear",
    label: "Swimwear only",
    hint: "Sustained suggestive-but-not-explicit content. `sexy` is down-weighted ×0.4, so the combined score sits at 0.45 and never reaches the flag line no matter how long it lasts. The hard negative that must not flag.",
    series: [...run(6, SAFE), ...run(12, 0.45), ...run(8, SAFE)],
  },
  {
    id: "flicker",
    label: "Boundary flicker",
    hint: "A score oscillating around the threshold. Without hysteresis this would open and close a dozen segments; the 0.60/0.40 gap holds one open instead.",
    series: [
      ...run(4, SAFE),
      0.72, 0.55, 0.68, 0.5, 0.75, 0.52, 0.7, 0.58, 0.71,
      ...run(8, SAFE),
    ],
  },
];

function categoriesFor(p: number): CategoryScores {
  // Attribute the score to `porn` so the dominant-category logic has something
  // real to rank; neutral takes the remainder.
  return { porn: p, hentai: 0, sexy: 0, neutral: 1 - p, drawing: 0 };
}

const W = 620;
const H = 150;
const PAD = { top: 10, right: 10, bottom: 18, left: 26 };

export function ScoringPlayground() {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[1]!.id);
  const [flagThreshold, setFlagThreshold] = useState(0.6);
  const [windowSize, setWindowSize] = useState(5);
  const [evidenceOn, setEvidenceOn] = useState(true);
  const evidenceId = useId();

  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]!;

  const { result, smoothed } = useMemo(() => {
    const config = resolveConfig({
      flagThreshold,
      releaseThreshold: Math.min(0.4, flagThreshold - 0.05),
      windowSize,
      // Turning evidence off reproduces the old behaviour, where the verdict
      // depended entirely on the smoothed score crossing the threshold.
      minEvidenceFrames: evidenceOn ? 3 : Number.MAX_SAFE_INTEGER,
      minEvidenceS: evidenceOn ? 1.5 : Number.MAX_SAFE_INTEGER,
    });
    const agg = createAggregator(config);
    const smoothedPoints: number[] = [];
    scenario.series.forEach((p, i) => {
      const sample: FrameSample = {
        timestamp_s: i,
        p,
        categories: categoriesFor(p),
      };
      smoothedPoints.push(agg.push(sample).windowedScore);
    });
    return { result: agg.finalize(), smoothed: smoothedPoints };
  }, [scenario, flagThreshold, windowSize, evidenceOn]);

  const n = scenario.series.length;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + (1 - v) * plotH;
  const path = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");

  const flagged = result.contains_inappropriate_content;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setScenarioId(s.id)}
            aria-pressed={s.id === scenarioId}
            className={`min-h-9 rounded-lg border px-3 text-xs font-medium transition-colors ${
              s.id === scenarioId
                ? "border-primary bg-chart-area text-foreground"
                : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {scenario.hint}
      </p>

      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Scoring chart"
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[420px]"
          role="img"
          aria-label={`Score chart for the ${scenario.label} scenario`}
        >
          {/* Flagged segment bands */}
          {result.flagged_segments.map((seg, i) => (
            <rect
              key={i}
              x={x(seg.start_s)}
              y={PAD.top}
              width={Math.max(2, x(seg.end_s) - x(seg.start_s))}
              height={plotH}
              className="fill-[var(--chart-band)]"
            />
          ))}

          {/* Gridlines at 0 / 0.5 / 1 */}
          {[0, 0.5, 1].map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(v)}
                y2={y(v)}
                className="stroke-border"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 5}
                y={y(v) + 3}
                textAnchor="end"
                className="fill-[var(--muted-foreground)] text-[8px] tabular-nums"
              >
                {v.toFixed(1)}
              </text>
            </g>
          ))}

          {/* Threshold lines */}
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(flagThreshold)}
            y2={y(flagThreshold)}
            className="stroke-danger"
            strokeWidth="1"
            strokeDasharray="4 3"
          />
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(Math.min(0.4, flagThreshold - 0.05))}
            y2={y(Math.min(0.4, flagThreshold - 0.05))}
            className="stroke-success"
            strokeWidth="1"
            strokeDasharray="4 3"
          />

          {/* Raw score */}
          <path
            d={path(scenario.series)}
            fill="none"
            className="stroke-muted-foreground"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Smoothed score */}
          <path
            d={path(smoothed)}
            fill="none"
            className="stroke-[var(--chart-line)]"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {/* Per-frame dots */}
          {scenario.series.map((p, i) => (
            <circle
              key={i}
              cx={x(i)}
              cy={y(p)}
              r="1.8"
              className={
                p >= flagThreshold ? "fill-danger" : "fill-muted-foreground"
              }
            />
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-muted-foreground" /> raw per-frame score
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1 w-4 bg-[var(--chart-line)]" /> smoothed (EWMA)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 border-t border-dashed border-danger" /> flag
          threshold
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 border-t border-dashed border-success" />{" "}
          release threshold
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-4 bg-chart-band" /> flagged segment
        </span>
      </div>

      {/* Controls */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="flex items-baseline justify-between text-xs font-medium text-foreground">
            Flag threshold
            <span className="tabular-nums text-muted-foreground">
              {flagThreshold.toFixed(2)}
            </span>
          </span>
          <input
            type="range"
            min={0.3}
            max={0.9}
            step={0.01}
            value={flagThreshold}
            onChange={(e) => setFlagThreshold(Number(e.target.value))}
            className="h-1.5 w-full accent-[var(--primary)]"
          />
        </label>
        <label className="space-y-1.5">
          <span className="flex items-baseline justify-between text-xs font-medium text-foreground">
            Smoothing window
            <span className="tabular-nums text-muted-foreground">
              {windowSize} frames
            </span>
          </span>
          <input
            type="range"
            min={1}
            max={12}
            step={1}
            value={windowSize}
            onChange={(e) => setWindowSize(Number(e.target.value))}
            className="h-1.5 w-full accent-[var(--primary)]"
          />
        </label>
      </div>

      {/* A div, not a wrapping label: the info button must not sit inside the
          checkbox's label, which may contain only its own control. */}
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-surface p-3">
        <input
          id={evidenceId}
          type="checkbox"
          checked={evidenceOn}
          onChange={(e) => setEvidenceOn(e.target.checked)}
          aria-describedby={`${evidenceId}-hint`}
          className="mt-0.5 size-4 cursor-pointer accent-current"
        />
        <span className="text-xs leading-relaxed">
          <label htmlFor={evidenceId} className="cursor-pointer font-medium text-foreground">
            Sustained-evidence pass
          </label>{" "}
          <InfoTip
            wide
            text="Flags a run of consecutive raw frames above the threshold even when smoothing keeps the averaged score below it. Uncheck to see the behaviour that produced a false negative on real footage."
          />
          <span id={`${evidenceId}-hint`} className="block text-muted-foreground">
            Turn this off with the <em>Short insert</em> scenario selected to see
            the false negative it was written to fix.
          </span>
        </span>
      </div>

      {/* Live verdict */}
      <div
        className={`flex flex-wrap items-center gap-3 rounded-xl p-3 ${
          flagged ? "bg-danger-soft" : "bg-success-soft"
        }`}
      >
        <span
          className={`text-sm font-semibold ${flagged ? "text-danger" : "text-success"}`}
        >
          {flagged ? "Flagged" : "Clean"}
        </span>
        <Badge className="border-none bg-surface-elevated">
          confidence {(result.confidence * 100).toFixed(0)}%
        </Badge>
        <Badge className="border-none bg-surface-elevated">
          {result.flagged_segments.length} segment
          {result.flagged_segments.length === 1 ? "" : "s"}
        </Badge>
        <Badge className="border-none bg-surface-elevated">
          {result.frames_analyzed} frames
        </Badge>
      </div>
    </div>
  );
}
