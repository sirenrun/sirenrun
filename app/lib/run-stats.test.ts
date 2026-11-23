import { describe, expect, it } from "vitest";
import { addTrade, emptyStats, followRun, mergeTrades } from "./run-stats";

const terms = { feeBps: 200, runnerFeeBps: 50 };

describe("addTrade", () => {
  it("tallies volume, trades, sides per line and the driver fee", () => {
    let s = emptyStats(4, true);
    s = addTrade(s, "a:0", { nonce: 4, market: 0, side: "yes", amount: 5_000_000n }, terms);
    s = addTrade(s, "b:2", { nonce: 4, market: 2, side: "no", amount: 1_000_000n }, terms);
    expect(s.trades).toBe(2);
    expect(s.volume).toBe(6_000_000n);
    expect(s.driverFee).toBe(25_000n + 5_000n);
    expect(s.lines[0]).toEqual({ ride: 5_000_000n, bust: 0n, trades: 1 });
    expect(s.lines[2]).toEqual({ ride: 0n, bust: 1_000_000n, trades: 1 });
    expect(s.complete).toBe(true);
  });

  it("counts a repeated event once", () => {
    const t = { nonce: 4, market: 1, side: "yes" as const, amount: 1_000_000n };
    const once = addTrade(emptyStats(4, true), "a:1", t, terms);
    expect(addTrade(once, "a:1", t, terms)).toBe(once);
  });

  it("ignores trades from an older run", () => {
    const s = emptyStats(5, true);
    expect(addTrade(s, "x:0", { nonce: 4, market: 0, side: "no", amount: 10n }, terms)).toBe(s);
  });

  it("starts a partial tally when a newer run's trade arrives first", () => {
    const s = addTrade(
      emptyStats(4, true),
      "x:0",
      { nonce: 6, market: 0, side: "no", amount: 1_000_000n },
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

describe("mergeTrades", () => {
  it("adds indexed trades once, even if the live feed already counted some", () => {
    let s = emptyStats(7, false);
    s = addTrade(s, "a:0", { nonce: 7, market: 0, side: "yes", amount: 5_000_000n }, terms);
    const merged = mergeTrades(
      s,
      7,
      [
        { key: "a:0", market: 0, side: "yes", amount: "5000000" },
        { key: "b:1", market: 1, side: "no", amount: "2000000" },
      ],
      terms,
    );
    expect(merged.trades).toBe(2);
    expect(merged.volume).toBe(7_000_000n);
    expect(merged.complete).toBe(true);
  });

  it("ignores a response for a run that has already ended", () => {
    const s = emptyStats(8, false);
    expect(mergeTrades(s, 7, [{ key: "x:0", market: 0, side: "yes", amount: "1" }], terms)).toBe(s);
  });
});
