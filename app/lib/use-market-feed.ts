"use client";

import { useEffect } from "react";
import { useBalance } from "../stores/balance";
import { useMarkets } from "../stores/markets";

/**
 * Keeps the channel's prices, trade ticker and automatic claims running whichever panel is on
 * screen, so a driver's earlier positions still pay out while they drive. `null` is the
 * offline demo: prices only.
 */
export function useMarketFeed(id: number | null): void {
  const watch = useMarkets((s) => s.watch);
  const ensureConfig = useBalance((s) => s.ensureConfig);
  useEffect(() => watch(id), [id, watch]);
  useEffect(() => {
    if (id !== null) void ensureConfig();
  }, [id, ensureConfig]);
}
