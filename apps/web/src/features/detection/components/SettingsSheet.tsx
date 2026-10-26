"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Slider from "@radix-ui/react-slider";
import { Settings2, X } from "lucide-react";
import type { DetectionConfig, DeviceTier } from "@safeframe/core";
import { Button } from "@/components/ui";
import type { DeviceTierState } from "../hooks/useDeviceTier";

interface SettingsSheetProps {
  config: DetectionConfig;
  setConfig: (patch: Partial<DetectionConfig>) => void;
  device: DeviceTierState;
}

const RESPONSE_MODES: Array<{
  value: DetectionConfig["responseMode"];
  label: string;
  hint: string;
}> = [
  { value: "composite", label: "Composite", hint: "Blur + pause + calm card + parent gate (recommended)" },
  { value: "blur", label: "Blur", hint: "Instant full-frame blur; audio keeps playing" },
  { value: "pause", label: "Pause", hint: "Halt only — shows why pause alone isn't enough" },
  { value: "hide", label: "Hide", hint: "Strict mode: player fully covered" },
  { value: "skip", label: "Skip", hint: "Jump past flagged segments (needs a pre-scan)" },
];

const TIER_OPTIONS: Array<{ value: DeviceTier | null; label: string }> = [
  { value: null, label: "Auto" },
  { value: "low", label: "Low" },
  { value: "mid", label: "Mid" },
  { value: "high", label: "High" },
];

export function SettingsSheet({ config, setConfig, device }: SettingsSheetProps) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button variant="outline" aria-label="Detection settings">
          <Settings2 className="size-4" />
          <span className="hidden sm:inline">Settings</span>
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm" />
        <Dialog.Content className="sheet-in fixed top-0 right-0 z-50 flex h-dvh w-[min(92vw,400px)] flex-col border-l border-border bg-surface-elevated shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <Dialog.Title className="text-sm font-semibold text-foreground">
              Detection settings
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" aria-label="Close settings" className="size-11 p-0">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-7 overflow-y-auto p-5">
            <ThresholdSlider
              label="Flag threshold"
              hint="Windowed score that opens a flagged segment"
              value={config.flagThreshold}
              min={0.2}
              max={0.95}
              onChange={(v) =>
                setConfig({
                  flagThreshold: v,
                  // Hysteresis invariant: release stays below flag.
                  releaseThreshold: Math.min(config.releaseThreshold, v - 0.05),
                })
              }
            />
            <ThresholdSlider
              label="Release threshold"
              hint="Windowed score that closes a segment (hysteresis)"
              value={config.releaseThreshold}
              min={0.1}
              max={Math.max(0.15, config.flagThreshold - 0.05)}
              onChange={(v) => setConfig({ releaseThreshold: v })}
            />
            <ThresholdSlider
              label="Sampling rate"
              hint="Baseline frames per second (low-tier devices halve this)"
              value={config.samplingFps}
              min={0.25}
              max={2}
              step={0.25}
              format={(v) => `${v} fps`}
              onChange={(v) => setConfig({ samplingFps: v })}
            />
            <ThresholdSlider
              label="Tier-2 budget"
              hint="Max escalations per video before Tier-1 verdicts apply"
              value={config.tier2Budget}
              min={0}
              max={120}
              step={5}
              format={(v) => `${v} calls`}
              onChange={(v) => setConfig({ tier2Budget: Math.round(v) })}
            />

            <fieldset className="space-y-2.5">
              <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Response mode
              </legend>
              {RESPONSE_MODES.map((mode) => (
                <label
                  key={mode.value}
                  className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                    config.responseMode === mode.value
                      ? "border-primary bg-chart-area"
                      : "border-border hover:border-border-strong"
                  }`}
                >
                  <input
                    type="radio"
                    name="responseMode"
                    className="mt-0.5 accent-current"
                    checked={config.responseMode === mode.value}
                    onChange={() => setConfig({ responseMode: mode.value })}
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">
                      {mode.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {mode.hint}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            <fieldset className="space-y-2.5">
              <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Run mode
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {(["prescan", "live"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setConfig({ runMode: mode })}
                    className={`min-h-11 rounded-xl border px-3 text-sm font-medium transition-colors ${
                      config.runMode === mode
                        ? "border-primary bg-chart-area text-foreground"
                        : "border-border text-muted-foreground hover:border-border-strong"
                    }`}
                  >
                    {mode === "prescan" ? "Pre-scan" : "Live guard"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Pre-scan analyzes before playback (high assurance). Live guard
                scores during playback, the way a browser engine would.
              </p>

              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:border-border-strong">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-current"
                  checked={config.strictPreview}
                  onChange={(e) => setConfig({ strictPreview: e.target.checked })}
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    Strict: never show unscanned frames
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Creates no video element until a verdict exists, so not even
                    a blurred thumbnail is decoded. Off by default — the normal
                    flow blurs the player behind a consent gate instead.
                  </span>
                </span>
              </label>
            </fieldset>

            <fieldset className="space-y-2.5">
              <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Device tier override
              </legend>
              <div className="grid grid-cols-4 gap-2">
                {TIER_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => device.setOverride(opt.value)}
                    className={`min-h-11 rounded-xl border px-2 text-sm font-medium transition-colors ${
                      device.override === opt.value
                        ? "border-primary bg-chart-area text-foreground"
                        : "border-border text-muted-foreground hover:border-border-strong"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Auto-detected: <span className="font-medium">{device.estimatedTier}</span>.
                Forcing <span className="font-medium">Low</span> disables Tier 2
                entirely — its model is never downloaded.
              </p>
            </fieldset>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ThresholdSlider({
  label,
  hint,
  value,
  min,
  max,
  step = 0.01,
  format = (v: number) => v.toFixed(2),
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {format(value)}
        </span>
      </div>
      <Slider.Root
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => v !== undefined && onChange(v)}
        className="relative flex h-11 w-full touch-none items-center select-none"
      >
        <Slider.Track className="relative h-1.5 grow rounded-full bg-muted">
          <Slider.Range className="absolute h-full rounded-full bg-primary" />
        </Slider.Track>
        <Slider.Thumb
          aria-label={label}
          className="block size-5 rounded-full border border-border-strong bg-surface-elevated shadow-sm focus-visible:outline-2 focus-visible:outline-ring"
        />
      </Slider.Root>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
