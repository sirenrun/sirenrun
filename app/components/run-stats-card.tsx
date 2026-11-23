"use client";

import { formatTokenAmount } from "@sirenrun/sdk";
import { useMarkets } from "../stores/markets";

/**
 * Volume, trade count and the driver's earnings for the current run. The driver reads it as
 * "you earned"; watchers see what the driver is making from their trades.
 */
export function RunStatsCard({ driver }: { driver: boolean }) {
  const stats = useMarkets((s) => s.stats);
  const cells = [
    { label: "Volume", value: `${formatTokenAmount(stats.volume)}` },
    { label: "Trades", value: String(stats.trades) },
    { label: driver ? "Earned" : "Driver cut", value: formatTokenAmount(stats.driverFee) },
  ];
  return (
    <section aria-label="Run stats">
      <dl className="grid grid-cols-3 gap-2">
        {cells.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5"
          >
            <dt className="text-[10px] font-semibold tracking-widest text-muted uppercase">
              {c.label}
            </dt>
            <dd className="font-display text-lg font-extrabold italic tabular-nums">{c.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-[11px] text-muted">
        tUSDC{stats.complete ? "" : ", since you joined"}
      </p>
    </section>
  );
}
