import {
  bondForfeited,
  previewClaim,
  type Arena,
  type MarketStatus,
  type PositionEntry,
} from "@sirenrun/sdk";
import { NITRO_CHARGES } from "@sirenrun/sim";
import { lineSeconds } from "./markets";

/** `AbCd…WxYz`, for showing a wallet without its full length. */
export const shortAddress = (key: string) => `${key.slice(0, 4)}…${key.slice(-4)}`;

/**
 * The results card shown after a run: how far the driver got, how each line resolved, what the
 * driver took home and what the viewer made. Pure, so the numbers can be tested.
 */

export interface RunSummary {
  nonce: number;
  /** Final live tick. */
  t: number;
  /** The run never went live (the VRF seed did not arrive): everything was refunded. */
  aborted: boolean;
  lines: { seconds: number; status: MarketStatus }[];
  driver: {
    address: string;
    /** Runner fees earned on trades. */
    fees: bigint;
    /** Part of the bond that covered BUST winnings; the rest came back. */
    bondLost: bigint;
    /** Of `bondLost`, what was refunded to RIDE holders on the busted lines. */
    bondToRide: bigint;
    /** Of `bondLost`, what went to the house because those lines had too few RIDE holders. */
    bondToHouse: bigint;
    /** Nitro fees paid, one per charge fired. */
    nitro: bigint;
    /** Fees minus the entry fee, the part of the bond lost and nitro. */
    net: bigint;
  };
  /** The viewer's result on this run, or null if they did not trade it. */
  you: { spent: bigint; paid: bigint; pnl: bigint } | null;
}

/** Positions the viewer held on this run, as last seen before claims emptied their slots. */
export type RunPositions = PositionEntry[];

/**
 * Remembers the viewer's entries for run `nonce` on arena `id` across balance updates. Claims
 * clear an entry's slot, so the last copy seen before that is kept.
 */
export function rememberPositions(
  kept: RunPositions,
  entries: readonly PositionEntry[],
  id: number,
  nonce: number,
): RunPositions {
  const key = (e: PositionEntry) => `${e.market}:${e.side}`;
  const fresh = entries.filter((e) => e.side !== "empty" && e.arenaId === id && e.nonce === nonce);
  const sameRun = kept.filter((e) => e.arenaId === id && e.nonce === nonce);
  const byKey = new Map(sameRun.map((e) => [key(e), e]));
  for (const e of fresh) byKey.set(key(e), e);
  const next = [...byKey.values()];
  const unchanged = next.length === kept.length && next.every((e, i) => e === kept[i]);
  return unchanged ? kept : next;
}

/** Gross amount paid for an entry: its cost is net of the trading fee. */
export function grossOf(cost: bigint, feeBps: number): bigint {
  const keep = 10_000n - BigInt(feeBps);
  return keep <= 0n ? cost : (cost * 10_000n + keep - 1n) / keep;
}

export function summarizeRun(
  arena: Arena,
  positions: RunPositions,
  terms: { feeBps: number; entryFee: bigint; nitroFee: bigint },
): RunSummary {
  const statuses = arena.markets.map((m) => m.status);
  const aborted = statuses.every((s) => s === "void");
  const fees = arena.runnerFees;
  const bondLost = aborted ? 0n : bondForfeited(arena);
  // Each busted line's share of the forfeit refunds its RIDE holders up to their cost
  // (`ride_back_bps`); what no RIDE holder can take stays with the house.
  const refunded = aborted
    ? 0n
    : arena.markets.reduce((sum, m) => sum + (m.rideCost * BigInt(m.rideBackBps)) / 10_000n, 0n);
  const bondToRide = refunded > bondLost ? bondLost : refunded;
  const bondToHouse = bondLost - bondToRide;
  const nitro = BigInt(NITRO_CHARGES - arena.sim.nitroLeft) * terms.nitroFee;
  const net = aborted ? 0n : fees - terms.entryFee - bondLost - nitro;

  let you: RunSummary["you"] = null;
  const mine = positions.filter((e) => e.arenaId === arena.id && e.nonce === arena.nonce);
  if (mine.length > 0) {
    let spent = 0n;
    let paid = 0n;
    for (const entry of mine) {
      spent += grossOf(entry.cost, terms.feeBps);
      const preview = previewClaim(arena, entry);
      if (preview.ok) paid += preview.paid;
    }
    you = { spent, paid, pnl: paid - spent };
  }

  return {
    nonce: arena.nonce,
    t: arena.sim.t,
    aborted,
    lines: arena.markets.map((m) => ({ seconds: lineSeconds(m.line), status: m.status })),
    driver: {
      address: shortAddress(arena.runner.toBase58()),
      fees,
      bondLost,
      bondToRide,
      bondToHouse,
      nitro,
      net,
    },
    you,
  };
}
