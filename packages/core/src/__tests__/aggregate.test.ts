import { describe, expect, it } from "vitest";
import { createAggregator, type FrameSample } from "../aggregate";
import { resolveConfig, type CategoryScores } from "../schema";

function cat(over: Partial<CategoryScores> = {}): CategoryScores {
  return { porn: 0, hentai: 0, sexy: 0, neutral: 1, drawing: 0, ...over };
}

function sample(
  timestamp_s: number,
  p: number,
  over: Partial<FrameSample> = {},
): FrameSample {
  return {
    timestamp_s,
    p,
    categories: p > 0.5 ? cat({ porn: p, neutral: 1 - p }) : cat(),
    ...over,
  };
}

const config = resolveConfig();

describe("aggregator — verdicts", () => {
  it("returns a clean verdict for an all-safe video", () => {
    const agg = createAggregator(config);
    for (let t = 0; t < 30; t++) agg.push(sample(t, 0.02));
    const out = agg.finalize();
    expect(out.contains_inappropriate_content).toBe(false);
    expect(out.flagged_segments).toHaveLength(0);
    expect(out.frames_analyzed).toBe(30);
    expect(out.confidence).toBeLessThan(0.1);
  });

  it("flags a sustained high-score run and reports one segment", () => {
    const agg = createAggregator(config);
    for (let t = 0; t < 10; t++) agg.push(sample(t, 0.02));
    for (let t = 10; t < 20; t++) agg.push(sample(t, 0.95));
    for (let t = 20; t < 30; t++) agg.push(sample(t, 0.02));
    const out = agg.finalize();
    expect(out.contains_inappropriate_content).toBe(true);
    expect(out.flagged_segments).toHaveLength(1);
    const seg = out.flagged_segments[0]!;
    // Backdated start: near the true onset at t=10, not the smoothing lag point.
    expect(seg.start_s).toBeGreaterThanOrEqual(9);
    expect(seg.start_s).toBeLessThanOrEqual(12);
    expect(seg.end_s).toBeGreaterThan(19);
    expect(seg.peak_score).toBeGreaterThan(0.8);
    expect(seg.dominant_category).toBe("porn");
    expect(out.confidence).toBeGreaterThan(0.8);
  });

  it("does not flag a single spiky frame (EWMA damping)", () => {
    const agg = createAggregator(config);
    for (let t = 0; t < 20; t++) agg.push(sample(t, t === 10 ? 0.9 : 0.02));
    const out = agg.finalize();
    expect(out.contains_inappropriate_content).toBe(false);
  });
});

describe("aggregator — hysteresis", () => {
  it("keeps one segment open through a mid-range dip (no flicker)", () => {
    const agg = createAggregator(config);
    for (let t = 0; t < 5; t++) agg.push(sample(t, 0.02));
    for (let t = 5; t < 10; t++) agg.push(sample(t, 0.9));
    // Dip into the 0.40–0.60 band: below open, above close — must NOT split.
    for (let t = 10; t < 13; t++) agg.push(sample(t, 0.5));
    for (let t = 13; t < 18; t++) agg.push(sample(t, 0.9));
    for (let t = 18; t < 28; t++) agg.push(sample(t, 0.02));
    const out = agg.finalize();
    expect(out.flagged_segments).toHaveLength(1);
  });

  it("splits into two segments when the score fully releases between runs", () => {
    const agg = createAggregator(config);
    for (let t = 0; t < 5; t++) agg.push(sample(t, 0.02));
    for (let t = 5; t < 12; t++) agg.push(sample(t, 0.95));
    for (let t = 12; t < 25; t++) agg.push(sample(t, 0.02)); // full release
    for (let t = 25; t < 32; t++) agg.push(sample(t, 0.95));
    for (let t = 32; t < 40; t++) agg.push(sample(t, 0.02));
    const out = agg.finalize();
    expect(out.flagged_segments).toHaveLength(2);
  });

  it("closes an open segment at the last timestamp on finalize", () => {
    const agg = createAggregator(config);
    for (let t = 0; t < 5; t++) agg.push(sample(t, 0.02));
    for (let t = 5; t < 15; t++) agg.push(sample(t, 0.95)); // video ends hot
    const out = agg.finalize();
    expect(out.flagged_segments).toHaveLength(1);
    expect(out.flagged_segments[0]!.end_s).toBe(14);
  });
});

