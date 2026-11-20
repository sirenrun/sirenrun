import type { AccountInfo, PublicKey } from "@solana/web3.js";
import { DELEGATION_PROGRAM_ID, PROGRAM_ID } from "@sirenrun/sdk";

/** Where a wallet's game balance currently lives. */
export type BalanceLocation = "none" | "base" | "er";

/** From the owner of the Balance PDA on the base layer. */
export function locateBalance(baseOwner: PublicKey | null | undefined): BalanceLocation {
  if (baseOwner == null) return "none";
  if (baseOwner.equals(DELEGATION_PROGRAM_ID)) return "er";
  if (baseOwner.equals(PROGRAM_ID)) return "base";
  return "none";
}

/** Whole minutes left in a session, never negative. */
export function sessionMinutesLeft(validUntil: number, nowMs: number): number {
  return Math.max(0, Math.floor((validUntil - nowMs / 1000) / 60));
}

/** SPL token account amount (u64 LE at offset 64), 0 when the account does not exist yet. */
export function tokenAmount(info: AccountInfo<Buffer> | null | undefined): bigint {
  return info == null || info.data.length < 72 ? 0n : info.data.readBigUInt64LE(64);
}

/** Retry delay after `failures` consecutive failed refreshes: 1 s, 2 s, 4 s … capped at 30 s. */
export function backoffMs(failures: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, failures - 1));
}
