import { LANE_WIDTH, LANES } from "@sirenrun/sim";
import { describe, expect, it } from "vitest";
import { LAMP_HEAD_X, LAMP_SPACING, PALM_MIN_X, POLE_X, RAIL_POST_SPACING, RAIL_X } from "./layout";
import { ROAD_HALF, worldX } from "./world";

describe("roadside layout", () => {
  it("keeps road edge, guardrail, poles and palms in that order", () => {
    expect(RAIL_X).toBeGreaterThan(ROAD_HALF);
    expect(POLE_X).toBeGreaterThan(RAIL_X);
    expect(PALM_MIN_X).toBeGreaterThan(POLE_X);
  });

  it("hangs the lamps over the road", () => {
    expect(LAMP_HEAD_X).toBeLessThan(ROAD_HALF);
    expect(LAMP_HEAD_X).toBeGreaterThan(worldX((LANES - 2) * LANE_WIDTH));
  });

  it("keeps a whole number of rail posts between lamps", () => {
    expect(LAMP_SPACING % RAIL_POST_SPACING).toBe(0);
  });

  it("leaves room for a car in the outer lane before the rail", () => {
    const outerCarSide = worldX((LANES - 1) * LANE_WIDTH) + 1.9 / 2;
    expect(RAIL_X - outerCarSide).toBeGreaterThan(1);
  });
});
