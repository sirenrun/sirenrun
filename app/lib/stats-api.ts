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

/**
 * Fixed-window counter per key, in memory only. Limits how many visits one IP can report, so
 * a script cannot inflate the visitor count. Nothing about the IP is stored or logged.
 */
export class WindowCounter {
  private readonly hits = new Map<string, { start: number; count: number }>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** Counts a hit and says whether it is within the limit. */
  allow(key: string, now: number): boolean {
    const entry = this.hits.get(key);
    if (entry === undefined || now - entry.start >= this.windowMs) {
      this.hits.set(key, { start: now, count: 1 });
      if (this.hits.size > 10_000) {
        for (const [k, e] of this.hits) if (now - e.start >= this.windowMs) this.hits.delete(k);
      }
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }
}

/** The client IP from proxy headers (first hop), or a shared bucket when there is none. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
