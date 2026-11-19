import { BLOCK_BASE, BLOCK_CAP, EMPTY_ROWS, LANES } from "./constants.ts";

const GOLDEN_GAMMA = 0x9e3779b97f4a7c15n;
const u64 = (x: bigint) => BigInt.asUintN(64, x);

export function splitmix64(x: bigint): bigint {
  const s = u64(x + GOLDEN_GAMMA);
  let z = u64((s ^ (s >> 30n)) * 0xbf58476d1ce4e5b9n);
  z = u64((z ^ (z >> 27n)) * 0x94d049bb133111ebn);
  return z ^ (z >> 31n);
}

export function rowHash(seed: bigint, row: number): bigint {
  return splitmix64(seed ^ u64(BigInt(row) * GOLDEN_GAMMA));
}

export function nextSafeLane(prev: number, hash: bigint): number {
  switch (hash & 0b11n) {
    case 0n:
      return Math.max(prev - 1, 0);
    case 3n:
      return Math.min(prev + 1, LANES - 1);
    default:
      return prev;
  }
}

export function blocked(row: number, lane: number, safeLane: number, hash: bigint): boolean {
  if (row < EMPTY_ROWS || lane === safeLane) {
    return false;
  }
  const threshold = Math.min(BLOCK_CAP, BLOCK_BASE + Math.floor(row / 2));
  const byte = (hash >> BigInt(8 * (lane + 1))) & 0xffn;
  return byte < BigInt(threshold);
}

export interface Row {
  safeLane: number;
  blocked: boolean[];
}

export function generateRow(seed: bigint, row: number, prevSafeLane: number): Row {
  const hash = rowHash(seed, row);
  const safeLane = nextSafeLane(prevSafeLane, hash);
  return {
    safeLane,
    blocked: Array.from({ length: LANES }, (_, lane) => blocked(row, lane, safeLane, hash)),
  };
}
