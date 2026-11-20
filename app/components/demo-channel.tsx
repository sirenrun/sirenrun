"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { Hud } from "../game/Hud";
import type { DemoOptions } from "../game/demo";
import { useArena } from "../stores/arena";
import { GameAudio } from "./game-audio";
import { SaveClip } from "./save-clip";
import { MarketsPanel } from "./markets-panel";

const Scene = dynamic(() => import("../game/Scene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-white/[0.02]" aria-hidden />,
});

/** `?seed=`, `?skip=` (live ticks) and `?miss=` (0..1) pin a run, e.g. for screenshots. */
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

/** An offline bot run in the real scene and HUD. Nothing here touches the chain. */
export function DemoChannel() {
  const demo = useArena((s) => s.demo);
  const status = useArena((s) => s.status);

  useEffect(() => demo(optionsFromUrl()), [demo]);

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
      <MarketsPanel id={0} demo />
    </main>
  );
}
