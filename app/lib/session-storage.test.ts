import { Keypair, PublicKey } from "@solana/web3.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { forgetSession, loadSession, saveSession } from "./session-storage";

const store = new Map<string, string>();
vi.stubGlobal("sessionStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

describe("session storage", () => {
  const authority = Keypair.generate().publicKey;
  const session = {
    keypair: Keypair.generate(),
    authority,
    token: Keypair.generate().publicKey,
    validUntil: 2_000,
  };

  beforeEach(() => store.clear());

  it("restores the same key for the same wallet while valid", () => {
    saveSession(session);
    const loaded = loadSession(authority, 1_000);
    expect(loaded?.keypair.publicKey.equals(session.keypair.publicKey)).toBe(true);
    expect(loaded?.token.equals(session.token)).toBe(true);
    expect(loaded?.validUntil).toBe(2_000);
  });

  it("ignores another wallet, an expired session, junk and a forgotten one", () => {
    saveSession(session);
    expect(loadSession(Keypair.generate().publicKey, 1_000)).toBeNull();
    expect(loadSession(authority, 2_000)).toBeNull();
    store.set("sirenrun.session.v1", "{not json");
    expect(loadSession(authority, 1_000)).toBeNull();
    saveSession(session);
    forgetSession();
    expect(loadSession(authority, 1_000)).toBeNull();
    expect(PublicKey.isOnCurve(session.keypair.publicKey.toBytes())).toBe(true);
  });
});
