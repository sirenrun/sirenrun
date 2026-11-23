import { mulBps } from "@sirenrun/sdk";
import { describe, expect, it } from "vitest";
import { addTrade, emptyStats, followRun, grossFromNet } from "./run-stats";

const terms = { feeBps: 200, runnerFeeBps: 50 };
const net = (amount: bigint, feeBps = terms.feeBps) => amount - (mulBps(amount, feeBps) ?? 0n);

describe("grossFromNet", () => {
  it("recovers whole and fractional tUSDC amounts exactly", () => {
    for (const amount of [1_000_000n, 5_000_000n, 10_000_000n, 2_500_000n, 1_230_000n]) {
      expect(grossFromNet(net(amount), terms.feeBps)).toBe(amount);
    }
  });

  it("always returns an amount that produces the given net", () => {
    for (const amount of [1n, 99n, 1_234_567n, 10_000_001n]) {
      expect(net(grossFromNet(net(amount), terms.feeBps))).toBe(net(amount));
    }
  });

  it("is the identity with no fee", () => {
    expect(grossFromNet(777n, 0)).toBe(777n);
  });
});

describe("addTrade", () => {
  it("tallies volume, trades, sides per line and the driver fee", () => {
    let s = emptyStats(4, true);
    s = addTrade(s, "a:0", { nonce: 4, market: 0, side: "yes", net: net(5_000_000n) }, terms);
    s = addTrade(s, "b:2", { nonce: 4, market: 2, side: "no", net: net(1_000_000n) }, terms);
    expect(s.trades).toBe(2);
    expect(s.volume).toBe(6_000_000n);
    expect(s.driverFee).toBe(25_000n + 5_000n);
    expect(s.lines[0]).toEqual({ ride: 5_000_000n, bust: 0n, trades: 1 });
    expect(s.lines[2]).toEqual({ ride: 0n, bust: 1_000_000n, trades: 1 });
    expect(s.complete).toBe(true);
  });

  it("counts a repeated event once", () => {
    const t = { nonce: 4, market: 1, side: "yes" as const, net: net(1_000_000n) };
    const once = addTrade(emptyStats(4, true), "a:1", t, terms);
    expect(addTrade(once, "a:1", t, terms)).toBe(once);
  });

  it("ignores trades from an older run", () => {
    const s = emptyStats(5, true);
    expect(addTrade(s, "x:0", { nonce: 4, market: 0, side: "no", net: 10n }, terms)).toBe(s);
  });

  it("starts a partial tally when a newer run's trade arrives first", () => {
    const s = addTrade(
      emptyStats(4, true),
      "x:0",
      { nonce: 6, market: 0, side: "no", net: net(1_000_000n) },
      terms,
    );
    expect(s.nonce).toBe(6);
    expect(s.complete).toBe(false);
    expect(s.trades).toBe(1);
  });
});

describe("followRun", () => {
  it("keeps the tally for the same run", () => {
    const s = emptyStats(3, true);
    expect(followRun(s, { nonce: 3, status: "live", seedReady: true })).toBe(s);
  });

  it("starts a complete tally for a run seen before its seed", () => {
    const s = followRun(emptyStats(3, true), { nonce: 4, status: "staging", seedReady: false });
    expect(s).toMatchObject({ nonce: 4, complete: true, trades: 0 });
  });

  it("marks a run joined after trading opened as partial", () => {
    const s = followRun(emptyStats(-1, false), { nonce: 4, status: "live", seedReady: true });
    expect(s.complete).toBe(false);
  });
});
