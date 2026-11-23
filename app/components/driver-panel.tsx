"use client";

import { marketView, percent } from "../lib/markets";
import { useMarkets } from "../stores/markets";
import { Chart, LINE_COLOURS, Ticker, usePolledArena } from "./markets-panel";

/**
 * What the driver sees beside the road: how the crowd is betting on each line, as they drive.
 * No trade buttons; a driver cannot trade their own run. Hidden on phones, where the road
 * needs the whole screen.
 */
export function DriverPanel() {
  const { arena } = usePolledArena();
  const history = useMarkets((s) => s.history);
  const views = arena?.markets.map(marketView) ?? [];

  return (
    <aside
      className="relative z-20 hidden shrink-0 flex-col border-l border-white/10 bg-bg lg:flex lg:w-[18rem]"
      aria-label="Crowd"
    >
      <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
        <div>
          <h2 className="font-display text-2xl font-extrabold italic">The crowd</h2>
          <p className="text-xs text-muted">Chance the crowd gives you to pass each line.</p>
        </div>
        <Chart history={history} />
        <ul className="space-y-3">
          {views.map((v) => (
            <li key={v.index}>
              <div className="flex items-baseline justify-between">
                <span className="flex items-center gap-2 font-display text-lg font-extrabold italic">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: LINE_COLOURS[v.index] }}
                  />
                  {v.seconds}s
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {v.open ? (
                    <span className="text-neon-pink">RIDE {percent(v.ride)}</span>
                  ) : v.status === "yes" ? (
                    <span className="text-neon-pink">Made it</span>
                  ) : v.status === "no" ? (
                    <span className="text-neon-cyan">Busted</span>
                  ) : (
                    <span className="text-muted">Void</span>
                  )}
                </span>
              </div>
              {v.open && (
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neon-cyan/30">
                  <div
                    className="h-full bg-neon-pink transition-[width] duration-300"
                    style={{ width: percent(v.ride) }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
        <Ticker />
      </div>
    </aside>
  );
}