describe("aggregator — min-frames guard", () => {
  it("attenuates confidence below minFramesForVerdict", () => {
    const agg = createAggregator(config);
    agg.push(sample(0, 0.95));
    agg.push(sample(1, 0.95));
    const out = agg.finalize();
    // 2 of 5 required frames → confidence scaled by 2/5.
    expect(out.confidence).toBeLessThanOrEqual(0.4);
  });

  it("handles an empty video without NaN", () => {
    const agg = createAggregator(config);
    const out = agg.finalize();
    expect(out.contains_inappropriate_content).toBe(false);
    expect(out.confidence).toBe(0);
    expect(out.frames_analyzed).toBe(0);
    expect(out.avg_frame_latency_ms).toBe(0);
    expect(out.p95_frame_latency_ms).toBe(0);
  });
});

describe("aggregator — densification ordering", () => {
  it("finalize sorts out-of-order densified samples onto the true timeline", () => {
    const agg = createAggregator(config);
    // Baseline pass hits a hot frame at t=10, then densified samples for
    // t=8..12 arrive AFTER later baseline frames — arrival order is scrambled.
    for (let t = 0; t <= 10; t++) agg.push(sample(t, t === 10 ? 0.95 : 0.02));
    for (let t = 11; t < 15; t++) agg.push(sample(t, 0.02));
    for (const t of [8.5, 9.5, 10.5, 11.5]) agg.push(sample(t, 0.95));
    for (let t = 15; t < 25; t++) agg.push(sample(t, 0.02));
    const out = agg.finalize();
    expect(out.flagged_segments).toHaveLength(1);
    const seg = out.flagged_segments[0]!;
    expect(seg.start_s).toBeGreaterThanOrEqual(8);
    expect(seg.end_s).toBeLessThanOrEqual(15);
  });
});

/**
 * Regression suite for the false negative found in live testing on 2026-07-30:
 * a 37.7 s clip with two short explicit inserts between scenery returned
 * `contains_inappropriate_content: false` with zero segments, because the
 * verdict depended entirely on the smoothed score crossing flagThreshold.
 *
 * The shape below mirrors composite-demo.mp4's ground truth exactly (scenery /
 * bikini / scenery / explicit / scenery / explicit / scenery) sampled at the
 * ~1.65 fps the real run produced. Scores are numbers only — no media, no
 * fixtures.
 */
describe("aggregator — composite ground truth", () => {
  const STEP = 0.6;
  interface Span {
    fromS: number;
    toS: number;
    p: number;
    kind: "scenery" | "bikini" | "explicit";
  }
  const SPANS: Span[] = [
    { fromS: 0, toS: 8, p: 0.05, kind: "scenery" },
    // Swimwear: sexy 0.89 × 0.4 ⇒ p well under the flag line by construction.
    { fromS: 8, toS: 10.7, p: 0.46, kind: "bikini" },
    { fromS: 10.7, toS: 16.7, p: 0.05, kind: "scenery" },
    // Post-fusion value for a re-encoded explicit frame: Tier-1 ≈ 0.7 blended
    // with Tier-2 ≈ 0.6, floored at porn 0.647.
    { fromS: 16.7, toS: 21.7, p: 0.66, kind: "explicit" },
    { fromS: 21.7, toS: 25.7, p: 0.05, kind: "scenery" },
    { fromS: 25.7, toS: 29.7, p: 0.66, kind: "explicit" },
    { fromS: 29.7, toS: 37.7, p: 0.05, kind: "scenery" },
  ];

  function buildComposite() {
    const agg = createAggregator(config);
    for (const span of SPANS) {
      for (let t = span.fromS; t < span.toS; t += STEP) {
        const categories =
          span.kind === "explicit"
            ? cat({ porn: 0.647, sexy: 0.6, neutral: 0.1 })
            : span.kind === "bikini"
              ? cat({ sexy: 0.89, porn: 0.1, neutral: 0.4 })
              : cat();
        agg.push({ timestamp_s: Number(t.toFixed(3)), p: span.p, categories });
      }
    }
    return agg.finalize();
  }

  it("flags the video and reports one segment per explicit insert", () => {
    const out = buildComposite();
    expect(out.contains_inappropriate_content).toBe(true);
    expect(out.flagged_segments).toHaveLength(2);
  });

  it("places the segments on the explicit windows, not the bikini bump", () => {
    const out = buildComposite();
    const [first, second] = out.flagged_segments;
    expect(first!.start_s).toBeGreaterThanOrEqual(15);
    expect(first!.start_s).toBeLessThanOrEqual(18);
    expect(first!.end_s).toBeLessThanOrEqual(23);
    expect(second!.start_s).toBeGreaterThanOrEqual(24);
    expect(second!.start_s).toBeLessThanOrEqual(27);
    // Nothing may overlap the swimwear span at 8.0–10.7 s.
    for (const seg of out.flagged_segments) {
      expect(seg.start_s >= 10.7 || seg.end_s <= 8).toBe(true);
    }
  });

  it("reports a confidence at or above the flag threshold when flagged", () => {
    const out = buildComposite();
    // The bug on screen was "detected" next to a sub-threshold confidence.
    expect(out.confidence).toBeGreaterThanOrEqual(config.flagThreshold);
  });

  it("attributes the segments to porn, not the higher raw sexy score", () => {
    const out = buildComposite();
    for (const seg of out.flagged_segments) {
      expect(seg.dominant_category).toBe("porn");
    }
  });
});

