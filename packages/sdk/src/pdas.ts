import { PublicKey } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, PROGRAM_ID, TOKEN_PROGRAM_ID } from "./constants.ts";

export interface Pda {
  address: PublicKey;
  bump: number;
}

const encoder = new TextEncoder();

function find(seeds: Uint8Array[], programId: PublicKey): Pda {
  const [address, bump] = PublicKey.findProgramAddressSync(seeds, programId);
  return { address, bump };
}

export function configPda(programId: PublicKey = PROGRAM_ID): Pda {
  return find([encoder.encode("config")], programId);
}

/** Token account holding every deposit, owned by the Config PDA. */
export function vaultPda(programId: PublicKey = PROGRAM_ID): Pda {
  return find([encoder.encode("vault")], programId);
}

export function balancePda(owner: PublicKey, programId: PublicKey = PROGRAM_ID): Pda {
  return find([encoder.encode("balance"), owner.toBytes()], programId);
}

export function arenaPda(id: number, programId: PublicKey = PROGRAM_ID): Pda {
  if (!Number.isInteger(id) || id < 0 || id > 255) {
    throw new RangeError(`arena id must be a u8, got ${id}`);
  }
  return find([encoder.encode("arena"), Uint8Array.of(id)], programId);
}

/** Associated token account of `owner` for `mint` (classic token program). */
export function associatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return find(
    [owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  ).address;
}
