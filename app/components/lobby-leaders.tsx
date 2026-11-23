"use client";

import { TICK_MS } from "@sirenrun/sim";
import Link from "next/link";
import { useEffect, useState } from "react";
import { plural } from "../lib/plural";
import { fetchOverview, type Overview } from "../lib/stats-client";
import { Board } from "./stats-dashboard";

const REFRESH_MS = 60_000;

/** Top drivers and traders under the channels, from the indexer. Hidden if stats are down. */
export function LobbyLeaders() {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    let live = true;
    const load = async () => {
      const next = await fetchOverview();
      if (live && next !== null) setData(next);
    };
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  if (data === null) return null;
  return (
    <section className="mt-10" aria-label="Leaderboards">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl font-extrabold italic">Leaderboards</h2>
        <Link href="/stats" className="text-sm text-muted hover:text-text">
          All stats
        </Link>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Board
          title="Top drivers by PnL"
          empty="No finished runs yet. Be the first."
          rows={data.topDrivers.map((d) => ({
            wallet: d.wallet,
            pnl: d.pnl,
            detail: `${plural(d.runs, "run")} · best ${((d.best * TICK_MS) / 1000).toFixed(1)}s`,
          }))}
        />
        <Board
          title="Top traders by PnL"
          empty="No trades yet."
          rows={data.topTraders.map((t) => ({
            wallet: t.wallet,
            pnl: t.pnl,
            detail: plural(t.trades, "trade"),
          }))}
        />
      </div>
    </section>
  );
}
