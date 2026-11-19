import { generateRow } from "./course.ts";
import type { SimState } from "./state.ts";

const NITRO_BELOW_GAP = 1500;

/** Steers to the safe lane of the next row; fires nitro once the gap is below its threshold. */
export function botInput(
  state: SimState,
  seed: bigint,
  useNitro: boolean,
): { targetLane: number; nitro: boolean } {
  const next = generateRow(seed, state.row, state.safeLane);
  const nitro =
    useNitro && state.policeGap < NITRO_BELOW_GAP && state.nitroLeft > 0 && state.nitroTicks === 0;
  return { targetLane: next.safeLane, nitro };
}
