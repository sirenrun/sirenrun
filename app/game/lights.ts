import { CAR_LENGTH } from "./car-fit";
import type { Frame } from "./frame";
import { worldX, worldZ } from "./world";

/**
 * Where the police light bar is this frame, published by `Police` for the road's reflections.
 * Cosmetic and one frame behind at most, so a plain mutable object is enough.
 */
export const policeLights = {
  visible: false,
  x: 0,
  z: 0,
  /** 1 while the red lamp is lit, 0 while the blue one is. */
  red: 1,
  /** 0 when the cruisers are far back, 1 at the bumper. */
  closeness: 0,
};

export type PoliceLights = typeof policeLights;

/** The lights the wet road mirrors: the player's tail lights and the lead cruiser's bar. */
export interface Reflections {
  tail: { x: number; z: number; on: number };
  police: { x: number; z: number; strength: number; red: number };
}

/** Reflection inputs for this frame. Pure, so the road shader's inputs can be tested. */
export function reflections(f: Frame, police: PoliceLights): Reflections {
  const shown = f.ready && f.status !== "idle";
  return {
    tail: {
      x: worldX(f.displayX),
      z: worldZ(f.distance) + CAR_LENGTH / 2,
      // Tail lights blink with the car while it is invulnerable after a hit.
      on: shown && (f.invuln === 0 || Math.floor(f.time * 12) % 2 === 0) ? 1 : 0,
    },
    police: {
      x: police.x,
      z: police.z,
      strength: shown && police.visible ? 0.5 + police.closeness : 0,
      red: police.red,
    },
  };
}
