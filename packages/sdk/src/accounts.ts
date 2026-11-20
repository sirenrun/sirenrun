import { BorshCoder, type Idl } from "@anchor-lang/core";
import type { Connection, PublicKey } from "@solana/web3.js";
import idlJson from "./idl/sirenrun.json" with { type: "json" };
import { arenaPda, balancePda, configPda } from "./pdas.ts";

export const IDL = idlJson as Idl;
export const coder = new BorshCoder(IDL);

export type ArenaStatus = "idle" | "staging" | "live" | "settled";
export type MarketStatus = "open" | "yes" | "no" | "void";
export type EntrySide = "empty" | "yes" | "no";

export interface Config {
  admin: PublicKey;
  mint: PublicKey;
  vault: PublicKey;
  house: PublicKey;
  feeBps: number;
  runnerFeeBps: number;
  entryFee: bigint;
  bond: bigint;
  liquidity: bigint;
  maxBuy: bigint;
  /** Charged to the driver each time a nitro charge fires. */
  nitroFee: bigint;
  /** Opening RIDE price per line, in bps. */
  openBps: number[];
  bump: number;
  vaultBump: number;
}

export interface PositionEntry {
  arenaId: number;
  nonce: number;
  market: number;
  side: EntrySide;
  shares: bigint;
  /** Net of fee. */
  cost: bigint;
  /** Live tick when last bought. */
  tick: number;
}

export interface Balance {
  owner: PublicKey;
  available: bigint;
  entries: PositionEntry[];
  bump: number;
}

export interface RunSim {
  t: number;
  carX: number;
  targetLane: number;
  speed: number;
  nitroLeft: number;
  nitroTicks: number;
  invuln: number;
  distance: number;
  row: number;
  safeLane: number;
  policeGap: number;
  busted: boolean;
  nitroPressed: boolean;
}

export interface Market {
  line: number;
  status: MarketStatus;
  yesR: bigint;
  noR: bigint;
  resolvedTick: number;
  /** Tokens the house kept out of the pool at an uneven opening. */
  houseYes: bigint;
  houseNo: bigint;
  /** What BUST holders would win here on a bust; shares the cap with the other open lines. */
  noProfit: bigint;
  /** Total net cost of RIDE buys, which share a forfeited bond on a bust. */
  rideCost: bigint;
  /** Share of a losing RIDE position's cost refunded from the bond, set on bust. */
  rideBackBps: number;
}

export interface RunResult {
  nonce: number;
  /** Unpacked from the 2-bits-per-market byte onchain. */
  outcomes: MarketStatus[];
  resolvedTicks: number[];
  rideBackBps: number[];
}

export interface Arena {
  id: number;
  bump: number;
  status: ArenaStatus;
  phaseTicks: number;
  nonce: number;
  runner: PublicKey;
  seedReady: boolean;
  seed: bigint;
  sim: RunSim;
  bond: bigint;
  runnerFees: bigint;
  markets: Market[];
  results: RunResult[];
  resultsHead: number;
}

/** What `BorshCoder` returns: IDL field names, enums as `{ Variant: {} }`, u64 as BN. */
interface Big {
  toString(): string;
}
type RawEnum = Record<string, unknown>;

interface RawConfig {
  admin: PublicKey;
  mint: PublicKey;
  vault: PublicKey;
  house: PublicKey;
  fee_bps: number;
  runner_fee_bps: number;
  entry_fee: Big;
  bond: Big;
  liquidity: Big;
  max_buy: Big;
  nitro_fee: Big;
  open_bps: number[];
  bump: number;
  vault_bump: number;
}

interface RawEntry {
  arena_id: number;
  nonce: number;
  market: number;
  side: number;
  shares: Big;
  cost: Big;
  tick: number;
}

interface RawBalance {
  owner: PublicKey;
  available: Big;
  entries: RawEntry[];
  bump: number;
}

interface RawSim {
  t: number;
  car_x: number;
  target_lane: number;
  speed: number;
  nitro_left: number;
  nitro_ticks: number;
  invuln: number;
  distance: number;
  row: number;
  safe_lane: number;
  police_gap: number;
  busted: boolean;
  nitro_pressed: boolean;
}

interface RawMarket {
  line: number;
  status: RawEnum;
  yes_r: Big;
  no_r: Big;
  resolved_tick: number;
  house_yes: Big;
  house_no: Big;
  no_profit: Big;
  ride_cost: Big;
  ride_back_bps: number;
}

interface RawResult {
  nonce: number;
  outcomes: number;
  resolved_ticks: number[];
  ride_back_bps: number[];
}

interface RawArena {
  id: number;
  bump: number;
  status: RawEnum;
  phase_ticks: number;
  nonce: number;
  runner: PublicKey;
  seed_ready: boolean;
  seed: Big;
  sim: RawSim;
  bond: Big;
  runner_fees: Big;
  markets: RawMarket[];
  results: RawResult[];
  results_head: number;
}

const big = (value: Big): bigint => BigInt(value.toString());

function variant<T extends string>(raw: RawEnum, allowed: readonly T[]): T {
  const name = Object.keys(raw)[0]?.toLowerCase();
  const match = allowed.find((v) => v === name);
  if (match === undefined) {
    throw new Error(`unknown enum variant ${JSON.stringify(raw)}`);
  }
  return match;
}

