import { AnchorProvider, BN, Program, type Idl } from "@anchor-lang/core";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE_URL = "http://127.0.0.1:8899";
const ER_URL = "http://127.0.0.1:7799";
const ER_IDENTITY = new PublicKey("mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev");
const MAGIC_PROGRAM = new PublicKey("Magic11111111111111111111111111111111111111");
const SESSION_PROGRAM = new PublicKey("KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5");

const idl = JSON.parse(readFileSync("target/idl/spike.json", "utf8")) as Idl;
const programId = new PublicKey(idl.address);
const base = new Connection(BASE_URL, "confirmed");
const er = new Connection(ER_URL, "processed");
const payer = Keypair.generate();

const wallet = {
  publicKey: payer.publicKey,
  signTransaction: async <T extends Transaction>(tx: T) => {
    tx.partialSign(payer);
    return tx;
  },
  signAllTransactions: async <T extends Transaction>(txs: T[]) => {
    txs.forEach((tx) => tx.partialSign(payer));
    return txs;
  },
};
const baseProgram = new Program(idl, new AnchorProvider(base, wallet, { commitment: "confirmed" }));
const erProgram = new Program(idl, new AnchorProvider(er, wallet, { commitment: "processed" }));

const [probe] = PublicKey.findProgramAddressSync(
  [Buffer.from("probe"), payer.publicKey.toBuffer()],
  programId,
);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readProbe(): Promise<{ ticks: number; lastSlot: number; pings: number } | null> {
  const info = await er.getAccountInfo(probe, "processed");
  if (!info) return null;
  return {
    ticks: Number(info.data.readBigUInt64LE(40)),
    lastSlot: Number(info.data.readBigUInt64LE(48)),
    pings: Number(info.data.readBigUInt64LE(56)),
  };
}

async function until<T>(read: () => Promise<T>, done: (v: T) => boolean, timeoutMs: number) {
  const start = Date.now();
  let value = await read();
  while (!done(value) && Date.now() - start < timeoutMs) {
    await wait(50);
    value = await read();
  }
  return value;
}

async function slotTimeMs(): Promise<number> {
  const s0 = await er.getSlot("processed");
  const t0 = Date.now();
  await wait(5000);
  const s1 = await er.getSlot("processed");
  return (Date.now() - t0) / (s1 - s0);
}

async function runCrank(taskId: number, intervalMs: number, iterations: number, signed = false) {
  const before = (await readProbe())?.ticks ?? 0;
  const arrivals: { at: number; ticks: number; slot: number }[] = [];
  const sub = er.onAccountChange(
    probe,
    (info) => {
      arrivals.push({
        at: Date.now(),
        ticks: Number(info.data.readBigUInt64LE(40)),
        slot: Number(info.data.readBigUInt64LE(48)),
      });
    },
    { commitment: "processed" },
  );
  const lamportsBefore = await er.getBalance(payer.publicKey, "processed");
  const start = Date.now();
  const method = signed ? erProgram.methods.scheduleSigned : erProgram.methods.schedule;
  await method(new BN(taskId), new BN(intervalMs), new BN(iterations))
    .accounts({ payer: payer.publicKey, magicProgram: MAGIC_PROGRAM })
    .rpc();
  const timeout = Math.max(intervalMs * iterations * 4, 15_000);
  const end = await until(readProbe, (p) => (p?.ticks ?? 0) - before >= iterations, timeout);
  const elapsed = Date.now() - start;
  await wait(1000);
  await er.removeAccountChangeListener(sub);
  const lamportsAfter = await er.getBalance(payer.publicKey, "processed");

  const ran = (end?.ticks ?? 0) - before;
  const gaps = arrivals.slice(1).map((a, i) => a.at - (arrivals[i]?.at ?? a.at));
  const sorted = [...gaps].sort((a, b) => a - b);
  const pct = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const ticked = arrivals.filter((a) => a.ticks > before);
  const slotSteps = ticked.slice(1).map((a, i) => a.slot - (ticked[i]?.slot ?? a.slot));
  return {
    intervalMs,
    iterations,
    signed,
    ran,
    elapsedMs: elapsed,
    effectiveMsPerTick: ran > 0 ? Math.round(elapsed / ran) : null,
    notifications: arrivals.length,
    wallGapMs: { p50: pct(0.5), p95: pct(0.95), max: sorted.at(-1) ?? 0 },
    slotsPerTick: { min: Math.min(...slotSteps), max: Math.max(...slotSteps) },
    payerLamportsSpent: lamportsBefore - lamportsAfter,
  };
}

async function directTickSignedWithoutCrank() {
  try {
    await erProgram.methods
      .tickSigned()
      .accounts({ probe, crankSigner: payer.publicKey })
      .rpc();
    return "accepted";
  } catch (e) {
    return `rejected: ${(e as Error).message.split("\n")[0]}`;
  }
}

