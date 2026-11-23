import type { Sql } from "./db.ts";

/**
 * Read side for the app's stats routes. Amounts come back as decimal strings in tUSDC base
 * units (the `numeric` columns); the app formats them.
 *
 * PnL rules (see docs/onchain-program.md, Events):
 * - Trader: claims paid minus amounts spent. Open positions count as spent until claimed.
 * - Driver, per settled run: runner_paid - entry_fee - bond - nitro fees.
 */

export interface Overview {
  visitors: number;
  wallets: number;
  players: number;
  traders: number;
  drivers: number;
  runs: number;
  trades: number;
  volume: string;
  paidOut: string;
  driverEarnings: string;
  today: { visitors: number; trades: number; volume: string; runs: number };
  daily: { day: string; visitors: number; trades: number; volume: string; runs: number }[];
  topTraders: { wallet: string; pnl: string; trades: number }[];
  topDrivers: { wallet: string; pnl: string; runs: number; best: number }[];
  biggestWin: { wallet: string; paid: string } | null;
}

const DAYS = 14;

export async function overview(sql: Sql): Promise<Overview> {
  const [totals] = await sql<
    {
      visitors: number;
      wallets: number;
      traders: number;
      drivers: number;
      players: number;
      runs: number;
      trades: number;
      volume: string;
      paid_out: string;
      driver_earnings: string;
    }[]
  >`
    select
      (select count(*)::int from visitors) as visitors,
      (select count(*)::int from wallets) as wallets,
      (select count(distinct owner)::int from trades) as traders,
      (select count(distinct runner)::int from runs) as drivers,
      (select count(*)::int from (select owner as w from trades union select runner from runs) p)
        as players,
      (select count(*)::int from runs) as runs,
      (select count(*)::int from trades) as trades,
      (select coalesce(sum(amount), 0)::text from trades) as volume,
      (select coalesce(sum(paid), 0)::text from claims) as paid_out,
      (select coalesce(sum(runner_fees), 0)::text from runs) as driver_earnings`;

  const [today] = await sql<{ visitors: number; trades: number; volume: string; runs: number }[]>`
    select
      (select count(*)::int from visitors where last_seen >= date_trunc('day', now())) as visitors,
      (select count(*)::int from trades where at >= date_trunc('day', now())) as trades,
      (select coalesce(sum(amount), 0)::text from trades where at >= date_trunc('day', now()))
        as volume,
      (select count(*)::int from runs where started_at >= date_trunc('day', now())) as runs`;

  const daily = await sql<
    { day: string; visitors: number; trades: number; volume: string; runs: number }[]
  >`
    with days as (
      select generate_series(date_trunc('day', now()) - ${DAYS - 1} * interval '1 day',
                             date_trunc('day', now()), interval '1 day') as day
    )
    select to_char(d.day, 'YYYY-MM-DD') as day,
      (select count(*)::int from visitors v where date_trunc('day', v.first_seen) = d.day)
        as visitors,
      (select count(*)::int from trades t where date_trunc('day', t.at) = d.day) as trades,
      (select coalesce(sum(amount), 0)::text from trades t where date_trunc('day', t.at) = d.day)
        as volume,
      (select count(*)::int from runs r where date_trunc('day', r.started_at) = d.day) as runs
    from days d order by d.day`;

  const topTraders = await sql<{ wallet: string; pnl: string; trades: number }[]>`
    select s.owner as wallet,
      (coalesce(c.paid, 0) - s.spent)::text as pnl, s.trades
    from (select owner, sum(amount) as spent, count(*)::int as trades from trades group by owner) s
    left join (select owner, sum(paid) as paid from claims group by owner) c using (owner)
    order by coalesce(c.paid, 0) - s.spent desc
    limit 5`;

  const topDrivers = await sql<{ wallet: string; pnl: string; runs: number; best: number }[]>`
    select r.runner as wallet,
      sum(r.runner_paid - r.entry_fee - r.bond - coalesce(n.fee, 0))::text as pnl,
      count(*)::int as runs,
      max(r.t)::int as best
    from runs r
    left join (select arena, nonce, sum(fee) as fee from nitros group by arena, nonce) n
      using (arena, nonce)
    where r.settled_at is not null
    group by r.runner
    order by sum(r.runner_paid - r.entry_fee - r.bond - coalesce(n.fee, 0)) desc
    limit 5`;

  const [win] = await sql<{ wallet: string; paid: string }[]>`
    select owner as wallet, paid::text from claims order by paid desc limit 1`;

  const t = totals ?? {
    visitors: 0,
    wallets: 0,
    traders: 0,
    drivers: 0,
    players: 0,
    runs: 0,
    trades: 0,
    volume: "0",
    paid_out: "0",
    driver_earnings: "0",
  };
  return {
    visitors: t.visitors,
    wallets: t.wallets,
    players: t.players,
    traders: t.traders,
    drivers: t.drivers,
    runs: t.runs,
    trades: t.trades,
    volume: t.volume,
    paidOut: t.paid_out,
    driverEarnings: t.driver_earnings,
    today: today ?? { visitors: 0, trades: 0, volume: "0", runs: 0 },
    daily: [...daily],
    topTraders: [...topTraders],
    topDrivers: [...topDrivers],
    biggestWin: win ?? null,
  };
}

