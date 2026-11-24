import { MAX_BOND_MULTIPLE } from "@sirenrun/sim";
import { describe, expect, it } from "vitest";
import { bondOptions } from "./bond";

const T = 1_000_000n;

describe("bond options", () => {
  it("offers 5 / 10 / 25 / 50 for a 5 tUSDC minimum", () => {
    expect(bondOptions(5n * T)).toEqual([5n * T, 10n * T, 25n * T, 50n * T]);
  });

  it("stays within what start_run accepts", () => {
    const min = 5n * T;
    for (const bond of bondOptions(min)) {
      expect(bond >= min && bond <= min * BigInt(MAX_BOND_MULTIPLE)).toBe(true);
    }
  });

  it("offers only the minimum when it is zero", () => {
    expect(bondOptions(0n)).toEqual([0n]);
  });
});
