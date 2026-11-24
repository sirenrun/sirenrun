"use client";

import dynamic from "next/dynamic";
import { useEffect, useSyncExternalStore } from "react";
import { Hud } from "../game/Hud";
import type { DemoOptions } from "../game/demo";
import { useMarketFeed } from "../lib/use-market-feed";
import { useArena } from "../stores/arena";
import { useBalance } from "../stores/balance";
import { GameAudio } from "./game-audio";
import { SaveClip } from "./save-clip";
import { DriverPanel } from "./driver-panel";
import { MarketsPanel } from "./markets-panel";

const Scene = dynamic(() => import("../game/Scene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-white/[0.02]" aria-hidden />,
});

/**
 * `?seed=`, `?skip=` (live ticks) and `?miss=` (0..1) pin a run, e.g. for screenshots.
 * `?view=driver` shows the driver's layout; `?view=trader` the full trading panel a visitor
 * sees before connecting a wallet (live fee terms, real quotes on the demo's pools).
 */
function optionsFromUrl(): DemoOptions {
  const q = new URLSearchParams(window.location.search);
  const num = (key: string) => {
    const v = q.get(key);
    return v === null || v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v);
  };
  const seed = q.get("seed");
  return {
    seed: seed !== null && /^\d+$/.test(seed) ? BigInt(seed) : undefined,
    skip: num("skip"),
    miss: num("miss"),
  };
}

const noSubscribe = () => () => {};

/** An offline bot run in the real scene and HUD. Nothing here touches the chain. */
export function DemoChannel() {
  const demo = useArena((s) => s.demo);
  const status = useArena((s) => s.status);
  // The URL does not change while the page is open, so there is nothing to subscribe to; the
  // server render (and hydration) sees the trading layout.
  const view = useSyncExternalStore(
    noSubscribe,
    () => new URLSearchParams(window.location.search).get("view"),
    () => null,
  );
  const ensureConfig = useBalance((s) => s.ensureConfig);

  useEffect(() => demo(optionsFromUrl()), [demo]);
  // The trader preview quotes real payouts, so it needs the devnet fee terms.
  useEffect(() => {
    if (view === "trader") void ensureConfig();
  }, [view, ensureConfig]);
  useMarketFeed(null);

  return (
    <main className="relative flex h-[calc(100dvh-4rem)] w-full flex-col overflow-hidden lg:flex-row">
      <div className="relative min-h-0 min-w-0 flex-1">
        <Scene className="absolute inset-0" record />
        {status !== null && status !== "idle" && <Hud channel={0} />}
        <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 text-sm sm:left-6">
          <GameAudio />
          <SaveClip className="rounded bg-black/50 px-2 py-1 font-semibold text-muted hover:bg-black/70 hover:text-text" />
          <span className="rounded bg-black/50 px-2 py-1 font-semibold tracking-wide">DEMO</span>
          <span className="rounded bg-black/50 px-2 py-1 text-muted">Bot driver, offline</span>
        </div>
      </div>
      {view === "driver" ? (
        <DriverPanel demo />
      ) : view === "trader" ? (
        <MarketsPanel preview />
      ) : (
        <MarketsPanel demo />
      )}
    </main>
  );
}