async function runCancel(taskId: number) {
  await erProgram.methods
    .schedule(new BN(taskId), new BN(100), new BN(1_000_000))
    .accounts({ payer: payer.publicKey, magicProgram: MAGIC_PROGRAM })
    .rpc();
  await wait(3000);
  const beforeCancel = (await readProbe())?.ticks ?? 0;
  await erProgram.methods
    .cancel(new BN(taskId))
    .accounts({ payer: payer.publicKey, magicProgram: MAGIC_PROGRAM })
    .rpc();
  await wait(1000);
  const settled = (await readProbe())?.ticks ?? 0;
  await wait(3000);
  const later = (await readProbe())?.ticks ?? 0;
  return {
    millionIterationsAccepted: true,
    ticksBeforeCancel: beforeCancel,
    ticksAfterCancelPlus1s: settled,
    ticksAfterCancelPlus4s: later,
    stopped: later === settled,
  };
}

function createSessionV2Ix(sessionSigner: PublicKey): TransactionInstruction {
  const discriminator = createHash("sha256").update("global:create_session_v2").digest().subarray(0, 8);
  const [sessionToken] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("session_token_v2"),
      programId.toBuffer(),
      sessionSigner.toBuffer(),
      payer.publicKey.toBuffer(),
    ],
    SESSION_PROGRAM,
  );
  return new TransactionInstruction({
    programId: SESSION_PROGRAM,
    keys: [
      { pubkey: sessionToken, isSigner: false, isWritable: true },
      { pubkey: sessionSigner, isSigner: true, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: programId, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([discriminator, Buffer.from([0, 0, 0])]),
  });
}

async function sendSessionPing(session: Keypair, sessionToken: PublicKey) {
  const ix = await erProgram.methods
    .sessionPing()
    .accounts({ probe, sessionToken, signer: session.publicKey })
    .instruction();
  const tx = new Transaction().add(ix);
  tx.feePayer = session.publicKey;
  tx.recentBlockhash = (await er.getLatestBlockhash("processed")).blockhash;
  tx.sign(session);
  try {
    const sig = await er.sendRawTransaction(tx.serialize());
    await er.confirmTransaction(sig, "processed");
    const status = await er.getSignatureStatus(sig);
    return status.value?.err ? `failed: ${JSON.stringify(status.value.err)}` : "ok";
  } catch (e) {
    return `failed: ${(e as Error).message.split("\n")[0]}`;
  }
}

async function runSession() {
  const session = Keypair.generate();
  const [sessionToken] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("session_token_v2"),
      programId.toBuffer(),
      session.publicKey.toBuffer(),
      payer.publicKey.toBuffer(),
    ],
    SESSION_PROGRAM,
  );
  const tx = new Transaction().add(createSessionV2Ix(session.publicKey));
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await base.getLatestBlockhash()).blockhash;
  tx.sign(payer, session);
  await base.confirmTransaction(await base.sendRawTransaction(tx.serialize()), "confirmed");

  const pingsBefore = (await readProbe())?.pings ?? 0;
  const unfunded = await sendSessionPing(session, sessionToken);

  const fund = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: session.publicKey,
      lamports: LAMPORTS_PER_SOL / 100,
    }),
  );
  fund.feePayer = payer.publicKey;
  fund.recentBlockhash = (await base.getLatestBlockhash()).blockhash;
  fund.sign(payer);
  await base.confirmTransaction(await base.sendRawTransaction(fund.serialize()), "confirmed");
  const funded = await sendSessionPing(session, sessionToken);

  const stranger = Keypair.generate();
  const strangerPing = await sendSessionPing(stranger, sessionToken);

  const pingsAfter = (await readProbe())?.pings ?? 0;
  return { unfundedSigner: unfunded, fundedSigner: funded, wrongSigner: strangerPing, pingsAdded: pingsAfter - pingsBefore };
}

async function main() {
  const versions = {
    base: await base.getVersion(),
    er: await er.getVersion(),
  };
  await base.confirmTransaction(await base.requestAirdrop(payer.publicKey, 5 * LAMPORTS_PER_SOL));

  await baseProgram.methods.init().accounts({ payer: payer.publicKey }).rpc();
  const delegateStart = Date.now();
  await baseProgram.methods
    .delegate()
    .accounts({ payer: payer.publicKey })
    .remainingAccounts([{ pubkey: ER_IDENTITY, isSigner: false, isWritable: false }])
    .rpc();
  const visible = await until(readProbe, (p) => p !== null, 30_000);
  const delegateToErMs = Date.now() - delegateStart;
  if (!visible) throw new Error("probe never became readable on the ER");

  const results = {
    versions,
    delegateToErMs,
    erSlotMs: await slotTimeMs(),
    crank100: await runCrank(1001, 100, 100),
    crank50: await runCrank(1002, 50, 100),
    crank10: await runCrank(1003, 10, 100),
    crankSigned: await runCrank(1005, 100, 50, true),
    directTickSigned: await directTickSignedWithoutCrank(),
    cancel: await runCancel(1004),
    session: await runSession(),
  };
  console.log(JSON.stringify(results, null, 2));
}

main().then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e);
    process.exit(1);
  },
);
