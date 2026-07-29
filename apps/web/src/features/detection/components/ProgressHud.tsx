"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui";
import type { DetectionProgress } from "../lib/runDetection";
import type { EnginePhase } from "../hooks/useDetectionEngine";
import { formatTime } from "./ScoreTimeline";

interface ProgressHudProps {
  phase: EnginePhase;
  progress: DetectionProgress | null;
  onCancel: () => void;
}

const phaseLabel: Partial<Record<EnginePhase, string>> = {
  "loading-models": "Preparing models on this device",
  sampling: "Sampling frames",
  classifying: "Classifying",
};

export function ProgressHud({ phase, progress, onCancel }: ProgressHudProps) {
  const fraction =
    progress && progress.framesPlanned > 0
      ? Math.min(1, progress.framesDone / progress.framesPlanned)
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass flex items-center gap-4 rounded-card p-4"
      role="status"
      aria-live="polite"
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-medium text-foreground">
            {phaseLabel[phase] ?? "Working"}
            {progress && phase !== "loading-models" && (
              <span className="ml-2 font-normal text-muted-foreground">
                @ {formatTime(progress.currentTimeS)}
              </span>
            )}
          </p>
          {progress && phase !== "loading-models" && (
            <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {progress.framesDone}/{progress.framesPlanned} frames ·{" "}
              {Number.isFinite(progress.throughputFps)
                ? progress.throughputFps.toFixed(1)
                : "0.0"}{" "}
              f/s
              {progress.tier2Escalations > 0 &&
                ` · ${progress.tier2Escalations} tier-2`}
            </p>
          )}
        </div>
        {phase === "loading-models" ? (
          <div className="skeleton h-2 w-full" />
        ) : (
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-primary"
              animate={{ width: `${fraction * 100}%` }}
              transition={{ ease: "easeOut", duration: 0.25 }}
            />
          </div>
        )}
      </div>
      <Button
        variant="outline"
        onClick={onCancel}
        aria-label="Cancel analysis"
        className="shrink-0"
      >
        <X className="size-4" /> Cancel
      </Button>
    </motion.div>
  );
}
