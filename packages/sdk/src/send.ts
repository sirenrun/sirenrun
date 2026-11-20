import {
  SendTransactionError,
  Transaction,
  type Commitment,
  type Connection,
  type PublicKey,
  type Signer,
  type TransactionError,
} from "@solana/web3.js";
import { programErrorName } from "./accounts.ts";
import { assertLayer, type BaseConnection, type ErConnection, type Layer } from "./connections.ts";
import { DELEGATION_PROGRAM_ID, PROGRAM_ID } from "./constants.ts";
import type { BaseInstruction, ErInstruction, LayerInstruction } from "./ix/instruction.ts";

/** The part of a wallet adapter the SDK needs. */
export interface WalletSigner {
  publicKey: PublicKey;
  signTransaction<T extends Transaction>(tx: T): Promise<T>;
}

/** Either a keypair (session key, script wallet) or a browser wallet. */
export type Payer = Signer | WalletSigner;

/** A failed transaction, with the sirenrun error name when the program raised one. */
export class TransactionFailed extends Error {
  readonly layer: Layer;
  /** Custom program error code, e.g. 6003. */
  readonly code: number | undefined;
  /** sirenrun error name for `code`, e.g. `InsufficientBalance`. */
  readonly errorName: string | undefined;
  readonly logs: readonly string[];
  readonly signature: string | undefined;

  constructor(
    message: string,
    details: {
      layer: Layer;
      code: number | undefined;
      errorName: string | undefined;
      logs: readonly string[];
      signature: string | undefined;
    },
  ) {
    super(message);
    this.name = "TransactionFailed";
    this.layer = details.layer;
    this.code = details.code;
    this.errorName = details.errorName;
    this.logs = details.logs;
    this.signature = details.signature;
  }
}

const isWallet = (payer: Payer): payer is WalletSigner => "signTransaction" in payer;

/** Custom error code from a transaction error such as `{ InstructionError: [0, { Custom: 6003 }] }`. */
export function customErrorCode(err: TransactionError | null | undefined): number | undefined {
  if (err === null || err === undefined || typeof err !== "object") return undefined;
  const inner = (err as { InstructionError?: [number, unknown] }).InstructionError?.[1];
  if (inner !== null && typeof inner === "object" && "Custom" in inner) {
    const code = (inner as { Custom: unknown }).Custom;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

/** Custom error code from simulation logs (`custom program error: 0x1773`). */
function codeFromLogs(logs: readonly string[]): number | undefined {
  for (const line of logs) {
    const match = /custom program error: 0x([0-9a-f]+)/i.exec(line);
    if (match?.[1] !== undefined) return Number.parseInt(match[1], 16);
  }
  return undefined;
}

function failure(
  layer: Layer,
  code: number | undefined,
  logs: readonly string[],
  signature: string | undefined,
  fallback: string,
): TransactionFailed {
  const name = code === undefined ? undefined : programErrorName(code);
  const message = name ?? (code === undefined ? fallback : `custom program error ${code}`);
  return new TransactionFailed(message, { layer, code, errorName: name, logs, signature });
}

async function asFailure(layer: Layer, connection: Connection, error: unknown) {
  if (error instanceof SendTransactionError) {
    // Preflight failures carry the simulation logs; the ER sometimes sends none, and then
    // the code is only in the message.
    const logs = error.logs ?? (await error.getLogs(connection).catch(() => null)) ?? [];
    const code = codeFromLogs(logs) ?? codeFromLogs([error.message]);
    return failure(layer, code, logs, undefined, error.message);
  }
  return error;
}

async function send<L extends Layer>(
  connection: Connection,
  layer: L,
  payer: Payer,
  ixs: readonly LayerInstruction<L>[],
  extraSigners: readonly Signer[],
  commitment: Commitment,
): Promise<string> {
  assertLayer(connection, layer);
  if (ixs.length === 0) throw new Error("no instructions to send");
  for (const ix of ixs) {
    if (ix.layer !== layer) {
      throw new Error(`a ${ix.layer} instruction cannot be sent to the ${layer} connection`);
    }
  }
  // The blockhash must come from the layer that executes the transaction.
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);
  const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight });
  tx.add(...ixs.map((ix) => ix.instruction));

  const signers = [...extraSigners, ...ixs.flatMap((ix) => ix.signers)].filter(
    (s, i, all) => all.findIndex((o) => o.publicKey.equals(s.publicKey)) === i,
  );
  let signed: Transaction;
  if (isWallet(payer)) {
    if (signers.length > 0) tx.partialSign(...signers);
    signed = await payer.signTransaction(tx);
  } else {
    tx.sign(payer, ...signers.filter((s) => !s.publicKey.equals(payer.publicKey)));
    signed = tx;
  }

  let signature: string;
  try {
    // Preflight stays on: on the ER, skipping it only hides errors.
    signature = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      preflightCommitment: commitment,
    });
  } catch (error) {
    throw await asFailure(layer, connection, error);
  }
  const { value } = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    commitment,
  );
  if (value.err !== null) {
    throw failure(layer, customErrorCode(value.err), [], signature, JSON.stringify(value.err));
  }
  return signature;
}

