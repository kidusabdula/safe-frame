"use client";

import { useCallback, useRef, useState } from "react";
import { MotionConfig } from "framer-motion";
import { AlertTriangle, Play, Radio, RotateCcw, ScanEye } from "lucide-react";
import type { DetectionConfig } from "@safeframe/core";
import { Button, Card } from "@/components/ui";
import type { useBenchmark } from "./hooks/useBenchmark";
import type { DetectionEngine } from "./hooks/useDetectionEngine";
import { BenchmarkPanel } from "./components/BenchmarkPanel";
import { PayloadViewer } from "./components/PayloadViewer";
import { ProgressHud } from "./components/ProgressHud";
import { ScanLogPanel } from "./components/ScanLogPanel";
import { ScoreTimeline } from "./components/ScoreTimeline";
import { SegmentNav } from "./components/SegmentNav";
import { VerdictCard, VerdictSkeleton } from "./components/VerdictCard";
import {
  VideoStage,
  type StageMode,
  type VideoStageHandle,
} from "./components/VideoStage";

interface ScanWorkspaceProps {
  engine: DetectionEngine;
  benchmark: ReturnType<typeof useBenchmark>;
}

/**
 * Everything the detector shows once a video is chosen: the player and its
 * response overlay, the scan controls and progress, the score timeline, the
 * verdict, the benchmark and the payload. It is a separate chunk, loaded when
 * a video is picked, so the page a visitor first sees ships none of it.
 *
 * Framer Motion animations in here follow the OS reduced-motion setting.
 */
export function ScanWorkspace({ engine, benchmark }: ScanWorkspaceProps) {
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

  const showTimeline = engine.timeline.length > 0 || engine.isRunning;
  const seek = useCallback((t: number) => {
    stageRef.current?.seek(t);
    setCurrentTimeS(t);
  }, []);

  // What the stage may show. Default flow mounts the player hard-blurred behind
  // a consent gate; strict mode refuses to create a video element at all.
  const stageMode: StageMode =
    engine.result !== null
      ? "verdict"
      : engine.config.strictPreview
        ? "strict"
        : "unscanned";
  const playable = stageMode !== "strict";

  const { source } = engine;
  if (!source) return null;

  return (
    <MotionConfig reducedMotion="user">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <VideoStage
            ref={stageRef}
            source={source}
            segments={engine.result?.flagged_segments ?? null}
            config={engine.config}
            mode={stageMode}
            onTimeChange={handleTimeChange}
            onPrescan={() => void engine.start()}
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
                <RunModeToggle
                  value={engine.config.runMode}
                  onChange={(runMode) => engine.setConfig({ runMode })}
                />
              </>
            )}
            <span className="ml-auto truncate text-xs text-muted-foreground">
              {source.label}
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
                currentTimeS={playable ? currentTimeS : undefined}
                onSeek={playable ? seek : undefined}
              />
              {engine.result && playable && (
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

          <ScanLogPanel />
        </div>
      </div>
    </MotionConfig>
  );
}

/**
 * Run mode belongs on the stage, not buried in a settings drawer. Hiding it
 * there made the live guard look broken on the deployed build: the default is
 * pre-scan, so a user who never opened Settings only ever saw the gate.
 */
function RunModeToggle({
  value,
  onChange,
}: {
  value: DetectionConfig["runMode"];
  onChange: (mode: DetectionConfig["runMode"]) => void;
}) {
  const modes: Array<{
    value: DetectionConfig["runMode"];
    label: string;
    icon: typeof ScanEye;
  }> = [
    { value: "prescan", label: "Pre-scan", icon: ScanEye },
    { value: "live", label: "Live guard", icon: Radio },
  ];
  return (
    <div
      role="group"
      aria-label="Run mode"
      className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1"
    >
      {modes.map((mode) => {
        const Icon = mode.icon;
        const active = value === mode.value;
        return (
          <button
            key={mode.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(mode.value)}
            className={`flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors ${
              active
                ? "bg-surface-elevated text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-3.5" />
            {mode.label}
          </button>
        );
      })}
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
      <p className="text-xs leading-relaxed text-foreground">
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
