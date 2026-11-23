import { PublicKey } from "@solana/web3.js";
import { ARENAS } from "@sirenrun/sim";

/** Request validation for the stats and visit routes. Pure, so it is unit tested. */

const VISITOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A browser's anonymous id: a v4 UUID from `crypto.randomUUID()`. */
export function isVisitorId(value: unknown): value is string {
  return typeof value === "string" && VISITOR_ID.test(value);
}

/** A base58 wallet address that decodes to 32 bytes. */
export function parseWalletAddress(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 32 || value.length > 44) return null;
  try {
    return new PublicKey(value).toBase58() === value ? value : null;
  } catch {
    return null;
  }
}

export function parseRun(arena: string, nonce: string): { arena: number; nonce: number } | null {
  if (!/^\d{1,2}$/.test(arena) || !/^\d{1,10}$/.test(nonce)) return null;
  const a = Number(arena);
  const n = Number(nonce);
  if (a >= ARENAS || n > 0xffff_ffff) return null;
  return { arena: a, nonce: n };
}
