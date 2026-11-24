import { MAX_BOND_MULTIPLE } from "@sirenrun/sim";

/** Multiples of `Config.bond` offered at Drive: 5 / 10 / 25 / 50 with today's 5 minimum. */
const MULTIPLES = [1n, 2n, 5n, 10n] as const;

/**
 * Bonds a driver can pick, smallest first. Every option is within what `start_run` accepts:
 * at least the minimum and at most `MAX_BOND_MULTIPLE` times it.
 */
export function bondOptions(minBond: bigint): bigint[] {
  if (minBond <= 0n) return [minBond];
  return MULTIPLES.filter((m) => m <= BigInt(MAX_BOND_MULTIPLE)).map((m) => m * minBond);
}