describe("aggregator — sustained-evidence path", () => {
  it("flags a short run the smoother alone would damp away", () => {
    const agg = createAggregator(config);
    for (let t = 0; t < 20; t++) agg.push(sample(t, 0.02));
    // Three consecutive over-threshold frames: the EWMA peaks around 0.57,
    // below flagThreshold, so hysteresis never opens. Raw evidence must.
    for (let t = 20; t < 23; t++) agg.push(sample(t, 0.8));
    for (let t = 23; t < 40; t++) agg.push(sample(t, 0.02));
    const out = agg.finalize();
    expect(out.contains_inappropriate_content).toBe(true);
    expect(out.flagged_segments).toHaveLength(1);
    expect(out.flagged_segments[0]!.start_s).toBe(20);
    expect(out.flagged_segments[0]!.peak_score).toBeCloseTo(0.8, 5);
  });

  it("does not double-count a run the hysteresis pass already covered", () => {
    const agg = createAggregator(config);
    for (let t = 0; t < 5; t++) agg.push(sample(t, 0.02));
    for (let t = 5; t < 25; t++) agg.push(sample(t, 0.95));
    for (let t = 25; t < 35; t++) agg.push(sample(t, 0.02));
    const out = agg.finalize();
    expect(out.flagged_segments).toHaveLength(1);
  });

  it("ignores a run too short to rule out decode noise", () => {
    const agg = createAggregator(config);
    for (let t = 0; t < 20; t++) agg.push(sample(t, 0.02));
    // Two frames — under both minEvidenceFrames (3) and minEvidenceS (1.5 s).
    for (let t = 20; t < 22; t++) agg.push(sample(t, 0.9));
    for (let t = 22; t < 40; t++) agg.push(sample(t, 0.02));
    const out = agg.finalize();
    expect(out.contains_inappropriate_content).toBe(false);
    expect(out.flagged_segments).toHaveLength(0);
  });

  it("qualifies a sparse run by elapsed span when frame count is low", () => {
    const agg = createAggregator(config);
    for (let t = 0; t < 10; t++) agg.push(sample(t, 0.02));
    // Only 2 frames, but 2 s apart — spans minEvidenceS.
    agg.push(sample(10, 0.9));
    agg.push(sample(12, 0.9));
    for (let t = 14; t < 30; t++) agg.push(sample(t, 0.02));
    const out = agg.finalize();
    expect(out.contains_inappropriate_content).toBe(true);
  });
});

describe("aggregator — processing stats", () => {
  it("computes avg/p95 latency and tier-2 escalation count", () => {
    const agg = createAggregator(config);
    for (let t = 0; t < 20; t++) {
      agg.push(
        sample(t, 0.02, {
          latency_ms: t < 18 ? 10 : 200,
          tier2Used: t % 4 === 0,
        }),
      );
    }
    const out = agg.finalize();
    // Nearest-rank p95 of 20 samples is the 19th smallest → needs 2 outliers.
    expect(out.avg_frame_latency_ms).toBeCloseTo((18 * 10 + 2 * 200) / 20, 5);
    expect(out.p95_frame_latency_ms).toBe(200);
    expect(out.tier2_escalations).toBe(5);
  });
});
