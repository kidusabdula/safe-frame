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
