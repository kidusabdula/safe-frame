"use client";

import { useEffect, useMemo, useState } from "react";
import {
  resolveTier,
  type DeviceSignals,
  type DeviceTier,
} from "@safeframe/core";

/** Non-standard but widely shipped Chrome APIs, typed at the boundary. */
interface ChromeNavigator extends Navigator {
  deviceMemory?: number;
}

export interface DeviceTierState {
  signals: DeviceSignals;
  /** Estimate before the micro-benchmark refines it at run start. */
  estimatedTier: DeviceTier;
  /** Manual override from the settings sheet (e.g. simulate a low tier). */
  override: DeviceTier | null;
  setOverride: (tier: DeviceTier | null) => void;
}

export function useDeviceTier(): DeviceTierState {
  const [override, setOverride] = useState<DeviceTier | null>(null);
  const [signals, setSignals] = useState<DeviceSignals>({ hasWebGpu: false });

  useEffect(() => {
    const nav = navigator as ChromeNavigator;
    setSignals({
      deviceMemory: nav.deviceMemory,
      cores: nav.hardwareConcurrency,
      hasWebGpu: nav.gpu !== undefined,
    });
  }, []);

  const estimatedTier = useMemo(() => resolveTier(signals), [signals]);

  return { signals, estimatedTier, override, setOverride };
}
