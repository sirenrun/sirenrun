import { describe, expect, it } from "vitest";
import { initialQuality, QUALITY, stepQuality } from "./quality";

describe("render quality", () => {
  it("starts no sharper than the screen", () => {
    expect(QUALITY[initialQuality(3)]?.dpr).toBe(2);
    expect(QUALITY[initialQuality(2)]?.dpr).toBe(2);
    expect(QUALITY[initialQuality(1.5)]?.dpr).toBe(1.5);
    expect(QUALITY[initialQuality(1)]?.dpr).toBe(1);
    expect(QUALITY[initialQuality(0.5)]?.dpr).toBe(1);
  });

  it("drops resolution before it drops bloom", () => {
    let q = initialQuality(2);
    const seen = [];
    for (let i = 0; i < 6; i += 1) {
      seen.push(QUALITY[q]);
      q = stepQuality(q, "decline", 2);
    }
    expect(seen.map((s) => s?.post)).toEqual([true, true, true, false, false, false]);
    expect(seen[2]?.dpr).toBe(1);
  });

  it("never climbs above the screen's pixel ratio", () => {
    const start = initialQuality(1);
    expect(stepQuality(start, "incline", 1)).toBe(start);
    expect(stepQuality(QUALITY.length - 1, "incline", 1)).toBe(start);
  });
});
