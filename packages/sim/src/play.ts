import { parseArgs } from "node:util";
import { botInput } from "./bot.ts";
import { LANES, TICK_MS } from "./constants.ts";
import { generateRow } from "./course.ts";
import { carLane, setInput, startState } from "./state.ts";
import { step } from "./step.ts";

const { values } = parseArgs({
  options: {
    seed: { type: "string", default: "42" },
    nitro: { type: "boolean", default: false },
  },
});

const seed = BigInt(values.seed);
const state = startState();
const seconds = (ticks: number) => ((ticks * TICK_MS) / 1000).toFixed(1).padStart(5);

while (!state.busted) {
  const input = botInput(state, seed, values.nitro);
  setInput(state, input.targetLane, input.nitro);

  const firstRow = state.row;
  let safeLane = state.safeLane;
  step(state, seed);

  for (let r = firstRow; r < state.row; r += 1) {
    const row = generateRow(seed, r, safeLane);
    safeLane = row.safeLane;
    const lanes = Array.from({ length: LANES }, (_, lane) => {
      if (lane === carLane(state)) return row.blocked[lane] ? "*" : "C";
      return row.blocked[lane] ? "X" : ".";
    }).join(" ");
    console.log(`${seconds(state.t)}s  |${lanes}|  gap ${state.policeGap}`);
  }
}

console.log(`BUSTED at ${seconds(state.t).trim()} s`);
