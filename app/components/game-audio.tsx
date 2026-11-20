"use client";

import { INVULN_TICKS } from "@sirenrun/sim";
import { useEffect } from "react";
import { RunAudio } from "../game/audio";
import { cues, engineHz, sirenLevel, type AudioInput } from "../game/audio-model";
import { frame } from "../game/frame";
import { useArena } from "../stores/arena";
import { useAudio } from "../stores/audio";

/** Plays the run: engine, siren and one-shot cues, read from the scene's frame each animation frame. */
export function GameAudio() {
  const muted = useAudio((s) => s.muted);

  useEffect(() => {
    useAudio.getState().restore();
    const audio = new RunAudio();
    audio.setMuted(useAudio.getState().muted);
    audio.start();
    const stopMute = useAudio.subscribe((s) => audio.setMuted(s.muted));
    let prev: AudioInput | null = null;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const latest = useArena.getState().latest;
      if (latest === null || !frame.ready) return;
      const running = latest.status === "live" && !frame.busted;
      const next: AudioInput = {
        running,
        speed: frame.speed,
        nitro: frame.nitro,
        policeGap: frame.policeGap,
        busted: frame.busted && latest.status !== "idle",
        // A hit resets invuln to its maximum; this loop may skip the frame that flags it.
        hit: prev !== null && frame.invuln >= INVULN_TICKS - 2 && frame.invuln > prevInvuln,
        crossed: latest.markets.filter((m) => m.status === "yes").length,
        nonce: latest.nonce,
      };
      prevInvuln = frame.invuln;
      // A low idle under the staging countdown, full revs once live.
      audio.update(
        engineHz(next.speed, next.nitro),
        running ? 1 : latest.status === "staging" ? 0.35 : 0,
        sirenLevel(next.policeGap, running, next.busted),
      );
      for (const cue of cues(prev, next)) audio.play(cue);
      prev = next;
    };
    let prevInvuln = 0;
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      stopMute();
      audio.stop();
    };
  }, []);

  return <MuteButton muted={muted} />;
}

function MuteButton({ muted }: { muted: boolean }) {
  const toggle = useAudio((s) => s.toggle);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={muted}
      aria-label={muted ? "Turn sound on" : "Turn sound off"}
      title={muted ? "Sound off" : "Sound on"}
      className="pointer-events-auto rounded bg-black/50 px-2 py-1 text-sm text-muted transition-colors hover:text-text"
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
