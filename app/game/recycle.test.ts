import { describe, expect, it } from "vitest";
import { mod, recycledZ } from "./recycle";

describe("recycledZ", () => {
  it("keeps an object fixed in the world while it is in the window", () => {
    const a = recycledZ(5, -100, 200, 20);
    const b = recycledZ(5, -110, 200, 20);
    expect(a).toBe(b);
  });

  it("always places objects inside the window around the car", () => {
    for (let carZ = 0; carZ > -2000; carZ -= 37) {
      for (let offset = 0; offset < 200; offset += 13) {
        const z = recycledZ(offset, carZ, 200, 20);
        expect(z).toBeLessThanOrEqual(carZ + 20);
        expect(z).toBeGreaterThan(carZ + 20 - 200);
      }
    }
  });

  it("mod is never negative", () => {
    expect(mod(-1, 10)).toBe(9);
    expect(mod(25, 10)).toBe(5);
  });
});
