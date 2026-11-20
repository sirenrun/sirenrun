import { LANE_SPEED, LANE_WIDTH, LANES, TICK_MS } from "@sirenrun/sim";

/**
 * The car's displayed x, in sim units. A lane press starts moving the car at once, at the
 * program's own lane speed, instead of waiting ~250 ms for the chain. The displayed car may
 * lead the authoritative one by at most one lane.
 *
 * It always heads for the target lane at lane speed and never eases back toward the chain's
 * position: playback draws the chain about a tick late, so right after the chain confirms a
 * press its car is still near the old lane, and following it there pulled the car back and
 * made one press look like two moves. The program moves `car_x` toward the target lane at
 * the same speed and nothing else, so both end on the same x.
 */
const UNITS_PER_MS = LANE_SPEED / TICK_MS;
/** A press the chain has not reflected within this long is dropped (e.g. failed send). */
const PREDICTION_TIMEOUT_MS = 800;

export const clampLane = (lane: number) => Math.max(0, Math.min(LANES - 1, Math.round(lane)));

export class LaneMotion {
  x: number | null = null;
  private predicted: { lane: number; at: number } | null = null;

  /** The lane the player is steering to: their last press, else the chain's target. */
  targetLane(authTarget: number): number {
    return this.predicted?.lane ?? authTarget;
  }

  press(lane: number, now: number): void {
    this.predicted = { lane: clampLane(lane), at: now };
  }

  /** Advances the display by `dtMs` given the interpolated chain position and target lane. */
  update(dtMs: number, authX: number, authTarget: number, now: number): number {
    if (this.predicted !== null) {
      const acknowledged = this.predicted.lane === authTarget;
      if (acknowledged || now - this.predicted.at > PREDICTION_TIMEOUT_MS) this.predicted = null;
    }
    if (this.x === null) this.x = authX;
    const dt = Math.max(0, Math.min(dtMs, 100));
    const goal = (this.predicted?.lane ?? authTarget) * LANE_WIDTH;
    const step = UNITS_PER_MS * dt;
    this.x += Math.max(-step, Math.min(step, goal - this.x));
    this.x = Math.max(authX - LANE_WIDTH, Math.min(authX + LANE_WIDTH, this.x));
    return this.x;
  }

  reset(): void {
    this.x = null;
    this.predicted = null;
  }
}
