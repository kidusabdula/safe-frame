import { describe, expect, it } from "vitest";
import {
  combineClassScores,
  dominantSexualCategory,
  frameVerdictZone,
} from "../scoring";
import { resolveConfig } from "../schema";

const config = resolveConfig();

describe("combineClassScores", () => {
  it("weights porn and hentai fully, sexy at 0.4", () => {
    expect(
      combineClassScores({ porn: 0.5, hentai: 0.2, sexy: 0.5, neutral: 0, drawing: 0 }),
    ).toBeCloseTo(0.9);
  });

  it("swimwear-only content cannot flag alone at defaults", () => {
    const p = combineClassScores({
      porn: 0.02,
      hentai: 0.01,
      sexy: 0.9,
      neutral: 0.05,
      drawing: 0.02,
    });
    expect(p).toBeLessThan(config.flagThreshold);
  });

  it("clamps to [0, 1]", () => {
    expect(
      combineClassScores({ porn: 0.9, hentai: 0.9, sexy: 1, neutral: 0, drawing: 0 }),
    ).toBe(1);
  });
});

describe("frameVerdictZone", () => {
  it("routes the three cascade zones at the locked boundaries", () => {
    expect(frameVerdictZone(0.1, config)).toBe("safe");
    expect(frameVerdictZone(0.349, config)).toBe("safe");
    expect(frameVerdictZone(0.35, config)).toBe("borderline");
    expect(frameVerdictZone(0.749, config)).toBe("borderline");
    expect(frameVerdictZone(0.75, config)).toBe("flagged");
  });
});

describe("dominantSexualCategory", () => {
  it("picks the max sexual class, ignoring neutral/drawing", () => {
    expect(
      dominantSexualCategory({ porn: 0.1, hentai: 0.6, sexy: 0.3, neutral: 0.9, drawing: 0 }),
    ).toBe("hentai");
  });

  it("weighs sexy by its p-contribution — porn 0.97 beats sexy 0.99", () => {
    expect(
      dominantSexualCategory({ porn: 0.97, hentai: 0.02, sexy: 0.99, neutral: 0.03, drawing: 0 }),
    ).toBe("porn");
  });

  it("still reports sexy when it truly dominates the weighted mix", () => {
    expect(
      dominantSexualCategory({ porn: 0.1, hentai: 0.05, sexy: 0.9, neutral: 0.4, drawing: 0 }),
    ).toBe("sexy");
  });
});
