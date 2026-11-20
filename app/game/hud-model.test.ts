import type { Market } from "@sirenrun/sdk";
import { describe, expect, it } from "vitest";
import {
  formatClock,
  gapFill,
  gapLevel,
  heatSegments,
  lineLabel,
  newlyCrossed,
  stagingSecondsLeft,
} from "./hud-model";

describe("HUD model", () => {
  it("formats the run clock", () => {
    expect(formatClock(0)).toBe("0:00.0");
    expect(formatClock(473.6)).toBe("0:47.3");
    expect(formatClock(674)).toBe("1:07.4");
    expect(formatClock(-3)).toBe("0:00.0");
  });

  it("counts staging down from 10", () => {
    expect(stagingSecondsLeft(0)).toBe(10);
    expect(stagingSecondsLeft(91)).toBe(1);
    expect(stagingSecondsLeft(100)).toBe(0);
    expect(stagingSecondsLeft(140)).toBe(0);
  });

  it("colours the gap like the spec", () => {
    expect([gapLevel(1500), gapLevel(751), gapLevel(750), gapLevel(300), gapLevel(299)]).toEqual([
      "safe",
      "safe",
      "warn",
      "warn",
      "danger",
    ]);
    expect([gapFill(1500), gapFill(750), gapFill(-50), gapFill(9000)]).toEqual([1, 0.5, 0, 1]);
  });

  it("heats up as the police approach cruise speed", () => {
    expect(heatSegments(0)).toBe(1);
    expect(heatSegments(300)).toBeGreaterThan(heatSegments(0));
    expect(heatSegments(667)).toBe(5);
    expect(heatSegments(1500)).toBe(5);
    for (let t = 0; t < 1000; t += 10)
      expect(heatSegments(t + 10)).toBeGreaterThanOrEqual(heatSegments(t));
  });

  it("finds lines that just resolved YES", () => {
    const m = (status: Market["status"]) => ({ status }) as Market;
    expect(newlyCrossed(null, [m("yes")])).toEqual([]);
    expect(newlyCrossed([m("open"), m("open"), m("open")], [m("yes"), m("open"), m("no")])).toEqual(
      [0],
    );
    expect(newlyCrossed([m("yes")], [m("yes")])).toEqual([]);
  });

  it("labels lines in seconds", () => {
    expect([300, 600, 900].map(lineLabel)).toEqual(["30s", "60s", "90s"]);
  });
});
