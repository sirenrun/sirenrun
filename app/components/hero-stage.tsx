"use client";

import { useEffect, useState } from "react";
import { heroMode } from "../game/attract";
import { prefersReducedMotion } from "../game/controls";
import Scene from "../game/Scene";
import { webglAvailable } from "../game/webgl";
import { useArena } from "../stores/arena";

/**
 * The attract run behind the landing hero. Client-only (loaded with `ssr: false`), so it can
 * read the browser's WebGL support and motion preference on first render.
 */
export default function HeroStage({ visible }: { visible: boolean }) {
  const demo = useArena((s) => s.demo);
  const [env] = useState(() => ({
    webgl: webglAvailable(),
    reducedMotion: prefersReducedMotion(),
  }));
  const mode = heroMode({ ...env, visible });
  // The run keeps going while paused (it is cheap); only the poster has none.
  const playing = mode !== "poster";

  useEffect(() => {
    if (!playing) return;
    return demo();
  }, [demo, playing]);

  if (!playing) return null;
  return <Scene className="absolute inset-0" paused={mode === "paused"} />;
}
