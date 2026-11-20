import { PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  DELEGATION_PROGRAM_ID,
  PROGRAM_ID,
  SESSION_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "./constants.ts";

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

/** The three accounts `delegate_*` needs besides the delegated PDA itself. */
export interface DelegationAccounts {
  buffer: PublicKey;
  record: PublicKey;
  metadata: PublicKey;
}

export function delegationAccounts(
  delegated: PublicKey,
  ownerProgram: PublicKey = PROGRAM_ID,
): DelegationAccounts {
  const account = delegated.toBytes();
  return {
    buffer: find([encoder.encode("buffer"), account], ownerProgram).address,
    record: find([encoder.encode("delegation"), account], DELEGATION_PROGRAM_ID).address,
    metadata: find([encoder.encode("delegation-metadata"), account], DELEGATION_PROGRAM_ID).address,
  };
}

/** `SessionTokenV2` PDA for an ephemeral `signer` acting for `authority` in our program. */
export function sessionTokenPda(
  signer: PublicKey,
  authority: PublicKey,
  targetProgram: PublicKey = PROGRAM_ID,
): PublicKey {
  return find(
    [
      encoder.encode("session_token_v2"),
      targetProgram.toBytes(),
      signer.toBytes(),
      authority.toBytes(),
    ],
    SESSION_PROGRAM_ID,
  ).address;
}
