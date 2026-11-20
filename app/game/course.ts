import { generateRow, START_LANE, type Row } from "@sirenrun/sim";

/**
 * Obstacle rows of one run, derived from the VRF seed exactly as the program derives them.
 * Rows depend on the previous row's safe lane, so they are generated in order from row 0
 * and cached.
 */
export class Course {
  private readonly rows: Row[] = [];
  readonly seed: bigint;

  constructor(seed: bigint) {
    this.seed = seed;
  }

  row(index: number): Row {
    while (this.rows.length <= index) {
      const prev = this.rows.at(-1)?.safeLane ?? START_LANE;
      this.rows.push(generateRow(this.seed, this.rows.length, prev));
    }
    return this.rows[index] as Row;
  }
}
