import { describe, expect, it } from "vitest";
import { botInput } from "./bot.ts";
import { INVULN_TICKS } from "./constants.ts";
import { blocked, generateRow, nextSafeLane, splitmix64 } from "./course.ts";
import { setInput, startState } from "./state.ts";
import { step } from "./step.ts";

describe("course", () => {
  it("matches the reference splitmix64 output", () => {
    expect(splitmix64(0n)).toBe(0xe220a8397b1dcdafn);
  });

  it("moves the safe lane by at most one and keeps it on the road", () => {
    expect([0n, 1n, 2n, 3n].map((h) => nextSafeLane(2, h))).toEqual([1, 2, 2, 3]);
    expect(nextSafeLane(0, 0n)).toBe(0);
    expect(nextSafeLane(4, 3n)).toBe(4);
  });

  it("never blocks opening rows or the safe lane", () => {
    expect(blocked(2, 1, 0, 0n)).toBe(false);
    expect(blocked(500, 3, 3, 0n)).toBe(false);
  });

  it("keeps every row's safe lane clear", () => {
    let safe = 2;
    for (let row = 0; row < 2000; row += 1) {
      const r = generateRow(42n, row, safe);
      expect(r.blocked[r.safeLane]).toBe(false);
      expect(Math.abs(r.safeLane - safe)).toBeLessThanOrEqual(1);
      safe = r.safeLane;
    }
  });
});

describe("perfect bot", () => {
  function run(seed: bigint, useNitro: boolean) {
    const state = startState();
    let hits = 0;
    while (!state.busted) {
      const input = botInput(state, seed, useNitro);
      setInput(state, input.targetLane, input.nitro);
      step(state, seed);
      if (state.invuln === INVULN_TICKS) hits += 1;
    }
    return { t: state.t, hits };
  }

  it.each([1n, 2n, 3n, 42n, 1234567n])("seed %s survives 90.0 s, or 90.1 s with nitro", (seed) => {
    expect(run(seed, false)).toEqual({ t: 900, hits: 0 });
    expect(run(seed, true)).toEqual({ t: 901, hits: 0 });
  });
});
