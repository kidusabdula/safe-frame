"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { Pause, ShieldCheck } from "lucide-react";
import type { DetectionConfig } from "@safeframe/core";
import { Button } from "@/components/ui";

interface ResponseOverlayProps {
  mode: DetectionConfig["responseMode"];
  /** A flag is currently triggered at the playhead. */
  active: boolean;
  /** Parent approved playback for this flagged region. */
  overridden: boolean;
  onParentOverride: () => void;
}

/**
 * The response layer, layered over the video stage.
 *
 * blur      — GPU-composited CSS blur; content unreadable within one frame.
 * pause     — playback halt only (VideoStage side-effect); demonstrates why
 *             pause alone is insufficient: the flagged frame stays visible.
 * hide      — strongest block: stage fully covered.
 * composite — blur + pause + calm replacement card + parent gate (default).
 * skip      — no overlay; VideoStage jumps past flagged segments.
 */
export function ResponseOverlay({
  mode,
  active,
  overridden,
  onParentOverride,
}: ResponseOverlayProps) {
  const engaged = active && !overridden && mode !== "skip" && mode !== "pause";

  return (
    <AnimatePresence>
      {engaged && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden rounded-xl"
        >
          {(mode === "blur" || mode === "composite") && (
            <div
              className="absolute inset-0 backdrop-blur-[40px] backdrop-brightness-75"
              aria-hidden
            />
          )}
          {mode === "hide" && (
            <div className="absolute inset-0 bg-background" aria-hidden />
          )}

          {(mode === "composite" || mode === "hide") && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut", delay: 0.05 }}
              className="glass relative z-10 mx-4 flex max-w-sm flex-col items-center gap-3 rounded-card p-6 text-center"
            >
              <span className="flex size-12 items-center justify-center rounded-2xl bg-warning-soft text-warning">
                <Pause className="size-6" />
              </span>
              <p className="text-sm font-semibold text-foreground">
                This video is paused
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                This part of the video couldn&apos;t be verified as safe, so
                we&apos;ve paused it for now. Everything else is okay — a grown-up
                can take a look and continue if it&apos;s fine.
              </p>
              <ParentGate onUnlock={onParentOverride} />
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const HOLD_MS = 2000;

/**
 * Adult-gated dismissal: a press-and-hold control that a young child is
 * unlikely to complete deliberately — no scary language, no dead-end.
 */
function ParentGate({ onUnlock }: { onUnlock: () => void }) {
  const [open, setOpen] = useState(false);
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  const stopHold = () => {
    setHolding(false);
    setProgress(0);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    timerRef.current = null;
    frameRef.current = null;
  };

  const startHold = () => {
    setHolding(true);
    const t0 = performance.now();
    const tick = () => {
      const frac = Math.min(1, (performance.now() - t0) / HOLD_MS);
      setProgress(frac);
      if (frac < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    timerRef.current = window.setTimeout(() => {
      stopHold();
      setOpen(false);
      onUnlock();
    }, HOLD_MS);
  };

  useEffect(() => () => stopHold(), []);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? setOpen(true) : (stopHold(), setOpen(false)))}>
      <Dialog.Trigger asChild>
        <Button variant="outline" className="mt-1">
          <ShieldCheck className="size-4" /> I&apos;m a parent
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm" />
        <Dialog.Content className="glass fixed top-1/2 left-1/2 z-50 w-[min(92vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-card p-6 shadow-xl">
          <Dialog.Title className="text-sm font-semibold text-foreground">
            Parent check
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Press and hold the button for two seconds to resume playback of the
            flagged section.
          </Dialog.Description>
          <button
            type="button"
            onPointerDown={startHold}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            className="relative mt-4 flex min-h-12 w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-surface text-sm font-medium text-foreground select-none focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span
              className="absolute inset-y-0 left-0 bg-warning-soft transition-none"
              style={{ width: `${progress * 100}%` }}
              aria-hidden
            />
            <span className="relative">
              {holding ? "Keep holding…" : "Hold to continue"}
            </span>
          </button>
          <Dialog.Close asChild>
            <Button variant="ghost" className="mt-3 w-full">
              Never mind
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
