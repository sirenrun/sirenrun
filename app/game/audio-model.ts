import { GAP_MAX, NITRO_BOOST, SPEED_MAX } from "@sirenrun/sim";

/**
 * What the run sounds like, as numbers: the engine follows the speed, the siren swells as the
 * police close in, and one-shot cues fire on state changes. Pure, so it can be tested; the
 * WebAudio synth in audio.ts only plays what this says.
 */

/** What the audio layer needs from a frame. */
export interface AudioInput {
  /** The run is on screen and moving (live, not busted). */
  running: boolean;
  speed: number;
  nitro: boolean;
  policeGap: number;
  busted: boolean;
  hit: boolean;
  /** Lines resolved YES so far this run. */
  crossed: number;
  nonce: number;
}

export type Cue = "hit" | "line" | "nitro" | "bust";

/** Engine note in Hz: a low idle that rises with speed and jumps on nitro. */
export function engineHz(speed: number, nitro: boolean): number {
  const s = Math.max(
    0,
    Math.min(1, (speed + (nitro ? NITRO_BOOST : 0)) / (SPEED_MAX + NITRO_BOOST)),
  );
  return 42 + s * 78;
}

/** Siren loudness 0..1: silent with a full gap, loud at the bumper. */
export function sirenLevel(gap: number, running: boolean, busted: boolean): number {
  if (busted) return 1;
  if (!running) return 0;
  const close = 1 - Math.max(0, Math.min(GAP_MAX, gap)) / GAP_MAX;
  return close * close;
}

/** One-shot sounds to play going from `prev` to `next`. A new run never replays old cues. */
export function cues(prev: AudioInput | null, next: AudioInput): Cue[] {
  if (prev === null || prev.nonce !== next.nonce) return [];
  const out: Cue[] = [];
  if (next.hit) out.push("hit");
  if (next.crossed > prev.crossed) out.push("line");
  if (next.nitro && !prev.nitro && next.running) out.push("nitro");
  if (next.busted && !prev.busted) out.push("bust");
  return out;
}
