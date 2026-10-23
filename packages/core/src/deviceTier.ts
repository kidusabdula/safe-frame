export type DeviceTier = "low" | "mid" | "high";

export interface DeviceSignals {
  /** navigator.deviceMemory in GB — undefined where unsupported (Safari, RN). */
  deviceMemory?: number;
  /** navigator.hardwareConcurrency. */
  cores?: number;
  hasWebGpu: boolean;
  /** Median per-frame ms from the 5-frame Tier-1 micro-benchmark, if run. */
  benchMs?: number;
}

/**
 * Pure device-tier decision. Each app gathers the raw
 * signals; this function owns the policy so web and mobile cannot diverge.
 *
 * low  → Tier 1 only, 0.5 fps — the ~90 MB Tier-2 model is never downloaded.
 * mid  → full cascade (Tier 2 on WebGPU if present, else WASM), standard budget.
 * high → full cascade, WebGPU Tier 2.
 */
export function resolveTier(signals: DeviceSignals): DeviceTier {
  const { deviceMemory, cores, hasWebGpu, benchMs } = signals;

  // Hard low signals: little memory, few cores, or a slow micro-benchmark.
  if (deviceMemory !== undefined && deviceMemory < 4) return "low";
  if (cores !== undefined && cores <= 2) return "low";
  if (benchMs !== undefined && benchMs > 150) return "low";

  // High requires WebGPU plus no evidence of a weak device.
  if (
    hasWebGpu &&
    (deviceMemory === undefined || deviceMemory >= 8) &&
    (benchMs === undefined || benchMs <= 50)
  ) {
    return "high";
  }

  return "mid";
}

/** Sampling rate policy per tier (fps). */
export function samplingFpsForTier(tier: DeviceTier, baseFps: number): number {
  return tier === "low" ? Math.min(baseFps, 0.5) : baseFps;
}
