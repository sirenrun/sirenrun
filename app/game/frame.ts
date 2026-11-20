import { GAP_START } from "@sirenrun/sim";

/**
 * Everything the scene draws this frame, computed once by `FrameDriver` and read by every
 * mesh in the same frame. A plain mutable module object (one scene per page), so the
 * render loop never touches React state.
 */
export interface Frame {
  ready: boolean;
  /** Fractional live tick the scene is showing. */
  tick: number;
  /** Interpolated sim values (sim units). */
  distance: number;
  carX: number;
  /** Displayed car x after local input prediction (sim units). */
  displayX: number;
  targetLane: number;
  speed: number;
  policeGap: number;
  nitro: boolean;
  invuln: number;
  busted: boolean;
  status: "idle" | "staging" | "live" | "settled";
  seed: bigint;
  seedReady: boolean;
  /** Seconds since the scene mounted; drives sirens and idle motion. */
  time: number;
  /** Set for one frame when a hit lands. */
  hit: boolean;
}

export function createFrame(): Frame {
  return {
    ready: false,
    tick: 0,
    distance: 0,
    carX: 480,
    displayX: 480,
    targetLane: 2,
    speed: 0,
    policeGap: GAP_START,
    nitro: false,
    invuln: 0,
    busted: false,
    status: "idle",
    seed: 0n,
    seedReady: false,
    time: 0,
    hit: false,
  };
}

export const frame: Frame = createFrame();

/** Clears the frame when a scene mounts, so a previous channel's state never shows. */
export function resetFrame(): void {
  Object.assign(frame, createFrame());
}
