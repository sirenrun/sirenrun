import { GAP_MAX, LANE_WIDTH, LANES, ROW_GAP, TICK_MS } from "@sirenrun/sim";

/** Across the road, sim units per metre: a 240-unit lane is 2.4 m wide. */
export const SCALE = 1 / 100;
/**
 * Along the road, sim units per metre. The sim is unitless; this only sets how fast the
 * picture moves. At 1/40 the car's top speed (200 per tick) reads as 180 km/h, nitro as
 * 234 km/h, and obstacle rows sit 25 m apart. At the lateral scale it read as 72 km/h.
 */
export const Z_SCALE = 1 / 40;
export const LANE_W = LANE_WIDTH * SCALE;
export const ROAD_HALF = (LANES * LANE_W) / 2;
export const ROW_SPACING = ROW_GAP * Z_SCALE;

/** World x of a sim `car_x` (lane 2 is the centre line). */
export const worldX = (carX: number) => (carX - ((LANES - 1) * LANE_WIDTH) / 2) * SCALE;
/** World z of a sim distance; the car drives toward -z. */
export const worldZ = (distance: number) => -distance * Z_SCALE;
/** World z of obstacle row `row`: the program checks it when distance reaches (row+1)·ROW_GAP. */
export const rowZ = (row: number) => -(row + 1) * ROW_SPACING;
export const laneX = (lane: number) => worldX(lane * LANE_WIDTH);

/** Displayed speed of a sim speed (units per tick), in km/h. */
export const kmh = (speed: number) => speed * Z_SCALE * (1000 / TICK_MS) * 3.6;
/** Metres per second of a sim speed. */
export const metresPerSecond = (speed: number) => speed * Z_SCALE * (1000 / TICK_MS);

/**
 * How far behind the car the lead cruiser is drawn (centre to centre, metres). The gap is a
 * number, not a position, so this is a display mapping tuned to the chase camera: at the gap
 * cap the cruisers sit just under the bottom of the frame and only their lights reach the
 * road; they climb into view as the gap closes; at 0 the bumpers touch (cars are 4.1 m long).
 */
export const POLICE_CONTACT = 4.3;
export const POLICE_FAR = 11;
export function policeDistance(gap: number): number {
  const g = Math.max(0, Math.min(GAP_MAX, gap)) / GAP_MAX;
  return POLICE_CONTACT + Math.pow(g, 0.9) * (POLICE_FAR - POLICE_CONTACT);
}
