import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { TOKEN_UNIT } from "@sirenrun/sdk";

/** What one faucet claim gives a wallet. */
export const FAUCET_TOKENS = 100n * TOKEN_UNIT;
/** Enough SOL for rent of the balance, session token and token account, plus fees. */
export const FAUCET_SOL = 0.02 * LAMPORTS_PER_SOL;
/** Wallets holding at least this much SOL get tokens only. */
export const SOL_ENOUGH = 0.01 * LAMPORTS_PER_SOL;
export const FAUCET_WINDOW_MS = 60 * 60 * 1000;

/** The wallet from a request body, or null if it is not a valid public key. */
export function parseWallet(body: unknown): PublicKey | null {
  if (body === null || typeof body !== "object") return null;
  const wallet = (body as { wallet?: unknown }).wallet;
  if (typeof wallet !== "string" || wallet.length > 44) return null;
  try {
    return new PublicKey(wallet);
  } catch {
    return null;
  }
}

/** Faucet secret from the env: a JSON array of 64 bytes, as `solana-keygen` writes it. */
export function parseSecretKey(value: string | undefined): Uint8Array | null {
  if (value === undefined || value.trim() === "") return null;
  try {
    const bytes = JSON.parse(value) as unknown;
    if (!Array.isArray(bytes) || bytes.length !== 64) return null;
    if (!bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) return null;
    return Uint8Array.from(bytes as number[]);
  } catch {
    return null;
  }
}

/**
 * One claim per wallet per window. In memory, so it resets when the server restarts;
 * enough for a devnet demo where the tokens are worthless.
 */
export class RateLimiter {
  private readonly last = new Map<string, number>();
  private readonly windowMs: number;

  constructor(windowMs: number = FAUCET_WINDOW_MS) {
    this.windowMs = windowMs;
  }

  /** Milliseconds until `key` may claim again; 0 means it may claim now. */
  waitFor(key: string, now: number): number {
    const previous = this.last.get(key);
    return previous === undefined ? 0 : Math.max(0, previous + this.windowMs - now);
  }

  /** Lets `key` claim again, e.g. after its transaction failed. */
  forget(key: string): void {
    this.last.delete(key);
  }

  record(key: string, now: number): void {
    this.last.set(key, now);
    if (this.last.size > 10_000) {
      for (const [k, at] of this.last) if (at + this.windowMs <= now) this.last.delete(k);
    }
  }
}
