import type { Arena, Market, MarketStatus } from "@sirenrun/sdk";
import {
  ACCEL,
  GAP_MAX,
  LINES,
  NITRO_BOOST,
  NITRO_TICKS,
  POLICE_ACCEL_DEN,
  POLICE_ACCEL_NUM,
  POLICE_BASE,
  SPEED_MAX,
  SETTLE_TICKS,
  STAGING_TICKS,
  generateRow,
  setInput,
  splitmix64,
  startState,
  step,
  type SimState,
} from "@sirenrun/sim";
import { PublicKey } from "@solana/web3.js";

/**
 * An offline run for the landing page and for previewing the scene without a chain: the real
 * TS sim, driven by a bot that plays like a decent human, emitting the same `Arena` snapshots
 * the ER sends. Nothing here is trusted or settles anything.
 */

/** Chance the bot fails to react to a row and holds its lane, like a player who misses it. */
const MISS_CHANCE = 0.06;
/** Nitro once the police are this close, so demo runs show the comeback. */
const NITRO_BELOW_GAP = 700;
/** Shorter than the onchain staging so the attract loop keeps moving. */
const DEMO_STAGING_TICKS = 30;

const RESERVE = 50_000_000n;

type Phase = "staging" | "live" | "settled";

export interface DemoOptions {
  seed?: bigint;
  /** Live ticks to fast-forward on start, e.g. to preview the late game. */
  skip?: number;
  /** Bot miss chance per row, 0..1. */
  miss?: number;
}

export class DemoRun {
  seed: bigint;
  sim: SimState;
  phase: Phase = "staging";
  phaseTicks = 0;
  nonce: number;
  private rng: bigint;
  private missed = new Map<number, boolean>();
  private resolved: { status: MarketStatus; tick: number }[];
  private readonly miss: number;

  constructor(nonce: number, opts: DemoOptions = {}) {
    this.nonce = nonce;
    this.seed = opts.seed ?? splitmix64(BigInt(nonce) ^ BigInt(Date.now()));
    this.rng = this.seed;
    this.miss = opts.miss ?? MISS_CHANCE;
    this.sim = startState();
    this.resolved = LINES.map(() => ({ status: "open" as MarketStatus, tick: 0 }));
    const skip = opts.skip ?? 0;
    if (skip > 0) {
      this.phase = "live";
      while (this.sim.t < skip && this.phase === "live") this.liveTick();
    }
  }

  /** Deterministic per-seed randomness for the bot, so a seed replays the same run. */
  private random(): number {
    this.rng = splitmix64(this.rng);
    return Number(this.rng >> 11n) / 2 ** 53;
  }

  private botInput(): void {
    const s = this.sim;
    let missed = this.missed.get(s.row);
    if (missed === undefined) {
      missed = this.random() < this.miss;
      this.missed.set(s.row, missed);
    }
    const lane = missed ? s.targetLane : generateRow(this.seed, s.row, s.safeLane).safeLane;
    const nitro = s.policeGap < NITRO_BELOW_GAP && s.nitroLeft > 0 && s.nitroTicks === 0;
    setInput(s, lane, nitro);
  }

  private liveTick(): void {
    this.botInput();
    step(this.sim, this.seed);
    LINES.forEach((line, i) => {
      const m = this.resolved[i];
      if (m === undefined || m.status !== "open") return;
      if (this.sim.t >= line) this.resolved[i] = { status: "yes", tick: this.sim.t };
      else if (this.sim.busted) this.resolved[i] = { status: "no", tick: this.sim.t };
    });
    if (this.sim.busted) {
      this.phase = "settled";
      this.phaseTicks = 0;
    }
  }

  /** Advances one 100 ms tick. Returns false once the run has finished its results hold. */
  tick(): boolean {
    this.phaseTicks += 1;
    if (this.phase === "staging" && this.phaseTicks >= DEMO_STAGING_TICKS) {
      this.phase = "live";
      this.phaseTicks = 0;
    } else if (this.phase === "live") {
      this.liveTick();
    } else if (this.phase === "settled" && this.phaseTicks >= SETTLE_TICKS) {
      return false;
    }
    return true;
  }

  arena(): Arena {
    const markets: Market[] = LINES.map((line, i) => {
      const m = this.resolved[i] ?? { status: "open" as MarketStatus, tick: 0 };
      if (m.status !== "open") {
        return { line, status: m.status, yesR: RESERVE, noR: RESERVE, resolvedTick: m.tick };
      }
      // Price the open line at the demo's own odds: YES price = noR / (yesR + noR).
      const ppm = BigInt(Math.round(demoOdds(this.sim, line) * 1_000_000));
      return {
        line,
        status: m.status,
        yesR: (2n * RESERVE * (1_000_000n - ppm)) / 1_000_000n,
        noR: (2n * RESERVE * ppm) / 1_000_000n,
        resolvedTick: m.tick,
      };
    });
    return {
      id: 0,
      bump: 0,
      status: this.phase,
      // The HUD counts staging down from the onchain length; map the short demo onto it.
      phaseTicks:
        this.phase === "staging"
          ? Math.round((this.phaseTicks / DEMO_STAGING_TICKS) * STAGING_TICKS)
          : this.phaseTicks,
      nonce: this.nonce,
      runner: PublicKey.default,
      seedReady: true,
      seed: this.seed,
      sim: { ...this.sim },
      bond: 0n,
      noProfitOi: 0n,
      runnerFees: 0n,
      markets,
      results: [],
      resultsHead: 0,
    };
  }
}

/**
 * Rough chance the run reaches `line`, used only to move the demo's prices so the attract loop
 * and `/demo` look like a traded market. It plays the gap forward with no further hits (the car
 * climbs back to cruise speed, the police keep accelerating, the gap stays under its cap),
 * credits the nitro still in hand, squashes the lowest gap into a probability, and discounts
 * for rows a player may still miss before the line.
 */
export function demoOdds(sim: SimState, line: number): number {
  if (sim.t >= line) return 1;
  if (sim.busted) return 0;
  let gap = sim.policeGap;
  let speed = sim.speed;
  let lowest = gap;
  for (let t = sim.t; t < line; t += 1) {
    speed = Math.min(SPEED_MAX, speed + ACCEL);
    gap = Math.min(
      GAP_MAX,
      gap + speed - (POLICE_BASE + (t * POLICE_ACCEL_NUM) / POLICE_ACCEL_DEN),
    );
    lowest = Math.min(lowest, gap);
  }
  // Unused nitro buys back ground when the police get close.
  const reserve = sim.nitroLeft * NITRO_BOOST * NITRO_TICKS * 0.4;
  const clean = 1 / (1 + Math.exp(-(lowest + reserve - 150) / 180));
  // A miss costs more the later it comes (the gap is smaller then), so later lines carry more
  // risk per remaining tick.
  const misses = Math.exp(-((line - sim.t) / 1500) * (1 + line / 900));
  return Math.min(0.97, Math.max(0.03, clean * misses));
}
