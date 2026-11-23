"use client";

import { formatTokenAmount, priceYes, quoteBuy, runCap, TOKEN_UNIT } from "@sirenrun/sdk";
import { useState, useSyncExternalStore } from "react";
import { lineSeconds, percent } from "../lib/markets";
import { useNow } from "../lib/use-now";
import { useArena } from "../stores/arena";
import { useBalance } from "../stores/balance";

const KEY = "sirenrun.guide.dismissed";
const EXAMPLE = 10n * TOKEN_UNIT;

function dismissedBefore(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

const noSubscribe = () => () => {};

/**
 * First-visit explainer for watchers: what RIDE and BUST mean, with a live example payout
 * quoted the same way the buy buttons quote it. Dismissed once, per browser.
 */
export function TradingGuide() {
  // The server cannot see localStorage: it renders nothing, and the browser decides.
  const stored = useSyncExternalStore(noSubscribe, dismissedBefore, () => true);
  const [dismissed, setDismissed] = useState(false);
  const hidden = stored || dismissed;
  useNow(1_000);
  const arena = useArena.getState().latest;
  const config = useBalance((s) => s.config);
  if (hidden) return null;

  // Example on the first line still open, or the 30 s line before a run starts.
  const index = arena?.markets.findIndex((m) => m.status === "open") ?? -1;
  const market = arena !== null && index >= 0 ? arena.markets[index] : undefined;
  let example: string | null = null;
  if (arena !== null && market !== undefined) {
    const ride = priceYes(market.yesR, market.noR);
    let pays: bigint | null = null;
    if (config !== null) {
      const q = quoteBuy(
        { feeBps: config.feeBps, runnerFeeBps: config.runnerFeeBps, maxBuy: config.maxBuy },
        market,
        runCap(arena, index),
        "yes",
        EXAMPLE,
      );
      if (q.ok) pays = q.quote.shares;
    }
    const seconds = lineSeconds(market.line);
    example =
      pays === null
        ? `RIDE ${seconds}s is at ${percent(ride)} right now.`
        : `Right now, 10 tUSDC on RIDE ${seconds}s (at ${percent(ride)}) pays ${formatTokenAmount(pays)} if the driver passes ${seconds} s.`;
  }

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // Private windows: the guide just shows again next visit.
    }
  };

  return (
    <section
      className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm"
      aria-label="How trading works"
    >
      <div className="flex items-start justify-between gap-2">
        <p>
          <span className="font-semibold text-up">RIDE</span> if you think the driver passes the
          line, <span className="font-semibold text-down">BUST</span> if you think the police get
          them first. Winning shares pay 1 tUSDC each, claimed for you.
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss guide"
          className="shrink-0 text-muted hover:text-text"
        >
          ✕
        </button>
      </div>
      {example !== null && <p className="mt-2 text-xs text-muted">{example}</p>}
    </section>
  );
}
