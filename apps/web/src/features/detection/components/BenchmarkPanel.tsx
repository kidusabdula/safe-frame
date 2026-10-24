"use client";

import { Activity, Cpu, Gauge, Layers } from "lucide-react";
import type { DetectionResult, DeviceTier } from "@safeframe/core";
import { Card, InfoTip } from "@/components/ui";
import type { BenchmarkRecord } from "../hooks/useBenchmark";
import type { TimelinePoint } from "../lib/runDetection";

interface BenchmarkPanelProps {
  record: BenchmarkRecord;
  result: DetectionResult | null;
  timeline: readonly TimelinePoint[];
  resolvedTier: DeviceTier | null;
  activeBackend: string | null;
}

interface Row {
  label: string;
  value: string;
  tip: string;
  /** 0..1 for an optional inline bar under the value. */
  bar?: number;
}

/**
 * Engineering metrics, surfaced in the UI. Every cell renders a measured
 * value or "—". Nothing here is ever estimated or invented.
 */
export function BenchmarkPanel({
  record,
  result,
  timeline,
  resolvedTier,
  activeBackend,
}: BenchmarkPanelProps) {
  const latencies = timeline.map((t) => t.latency_ms).sort((a, b) => a - b);
  const p50 = quantile(latencies, 0.5);
  const p95 = quantile(latencies, 0.95);
  const maxLatency = latencies[latencies.length - 1] ?? null;
  const throughput = result
    ? result.frames_analyzed / (result.processing.total_ms / 1000)
    : null;

  const groups: Array<{ title: string; icon: typeof Cpu; rows: Row[] }> = [
    {
      title: "Device",
      icon: Cpu,
      rows: [
        {
          label: "Tier",
          value: resolvedTier ?? "—",
          tip: "low / mid / high — decides the sampling rate and whether the Tier-2 model is ever loaded. Low-tier devices never download it.",
        },
        {
          label: "Backend",
          value: activeBackend ?? "—",
          tip: "Where inference actually ran: WebGPU (fastest) → WebGL → WASM (universal fallback). Chosen at runtime per device.",
        },
        {
          label: "Micro-bench",
          value: ms(record.microBenchMs),
          tip: "Median of 5 warm-up inferences on this hardware — the live signal feeding the tier decision.",
        },
        {
          label: "JS heap",
          value: record.memoryMb !== null ? `${record.memoryMb.toFixed(0)} MB` : "—",
          tip: "JavaScript heap in use (Chrome-only API). Model tensors live outside this number, in GPU/WASM memory.",
        },
      ],
    },
    {
      title: "Models",
      icon: Layers,
      rows: [
        {
          label: "Tier-1 load",
          value: ms(record.tier1LoadMs),
          tip: "Init time for the small MobileNet screener. Bundled with the app — zero network, works offline from the first visit.",
        },
        {
          label: "Tier-2 load",
          value: ms(record.tier2LoadMs),
          tip: "Download + init of the large ViT verifier, fetched lazily on the first borderline frame only. Cached — subsequent runs are near-instant.",
        },
        {
          label: "Tier-2 checks",
          value: result ? String(result.processing.tier2_escalations) : "—",
          tip: "Borderline frames double-checked by the big model (budget: 40 per video). 0 on a clearly-safe video is correct and saves the download entirely.",
        },
      ],
    },
    {
      title: "Throughput",
      icon: Gauge,
      rows: [
        {
          label: "Frames/s",
          value: throughput !== null ? `${throughput.toFixed(1)}` : "—",
          tip: "Frames classified per second of wall-clock, end to end (seek + decode + preprocess + inference).",
        },
        {
          label: "Latency p50",
          value: ms(p50),
          tip: "Typical single-frame classification time — half of all frames were faster than this.",
          bar: ratio(p50, maxLatency),
        },
        {
          label: "Latency p95",
          value: ms(p95),
          tip: "Worst-case-ish frame time — 95% of frames were faster. Spikes here are usually Tier-2 escalations or the model download.",
          bar: ratio(p95, maxLatency),
        },
        {
          label: "Long tasks",
          value: String(record.longTaskCount),
          tip: "Main-thread stalls over 50 ms during the run — the UI-jank meter. Inference in workers keeps this low.",
        },
      ],
    },
  ];

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Activity className="size-3.5 text-muted-foreground" />
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Benchmark — measured on this device
        </p>
        <InfoTip
          wide
          text="Every value below was measured live on your hardware during the scan. Cells show — until a real measurement exists; nothing is estimated."
        />
      </div>
      <div className="space-y-4 p-4">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              <group.icon className="size-3" /> {group.title}
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              {group.rows.map((row) => (
                <div key={row.label}>
                  <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    {row.label}
                    <InfoTip text={row.tip} />
                  </dt>
                  <dd className="text-sm font-medium text-foreground tabular-nums">
                    {row.value}
                    {row.bar !== undefined && row.bar !== null && (
                      <span
                        aria-hidden
                        className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-muted"
                      >
                        <span
                          className="block h-full rounded-full bg-chart-line"
                          style={{ width: `${Math.max(3, row.bar * 100)}%` }}
                        />
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ms(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(0)} ms`;
}

function ratio(v: number | null, max: number | null): number | undefined {
  if (v === null || max === null || max <= 0) return undefined;
  return Math.min(1, v / max);
}

function quantile(sortedAsc: readonly number[], q: number): number | null {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.ceil(q * sortedAsc.length) - 1);
  return sortedAsc[Math.max(0, idx)] ?? null;
}
