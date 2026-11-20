import { describe, expect, it } from "vitest";
import { cursorMode, INTERACTIVE, ringSettled, stepRing, TEXT_FIELD, type Ring } from "./cursor";

const over =
  (...hits: string[]) =>
  (selector: string) =>
    hits.includes(selector);

describe("cursor mode", () => {
  it("grows over clickable elements", () => {
    expect(cursorMode(over(INTERACTIVE))).toBe("hover");
  });

  it("hides over the 3D view and text fields, even inside a link", () => {
    expect(cursorMode(over("canvas", INTERACTIVE))).toBe("hidden");
    expect(cursorMode(over(TEXT_FIELD, INTERACTIVE))).toBe("hidden");
  });

  it("follows plainly everywhere else", () => {
    expect(cursorMode(over())).toBe("default");
  });
});

describe("trailing ring", () => {
  it("catches the pointer within a quarter second and sleeps", () => {
    const r: Ring = { x: 0, y: 0, vx: 0, vy: 0 };
    for (let i = 0; i < 15; i += 1) stepRing(r, 300, -120, 1 / 60);
    expect(Math.abs(r.x - 300)).toBeLessThan(6);
    for (let i = 0; i < 60; i += 1) stepRing(r, 300, -120, 1 / 60);
    expect(ringSettled(r, 300, -120)).toBe(true);
  });

  it("stays stable through a long frame", () => {
    const r: Ring = { x: 0, y: 0, vx: 0, vy: 0 };
    stepRing(r, 500, 500, 0.5);
    expect(Number.isFinite(r.x)).toBe(true);
    expect(r.x).toBeLessThan(560);
    expect(r.x).toBeGreaterThan(0);
  });
});
