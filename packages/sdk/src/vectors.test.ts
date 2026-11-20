import vectors from "@sirenrun/test-vectors/sdk.json" with { type: "json" };
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  PROGRAM_ID,
  SESSION_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  VRF_EPHEMERAL_QUEUE,
  VRF_EPHEMERAL_TEST_QUEUE,
  arenaPda,
  associatedTokenAddress,
  balancePda,
  configPda,
  decodeArena,
  decodeBalance,
  decodeConfig,
  outcomeAt,
  vaultPda,
} from "./index.ts";

/** Puts decoded values in the vectors' JSON form: u64 as decimal strings, keys as base58. */
function plain(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof PublicKey) return value.toBase58();
  if (Array.isArray(value)) return value.map(plain);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

const key = (text: string) => new PublicKey(text);
const bytes = (hex: string) => Buffer.from(hex, "hex");

describe("addresses the SDK hardcodes", () => {
  it("match the program crate and its MagicBlock dependencies", () => {
    expect(PROGRAM_ID.toBase58()).toBe(vectors.pdas.programId);
    expect(SESSION_PROGRAM_ID.toBase58()).toBe(vectors.programs.session);
    expect(VRF_EPHEMERAL_QUEUE.toBase58()).toBe(vectors.programs.vrfQueue);
    expect(VRF_EPHEMERAL_TEST_QUEUE.toBase58()).toBe(vectors.programs.vrfTestQueue);
    expect(TOKEN_PROGRAM_ID.toBase58()).toBe(vectors.programs.token);
    expect(ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()).toBe(vectors.programs.associatedToken);
  });
});

describe("PDAs", () => {
  it("derive config and vault", () => {
    expect(plain(configPda())).toEqual(vectors.pdas.config);
    expect(plain(vaultPda())).toEqual(vectors.pdas.vault);
  });

  it("derive balances and token accounts per owner", () => {
    const mint = key(vectors.pdas.mint);
    for (const v of vectors.pdas.owners) {
      expect(plain(balancePda(key(v.owner)))).toEqual(v.balance);
      expect(associatedTokenAddress(key(v.owner), mint).toBase58()).toBe(v.ata);
    }
  });

  it("derive arenas, rejecting ids that are not a u8", () => {
    for (const v of vectors.pdas.arenas) {
      expect(plain(arenaPda(v.id))).toEqual(v.pda);
    }
    expect(() => arenaPda(256)).toThrow(RangeError);
    expect(() => arenaPda(-1)).toThrow(RangeError);
    expect(() => arenaPda(1.5)).toThrow(RangeError);
  });
});

describe("account decoders", () => {
  const { config, balance, arena } = vectors.accounts;

  it("decode Config", () => {
    expect(plain(decodeConfig(bytes(config.hex)))).toEqual(config.fields);
  });

  it("decode Balance, keeping u64 values above 2^53 exact", () => {
    const decoded = decodeBalance(bytes(balance.hex));
    expect(plain(decoded)).toEqual(balance.fields);
    expect(decoded.available).toBe(9_007_199_254_740_993n);
  });

  it("decode Arena with unpacked run results", () => {
    expect(plain(decodeArena(bytes(arena.hex)))).toEqual(arena.fields);
  });

  it("reject another account's bytes", () => {
    expect(() => decodeArena(bytes(balance.hex))).toThrow(/discriminator/);
    expect(() => decodeBalance(bytes(config.hex))).toThrow(/discriminator/);
  });

  it("unpack outcomes two bits per market", () => {
    expect([0, 1, 2].map((m) => outcomeAt(0b11_10_01, m))).toEqual(["yes", "no", "void"]);
    expect(outcomeAt(0, 2)).toBe("open");
  });
});
