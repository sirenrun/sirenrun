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
  /** 1 while the red lamp is lit, 0 while the blue one is, cross-fading in between. */
  red: 1,
  /** 0 when the cruisers are far back, 1 at the bumper. */
  closeness: 0,
};

export type PoliceLights = typeof policeLights;

/** Siren alternation, rad/s: about 2.2 red/blue cycles a second. */
const SIREN_RATE = 14;
/** How hard the red/blue switch is: higher is closer to a square wave. */
const SIREN_EDGE = 6;

/**
 * Share of red in the siren light at `time` seconds. A hard on/off switch strobes the whole
 * car and road several times a second, which reads as the screen shaking; a quick cross-fade
 * keeps the alternation without the strobe.
 */
export function sirenRed(time: number): number {
  return 0.5 + 0.5 * Math.tanh(SIREN_EDGE * Math.sin(time * SIREN_RATE));
}

/**
 * Brightness of the light the siren throws on the car and road. Dim while the cruisers wait
 * out the countdown, then brighter as they close in.
 */
export function sirenIntensity(status: string, closeness: number): number {
  if (status === "staging") return 5;
  return 12 + closeness * 28;
}

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
