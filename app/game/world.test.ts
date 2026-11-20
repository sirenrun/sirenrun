import { GAP_MAX } from "@sirenrun/sim";
import { describe, expect, it } from "vitest";
import { policeDistance, rowZ, worldX, worldZ } from "./world";

const CAMERA_BEHIND = 10.5;

describe("world mapping", () => {
  it("centres lane 2 and drives toward -z", () => {
    expect(worldX(480)).toBe(0);
    expect(worldX(0)).toBeCloseTo(-4.8);
    expect(worldZ(1000)).toBe(-10);
    expect(rowZ(0)).toBe(-10);
  });

  it("brings the police into frame as the gap closes", () => {
    expect(policeDistance(GAP_MAX)).toBeGreaterThan(CAMERA_BEHIND);
    expect(policeDistance(2000)).toBeLessThan(CAMERA_BEHIND);
    expect(policeDistance(0)).toBeCloseTo(2.6);
    expect(policeDistance(-100)).toBe(policeDistance(0));
    for (let gap = 0; gap < GAP_MAX; gap += 100) {
      expect(policeDistance(gap + 100)).toBeGreaterThan(policeDistance(gap));
    }
  });
});
