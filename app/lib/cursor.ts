import { spring } from "../game/spring";

/** Elements the ring treats as clickable: it grows and turns pink over them. */
export const INTERACTIVE =
  'a[href], button:not(:disabled), [role="button"], select, summary, label[for], .wallet-adapter-button';

/** Fields that keep the native text cursor; the ring hides over them. */
export const TEXT_FIELD = 'input:not([type="range"]):not([type="checkbox"]), textarea';

export type CursorMode = "default" | "hover" | "hidden";

/**
 * What the ring does over an element. `matches` answers whether the element or one of its
 * ancestors matches a selector (`el.closest(sel) !== null` in the browser), so this stays pure.
 * Over the 3D view it hides: it would sit on top of the car.
 */
export function cursorMode(matches: (selector: string) => boolean): CursorMode {
  if (matches("canvas") || matches(TEXT_FIELD)) return "hidden";
  if (matches(INTERACTIVE)) return "hover";
  return "default";
}

/** Trailing ring position and velocity, in CSS pixels. */
export interface Ring {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Stiff enough to feel attached to the pointer, a touch under critical damping so a fast
 * flick overshoots slightly and settles: the "weight" game cursors have.
 */
const OMEGA = 38;
const ZETA = 0.78;
/** The spring step is stable for omega * dt < 2; split long frames to stay well inside it. */
const MAX_STEP = 1 / 60;

/** Advances the ring toward the pointer by `dt` seconds. */
export function stepRing(r: Ring, tx: number, ty: number, dt: number): void {
  let left = Math.min(dt, 0.1);
  while (left > 0) {
    const h = Math.min(left, MAX_STEP);
    [r.x, r.vx] = spring(r.x, r.vx, tx, OMEGA, ZETA, h);
    [r.y, r.vy] = spring(r.y, r.vy, ty, OMEGA, ZETA, h);
    left -= h;
  }
}

/** True once the ring has caught up and stopped, so the animation loop can sleep. */
export function ringSettled(r: Ring, tx: number, ty: number): boolean {
  return (
    Math.abs(r.x - tx) < 0.1 && Math.abs(r.y - ty) < 0.1 && Math.abs(r.vx) < 1 && Math.abs(r.vy) < 1
  );
}
