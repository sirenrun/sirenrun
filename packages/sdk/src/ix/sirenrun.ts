import type { PublicKey } from "@solana/web3.js";
import { IDL } from "../accounts.ts";
import { TOKEN_PROGRAM_ID } from "../constants.ts";
import {
  arenaPda,
  associatedTokenAddress,
  balancePda,
  configPda,
  delegationAccounts,
  vaultPda,
} from "../pdas.ts";
import type { Side } from "../price.ts";
import {
  IdlInstructions,
  tagged,
  u64,
  u8,
  type Authority,
  type BaseInstruction,
  type ErInstruction,
} from "./instruction.ts";

const program = new IdlInstructions(IDL);

/** Mirrors `ConfigParams`. */
export interface ConfigParams {
  house: PublicKey;
  feeBps: number;
  runnerFeeBps: number;
  entryFee: bigint;
  bond: bigint;
  liquidity: bigint;
  maxBuy: bigint;
}

function configArgs(p: ConfigParams) {
  return {
    params: {
      house: p.house,
      fee_bps: p.feeBps,
      runner_fee_bps: p.runnerFeeBps,
      entry_fee: u64(p.entryFee),
      bond: u64(p.bond),
      liquidity: u64(p.liquidity),
      max_buy: u64(p.maxBuy),
    },
  };
}

const base = (...args: Parameters<typeof program.build>): BaseInstruction =>
  tagged("base", program.build(...args));
const er = (...args: Parameters<typeof program.build>): ErInstruction =>
  tagged("er", program.build(...args));

const signedBy = (auth: Authority) => ({
  signer: auth.signer,
  session_token: auth.sessionToken ?? null,
});

const validatorMeta = (validator: PublicKey) => [
  { pubkey: validator, isSigner: false, isWritable: false },
];

// Base layer

export function initConfigIx(a: { admin: PublicKey; mint: PublicKey; params: ConfigParams }) {
  return base("init_config", configArgs(a.params), {
    admin: a.admin,
    config: configPda().address,
    mint: a.mint,
    vault: vaultPda().address,
  });
}

export function updateConfigIx(a: { admin: PublicKey; params: ConfigParams }) {
  return base("update_config", configArgs(a.params), {
    admin: a.admin,
    config: configPda().address,
  });
}

export function initBalanceIx(a: { owner: PublicKey }) {
  return base("init_balance", {}, { owner: a.owner, balance: balancePda(a.owner).address });
}

interface TokenMove {
  owner: PublicKey;
  mint: PublicKey;
  amount: bigint;
  /** Defaults to the owner's associated token account. */
  ownerToken?: PublicKey;
}

function tokenAccounts(a: TokenMove) {
  return {
    owner: a.owner,
    balance: balancePda(a.owner).address,
    config: configPda().address,
    mint: a.mint,
    owner_token: a.ownerToken ?? associatedTokenAddress(a.owner, a.mint),
    vault: vaultPda().address,
    token_program: TOKEN_PROGRAM_ID,
  };
}

/** Fails with Anchor error 3007 while the balance is delegated; undelegate first. */
export function depositIx(a: TokenMove) {
  return base("deposit", { amount: u64(a.amount) }, tokenAccounts(a));
}

/** Fails with Anchor error 3007 while the balance is delegated; undelegate first. */
export function withdrawIx(a: TokenMove) {
  return base("withdraw", { amount: u64(a.amount) }, tokenAccounts(a));
}

export function delegateBalanceIx(a: { owner: PublicKey; validator: PublicKey }) {
  const balance = balancePda(a.owner).address;
  const d = delegationAccounts(balance);
  return base(
    "delegate_balance",
    {},
    {
      owner: a.owner,
      buffer_balance: d.buffer,
      delegation_record_balance: d.record,
      delegation_metadata_balance: d.metadata,
      balance,
    },
    validatorMeta(a.validator),
  );
}

export function initArenaIx(a: { admin: PublicKey; id: number }) {
  return base(
    "init_arena",
    { id: u8(a.id, "arena id") },
    { admin: a.admin, config: configPda().address, arena: arenaPda(a.id).address },
  );
}

export function delegateArenaIx(a: { admin: PublicKey; id: number; validator: PublicKey }) {
  const arena = arenaPda(a.id).address;
  const d = delegationAccounts(arena);
  return base(
    "delegate_arena",
    { id: u8(a.id, "arena id") },
    {
      admin: a.admin,
      config: configPda().address,
      buffer_arena: d.buffer,
      delegation_record_arena: d.record,
      delegation_metadata_arena: d.metadata,
      arena,
    },
    validatorMeta(a.validator),
  );
}

// Ephemeral rollup

export function startRunIx(a: {
  auth: Authority;
  /** Wallet that drives and pays the entry fee and bond. */
  runner: PublicKey;
  house: PublicKey;
  id: number;
  /** `endpoints(...).oracleQueue`: the ephemeral queue on devnet, the test queue locally. */
  oracleQueue: PublicKey;
}) {
  return er(
    "start_run",
    {},
    {
      ...signedBy(a.auth),
      runner_balance: balancePda(a.runner).address,
      house_balance: balancePda(a.house).address,
      config: configPda().address,
      arena: arenaPda(a.id).address,
      oracle_queue: a.oracleQueue,
    },
  );
}

export function setInputIx(a: { auth: Authority; id: number; targetLane: number; nitro: boolean }) {
  return er(
    "set_input",
    { target_lane: u8(a.targetLane, "target lane"), nitro: a.nitro },
    { ...signedBy(a.auth), arena: arenaPda(a.id).address },
  );
}

export function buyIx(a: {
  auth: Authority;
  /** Wallet whose balance pays. */
  owner: PublicKey;
  house: PublicKey;
  id: number;
  market: number;
  side: Side;
  amount: bigint;
  /** From `minSharesFor(quote.shares, slippageBps)`. */
  minShares: bigint;
}) {
  return er(
    "buy",
    {
      market: u8(a.market, "market"),
      side: a.side === "yes" ? { Yes: {} } : { No: {} },
      amount: u64(a.amount),
      min_shares: u64(a.minShares),
    },
    {
      ...signedBy(a.auth),
      trader_balance: balancePda(a.owner).address,
      house_balance: balancePda(a.house).address,
      config: configPda().address,
      arena: arenaPda(a.id).address,
    },
  );
}

export function claimIx(a: {
  auth: Authority;
  owner: PublicKey;
  house: PublicKey;
  /** Arena the entry was bought in (`entry.arenaId`). */
  id: number;
  entryIndex: number;
}) {
  return er(
    "claim",
    { entry_index: u8(a.entryIndex, "entry index") },
    {
      ...signedBy(a.auth),
      trader_balance: balancePda(a.owner).address,
      house_balance: balancePda(a.house).address,
      config: configPda().address,
      arena: arenaPda(a.id).address,
    },
  );
}

/** Commits the balance to the base layer and hands it back; then `waitForUndelegation`. */
export function undelegateBalanceIx(a: { auth: Authority; owner: PublicKey }) {
  return er(
    "undelegate_balance",
    {},
    { ...signedBy(a.auth), balance: balancePda(a.owner).address },
  );
}
