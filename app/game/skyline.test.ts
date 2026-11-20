import { describe, expect, it } from "vitest";
import {
  BEACON_HEIGHT,
  LAYER_ORDER,
  LAYERS,
  prng,
  SIGN_COLOURS,
  SKYLINE_MIN_X,
  skylineLayout,
  type Building,
} from "./skyline";

const city = skylineLayout();
const inLayer = (name: string) => city.filter((b) => b.layer === name);
const roadSide = (b: Building) => b.x - b.width / 2;

describe("skyline layout", () => {
  it("is the same city on every load", () => {
    expect(skylineLayout()).toEqual(city);
    expect(skylineLayout(1)).not.toEqual(city);
    const a = prng(9);
    const b = prng(9);
    for (let i = 0; i < 5; i += 1) expect(a()).toBe(b());
  });

  it("builds every layer on both shores", () => {
    for (const name of LAYER_ORDER) {
      const layer = inLayer(name);
      expect(layer).toHaveLength(LAYERS[name].perSide * 2);
      expect(layer.filter((b) => b.side === -1)).toHaveLength(LAYERS[name].perSide);
    }
  });

  it("orders the layers by distance, with nothing on the road or among the palms", () => {
    for (const b of city) expect(roadSide(b)).toBeGreaterThanOrEqual(SKYLINE_MIN_X);
    const farthest = (name: string) => Math.max(...inLayer(name).map((b) => b.x + b.width / 2));
    const nearest = (name: string) => Math.min(...inLayer(name).map(roadSide));
    expect(farthest("near")).toBeLessThan(nearest("mid"));
    expect(farthest("mid")).toBeLessThan(nearest("far"));
  });

  it("keeps the shore low and the far city tall", () => {
    const tallest = (name: string) => Math.max(...inLayer(name).map((b) => b.height));
    const lowest = (name: string) => Math.min(...inLayer(name).map((b) => b.height));
    expect(tallest("near")).toBeLessThan(lowest("far"));
    expect(tallest("mid")).toBeGreaterThan(tallest("near"));
  });

  it("does not let neighbours along the road overlap", () => {
    for (const name of LAYER_ORDER) {
      const { spacing } = LAYERS[name];
      for (const b of inLayer(name)) expect(b.depth).toBeLessThan(spacing * 1.5);
    }
  });

  it("puts signs and beacons only where they belong", () => {
    for (const b of city) {
      expect(b.sign).toBeLessThan(SIGN_COLOURS);
      if (b.layer === "far") expect(b.sign).toBe(-1);
      expect(b.beacon).toBe(b.layer === "mid" && b.height >= BEACON_HEIGHT);
    }
    expect(city.some((b) => b.beacon)).toBe(true);
    expect(inLayer("near").some((b) => b.sign >= 0)).toBe(true);
    expect(inLayer("mid").some((b) => b.sign >= 0)).toBe(true);
  });
});
