import { PublicKey } from "@solana/web3.js";
import type { Arena, ArenaStatus } from "@sirenrun/sdk";
import { describe, expect, it } from "vitest";
import { roleOf } from "./role";

const runner = new PublicKey(new Uint8Array(32).fill(7));
const other = new PublicKey(new Uint8Array(32).fill(9));

function arena(status: ArenaStatus, nonce = 3): Arena {
  return { status, nonce, runner } as unknown as Arena;
}

describe("roleOf", () => {
  it("is driver for the runner of a staging or live run", () => {
    expect(roleOf(runner.toBase58(), arena("staging"))).toBe("driver");
    expect(roleOf(runner.toBase58(), arena("live"))).toBe("driver");
  });

  it("is watcher for any other wallet", () => {
    expect(roleOf(other.toBase58(), arena("live"))).toBe("watcher");
  });

  it("is watcher with no wallet or no arena", () => {
    expect(roleOf(null, arena("live"))).toBe("watcher");
    expect(roleOf(runner.toBase58(), null)).toBe("watcher");
  });

  it("hands the runner back to the watcher view once the run is over", () => {
    expect(roleOf(runner.toBase58(), arena("settled"))).toBe("watcher");
    expect(roleOf(runner.toBase58(), arena("idle"))).toBe("watcher");
  });

  it("ignores the default runner of an arena that never ran", () => {
    expect(roleOf(runner.toBase58(), arena("live", 0))).toBe("watcher");
  });
});
