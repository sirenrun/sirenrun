import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALL_MODELS,
  CAR_LENGTH,
  CAR_WIDTH,
  fitCar,
  POLICE_BAR,
  policeLamp,
  SWATCH,
  swatchAt,
  swatchRect,
  type Swatch,
} from "./car-fit";

const MODELS_DIR = new URL("../public/models/", import.meta.url);
const CREDITS = new URL("../public/CREDITS.md", import.meta.url);
/** Raw size per model file; they gzip to about a sixth of this. */
const MODEL_BUDGET = 250_000;

interface Accessor {
  bufferView: number;
  byteOffset?: number;
  count: number;
  type: "SCALAR" | "VEC2" | "VEC3" | "VEC4";
  componentType: number;
}
let bodyOffset: number[] = [0, 0, 0];

interface Gltf {
  nodes: { name: string; mesh?: number; children?: number[]; translation?: number[] }[];
  meshes: { primitives: { attributes: Record<string, number> }[] }[];
  accessors: Accessor[];
  bufferViews: { byteOffset?: number; byteStride?: number }[];
}

/** Minimal GLB reader: the JSON chunk plus float attributes from the binary chunk. */
function readGlb(name: string) {
  const bytes = readFileSync(new URL(`${name}.glb`, MODELS_DIR));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8")) as Gltf;
  const bin = 20 + jsonLength + 8;
  const floats = (index: number): number[][] => {
    const a = json.accessors[index] as Accessor;
    expect(a.componentType).toBe(5126);
    const bv = json.bufferViews[a.bufferView] as { byteOffset?: number; byteStride?: number };
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const stride = bv.byteStride ?? n * 4;
    const start = bin + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return Array.from({ length: a.count }, (_, i) =>
      Array.from({ length: n }, (_, k) => view.getFloat32(start + i * stride + k * 4, true)),
    );
  };
  return { json, floats };
}

/** Body vertices (position and swatch) of a model, in the body node's own space. */
function bodySwatches(name: string): { pos: number[]; swatch: Swatch }[] {
  const { json, floats } = readGlb(name);
  const body = json.nodes.find((n) => n.name === "body");
  bodyOffset = body?.translation ?? [0, 0, 0];
  expect(body?.mesh).toBeTypeOf("number");
  const prim = json.meshes[body?.mesh as number]?.primitives[0];
  const pos = floats(prim?.attributes.POSITION as number);
  const uv = floats(prim?.attributes.TEXCOORD_0 as number);
  return pos.map((p, i) => ({ pos: p, swatch: swatchAt(uv[i]?.[0] ?? 0, uv[i]?.[1] ?? 0) }));
}

const same = (a: Swatch, b: Swatch) => a.col === b.col && a.row === b.row;

