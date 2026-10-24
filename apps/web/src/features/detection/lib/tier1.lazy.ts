import type { Tier1 } from "./tier1";

/**
 * TensorFlow.js and NSFWJS are the heaviest code in the app, and the detector
 * page doesn't need them until a scan or the live guard starts. Loading the
 * Tier-1 adapter through a dynamic import keeps them out of the page's
 * initial JavaScript. `loadTier1` itself is unchanged and still memoised, so
 * the model loads once, and its load time is measured exactly as before.
 */
let modulePromise: Promise<typeof import("./tier1")> | null = null;

function tier1Module(): Promise<typeof import("./tier1")> {
  modulePromise ??= import("./tier1").catch((err: unknown) => {
    // Let a failed chunk fetch be retried on the next attempt.
    modulePromise = null;
    throw err;
  });
  return modulePromise;
}

/** Same contract as `loadTier1()`, via the lazily fetched module. */
export async function importTier1(): Promise<Tier1> {
  const { loadTier1 } = await tier1Module();
  return loadTier1();
}

/** Starts fetching the Tier-1 runtime code without loading the model. */
export function prefetchTier1Runtime(): void {
  void tier1Module().catch(() => {
    // A failed prefetch is harmless: the scan retries the import.
  });
}
