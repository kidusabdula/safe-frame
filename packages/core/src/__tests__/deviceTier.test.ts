import { describe, expect, it } from "vitest";
import { resolveTier, samplingFpsForTier } from "../deviceTier";

describe("resolveTier", () => {
  it("classifies a 2016 phone (low memory, no WebGPU, slow bench) as low", () => {
    expect(
      resolveTier({ deviceMemory: 2, cores: 8, hasWebGpu: false, benchMs: 300 }),
    ).toBe("low");
  });

  it("classifies a modern flagship with WebGPU as high", () => {
    expect(
      resolveTier({ deviceMemory: 8, cores: 8, hasWebGpu: true, benchMs: 12 }),
    ).toBe("high");
  });

  it("classifies a mid-range device without WebGPU as mid", () => {
    expect(
      resolveTier({ deviceMemory: 6, cores: 8, hasWebGpu: false, benchMs: 40 }),
    ).toBe("mid");
  });

  it("a slow micro-benchmark overrides otherwise-capable specs", () => {
    expect(
      resolveTier({ deviceMemory: 8, cores: 8, hasWebGpu: true, benchMs: 400 }),
    ).toBe("low");
  });

  it("missing signals (Safari/RN) degrade to mid, never crash", () => {
    expect(resolveTier({ hasWebGpu: false })).toBe("mid");
  });
});

describe("samplingFpsForTier", () => {
  it("halves sampling on low tier only", () => {
    expect(samplingFpsForTier("low", 1)).toBe(0.5);
    expect(samplingFpsForTier("mid", 1)).toBe(1);
    expect(samplingFpsForTier("high", 1)).toBe(1);
  });
});
