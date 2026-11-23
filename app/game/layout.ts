import { ROAD_HALF } from "./world";

/**
 * Where things stand across the causeway, in metres from the centre line. Kept in one place so
 * a test can check they stay in order: road edge, guardrail, lamp poles, palms.
 */

/** Guardrail face, just past the neon edge line. */
export const RAIL_X = ROAD_HALF + 0.85;
/** Streetlight poles stand behind the rail. */
export const POLE_X = ROAD_HALF + 1.4;
/** Lamp heads hang over the outer lanes on arms; the road mirrors them from here. */
export const LAMP_HEAD_X = POLE_X - 2.1;
/** Streetlights repeat every 24 m on both edges; the road shader draws their light pools. */
export const LAMP_SPACING = 24;
/** Nearest a palm may stand. */
export const PALM_MIN_X = ROAD_HALF + 4;
/** Guardrail posts repeat this often; every third one carries a reflector. */
export const RAIL_POST_SPACING = 4;
/** Billboards stand past the palms so they never cover the road or the cars on it. */
export const BILLBOARD_X = PALM_MIN_X + 9;
