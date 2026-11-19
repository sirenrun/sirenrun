import vectors from "@sirenrun/test-vectors/sim.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import { setInput, startState, type SimState } from "./state.ts";
import { step } from "./step.ts";

const CHECKPOINT_EVERY = 50;

interface InputEvent {
  tick: number;
  targetLane: number;
  nitro: boolean;
}

function replay(seed: bigint, inputs: InputEvent[]): SimState[] {
  const state = startState();
  const checkpoints = [{ ...state }];
  let next = 0;
  while (!state.busted) {
    while (inputs[next]?.tick === state.t) {
      const input = inputs[next] as InputEvent;
      setInput(state, input.targetLane, input.nitro);
      next += 1;
    }
    step(state, seed);
    if (state.t % CHECKPOINT_EVERY === 0 || state.busted) {
      checkpoints.push({ ...state });
    }
  }
  return checkpoints;
}

describe("sim parity with the Rust vectors", () => {
  it.each(vectors.cases)("$name", ({ seed, inputs, checkpoints }) => {
    expect(replay(BigInt(seed), inputs)).toEqual(checkpoints);
  });
});
