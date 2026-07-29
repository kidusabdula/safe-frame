"use client";

import { useCallback, useRef, useState } from "react";

export interface BenchmarkRecord {
  tier1LoadMs: number | null;
  tier2LoadMs: number | null;
  microBenchMs: number | null;
  /** Long tasks (>50 ms main-thread blocks) observed during the last run. */
  longTaskCount: number;
  memoryMb: number | null;
}

const EMPTY: BenchmarkRecord = {
  tier1LoadMs: null,
  tier2LoadMs: null,
  microBenchMs: null,
  longTaskCount: 0,
  memoryMb: null,
};

interface ChromePerformance extends Performance {
  memory?: { usedJSHeapSize: number };
}

/**
 * Collects run-scoped engineering metrics for the benchmark panel.
 * Long tasks come from a PerformanceObserver; memory from the (Chrome-only)
 * performance.memory. Cells stay null where the platform doesn't report —
 * the panel renders them as "—", never an invented number.
 */
export function useBenchmark() {
  const [record, setRecord] = useState<BenchmarkRecord>(EMPTY);
  const observerRef = useRef<PerformanceObserver | null>(null);

  const beginRun = useCallback(() => {
    setRecord((r) => ({ ...EMPTY, tier1LoadMs: r.tier1LoadMs, tier2LoadMs: r.tier2LoadMs }));
    try {
      const observer = new PerformanceObserver((list) => {
        const n = list.getEntries().length;
        setRecord((r) => ({ ...r, longTaskCount: r.longTaskCount + n }));
      });
      observer.observe({ entryTypes: ["longtask"] });
      observerRef.current = observer;
    } catch {
      // longtask observation unsupported — leave the cell empty.
    }
  }, []);

  const endRun = useCallback(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    const memory = (performance as ChromePerformance).memory;
    if (memory) {
      setRecord((r) => ({
        ...r,
        memoryMb: memory.usedJSHeapSize / (1024 * 1024),
      }));
    }
  }, []);

  const note = useCallback((patch: Partial<BenchmarkRecord>) => {
    setRecord((r) => ({ ...r, ...patch }));
  }, []);

  return { record, beginRun, endRun, note };
}
