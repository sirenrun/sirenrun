import type { PublicKey } from "@solana/web3.js";
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
