import { COOLDOWN_TICKS } from "@sirenrun/sim";
import type { Arena, Balance, MarketStatus, PositionEntry } from "./accounts.ts";

export type ClaimError =
  | "NoEntry"
  | "InvalidArena"
  | "MarketClosed"
  | "NotResolved"
  | "ResultExpired"
  | "HouseInsufficient";

export type ClaimPreview =
  { ok: true; paid: bigint; kind: "win" | "loss" | "refund" } | { ok: false; error: ClaimError };

/** Outcome and resolution tick of `market` in run `nonce`, as `Arena::outcome` finds it. */
function outcome(
  arena: Arena,
  nonce: number,
  market: number,
): { status: MarketStatus; tick: number } | ClaimError {
  if (market >= arena.markets.length) return "MarketClosed";
  if (nonce === arena.nonce) {
    const m = arena.markets[market];
    if (m === undefined || m.status === "open") return "NotResolved";
    return { status: m.status, tick: m.resolvedTick };
  }
  const result = arena.results.find((r) => r.nonce === nonce);
  if (result === undefined) return "ResultExpired";
  return { status: result.outcomes[market] ?? "open", tick: result.resolvedTicks[market] ?? 0 };
}

/**
 * What `claim` would pay for `entry`, using the same rules as `Arena::claim`: VOID markets
 * and buys inside `COOLDOWN_TICKS` of the resolution are refunded at cost by the house.
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
  return found.status === entry.side
    ? { ok: true, paid: entry.shares, kind: "win" }
    : { ok: true, paid: 0n, kind: "loss" };
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
