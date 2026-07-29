/**
 * Sorted timestamp queue driving the seek loop. Baseline timestamps are
 * enqueued up front; densification inserts extra timestamps (±densifyWindowS
 * at densifyFps) around borderline hits while the loop runs. Deduplication
 * uses a coarse key so densify passes never re-sample an analyzed instant.
 */
export class SeekQueue {
  private pending: number[] = [];
  private visited = new Set<number>();

  constructor(private readonly dedupeResolutionS = 0.25) {}

  private key(t: number): number {
    return Math.round(t / this.dedupeResolutionS);
  }

  enqueue(timestamps: number[]): number {
    let added = 0;
    for (const t of timestamps) {
      const k = this.key(t);
      if (this.visited.has(k)) continue;
      this.visited.add(k);
      // Insert keeping ascending order (binary search).
      let lo = 0;
      let hi = this.pending.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((this.pending[mid] ?? 0) < t) lo = mid + 1;
        else hi = mid;
      }
      this.pending.splice(lo, 0, t);
      added++;
    }
    return added;
  }

  next(): number | undefined {
    return this.pending.shift();
  }

  get remaining(): number {
    return this.pending.length;
  }

  get planned(): number {
    return this.visited.size;
  }
}

/** Baseline sampling plan: one timestamp per 1/fps across the duration. */
export function baselineTimestamps(durationS: number, fps: number): number[] {
  const step = 1 / fps;
  const out: number[] = [];
  // Offset by half a step so we sample mid-interval, not the poster frame.
  for (let t = step / 2; t < durationS; t += step) out.push(t);
  if (out.length === 0 && durationS > 0) out.push(durationS / 2);
  return out;
}

/** Densification plan around a hit: ±windowS at densifyFps, clamped to video. */
export function densifyTimestamps(
  centerS: number,
  windowS: number,
  densifyFps: number,
  durationS: number,
): number[] {
  const step = 1 / densifyFps;
  const out: number[] = [];
  for (let t = centerS - windowS; t <= centerS + windowS + 1e-6; t += step) {
    if (t >= 0 && t < durationS) out.push(t);
  }
  return out;
}
