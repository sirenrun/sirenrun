"use client";

import { addAfterEffect, useThree } from "@react-three/fiber";
import { priceYes } from "@sirenrun/sdk";
import { TICK_MS } from "@sirenrun/sim";
import { useEffect } from "react";
import { lineSeconds, percent } from "../lib/markets";
import { useArena } from "../stores/arena";
import { useClip } from "../stores/clip";
import { ClipRecorder, type ClipOverlay } from "./clip";
import { clipFileName } from "./clip-schedule";
import { frame } from "./frame";

function overlay(): ClipOverlay | null {
  const { latest, id } = useArena.getState();
  if (latest === null || !frame.ready) return null;
  return {
    tick: frame.tick,
    gap: frame.policeGap,
    busted: frame.busted,
    channel: id === null ? "DEMO RUN" : `CH-${id + 1}`,
    lines: latest.markets.map((m) => {
      const s = `${lineSeconds(m.line)}s`;
      if (m.status === "yes") return `${s} RIDE ✓`;
      if (m.status === "no") return `${s} BUST ✓`;
      if (m.status === "void") return `${s} void`;
      return `${s} ${percent(priceYes(m.yesR, m.noR))}`;
    }),
  };
}

/**
 * Records the run while one is on screen (live and the few settled seconds after), and keeps
 * the final 10 to 20 seconds as a clip when the run ends. Mounted inside the canvas so
 * the frame can be copied right after it renders.
 */
export function ClipCapture() {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    if (!ClipRecorder.supported()) return;
    let recorder: ClipRecorder | null = null;
    let stopDrawing: (() => void) | null = null;
    // The run's last clock reading, for the file name: by the time the clip is kept the next
    // run may have reset the frame.
    let finalTick = 0;

    const begin = () => {
      if (recorder !== null) return;
      const r = new ClipRecorder(gl.domElement);
      recorder = r;
      useClip.getState().setRecorder(r);
      stopDrawing = addAfterEffect(() => {
        const o = overlay();
        if (o === null) return;
        finalTick = o.tick;
        r.draw(o, performance.now());
      });
    };

    const end = (keep: boolean) => {
      stopDrawing?.();
      stopDrawing = null;
      const r = recorder;
      recorder = null;
      useClip.getState().setRecorder(null);
      if (r === null) return;
      const name = clipFileName(finalTick, TICK_MS);
      const pending = keep ? r.take() : null;
      if (pending === null) {
        r.dispose();
        return;
      }
      void pending.then((blob) => useClip.getState().keep(blob, name)).finally(() => r.dispose());
    };

    const onStatus = (status: string | null) => {
      if (status === "live" || status === "settled") begin();
      // Leaving a run keeps its clip: the chain goes to idle, the offline demo straight to the
      // next staging.
      else if (status === "idle" || status === "staging") end(true);
    };
    onStatus(useArena.getState().status);
    const unsubscribe = useArena.subscribe((s, prev) => {
      if (s.status !== prev.status) onStatus(s.status);
    });
    return () => {
      unsubscribe();
      end(false);
    };
  }, [gl]);

  return null;
}
