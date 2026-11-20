import vectors from "@sirenrun/test-vectors/fpmm.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import {
  formatTokenAmount,
  fpmmBuy,
  minSharesFor,
  mulBps,
  parseTokenAmount,
  priceOf,
  priceYes,
  quoteBuy,
  type Side,
} from "./index.ts";

describe("fpmmBuy", () => {
  it("matches fpmm::buy on every vector", () => {
    expect(vectors.buys.length).toBeGreaterThan(100);
    for (const v of vectors.buys) {
      const fill = fpmmBuy(BigInt(v.yes), BigInt(v.no), v.buyYes, BigInt(v.amount));
      const expected =
        v.fill === null
          ? null
          : { yes: BigInt(v.fill.yes), no: BigInt(v.fill.no), shares: BigInt(v.fill.shares) };
      expect(fill, JSON.stringify(v)).toEqual(expected);
    }
  });
});

describe("mulBps", () => {
  it("matches fpmm::mul_bps", () => {
    for (const v of vectors.bps) {
      expect(mulBps(BigInt(v.amount), v.bps)).toBe(BigInt(v.out));
    }
  });
});

describe("quoteBuy", () => {
  it("matches Arena::buy fills and errors", () => {
    for (const v of vectors.quotes) {
      const result = quoteBuy(
        { feeBps: v.feeBps, runnerFeeBps: v.runnerFeeBps, maxBuy: BigInt(v.maxBuy) },
        { yesR: BigInt(v.yesR), noR: BigInt(v.noR) },
        { bond: BigInt(v.bond), noProfitOi: BigInt(v.noProfitOi) },
        v.side as Side,
        BigInt(v.amount),
      );
      const label = JSON.stringify(v);
      if (v.result.kind === "error") {
        expect(result, label).toEqual({ ok: false, error: v.result.name });
        continue;
      }
      expect(result.ok, label).toBe(true);
      if (!result.ok) continue;
      const { avgPrice, priceAfter, ...amounts } = result.quote;
      expect(amounts, label).toEqual({
        fee: BigInt(v.result.fee ?? ""),
        runnerFee: BigInt(v.result.runnerFee ?? ""),
        net: BigInt(v.result.net ?? ""),
        shares: BigInt(v.result.shares ?? ""),
        yesR: BigInt(v.result.yesR ?? ""),
        noR: BigInt(v.result.noR ?? ""),
        noProfitOi: BigInt(v.result.noProfitOi ?? ""),
      });
      expect(priceAfter).toBeCloseTo(priceOf(v.side as Side, amounts.yesR, amounts.noR), 9);
      expect(avgPrice).toBeGreaterThanOrEqual(0);
    }
  });

  it("reports the spec example in display units", () => {
    const result = quoteBuy(
      { feeBps: 200, runnerFeeBps: 100, maxBuy: 50_000_000n },
      { yesR: 50_000_000n, noR: 50_000_000n },
      { bond: 25_000_000n, noProfitOi: 0n },
      "yes",
      10_000_000n,
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.quote.priceAfter).toBeGreaterThan(0.5);
    expect(result.quote.avgPrice).toBeCloseTo(10_000_000 / Number(result.quote.shares), 12);
  });
});

describe("display helpers", () => {
  it("price YES from reserves", () => {
    expect(priceYes(50n, 50n)).toBe(0.5);
    expect(priceYes(25n, 75n)).toBe(0.75);
    expect(priceYes(0n, 0n)).toBe(0.5);
    expect(priceOf("no", 25n, 75n)).toBe(0.25);
  });

  it("derive min_shares from slippage", () => {
    expect(minSharesFor(1_000_000n, 0)).toBe(1_000_000n);
    expect(minSharesFor(1_000_000n, 100)).toBe(990_000n);
    expect(minSharesFor(999n, 50)).toBe(994n);
    expect(() => minSharesFor(1n, 10_001)).toThrow(RangeError);
  });

  it("parse and format tUSDC amounts", () => {
    expect(parseTokenAmount("12.5")).toBe(12_500_000n);
    expect(parseTokenAmount("0.000001")).toBe(1n);
    expect(parseTokenAmount(" 7 ")).toBe(7_000_000n);
    expect(() => parseTokenAmount("1.0000001")).toThrow();
    expect(() => parseTokenAmount("-1")).toThrow();
    expect(formatTokenAmount(12_500_000n)).toBe("12.5");
    expect(formatTokenAmount(1n)).toBe("0.000001");
    expect(formatTokenAmount(-3_000_000n)).toBe("-3");
  });
});
