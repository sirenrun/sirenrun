import type { Arena, Market, PositionEntry } from "@sirenrun/sdk";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { channelStatus } from "./lobby";
import { grossOf, rememberPositions, shortAddress, summarizeRun } from "./results";

const RUNNER = new PublicKey("11111111111111111111111111111112");
const T = 1_000_000n;

const market = (
  line: number,
  status: Market["status"],
  resolvedTick = 0,
  noProfit = 0n,
  rideCost = 0n,
  rideBackBps = 0,
): Market => ({
  line,
  status,
  yesR: 100n * T,
  noR: 100n * T,
  resolvedTick,
  houseYes: 0n,
  houseNo: 0n,
  noProfit,
  rideCost,
  rideBackBps,
});

function arena(over: Partial<Arena> = {}): Arena {
  return {
    id: 1,
    bump: 0,
    status: "settled",
    phaseTicks: 0,
    nonce: 4,
    runner: RUNNER,
    seedReady: true,
    seed: 1n,
    sim: {
      t: 640,
      carX: 480,
      targetLane: 2,
      speed: 80,
      nitroLeft: 0,
      nitroTicks: 0,
      invuln: 0,
      distance: 0,
      row: 0,
      safeLane: 2,
      policeGap: 0,
      busted: true,
      nitroPressed: false,
    },
    bond: 25n * T,
    runnerFees: 2n * T,
    markets: [market(300, "yes", 300), market(600, "yes", 600), market(900, "no", 640)],
    results: [],
    resultsHead: 0,
    ...over,
  };
}

const entry = (over: Partial<PositionEntry>): PositionEntry => ({
  arenaId: 1,
  nonce: 4,
  market: 0,
  side: "yes",
  shares: 9n * T,
  cost: 5n * T,
  tick: 100,
  ...over,
});

const terms = { feeBps: 200, entryFee: T, nitroFee: T / 2n, liquidity: 100n * T };

