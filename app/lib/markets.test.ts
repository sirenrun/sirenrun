import type { Arena, Balance, Market, PositionEntry } from "@sirenrun/sdk";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  appendHistory,
  friendlyError,
  lineSeconds,
  marketView,
  positionRows,
  tickerItem,
  pushTicker,
  ago,
  tradeBlocker,
  trendOf,
  type PriceHistory,
} from "./markets";

const RUNNER = new PublicKey("11111111111111111111111111111112");
const ME = new PublicKey("11111111111111111111111111111113");
const T = 1_000_000n;

const market = (
  line: number,
  yesR = 100n * T,
  noR = 100n * T,
  over: Partial<Market> = {},
): Market => ({
  line,
  status: "open" as const,
  yesR,
  noR,
  resolvedTick: 0,
  houseYes: 0n,
  houseNo: 0n,
  noProfit: 0n,
  rideCost: 0n,
  rideBackBps: 0,
  ...over,
});

function arena(over: Partial<Arena> = {}): Arena {
  return {
    id: 0,
    bump: 0,
    status: "live",
    phaseTicks: 0,
    nonce: 7,
    runner: RUNNER,
    seedReady: true,
    seed: 1n,
    sim: {
      t: 100,
      carX: 480,
      targetLane: 2,
      speed: 150,
      nitroLeft: 3,
      nitroTicks: 0,
      invuln: 0,
      distance: 0,
      row: 0,
      safeLane: 2,
      policeGap: 1500,
      busted: false,
      nitroPressed: false,
    },
    bond: 25n * T,
    runnerFees: 0n,
    markets: [market(300), market(600), market(900)],
    results: [],
    resultsHead: 0,
    ...over,
  };
}

const entry = (over: Partial<PositionEntry>): PositionEntry => ({
  arenaId: 0,
  nonce: 7,
  market: 0,
  side: "yes",
  shares: 10n * T,
  cost: 5n * T,
  tick: 10,
  ...over,
});

const empty = (): PositionEntry => entry({ side: "empty", shares: 0n, cost: 0n });

const balance = (entries: PositionEntry[]): Balance => ({
  owner: ME,
  available: 50n * T,
  entries: [...entries, ...Array.from({ length: 8 - entries.length }, empty)],
  bump: 0,
});

describe("price history", () => {
  it("starts over on a new run and adds a point per tick", () => {
    let h: PriceHistory = { nonce: -1, points: [] };
    h = appendHistory(h, arena());
    expect(h.nonce).toBe(7);
    expect(h.points).toHaveLength(1);
    expect(h.points[0]?.yes[0]).toBeCloseTo(0.5);
    expect(appendHistory(h, arena())).toBe(h);
    h = appendHistory(h, arena({ sim: { ...arena().sim, t: 101 } }));
    expect(h.points).toHaveLength(2);
    h = appendHistory(h, arena({ nonce: 8 }));
    expect(h.points).toHaveLength(1);
  });

  it("replaces the point when prices move within a tick", () => {
    let h = appendHistory({ nonce: -1, points: [] }, arena());
    h = appendHistory(
      h,
      arena({ markets: [market(300, 50n * T, 150n * T), market(600), market(900)] }),
    );
    expect(h.points).toHaveLength(1);
    expect(h.points[0]?.yes[0]).toBeCloseTo(0.75);
  });

  it("reads the trend over a window of ticks", () => {
    const h: PriceHistory = {
      nonce: 1,
      points: [
        { t: 0, yes: [0.5, 0.5, 0.5] },
        { t: 20, yes: [0.6, 0.5, 0.45] },
      ],
    };
    expect(trendOf(h, 0)).toBe("up");
    expect(trendOf(h, 1)).toBe("flat");
    expect(trendOf(h, 2)).toBe("down");
    expect(trendOf({ nonce: 1, points: [] }, 0)).toBe("flat");
  });
});

describe("market rows", () => {
  it("shows the line in seconds and the RIDE price", () => {
    expect(lineSeconds(600)).toBe(60);
    const v = marketView(market(600, 25n * T, 75n * T), 1);
    expect(v.seconds).toBe(60);
    expect(v.ride).toBeCloseTo(0.75);
    expect(v.open).toBe(true);
    expect(v.result).toBeNull();
    expect(marketView(market(300, T, T, { status: "no" }), 0).result).toBe("BUST pays");
  });
});

