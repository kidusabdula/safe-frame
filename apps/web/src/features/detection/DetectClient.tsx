"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as Tabs from "@radix-ui/react-tabs";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Cpu,
  FileVideo,
  Globe,
  HelpCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  WifiOff,
  Zap,
} from "lucide-react";
import type { DetectionResult } from "@safeframe/core";
import { Badge, Button, Card } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useBenchmark } from "./hooks/useBenchmark";
import { useDetectionEngine } from "./hooks/useDetectionEngine";
import { useDeviceTier } from "./hooks/useDeviceTier";
import { appendScanLog, readScanLog, type ScanLogEntry } from "./lib/scanLog";
import { BenchmarkPanel } from "./components/BenchmarkPanel";
import { PayloadViewer } from "./components/PayloadViewer";
import { ProgressHud } from "./components/ProgressHud";
import { ScanLogPanel } from "./components/ScanLogPanel";
import { ScoreTimeline } from "./components/ScoreTimeline";
import { SegmentNav } from "./components/SegmentNav";
import { SettingsSheet } from "./components/SettingsSheet";
import { UploadDropzone } from "./components/UploadDropzone";
import { UrlIngest } from "./components/UrlIngest";
import { VerdictCard, VerdictSkeleton } from "./components/VerdictCard";
import { VideoStage, type VideoStageHandle } from "./components/VideoStage";

export function DetectClient() {
  const device = useDeviceTier();
  const benchmark = useBenchmark();
  const engine = useDetectionEngine(device, benchmark);
  const stageRef = useRef<VideoStageHandle>(null);

  // Coarse playhead mirror for the timeline seeker + segment nav. The
  // response overlay keeps its own per-frame tracking inside VideoStage;
  // this one is throttled so the whole page doesn't re-render at 60 fps.
  const [currentTimeS, setCurrentTimeS] = useState(0);
  const lastTimeUpdateRef = useRef(0);
  const handleTimeChange = useCallback((t: number) => {
    const now = performance.now();
    if (now - lastTimeUpdateRef.current > 150) {
      lastTimeUpdateRef.current = now;
      setCurrentTimeS(t);
    }
  }, []);

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
    };
    void appendScanLog(entry).then(setScanLog);
  }, [engine, benchmark.record]);

  const showTimeline = engine.timeline.length > 0 || engine.isRunning;
  const seek = useCallback((t: number) => {
    stageRef.current?.seek(t);
    setCurrentTimeS(t);
  }, []);

  // The pre-scan gate: live mode reveals immediately (that's its job);
  // otherwise nothing renders until a verdict exists.
  const revealed = engine.config.runMode === "live" || engine.result !== null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between gap-3 py-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            aria-label="SafeFrame home"
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
            href="/#how"
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
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="space-y-2 text-center"
            >
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Check a video for inappropriate content
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                A two-tier ML cascade samples and classifies frames right here in
                your browser — on anything from low-end phones to high-end
                desktops. No uploads, no server, no account: your video never
                leaves this device.
              </p>
            </motion.div>

            <Tabs.Root defaultValue="file">
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
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-4">
              <VideoStage
                ref={stageRef}
                source={engine.source}
                segments={engine.result?.flagged_segments ?? null}
                config={engine.config}
                onTimeChange={handleTimeChange}
                revealed={revealed}
                scanning={engine.isRunning}
              />

              <div className="flex flex-wrap items-center gap-2">
                {!engine.isRunning && (
                  <>
                    <Button onClick={() => void engine.start()}>
                      <Play className="size-4" />
                      {engine.result ? "Re-scan" : "Pre-scan video"}
                    </Button>
                    <Button variant="outline" onClick={engine.clearSource}>
                      <RotateCcw className="size-4" /> Change video
                    </Button>
                  </>
                )}
                <span className="ml-auto truncate text-xs text-muted-foreground">
                  {engine.source.label}
                </span>
              </div>

              {engine.isRunning && (
                <ProgressHud
                  phase={engine.phase}
                  progress={engine.progress}
                  onCancel={engine.cancel}
                />
              )}

              {showTimeline && (
                <Card className="p-4">
                  <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Score timeline
                  </p>
                  <ScoreTimeline
                    timeline={engine.timeline}
                    segments={engine.result?.flagged_segments ?? null}
                    durationS={
                      engine.result?.video_duration_s ??
                      engine.progress?.durationS ??
                      0
                    }
                    config={engine.config}
                    currentTimeS={revealed ? currentTimeS : undefined}
                    onSeek={revealed ? seek : undefined}
                  />
                  {engine.result && revealed && (
                    <div className="mt-3 border-t border-border pt-3">
                      <SegmentNav
                        segments={engine.result.flagged_segments}
                        currentTimeS={currentTimeS}
                        durationS={engine.result.video_duration_s}
                        onSeek={seek}
                      />
                    </div>
                  )}
                </Card>
              )}
            </div>

            <div className="space-y-4">
              {engine.phase === "error" && engine.error ? (
                <ErrorCard
                  error={engine.error}
                  onRetry={() => void engine.start()}
                  onChangeSource={engine.clearSource}
                />
              ) : engine.isRunning ? (
                <VerdictSkeleton />
              ) : engine.result ? (
                <VerdictCard result={engine.result} onSeek={seek} />
              ) : (
                <Card className="p-5">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {engine.phase === "cancelled"
                      ? "Scan cancelled. Start again whenever you're ready."
                      : engine.config.runMode === "live"
                        ? "Live guard is armed — press play and frames are scored in real time. You can also pre-scan for a full segment map."
                        : "Run a pre-scan to get a verdict, category breakdown, and a map of any flagged segments before playback."}
                  </p>
                </Card>
              )}

              <BenchmarkPanel
                record={benchmark.record}
                result={engine.result}
                timeline={engine.timeline}
                resolvedTier={engine.resolvedTier}
                activeBackend={engine.activeBackend}
              />

              {engine.result && <PayloadViewer result={engine.result} />}

              <ScanLogPanel entries={scanLog} onEntriesChange={setScanLog} />
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        No server · no database · no telemetry — detection runs entirely on
        this device, from low-end to high-end hardware.
      </footer>
    </div>
  );
}

function ErrorCard({
  error,
  onRetry,
  onChangeSource,
}: {
  error: { message: string; kind: "cors" | "generic" };
  onRetry: () => void;
  onChangeSource: () => void;
}) {
  return (
    <Card className="space-y-3 border-danger/40 bg-danger-soft p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-danger text-primary-foreground">
          <AlertTriangle className="size-5" />
        </span>
        <p className="text-sm font-semibold text-danger">
          {error.kind === "cors"
            ? "This host doesn't permit local analysis"
            : "Something went wrong"}
        </p>
      </div>
      <p className="text-xs leading-relaxed text-foreground/80">
        {error.kind === "cors"
          ? "The video's host doesn't send CORS headers, so the browser won't let us read its frames locally. We could work around this with a proxy server — but SafeFrame's whole point is that no server ever sees your video. Try downloading the file and uploading it instead; that always works."
          : error.message}
      </p>
      <div className="flex gap-2">
        {error.kind !== "cors" && (
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button variant="outline" onClick={onChangeSource}>
          Choose another video
        </Button>
      </div>
    </Card>
  );
}
