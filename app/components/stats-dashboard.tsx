"use client";

import { TICK_MS } from "@sirenrun/sim";
import { useEffect, useState } from "react";
import { plural } from "../lib/plural";
import { formatUsd, formatUsdShort, pnlTone } from "../lib/money";
import { shortAddress } from "../lib/results";
import { fetchOverview, type Overview } from "../lib/stats-client";
import { DayBars } from "./day-bars";

const REFRESH_MS = 30_000;

const TONE = { up: "text-up", down: "text-down", flat: "text-muted" } as const;

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <dt className="text-[11px] font-semibold tracking-widest text-muted uppercase">{label}</dt>
      <dd className="mt-1 font-display text-4xl font-extrabold italic tabular-nums">{value}</dd>
      {note !== undefined && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  );
}

export function Board({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { wallet: string; pnl: string; detail: string }[];
  empty: string;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="text-xs font-semibold tracking-widest text-muted uppercase">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <ol className="mt-2 divide-y divide-white/5">
          {rows.map((r, i) => (
            <li key={r.wallet} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-5 font-display text-lg font-extrabold italic text-muted">
                {i + 1}
              </span>
              <span className="font-mono text-text">{shortAddress(r.wallet)}</span>
              <span className="text-xs text-muted">{r.detail}</span>
              <span className={`ml-auto font-semibold tabular-nums ${TONE[pnlTone(r.pnl)]}`}>
                {formatUsd(r.pnl, { sign: true })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Platform analytics from the indexer, refreshed every 30 s. */
export function StatsDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const load = async () => {
      const next = await fetchOverview();
      if (!live) return;
      if (next === null) setFailed(true);
      else {
        setData(next);
        setFailed(false);
      }
    };
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-neon-cyan uppercase">
            Live on Solana devnet
          </p>
          <h1 className="font-display text-4xl font-extrabold italic sm:text-5xl">
            SIRENRUN in numbers
          </h1>
        </div>
        <p className="text-xs text-muted">
          Indexed from onchain events. Amounts in tUSDC, shown 1:1 as dollars.
        </p>
      </div>

      {data === null ? (
        <p className="mt-10 text-sm text-muted" role="status">
          {failed ? "Stats are unavailable right now. The game is unaffected." : "Loading stats…"}
        </p>
      ) : (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile
              label="Visitors"
              value={data.visitors.toLocaleString()}
              note={`${data.wallets.toLocaleString()} wallets connected`}
            />
            <Tile
              label="Players"
              value={data.players.toLocaleString()}
              note={`${data.traders} traders · ${data.drivers} drivers`}
            />
            <Tile label="Runs" value={data.runs.toLocaleString()} />
            <Tile label="Trades" value={data.trades.toLocaleString()} />
            <Tile label="Volume" value={formatUsdShort(data.volume)} />
            <Tile label="Paid to traders" value={formatUsdShort(data.paidOut)} />
            <Tile
              label="Driver earnings"
              value={formatUsdShort(data.driverEarnings)}
              note="Their cut of every trade on their run"
            />
            <Tile
              label="Biggest win"
              value={data.biggestWin === null ? "–" : formatUsd(data.biggestWin.paid)}
              note={data.biggestWin === null ? undefined : shortAddress(data.biggestWin.wallet)}
            />
          </dl>

          <section
            aria-label="Today"
            className="mt-4 flex flex-wrap gap-x-6 gap-y-1 rounded-xl border border-white/10 px-4 py-3 text-sm"
          >
            <span className="font-semibold text-text">Today</span>
            <span className="text-muted">
              <span className="tabular-nums text-text">{data.today.visitors}</span> visitors
            </span>
            <span className="text-muted">
              <span className="tabular-nums text-text">{data.today.runs}</span> runs
            </span>
            <span className="text-muted">
              <span className="tabular-nums text-text">{data.today.trades}</span> trades
            </span>
            <span className="text-muted">
              <span className="tabular-nums text-text">{formatUsd(data.today.volume)}</span> volume
            </span>
          </section>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <DayBars
              title="New visitors per day"
              colour="#22e1ff"
              data={data.daily.map((d) => ({
                day: d.day,
                value: d.visitors,
                label: String(d.visitors),
              }))}
            />
            <DayBars
              title="Trading volume per day"
              colour="#ffb020"
              data={data.daily.map((d) => ({
                day: d.day,
                value: Number(BigInt(d.volume) / 10_000n),
                label: formatUsd(d.volume),
              }))}
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Board
              title="Top traders by PnL"
              empty="No trades yet."
              rows={data.topTraders.map((t) => ({
                wallet: t.wallet,
                pnl: t.pnl,
                detail: plural(t.trades, "trade"),
              }))}
            />
            <Board
              title="Top drivers by PnL"
              empty="No finished runs yet."
              rows={data.topDrivers.map((d) => ({
                wallet: d.wallet,
                pnl: d.pnl,
                detail: `${plural(d.runs, "run")} · best ${((d.best * TICK_MS) / 1000).toFixed(1)}s`,
              }))}
            />
          </div>
        </>
      )}
    </main>
  );
}