/** Sends base-layer instructions, signed by the wallet (and any keypairs they carry). */
export function sendBase(
  base: BaseConnection,
  payer: Payer,
  ixs: readonly BaseInstruction[],
  options: { extraSigners?: readonly Signer[]; commitment?: Commitment } = {},
): Promise<string> {
  return send(
    base,
    "base",
    payer,
    ixs,
    options.extraSigners ?? [],
    options.commitment ?? "confirmed",
  );
}

/**
 * Sends ER instructions. The payer is usually the session keypair: ER transactions are
 * fee-free, so it needs no lamports. Confirms at `processed`, one 50 ms ER slot.
 */
export function sendEr(
  er: ErConnection,
  payer: Payer,
  ixs: readonly ErInstruction[],
  options: { extraSigners?: readonly Signer[]; commitment?: Commitment } = {},
): Promise<string> {
  return send(er, "er", payer, ixs, options.extraSigners ?? [], options.commitment ?? "processed");
}

export interface PollOptions {
  timeoutMs?: number;
  intervalMs?: number;
  signal?: AbortSignal;
}

async function poll(what: string, check: () => Promise<boolean>, options: PollOptions) {
  const timeout = options.timeoutMs ?? 30_000;
  const interval = options.intervalMs ?? 500;
  const deadline = Date.now() + timeout;
  for (;;) {
    options.signal?.throwIfAborted();
    if (await check()) return;
    if (Date.now() >= deadline)
      throw new Error(`timed out after ${timeout} ms waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/** Waits until a just-delegated account is owned by the delegation program and readable on the ER. */
export function waitForDelegation(
  base: BaseConnection,
  er: ErConnection,
  account: PublicKey,
  options: PollOptions = {},
): Promise<void> {
  return poll(
    `${account.toBase58()} to be delegated`,
    async () => {
      const onBase = await base.getAccountInfo(account);
      if (onBase === null || !onBase.owner.equals(DELEGATION_PROGRAM_ID)) return false;
      return (await er.getAccountInfo(account)) !== null;
    },
    options,
  );
}

/** Waits until the base layer owns `account` again, after `undelegate_balance` on the ER. */
export function waitForUndelegation(
  base: BaseConnection,
  account: PublicKey,
  options: PollOptions = {},
): Promise<void> {
  return poll(
    `${account.toBase58()} to return to the base layer`,
    async () => (await base.getAccountInfo(account))?.owner.equals(PROGRAM_ID) ?? false,
    options,
  );
}

/** True while the base layer shows `account` as delegated to the ER. */
export async function isDelegated(base: BaseConnection, account: PublicKey): Promise<boolean> {
  return (await base.getAccountInfo(account))?.owner.equals(DELEGATION_PROGRAM_ID) ?? false;
}
