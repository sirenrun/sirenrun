import type { Market } from "@sirenrun/sdk";
import {
  GAP_MAX,
  LINES,
  POLICE_ACCEL_DEN,
  POLICE_ACCEL_NUM,
  POLICE_BASE,
  SPEED_MAX,
  STAGING_TICKS,
  TICK_MS,
} from "@sirenrun/sim";

/** `M:SS.t` for a (fractional) live tick. */
export function formatClock(tick: number): string {
  const tenths = Math.max(0, Math.floor(tick));
  const seconds = Math.floor(tenths / 10);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}.${tenths % 10}`;
}

/** Whole seconds left in staging, counting 10 → 0. */
export function stagingSecondsLeft(phaseTicks: number): number {
  return Math.max(0, Math.ceil(((STAGING_TICKS - phaseTicks) * TICK_MS) / 1000));
}

export type GapLevel = "safe" | "warn" | "danger";

/** Cyan above 2000, amber 800 to 2000, red below 800 (visual-design.md). */
export function gapLevel(gap: number): GapLevel {
  if (gap > 2000) return "safe";
  return gap >= 800 ? "warn" : "danger";
}

/** Gap meter fill, 0..1. */
export const gapFill = (gap: number) => Math.max(0, Math.min(1, gap / GAP_MAX));

/**
 * Heat, 1..5 segments: police speed relative to the car's cruise cap. They start at about half
 * the car's top speed and match it at 87.5 s, when every segment is lit.
 */
export function heatSegments(tick: number): number {
  const police = POLICE_BASE + (Math.max(0, tick) * POLICE_ACCEL_NUM) / POLICE_ACCEL_DEN;
  const ratio = police / SPEED_MAX;
  return Math.max(1, Math.min(5, Math.ceil((ratio - 0.45) / 0.11)));
}

/** Where each line sits on the run rail, 0..1 of the 90 s line plus a margin. */
export const RAIL_END = (LINES[LINES.length - 1] ?? 900) * 1.1;
export const railPosition = (tick: number) => Math.max(0, Math.min(1, tick / RAIL_END));

/** Markets that resolved YES since `before`, for the "line crossed" flash. */
export function newlyCrossed(before: readonly Market[] | null, after: readonly Market[]): number[] {
  if (before === null) return [];
  return after.flatMap((m, i) => (m.status === "yes" && before[i]?.status === "open" ? [i] : []));
}

/** Seconds of a line, for labels: 300 → "30s". */
export const lineLabel = (line: number) => `${Math.round((line * TICK_MS) / 1000)}s`;
