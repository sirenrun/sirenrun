import { PALM_MIN_X } from "./layout";

/**
 * The Neon Key skyline in three depth layers, laid out from a fixed seed so the city looks the
 * same on every load. Pure data; Skyline.tsx draws it.
 *
 * - near: low waterfront hotels on the shore, some with a neon sign along the facade
 * - mid: the towers, some crowned with a neon band, the tallest with blinking aircraft lights
 * - far: tall silhouettes deep in the haze, which give the city its depth
 *
 * Each layer repeats along the road every `span` metres and is recycled around the car.
 */

export type LayerName = "near" | "mid" | "far";

export interface Layer {
  /** Buildings per side. */
  perSide: number;
  /** Metres between buildings along the road. */
  spacing: number;
  /** Distance from the centre line to the building's road-facing side. */
  x: readonly [number, number];
  height: readonly [number, number];
  width: readonly [number, number];
  /** Share of buildings that carry a neon sign. */
  signs: number;
}

export const LAYERS: Record<LayerName, Layer> = {
  // Low and set back, so the causeway still reads as a road over open water.
  near: { perSide: 16, spacing: 28, x: [50, 64], height: [4, 10], width: [10, 18], signs: 0.5 },
  mid: { perSide: 30, spacing: 16, x: [88, 150], height: [18, 88], width: [7, 16], signs: 0.3 },
  far: { perSide: 20, spacing: 34, x: [230, 290], height: [50, 150], width: [16, 32], signs: 0 },
};

export const LAYER_ORDER: readonly LayerName[] = ["near", "mid", "far"];

/** Towers at least this tall carry red aircraft beacons. */
export const BEACON_HEIGHT = 62;

/** Neon colours a sign may take (index into the palette in Skyline.tsx). */
export const SIGN_COLOURS = 3;

export interface Building {
  layer: LayerName;
  side: -1 | 1;
  /** Position along the layer's repeat, metres. */
  offset: number;
  /** Centre distance from the road centre line. */
  x: number;
  width: number;
  depth: number;
  height: number;
  /** Sign colour index, or -1 for none. */
  sign: number;
  beacon: boolean;
}

export const layerSpan = (layer: Layer) => layer.perSide * layer.spacing;

/** Small seeded PRNG (mulberry32): the same seed always gives the same city. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (r: () => number, [lo, hi]: readonly [number, number]) => lo + r() * (hi - lo);

export function skylineLayout(seed = 0x5173): Building[] {
  const r = prng(seed);
  const out: Building[] = [];
  for (const name of LAYER_ORDER) {
    const layer = LAYERS[name];
    for (let i = 0; i < layer.perSide * 2; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const width = between(r, layer.width);
      // Squared, so most buildings sit near the low end and a few stand out.
      const tall = r();
      const height = layer.height[0] + tall * tall * (layer.height[1] - layer.height[0]);
      const face = between(r, layer.x);
      const signed = r() < layer.signs;
      const colour = Math.floor(r() * SIGN_COLOURS);
      out.push({
        layer: name,
        side,
        offset: Math.floor(i / 2) * layer.spacing + r() * layer.spacing * 0.35,
        x: face + width / 2,
        width,
        depth: width * (0.7 + r() * 0.5),
        height,
        sign: signed ? colour : -1,
        beacon: name === "mid" && height >= BEACON_HEIGHT,
      });
    }
  }
  return out;
}

/** The nearest anything in the skyline may stand: well clear of the palms on the shore. */
export const SKYLINE_MIN_X = PALM_MIN_X + 7 + 8;
