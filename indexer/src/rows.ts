import type { SirenrunEvent } from "@sirenrun/sdk";

/**
 * Pure mapping from a program event to the row it writes. Kept apart from the database so
 * it can be tested without one. Amounts become decimal strings for `numeric` columns.
 */
export type Write =
  | {
      kind: "runStarted";
      arena: number;
      nonce: number;
      runner: string;
      entryFee: string;
      bond: string;
      at: Date;
    }
  | {
      kind: "runSettled";
      arena: number;
      nonce: number;
      runner: string;
      t: number;
      outcomes: string[];
      runnerFees: string;
      runnerPaid: string;
      at: Date;
    }
  | {
      kind: "trade";
      signature: string;
      market: number;
      arena: number;
      nonce: number;
      side: "yes" | "no";
      owner: string;
      amount: string;
      net: string;
      shares: string;
      at: Date;
    }
  | {
      kind: "claim";
      signature: string;
      owner: string;
      arena: number;
      nonce: number;
      market: number;
      paid: string;
      at: Date;
    }
  | {
      kind: "nitro";
      signature: string;
      arena: number;
      nonce: number;
      runner: string;
      fee: string;
      at: Date;
    };

/**
 * `arenaIds` maps an arena PDA (base58) to its id. Events for other arenas, and events the
 * stats do not need (seed, line crossed), map to null.
 */
/** The all-zero key: what a field missing from an older event layout decodes to. */
const ZERO_KEY = "11111111111111111111111111111111";

/**
 * True for events written by a program build before the current layout. Decoding such an
 * event with the current IDL does not fail; the newer fields just come out as zeros, so they
 * are recognised by those zeros. No real run has no runner, no real trade has no owner, and
 * every real run posts a bond.
 */
export function isOldLayout(event: SirenrunEvent): boolean {
  switch (event.name) {
    case "Trade":
      return event.data.owner.toBase58() === ZERO_KEY || event.data.amount === 0n;
    case "RunSettled":
      return event.data.runner.toBase58() === ZERO_KEY;
    case "RunStarted":
      return event.data.bond === 0n && event.data.entryFee === 0n;
    case "NitroUsed":
      return event.data.runner.toBase58() === ZERO_KEY;
    default:
      return false;
  }
}

export function toWrite(
  event: SirenrunEvent,
  signature: string,
  at: Date,
  arenaIds: ReadonlyMap<string, number>,
): Write | null {
  const arena = arenaIds.get(event.data.arena.toBase58());
  if (arena === undefined || isOldLayout(event)) return null;
  switch (event.name) {
    case "RunStarted":
      return {
        kind: "runStarted",
        arena,
        nonce: event.data.nonce,
        runner: event.data.runner.toBase58(),
        entryFee: event.data.entryFee.toString(),
        bond: event.data.bond.toString(),
        at,
      };
    case "RunSettled":
      return {
        kind: "runSettled",
        arena,
        nonce: event.data.nonce,
        runner: event.data.runner.toBase58(),
        t: event.data.t,
        outcomes: event.data.outcomes,
        runnerFees: event.data.runnerFees.toString(),
        runnerPaid: event.data.runnerPaid.toString(),
        at,
      };
    case "Trade":
      return {
        kind: "trade",
        signature,
        market: event.data.market,
        arena,
        nonce: event.data.nonce,
        side: event.data.side,
        owner: event.data.owner.toBase58(),
        amount: event.data.amount.toString(),
        net: event.data.net.toString(),
        shares: event.data.shares.toString(),
        at,
      };
    case "Claimed":
      return {
        kind: "claim",
        signature,
        owner: event.data.owner.toBase58(),
        arena,
        nonce: event.data.nonce,
        market: event.data.market,
        paid: event.data.paid.toString(),
        at,
      };
    case "NitroUsed":
      return {
        kind: "nitro",
        signature,
        arena,
        nonce: event.data.nonce,
        runner: event.data.runner.toBase58(),
        fee: event.data.fee.toString(),
        at,
      };
    default:
      return null;
  }
}
