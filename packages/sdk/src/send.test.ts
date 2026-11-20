import {
  Keypair,
  PublicKey,
  SendTransactionError,
  Transaction,
  type AccountInfo,
  type Commitment,
  type SendOptions,
} from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  DELEGATION_PROGRAM_ID,
  PROGRAM_ID,
  TransactionFailed,
  createSession,
  initBalanceIx,
  sendBase,
  sendEr,
  sessionAuthority,
  setInputIx,
  waitForDelegation,
  waitForUndelegation,
  type BaseConnection,
  type ErConnection,
  type Layer,
  type WalletSigner,
} from "./index.ts";

interface Sent {
  tx: Transaction;
  options: SendOptions | undefined;
}

/** Records what `send` does; each layer hands out its own blockhash. */
function fakeConnection<L extends Layer>(
  layer: L,
  behaviour: {
    sendError?: Error;
    confirmErr?: unknown;
    accounts?: () => AccountInfo<Buffer> | null;
  } = {},
) {
  const sent: Sent[] = [];
  const commitments: (Commitment | undefined)[] = [];
  const blockhash = Keypair.generate().publicKey.toBase58();
  const connection = {
    layer,
    getLatestBlockhash: async (commitment?: Commitment) => {
      commitments.push(commitment);
      return { blockhash, lastValidBlockHeight: 100 };
    },
    sendRawTransaction: async (raw: Buffer, options?: SendOptions) => {
      if (behaviour.sendError !== undefined) throw behaviour.sendError;
      sent.push({ tx: Transaction.from(raw), options });
      return "sig";
    },
    confirmTransaction: async (_: unknown, commitment?: Commitment) => {
      commitments.push(commitment);
      return { context: { slot: 1 }, value: { err: behaviour.confirmErr ?? null } };
    },
    getAccountInfo: async () => behaviour.accounts?.() ?? null,
  };
  return {
    connection: connection as unknown as L extends "er" ? ErConnection : BaseConnection,
    sent,
    commitments,
    blockhash,
  };
}

/** `signer` signed, and every signature present is valid for the message. */
function verifies(tx: Transaction, signer: PublicKey): boolean {
  const entry = tx.signatures.find((s) => s.publicKey.equals(signer));
  return entry?.signature != null && tx.verifySignatures(false);
}

function fakeWallet(keypair: Keypair): WalletSigner {
  return {
    publicKey: keypair.publicKey,
    signTransaction: async <T extends Transaction>(tx: T) => {
      tx.partialSign(keypair);
      return tx;
    },
  };
}

const owner = Keypair.generate();
const session = createSession({ authority: owner.publicKey, nowSeconds: 1_000 }).session;
const input = setInputIx({ auth: sessionAuthority(session), id: 0, targetLane: 3, nitro: false });

