/**
 * Public surface of the detection feature — runDetection() is the product's
 * "API" (there are no HTTP endpoints anywhere in this repo, by design).
 */
export { runDetection, CorsRestrictedError } from "./lib/runDetection";
export type {
  DetectionCallbacks,
  DetectionDeps,
  DetectionProgress,
  TimelinePoint,
} from "./lib/runDetection";
export { loadTier1 } from "./lib/tier1";
export { createTier2Client } from "./lib/tier2.client";
export { DetectClient } from "./DetectClient";