const ARENA_STATUSES = ["idle", "staging", "live", "settled"] as const;
const MARKET_STATUSES = ["open", "yes", "no", "void"] as const;
const ENTRY_SIDES = ["empty", "yes", "no"] as const;

function entrySide(code: number): EntrySide {
  const side = ENTRY_SIDES[code];
  if (side === undefined) {
    throw new Error(`unknown position side ${code}`);
  }
  return side;
}

/** Same rule as `MarketStatus::from_bits`: the two low bits, 0 = open. */
export function outcomeAt(outcomes: number, market: number): MarketStatus {
  return MARKET_STATUSES[(outcomes >> (2 * market)) & 0b11] as MarketStatus;
}

/**
 * Takes the `Buffer` web3.js returns as account data. Browsers have no global `Buffer`, so
 * the SDK never builds one itself.
 */
function decode<T>(name: "Config" | "Balance" | "Arena", data: Buffer): T {
  return coder.accounts.decode<T>(name, data);
}

export function decodeConfig(data: Buffer): Config {
  const raw = decode<RawConfig>("Config", data);
  return {
    admin: raw.admin,
    mint: raw.mint,
    vault: raw.vault,
    house: raw.house,
    feeBps: raw.fee_bps,
    runnerFeeBps: raw.runner_fee_bps,
    entryFee: big(raw.entry_fee),
    bond: big(raw.bond),
    liquidity: big(raw.liquidity),
    maxBuy: big(raw.max_buy),
    nitroFee: big(raw.nitro_fee),
    openBps: [...raw.open_bps],
    bump: raw.bump,
    vaultBump: raw.vault_bump,
  };
}

export function decodeBalance(data: Buffer): Balance {
  const raw = decode<RawBalance>("Balance", data);
  return {
    owner: raw.owner,
    available: big(raw.available),
    entries: raw.entries.map((e) => ({
      arenaId: e.arena_id,
      nonce: e.nonce,
      market: e.market,
      side: entrySide(e.side),
      shares: big(e.shares),
      cost: big(e.cost),
      tick: e.tick,
    })),
    bump: raw.bump,
  };
}

export function decodeArena(data: Buffer): Arena {
  const raw = decode<RawArena>("Arena", data);
  const s = raw.sim;
  return {
    id: raw.id,
    bump: raw.bump,
    status: variant(raw.status, ARENA_STATUSES),
    phaseTicks: raw.phase_ticks,
    nonce: raw.nonce,
    runner: raw.runner,
    seedReady: raw.seed_ready,
    seed: big(raw.seed),
    sim: {
      t: s.t,
      carX: s.car_x,
      targetLane: s.target_lane,
      speed: s.speed,
      nitroLeft: s.nitro_left,
      nitroTicks: s.nitro_ticks,
      invuln: s.invuln,
      distance: s.distance,
      row: s.row,
      safeLane: s.safe_lane,
      policeGap: s.police_gap,
      busted: s.busted,
      nitroPressed: s.nitro_pressed,
    },
    bond: big(raw.bond),
    runnerFees: big(raw.runner_fees),
    markets: raw.markets.map((m) => ({
      line: m.line,
      status: variant(m.status, MARKET_STATUSES),
      yesR: big(m.yes_r),
      noR: big(m.no_r),
      resolvedTick: m.resolved_tick,
      houseYes: big(m.house_yes),
      houseNo: big(m.house_no),
      noProfit: big(m.no_profit),
      rideCost: big(m.ride_cost),
      rideBackBps: m.ride_back_bps,
    })),
    results: raw.results.map((r) => ({
      nonce: r.nonce,
      outcomes: raw.markets.map((_, i) => outcomeAt(r.outcomes, i)),
      resolvedTicks: [...r.resolved_ticks],
      rideBackBps: [...r.ride_back_bps],
    })),
    resultsHead: raw.results_head,
  };
}

async function fetchDecoded<T>(
  connection: Connection,
  address: PublicKey,
  decoder: (data: Buffer) => T,
): Promise<T | null> {
  const info = await connection.getAccountInfo(address);
  return info === null ? null : decoder(info.data);
}

/** Config lives on the base layer; the ER reads it too. */
export function fetchConfig(connection: Connection): Promise<Config | null> {
  return fetchDecoded(connection, configPda().address, decodeConfig);
}

/**
 * A balance is current on the ER while delegated and on the base layer otherwise; while
 * delegated, the base copy is stale.
 */
export function fetchBalance(connection: Connection, owner: PublicKey): Promise<Balance | null> {
  return fetchDecoded(connection, balancePda(owner).address, decodeBalance);
}

export function fetchArena(connection: Connection, id: number): Promise<Arena | null> {
  return fetchDecoded(connection, arenaPda(id).address, decodeArena);
}

const ERROR_NAMES = new Map((IDL.errors ?? []).map((e) => [e.code, e.name]));
const ERROR_MESSAGES = new Map((IDL.errors ?? []).map((e) => [e.code, e.msg ?? e.name]));

/** Name of a sirenrun custom error code (6000 + n), e.g. `ArenaBusy`. */
export function programErrorName(code: number): string | undefined {
  return ERROR_NAMES.get(code);
}

export function programErrorMessage(code: number): string | undefined {
  return ERROR_MESSAGES.get(code);
}
