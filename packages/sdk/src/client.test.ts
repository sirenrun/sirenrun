import vectors from "@sirenrun/test-vectors/client.json" with { type: "json" };
import { PublicKey, type Signer } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  buyIx,
  claimIx,
  claimableEntries,
  createAtaIx,
  createSessionIx,
  initializeMintIx,
  mintToIx,
  setMintAuthorityIx,
  decodeArena,
  decodeSessionToken,
  delegateArenaIx,
  delegateBalanceIx,
  depositIx,
  expiredEntries,
  initArenaIx,
  initBalanceIx,
  initConfigIx,
  parseEvents,
  previewClaim,
  recoverArenaIx,
  revokeSessionIx,
  sessionTokenPda,
  setInputIx,
  startRunIx,
  undelegateBalanceIx,
  updateConfigIx,
  withdrawIx,
  type Authority,
  type Balance,
  type ConfigParams,
  type LayerInstruction,
  type PositionEntry,
  PROGRAM_ID,
} from "./index.ts";

type Args = Record<string, unknown>;
const key = (v: unknown) => new PublicKey(v as string);
const big = (v: unknown) => BigInt(v as string);
const num = (v: unknown) => v as number;
const optKey = (v: unknown) => (v === undefined ? undefined : key(v));

function auth(v: unknown): Authority {
  const a = v as { signer: string; sessionToken?: string };
  return a.sessionToken === undefined
    ? { signer: key(a.signer) }
    : { signer: key(a.signer), sessionToken: key(a.sessionToken) };
}

function params(v: unknown): ConfigParams {
  const p = v as Args;
  return {
    house: key(p.house),
    feeBps: num(p.feeBps),
    runnerFeeBps: num(p.runnerFeeBps),
    entryFee: big(p.entryFee),
    bond: big(p.bond),
    liquidity: big(p.liquidity),
    maxBuy: big(p.maxBuy),
    nitroFee: big(p.nitroFee),
    openBps: (p.openBps as number[]).map(num) as [number, number, number],
  };
}

/** A signer whose public key is a vector's fixed key; it never signs in these tests. */
const fakeSigner = (pubkey: PublicKey): Signer => ({
  publicKey: pubkey,
  secretKey: new Uint8Array(64),
});

const builders: Record<string, (a: Args) => LayerInstruction<"base" | "er">> = {
  initConfig: (a) =>
    initConfigIx({ admin: key(a.admin), mint: key(a.mint), params: params(a.params) }),
  updateConfig: (a) => updateConfigIx({ admin: key(a.admin), params: params(a.params) }),
  initBalance: (a) => initBalanceIx({ owner: key(a.owner) }),
  deposit: (a) => depositIx({ owner: key(a.owner), mint: key(a.mint), amount: big(a.amount) }),
  withdraw: (a) =>
    withdrawIx({
      owner: key(a.owner),
      mint: key(a.mint),
      amount: big(a.amount),
      ownerToken: optKey(a.ownerToken),
    }),
  delegateBalance: (a) => delegateBalanceIx({ owner: key(a.owner), validator: key(a.validator) }),
  initArena: (a) => initArenaIx({ admin: key(a.admin), id: num(a.id) }),
  delegateArena: (a) =>
    delegateArenaIx({ admin: key(a.admin), id: num(a.id), validator: key(a.validator) }),
  startRun: (a) =>
    startRunIx({
      auth: auth(a.auth),
      runner: key(a.runner),
      house: key(a.house),
      id: num(a.id),
      oracleQueue: key(a.oracleQueue),
    }),
  setInput: (a) =>
    setInputIx({
      auth: auth(a.auth),
      id: num(a.id),
      targetLane: num(a.targetLane),
      nitro: a.nitro as boolean,
    }),
  buy: (a) =>
    buyIx({
      auth: auth(a.auth),
      owner: key(a.owner),
      house: key(a.house),
      id: num(a.id),
      market: num(a.market),
      side: a.side as "yes" | "no",
      amount: big(a.amount),
      minShares: big(a.minShares),
    }),
  claim: (a) =>
    claimIx({
      auth: auth(a.auth),
      owner: key(a.owner),
      house: key(a.house),
      id: num(a.id),
      entryIndex: num(a.entryIndex),
    }),
  recoverArena: (a) => recoverArenaIx({ admin: key(a.admin), id: num(a.id) }),
  undelegateBalance: (a) => undelegateBalanceIx({ auth: auth(a.auth), owner: key(a.owner) }),
  createSession: (a) =>
    createSessionIx({
      authority: key(a.authority),
      sessionSigner: fakeSigner(key(a.sessionSigner)),
      validUntil: num(a.validUntil),
      topUpLamports: a.topUpLamports === null ? undefined : big(a.topUpLamports),
    }),
  initializeMint: (a) =>
    initializeMintIx({ mint: key(a.mint), authority: key(a.authority), decimals: num(a.decimals) }),
  createAta: (a) => createAtaIx({ payer: key(a.payer), owner: key(a.owner), mint: key(a.mint) }),
  mintTo: (a) =>
    mintToIx({
      mint: key(a.mint),
      destination: key(a.destination),
      authority: key(a.authority),
      amount: big(a.amount),
      decimals: num(a.decimals),
    }),
  setMintAuthority: (a) =>
    setMintAuthorityIx({ mint: key(a.mint), current: key(a.current), next: key(a.next) }),
  revokeSession: (a) =>
    revokeSessionIx({ authority: key(a.authority), sessionSigner: key(a.sessionSigner) }),
};