describe("run results", () => {
  it("returns the whole bond on a bust nobody bet on, and charges each nitro fired", () => {
    const s = summarizeRun(arena(), [], terms);
    expect(s.lines.map((l) => `${l.seconds}:${l.status}`)).toEqual(["30:yes", "60:yes", "90:no"]);
    expect(s.driver.bondLost).toBe(0n);
    // All three charges fired (nitroLeft 0): 1.5 in nitro. Pools untouched: no pass share.
    expect(s.driver.nitro).toBe((3n * T) / 2n);
    expect(s.driver.net).toBe(2n * T - T - (3n * T) / 2n);
    expect(s.driver.address).toBe(shortAddress(RUNNER.toBase58()));
    expect(s.you).toBeNull();
  });

  it("takes only what BUST won on the busted lines, at most the bond", () => {
    const owed = summarizeRun(
      arena({
        markets: [
          market(300, "yes", 300, 40n * T),
          market(600, "no", 640, 3n * T),
          market(900, "no", 640, 4n * T),
        ],
      }),
      [],
      terms,
    );
    // 30 s passed, so its BUST holders are owed nothing; 60 s and 90 s owe 7.
    expect(owed.driver.bondLost).toBe(7n * T);
    const capped = summarizeRun(
      arena({
        markets: [market(300, "no", 9, 30n * T), market(600, "no", 9), market(900, "no", 9)],
      }),
      [],
      terms,
    );
    expect(capped.driver.bondLost).toBe(25n * T);
  });

  it("says where the forfeit went: RIDE holders first, the rest to the house", () => {
    // 90 s owed BUST 4; RIDE paid 10 there and gets 40% back (4). All to RIDE.
    const toRide = summarizeRun(
      arena({
        markets: [
          market(300, "yes", 300),
          market(600, "yes", 600),
          market(900, "no", 640, 4n * T, 10n * T, 4_000),
        ],
      }),
      [],
      terms,
    );
    expect(toRide.driver).toMatchObject({ bondLost: 4n * T, bondToRide: 4n * T, bondToHouse: 0n });
    // Same forfeit, nobody held RIDE: it all stays with the house (the run in the report).
    const toHouse = summarizeRun(
      arena({
        markets: [market(300, "yes", 300), market(600, "yes", 600), market(900, "no", 640, 4n * T)],
      }),
      [],
      terms,
    );
    expect(toHouse.driver).toMatchObject({ bondLost: 4n * T, bondToRide: 0n, bondToHouse: 4n * T });
    // RIDE paid only 1 and is refunded in full; the other 3 goes to the house.
    const split = summarizeRun(
      arena({
        markets: [
          market(300, "yes", 300),
          market(600, "yes", 600),
          market(900, "no", 640, 4n * T, T, 10_000),
        ],
      }),
      [],
      terms,
    );
    expect(split.driver).toMatchObject({ bondToRide: T, bondToHouse: 3n * T });
  });

  it("pays no pass share when the house won nothing on the passed lines", () => {
    // Default arena: 30 s and 60 s passed with untouched pools (house tokens = liquidity).
    const s = summarizeRun(arena(), [], terms);
    expect(s.driver.bonus).toBe(0n);
    expect(s.driver.net).toBe(2n * T - T - (3n * T) / 2n);
  });

  it("pays half of what the house won on passed lines, never offsetting a losing line", () => {
    const won = (yes: bigint) => ({ ...market(300, "yes", 300), yesR: yes });
    const s = summarizeRun(
      arena({
        markets: [won(110n * T + 1n), { ...won(90n * T), line: 600 }, market(900, "no", 640)],
      }),
      [],
      terms,
    );
    // 30 s: house up 10 + 1 unit; 60 s: house down 10, floored at 0. Half, rounded down.
    expect(s.driver.bonus).toBe(5n * T);
    expect(s.driver.net).toBe(2n * T + 5n * T - T - (3n * T) / 2n);
  });

  it("calls an aborted run even for everyone", () => {
    const s = summarizeRun(
      arena({ markets: [market(300, "void"), market(600, "void"), market(900, "void")] }),
      [],
      terms,
    );
    expect(s.aborted).toBe(true);
    expect(s.driver.net).toBe(0n);
  });

  it("adds up the viewer's spend (fees included) and payout", () => {
    const s = summarizeRun(
      arena(),
      [entry({}), entry({ market: 2, side: "yes", shares: 20n * T })],
      terms,
    );
    // 5 net at 2% fee is 5.102041 gross each; RIDE 30s wins 9, RIDE 90s loses.
    expect(s.you?.spent).toBe(2n * grossOf(5n * T, 200));
    expect(s.you?.paid).toBe(9n * T);
    expect(s.you?.pnl).toBe(9n * T - 2n * grossOf(5n * T, 200));
  });

  it("grosses up net cost by the fee, rounding up", () => {
    expect(grossOf(98n, 200)).toBe(100n);
    expect(grossOf(5n * T, 200)).toBe(5_102_041n);
    expect(grossOf(7n, 0)).toBe(7n);
  });
});

describe("remembering positions through claims", () => {
  it("keeps the last copy of an entry after its slot is cleared", () => {
    const a = entry({});
    let kept = rememberPositions([], [a, entry({ arenaId: 2 }), entry({ nonce: 3 })], 1, 4);
    expect(kept).toEqual([a]);
    const grown = entry({ shares: 12n * T });
    kept = rememberPositions(kept, [grown], 1, 4);
    expect(kept).toEqual([grown]);
    const same = rememberPositions(kept, [], 1, 4);
    expect(same).toBe(kept);
    expect(rememberPositions(kept, [], 1, 5)).toEqual([]);
  });
});

describe("lobby cards", () => {
  it("offers to drive an idle channel and to watch a busy one", () => {
    expect(channelStatus(arena({ status: "idle" }))).toMatchObject({
      label: "IDLE",
      action: "Drive",
      gap: null,
    });
    expect(channelStatus(arena({ status: "staging", phaseTicks: 30 }))).toMatchObject({
      label: "STAGING",
      detail: "7s",
      action: "Watch",
    });
    expect(channelStatus(arena({ status: "staging", seedReady: false })).detail).toBe(
      "rolling course",
    );
    const live = channelStatus(
      arena({ status: "live", sim: { ...arena().sim, t: 425, policeGap: 750, busted: false } }),
    );
    expect(live).toMatchObject({ label: "LIVE", detail: "0:42.5" });
    expect(live.gap).toBeCloseTo(0.5);
    expect(channelStatus(arena()).label).toBe("BUSTED");
    expect(
      channelStatus(
        arena({ markets: [market(300, "void"), market(600, "void"), market(900, "void")] }),
      ).label,
    ).toBe("VOID");
    expect(channelStatus(null).label).toBe("…");
  });
});
