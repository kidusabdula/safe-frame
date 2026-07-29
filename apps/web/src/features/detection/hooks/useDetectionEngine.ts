"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  resolveConfig,
  resolveTier,
  samplingFpsForTier,
  DetectionConfigSchema,
  type DetectionConfig,
  type DetectionResult,
  type DeviceTier,
} from "@safeframe/core";
import {
  runDetection,
  CorsRestrictedError,
  type DetectionProgress,
  type TimelinePoint,
} from "../lib/runDetection";
import { loadTier1 } from "../lib/tier1";
import { createTier2Client, type Tier2Client } from "../lib/tier2.client";
import type { DeviceTierState } from "./useDeviceTier";
import type { useBenchmark } from "./useBenchmark";

export type EnginePhase =
  | "idle"
  | "loading-models"
  | "sampling"
  | "classifying"
  | "done"
  | "cancelled"
  | "error";

export interface EngineSource {
  kind: "file" | "url";
  url: string;
  label: string;
}

export interface EngineError {
  message: string;
  kind: "cors" | "generic";
}

interface EngineState {
  phase: EnginePhase;
  source: EngineSource | null;
  timeline: TimelinePoint[];
  progress: DetectionProgress | null;
  result: DetectionResult | null;
  error: EngineError | null;
  resolvedTier: DeviceTier | null;
  activeBackend: string | null;
}

type EngineAction =
  | { type: "select"; source: EngineSource }
  | { type: "clear-source" }
  | { type: "start" }
  | { type: "tier-resolved"; tier: DeviceTier; backend: string }
  | { type: "progress"; progress: DetectionProgress }
  | { type: "frame"; point: TimelinePoint }
  | { type: "done"; result: DetectionResult; backend: string }
  | { type: "cancelled" }
  | { type: "error"; error: EngineError }
  | { type: "reset-run" };

const initialState: EngineState = {
  phase: "idle",
  source: null,
  timeline: [],
  progress: null,
  result: null,
  error: null,
  resolvedTier: null,
  activeBackend: null,
};

function reducer(state: EngineState, action: EngineAction): EngineState {
  switch (action.type) {
    case "select":
      return { ...initialState, source: action.source };
    case "clear-source":
      return initialState;
    case "start":
      return {
        ...state,
        phase: "loading-models",
        timeline: [],
        progress: null,
        result: null,
        error: null,
      };
    case "tier-resolved":
      return { ...state, resolvedTier: action.tier, activeBackend: action.backend };
    case "progress":
      return { ...state, phase: action.progress.phase, progress: action.progress };
    case "frame":
      return { ...state, timeline: [...state.timeline, action.point] };
    case "done":
      return {
        ...state,
        phase: "done",
        result: action.result,
        activeBackend: action.backend,
      };
    case "cancelled":
      return { ...state, phase: "cancelled" };
    case "error":
      return { ...state, phase: "error", error: action.error };
    case "reset-run":
      return {
        ...state,
        phase: "idle",
        timeline: [],
        progress: null,
        result: null,
        error: null,
      };
  }
}

const CONFIG_STORAGE_KEY = "safeframe.config.v1";

function loadStoredConfig(): DetectionConfig {
  if (typeof window === "undefined") return resolveConfig();
  try {
    const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return resolveConfig();
    const parsed = DetectionConfigSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : resolveConfig();
  } catch {
    return resolveConfig();
  }
}

/**
 * THE state machine (documented decision: no TanStack Query / Redux — there
 * is no server state in this product; a local reducer models the run
 * lifecycle: idle → loading-models → sampling ⇄ classifying → done /
 * cancelled / error).
 */
