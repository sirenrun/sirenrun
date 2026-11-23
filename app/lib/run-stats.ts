import { mulBps, type Side } from "@sirenrun/sdk";

/**
 * Live totals for one run, tallied in the browser from `Trade` events. Nothing onchain stores
 * trade history, so a viewer who joins mid-run only sees the trades since they joined;
 * `complete` says whether these totals cover the whole run.
 */
export interface LineStats {
  ride: bigint;
  bust: bigint;
  trades: number;
}

export interface RunStats {
  nonce: number;
  trades: number;
  /** Amount spent by traders, fees included. */
  volume: bigint;
  /** The driver's cut of every trade. */
  driverFee: bigint;
  lines: LineStats[];
  complete: boolean;
  /** Event keys already counted; a websocket can deliver the same transaction twice. */
  seen: readonly string[];
}

export interface FeeTerms {
  feeBps: number;
  runnerFeeBps: number;
}

const LINES = 3;
const SEEN_LIMIT = 256;

export function emptyStats(nonce: number, complete: boolean): RunStats {
  return {
    nonce,
    trades: 0,
    volume: 0n,
    driverFee: 0n,
    lines: Array.from({ length: LINES }, () => ({ ride: 0n, bust: 0n, trades: 0 })),
    complete,
    seen: [],
  };
}

export function addTrade(
  stats: RunStats,
  key: string,
  trade: { nonce: number; market: number; side: Side; amount: bigint },
  terms: FeeTerms,
): RunStats {
  // A trade for a newer run means we missed its start: begin a fresh, partial tally.
  const base = trade.nonce > stats.nonce ? emptyStats(trade.nonce, false) : stats;
  if (trade.nonce < base.nonce || base.seen.includes(key)) return stats;
  const { amount } = trade;
  const lines = base.lines.map((line, i) =>
    i !== trade.market
      ? line
      : {
          ride: line.ride + (trade.side === "yes" ? amount : 0n),
          bust: line.bust + (trade.side === "no" ? amount : 0n),
          trades: line.trades + 1,
        },
  );
  return {
    ...base,
    trades: base.trades + 1,
    volume: base.volume + amount,
    driverFee: base.driverFee + (mulBps(amount, terms.runnerFeeBps) ?? 0n),
    lines,
    seen: [...base.seen, key].slice(-SEEN_LIMIT),
  };
}

/**
 * Moves the tally to a newer run when the arena shows one. Trades need the seed, so a run
 * first seen staging without it has had none yet and its totals will be complete.
 */
export function followRun(
  stats: RunStats,
  arena: { nonce: number; status: string; seedReady: boolean },
): RunStats {
  if (arena.nonce <= stats.nonce) return stats;
  return emptyStats(arena.nonce, arena.status === "staging" && !arena.seedReady);
}

/**
 * Folds a run's indexed trades into the live tally. Keys match the live feed's, so trades
 * seen both ways count once. The result covers the whole run, so it is marked complete.
 */
export function mergeTrades(
  stats: RunStats,
  nonce: number,
  trades: readonly { key: string; market: number; side: Side; amount: string }[],
  terms: FeeTerms,
): RunStats {
  if (stats.nonce !== nonce) return stats;
  let next = stats;
  for (const t of trades) {
    next = addTrade(
      next,
      t.key,
      { nonce, market: t.market, side: t.side, amount: BigInt(t.amount) },
      terms,
    );
  }
  return { ...next, complete: true };
}
