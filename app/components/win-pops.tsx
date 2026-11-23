"use client";

import { useWinPops } from "../stores/win-pop";

/**
 * Payout bursts: a large "+$9.80" that rises and fades over the top of the page, so a trader
 * sees a win land without reading a toast. Screen readers hear it once through the status role.
 */
export function WinPops() {
  const pops = useWinPops((s) => s.pops);
  if (pops.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-24 z-50 flex flex-col items-center gap-2"
      role="status"
      aria-live="polite"
    >
      {pops.map((p) => (
        <div key={p.id} className="win-pop flex flex-col items-center">
          <span className="font-display text-6xl font-extrabold italic tabular-nums text-[#3dffa8] drop-shadow-[0_0_24px_rgba(61,255,168,0.55)] sm:text-7xl">
            {p.amount}
          </span>
          <span className="mt-1 rounded bg-black/60 px-2 py-0.5 text-sm font-semibold text-text">
            {p.label} paid out
          </span>
        </div>
      ))}
    </div>
  );
}
