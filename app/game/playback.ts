import type { Arena } from "@sirenrun/sdk";
import { TICK_MS } from "@sirenrun/sim";

/**
 * Smooth playback of a 10 Hz onchain simulation.
 *
 * Snapshots arrive over a websocket with jitter, sometimes two at once and sometimes with a
 * tick missing. Rendering each one as it lands would stutter. Instead the renderer runs its
 * own clock a little behind the newest tick, advancing in real time and easing toward the
 * network rather than jumping, and blends between the snapshots on either side of it.
 */

/** How far behind the newest tick to render, in ticks. One tick hides normal jitter. */
export const RENDER_DELAY_TICKS = 1;
/** Further than this from the target, the clock jumps instead of easing (e.g. tab resumed). */
const SNAP_TICKS = 8;
/** Time constant of the drift correction. */
const CORRECTION_MS = 400;
const MAX_SNAPSHOTS = 48;

export interface Received {
  arena: Arena;
  /** `performance.now()` when the update arrived. */
  at: number;
}

/** Recent live snapshots of one run, ordered by sim tick. */
export class Timeline {
  private items: Received[] = [];
  private nonce = -1;

  push(arena: Arena, at: number): void {
    if (arena.nonce !== this.nonce) {
      this.items = [];
      this.nonce = arena.nonce;
    }
    const t = arena.sim.t;
    const last = this.items.at(-1);
    if (last !== undefined && t < last.arena.sim.t) return; // stale, out of order
    if (last !== undefined && t === last.arena.sim.t) {
      // Same tick: keep the newer data (status or inputs may have changed) but the old time.
      this.items[this.items.length - 1] = { arena, at: last.at };
      return;
    }
    this.items.push({ arena, at });
    if (this.items.length > MAX_SNAPSHOTS) this.items.shift();
  }

  get latest(): Received | undefined {
    return this.items.at(-1);
  }

  /** The snapshots around `tick` and how far between them it sits (0..1). */
  around(tick: number): { a: Arena; b: Arena; alpha: number } | null {
    const items = this.items;
    if (items.length === 0) return null;
    const first = items[0] as Received;
    if (tick <= first.arena.sim.t || items.length === 1) {
      return { a: first.arena, b: first.arena, alpha: 0 };
    }
    for (let i = items.length - 1; i > 0; i -= 1) {
      const a = (items[i - 1] as Received).arena;
      const b = (items[i] as Received).arena;
      if (tick >= a.sim.t) {
        const span = b.sim.t - a.sim.t;
        const alpha = span <= 0 ? 1 : Math.min(1, (tick - a.sim.t) / span);
        return { a, b, alpha };
      }
    }
    return { a: first.arena, b: first.arena, alpha: 0 };
  }
}

/** The renderer's tick clock. Fractional ticks; never ahead of the newest snapshot. */
export class PlaybackClock {
  tick: number | null = null;

  /** Where the clock should be: the newest tick minus the delay, advanced by elapsed time. */
  static target(latestTick: number, latestAt: number, now: number): number {
    const sinceArrival = Math.max(0, now - latestAt) / TICK_MS;
    return Math.min(latestTick, latestTick - RENDER_DELAY_TICKS + sinceArrival);
  }

  advance(dtMs: number, latestTick: number, latestAt: number, now: number): number {
    const target = PlaybackClock.target(latestTick, latestAt, now);
    if (this.tick === null || Math.abs(target - this.tick) > SNAP_TICKS) {
      this.tick = target;
      return this.tick;
    }
    const dt = Math.max(0, Math.min(dtMs, 250));
    let tick = this.tick + dt / TICK_MS;
    tick += (target - tick) * Math.min(1, dt / CORRECTION_MS);
    this.tick = Math.min(tick, latestTick);
    return this.tick;
  }

  reset(): void {
    this.tick = null;
  }
}

export interface Sample {
  tick: number;
  distance: number;
  carX: number;
  policeGap: number;
  speed: number;
  /** Discrete state comes from the newer snapshot. */
  arena: Arena;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Continuous values at `tick`, blended between the snapshots around it. */
export function sample(timeline: Timeline, tick: number): Sample | null {
  const found = timeline.around(tick);
  if (found === null) return null;
  const { a, b, alpha } = found;
  return {
    tick,
    distance: lerp(a.sim.distance, b.sim.distance, alpha),
    carX: lerp(a.sim.carX, b.sim.carX, alpha),
    policeGap: lerp(a.sim.policeGap, b.sim.policeGap, alpha),
    speed: lerp(a.sim.speed, b.sim.speed, alpha),
    arena: b,
  };
}
