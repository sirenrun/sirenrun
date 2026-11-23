import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apply, connect, migrate, type Sql } from "./db.ts";
import { overview, recordVisit, runTotals, walletStats } from "./queries.ts";

/**
 * Runs the real SQL against a throwaway database. Set TEST_DATABASE_URL to a database the
 * test may wipe (never production); without it the suite is skipped.
 */
const url = process.env.TEST_DATABASE_URL;
const at = new Date();

describe.skipIf(url === undefined)("queries", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect(url, 2);
    await sql.unsafe(
      "drop table if exists runs, trades, claims, nitros, visitors, wallets, indexer_state",
    );
    await migrate(sql);
    await migrate(sql); // idempotent
    // Run 1 on arena 0: driver D, busted. Trader A buys RIDE 5 on 30s and wins 9.
    // Trader B buys BUST 2 on 90s and loses. D paid nitro once.
    await apply(sql, {
      kind: "runStarted",
      arena: 0,
      nonce: 1,
      runner: "D",
      entryFee: "500000",
      bond: "25000000",
      at,
    });
    await apply(sql, {
      kind: "trade",
      signature: "t1",
      market: 0,
      arena: 0,
      nonce: 1,
      side: "yes",
      owner: "A",
      amount: "5000000",
      net: "4900000",
      shares: "9000000",
      at,
    });
    await apply(sql, {
      kind: "trade",
      signature: "t2",
      market: 2,
      arena: 0,
      nonce: 1,
      side: "no",
      owner: "B",
      amount: "2000000",
      net: "1960000",
      shares: "3000000",
      at,
    });
    await apply(sql, {
      kind: "trade",
      signature: "t2",
      market: 2,
      arena: 0,
      nonce: 1,
      side: "no",
      owner: "B",
      amount: "2000000",
      net: "1960000",
      shares: "3000000",
      at,
    }); // replayed
    await apply(sql, {
      kind: "nitro",
      signature: "n1",
      arena: 0,
      nonce: 1,
      runner: "D",
      fee: "500000",
      at,
    });
    await apply(sql, {
      kind: "runSettled",
      arena: 0,
      nonce: 1,
      runner: "D",
      t: 451,
      outcomes: ["yes", "yes", "no"],
      runnerFees: "70000",
      runnerPaid: "25070000",
      at,
    });
    await apply(sql, {
      kind: "claim",
      signature: "c1",
      owner: "A",
      arena: 0,
      nonce: 1,
      market: 0,
      paid: "9000000",
      at,
    });
    // Run 2 started, not settled: its stake must not count in PnL yet.
    await apply(sql, {
      kind: "runStarted",
      arena: 1,
      nonce: 1,
      runner: "D",
      entryFee: "500000",
      bond: "25000000",
      at,
    });
    await recordVisit(sql, "v1", null);
    await recordVisit(sql, "v1", "A");
    await recordVisit(sql, "v2", null);
  });

  afterAll(async () => {
    await sql.end();
  });

  it("totals trader PnL from spend and claims, counting replays once", async () => {
    const a = await walletStats(sql, "A");
    expect(a.trader).toMatchObject({
      trades: 1,
      spent: "5000000",
      won: "9000000",
      pnl: "4000000",
      wins: 1,
    });
    const b = await walletStats(sql, "B");
    expect(b.trader).toMatchObject({ trades: 1, spent: "2000000", pnl: "-2000000", wins: 0 });
  });

  it("totals driver PnL over settled runs only", async () => {
    const d = await walletStats(sql, "D");
    // 25.07 paid - 0.5 entry - 25 bond - 0.5 nitro = -0.93
    expect(d.driver).toMatchObject({
      runs: 2,
      settled: 1,
      fees: "70000",
      nitro: "500000",
      pnl: "-930000",
      bestTicks: 451,
    });
    expect(d.totalPnl).toBe("-930000");
  });

  it("summarises the platform for the stats page", async () => {
    const o = await overview(sql);
    expect(o).toMatchObject({
      visitors: 2,
      wallets: 1,
      traders: 2,
      drivers: 1,
      players: 3,
      runs: 2,
      trades: 2,
      volume: "7000000",
      paidOut: "9000000",
      driverEarnings: "70000",
    });
    expect(o.today.trades).toBe(2);
    expect(o.daily).toHaveLength(14);
    expect(o.daily.at(-1)?.visitors).toBe(2);
    expect(o.topTraders[0]).toMatchObject({ wallet: "A", pnl: "4000000" });
    expect(o.topDrivers[0]).toMatchObject({ wallet: "D", runs: 1, best: 451 });
    expect(o.biggestWin).toEqual({ wallet: "A", paid: "9000000" });
  });

  it("gives one run's totals per line", async () => {
    const r = await runTotals(sql, 0, 1);
    expect(r.trades).toBe(2);
    expect(r.volume).toBe("7000000");
    expect(r.lines).toEqual([
      { market: 0, ride: "5000000", bust: "0", trades: 1 },
      { market: 2, ride: "0", bust: "2000000", trades: 1 },
    ]);
  });

  it("counts a repeat visit within 30 minutes once", async () => {
    const [v] = await sql<{ visits: number }[]>`select visits from visitors where id = 'v1'`;
    expect(v?.visits).toBe(1);
  });
});
