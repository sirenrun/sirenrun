import { Keypair, PublicKey } from "@solana/web3.js";
import type { Session } from "@sirenrun/sdk";

/**
 * Keeps the session key for this browser tab (sessionStorage), so a reload or typed URL does
 * not cost another wallet signature. A closed tab forgets it. The key can only sign game
 * actions (drive, trade, claim, start a run, undelegate) for the wallet that created it, never
 * withdrawals, and the program rejects it after `validUntil`.
 */
const KEY = "sirenrun.session.v1";

interface Stored {
  secretKey: number[];
  authority: string;
  token: string;
  validUntil: number;
}

export function saveSession(session: Session): void {
  try {
    const stored: Stored = {
      secretKey: Array.from(session.keypair.secretKey),
      authority: session.authority.toBase58(),
      token: session.token.toBase58(),
      validUntil: session.validUntil,
    };
    sessionStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // Storage blocked (private mode, policy): the session still works until a reload.
  }
}

/** The stored session for `authority`, if it is still valid at `nowSeconds`. */
export function loadSession(authority: PublicKey, nowSeconds: number): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return null;
    const stored = JSON.parse(raw) as Stored;
    if (stored.authority !== authority.toBase58() || stored.validUntil <= nowSeconds) return null;
    return {
      keypair: Keypair.fromSecretKey(Uint8Array.from(stored.secretKey)),
      authority,
      token: new PublicKey(stored.token),
      validUntil: stored.validUntil,
    };
  } catch {
    return null;
  }
}

export function forgetSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
