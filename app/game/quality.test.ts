import { describe, expect, it } from "vitest";
import { initialQuality, QUALITY, stepQuality } from "./quality";

describe("render quality", () => {
  it("starts no sharper than the screen, and never above 1.5", () => {
    expect(QUALITY[initialQuality(3)]?.dpr).toBe(1.5);
    expect(QUALITY[initialQuality(2)]?.dpr).toBe(1.5);
    expect(QUALITY[initialQuality(1.5)]?.dpr).toBe(1.5);
    expect(QUALITY[initialQuality(1.25)]?.dpr).toBe(1.25);
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
  });

  it("keeps post off once it has been dropped", () => {
    const lowest = QUALITY.length - 1;
    expect(stepQuality(lowest, "incline", 2)).toBe(lowest);
    expect(stepQuality(lowest - 1, "incline", 2)).toBe(lowest - 2);
  });
});
