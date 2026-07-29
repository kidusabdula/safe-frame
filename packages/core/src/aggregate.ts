import type { CategoryScores, DetectionConfig, FlaggedSegment } from "./schema";
import { clamp01, dominantSexualCategory } from "./scoring";

/** One classified frame entering the aggregator (post-cascade score). */
export interface FrameSample {
  timestamp_s: number;
  /** Combined inappropriate score for this frame (Tier-2 value if escalated). */
  p: number;
  categories: CategoryScores;
  latency_ms?: number;
  tier2Used?: boolean;
}

/** Streaming feedback returned by push() — drives the live UI / guard mode. */
export interface PushFeedback {
  windowedScore: number;
  /** Hysteresis state on the streaming path: true between open and close. */
  guardActive: boolean;
}

/** Everything the aggregator can know; the app supplies engine/duration/total_ms. */
export interface AggregateSummary {
  contains_inappropriate_content: boolean;
  confidence: number;
  categories: CategoryScores;
  flagged_segments: FlaggedSegment[];
  frames_analyzed: number;
  avg_frame_latency_ms: number;
  p95_frame_latency_ms: number;
  tier2_escalations: number;
}

export interface Aggregator {
  push(sample: FrameSample): PushFeedback;
  finalize(): AggregateSummary;
  /** All samples pushed so far, in arrival order (timeline rendering). */
  samples(): readonly FrameSample[];
}

const ZERO_CATEGORIES: CategoryScores = {
  porn: 0,
  hentai: 0,
  sexy: 0,
  neutral: 0,
  drawing: 0,
};

/**
 * EWMA over the last `windowSize` scores, oldest → newest, so a single
 * spiky frame is damped but a run of high frames converges fast.
 */
function windowedScore(window: readonly number[], windowSize: number): number {
  const alpha = 2 / (windowSize + 1);
  let s: number | null = null;
  for (const x of window) {
    s = s === null ? x : alpha * x + (1 - alpha) * s;
  }
  return s ?? 0;
}

interface SegmentPass {
  segments: FlaggedSegment[];
  peakWindowed: number;
}

/**
 * The hysteresis segment builder, run over time-sorted samples:
 * a segment opens when the windowed score crosses `flagThreshold` and closes
 * only when it falls below `releaseThreshold` — the gap prevents flicker at
 * the boundary. Segment start is backdated to the earliest in-window frame
 * still above the release threshold so onsets aren't clipped by smoothing lag.
 */
export function computeSegments(
  sorted: readonly FrameSample[],
  config: DetectionConfig,
): SegmentPass {
  const segments: FlaggedSegment[] = [];
  const win: FrameSample[] = [];
  let peakWindowed = 0;

  let open = false;
  let start = 0;
  let peak = 0;
  let peakCategories: CategoryScores = ZERO_CATEGORIES;
  let lastTs = 0;

  for (const sample of sorted) {
    win.push(sample);
    if (win.length > config.windowSize) win.shift();
    const w = windowedScore(
      win.map((f) => f.p),
      config.windowSize,
    );
    peakWindowed = Math.max(peakWindowed, w);
    lastTs = sample.timestamp_s;

    if (!open && w >= config.flagThreshold) {
      open = true;
      const firstHot = win.find((f) => f.p >= config.releaseThreshold);
      start = (firstHot ?? sample).timestamp_s;
      peak = w;
      peakCategories = sample.categories;
    } else if (open) {
      if (w > peak) {
        peak = w;
        peakCategories = sample.categories;
      }
      if (w < config.releaseThreshold) {
        open = false;
        segments.push({
          start_s: start,
          end_s: Math.max(sample.timestamp_s, start),
          peak_score: clamp01(peak),
          dominant_category: dominantSexualCategory(peakCategories, config.sexyWeight),
        });
      }
    }
  }

  if (open) {
    segments.push({
      start_s: start,
      end_s: Math.max(lastTs, start),
      peak_score: clamp01(peak),
      dominant_category: dominantSexualCategory(peakCategories, config.sexyWeight),
    });
  }

  return { segments, peakWindowed };
}

/** A run of consecutive frames whose raw score held above the flag threshold. */
export interface EvidenceRun {
  startS: number;
  endS: number;
  frames: number;
  peak: number;
  peakCategories: CategoryScores;
}

/**
 * The sustained-evidence pass — the second, independent path to a positive
 * verdict.
 *
 * The hysteresis builder above works on the *smoothed* score, which is the
 * right instrument for drawing segment boundaries: it ignores single-frame
 * spikes. But it made the verdict itself fragile. A short explicit insert
 * surrounded by safe footage gets damped by the 5-sample EWMA and never
 * crosses `flagThreshold`, so a video that plainly contains explicit content
 * reported clean with zero segments (observed live: peak windowed 0.578 against
 * a 0.60 threshold, while raw frames sat well above it).
 *
 * So we also look at the raw series: a run of consecutive frames above the flag
 * threshold is evidence in its own right once it is long enough to rule out
 * decode noise — `minEvidenceFrames` frames or `minEvidenceS` seconds. Runs are
 * returned in time order; every qualifying run becomes a segment, so a video
 * with two separate explicit inserts reports two of them.
 */
