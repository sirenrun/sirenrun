import { Keypair, type AccountInfo } from "@solana/web3.js";
import { DELEGATION_PROGRAM_ID, PROGRAM_ID } from "@sirenrun/sdk";
import { describe, expect, it } from "vitest";
import { backoffMs, locateBalance, sessionMinutesLeft, tokenAmount } from "./game-balance";

describe("locateBalance", () => {
  it("follows the owner of the Balance PDA on the base layer", () => {
    expect(locateBalance(null)).toBe("none");
    expect(locateBalance(undefined)).toBe("none");
    expect(locateBalance(PROGRAM_ID)).toBe("base");
    expect(locateBalance(DELEGATION_PROGRAM_ID)).toBe("er");
    expect(locateBalance(Keypair.generate().publicKey)).toBe("none");
  });
});

describe("sessionMinutesLeft", () => {
  it("rounds down and never goes negative", () => {
    expect(sessionMinutesLeft(3_600, 0)).toBe(60);
    expect(sessionMinutesLeft(3_600, 59_000)).toBe(59);
    expect(sessionMinutesLeft(3_600, 3_600_000)).toBe(0);
    expect(sessionMinutesLeft(3_600, 9_999_000)).toBe(0);
  });
});

describe("tokenAmount", () => {
  it("reads the u64 amount of an SPL token account", () => {
    const data = Buffer.alloc(165);
    data.writeBigUInt64LE(123_456_789n, 64);
    expect(tokenAmount({ data } as AccountInfo<Buffer>)).toBe(123_456_789n);
    expect(tokenAmount(null)).toBe(0n);
    expect(tokenAmount({ data: Buffer.alloc(10) } as AccountInfo<Buffer>)).toBe(0n);
  });
});

describe("backoffMs", () => {
  it("doubles from 1 s up to 30 s", () => {
    expect([1, 2, 3, 4, 5, 6, 10].map(backoffMs)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
  });
});
