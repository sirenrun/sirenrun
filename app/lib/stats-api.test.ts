import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { WindowCounter, clientIp, isVisitorId, parseRun, parseWalletAddress } from "./stats-api";

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

describe("visit rate limit", () => {
  it("allows the limit per window, then refuses until the window ends", () => {
    const c = new WindowCounter(2, 1_000);
    expect([c.allow("a", 0), c.allow("a", 10), c.allow("a", 20)]).toEqual([true, true, false]);
    expect(c.allow("b", 20)).toBe(true);
    expect(c.allow("a", 1_000)).toBe(true);
  });

  it("reads the first forwarded hop", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
