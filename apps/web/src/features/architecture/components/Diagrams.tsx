"use client";

import type { ReactNode } from "react";
import {
  ArrowRight,
  Cpu,
  Crop,
  Download,
  FileVideo,
  Layers,
  MonitorSmartphone,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react";

/**
 * Diagrams are hand-built from layout primitives and inline SVG rather than a
 * charting or mermaid dependency. Three reasons: they inherit the theme tokens
 * so light/dark is automatic, they reflow on a phone instead of scaling a fixed
 * canvas down to illegibility, and they add zero bytes to the bundle.
 */

/* ── Pipeline ─────────────────────────────────────────────────────────── */

interface Stage {
  label: string;
  detail: string;
  icon: typeof FileVideo;
}

const STAGES: Stage[] = [
  { label: "Ingest", detail: "File or URL — object URL, never uploaded", icon: FileVideo },
  { label: "Sample", detail: "Seek-driven, adaptive fps, densify on hits", icon: SlidersHorizontal },
  { label: "Preprocess", detail: "Downscale to 224×224 RGB on a canvas", icon: Crop },
  { label: "Classify", detail: "Tier 1 always · Tier 2 on borderline", icon: Layers },
  { label: "Aggregate", detail: "EWMA → hysteresis → segments", icon: Cpu },
  { label: "Respond", detail: "Verdict JSON + blur / pause / replace", icon: ShieldAlert },
];

export function PipelineFlow() {
  return (
    <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {STAGES.map((stage, i) => {
        const Icon = stage.icon;
        return (
          <li
            key={stage.label}
            className="relative flex gap-3 rounded-xl border border-border bg-surface p-3"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-chart-area text-[var(--chart-line)]">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="flex items-baseline gap-1.5">
                <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <span className="text-sm font-medium text-foreground">
                  {stage.label}
                </span>
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                {stage.detail}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ── Cascade decision ─────────────────────────────────────────────────── */

export function CascadeDecision() {
  const bands: Array<{
    range: string;
    zone: string;
    action: string;
    tone: "success" | "warning" | "danger";
    from: number;
    to: number;
  }> = [
    {
      range: "p < 0.35",
      zone: "Safe",
      action: "Accept. No further work — this is most of a normal video.",
      tone: "success",
      from: 0,
      to: 0.35,
    },
    {
      range: "0.35 ≤ p < 0.75",
      zone: "Borderline",
      action:
        "Escalate to Tier 2, budget permitting. The two opinions are then fused — Tier 2 dominates but cannot erase Tier 1's explicit-class evidence.",
      tone: "warning",
      from: 0.35,
      to: 0.75,
    },
    {
      range: "p ≥ 0.75",
      zone: "Flagged",
      action:
        "Flag directly. Tier 1 is already confident, so spending the big model here would buy nothing.",
      tone: "danger",
      from: 0.75,
      to: 1,
    },
  ];

  const toneClass = {
    success: { bar: "bg-success", text: "text-success", soft: "bg-success-soft" },
    warning: { bar: "bg-warning", text: "text-warning", soft: "bg-warning-soft" },
    danger: { bar: "bg-danger", text: "text-danger", soft: "bg-danger-soft" },
  } as const;

  return (
    <div className="space-y-4">
      {/* The band strip */}
      <div>
        <div className="flex h-8 w-full overflow-hidden rounded-lg border border-border">
          {bands.map((b) => (
            <div
              key={b.zone}
              style={{ width: `${(b.to - b.from) * 100}%` }}
              className={`flex items-center justify-center text-[10px] font-semibold ${toneClass[b.tone].soft} ${toneClass[b.tone].text}`}
            >
              {b.zone}
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
          <span>0.0</span>
          <span>0.35</span>
          <span>0.75</span>
          <span>1.0</span>
        </div>
      </div>

      <ul className="space-y-2">
        {bands.map((b) => (
          <li
            key={b.zone}
            className="flex gap-3 rounded-xl border border-border bg-surface p-3"
          >
            <span className={`w-1 shrink-0 rounded-full ${toneClass[b.tone].bar}`} />
            <span className="min-w-0">
              <span className="flex flex-wrap items-baseline gap-2">
                <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-foreground">
                  {b.range}
                </code>
                <span className={`text-xs font-semibold ${toneClass[b.tone].text}`}>
                  {b.zone}
                </span>
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                {b.action}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="rounded-xl bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
        The band is the whole design. Narrow it and you have a single-model
        system; widen it to everything and you have paid for an ensemble. Only
        the frames where the cheap model is genuinely unsure are worth the
        expensive model&apos;s time.
      </p>
    </div>
  );
}

/* ── Fallback chains ─────────────────────────────────────────────────── */

interface Chain {
  title: string;
  why: string;
  steps: string[];
  note?: string;
}

const CHAINS: Chain[] = [
  {
    title: "Model cascade",
    why: "Accuracy where it matters, cost where it doesn't.",
    steps: [
      "MobileNetV2 screener — every frame",
      "ViT-base verifier — borderline frames only",
      "Tier-1 verdict — once the per-video budget is spent",
    ],
  },
  {
    title: "Execution provider",
    why: "The same weights, whatever the device can actually run.",
    steps: [
      "WebGPU · fp16",
      "WebGPU · fp32",
      "WASM · int8",
    ],
    note:
      "Ordering here is load-bearing, not cosmetic. int8 weights on the WebGPU backend returned silent numeric garbage — no exception, just wrong answers — so float weights come first on WebGPU and int8 is reserved for WASM, where it is both correct and the bandwidth win it was designed to be.",
  },
  {
    title: "Graceful degradation",
    why: "A broken component must cost accuracy, never the whole scan.",
    steps: [
      "Full cascade",
      "Tier-2 worker dies mid-run → finish on Tier 1",
      "Low-tier device → Tier 2 never downloaded at all",
    ],
  },
  {
    title: "Capability detection",
    why: "Every browser API used has a documented fallback.",
    steps: [
      "requestVideoFrameCallback → timeupdate",
      "OffscreenCanvas → hidden canvas",
      "File System Access → localStorage",
      "CORS-readable URL → guided to file upload",
    ],
  },
];

export function FallbackChains() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {CHAINS.map((chain) => (
        <div
          key={chain.title}
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
        >
          <div>
            <p className="text-sm font-semibold text-foreground">{chain.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{chain.why}</p>
          </div>
          <ol className="space-y-1.5">
            {chain.steps.map((step, i) => (
              <li key={step} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-chart-area text-[9px] font-semibold tabular-nums text-[var(--chart-line)]">
                  {i + 1}
                </span>
                <span className="leading-relaxed text-muted-foreground">
                  {step}
                </span>
              </li>
            ))}
          </ol>
          {chain.note && (
            <p className="rounded-lg bg-warning-soft p-2.5 text-[11px] leading-relaxed text-foreground/80">
              {chain.note}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Device tiers ────────────────────────────────────────────────────── */

export function DeviceTiers() {
  const tiers = [
    {
      tier: "High",
      signals: "WebGPU present · ≥8 GB · fast micro-bench",
      sampling: "1 fps + densify",
      cascade: "Tier 1 + Tier 2 on WebGPU",
      download: "≈4 MB now, ViT lazily on first borderline frame",
    },
    {
      tier: "Mid",
      signals: "Not High or Low · no WebGPU, <8 GB or bench >50 ms",
      sampling: "1 fps + densify",
      cascade: "Tier 1 + Tier 2 (WebGPU if present, else WASM), same 40-frame budget",
      download: "≈4 MB now, ViT only if a frame is genuinely borderline",
    },
    {
      tier: "Low",
      signals: "<4 GB · ≤2 cores · slow micro-bench",
      sampling: "0.5 fps + densify",
      cascade: "Tier 1 only",
      download: "≈4 MB, total. The ViT is never fetched.",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3 text-xs text-muted-foreground">
        <MonitorSmartphone className="size-4 shrink-0" />
        <span>deviceMemory</span>
        <ArrowRight className="size-3" />
        <span>hardwareConcurrency</span>
        <ArrowRight className="size-3" />
        <span>WebGPU probe</span>
        <ArrowRight className="size-3" />
        <span className="font-medium text-foreground">
          5-frame live micro-benchmark
        </span>
        <ArrowRight className="size-3" />
        <span className="font-medium text-foreground">tier</span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Static hints alone are unreliable — <code>deviceMemory</code> is coarse and
        capped, and a phone can report four cores while thermally throttling. So
        the hints only propose a tier; a real measurement on the real hardware
        confirms it before anything large is downloaded.
      </p>
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Device tiers table"
      >
        <table className="w-full min-w-[560px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Tier</th>
              <th className="py-2 pr-3 font-medium">Signals</th>
              <th className="py-2 pr-3 font-medium">Sampling</th>
              <th className="py-2 pr-3 font-medium">Cascade</th>
              <th className="py-2 font-medium">Bytes over the wire</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t) => (
              <tr key={t.tier} className="border-b border-border/60 align-top">
                <td className="py-2.5 pr-3 font-semibold text-foreground">
                  {t.tier}
                </td>
                <td className="py-2.5 pr-3 text-muted-foreground">{t.signals}</td>
                <td className="py-2.5 pr-3 text-muted-foreground">{t.sampling}</td>
                <td className="py-2.5 pr-3 text-muted-foreground">{t.cascade}</td>
                <td className="py-2.5 text-muted-foreground">{t.download}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Model cards ─────────────────────────────────────────────────────── */

export function ModelCards() {
  const models = [
    {
      name: "MobileNetV2 NSFW",
      role: "Tier 1 — screener",
      source: "NSFWJS (open weights, bundled in the npm package)",
      params: "≈3.5 M",
      size: "≈4 MB quantized",
      classes: "5 classes: drawing · hentai · neutral · porn · sexy",
      runtime: "TensorFlow.js — WebGL, WASM fallback",
      network: "No third-party fetch. Same-origin chunks from the app's own build, cached for offline use after the first scan.",
    },
    {
      name: "ViT-base NSFW detector",
      role: "Tier 2 — verifier",
      source: "AdamCodd/vit-base-nsfw-detector via Transformers.js",
      params: "≈86 M",
      size: "84 MB int8 · 164 MB fp16 · 329 MB fp32",
      classes: "2 classes: sfw · nsfw",
      runtime: "ONNX Runtime Web — WebGPU, WASM fallback, in a Web Worker",
      network:
        "Fetched lazily on the first borderline frame, then persisted in the Cache API. Never fetched at all on a low-tier device.",
    },
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {models.map((m) => (
        <div
          key={m.name}
          className="space-y-3 rounded-xl border border-border bg-surface p-4"
        >
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {m.role}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">
              {m.name}
            </p>
          </div>
          <dl className="space-y-1.5 text-xs">
            {[
              ["Source", m.source],
              ["Parameters", m.params],
              ["Weights", m.size],
              ["Output", m.classes],
              ["Runtime", m.runtime],
              ["Network", m.network],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">{k}</dt>
                <dd className="min-w-0 leading-relaxed text-foreground/80">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

/* ── Offline / caching story ─────────────────────────────────────────── */

export function OfflineStory() {
  const steps: Array<{ title: string; body: string; icon: typeof Download }> = [
    {
      title: "First scan",
      body: "The app shell arrives on the first visit; the detection runtime and the 4 MB screener follow as same-origin chunks when a scan starts. They are part of the app's own build, not a model-hub download, so nothing third-party sits on the cold-start path.",
      icon: Download,
    },
    {
      title: "First borderline frame",
      body: "Only now is the ViT requested, and only on mid/high-tier devices. A video that is obviously safe or obviously explicit never triggers it, so most scans cost zero extra bytes.",
      icon: Layers,
    },
    {
      title: "Every visit after",
      body: "Weights are served from the Cache API and the shell from the service worker. Detection then runs with the radio off — which is the honest test of whether inference is really local.",
      icon: Cpu,
    },
  ];
  return (
    <ol className="grid gap-3 lg:grid-cols-3">
      {steps.map((s, i) => {
        const Icon = s.icon;
        return (
          <li
            key={s.title}
            className="space-y-2 rounded-xl border border-border bg-surface p-4"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-chart-area text-[var(--chart-line)]">
              <Icon className="size-4" />
            </span>
            <p className="text-sm font-medium text-foreground">
              <span className="mr-1.5 text-[10px] tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              {s.title}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {s.body}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/* ── Generic comparison table ────────────────────────────────────────── */

export function ComparisonTable({
  headers,
  rows,
  label,
}: {
  headers: string[];
  rows: Array<{ cells: ReactNode[]; chosen?: boolean }>;
  /** Names the scrollable region for keyboard and screen-reader users. */
  label: string;
}) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={label}>
      <table className="w-full min-w-[620px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            {headers.map((h) => (
              <th key={h} className="py-2 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={`border-b border-border/60 align-top ${
                row.chosen ? "bg-success-soft" : ""
              }`}
            >
              {row.cells.map((cell, j) => (
                <td
                  key={j}
                  className={`py-2.5 pr-3 leading-relaxed ${
                    j === 0
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
