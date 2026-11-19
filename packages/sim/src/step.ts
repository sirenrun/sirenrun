import {
  ACCEL,
  CRASH_SPEED_PCT,
  GAP_MAX,
  INVULN_TICKS,
  LANE_SPEED,
  LANE_WIDTH,
  MAX_LIVE_TICKS,
  NITRO_BOOST,
  NITRO_TICKS,
  POLICE_ACCEL_DEN,
  POLICE_ACCEL_NUM,
  POLICE_BASE,
  ROW_GAP,
  SPEED_MAX,
} from "./constants.ts";
import { generateRow } from "./course.ts";
import { carLane, type SimState } from "./state.ts";

/** Advances one live tick in the order defined by docs/game-design.md. Mirrors sim::step. */
export function step(state: SimState, seed: bigint): void {
  if (state.busted) {
    return;
  }

  if (state.nitroPressed && state.nitroLeft > 0 && state.nitroTicks === 0) {
    state.nitroLeft -= 1;
    state.nitroTicks = NITRO_TICKS;
  }
  state.nitroPressed = false;

  const targetX = state.targetLane * LANE_WIDTH;
  state.carX =
    state.carX < targetX
      ? Math.min(state.carX + LANE_SPEED, targetX)
      : Math.max(state.carX - LANE_SPEED, targetX);

  state.speed = Math.min(state.speed + ACCEL, SPEED_MAX);
  let eff = state.speed;
  if (state.nitroTicks > 0) {
    eff += NITRO_BOOST;
    state.nitroTicks -= 1;
  }

  state.distance += eff;

  let hit = false;
  while (state.distance >= (state.row + 1) * ROW_GAP) {
    const row = generateRow(seed, state.row, state.safeLane);
    state.safeLane = row.safeLane;
    if (state.invuln === 0 && row.blocked[carLane(state)] === true) {
      hit = true;
    }
    state.row += 1;
  }

  if (hit) {
    state.speed = Math.floor((state.speed * CRASH_SPEED_PCT) / 100);
    state.invuln = INVULN_TICKS;
    state.nitroTicks = 0;
  } else if (state.invuln > 0) {
    state.invuln -= 1;
  }

  const policeSpeed = POLICE_BASE + Math.floor((state.t * POLICE_ACCEL_NUM) / POLICE_ACCEL_DEN);
  state.policeGap = Math.min(state.policeGap + eff - policeSpeed, GAP_MAX);

  state.t += 1;

  if (state.policeGap <= 0 || state.t >= MAX_LIVE_TICKS) {
    state.busted = true;
  }
}
