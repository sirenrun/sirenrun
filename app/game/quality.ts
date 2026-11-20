/**
 * Render quality steps, best first. A slow GPU drops the pixel ratio before it loses bloom:
 * a softer picture still reads as neon, a flat one does not.
 *
 * The top step is 1.5, not 2: at 2 the bloom chain and MSAA buffers cost 78% more pixels than
 * at 1.5, which integrated laptop GPUs cannot hold, and at driving speed the difference is
 * hard to see.
 */
export const QUALITY = [
  { dpr: 1.5, post: true },
  { dpr: 1.25, post: true },
  { dpr: 1, post: true },
  { dpr: 1, post: false },
] as const;

export type Quality = (typeof QUALITY)[number];

const LOWEST_INDEX = QUALITY.length - 1;
const LOWEST: Quality = { dpr: 1, post: false };

/** The step at `index`, or the lowest one when out of range. */
export function qualityAt(index: number): Quality {
  return QUALITY[index] ?? LOWEST;
}

/** Starting step: no sharper than the screen can show. */
export function initialQuality(devicePixelRatio: number): number {
  const i = QUALITY.findIndex((q) => q.dpr <= Math.max(1, devicePixelRatio));
  return i === -1 ? LOWEST_INDEX : i;
}

/**
 * One step down on a frame-rate decline, one step up on an incline, clamped to the screen.
 * The lowest step is final: turning post back on rebuilds the composer and compiles its
 * shaders, a visible freeze, and a device that needed it off will need it off again soon.
 */
export function stepQuality(
  current: number,
  change: "decline" | "incline",
  devicePixelRatio: number,
): number {
  if (current >= LOWEST_INDEX) return LOWEST_INDEX;
  const best = initialQuality(devicePixelRatio);
  const next = change === "decline" ? current + 1 : current - 1;
  return Math.min(LOWEST_INDEX, Math.max(best, next));
}
