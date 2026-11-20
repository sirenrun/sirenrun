/**
 * Keeps the last 10 to 20 seconds of a stream recordable at any moment.
 *
 * A WebM recording needs its header, so trimming one long recording to its tail gives a file
 * players reject. Instead two recordings overlap: a new one starts every `STAGGER_MS` and each
 * is dropped after `KEEP_MS`. Whenever a clip is asked for, the oldest running recording has
 * been going for between `STAGGER_MS` and `KEEP_MS`; stopping it yields a complete file.
 */

export const STAGGER_MS = 10_000;
export const KEEP_MS = 20_000;

/** The part of `MediaRecorder` the schedule drives. */
export interface Recording {
  readonly startedAt: number;
  /** Stops and resolves with the recorded file. */
  finish(): Promise<Blob>;
  /** Stops and throws the recording away. */
  discard(): void;
}

export class ClipSchedule {
  private running: Recording[] = [];
  private lastStart = -Infinity;

  private readonly start: (now: number) => Recording;

  constructor(start: (now: number) => Recording) {
    this.start = start;
  }

  /** Starts and drops recordings as time passes; call it a few times a second. */
  tick(now: number): void {
    if (now - this.lastStart >= STAGGER_MS) {
      this.running.push(this.start(now));
      this.lastStart = now;
    }
    const keep: Recording[] = [];
    for (const r of this.running) {
      if (now - r.startedAt > KEEP_MS) r.discard();
      else keep.push(r);
    }
    this.running = keep;
  }

  /** How many seconds a clip taken now would hold. */
  available(now: number): number {
    const oldest = this.running[0];
    return oldest === undefined ? 0 : (now - oldest.startedAt) / 1000;
  }

  /**
   * Finishes the longest recording as the clip; the next `tick` starts a fresh one. Null when
   * nothing is recording.
   */
  take(): Promise<Blob> | null {
    const oldest = this.running.shift();
    if (oldest === undefined) return null;
    if (this.running.length === 0) this.lastStart = -Infinity;
    return oldest.finish();
  }

  /** Stops everything without keeping it. */
  clear(): void {
    for (const r of this.running) r.discard();
    this.running = [];
    this.lastStart = -Infinity;
  }
}

/** `sirenrun-1m07s.webm` for a run that ended at 67 s. */
export function clipFileName(tick: number, tickMs: number): string {
  const seconds = Math.floor((tick * tickMs) / 1000);
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `sirenrun-${m}m${s}s.webm`;
}

/** The first WebM type this browser can record, VP9 preferred. */
export function pickMimeType(supported: (type: string) => boolean): string | null {
  for (const type of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
    if (supported(type)) return type;
  }
  return null;
}
