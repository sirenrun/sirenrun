import { Keypair } from "@solana/web3.js";
import type { SirenrunEvent } from "@sirenrun/sdk";
import { describe, expect, it } from "vitest";
import { toWrite } from "./rows.ts";

const arena = Keypair.generate().publicKey;
const other = Keypair.generate().publicKey;
const wallet = Keypair.generate().publicKey;
const ids = new Map([[arena.toBase58(), 2]]);
const at = new Date("2026-11-20T10:00:00Z");

describe("toWrite", () => {
  it("maps a trade with its owner and amount spent", () => {
    const event: SirenrunEvent = {
      name: "Trade",
      data: {
        arena,
        nonce: 5,
        market: 1,
        side: "no",
        net: 4_900_000n,
        shares: 9_000_000n,
        yesR: 1n,
        noR: 2n,
        owner: wallet,
        amount: 5_000_000n,
      },
    };
    expect(toWrite(event, "sig", at, ids)).toEqual({
      kind: "trade",
      signature: "sig",
      market: 1,
      arena: 2,
      nonce: 5,
      side: "no",
      owner: wallet.toBase58(),
      amount: "5000000",
      net: "4900000",
      shares: "9000000",
      at,
    });
  });

  it("maps the driver's stake and payout", () => {
    const started = toWrite(
      {
        name: "RunStarted",
        data: { arena, nonce: 5, runner: wallet, entryFee: 500_000n, bond: 25_000_000n },
      },
      "s1",
      at,
      ids,
    );
    expect(started).toMatchObject({ kind: "runStarted", entryFee: "500000", bond: "25000000" });
    const settled = toWrite(
      {
        name: "RunSettled",
        data: {
          arena,
          nonce: 5,
          t: 451,
          outcomes: ["yes", "no", "no"],
          runner: wallet,
          runnerFees: 120_000n,
          runnerPaid: 19_120_000n,
        },
      },
      "s2",
      at,
      ids,
    );
    expect(settled).toMatchObject({
      kind: "runSettled",
      t: 451,
      outcomes: ["yes", "no", "no"],
      runnerFees: "120000",
      runnerPaid: "19120000",
    });
  });

  it("maps claims and nitro", () => {
    expect(
      toWrite(
        { name: "Claimed", data: { owner: wallet, arena, nonce: 5, market: 2, paid: 9n } },
        "c",
        at,
        ids,
      ),
    ).toMatchObject({ kind: "claim", paid: "9", market: 2 });
    expect(
      toWrite(
        { name: "NitroUsed", data: { arena, nonce: 5, runner: wallet, fee: 500_000n } },
        "n",
        at,
        ids,
      ),
    ).toMatchObject({ kind: "nitro", fee: "500000" });
  });

  it("skips other arenas and events the stats do not use", () => {
    expect(toWrite({ name: "SeedSet", data: { arena, nonce: 5 } }, "x", at, ids)).toBeNull();
    expect(toWrite({ name: "SeedSet", data: { arena: other, nonce: 5 } }, "x", at, ids)).toBeNull();
    expect(
      toWrite(
        { name: "Claimed", data: { owner: wallet, arena: other, nonce: 1, market: 0, paid: 1n } },
        "x",
        at,
        ids,
      ),
    ).toBeNull();
  });
});
