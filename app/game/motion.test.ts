import { LANE_WIDTH } from "@sirenrun/sim";
import { describe, expect, it } from "vitest";
import { LaneMotion, clampLane } from "./motion";

const run = (m: LaneMotion, ms: number, authX: number, authTarget: number, start: number) => {
  let x = m.x ?? authX;
  for (let t = 0; t < ms; t += 16) x = m.update(16, authX, authTarget, start + t);
  return x;
};

describe("LaneMotion", () => {
  it("starts the lane change on the key press, before the chain sees it", () => {
    const m = new LaneMotion();
    m.update(16, 2 * LANE_WIDTH, 2, 0);
    m.press(3, 0);
    const x = run(m, 160, 2 * LANE_WIDTH, 2, 0);
    expect(x).toBeGreaterThan(2 * LANE_WIDTH + 100);
  });

  it("never leads the chain by more than one lane", () => {
    const m = new LaneMotion();
    m.update(16, 0, 0, 0);
    m.press(4, 0);
    expect(run(m, 600, 0, 0, 0)).toBeLessThanOrEqual(LANE_WIDTH);
  });

  it("settles onto the chain once it shows the same target", () => {
    const m = new LaneMotion();
    m.update(16, 2 * LANE_WIDTH, 2, 0);
    m.press(3, 0);
    run(m, 100, 2 * LANE_WIDTH, 2, 0);
    expect(Math.abs(run(m, 600, 3 * LANE_WIDTH, 3, 100) - 3 * LANE_WIDTH)).toBeLessThan(2);
  });

  it("gives up on a press the chain never reflects", () => {
    const m = new LaneMotion();
    m.update(16, 2 * LANE_WIDTH, 2, 0);
    m.press(3, 0);
    run(m, 200, 2 * LANE_WIDTH, 2, 0);
    expect(Math.abs(run(m, 1_500, 2 * LANE_WIDTH, 2, 200) - 2 * LANE_WIDTH)).toBeLessThan(2);
    expect(m.targetLane(2)).toBe(2);
  });

  it("clamps lanes to the road", () => {
    expect([clampLane(-1), clampLane(2.4), clampLane(9)]).toEqual([0, 2, 4]);
  });
});