describe("instruction builders", () => {
  it.each(vectors.instructions.map((v) => [v.name, v] as const))(
    "%s matches the program's encoding",
    (_, v) => {
      const builder = builders[v.name.split(" ")[0] ?? ""];
      if (builder === undefined) throw new Error(`no builder for ${v.name}`);
      const ix = builder(v.args as Args);
      expect(ix.layer).toBe(v.layer);
      expect(ix.instruction.programId.toBase58()).toBe(v.programId);
      expect(Buffer.from(ix.instruction.data).toString("hex")).toBe(v.data);
      expect(
        ix.instruction.keys.map((k) => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
      ).toEqual(v.keys);
    },
  );

  it("carry the session key as a signer of createSession", () => {
    const v = vectors.instructions.find((i) => i.name === "createSession");
    const ix = builders.createSession?.(v?.args as Args);
    expect(ix?.signers.map((s) => s.publicKey.toBase58())).toEqual([
      (v?.args as Args).sessionSigner,
    ]);
  });

  it("reject out-of-range arguments", () => {
    const owner = PublicKey.default;
    const a = { signer: owner };
    expect(() => setInputIx({ auth: a, id: 0, targetLane: 256, nitro: false })).toThrow(RangeError);
    expect(() =>
      buyIx({
        auth: a,
        owner,
        house: owner,
        id: 0,
        market: 0,
        side: "yes",
        amount: -1n,
        minShares: 0n,
      }),
    ).toThrow(RangeError);
    expect(() => depositIx({ owner, mint: owner, amount: 1n << 64n })).toThrow(RangeError);
  });
});

describe("session token", () => {
  it("derives and decodes the program's account", () => {
    const v = vectors.sessionToken;
    const fields = v.fields;
    expect(sessionTokenPda(key(fields.sessionSigner), key(fields.authority)).toBase58()).toBe(
      v.address,
    );
    const decoded = decodeSessionToken(Buffer.from(v.hex, "hex"));
    expect({
      authority: decoded.authority.toBase58(),
      targetProgram: decoded.targetProgram.toBase58(),
      sessionSigner: decoded.sessionSigner.toBase58(),
      feePayer: decoded.feePayer.toBase58(),
      validUntil: decoded.validUntil,
    }).toEqual(fields);
  });
});

/** Puts parsed events in the vectors' JSON form. */
function plain(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof PublicKey) return value.toBase58();
  if (Array.isArray(value)) return value.map(plain);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

describe("parseEvents", () => {
  const program = PROGRAM_ID.toBase58();
  const dataLine = (hex: string) => `Program data: ${Buffer.from(hex, "hex").toString("base64")}`;

  it("decodes every event the program emits", () => {
    const logs = [
      `Program ${program} invoke [1]`,
      "Program log: Instruction: Tick",
      ...vectors.events.map((e) => dataLine(e.hex)),
      `Program ${program} consumed 20000 of 200000 compute units`,
      `Program ${program} success`,
    ];
    const events = parseEvents(logs);
    expect(events.map((e) => ({ name: e.name, fields: plain(e.data) }))).toEqual(
      vectors.events.map((e) => ({ name: e.name, fields: e.fields })),
    );
  });

  it("ignores data logged by other programs", () => {
    const other = "Magic11111111111111111111111111111111111111";
    const first = vectors.events[0];
    if (first === undefined) throw new Error("no events");
    const logs = [`Program ${other} invoke [1]`, dataLine(first.hex), `Program ${other} success`];
    expect(parseEvents(logs)).toEqual([]);
  });
});

describe("previewClaim", () => {
  const arena = decodeArena(Buffer.from(vectors.claims.arena, "hex"));
  const toEntry = (e: (typeof vectors.claims.cases)[number]["entry"]): PositionEntry => ({
    arenaId: e.arenaId,
    nonce: e.nonce,
    market: e.market,
    side: e.side as PositionEntry["side"],
    shares: BigInt(e.shares),
    cost: BigInt(e.cost),
    tick: e.tick,
  });

  it.each(vectors.claims.cases.map((c) => [c.name, c] as const))(
    "%s matches Arena::claim",
    (_, c) => {
      const preview = previewClaim(arena, toEntry(c.entry), BigInt(c.houseAvailable));
      if (c.result.kind === "error") {
        expect(preview).toEqual({ ok: false, error: c.result.name });
        return;
      }
      expect(preview.ok).toBe(true);
      if (!preview.ok) return;
      expect(preview.paid.toString()).toBe(c.result.paid);
      // Only refunds and bond refunds touch the house's balance.
      const touchesHouse = preview.kind === "refund" || preview.kind === "rideBack";
      expect(touchesHouse).toBe(c.result.houseDelta !== "0");
    },
  );

  it("lists claimable and expired entries for auto-claim", () => {
    const pick = (name: string) => {
      const c = vectors.claims.cases.find((x) => x.name === name);
      if (c === undefined) throw new Error(name);
      return toEntry(c.entry);
    };
    const empty = toEntry(
      vectors.claims.cases.find((c) => c.name === "empty")?.entry ?? ({} as never),
    );
    const balance: Balance = {
      owner: PublicKey.default,
      available: 0n,
      bump: 255,
      entries: [
        pick("win"),
        empty,
        pick("open market"),
        pick("expired"),
        pick("loss"),
        pick("other arena"),
      ],
    };
    expect(claimableEntries(balance, arena).map((c) => [c.index, c.preview.kind])).toEqual([
      [0, "win"],
      [4, "loss"],
    ]);
    expect(expiredEntries(balance, arena)).toEqual([3]);
  });
});
