import client from "@sirenrun/test-vectors/client.json" with { type: "json" };
import sdk from "@sirenrun/test-vectors/sdk.json" with { type: "json" };
import type { AccountChangeCallback, LogsCallback, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  PROGRAM_ID,
  arenaPda,
  subscribeArena,
  subscribeEvents,
  type Arena,
  type ErConnection,
  type SirenrunEvent,
} from "./index.ts";

function fakeEr() {
  const state = {
    account: undefined as
      { key: PublicKey; cb: AccountChangeCallback; commitment: unknown } | undefined,
    logs: undefined as { filter: PublicKey; cb: LogsCallback } | undefined,
    removed: [] as string[],
  };
  const er = {
    layer: "er",
    onAccountChange: (
      key: PublicKey,
      cb: AccountChangeCallback,
      config: { commitment: unknown },
    ) => {
      state.account = { key, cb, commitment: config.commitment };
      return 11;
    },
    removeAccountChangeListener: async (id: number) => void state.removed.push(`account:${id}`),
    onLogs: (filter: PublicKey, cb: LogsCallback) => {
      state.logs = { filter, cb };
      return 22;
    },
    removeOnLogsListener: async (id: number) => void state.removed.push(`logs:${id}`),
  };
  return { er: er as unknown as ErConnection, state };
}

const accountInfo = (hex: string) => ({
  data: Buffer.from(hex, "hex"),
  owner: PROGRAM_ID,
  lamports: 1,
  executable: false,
  rentEpoch: 0,
});

describe("subscribeArena", () => {
  it("decodes every update of the arena PDA at processed", () => {
    const { er, state } = fakeEr();
    const seen: [Arena, number][] = [];
    const errors: unknown[] = [];
    const stop = subscribeArena(
      er,
      2,
      (a, slot) => seen.push([a, slot]),
      (e) => errors.push(e),
    );
    expect(state.account?.key.equals(arenaPda(2).address)).toBe(true);
    expect(state.account?.commitment).toBe("processed");

    state.account?.cb(accountInfo(sdk.accounts.arena.hex), { slot: 9 });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.[0].sim.t).toBe(301);
    expect(seen[0]?.[1]).toBe(9);

    state.account?.cb(accountInfo(sdk.accounts.balance.hex), { slot: 10 });
    expect(errors).toHaveLength(1);

    stop();
    expect(state.removed).toEqual(["account:11"]);
  });
});

describe("subscribeEvents", () => {
  const program = PROGRAM_ID.toBase58();
  const logs = (hexes: string[]) => [
    `Program ${program} invoke [1]`,
    ...hexes.map((h) => `Program data: ${Buffer.from(h, "hex").toString("base64")}`),
    `Program ${program} success`,
  ];

  it("emits parsed events from successful transactions only", () => {
    const { er, state } = fakeEr();
    const seen: [SirenrunEvent["name"], string][] = [];
    const stop = subscribeEvents(er, (e, sig) => seen.push([e.name, sig]));
    expect(state.logs?.filter.equals(PROGRAM_ID)).toBe(true);

    const hexes = client.events.map((e) => e.hex);
    state.logs?.cb({ signature: "ok", err: null, logs: logs(hexes) }, { slot: 1 });
    state.logs?.cb(
      { signature: "failed", err: { InstructionError: [0, { Custom: 1 }] }, logs: logs(hexes) },
      { slot: 2 },
    );
    expect(seen).toEqual(client.events.map((e) => [e.name, "ok"]));

    stop();
    expect(state.removed).toEqual(["logs:22"]);
  });
});
