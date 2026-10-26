"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Cpu,
  FileVideo,
  Globe,
  HelpCircle,
  ShieldCheck,
  WifiOff,
  Zap,
} from "lucide-react";
import type { DetectionResult } from "@safeframe/core";
import { Badge, SkeletonBlock } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useBenchmark } from "./hooks/useBenchmark";
import { useDetectionEngine } from "./hooks/useDetectionEngine";
import { useDeviceTier } from "./hooks/useDeviceTier";
import { appendScanLog, readScanLog, type ScanLogEntry } from "./lib/scanLog";
import { ScanLogPanel } from "./components/ScanLogPanel";
import { SettingsSheet } from "./components/SettingsSheet";
import { UploadDropzone } from "./components/UploadDropzone";
import { UrlIngest } from "./components/UrlIngest";

// The scan workspace (player, overlays, timeline, verdict, benchmark) only
// appears once a video is chosen, so it loads then instead of with the page.
// Pointing at or focusing the picker starts the download early.
const ScanWorkspace = dynamic(
  () => import("./ScanWorkspace").then((m) => m.ScanWorkspace),
  { loading: WorkspaceLoading },
);
const preloadWorkspace = () => {
  void import("./ScanWorkspace").catch(() => {
    // A failed preload is harmless: rendering the workspace retries it.
  });
};

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

export function DetectClient() {
  const device = useDeviceTier();
  const benchmark = useBenchmark();
  const engine = useDetectionEngine(device, benchmark);

  // Scan log: capture every completed result exactly once.
  const [scanLog, setScanLog] = useState<ScanLogEntry[]>([]);
  useEffect(() => {
    setScanLog(readScanLog());
  }, []);
  const recordedRef = useRef<DetectionResult | null>(null);
  useEffect(() => {
    const { result, source, resolvedTier, activeBackend } = engine;
    if (!result || !source || recordedRef.current === result) return;
    recordedRef.current = result;
    const entry: ScanLogEntry = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      label: source.label,
      sourceKind: source.kind,
      config: engine.config,
      result,
      benchmark: {
        tier: resolvedTier,
        backend: activeBackend,
        tier1LoadMs: benchmark.record.tier1LoadMs,
        tier2LoadMs: benchmark.record.tier2LoadMs,
        microBenchMs: benchmark.record.microBenchMs,
        longTaskCount: benchmark.record.longTaskCount,
        memoryMb: benchmark.record.memoryMb,
      },
      // Rounded to 4 dp: enough precision to replay the aggregation exactly,
      // small enough that a long scan's log stays human-readable.
      frames: engine.timeline.map((pt) => ({
        t: round4(pt.timestamp_s),
        p: round4(pt.p),
        w: round4(pt.windowedScore),
        tier2: pt.tier2Score === null ? null : round4(pt.tier2Score),
        porn: round4(pt.categories.porn),
        hentai: round4(pt.categories.hentai),
        sexy: round4(pt.categories.sexy),
        neutral: round4(pt.categories.neutral),
        drawing: round4(pt.categories.drawing),
      })),
    };
    void appendScanLog(entry).then(setScanLog);
  }, [engine, benchmark.record]);


  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between gap-3 py-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="group flex items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform group-hover:scale-105">
              <ShieldCheck className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold tracking-tight text-foreground">
                SafeFrame
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                Video content detection
              </span>
            </span>
          </Link>
          <span className="hidden items-center gap-1.5 md:flex">
            <Badge>
              <WifiOff className="size-3" /> 100% on-device
            </Badge>
            {engine.resolvedTier && (
              <Badge>
                <Cpu className="size-3" /> {engine.resolvedTier} tier
              </Badge>
            )}
            {engine.activeBackend && (
              <Badge>
                <Zap className="size-3" /> {engine.activeBackend}
              </Badge>
            )}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/architecture"
            className="hidden min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            <HelpCircle className="size-4" /> How it works
          </Link>
          <SettingsSheet
            config={engine.config}
            setConfig={engine.setConfig}
            device={device}
          />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 pb-10">
        {!engine.source ? (
          <div className="mx-auto max-w-xl space-y-6 pt-8 sm:pt-16">
            <div className="space-y-2 text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Check a video for inappropriate content
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                A two-tier ML cascade samples and classifies frames right here in
                your browser — on anything from low-end phones to high-end
                desktops. No uploads, no server, no account: your video never
                leaves this device.
              </p>
            </div>

            <Tabs.Root
              defaultValue="file"
              onPointerEnter={preloadWorkspace}
              onFocus={preloadWorkspace}
              onDragEnter={preloadWorkspace}
            >
              <Tabs.List className="mb-4 grid grid-cols-2 rounded-xl border border-border bg-surface p-1">
                <Tabs.Trigger
                  value="file"
                  className="flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-medium text-muted-foreground transition-colors data-[state=active]:bg-surface-elevated data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  <FileVideo className="size-4" /> Upload file
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="url"
                  className="flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-medium text-muted-foreground transition-colors data-[state=active]:bg-surface-elevated data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  <Globe className="size-4" /> From URL
                </Tabs.Trigger>
              </Tabs.List>
              <Tabs.Content value="file">
                <UploadDropzone onFile={engine.selectFile} />
              </Tabs.Content>
              <Tabs.Content value="url">
                <UrlIngest onUrl={engine.selectUrl} />
              </Tabs.Content>
            </Tabs.Root>

            <ScanLogPanel entries={scanLog} onEntriesChange={setScanLog} />
          </div>
        ) : (
          <ScanWorkspace
            engine={engine}
            benchmark={benchmark}
            scanLog={scanLog}
            onScanLogChange={setScanLog}
          />
        )}
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        No server · no database · no telemetry — detection runs entirely on
        this device, from low-end to high-end hardware.
      </footer>
    </div>
  );
}


/** Placeholder with the workspace's shape while its chunk downloads. */
function WorkspaceLoading() {
  return (
    <div
      role="status"
      aria-label="Loading the scan workspace"
      className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_380px]"
    >
      <SkeletonBlock className="aspect-video w-full rounded-card" />
      <SkeletonBlock className="h-40 w-full rounded-card" />
    </div>
  );
}
