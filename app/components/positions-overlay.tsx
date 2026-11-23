"use client";

import { formatTokenAmount } from "@sirenrun/sdk";
import { positionRows } from "../lib/markets";
import { useNow } from "../lib/use-now";
import { useArena } from "../stores/arena";
import { useBalance } from "../stores/balance";

/**
 * The viewer's open positions on this run, over the road, so a watcher sees what they hold
 * while watching instead of reading the side panel. Value is what the position is worth at
 * the current price; "pays" is what it pays if that line goes their way (1 tUSDC a share).
 */
export function PositionsOverlay() {
  useNow(500);
  const arena = useArena.getState().latest;
  const game = useBalance((s) => s.game);
  if (arena === null || arena.status !== "live") return null;
  const open = positionRows(game, arena).filter(
    (r) => r.state === "open" && r.nonce === arena.nonce,
  );
  if (open.length === 0) return null;
  return (
    <ul
      className="pointer-events-none absolute inset-x-4 top-36 flex flex-wrap justify-center gap-2 sm:top-4 sm:left-auto sm:right-auto sm:inset-x-0"
      aria-label="Your open positions"
    >
      {open.slice(0, 4).map((r) => (
        <li
          key={`${r.nonce}:${r.index}`}
          className="flex items-center gap-2 rounded-md border border-white/10 bg-bg/75 px-2.5 py-1 text-xs tabular-nums backdrop-blur"
        >
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
              r.side === "yes" ? "bg-up/15 text-up" : "bg-down/15 text-down"
            }`}
          >
            {r.label}
          </span>
          <span className="text-muted">worth</span>
          <span className="font-semibold">{formatTokenAmount(r.value)}</span>
          <span className="text-muted">pays</span>
          <span className="font-semibold">{formatTokenAmount(r.shares)}</span>
        </li>
      ))}
    </ul>
  );
}