export interface WalletStats {
  trader: {
    trades: number;
    runsTraded: number;
    spent: string;
    won: string;
    pnl: string;
    wins: number;
  };
  driver: {
    runs: number;
    settled: number;
    staked: string;
    paid: string;
    fees: string;
    nitro: string;
    pnl: string;
    bestTicks: number;
  };
  /** Trader plus driver. */
  totalPnl: string;
  recent: {
    kind: "trade" | "claim" | "run";
    at: string;
    arena: number;
    nonce: number;
    market: number | null;
    side: string | null;
    amount: string;
  }[];
}

export async function walletStats(sql: Sql, wallet: string): Promise<WalletStats> {
  const [trader] = await sql<
    { trades: number; runs_traded: number; spent: string; won: string; pnl: string; wins: number }[]
  >`
    select
      (select count(*)::int from trades where owner = ${wallet}) as trades,
      (select count(distinct (arena, nonce))::int from trades where owner = ${wallet})
        as runs_traded,
      (select coalesce(sum(amount), 0)::text from trades where owner = ${wallet}) as spent,
      (select coalesce(sum(paid), 0)::text from claims where owner = ${wallet}) as won,
      ((select coalesce(sum(paid), 0) from claims where owner = ${wallet})
        - (select coalesce(sum(amount), 0) from trades where owner = ${wallet}))::text as pnl,
      (select count(*)::int from claims where owner = ${wallet} and paid > 0) as wins`;

  const [driver] = await sql<
    {
      runs: number;
      settled: number;
      staked: string;
      paid: string;
      fees: string;
      nitro: string;
      pnl: string;
      best_ticks: number;
    }[]
  >`
    with mine as (
      select r.*, coalesce(n.fee, 0) as nitro
      from runs r
      left join (select arena, nonce, sum(fee) as fee from nitros group by arena, nonce) n
        using (arena, nonce)
      where r.runner = ${wallet}
    )
    select
      count(*)::int as runs,
      count(settled_at)::int as settled,
      coalesce(sum(entry_fee + bond) filter (where settled_at is not null), 0)::text as staked,
      coalesce(sum(runner_paid), 0)::text as paid,
      coalesce(sum(runner_fees), 0)::text as fees,
      coalesce(sum(nitro) filter (where settled_at is not null), 0)::text as nitro,
      coalesce(sum(runner_paid - entry_fee - bond - nitro)
        filter (where settled_at is not null), 0)::text as pnl,
      coalesce(max(t), 0)::int as best_ticks
    from mine`;

  const recent = await sql<WalletStats["recent"]>`
    (select 'trade' as kind, at::text, arena::int, nonce, market::int, side,
            amount::text as amount
       from trades where owner = ${wallet})
    union all
    (select 'claim', at::text, arena::int, nonce, market::int, null, paid::text
       from claims where owner = ${wallet} and paid > 0)
    union all
    (select 'run', started_at::text, arena::int, nonce, null, null,
            coalesce(runner_paid - entry_fee - bond, 0)::text
       from runs where runner = ${wallet})
    order by at desc limit 20`;

  const tr = trader ?? { trades: 0, runs_traded: 0, spent: "0", won: "0", pnl: "0", wins: 0 };
  const dr = driver ?? {
    runs: 0,
    settled: 0,
    staked: "0",
    paid: "0",
    fees: "0",
    nitro: "0",
    pnl: "0",
    best_ticks: 0,
  };
  return {
    trader: {
      trades: tr.trades,
      runsTraded: tr.runs_traded,
      spent: tr.spent,
      won: tr.won,
      pnl: tr.pnl,
      wins: tr.wins,
    },
    driver: {
      runs: dr.runs,
      settled: dr.settled,
      staked: dr.staked,
      paid: dr.paid,
      fees: dr.fees,
      nitro: dr.nitro,
      pnl: dr.pnl,
      bestTicks: dr.best_ticks,
    },
    totalPnl: (BigInt(tr.pnl) + BigInt(dr.pnl)).toString(),
    recent: [...recent],
  };
}

export interface RunTotals {
  trades: number;
  volume: string;
  lines: { market: number; ride: string; bust: string; trades: number }[];
}

/** One run's trading so far, for viewers who join mid-run. */
export async function runTotals(sql: Sql, arena: number, nonce: number): Promise<RunTotals> {
  const lines = await sql<{ market: number; ride: string; bust: string; trades: number }[]>`
    select market::int,
      coalesce(sum(amount) filter (where side = 'yes'), 0)::text as ride,
      coalesce(sum(amount) filter (where side = 'no'), 0)::text as bust,
      count(*)::int as trades
    from trades where arena = ${arena} and nonce = ${nonce}
    group by market order by market`;
  const trades = lines.reduce((n, l) => n + l.trades, 0);
  const volume = lines.reduce((v, l) => v + BigInt(l.ride) + BigInt(l.bust), 0n).toString();
  return { trades, volume, lines: [...lines] };
}

/** Counts a page visit by an anonymous browser id, and the wallet if one is connected. */
export async function recordVisit(sql: Sql, id: string, wallet: string | null): Promise<void> {
  await sql`
    insert into visitors (id) values (${id})
    on conflict (id) do update
      set last_seen = now(),
          visits = visitors.visits + case
            when visitors.last_seen < now() - interval '30 minutes' then 1 else 0 end`;
  if (wallet !== null) {
    await sql`
      insert into wallets (address) values (${wallet})
      on conflict (address) do update set last_seen = now()`;
  }
}
