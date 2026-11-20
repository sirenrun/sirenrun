import { GAP_MAX, SPEED_MAX } from "@sirenrun/sim";
import { describe, expect, it } from "vitest";
import { kmh, policeDistance, POLICE_CONTACT, rowZ, worldX, worldZ } from "./world";

describe("world mapping", () => {
  it("centres lane 2 and drives toward -z", () => {
    expect(worldX(480)).toBe(0);
    expect(worldX(0)).toBeCloseTo(-4.8);
    expect(worldZ(1000)).toBe(-25);
    expect(rowZ(0)).toBe(-25);
  });

  it("reads top speed as 180 km/h", () => {
    expect(kmh(SPEED_MAX)).toBeCloseTo(180);
  });

  it("brings the police from out of frame to the bumper as the gap closes", () => {
    expect(policeDistance(0)).toBeCloseTo(POLICE_CONTACT);
    expect(policeDistance(-100)).toBe(policeDistance(0));
    expect(policeDistance(GAP_MAX * 2)).toBe(policeDistance(GAP_MAX));
    for (let gap = 0; gap < GAP_MAX; gap += 100) {
      expect(policeDistance(gap + 100)).toBeGreaterThan(policeDistance(gap));
    }
  });
});
