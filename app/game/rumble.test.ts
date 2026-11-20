import { describe, expect, it } from "vitest";
import { cameraRumble } from "./rumble";

describe("camera rumble", () => {
  it("is still through the countdown even though the sim holds its launch speed", () => {
    expect(cameraRumble(0.42, "staging", false, false)).toBe(0);
    expect(cameraRumble(0.42, "idle", false, false)).toBe(0);
  });

  it("stops once busted, and under reduced motion", () => {
    expect(cameraRumble(1, "live", true, false)).toBe(0);
    expect(cameraRumble(1, "live", false, true)).toBe(0);
  });

  it("grows with speed while driving", () => {
    expect(cameraRumble(0, "live", false, false)).toBe(0);
    expect(cameraRumble(1, "live", false, false)).toBeGreaterThan(
      cameraRumble(0.5, "live", false, false),
    );
  });
});
