import {
  GAP_START,
  LANES,
  LANE_WIDTH,
  NITRO_CHARGES,
  SPEED_START,
  START_LANE,
} from "./constants.ts";

export interface SimState {
  t: number;
  carX: number;
  targetLane: number;
  speed: number;
  nitroLeft: number;
  nitroTicks: number;
  invuln: number;
  distance: number;
  row: number;
  safeLane: number;
  policeGap: number;
  busted: boolean;
  nitroPressed: boolean;
}

export function startState(): SimState {
  return {
    t: 0,
    carX: START_LANE * LANE_WIDTH,
    targetLane: START_LANE,
    speed: SPEED_START,
    nitroLeft: NITRO_CHARGES,
    nitroTicks: 0,
    invuln: 0,
    distance: 0,
    row: 0,
    safeLane: START_LANE,
    policeGap: GAP_START,
    busted: false,
    nitroPressed: false,
  };
}

/** A nitro press stays pending until the next tick consumes it. */
export function setInput(state: SimState, targetLane: number, nitro: boolean): void {
  state.targetLane = Math.min(Math.max(targetLane, 0), LANES - 1);
  state.nitroPressed ||= nitro;
}

export function carLane(state: SimState): number {
  return Math.floor((state.carX + LANE_WIDTH / 2) / LANE_WIDTH);
}