describe("who may trade", () => {
  const ok = {
    arena: arena(),
    wallet: ME.toBase58(),
    sessionLive: true,
    balanceDelegated: true,
    available: 10n * T,
  };

  it("lets a funded spectator with a session trade a live run", () => {
    expect(tradeBlocker(ok)).toBeNull();
    expect(tradeBlocker({ ...ok, arena: arena({ status: "staging" }) })).toBeNull();
  });

  it("explains every reason it cannot, with the next step", () => {
    expect(tradeBlocker({ ...ok, arena: arena({ status: "idle" }) })?.reason).toMatch(/open/);
    expect(tradeBlocker({ ...ok, arena: arena({ seedReady: false }) })?.reason).toMatch(/course/);
    expect(tradeBlocker({ ...ok, wallet: null })?.action).toBe("connect");
    expect(tradeBlocker({ ...ok, wallet: RUNNER.toBase58() })?.reason).toMatch(/driving/);
    expect(tradeBlocker({ ...ok, balanceDelegated: false })?.action).toBe("deposit");
    expect(tradeBlocker({ ...ok, available: 0n })?.action).toBe("deposit");
    expect(tradeBlocker({ ...ok, sessionLive: false })?.action).toBe("session");
  });
});

describe("positions", () => {
  it("values open positions at the current price", () => {
    const rows = positionRows(balance([entry({}), entry({ market: 1, side: "no" })]), arena());
    expect(rows.map((r) => r.label)).toEqual(["RIDE 30s", "BUST 60s"]);
    expect(rows[0]?.state).toBe("open");
    expect(rows[0]?.value).toBe(5n * T);
  });

  it("shows what a resolved line pays", () => {
    const resolved = arena({
      markets: [market(300, T, T, { status: "yes", resolvedTick: 300 }), market(600), market(900)],
    });
    const rows = positionRows(
      balance([
        entry({}),
        entry({ side: "no" }),
        entry({ market: 0, side: "yes", tick: 295, nonce: 7 }),
      ]),
      resolved,
    );
    expect(rows[0]).toMatchObject({ state: "won", value: 10n * T });
    expect(rows[1]).toMatchObject({ state: "lost", value: 0n });
    // Bought inside the cooldown before resolution: refunded at cost.
    expect(rows[2]).toMatchObject({ state: "refund", value: 5n * T });
  });

  it("ignores other arenas and empty slots, newest run first", () => {
    const rows = positionRows(
      balance([entry({ nonce: 5 }), entry({ arenaId: 1 }), entry({ nonce: 7, market: 2 })]),
      arena(),
    );
    expect(rows.map((r) => r.nonce)).toEqual([7, 5]);
    expect(rows[1]?.state).toBe("expired");
  });
});

describe("ticker and errors", () => {
  it("records side, line, amount and run, not the trader", () => {
    const item = tickerItem(
      "sig",
      { nonce: 4, market: 1, side: "no", net: 4_200_000n },
      [300, 600, 900],
      1_000,
    );
    expect(item).toEqual({
      key: "sig:1",
      nonce: 4,
      side: "no",
      seconds: 60,
      net: 4_200_000n,
      at: 1_000,
    });
  });

  it("keeps one run in the feed: a newer run clears it, older trades are dropped", () => {
    const t = (key: string, nonce: number) =>
      tickerItem(key, { nonce, market: 0, side: "yes", net: 1n }, [300], 0);
    let feed = pushTicker([], t("a", 3), 12);
    feed = pushTicker(feed, t("b", 3), 12);
    expect(feed.map((x) => x.key)).toEqual(["b:0", "a:0"]);
    expect(pushTicker(feed, t("old", 2), 12)).toBe(feed);
    expect(pushTicker(feed, t("b", 3), 12)).toBe(feed);
    expect(pushTicker(feed, t("c", 4), 12).map((x) => x.key)).toEqual(["c:0"]);
  });

  it("shows trade age compactly", () => {
    expect(ago(1_000, 1_500)).toBe("now");
    expect(ago(0, 12_000)).toBe("12s");
    expect(ago(0, 185_000)).toBe("3m");
  });

  it("turns program errors into plain sentences", () => {
    expect(friendlyError("Slippage", "x")).toMatch(/price moved/);
    expect(friendlyError("Unknown", "x")).toBe("Unknown");
    expect(friendlyError(undefined, "fallback")).toBe("fallback");
  });
});
