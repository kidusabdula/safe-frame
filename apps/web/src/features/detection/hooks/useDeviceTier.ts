"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
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

/** What the prerendered page assumes before the browser reports anything. */
const SERVER_SIGNALS: DeviceSignals = { hasWebGpu: false };

let browserSignals: DeviceSignals | null = null;

/** Read once: the device does not change during a visit. */
function readBrowserSignals(): DeviceSignals {
  if (!browserSignals) {
    const nav = navigator as ChromeNavigator;
    browserSignals = {
      deviceMemory: nav.deviceMemory,
      cores: nav.hardwareConcurrency,
      hasWebGpu: nav.gpu !== undefined,
    };
  }
  return browserSignals;
}

const noSubscription = () => () => {};

export function useDeviceTier(): DeviceTierState {
  const [override, setOverride] = useState<DeviceTier | null>(null);
  const signals = useSyncExternalStore(
    noSubscription,
    readBrowserSignals,
    () => SERVER_SIGNALS,
  );

  const estimatedTier = useMemo(() => resolveTier(signals), [signals]);

  return { signals, estimatedTier, override, setOverride };
}