describe("car atlas", () => {
  it("maps UVs to the 16 x 4 swatch grid", () => {
    expect(swatchAt(0, 0)).toEqual({ col: 0, row: 0 });
    expect(swatchAt(0.999, 0.999)).toEqual({ col: 15, row: 3 });
    expect(swatchAt(1, 1)).toEqual({ col: 0, row: 0 });
    expect(swatchRect(SWATCH.paint, 512, 512)).toEqual({ x: 416, y: 128, w: 32, h: 128 });
  });

  it("paints the player's body with the paint swatch", () => {
    const verts = bodySwatches("sedan-sports");
    const paint = verts.filter((v) => same(v.swatch, SWATCH.paint));
    expect(paint.length).toBeGreaterThan(100);
  });

  it.each(ALL_MODELS)("%s has tail lights at the back and headlights at the front", (name) => {
    const verts = bodySwatches(name);
    const tails = verts.filter((v) => same(v.swatch, SWATCH.tailLight));
    const heads = verts.filter((v) => same(v.swatch, SWATCH.headLight));
    expect(tails.length).toBeGreaterThan(0);
    expect(heads.length).toBeGreaterThan(0);
    // The kit's cars face +z; Cars.tsx turns them to face -z.
    expect(Math.min(...tails.map((v) => v.pos[2] ?? 0))).toBeLessThan(-0.9);
    expect(Math.min(...heads.map((v) => v.pos[2] ?? 0))).toBeGreaterThan(0.9);
  });

  it("finds the police light bar where POLICE_BAR says", () => {
    const verts = bodySwatches("police");
    const roof = (s: Swatch) =>
      verts
        .filter((v) => same(v.swatch, s) && (v.pos[1] ?? 0) > 0.9)
        .map((v) => v.pos.map((p, k) => p + (bodyOffset[k] ?? 0)));
    const red = roof(SWATCH.tailLight);
    const blue = roof(SWATCH.policeBlue);
    expect(red.length).toBeGreaterThan(0);
    expect(blue.length).toBeGreaterThan(0);
    const [x0, x1] = POLICE_BAR.x;
    for (const p of red) expect(p[0]).toBeGreaterThanOrEqual(x0 - 1e-3);
    for (const p of red) expect(p[0]).toBeLessThanOrEqual(x1 + 1e-3);
    for (const p of blue) expect(-(p[0] ?? 0)).toBeGreaterThanOrEqual(x0 - 1e-3);
    for (const p of [...red, ...blue]) {
      expect(p[1]).toBeGreaterThanOrEqual(POLICE_BAR.y[0] - 1e-3);
      expect(p[1]).toBeLessThanOrEqual(POLICE_BAR.y[1] + 1e-3);
      expect(p[2]).toBeGreaterThanOrEqual(POLICE_BAR.z[0] - 1e-3);
      expect(p[2]).toBeLessThanOrEqual(POLICE_BAR.z[1] + 1e-3);
    }
  });

  it("puts the red police lamp on the left once the car faces down the road", () => {
    const fit = fitCar({ x: 1.5, y: 1.3, z: 3.1 }, { width: CAR_WIDTH, length: CAR_LENGTH });
    const red = policeLamp(fit, "red");
    const blue = policeLamp(fit, "blue");
    expect(red.centre[0]).toBeLessThan(0);
    expect(blue.centre[0]).toBeCloseTo(-red.centre[0]);
    expect(red.centre[1]).toBeGreaterThan(1.2);
    expect(red.size[0]).toBeGreaterThan((POLICE_BAR.x[1] - POLICE_BAR.x[0]) * fit.x);
  });
});

describe("model files", () => {
  const files = readdirSync(MODELS_DIR).filter((f) => f.endsWith(".glb"));

  it("ships exactly the models the scene uses", () => {
    expect(files.map((f) => f.replace(/\.glb$/, "")).sort()).toEqual([...ALL_MODELS].sort());
  });

  it.each(files)("%s stays under the size budget", (file) => {
    expect(statSync(new URL(file, MODELS_DIR)).size).toBeLessThan(MODEL_BUDGET);
  });

  it("credits every model and the atlas", () => {
    const credits = readFileSync(CREDITS, "utf8");
    for (const file of [...files, "Textures/colormap.png"]) expect(credits).toContain(file);
  });
});

describe("fitting a car to the road", () => {
  it("fills the player footprint exactly and keeps the wheels round", () => {
    const fit = fitCar({ x: 1.3, y: 1.1, z: 2.55 }, { width: CAR_WIDTH, length: CAR_LENGTH });
    expect(1.3 * fit.x).toBeCloseTo(CAR_WIDTH);
    expect(2.55 * fit.z).toBeCloseTo(CAR_LENGTH);
    expect(fit.wheel).toBe(fit.y);
    expect(fit.y).toBeLessThan(fit.x);
  });

  it("keeps traffic at the kit's relative sizes", () => {
    const sedan = fitCar({ x: 1.5, y: 1.3, z: 2.55 });
    const truck = fitCar({ x: 1.5, y: 1.3, z: 2.95 });
    expect(sedan).toEqual(truck);
    expect(1.5 * sedan.x).toBeCloseTo(1.9, 1);
  });
});