export function useDetectionEngine(
  device: DeviceTierState,
  benchmark: ReturnType<typeof useBenchmark>,
) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [config, setConfigState] = useState<DetectionConfig>(loadStoredConfig);
  const abortRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const tier2Ref = useRef<Tier2Client | null>(null);

  const setConfig = useCallback((patch: Partial<DetectionConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Settings persistence is best-effort (private browsing etc.).
      }
      return next;
    });
  }, []);

  const releaseObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const selectFile = useCallback(
    (file: File) => {
      abortRef.current?.abort();
      releaseObjectUrl();
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      dispatch({ type: "select", source: { kind: "file", url, label: file.name } });
    },
    [releaseObjectUrl],
  );

  const selectUrl = useCallback(
    (url: string) => {
      abortRef.current?.abort();
      releaseObjectUrl();
      dispatch({ type: "select", source: { kind: "url", url, label: url } });
    },
    [releaseObjectUrl],
  );

  const clearSource = useCallback(() => {
    abortRef.current?.abort();
    releaseObjectUrl();
    dispatch({ type: "clear-source" });
  }, [releaseObjectUrl]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const resetRun = useCallback(() => {
    dispatch({ type: "reset-run" });
  }, []);

  const start = useCallback(async () => {
    const source = state.source;
    if (!source || state.phase === "loading-models") return;

    const abort = new AbortController();
    abortRef.current = abort;
    dispatch({ type: "start" });
    benchmark.beginRun();

    const scanVideo = document.createElement("video");
    scanVideo.muted = true;
    scanVideo.playsInline = true;
    scanVideo.preload = "auto";
    if (source.kind === "url") scanVideo.crossOrigin = "anonymous";
    scanVideo.src = source.url;

    try {
      await new Promise<void>((resolve, reject) => {
        scanVideo.addEventListener("loadedmetadata", () => resolve(), { once: true });
        scanVideo.addEventListener(
          "error",
          () =>
            reject(
              new CorsRestrictedError(),
            ),
          { once: true },
        );
      });

      const tier1 = await loadTier1();
      benchmark.note({ tier1LoadMs: tier1.loadMs });

      // 5-frame micro-benchmark on the loaded Tier-1 model refines the
      // device-tier estimate with how this hardware actually performs.
      const benchTimes: number[] = [];
      const blank = new ImageData(224, 224);
      for (let i = 0; i < 5; i++) {
        const t = performance.now();
        await tier1.classify(blank);
        benchTimes.push(performance.now() - t);
      }
      benchTimes.sort((a, b) => a - b);
      const benchMs = benchTimes[Math.floor(benchTimes.length / 2)] ?? 0;
      benchmark.note({ microBenchMs: benchMs });

      const tier =
        device.override ?? resolveTier({ ...device.signals, benchMs });
      dispatch({ type: "tier-resolved", tier, backend: tier1.backend });

      // Tier 2 is created lazily on first borderline frame, and NEVER on a
      // low-tier device — the 84–164 MB model is not even fetched there.
      let tier2: Tier2Client | null = null;
      if (tier !== "low") {
        let creating: Promise<Tier2Client> | null = null;
        const ensure = () => {
          creating ??= createTier2Client().then((client) => {
            tier2Ref.current = client;
            benchmark.note({ tier2LoadMs: client.loadMs });
            return client;
          });
          return creating;
        };
        const lazy: Tier2Client = {
          backend: "wasm",
          loadMs: 0,
          modelId: "vit-nsfw-int8",
          async classify(image) {
            const client = await ensure();
            lazy.backend = client.backend;
            return client.classify(image);
          },
          dispose() {
            tier2Ref.current?.dispose();
            tier2Ref.current = null;
          },
        };
        tier2 = lazy;
      }

      const effectiveConfig: DetectionConfig = {
        ...config,
        samplingFps: samplingFpsForTier(tier, config.samplingFps),
      };

      const result = await runDetection(
        scanVideo,
        effectiveConfig,
        { tier1, tier2, deviceTier: tier },
        {
          onProgress: (progress) => dispatch({ type: "progress", progress }),
          onFrame: (point) => dispatch({ type: "frame", point }),
        },
        abort.signal,
      );

      dispatch({ type: "done", result, backend: result.engine.backend });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        dispatch({ type: "cancelled" });
      } else if (err instanceof CorsRestrictedError) {
        dispatch({ type: "error", error: { message: err.message, kind: "cors" } });
      } else {
        dispatch({
          type: "error",
          error: {
            message: err instanceof Error ? err.message : "Detection failed",
            kind: "generic",
          },
        });
      }
    } finally {
      benchmark.endRun();
      scanVideo.removeAttribute("src");
      scanVideo.load();
    }
  }, [state.source, state.phase, config, device.override, device.signals, benchmark]);

  // Release resources when the feature unmounts.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      tier2Ref.current?.dispose();
      releaseObjectUrl();
    };
  }, [releaseObjectUrl]);

  const isRunning =
    state.phase === "loading-models" ||
    state.phase === "sampling" ||
    state.phase === "classifying";

  return {
    ...state,
    isRunning,
    config,
    setConfig,
    selectFile,
    selectUrl,
    clearSource,
    start,
    cancel,
    resetRun,
  };
}

export type DetectionEngine = ReturnType<typeof useDetectionEngine>;
