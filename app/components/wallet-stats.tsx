"use client";

import { LINES, TICK_MS } from "@sirenrun/sim";
import { useEffect, useState } from "react";
import { lineSeconds } from "../lib/markets";
import { formatUsd, pnlTone } from "../lib/money";
import { fetchWalletStats, type WalletStats } from "../lib/stats-client";
import { useArena } from "../stores/arena";

const TONE = { up: "text-up", down: "text-down", flat: "text-muted" } as const;

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className={`text-right tabular-nums ${tone ?? ""}`}>{value}</dd>
    </>
  );
}

/**
 * The wallet's trading and driving record from the indexer: total PnL up top, then what it
 * spent, won and earned. Refetches when a run settles, so a payout shows up right away.
 */
export function WalletStatsPanel({ wallet }: { wallet: string }) {
  const [stats, setStats] = useState<WalletStats | null>(null);
  const [failed, setFailed] = useState(false);
  // Changes once per run end, which is when the numbers move.
  const settledNonce = useArena((s) => (s.status === "settled" ? s.nonce : null));

  useEffect(() => {
    let live = true;
    void fetchWalletStats(wallet).then((next) => {
      if (!live) return;
      if (next === null) setFailed(true);
      else {
        setStats(next);
        setFailed(false);
      }
    });
    return () => {
      live = false;
    };
  }, [wallet, settledNonce]);

  if (stats === null) {
    return (
      <p className="text-sm text-muted">
        {failed ? "Stats unavailable right now." : "Loading stats…"}
      </p>
    );
  }
  const { trader, driver } = stats;
  const played = trader.trades > 0 || driver.runs > 0;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold tracking-widest text-muted uppercase">Total PnL</p>
        <p
          className={`font-display text-4xl font-extrabold italic tabular-nums ${TONE[pnlTone(stats.totalPnl)]}`}
        >
          {formatUsd(stats.totalPnl, { sign: true })}
        </p>
        {!played && (
          <p className="text-xs text-muted">Trade or drive a run to start your record.</p>
        )}
      </div>

      <section>
        <h4 className="text-xs font-semibold tracking-widest text-muted uppercase">Trading</h4>
        <dl className="mt-1 grid grid-cols-2 gap-y-1 text-sm">
          <Row label="Trades" value={`${trader.trades} on ${trader.runsTraded} runs`} />
          <Row label="Spent" value={formatUsd(trader.spent)} />
          <Row label="Won" value={formatUsd(trader.won)} />
          <Row label="Winning claims" value={String(trader.wins)} />
          <Row
            label="PnL"
            value={formatUsd(trader.pnl, { sign: true })}
            tone={TONE[pnlTone(trader.pnl)]}
          />
        </dl>
      </section>

      <section>
        <h4 className="text-xs font-semibold tracking-widest text-muted uppercase">Driving</h4>
        <dl className="mt-1 grid grid-cols-2 gap-y-1 text-sm">
          <Row label="Runs" value={String(driver.runs)} />
          <Row label="Best time" value={`${((driver.bestTicks * TICK_MS) / 1000).toFixed(1)}s`} />
          <Row label="Fees earned" value={formatUsd(driver.fees)} />
          <Row label="Nitro spent" value={formatUsd(driver.nitro)} />
          <Row
            label="PnL"
            value={formatUsd(driver.pnl, { sign: true })}
            tone={TONE[pnlTone(driver.pnl)]}
          />
        </dl>
      </section>

      {stats.recent.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold tracking-widest text-muted uppercase">Recent</h4>
          <ul className="mt-1 divide-y divide-white/5 text-sm">
            {stats.recent.slice(0, 8).map((r, i) => {
              const line = r.market === null ? "" : ` ${lineSeconds(LINES[r.market] ?? 0)}s`;
              const text =
                r.kind === "trade"
                  ? `${r.side === "yes" ? "RIDE" : "BUST"}${line}`
                  : r.kind === "claim"
                    ? `Won${line}`
                    : `Drove CH-${r.arena + 1}`;
              const amount =
                r.kind === "trade"
                  ? formatUsd(`-${r.amount}`)
                  : formatUsd(r.amount, { sign: true });
              return (
                <li key={`${r.kind}${r.at}${i}`} className="flex justify-between py-1">
                  <span>{text}</span>
                  <span
                    className={`tabular-nums ${TONE[pnlTone(r.kind === "trade" ? `-${r.amount}` : r.amount)]}`}
                  >
                    {amount}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
