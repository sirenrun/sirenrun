"use client";

import { TICK_MS } from "@sirenrun/sim";
import { clipFileName } from "../game/clip-schedule";
import { frame } from "../game/frame";
import { useClip } from "../stores/clip";

/** Downloads the last 10 to 20 seconds of the run as WebM, HUD included. */
export function SaveClip({ className = "" }: { className?: string }) {
  const recording = useClip((s) => s.recorder !== null);
  const kept = useClip((s) => s.last !== null);
  const saving = useClip((s) => s.saving);
  const save = useClip((s) => s.save);
  if (!recording && !kept) return null;
  return (
    <button
      type="button"
      disabled={saving}
      onClick={() => void save(clipFileName(frame.tick, TICK_MS))}
      title="Download the last 10 to 20 seconds as a video"
      className={`pointer-events-auto disabled:opacity-50 ${className}`}
    >
      {saving ? "Saving…" : "Save clip"}
    </button>
  );
}
