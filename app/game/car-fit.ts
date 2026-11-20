/**
 * Pure facts about the car models (Kenney Car Kit, CC0; see public/CREDITS.md), kept apart
 * from three.js so they can be tested.
 *
 * Every model samples one shared 512 x 512 atlas laid out as a 16 x 4 grid of colour swatches;
 * each part of a car (paint, glass, lamps) maps to one swatch. Recolouring a swatch recolours
 * that part on every model that uses it, and a mask of the lamp swatches makes only the lamps
 * emit light.
 */

export const ATLAS_URL = "/models/Textures/colormap.png";
export const ATLAS_COLS = 16;
export const ATLAS_ROWS = 4;

export interface Swatch {
  col: number;
  row: number;
}

/** Swatches found by decoding the models' UVs (see car-fit.test.ts). */
export const SWATCH = {
  /** Body paint of the sedan and the sports sedan; repainted pink for the player. */
  paint: { col: 13, row: 1 },
  tailLight: { col: 5, row: 3 },
  headLight: { col: 3, row: 3 },
  /** Blue half of the police light bar. */
  policeBlue: { col: 7, row: 3 },
  /** Mid-grey trim; the police model uses it for hood, roof and boot. */
  trim: { col: 7, row: 2 },
} as const satisfies Record<string, Swatch>;

export const LAMP_SWATCHES: readonly Swatch[] = [
  SWATCH.tailLight,
  SWATCH.headLight,
  SWATCH.policeBlue,
];

/** Pixel rectangle of a swatch in an atlas image (glTF UVs: v = 0 is the top row). */
export function swatchRect(s: Swatch, width: number, height: number) {
  const w = width / ATLAS_COLS;
  const h = height / ATLAS_ROWS;
  return { x: s.col * w, y: s.row * h, w, h };
}

/** Swatch under a UV coordinate. */
export function swatchAt(u: number, v: number): Swatch {
  const wrap = (x: number) => x - Math.floor(x);
  return {
    col: Math.min(ATLAS_COLS - 1, Math.floor(wrap(u) * ATLAS_COLS)),
    row: Math.min(ATLAS_ROWS - 1, Math.floor(wrap(v) * ATLAS_ROWS)),
  };
}

export const PLAYER_MODEL = "sedan-sports";
export const POLICE_MODEL = "police";
/** Traffic, picked per obstacle from row-hash bits. Varied shapes and paints, none pink. */
export const TRAFFIC_MODELS = ["sedan", "suv", "taxi", "van", "hatchback-sports", "truck"] as const;
export const ALL_MODELS = [PLAYER_MODEL, POLICE_MODEL, ...TRAFFIC_MODELS] as const;

export const modelUrl = (name: string) => `/models/${name}.glb`;

/** Footprint of the player and police cars, which the chase layout in world.ts assumes. */
export const CAR_WIDTH = 1.9;
export const CAR_LENGTH = 4.1;
/** Traffic keeps the kit's relative sizes: a sedan comes out at 1.9 x 3.95 m. */
const TRAFFIC_SCALE_X = 1.27;
const TRAFFIC_SCALE_Z = 1.55;
/**
 * The kit's cars are stubby toys (2.55 m long, 1.5 m wide, 1.3 m tall). Stretching them
 * more along the road than up keeps them low and fast-looking.
 */
const HEIGHT_PER_WIDTH = 0.85;

export interface Fit {
  /** Body scale per axis. */
  x: number;
  y: number;
  z: number;
  /** Wheels scale uniformly so they stay round. */
  wheel: number;
}

/**
 * Scale for a model of the given raw size. Given a target footprint the car fills it exactly;
 * without one it gets the traffic scale.
 */
export function fitCar(
  size: { x: number; y: number; z: number },
  target?: { width: number; length: number },
): Fit {
  const x = target ? target.width / size.x : TRAFFIC_SCALE_X;
  const z = target ? target.length / size.z : TRAFFIC_SCALE_Z;
  const y = x * HEIGHT_PER_WIDTH;
  return { x, y, z, wheel: y };
}

/**
 * The police light bar in the kit's police model (raw model space, car facing +z): the red
 * lamp spans +x, the blue lamp -x. Turned to face -z, red ends up on the driver's left.
 */
export const POLICE_BAR = { x: [0.144, 0.35], y: [1.2, 1.3], z: [0, 0.2] } as const;

type Vec3 = [number, number, number];

/**
 * Centre and size of one police lamp after fitting and turning the model, slightly oversized
 * so a flashing overlay covers the model's own lamp.
 */
export function policeLamp(fit: Fit, side: "red" | "blue"): { centre: Vec3; size: Vec3 } {
  const [x0, x1] = POLICE_BAR.x;
  const [y0, y1] = POLICE_BAR.y;
  const [z0, z1] = POLICE_BAR.z;
  const sign = side === "red" ? -1 : 1;
  const pad = 1.15;
  return {
    centre: [sign * ((x0 + x1) / 2) * fit.x, ((y0 + y1) / 2) * fit.y, -((z0 + z1) / 2) * fit.z],
    size: [(x1 - x0) * fit.x * pad, (y1 - y0) * fit.y * pad, (z1 - z0) * fit.z * pad],
  };
}
