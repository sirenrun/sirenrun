import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { FAUCET_WINDOW_MS, RateLimiter, parseSecretKey, parseWallet } from "./faucet";

describe("parseWallet", () => {
  it("accepts a base58 public key", () => {
    const key = Keypair.generate().publicKey;
    expect(parseWallet({ wallet: key.toBase58() })?.equals(key)).toBe(true);
  });

  it("rejects anything else", () => {
    for (const body of [
      null,
      "x",
      {},
      { wallet: 7 },
      { wallet: "not-a-key" },
      { wallet: "1".repeat(80) },
    ]) {
      expect(parseWallet(body)).toBeNull();
    }
  });
});

describe("parseSecretKey", () => {
  it("reads a solana-keygen JSON array", () => {
    const keypair = Keypair.generate();
    const parsed = parseSecretKey(JSON.stringify(Array.from(keypair.secretKey)));
    expect(parsed && Keypair.fromSecretKey(parsed).publicKey.equals(keypair.publicKey)).toBe(true);
  });

  it("rejects missing or malformed values", () => {
    for (const value of [undefined, "", "[1,2,3]", "nope", JSON.stringify(Array(64).fill(256))]) {
      expect(parseSecretKey(value)).toBeNull();
    }
  });
});

describe("RateLimiter", () => {
  it("allows one claim per wallet per window", () => {
    const limiter = new RateLimiter();
    expect(limiter.waitFor("a", 1_000)).toBe(0);
    limiter.record("a", 1_000);
    expect(limiter.waitFor("a", 1_000 + 60_000)).toBe(FAUCET_WINDOW_MS - 60_000);
    expect(limiter.waitFor("b", 1_000)).toBe(0);
    expect(limiter.waitFor("a", 1_000 + FAUCET_WINDOW_MS)).toBe(0);
  });

  it("forgets a wallet whose claim failed", () => {
    const limiter = new RateLimiter(10);
    limiter.record("a", 0);
    limiter.forget("a");
    expect(limiter.waitFor("a", 1)).toBe(0);
  });
});
