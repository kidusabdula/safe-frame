"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";

/**
 * Makes every Framer Motion animation below it honour the OS-level
 * prefers-reduced-motion setting. CSS animations and transitions follow the
 * same setting through globals.css.
 */
export function ReducedMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
