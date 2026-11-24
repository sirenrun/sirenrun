import {
  previewClaim,
  priceYes,
  quoteBuy,
  type Arena,
  type Balance,
  type BuyTerms,
  type EntrySide,
  type Market,
  type MarketStatus,
  type Pool,
  type RunCap,
  type Side,
} from "@sirenrun/sdk";
import { TICK_MS } from "@sirenrun/sim";

/**
 * Pure helpers for the markets panel. In the UI the sides are RIDE (= YES, the driver passes
 * the line) and BUST (= NO); onchain they stay YES/NO.
 */

export const SIDE_LABEL: Record<Side, string> = { yes: "RIDE", no: "BUST" };
export const PRESETS = [1, 5, 10] as const;
/** Buys fail rather than fill more than 2% worse than quoted. */
export const SLIPPAGE_BPS = 200;

export const lineSeconds = (line: number) => Math.round((line * TICK_MS) / 1000);

/** BUST room is offered in whole cents of tUSDC (6 decimals). */
const CENT = 10_000n;

/**
 * The largest BUST buy, in whole cents, that still fits under the run's BUST cap (what BUST
 * can win across the open lines is at most the driver's bond), or 0n when not even a cent
 * fits. Winnings grow with the amount, so a binary search finds the edge.
 */
export function bustRoom(terms: BuyTerms, pool: Pool, cap: RunCap, upTo: bigint): bigint {
  const fits = (amount: bigint) => quoteBuy(terms, pool, cap, "no", amount).ok;
  let lo = 0n;
  let hi = upTo / CENT;
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    if (fits(mid * CENT)) lo = mid;
    else hi = mid - 1n;
  }
  return lo * CENT;
}

/** YES prices of the three lines at one live tick. Client-side only; nothing stores this. */
export interface PricePoint {
  t: number;
  yes: number[];
}

export interface PriceHistory {
  nonce: number;
  points: PricePoint[];
}

const MAX_POINTS = 600;

/**
 * Adds the arena's current prices to the history. A new run starts a new history; a point is
 * added when the tick advances, and the oldest are dropped past `MAX_POINTS`.
 */
export function appendHistory(history: PriceHistory, arena: Arena): PriceHistory {
  const point = { t: arena.sim.t, yes: arena.markets.map((m) => priceYes(m.yesR, m.noR)) };
  if (arena.nonce !== history.nonce) return { nonce: arena.nonce, points: [point] };
  const last = history.points[history.points.length - 1];
  if (last !== undefined && last.t === point.t && same(last.yes, point.yes)) return history;
  const points =
    last !== undefined && last.t === point.t
      ? [...history.points.slice(0, -1), point]
      : [...history.points, point];
  return { nonce: history.nonce, points: points.slice(-MAX_POINTS) };
}

const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export type Trend = "up" | "down" | "flat";

/** How the YES price of `market` moved over the last `window` ticks. */
export function trendOf(history: PriceHistory, market: number, window = 30): Trend {
  const points = history.points;
  const last = points[points.length - 1];
  if (last === undefined) return "flat";
  const since = points.find((p) => p.t >= last.t - window) ?? last;
  const delta = (last.yes[market] ?? 0) - (since.yes[market] ?? 0);
  if (Math.abs(delta) < 0.005) return "flat";
  return delta > 0 ? "up" : "down";
}

export interface MarketView {
  index: number;
  seconds: number;
  status: MarketStatus;
  /** RIDE (YES) price, 0..1. */
  ride: number;
  open: boolean;
  /** "RIDE pays", "BUST pays", "Void", or null while open. */
  result: string | null;
}

export function marketView(market: Market, index: number): MarketView {
  const ride = priceYes(market.yesR, market.noR);
  const result =
    market.status === "yes"
      ? "RIDE pays"
      : market.status === "no"
        ? "BUST pays"
        : market.status === "void"
          ? "Void, refunded"
          : null;
  return {
    index,
    seconds: lineSeconds(market.line),
    status: market.status,
    ride,
    open: market.status === "open",
    result,
  };
}

export const percent = (p: number) => `${Math.round(p * 100)}%`;

/** Why the viewer cannot trade right now, or null when they can. */
export function tradeBlocker(opts: {
  arena: Arena | null;
  wallet: string | null;
  sessionLive: boolean;
  balanceDelegated: boolean;
  available: bigint;
}): { reason: string; action?: "connect" | "deposit" | "session" } | null {
  const { arena } = opts;
  if (arena === null) return { reason: "Connecting to the channel…" };
  if (arena.status === "idle") return { reason: "Markets open when a driver starts a run." };
  if (arena.status === "settled") return { reason: "This run is over. Markets reopen next run." };
  if (!arena.seedReady) return { reason: "Rolling the course…" };
  if (opts.wallet === null) return { reason: "Connect a wallet to trade.", action: "connect" };
  if (opts.wallet === arena.runner.toBase58()) {
    return { reason: "You are driving this run, so you cannot trade on it." };
  }
  if (!opts.balanceDelegated || opts.available === 0n) {
    return { reason: "Deposit tUSDC to your game balance to trade.", action: "deposit" };
  }
  if (!opts.sessionLive) {
    return { reason: "Start a session to trade without popups.", action: "session" };
  }
  return null;
}

