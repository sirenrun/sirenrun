import { BN, BorshCoder, type Idl } from "@anchor-lang/core";
import { PublicKey, TransactionInstruction, type AccountMeta, type Signer } from "@solana/web3.js";
import type { Layer } from "../connections.ts";

/**
 * An instruction tagged with the layer it must be sent to. `sendBase` only accepts
 * `BaseInstruction` and `sendEr` only `ErInstruction`, so mixing them fails to compile.
 */
export interface LayerInstruction<L extends Layer> {
  readonly layer: L;
  readonly instruction: TransactionInstruction;
  /** Extra keypairs that must sign, e.g. the session key when creating a session. */
  readonly signers: readonly Signer[];
}
export type BaseInstruction = LayerInstruction<"base">;
export type ErInstruction = LayerInstruction<"er">;

/** Who signs an ER instruction: the wallet itself, or a session key with its token. */
export interface Authority {
  signer: PublicKey;
  sessionToken?: PublicKey;
}

type Accounts = Record<string, PublicKey | null | undefined>;

interface IdlAccount {
  name: string;
  writable?: boolean;
  signer?: boolean;
  optional?: boolean;
  address?: string;
}

/** Encodes instructions for one program from its IDL, with account metas in IDL order. */
export class IdlInstructions {
  readonly programId: PublicKey;
  private readonly coder: BorshCoder;
  private readonly accounts: Map<string, IdlAccount[]>;

  constructor(idl: Idl, programId: PublicKey = new PublicKey(idl.address)) {
    this.programId = programId;
    this.coder = new BorshCoder(idl);
    this.accounts = new Map(
      idl.instructions.map((ix) => {
        const flat = ix.accounts.map((a) => {
          if ("accounts" in a) {
            throw new Error(`${ix.name}: nested account groups are not supported`);
          }
          return a as IdlAccount;
        });
        return [ix.name, flat];
      }),
    );
  }

  /**
   * Account metas follow the IDL: its order, signer and writable flags, and fixed addresses
   * when the caller gives none. A missing optional account becomes the program id, which is
   * how Anchor encodes `None`.
   */
  metas(name: string, given: Accounts): AccountMeta[] {
    const accounts = this.accounts.get(name);
    if (accounts === undefined) {
      throw new Error(`unknown instruction ${name}`);
    }
    return accounts.map((a) => {
      const pubkey = given[a.name] ?? (a.address === undefined ? null : new PublicKey(a.address));
      if (pubkey === null) {
        if (a.optional === true) {
          return { pubkey: this.programId, isSigner: false, isWritable: false };
        }
        throw new Error(`${name}: missing account ${a.name}`);
      }
      return { pubkey, isSigner: a.signer === true, isWritable: a.writable === true };
    });
  }

  build(
    name: string,
    args: Record<string, unknown>,
    accounts: Accounts,
    remaining: AccountMeta[] = [],
  ): TransactionInstruction {
    return new TransactionInstruction({
      programId: this.programId,
      keys: [...this.metas(name, accounts), ...remaining],
      data: this.coder.instruction.encode(name, args),
    });
  }
}

export function tagged<L extends Layer>(
  layer: L,
  instruction: TransactionInstruction,
  signers: readonly Signer[] = [],
): LayerInstruction<L> {
  return { layer, instruction, signers };
}

/** u64 argument as the BN the Anchor coder expects. */
export function u64(value: bigint): BN {
  if (value < 0n || value >= 1n << 64n) {
    throw new RangeError(`${value} does not fit in a u64`);
  }
  return new BN(value.toString());
}

export function u8(value: number, what: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError(`${what} must be a u8, got ${value}`);
  }
  return value;
}
