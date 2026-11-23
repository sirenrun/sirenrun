import { describe, expect, it } from "vitest";
import { BILLBOARD_SPACING, billboardLayout } from "./billboards";
import { BILLBOARD_X, PALM_MIN_X } from "./layout";

describe("billboard layout", () => {
  const slots = billboardLayout();

  it("puts both logos on both sides", () => {
    for (const side of [-1, 1]) {
      const partners = new Set(slots.filter((s) => s.side === side).map((s) => s.partner));
      expect(partners).toEqual(new Set(["solana", "magicblock"]));
    }
  });

  it("alternates logos along each side, including where the row recycles", () => {
    for (const side of [-1, 1]) {
      const row = slots
        .filter((s) => s.side === side)
        .sort((a, b) => a.offset - b.offset)
        .map((s) => s.partner);
      for (let i = 0; i < row.length; i += 1) {
        expect(row[i]).not.toBe(row[(i + 1) % row.length]);
      }
    }
  });

  it("spaces billboards evenly along the road", () => {
    const offsets = slots.map((s) => s.offset).sort((a, b) => a - b);
    for (let i = 1; i < offsets.length; i += 1) {
      expect((offsets[i] ?? 0) - (offsets[i - 1] ?? 0)).toBe(BILLBOARD_SPACING / 2);
    }
  });

  it("stands beyond the palms", () => {
    expect(BILLBOARD_X).toBeGreaterThan(PALM_MIN_X + 7);
  });
});
