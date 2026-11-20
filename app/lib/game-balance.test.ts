import { Keypair } from "@solana/web3.js";
import { DELEGATION_PROGRAM_ID, PROGRAM_ID } from "@sirenrun/sdk";
import { describe, expect, it } from "vitest";
import { locateBalance, sessionMinutesLeft } from "./game-balance";

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
