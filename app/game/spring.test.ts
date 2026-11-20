import { describe, expect, it } from "vitest";
import { spring } from "./spring";

describe("spring", () => {
  it("settles on the target from either side", () => {
    for (const start of [-3, 5]) {
      let x = start;
      let v = 0;
      for (let i = 0; i < 600; i += 1) [x, v] = spring(x, v, 1, 6, 0.6, 1 / 60);
      expect(x).toBeCloseTo(1, 3);
      expect(v).toBeCloseTo(0, 3);
    }
  });

  it("overshoots a little when underdamped, never when critically damped", () => {
    const peak = (zeta: number) => {
      let x = 0;
      let v = 0;
      let max = 0;
      for (let i = 0; i < 600; i += 1) {
        [x, v] = spring(x, v, 1, 6, zeta, 1 / 60);
        max = Math.max(max, x);
      }
      return max;
    };
    expect(peak(0.55)).toBeGreaterThan(1.05);
    expect(peak(0.55)).toBeLessThan(1.3);
    expect(peak(1)).toBeLessThanOrEqual(1.0001);
  });

  it("stays stable at a slow frame", () => {
    let x = 0;
    let v = 0;
    for (let i = 0; i < 200; i += 1) [x, v] = spring(x, v, 1, 11, 0.4, 0.05);
    expect(Math.abs(x - 1)).toBeLessThan(0.01);
  });
});
