import { BPS_DENOMINATOR, U128_MAX, U64_MAX } from "./constants.ts";

/**
 * Client copies of `market/fpmm.rs` and the quote part of `Arena::buy`, in exact integer
 * math. They are checked against `packages/test-vectors/fpmm.json`, which the program crate
 * generates, so a quote here is the fill the program will produce for the same pool.
 */

export type Side = "yes" | "no";

export interface Fill {
  yes: bigint;
  no: bigint;
  shares: bigint;
}

const fitsU64 = (v: bigint) => v >= 0n && v <= U64_MAX;
const fitsU128 = (v: bigint) => v >= 0n && v <= U128_MAX;

/** `fpmm::buy`. Returns `null` where the program returns an error (overflow, empty pool). */
export function fpmmBuy(yes: bigint, no: bigint, buyYes: boolean, amount: bigint): Fill | null {
  const [same, other] = buyYes ? [yes, no] : [no, yes];
  const k = same * other;
  const otherAfter = other + amount;
  if (!fitsU128(k) || !fitsU128(otherAfter) || otherAfter === 0n) {
    return null;
  }
  const sameBeforePayout = same + amount;
  const sameAfter = (k + otherAfter - 1n) / otherAfter;
  const shares = sameBeforePayout - sameAfter;
  if (shares < 0n || !fitsU64(shares) || !fitsU64(sameAfter) || !fitsU64(otherAfter)) {
    return null;
  }
  return buyYes
    ? { yes: sameAfter, no: otherAfter, shares }
    : { yes: otherAfter, no: sameAfter, shares };
}

/** `fpmm::mul_bps`: `amount * bps / 10_000`, rounded down. */
export function mulBps(amount: bigint, bps: number): bigint | null {
  const out = (amount * BigInt(bps)) / BPS_DENOMINATOR;
  return fitsU64(out) ? out : null;
}

/** YES price in [0, 1], for display only. Equal reserves give 0.5. */
export function priceYes(yesR: bigint, noR: bigint): number {
  const total = yesR + noR;
  return total === 0n ? 0.5 : Number((noR * 1_000_000n) / total) / 1_000_000;
}

export function priceOf(side: Side, yesR: bigint, noR: bigint): number {
  const yes = priceYes(yesR, noR);
  return side === "yes" ? yes : 1 - yes;
}

export interface BuyTerms {
  feeBps: number;
  runnerFeeBps: number;
  maxBuy: bigint;
}

export interface Pool {
  yesR: bigint;
  noR: bigint;
}

/**
 * What the BUST profit cap reads: the bought line's BUST profit and that of the other lines
 * still open. Passed lines owe BUST nothing, so they do not count.
 */
export interface RunCap {
  bond: bigint;
  noProfit: bigint;
  otherNoProfit: bigint;
}

/** `RunCap` for buying `market` in `arena`, as `Arena::open_no_profit` sums it. */
export function runCap(
  arena: { bond: bigint; markets: { status: string; noProfit: bigint }[] },
  market: number,
): RunCap {
  let other = 0n;
  arena.markets.forEach((m, i) => {
    if (i !== market && m.status === "open") other += m.noProfit;
  });
  return {
    bond: arena.bond,
    noProfit: arena.markets[market]?.noProfit ?? 0n,
    otherNoProfit: other,
  };
}

export interface Quote {
  fee: bigint;
  /** Part of `fee` credited to the driver. */
  runnerFee: bigint;
  /** Collateral that enters the pool: `amount - fee`. */
  net: bigint;
  shares: bigint;
  yesR: bigint;
  noR: bigint;
  /** The bought line's BUST profit after the trade. */
  noProfit: bigint;
  /** `amount / shares`, the price paid per share including the fee. */
  avgPrice: number;
  /** Price of the bought side once the trade lands. */
  priceAfter: number;
}

/** Errors a quote can predict. Status, seed, balance and entry checks need live accounts. */
export type QuoteError = "TooLarge" | "MathOverflow" | "NoInterestCapReached";

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; error: QuoteError };

/** Same checks, order and rounding as `Arena::buy` after its status and seed checks. */
export function quoteBuy(
  terms: BuyTerms,
  pool: Pool,
  run: RunCap,
  side: Side,
  amount: bigint,
): QuoteResult {
  if (amount > terms.maxBuy) {
    return { ok: false, error: "TooLarge" };
  }
  const fee = mulBps(amount, terms.feeBps);
  const runnerFee = mulBps(amount, terms.runnerFeeBps);
  if (fee === null || runnerFee === null || fee > amount) {
    return { ok: false, error: "MathOverflow" };
  }
  const net = amount - fee;
  const fill = fpmmBuy(pool.yesR, pool.noR, side === "yes", net);
  if (fill === null) {
    return { ok: false, error: "MathOverflow" };
  }
  let noProfit = run.noProfit;
  if (side === "no") {
    noProfit += fill.shares - net;
    if (!fitsU64(noProfit) || !fitsU64(noProfit + run.otherNoProfit)) {
      return { ok: false, error: "MathOverflow" };
    }
    if (noProfit + run.otherNoProfit > run.bond) {
      return { ok: false, error: "NoInterestCapReached" };
    }
  }
  return {
    ok: true,
    quote: {
      fee,
      runnerFee,
      net,
      shares: fill.shares,
      yesR: fill.yes,
      noR: fill.no,
      noProfit,
      avgPrice: fill.shares === 0n ? 0 : Number(amount) / Number(fill.shares),
      priceAfter: priceOf(side, fill.yes, fill.no),
    },
  };
}

/** `min_shares` for a buy that may fill up to `slippageBps` worse than `shares`. */
export function minSharesFor(shares: bigint, slippageBps: number): bigint {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000) {
    throw new RangeError(`slippage must be 0..10000 bps, got ${slippageBps}`);
  }
  return (shares * (BPS_DENOMINATOR - BigInt(slippageBps))) / BPS_DENOMINATOR;
}

/** Amount of tUSDC (6 decimals) from a decimal string such as "12.5". */
export function parseTokenAmount(text: string): bigint {
  const match = /^(\d+)(?:\.(\d{0,6}))?$/.exec(text.trim());
  if (match === null) {
    throw new Error(`invalid tUSDC amount "${text}"`);
  }
  const whole = BigInt(match[1] ?? "0");
  const frac = BigInt((match[2] ?? "").padEnd(6, "0"));
  return whole * 1_000_000n + frac;
}

/** Decimal string of a tUSDC amount, trailing zeros trimmed: 12_500_000n → "12.5". */
export function formatTokenAmount(amount: bigint): string {
  const sign = amount < 0n ? "-" : "";
  const abs = amount < 0n ? -amount : amount;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${sign}${whole}${frac === "" ? "" : `.${frac}`}`;
}
