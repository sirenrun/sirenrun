import { EventParser } from "@anchor-lang/core";
import type { Commitment, PublicKey } from "@solana/web3.js";
import { coder, decodeArena, outcomeAt, type Arena, type MarketStatus } from "./accounts.ts";
import type { ErConnection } from "./connections.ts";
import { PROGRAM_ID } from "./constants.ts";
import { arenaPda } from "./pdas.ts";
import type { Side } from "./price.ts";

export type SirenrunEvent =
  | {
      name: "RunStarted";
      data: { arena: PublicKey; nonce: number; runner: PublicKey; entryFee: bigint; bond: bigint };
    }
  | { name: "SeedSet"; data: { arena: PublicKey; nonce: number } }
  | {
      name: "Trade";
      data: {
        arena: PublicKey;
        nonce: number;
        market: number;
        side: Side;
        net: bigint;
        shares: bigint;
        yesR: bigint;
        noR: bigint;
        /** The trader's wallet. */
        owner: PublicKey;
        /** Spent, fees included. */
        amount: bigint;
      };
    }
  | { name: "LineCrossed"; data: { arena: PublicKey; nonce: number; market: number; t: number } }
  | {
      name: "RunSettled";
      data: {
        arena: PublicKey;
        nonce: number;
        t: number;
        outcomes: MarketStatus[];
        runner: PublicKey;
        /** The driver's cut of the run's trades. */
        runnerFees: bigint;
        /** Everything credited to the driver at the end (fees, returned bond, or a refund). */
        runnerPaid: bigint;
      };
    }
  | {
      name: "NitroUsed";
      data: { arena: PublicKey; nonce: number; runner: PublicKey; fee: bigint };
    }
  | {
      name: "Claimed";
      data: { owner: PublicKey; arena: PublicKey; nonce: number; market: number; paid: bigint };
    };

type Raw = Record<string, unknown>;
const big = (v: unknown): bigint => BigInt(String(v));
const num = (v: unknown): number => v as number;
const key = (v: unknown): PublicKey => v as PublicKey;

function toEvent(name: string, d: Raw): SirenrunEvent | null {
  switch (name) {
    case "RunStarted":
      return {
        name,
        data: {
          arena: key(d.arena),
          nonce: num(d.nonce),
          runner: key(d.runner),
          entryFee: big(d.entry_fee),
          bond: big(d.bond),
        },
      };
    case "SeedSet":
      return { name, data: { arena: key(d.arena), nonce: num(d.nonce) } };
    case "Trade":
      return {
        name,
        data: {
          arena: key(d.arena),
          nonce: num(d.nonce),
          market: num(d.market),
          side: "Yes" in (d.side as Raw) ? "yes" : "no",
          net: big(d.net),
          shares: big(d.shares),
          yesR: big(d.yes_r),
          noR: big(d.no_r),
          owner: key(d.owner),
          amount: big(d.amount),
        },
      };
    case "LineCrossed":
      return {
        name,
        data: { arena: key(d.arena), nonce: num(d.nonce), market: num(d.market), t: num(d.t) },
      };
    case "RunSettled":
      return {
        name,
        data: {
          arena: key(d.arena),
          nonce: num(d.nonce),
          t: num(d.t),
          outcomes: [0, 1, 2].map((m) => outcomeAt(num(d.outcomes), m)),
          runner: key(d.runner),
          runnerFees: big(d.runner_fees),
          runnerPaid: big(d.runner_paid),
        },
      };
    case "NitroUsed":
      return {
        name,
        data: {
          arena: key(d.arena),
          nonce: num(d.nonce),
          runner: key(d.runner),
          fee: big(d.fee),
        },
      };
    case "Claimed":
      return {
        name,
        data: {
          owner: key(d.owner),
          arena: key(d.arena),
          nonce: num(d.nonce),
          market: num(d.market),
          paid: big(d.paid),
        },
      };
    default:
      return null;
  }
}

const parser = new EventParser(PROGRAM_ID, coder);

/** Events our program emitted in a transaction's logs, in order. Other programs' logs are skipped. */
export function parseEvents(logs: readonly string[]): SirenrunEvent[] {
  const events: SirenrunEvent[] = [];
  for (const raw of parser.parseLogs([...logs])) {
    const event = toEvent(raw.name, raw.data as Raw);
    if (event !== null) events.push(event);
  }
  return events;
}

export type Unsubscribe = () => void;

/**
 * Calls `onArena` on every ER update of arena `id` (once per tick while a run is live).
 * The callback must stay cheap: push the snapshot into a store and return.
 */
export function subscribeArena(
  er: ErConnection,
  id: number,
  onArena: (arena: Arena, slot: number) => void,
  onError: (error: unknown) => void = () => {},
  commitment: Commitment = "processed",
): Unsubscribe {
  const subscription = er.onAccountChange(
    arenaPda(id).address,
    (info, context) => {
      try {
        onArena(decodeArena(info.data), context.slot);
      } catch (error) {
        onError(error);
      }
    },
    { commitment },
  );
  return () => {
    void er.removeAccountChangeListener(subscription).catch(onError);
  };
}

/** Calls `onEvent` for each sirenrun event in successful ER transactions. */
export function subscribeEvents(
  er: ErConnection,
  onEvent: (event: SirenrunEvent, signature: string) => void,
  onError: (error: unknown) => void = () => {},
  commitment: Commitment = "processed",
): Unsubscribe {
  const subscription = er.onLogs(
    PROGRAM_ID,
    (logs) => {
      if (logs.err !== null) return;
      try {
        for (const event of parseEvents(logs.logs)) onEvent(event, logs.signature);
      } catch (error) {
        onError(error);
      }
    },
    commitment,
  );
  return () => {
    void er.removeOnLogsListener(subscription).catch(onError);
  };
}
