import { previewClaim, type Arena, type MarketStatus, type PositionEntry } from "@sirenrun/sdk";
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
    bondBack: boolean;
    /** Fees plus the bond if it came back, minus the entry fee and bond paid at the start. */
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
  terms: { feeBps: number; entryFee: bigint },
): RunSummary {
  const statuses = arena.markets.map((m) => m.status);
  const aborted = statuses.every((s) => s === "void");
  const bondBack = statuses[statuses.length - 1] === "yes";
  const fees = arena.runnerFees;
  const net = aborted ? 0n : fees - terms.entryFee - (bondBack ? 0n : arena.bond);

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
    driver: { address: shortAddress(arena.runner.toBase58()), fees, bondBack, net },
    you,
  };
}
