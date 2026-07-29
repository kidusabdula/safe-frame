"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  combineClassScores,
  createAggregator,
  type DetectionConfig,
} from "@safeframe/core";
import { createFrameGrabber } from "../lib/preprocess";
import { loadTier1 } from "../lib/tier1";

interface LiveGuardState {
  guardActive: boolean;
  lastScore: number;
  /**
   * True only once a frame has actually been classified — not merely when the
   * model finished loading. The stage gates its baseline blur on this, and a
   * guard that has scored nothing yet is not protection.
   */
  ready: boolean;
}

/** Minimum gap between live classifications — keeps playback smooth. */
const LIVE_INTERVAL_MS = 350;

/**
 * Live guard mode: scores frames DURING playback via
 * requestVideoFrameCallback (falling back to timeupdate) and drives the
 * response overlay through the same EWMA/hysteresis logic as pre-scan.
 * Tier 1 only — live mode favors latency; the cascade belongs to pre-scan.
 */
export function useLiveGuard(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  config: DetectionConfig,
): LiveGuardState {
  const [state, setState] = useState<LiveGuardState>({
    guardActive: false,
    lastScore: 0,
    ready: false,
  });
  const busyRef = useRef(false);
  const lastRunRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setState({ guardActive: false, lastScore: 0, ready: false });
      return;
    }
    const video = videoRef.current;
    if (!video) return;

    let disposed = false;
    const aggregator = createAggregator(config);
    const grabber = createFrameGrabber();

    const classifyCurrent = async () => {
      if (busyRef.current || video.paused || video.ended) return;
      const now = performance.now();
      if (now - lastRunRef.current < LIVE_INTERVAL_MS) return;
      lastRunRef.current = now;
      busyRef.current = true;
      try {
        const tier1 = await loadTier1();
        if (disposed) return;
        const image = grabber.grab(video);
        const categories = await tier1.classify(image);
        if (disposed) return;
        const p = combineClassScores(categories, config.sexyWeight);
        const feedback = aggregator.push({
          timestamp_s: video.currentTime,
          p,
          categories,
        });
        setState({
          guardActive: feedback.guardActive,
          lastScore: feedback.windowedScore,
          ready: true,
        });
      } catch {
        // A single failed frame shouldn't kill the guard loop.
      } finally {
        busyRef.current = false;
      }
    };

    // Preferred: rVFC fires per presented frame. Fallback: timeupdate (~4 Hz).
    let rvfcHandle: number | null = null;
    const hasRvfc = typeof video.requestVideoFrameCallback === "function";

    const rvfcLoop = () => {
      if (disposed) return;
      void classifyCurrent();
      rvfcHandle = video.requestVideoFrameCallback(rvfcLoop);
    };

    if (hasRvfc) {
      rvfcHandle = video.requestVideoFrameCallback(rvfcLoop);
    } else {
      video.addEventListener("timeupdate", classifyCurrent);
    }
    // Warm the model up front so the first scored frame isn't also paying the
    // load cost. `ready` still waits for a real classification.
    void loadTier1();

    return () => {
      disposed = true;
      if (hasRvfc && rvfcHandle !== null) {
        video.cancelVideoFrameCallback(rvfcHandle);
      } else {
        video.removeEventListener("timeupdate", classifyCurrent);
      }
    };
  }, [enabled, videoRef, config]);

  return state;
}
