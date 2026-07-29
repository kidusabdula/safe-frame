import { describe, expect, it } from "vitest";
import {
  combineClassScores,
  dominantSexualCategory,
  frameVerdictZone,
  fuseTierScores,
} from "../scoring";
import { resolveConfig, type CategoryScores } from "../schema";

const config = resolveConfig();

function cat(over: Partial<CategoryScores> = {}): CategoryScores {
  return { porn: 0, hentai: 0, sexy: 0, neutral: 1, drawing: 0, ...over };
}

describe("fuseTierScores", () => {
  it("lets Tier 2 clear a suggestive Tier-1 false positive", () => {
    // Cartoon / swimwear frame: Tier 1 unsure, Tier 2 confident it is safe.
    const fused = fuseTierScores(
      0.62,
      0.02,
      cat({ sexy: 0.9, drawing: 0.8, porn: 0.05, neutral: 0.2 }),
      config,
    );
    expect(fused).toBeLessThan(config.flagThreshold);
  });

  it("does not let Tier 2 erase Tier-1's explicit-class evidence", () => {
    // The live false negative: Tier 2 returned a modest value for a frame
    // MobileNet scored porn 0.647. Replacement dropped it under the flag line.
    const tier1 = 0.7;
    const tier2 = 0.55;
    const scores = cat({ porn: 0.647, sexy: 0.6, neutral: 0.1 });
    const fused = fuseTierScores(tier1, tier2, scores, config);
    expect(fused).toBeGreaterThanOrEqual(scores.porn);
    // Strictly better than the old behaviour of assigning tier2 outright.
    expect(fused).toBeGreaterThan(tier2);
  });

  it("raises a frame Tier 1 underrated", () => {
    const fused = fuseTierScores(0.4, 0.95, cat({ sexy: 0.5 }), config);
    expect(fused).toBeGreaterThan(0.4);
    expect(fused).toBeLessThan(0.95);
  });

  it("weights Tier 2 more heavily than Tier 1 in the blend", () => {
    const low = fuseTierScores(1, 0, cat(), config);
    const high = fuseTierScores(0, 1, cat(), config);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeCloseTo(config.tier2Weight, 5);
  });

  it("never floors on sexy, so swimwear still cannot self-flag", () => {
    const fused = fuseTierScores(
      0.5,
      0.05,
      cat({ sexy: 0.99, porn: 0.1, neutral: 0.3 }),
      config,
    );
    expect(fused).toBeLessThan(config.flagThreshold);
  });

  it("never floors on hentai, so cartoons are not re-flagged", () => {
    // NSFWJS gives animation high hentai+drawing; flooring there would
    // resurrect the Big Buck Bunny false positive.
    const fused = fuseTierScores(
      0.55,
      0.03,
      cat({ hentai: 0.7, drawing: 0.95, porn: 0.04, neutral: 0.2 }),
      config,
    );
    expect(fused).toBeLessThan(config.flagThreshold);
  });

  it("stays within [0, 1]", () => {
    expect(fuseTierScores(1, 1, cat({ porn: 1 }), config)).toBe(1);
    expect(fuseTierScores(0, 0, cat(), config)).toBe(0);
  });
});

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
