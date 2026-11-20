import { describe, expect, it } from "vitest";
import type { Arena, Market, MarketStatus } from "./accounts.ts";
import { bondAtRisk, bondForfeited } from "./positions.ts";

const market = (status: MarketStatus, noProfit: bigint): Market => ({
  line: 300,
  status,
  yesR: 1n,
  noR: 1n,
  resolvedTick: 0,
  houseYes: 0n,
  houseNo: 0n,
  noProfit,
  rideCost: 0n,
  rideBackBps: 0,
});

const arena = (markets: Market[]): Arena => ({ bond: 25n, markets }) as unknown as Arena;

describe("driver bond", () => {
  it("is not at risk while nobody holds BUST", () => {
    expect(bondAtRisk(arena([market("open", 0n), market("open", 0n), market("open", 0n)]))).toBe(
      0n,
    );
  });

  it("puts at risk only what BUST would win on the open lines, at most the bond", () => {
    expect(bondAtRisk(arena([market("yes", 20n), market("open", 3n), market("open", 4n)]))).toBe(
      7n,
    );
    expect(bondAtRisk(arena([market("open", 20n), market("open", 9n), market("open", 0n)]))).toBe(
      25n,
    );
  });

  it("forfeits what BUST won on the lines the bust closed", () => {
    expect(bondForfeited(arena([market("yes", 20n), market("no", 3n), market("no", 4n)]))).toBe(7n);
    expect(bondForfeited(arena([market("yes", 9n), market("yes", 9n), market("yes", 9n)]))).toBe(
      0n,
    );
    expect(bondForfeited(arena([market("no", 30n), market("no", 0n), market("no", 0n)]))).toBe(25n);
  });
});
