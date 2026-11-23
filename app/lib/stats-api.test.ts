import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { isVisitorId, parseRun, parseWalletAddress } from "./stats-api";

describe("stats request validation", () => {
  it("accepts v4 UUIDs only as visitor ids", () => {
    expect(isVisitorId("3f2b8c1e-9a4d-4f6b-8c2e-1d5a7b9e0f12")).toBe(true);
    expect(isVisitorId("3f2b8c1e-9a4d-1f6b-8c2e-1d5a7b9e0f12")).toBe(false);
    expect(isVisitorId("'; drop table visitors; --")).toBe(false);
    expect(isVisitorId(42)).toBe(false);
  });

  it("accepts real wallet addresses only", () => {
    const wallet = Keypair.generate().publicKey.toBase58();
    expect(parseWalletAddress(wallet)).toBe(wallet);
    expect(parseWalletAddress("not-a-wallet")).toBeNull();
    expect(parseWalletAddress(`${wallet}x`)).toBeNull();
    expect(parseWalletAddress(null)).toBeNull();
  });

  it("accepts known arenas and u32 nonces", () => {
    expect(parseRun("0", "17")).toEqual({ arena: 0, nonce: 17 });
    expect(parseRun("9", "1")).toBeNull();
    expect(parseRun("0", "-1")).toBeNull();
    expect(parseRun("0", "99999999999")).toBeNull();
  });
});
