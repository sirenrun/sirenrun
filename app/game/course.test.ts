import { generateRow, setInput, startState, step } from "@sirenrun/sim";
import { describe, expect, it } from "vitest";
import { Course } from "./course";

describe("Course", () => {
  it("matches the safe lanes the sim itself reaches", () => {
    const seed = 0x0123_4567_89ab_cdefn;
    const course = new Course(seed);
    const state = startState();
    let checked = 0;
    while (!state.busted && state.t < 1_200) {
      const next = generateRow(seed, state.row, state.safeLane);
      setInput(state, next.safeLane, false);
      step(state, seed);
      if (state.row > 0) {
        expect(course.row(state.row - 1).safeLane).toBe(state.safeLane);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });
});
