"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
} from "react";
import { Radio, ScanEye } from "lucide-react";
import type { DetectionConfig, FlaggedSegment } from "@safeframe/core";
import { Badge } from "@/components/ui";
import type { EngineSource } from "../hooks/useDetectionEngine";
import { useLiveGuard } from "../hooks/useLiveGuard";
import { ResponseOverlay } from "./ResponseOverlay";

export interface VideoStageHandle {
  seek(timeS: number): void;
}

interface VideoStageProps {
  source: EngineSource;
  segments: readonly FlaggedSegment[] | null;
  config: DetectionConfig;
  onTimeChange?: (timeS: number) => void;
  /**
   * Pre-scan gate: until the scan has produced a verdict, no video element
   * is mounted at all — so not even a first-frame "poster" of unvetted
   * content ever reaches the screen. Live-guard mode reveals immediately
   * (scanning during playback is its entire point).
   */
  revealed: boolean;
  scanning?: boolean;
}

/** Small lead so the response engages a beat before the segment boundary. */
const SEGMENT_LEAD_S = 0.15;

function activeSegmentAt(
  segments: readonly FlaggedSegment[] | null,
  timeS: number,
): FlaggedSegment | null {
  if (!segments) return null;
  return (
    segments.find(
      (s) => timeS >= s.start_s - SEGMENT_LEAD_S && timeS < s.end_s,
    ) ?? null
  );
}

/**
 * The player plus the response layer. In pre-scan mode the flagged-segment
 * map drives responses; in live mode the guard hook scores presented frames
 * in real time. Time tracking uses requestVideoFrameCallback where available
 * so composite blur engages within one presented frame of a boundary.
 */
export const VideoStage = forwardRef<VideoStageHandle, VideoStageProps>(
  function VideoStage(
    { source, segments, config, onTimeChange, revealed, scanning = false },
    ref,
  ) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [timeS, setTimeS] = useState(0);
    const [override, setOverride] = useState<string | null>(null);

    const live = config.runMode === "live";
    const guard = useLiveGuard(videoRef, live, config);

    useImperativeHandle(ref, () => ({
      seek(t: number) {
        const v = videoRef.current;
        if (v) v.currentTime = t;
      },
    }));

    // Fine-grained playhead tracking (rVFC → fallback timeupdate).
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      let handle: number | null = null;
      const hasRvfc = typeof video.requestVideoFrameCallback === "function";
      const update = () => {
        setTimeS(video.currentTime);
        onTimeChange?.(video.currentTime);
        if (hasRvfc) handle = video.requestVideoFrameCallback(update);
      };
      if (hasRvfc) {
        handle = video.requestVideoFrameCallback(update);
      } else {
        video.addEventListener("timeupdate", update);
      }
      return () => {
        if (hasRvfc && handle !== null) video.cancelVideoFrameCallback(handle);
        else video.removeEventListener("timeupdate", update);
      };
    }, [onTimeChange, source.url]);

    const segment = activeSegmentAt(segments, timeS);
    const segmentKey = segment ? `${segment.start_s}` : null;
    const flagActive = live ? guard.guardActive : segment !== null;
    const overridden = flagActive
      ? override === (live ? "live" : segmentKey)
      : false;

    // Clear a segment-scoped override once the playhead leaves the segment,
    // so the next flagged region gates again.
    useEffect(() => {
      if (!live && override !== null && override !== segmentKey && segment === null) {
        setOverride(null);
      }
    }, [live, override, segmentKey, segment]);

    // Response side-effects: pause and skip.
    useEffect(() => {
      const video = videoRef.current;
      if (!video || !flagActive || overridden) return;
      if (config.responseMode === "skip" && segment) {
        video.currentTime = segment.end_s + 0.05;
        return;
      }
      if (config.responseMode === "composite" || config.responseMode === "pause") {
        if (!video.paused) video.pause();
      }
    }, [flagActive, overridden, config.responseMode, segment]);

    const handleOverride = useCallback(() => {
      setOverride(live ? "live" : segmentKey);
      void videoRef.current?.play();
    }, [live, segmentKey]);

    if (!revealed) {
      return (
        <div className="relative flex aspect-video w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-border bg-surface px-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <ScanEye className={`size-6 ${scanning ? "animate-pulse" : ""}`} />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              {scanning ? "Scanning before showing anything…" : "Preview hidden until scanned"}
            </p>
            <p className="mx-auto max-w-sm text-xs leading-relaxed text-muted-foreground">
              SafeFrame never displays a frame it hasn&apos;t checked — not even a
              thumbnail. {scanning ? "The player unlocks the moment the verdict is in." : "Run the pre-scan and the player unlocks with the verdict."}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="relative overflow-hidden rounded-xl border border-border bg-surface">
        {/* Live mode mounts the video immediately (scoring happens during
            playback), so until the guard model is warmed up and scoring,
            every frame — including the load thumbnail — stays hard-blurred. */}
        <video
          ref={videoRef}
          src={source.url}
          controls
          playsInline
          preload="metadata"
          crossOrigin={source.kind === "url" ? "anonymous" : undefined}
          className={`aspect-video w-full bg-surface object-contain transition-[filter] duration-300 ${
            live && !guard.ready ? "blur-3xl" : ""
          }`}
        />
        <ResponseOverlay
          mode={config.responseMode}
          active={flagActive}
          overridden={overridden}
          onParentOverride={handleOverride}
        />
        {live && (
          <div className="pointer-events-none absolute top-3 left-3 z-20">
            <Badge className="glass border-none">
              <Radio
                className={`size-3.5 ${guard.ready ? "text-success" : "text-muted-foreground"}`}
              />
              Live guard {guard.ready ? "active" : "warming up"}
              {guard.ready && (
                <span className="tabular-nums">
                  · {(guard.lastScore * 100).toFixed(0)}
                </span>
              )}
            </Badge>
          </div>
        )}
      </div>
    );
  },
);
