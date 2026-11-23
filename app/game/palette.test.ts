import { describe, expect, it } from "vitest";
import { NEON } from "./palette";

/** WCAG relative luminance of an sRGB hex colour. */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("road palette", () => {
  it("lane lines stand out clearly from the asphalt", () => {
    expect(contrast(NEON.laneLine, NEON.asphalt)).toBeGreaterThan(7);
  });

  it("the road is lighter than the water and buildings around it", () => {
    expect(luminance(NEON.asphalt)).toBeGreaterThan(luminance(NEON.water) * 5);
    expect(luminance(NEON.asphalt)).toBeGreaterThan(luminance(NEON.building) * 5);
  });

  it("obstacle colours read against the asphalt", () => {
    expect(contrast(NEON.amber, NEON.asphalt)).toBeGreaterThan(4.5);
    expect(contrast(NEON.red, NEON.asphalt)).toBeGreaterThan(2.5);
  });
});