export function computeEvidenceRuns(
  sorted: readonly FrameSample[],
  config: DetectionConfig,
): EvidenceRun[] {
  const runs: EvidenceRun[] = [];
  let current: EvidenceRun | null = null;

  const close = (): void => {
    if (current === null) return;
    const spanS = current.endS - current.startS;
    if (
      current.frames >= config.minEvidenceFrames ||
      spanS >= config.minEvidenceS
    ) {
      runs.push(current);
    }
    current = null;
  };

  for (const s of sorted) {
    if (s.p < config.flagThreshold) {
      close();
      continue;
    }
    if (current === null) {
      current = {
        startS: s.timestamp_s,
        endS: s.timestamp_s,
        frames: 1,
        peak: s.p,
        peakCategories: s.categories,
      };
      continue;
    }
    current.endS = s.timestamp_s;
    current.frames += 1;
    if (s.p > current.peak) {
      current.peak = s.p;
      current.peakCategories = s.categories;
    }
  }
  close();

  return runs;
}

function overlaps(run: EvidenceRun, segment: FlaggedSegment): boolean {
  return run.startS <= segment.end_s && run.endS >= segment.start_s;
}

function percentile(sortedAsc: readonly number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.ceil(q * sortedAsc.length) - 1,
  );
  return sortedAsc[Math.max(0, idx)] ?? 0;
}

/**
 * Create the sliding-window / EWMA / hysteresis aggregator.
 *
 * push() maintains a streaming view in arrival order (for the live UI and
 * guard mode, where samples are naturally chronological). finalize() re-runs
 * the pass over time-sorted samples, because densification can deliver
 * frames slightly out of order in pre-scan mode — the final verdict is
 * always computed on the true timeline.
 */
export function createAggregator(config: DetectionConfig): Aggregator {
  const all: FrameSample[] = [];
  const streamWin: number[] = [];
  let streamGuard = false;

  return {
    push(sample: FrameSample): PushFeedback {
      all.push(sample);
      streamWin.push(sample.p);
      if (streamWin.length > config.windowSize) streamWin.shift();
      const w = windowedScore(streamWin, config.windowSize);
      if (!streamGuard && w >= config.flagThreshold) streamGuard = true;
      else if (streamGuard && w < config.releaseThreshold) streamGuard = false;
      return { windowedScore: w, guardActive: streamGuard };
    },

    finalize(): AggregateSummary {
      const sorted = [...all].sort((a, b) => a.timestamp_s - b.timestamp_s);
      const { segments, peakWindowed } = computeSegments(sorted, config);

      // Second path to a verdict (see computeEvidenceRuns): any qualifying run
      // of raw over-threshold frames that the smoother missed becomes a segment
      // of its own, so the verdict, the segment list and the timeline can never
      // contradict each other on screen.
      const runs = computeEvidenceRuns(sorted, config);
      const synthesized = runs
        .filter((run) => !segments.some((seg) => overlaps(run, seg)))
        .map(
          (run): FlaggedSegment => ({
            start_s: run.startS,
            end_s: Math.max(run.endS, run.startS),
            peak_score: clamp01(run.peak),
            dominant_category: dominantSexualCategory(
              run.peakCategories,
              config.sexyWeight,
            ),
          }),
        );
      const allSegments = [...segments, ...synthesized].sort(
        (a, b) => a.start_s - b.start_s,
      );
      const evidencePeak = runs.reduce((m, run) => Math.max(m, run.peak), 0);

      const categories: CategoryScores = { ...ZERO_CATEGORIES };
      for (const s of sorted) {
        categories.porn = Math.max(categories.porn, s.categories.porn);
        categories.hentai = Math.max(categories.hentai, s.categories.hentai);
        categories.sexy = Math.max(categories.sexy, s.categories.sexy);
        categories.neutral = Math.max(categories.neutral, s.categories.neutral);
        categories.drawing = Math.max(categories.drawing, s.categories.drawing);
      }

      // Min-frames guard: a 2-frame video cannot produce an overconfident
      // verdict — confidence is attenuated below minFramesForVerdict.
      const frames = sorted.length;
      const guard =
        frames >= config.minFramesForVerdict
          ? 1
          : frames / config.minFramesForVerdict;
      // Report the stronger of the two signals. Without this a flagged video
      // could show a confidence below its own flag threshold — the smoothed
      // peak — which reads as a contradiction next to the category peaks.
      const confidence = clamp01(Math.max(peakWindowed, evidencePeak) * guard);

      const latencies = sorted
        .map((s) => s.latency_ms)
        .filter((v): v is number => typeof v === "number")
        .sort((a, b) => a - b);
      const avg =
        latencies.length === 0
          ? 0
          : latencies.reduce((a, b) => a + b, 0) / latencies.length;

      return {
        contains_inappropriate_content: allSegments.length > 0,
        confidence,
        categories,
        flagged_segments: allSegments,
        frames_analyzed: frames,
        avg_frame_latency_ms: avg,
        p95_frame_latency_ms: percentile(latencies, 0.95),
        tier2_escalations: sorted.filter((s) => s.tier2Used === true).length,
      };
    },

    samples(): readonly FrameSample[] {
      return all;
    },
  };
}
