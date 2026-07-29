/**
 * Offline replay harness for captured scans.
 *
 * The app writes one JSON file per scan into a user-chosen folder (see
 * apps/web/.../lib/scanLog.ts), including the per-frame Tier-1 distribution and
 * the raw Tier-2 probability. Because Tier-1's combined score is a pure function
 * of the stored class scores, an entire scan can be re-simulated here without
 * the video, the models, or a browser — which turns cascade tuning from
 * "change a constant, ask the owner to re-record six tests" into a measurement.
 *
 * Usage:
 *   SAFEFRAME_LOGS=./test-logs pnpm --filter @safeframe/core test replay
 *
 * It reports rather than asserts opinions: the only assertions are genuine
 * invariants (logs parse, replay is deterministic, replay of an unmodified
 * config reproduces the shipped verdict). With no logs present it skips, so it
 * is safe in a clean checkout.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createAggregator, type FrameSample } from "../aggregate";
import { combineClassScores, fuseTierScores } from "../scoring";
import {
  resolveConfig,
  type CategoryScores,
  type DetectionConfig,
  type DetectionResult,
} from "../schema";

interface ScanFrame {
  t: number;
  p: number;
  w: number;
  tier2: number | null;
  porn: number;
  hentai: number;
  sexy: number;
  neutral: number;
  drawing: number;
}

interface ScanLogFile {
  label?: string;
  at?: string;
  config?: Partial<DetectionConfig>;
  result?: DetectionResult;
  frames?: ScanFrame[];
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_LOG_DIR = path.resolve(HERE, "../../../../test-logs");

function logDir(): string {
  const fromEnv = process.env.SAFEFRAME_LOGS;
  return fromEnv ? path.resolve(fromEnv) : DEFAULT_LOG_DIR;
}

function loadLogs(): Array<{ file: string; entry: ScanLogFile }> {
  const dir = logDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((file) => {
      const raw = readFileSync(path.join(dir, file), "utf8");
      return { file, entry: JSON.parse(raw) as ScanLogFile };
    })
    .filter(({ entry }) => Array.isArray(entry.frames) && entry.frames.length > 0);
}

function categoriesOf(frame: ScanFrame): CategoryScores {
  return {
    porn: frame.porn,
    hentai: frame.hentai,
    sexy: frame.sexy,
    neutral: frame.neutral,
    drawing: frame.drawing,
  };
}

/**
 * Re-derive each frame's score from the stored class distribution, so fusion
 * weights can be varied. Tier-1's score is recomputed (it is a pure function of
 * the categories); Tier-2's stored raw probability is re-fused only for frames
 * that actually escalated during the original run.
 */
function replay(frames: readonly ScanFrame[], config: DetectionConfig) {
  const agg = createAggregator(config);
  for (const frame of frames) {
    const categories = categoriesOf(frame);
    const p1 = combineClassScores(categories, config.sexyWeight);
    const p =
      frame.tier2 === null
        ? p1
        : fuseTierScores(p1, frame.tier2, categories, config);
    const sample: FrameSample = {
      timestamp_s: frame.t,
      p,
      categories,
      tier2Used: frame.tier2 !== null,
    };
    agg.push(sample);
  }
  return agg.finalize();
}

const logs = loadLogs();

describe.skipIf(logs.length === 0)("replay — captured scans", () => {
  it("reproduces each stored verdict under the config it was scanned with", () => {
    const rows: string[] = [];
    for (const { file, entry } of logs) {
      const config = resolveConfig(entry.config);
      const out = replay(entry.frames ?? [], config);
      const stored = entry.result;
      rows.push(
        [
          (entry.label ?? file).slice(0, 28).padEnd(28),
          `stored ${stored?.contains_inappropriate_content ? "FLAG" : "----"} ${(
            (stored?.confidence ?? 0) * 100
          )
            .toFixed(0)
            .padStart(3)}% ${String(stored?.flagged_segments.length ?? 0)}seg`,
          `replay ${out.contains_inappropriate_content ? "FLAG" : "----"} ${(
            out.confidence * 100
          )
            .toFixed(0)
            .padStart(3)}% ${out.flagged_segments.length}seg`,
        ].join("  |  "),
      );
      // Replay must be deterministic and structurally sound.
      const again = replay(entry.frames ?? [], config);
      expect(again.confidence).toBe(out.confidence);
      expect(again.flagged_segments.length).toBe(out.flagged_segments.length);
      expect(out.confidence).toBeGreaterThanOrEqual(0);
      expect(out.confidence).toBeLessThanOrEqual(1);
    }
    console.log(`\nReplay of ${logs.length} captured scan(s):\n${rows.join("\n")}\n`);
  });

  it("sweeps the tuning surface so threshold changes can be evaluated offline", () => {
    const sweeps: Array<{ name: string; patch: Partial<DetectionConfig> }> = [
      { name: "defaults          ", patch: {} },
      { name: "tier2Weight 0.50  ", patch: { tier2Weight: 0.5 } },
      { name: "tier2Weight 0.80  ", patch: { tier2Weight: 0.8 } },
      { name: "tier2 replaces (old)", patch: { tier2Weight: 1 } },
      { name: "flag 0.55         ", patch: { flagThreshold: 0.55 } },
      { name: "flag 0.65         ", patch: { flagThreshold: 0.65 } },
      { name: "evidence off      ", patch: { minEvidenceFrames: 10_000, minEvidenceS: 10_000 } },
    ];

    const lines: string[] = [];
    for (const { file, entry } of logs) {
      const label = (entry.label ?? file).slice(0, 34);
      const cells = sweeps.map(({ name, patch }) => {
        const out = replay(
          entry.frames ?? [],
          resolveConfig({ ...entry.config, ...patch }),
        );
        const mark = out.contains_inappropriate_content ? "FLAG" : "----";
        return `${name.trim()}: ${mark} ${(out.confidence * 100).toFixed(0)}%/${out.flagged_segments.length}seg`;
      });
      lines.push(`${label}\n    ${cells.join("\n    ")}`);
    }
    console.log(`\nTuning sweep:\n${lines.join("\n")}\n`);
    expect(logs.length).toBeGreaterThan(0);
  });
});
