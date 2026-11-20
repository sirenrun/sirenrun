/**
 * Render quality steps, best first. A slow GPU drops the pixel ratio before it loses bloom:
 * a softer picture still reads as neon, a flat one does not.
 */
export const QUALITY = [
  { dpr: 2, post: true },
  { dpr: 1.5, post: true },
  { dpr: 1, post: true },
  { dpr: 1, post: false },
] as const;

export type Quality = (typeof QUALITY)[number];

const LOWEST: Quality = { dpr: 1, post: false };

/** The step at `index`, or the lowest one when out of range. */
export function qualityAt(index: number): Quality {
  return QUALITY[index] ?? LOWEST;
}

/** Starting step: no sharper than the screen can show. */
export function initialQuality(devicePixelRatio: number): number {
  const i = QUALITY.findIndex((q) => q.dpr <= Math.max(1, devicePixelRatio));
  return i === -1 ? QUALITY.length - 1 : i;
}

/** One step down on a frame-rate decline, one step up on an incline, clamped to the screen. */
export function stepQuality(
  current: number,
  change: "decline" | "incline",
  devicePixelRatio: number,
): number {
  const best = initialQuality(devicePixelRatio);
  const next = change === "decline" ? current + 1 : current - 1;
  return Math.min(QUALITY.length - 1, Math.max(best, next));
}
