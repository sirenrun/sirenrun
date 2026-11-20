import {
  SystemProgram,
  TransactionInstruction,
  type Connection,
  type PublicKey,
} from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_DECIMALS, TOKEN_PROGRAM_ID } from "./constants.ts";
import { tagged, u64, type BaseInstruction } from "./ix/instruction.ts";
import { associatedTokenAddress } from "./pdas.ts";

/**
 * The three SPL token instructions the scripts and the devnet faucet need, encoded by hand
 * instead of pulling in `@solana/spl-token`. Checked against the SPL crates' builders in
 * `packages/test-vectors/client.json`.
 */

/** Size of an SPL mint account. */
export const MINT_SIZE = 82;

const INITIALIZE_MINT2 = 20;
const MINT_TO_CHECKED = 14;
const CREATE_IDEMPOTENT = 1;

/** `InitializeMint2` with no freeze authority. The mint account must already exist (82 bytes, owned by the token program). */
export function initializeMintIx(a: {
  mint: PublicKey;
  authority: PublicKey;
  decimals?: number;
}): BaseInstruction {
  const data = new Uint8Array(35);
  data[0] = INITIALIZE_MINT2;
  data[1] = a.decimals ?? TOKEN_DECIMALS;
  data.set(a.authority.toBytes(), 2);
  data[34] = 0;
  return tagged(
    "base",
    new TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      keys: [{ pubkey: a.mint, isSigner: false, isWritable: true }],
      data: Buffer.from(data),
    }),
  );
}

/** Allocates the mint account; send it in the same transaction as `initializeMintIx`. */
export function createMintAccountIx(a: {
  payer: PublicKey;
  mint: PublicKey;
  lamports: number;
}): BaseInstruction {
  return tagged(
    "base",
    SystemProgram.createAccount({
      fromPubkey: a.payer,
      newAccountPubkey: a.mint,
      lamports: a.lamports,
      space: MINT_SIZE,
      programId: TOKEN_PROGRAM_ID,
    }),
  );
}

/** Creates `owner`'s associated token account for `mint` unless it exists. */
export function createAtaIx(a: {
  payer: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
}): BaseInstruction {
  return tagged(
    "base",
    new TransactionInstruction({
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: a.payer, isSigner: true, isWritable: true },
        { pubkey: associatedTokenAddress(a.owner, a.mint), isSigner: false, isWritable: true },
        { pubkey: a.owner, isSigner: false, isWritable: false },
        { pubkey: a.mint, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([CREATE_IDEMPOTENT]),
    }),
  );
}

/** `MintToChecked`, signed by the mint authority. */
export function mintToIx(a: {
  mint: PublicKey;
  destination: PublicKey;
  authority: PublicKey;
  amount: bigint;
  decimals?: number;
}): BaseInstruction {
  const data = Buffer.alloc(10);
  data[0] = MINT_TO_CHECKED;
  data.writeBigUInt64LE(BigInt(u64(a.amount).toString()), 1);
  data[9] = a.decimals ?? TOKEN_DECIMALS;
  return tagged(
    "base",
    new TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: a.mint, isSigner: false, isWritable: true },
        { pubkey: a.destination, isSigner: false, isWritable: true },
        { pubkey: a.authority, isSigner: true, isWritable: false },
      ],
      data,
    }),
  );
}

/** Token balance of `owner`'s associated account, 0 when it does not exist yet. */
export async function fetchTokenBalance(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
): Promise<bigint> {
  const info = await connection.getAccountInfo(associatedTokenAddress(owner, mint));
  // SPL token account layout: mint (32), owner (32), amount (u64 LE) at offset 64.
  return info === null || info.data.length < 72 ? 0n : info.data.readBigUInt64LE(64);
}
