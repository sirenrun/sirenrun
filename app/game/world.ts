import { GAP_MAX, LANE_WIDTH, LANES, ROW_GAP } from "@sirenrun/sim";

/** Sim units per world unit: a 240-unit lane is 2.4 m wide, a row is every 10 m. */
export const SCALE = 1 / 100;
export const LANE_W = LANE_WIDTH * SCALE;
export const ROAD_HALF = (LANES * LANE_W) / 2;
export const ROW_SPACING = ROW_GAP * SCALE;

/** World x of a sim `car_x` (lane 2 is the centre line). */
export const worldX = (carX: number) => (carX - ((LANES - 1) * LANE_WIDTH) / 2) * SCALE;
/** World z of a sim distance; the car drives toward -z. */
export const worldZ = (distance: number) => -distance * SCALE;
/** World z of obstacle row `row`: the program checks it when distance reaches (row+1)·ROW_GAP. */
export const rowZ = (row: number) => -(row + 1) * ROW_SPACING;
export const laneX = (lane: number) => worldX(lane * LANE_WIDTH);

/**
 * How far behind the car the lead cruiser is drawn. The gap is a number, not a position, so
 * this is a display mapping: at the 4000 cap the police are far back in the fog; at 0 they
 * touch the bumper. Square root, so the last stretch feels fast.
 */
export function policeDistance(gap: number): number {
  const g = Math.max(0, Math.min(GAP_MAX, gap)) / GAP_MAX;
  return 2.6 + Math.sqrt(g) * 34;
}
