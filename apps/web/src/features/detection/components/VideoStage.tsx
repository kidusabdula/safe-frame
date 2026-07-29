"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Eye, Play, Radio, ScanEye } from "lucide-react";
import type { DetectionConfig, FlaggedSegment } from "@safeframe/core";
import { Badge, Button } from "@/components/ui";
import type { EngineSource } from "../hooks/useDetectionEngine";
import { useLiveGuard } from "../hooks/useLiveGuard";
import { ResponseOverlay } from "./ResponseOverlay";

export interface VideoStageHandle {
  seek(timeS: number): void;
}

/**
 * What the stage is allowed to show right now.
 *
 * `strict`   — no <video> element exists at all, so not one unvetted pixel is
 *              ever decoded to screen. Opt-in via config.strictPreview.
 * `unscanned`— the player is mounted but hard-blurred behind a consent gate.
 *              Choosing to watch arms the live guard; nothing legible appears
 *              before the guard is warm.
 * `verdict`  — a pre-scan finished, so the flagged-segment map drives responses.
 */
export type StageMode = "strict" | "unscanned" | "verdict";

interface VideoStageProps {
  source: EngineSource;
  segments: readonly FlaggedSegment[] | null;
  config: DetectionConfig;
  mode: StageMode;
  scanning?: boolean;
  onTimeChange?: (timeS: number) => void;
  /** Start a pre-scan from the consent gate. */
  onPrescan?: () => void;
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
 * The player plus the response layer.
 *
 * Two independent detection paths feed the same response UI: a pre-scan's
 * segment map (exact, computed before playback) and the live guard (reactive,
 * scoring presented frames). Whichever is active, the response is the same, so
 * the demo tells one story.
 */
export const VideoStage = forwardRef<VideoStageHandle, VideoStageProps>(
  function VideoStage(
    { source, segments, config, mode, scanning = false, onTimeChange, onPrescan },
    ref,
  ) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [timeS, setTimeS] = useState(0);
    const [override, setOverride] = useState<string | null>(null);
    const [consented, setConsented] = useState(false);

    const unscanned = mode === "unscanned";
    // The guard runs whenever unvetted frames could reach the screen: either the
    // user chose live mode, or they are watching something that was never
    // pre-scanned. Watching unscanned content *is* live guarding.
    const guardEnabled = unscanned || config.runMode === "live";
    const guard = useLiveGuard(videoRef, guardEnabled, config);

    // A new source is a new decision — never inherit consent across videos.
    useEffect(() => {
      setConsented(false);
      setOverride(null);
    }, [source.url]);

    useImperativeHandle(ref, () => ({
      seek(t: number) {
        const v = videoRef.current;
        if (v) v.currentTime = t;
      },
    }));

    // Fine-grained playhead tracking (rVFC → fallback timeupdate).
    //
    // `mode` MUST stay in the dependency list. In strict mode the early return
    // below mounts no <video>, so this effect bails; when a verdict arrives and
    // the element finally mounts, only a dependency change re-runs it. Without
    // `mode` the playhead stayed frozen at 0 forever after a pre-scan, which
    // silently disabled every segment-driven response.
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
    }, [onTimeChange, source.url, mode]);

    const segment = activeSegmentAt(segments, timeS);
    const segmentKey = segment ? `seg:${segment.start_s}` : null;
    const guardActive = guardEnabled && guard.guardActive;
    const flagActive = guardActive || segment !== null;
    const activeKey = guardActive ? "guard" : segmentKey;
    const overridden = flagActive && override !== null && override === activeKey;

    // Per-episode gating. A parent approving one detection must not disarm the
    // guard for the rest of the video, so the override dies with its episode:
    // segment overrides clear when the playhead leaves the segment, and guard
    // overrides clear the moment the guard releases.
    useEffect(() => {
      if (!guardActive) {
        setOverride((o) => (o === "guard" ? null : o));
      }
    }, [guardActive]);

    useEffect(() => {
      setOverride((o) =>
        o !== null && o.startsWith("seg:") && o !== segmentKey ? null : o,
      );
    }, [segmentKey]);

    // Nothing plays behind the consent gate.
    useEffect(() => {
      if (unscanned && !consented) videoRef.current?.pause();
    }, [unscanned, consented]);

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
      setOverride(guardActive ? "guard" : segmentKey);
      void videoRef.current?.play();
    }, [guardActive, segmentKey]);

    const handleWatch = useCallback(() => {
      setConsented(true);
      void videoRef.current?.play();
    }, []);

    if (mode === "strict") {
      return (
        <div className="relative flex aspect-video w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-border bg-surface px-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <ScanEye className={`size-6 ${scanning ? "animate-pulse" : ""}`} />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              {scanning
                ? "Scanning before showing anything…"
                : "Strict mode — preview hidden until scanned"}
            </p>
            <p className="mx-auto max-w-sm text-xs leading-relaxed text-muted-foreground">
              No video element is created at all, so not even a thumbnail is
              decoded.{" "}
              {scanning
                ? "The player unlocks the moment the verdict is in."
                : "Run the pre-scan and the player unlocks with the verdict."}
            </p>
          </div>
        </div>
      );
    }

    // Baseline blur: applied to everything unvetted. It clears only once the
    // user has consented AND the guard is actually scoring frames — a warming-up
    // guard is not protection.
    const baselineBlurred = unscanned && (!consented || !guard.ready);

    return (
      <div className="relative overflow-hidden rounded-xl border border-border bg-surface">
        <video
          ref={videoRef}
          src={source.url}
          controls={!baselineBlurred}
          playsInline
          preload="metadata"
          crossOrigin={source.kind === "url" ? "anonymous" : undefined}
          className={`aspect-video w-full bg-surface object-contain transition-[filter] duration-300 ${
            baselineBlurred ? "blur-3xl" : ""
          }`}
        />

        <AnimatePresence>
          {unscanned && !consented && (
            <UnscannedGate
              scanning={scanning}
              onPrescan={onPrescan}
              onWatch={handleWatch}
            />
          )}
        </AnimatePresence>

        <ResponseOverlay
          mode={config.responseMode}
          active={flagActive}
          overridden={overridden}
          onParentOverride={handleOverride}
        />

        {guardEnabled && (
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

/**
 * The consent gate over an unscanned video.
 *
 * The honest framing matters here: we are not claiming the video is safe, we are
 * telling the viewer it has not been checked and letting them choose between
 * certainty (pre-scan) and immediacy (live guard). Either way the frames stay
 * blurred until something is watching them.
 */
function UnscannedGate({
  scanning,
  onPrescan,
  onWatch,
}: {
  scanning: boolean;
  onPrescan?: () => void;
  onWatch: () => void;
}) {
  return (
    <motion.div
      key="gate"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="absolute inset-0 z-30 flex items-center justify-center px-4"
    >
      <div className="absolute inset-0 bg-background/40" aria-hidden />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="glass relative z-10 flex w-full max-w-md flex-col items-center gap-3 rounded-card p-6 text-center"
      >
        <span className="flex size-12 items-center justify-center rounded-2xl bg-warning-soft text-warning">
          <AlertTriangle className="size-6" />
        </span>
        <p className="text-sm font-semibold text-foreground">
          This video hasn&apos;t been checked yet
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          It stays blurred until you decide. Pre-scan it for a full map of any
          flagged moments before you watch, or start watching with the live guard
          on — it scores frames as they play and blurs anything it flags.
        </p>
        <div className="mt-1 flex w-full flex-col gap-2 sm:flex-row">
          {onPrescan && (
            <Button
              onClick={onPrescan}
              disabled={scanning}
              className="flex-1 justify-center"
            >
              <ScanEye className="size-4" />
              {scanning ? "Scanning…" : "Pre-scan first"}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={onWatch}
            disabled={scanning}
            className="flex-1 justify-center"
          >
            <Eye className="size-4" /> Watch with live guard
          </Button>
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Play className="size-3" />
          Live guard reacts within a frame or two — pre-scanning is the stricter
          choice.
        </p>
      </motion.div>
    </motion.div>
  );
}
