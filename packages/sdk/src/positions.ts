import { COOLDOWN_TICKS } from "@sirenrun/sim";
import type { Arena, Balance, MarketStatus, PositionEntry } from "./accounts.ts";

export type ClaimError =
  | "NoEntry"
  | "InvalidArena"
  | "MarketClosed"
  | "NotResolved"
  | "ResultExpired"
  | "HouseInsufficient";

/**
 * `rideBack`: a losing RIDE position on a line a bust closed, refunded part of its cost out
 * of the driver's forfeited bond.
 */
export type ClaimPreview =
  | { ok: true; paid: bigint; kind: "win" | "loss" | "refund" | "rideBack" }
  | { ok: false; error: ClaimError };

/** Outcome, resolution tick and RIDE refund share, as `Arena::outcome` finds them. */
function outcome(
  arena: Arena,
  nonce: number,
  market: number,
): { status: MarketStatus; tick: number; rideBackBps: number } | ClaimError {
  if (market >= arena.markets.length) return "MarketClosed";
  if (nonce === arena.nonce) {
    const m = arena.markets[market];
    if (m === undefined || m.status === "open") return "NotResolved";
    return { status: m.status, tick: m.resolvedTick, rideBackBps: m.rideBackBps };
  }
  const result = arena.results.find((r) => r.nonce === nonce);
  if (result === undefined) return "ResultExpired";
  return {
    status: result.outcomes[market] ?? "open",
    tick: result.resolvedTicks[market] ?? 0,
    rideBackBps: result.rideBackBps[market] ?? 0,
  };
}

/**
 * What `claim` would pay for `entry`, using the same rules as `Arena::claim`: VOID markets
 * and buys inside `COOLDOWN_TICKS` of the resolution are refunded at cost by the house, and
 * a losing RIDE position on a line a bust closed gets `rideBackBps` of its cost back.
 * Pass `houseAvailable` to predict `HouseInsufficient` for refunds.
 */
export function previewClaim(
  arena: Arena,
  entry: PositionEntry,
  houseAvailable?: bigint,
): ClaimPreview {
  if (entry.side === "empty") return { ok: false, error: "NoEntry" };
  if (entry.arenaId !== arena.id) return { ok: false, error: "InvalidArena" };
  const found = outcome(arena, entry.nonce, entry.market);
  if (typeof found === "string") return { ok: false, error: found };
  const refund = found.status === "void" || found.tick < entry.tick + COOLDOWN_TICKS;
  if (refund) {
    if (houseAvailable !== undefined && houseAvailable < entry.cost) {
      return { ok: false, error: "HouseInsufficient" };
    }
    return { ok: true, paid: entry.cost, kind: "refund" };
  }
  if (found.status === entry.side) return { ok: true, paid: entry.shares, kind: "win" };
  if (entry.side === "yes" && found.rideBackBps > 0) {
    const back = (entry.cost * BigInt(found.rideBackBps)) / 10_000n;
    if (houseAvailable !== undefined && houseAvailable < back) {
      return { ok: false, error: "HouseInsufficient" };
    }
    return { ok: true, paid: back, kind: "rideBack" };
  }
  return { ok: true, paid: 0n, kind: "loss" };
}

export interface ClaimableEntry {
  index: number;
  entry: PositionEntry;
  preview: Extract<ClaimPreview, { ok: true }>;
}

/**
 * Entries in `balance` that can be claimed now against `arena`, for auto-claim. Losing
 * entries are included: claiming them frees the slot for new positions.
 */
export function claimableEntries(
  balance: Balance,
  arena: Arena,
  houseAvailable?: bigint,
): ClaimableEntry[] {
  const out: ClaimableEntry[] = [];
  balance.entries.forEach((entry, index) => {
    if (entry.side === "empty" || entry.arenaId !== arena.id) return;
    const preview = previewClaim(arena, entry, houseAvailable);
    if (preview.ok) out.push({ index, entry, preview });
  });
  return out;
}

/**
 * Indexes of entries older than the 16-run results ring. `claim` rejects them with
 * `ResultExpired`, so they keep their slot; the UI should say so.
 */
export function expiredEntries(balance: Balance, arena: Arena): number[] {
  return balance.entries.flatMap((entry, index) => {
    if (entry.side === "empty" || entry.arenaId !== arena.id) return [];
    const preview = previewClaim(arena, entry);
    return !preview.ok && preview.error === "ResultExpired" ? [index] : [];
  });
}