export interface PositionRow {
  index: number;
  label: string;
  side: Side;
  nonce: number;
  shares: bigint;
  cost: bigint;
  /** Open: current value at the RIDE/BUST price. Settled: what claim pays. */
  value: bigint;
  state: "open" | "won" | "lost" | "refund" | "expired";
}

const sideOf = (s: EntrySide): Side | null => (s === "yes" ? "yes" : s === "no" ? "no" : null);

/** The viewer's positions on `arena`, newest run first. */
export function positionRows(balance: Balance | null, arena: Arena): PositionRow[] {
  if (balance === null) return [];
  const rows: PositionRow[] = [];
  balance.entries.forEach((entry, index) => {
    const side = sideOf(entry.side);
    if (side === null || entry.arenaId !== arena.id) return;
    const market = arena.markets[entry.market];
    const label = `${SIDE_LABEL[side]} ${market === undefined ? "?" : lineSeconds(market.line)}s`;
    const base = { index, label, side, nonce: entry.nonce, shares: entry.shares, cost: entry.cost };
    const preview = previewClaim(arena, entry);
    if (preview.ok) {
      const state = preview.kind === "win" ? "won" : preview.kind === "loss" ? "lost" : "refund";
      rows.push({ ...base, value: preview.paid, state });
      return;
    }
    if (preview.error === "ResultExpired") {
      rows.push({ ...base, value: 0n, state: "expired" });
      return;
    }
    const price = market === undefined ? 0 : priceYes(market.yesR, market.noR);
    const p = side === "yes" ? price : 1 - price;
    rows.push({ ...base, value: scaleBy(entry.shares, p), state: "open" });
  });
  return rows.sort((a, b) => b.nonce - a.nonce || a.index - b.index);
}

/** `amount * p` in base units, without going through floats for the amount. */
function scaleBy(amount: bigint, p: number): bigint {
  const ppm = BigInt(Math.round(Math.min(1, Math.max(0, p)) * 1_000_000));
  return (amount * ppm) / 1_000_000n;
}

export interface TickerItem {
  key: string;
  /** The run this trade belongs to; the feed only ever shows one run. */
  nonce: number;
  side: Side;
  /** Line length in seconds, or null if the line was not known when the trade arrived. */
  seconds: number | null;
  /** Amount after fees, as the event reports it. */
  net: bigint;
  /** `Date.now()` when the trade arrived, for "3s ago". */
  at: number;
}

/** One trade in the feed: what was bought on which line, never who (the event carries no trader). */
export function tickerItem(
  signature: string,
  trade: { nonce: number; market: number; side: Side; net: bigint },
  lines: number[],
  at: number,
): TickerItem {
  const line = lines[trade.market];
  return {
    key: `${signature}:${trade.market}`,
    nonce: trade.nonce,
    side: trade.side,
    seconds: line === undefined ? null : lineSeconds(line),
    net: trade.net,
    at,
  };
}

/**
 * Adds a trade to the newest-first feed. A trade from a newer run clears the feed, so trades
 * from different runs never mix; late trades from an older run are dropped.
 */
export function pushTicker(feed: TickerItem[], item: TickerItem, limit: number): TickerItem[] {
  const current = feed[0]?.nonce;
  if (current !== undefined && item.nonce < current) return feed;
  const base = current !== undefined && item.nonce > current ? [] : feed;
  if (base.some((t) => t.key === item.key)) return feed;
  return [item, ...base].slice(0, limit);
}

/** "now", "12s", "3m": compact age for the feed. */
export function ago(at: number, now: number): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 2) return "now";
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m`;
}

const FRIENDLY: Record<string, string> = {
  ArenaNotLive: "Trading is closed: the run is over.",
  MarketClosed: "That line has already resolved.",
  InsufficientBalance: "Not enough tUSDC in your game balance.",
  TooLarge: "That is more than the maximum single buy.",
  Slippage: "The price moved before your buy landed. Try again.",
  NoInterestCapReached: "BUST is full on this run: the driver's bond caps what BUST can win.",
  RunnerCannotTrade: "You are driving this run, so you cannot trade on it.",
  LineClosing: "That line resolves in a moment; trading on it has closed.",
  NoFreeEntry: "All 8 position slots are in use. Claim settled positions first.",
  SeedNotReady: "The course is still being rolled. Try again in a moment.",
  Unauthorized: "Your session is not valid for this wallet. Start a new session.",
  HouseInsufficient: "The house cannot cover this refund right now.",
};

export function friendlyError(name: string | undefined, fallback: string): string {
  return (name !== undefined ? FRIENDLY[name] : undefined) ?? name ?? fallback;
}