describe("sendEr", () => {
  it("uses the ER blockhash, signs with the session key, keeps preflight on", async () => {
    const er = fakeConnection("er");
    expect(await sendEr(er.connection, session.keypair, [input])).toBe("sig");
    const [first] = er.sent;
    expect(first?.tx.recentBlockhash).toBe(er.blockhash);
    expect(first?.tx.feePayer?.equals(session.keypair.publicKey)).toBe(true);
    expect(verifies(first?.tx as Transaction, session.keypair.publicKey)).toBe(true);
    expect(first?.options?.skipPreflight).toBe(false);
    expect(er.commitments).toEqual(["processed", "processed"]);
  });

  it("refuses the base connection and base instructions", async () => {
    const base = fakeConnection("base");
    const er = fakeConnection("er");
    const init = initBalanceIx({ owner: owner.publicKey });
    await expect(
      sendEr(base.connection as unknown as ErConnection, session.keypair, [input]),
    ).rejects.toThrow(/expected the er connection, got base/);
    await expect(sendEr(er.connection, owner, [init as never])).rejects.toThrow(
      /base instruction cannot be sent to the er connection/,
    );
    expect(er.sent).toHaveLength(0);
  });

  it("names the program error from a failed confirmation", async () => {
    const er = fakeConnection("er", { confirmErr: { InstructionError: [0, { Custom: 6003 }] } });
    const error = await sendEr(er.connection, session.keypair, [input]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransactionFailed);
    expect(error).toMatchObject({
      errorName: "InsufficientBalance",
      code: 6003,
      layer: "er",
      signature: "sig",
    });
  });

  it("names the program error from failed preflight logs", async () => {
    const logs = [`Program ${PROGRAM_ID.toBase58()} failed: custom program error: 0x1770`];
    const er = fakeConnection("er", {
      sendError: new SendTransactionError({
        action: "simulate",
        signature: "",
        transactionMessage: "simulation failed",
        logs,
      }),
    });
    const error = await sendEr(er.connection, session.keypair, [input]).catch((e: unknown) => e);
    expect(error).toMatchObject({ errorName: "ArenaBusy", code: 6000, logs });
  });

  it("takes the code from the message when the ER returns no logs", async () => {
    const er = fakeConnection("er", {
      sendError: new SendTransactionError({
        action: "send",
        signature: "",
        transactionMessage:
          "transaction verification error: Error processing Instruction 0: custom program error: 0x1772",
      }),
    });
    const error = await sendEr(er.connection, session.keypair, [input]).catch((e: unknown) => e);
    expect(error).toMatchObject({ errorName: "MarketClosed", code: 6002 });
  });
});

describe("sendBase", () => {
  it("adds the keypairs an instruction carries before the wallet signs", async () => {
    const base = fakeConnection("base");
    const { session: s, ix } = createSession({ authority: owner.publicKey, nowSeconds: 1_000 });
    await sendBase(base.connection, fakeWallet(owner), [ix]);
    const tx = base.sent[0]?.tx as Transaction;
    expect(tx.recentBlockhash).toBe(base.blockhash);
    expect(verifies(tx, owner.publicKey)).toBe(true);
    expect(verifies(tx, s.keypair.publicKey)).toBe(true);
    expect(base.commitments).toEqual(["confirmed", "confirmed"]);
  });

  it("does not compile with an ER instruction or the ER connection", () => {
    const base = fakeConnection("base");
    const er = fakeConnection("er");
    const run = () => {
      // @ts-expect-error ER instructions go through sendEr
      void sendBase(base.connection, owner, [input]);
      // @ts-expect-error the ER connection is not the base connection
      void sendBase(er.connection, owner, [initBalanceIx({ owner: owner.publicKey })]);
    };
    expect(run).toBeTypeOf("function");
  });
});

describe("polling", () => {
  const account = Keypair.generate().publicKey;
  const ownedBy = (programOwner: PublicKey): AccountInfo<Buffer> => ({
    owner: programOwner,
    lamports: 1,
    data: Buffer.alloc(0),
    executable: false,
    rentEpoch: 0,
  });

  it("waits for the base layer to own an undelegated balance again", async () => {
    let calls = 0;
    const base = fakeConnection("base", {
      accounts: () => ownedBy(++calls < 3 ? DELEGATION_PROGRAM_ID : PROGRAM_ID),
    });
    await waitForUndelegation(base.connection, account, { intervalMs: 1 });
    expect(calls).toBe(3);
  });

  it("waits for a delegated account to appear on the ER", async () => {
    let erCalls = 0;
    const base = fakeConnection("base", { accounts: () => ownedBy(DELEGATION_PROGRAM_ID) });
    const er = fakeConnection("er", {
      accounts: () => (++erCalls < 2 ? null : ownedBy(PROGRAM_ID)),
    });
    await waitForDelegation(base.connection, er.connection, account, { intervalMs: 1 });
    expect(erCalls).toBe(2);
  });

  it("times out", async () => {
    const base = fakeConnection("base", { accounts: () => ownedBy(DELEGATION_PROGRAM_ID) });
    await expect(
      waitForUndelegation(base.connection, account, { intervalMs: 1, timeoutMs: 5 }),
    ).rejects.toThrow(/timed out/);
  });
});
