import { describe, expect, it } from "vitest";
import { BILLBOARD_SPACING, COURSE_M, PARTNERS, billboardLayout } from "./billboards";
import { BILLBOARD_X, PALM_MIN_X } from "./layout";

describe("billboard layout", () => {
  const slots = billboardLayout();

  it("has exactly 20 boards, spaced evenly over the whole course", () => {
    expect(slots).toHaveLength(20);
    for (let i = 1; i < slots.length; i += 1) {
      expect((slots[i]?.at ?? 0) - (slots[i - 1]?.at ?? 0)).toBeCloseTo(BILLBOARD_SPACING);
    }
    expect(slots[0]?.at).toBeGreaterThan(0);
    expect(slots.at(-1)?.at).toBeLessThan(COURSE_M);
  });

  it("shares the boards fairly: every logo six or seven times, on both sides", () => {
    for (const partner of PARTNERS) {
      const mine = slots.filter((s) => s.partner === partner);
      expect(mine.length === 6 || mine.length === 7).toBe(true);
      expect(new Set(mine.map((s) => s.side))).toEqual(new Set([-1, 1]));
    }
  });

  it("alternates sides and never repeats a logo back to back", () => {
    for (let i = 1; i < slots.length; i += 1) {
      expect(slots[i]?.side).not.toBe(slots[i - 1]?.side);
      expect(slots[i]?.partner).not.toBe(slots[i - 1]?.partner);
    }
  });

  it("stands beyond the palms", () => {
    expect(BILLBOARD_X).toBeGreaterThan(PALM_MIN_X + 7);
  });
});
