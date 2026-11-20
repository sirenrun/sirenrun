import { describe, expect, it } from "vitest";
import {
  ClipSchedule,
  KEEP_MS,
  STAGGER_MS,
  clipFileName,
  pickMimeType,
  type Recording,
} from "./clip-schedule";

class Fake implements Recording {
  state: "running" | "finished" | "discarded" = "running";
  readonly startedAt: number;
  constructor(startedAt: number) {
    this.startedAt = startedAt;
  }
  finish() {
    this.state = "finished";
    return Promise.resolve(new Blob([String(this.startedAt)]));
  }
  discard() {
    this.state = "discarded";
  }
}

function schedule() {
  const made: Fake[] = [];
  const s = new ClipSchedule((now) => {
    const r = new Fake(now);
    made.push(r);
    return r;
  });
  return { s, made };
}

describe("clip schedule", () => {
  it("keeps two staggered recordings and drops the expired one", () => {
    const { s, made } = schedule();
    for (let t = 0; t <= 25_000; t += 250) s.tick(t);
    expect(made.map((r) => r.startedAt)).toEqual([0, STAGGER_MS, 2 * STAGGER_MS]);
    expect(made[0]?.state).toBe("discarded");
    expect(made.slice(1).map((r) => r.state)).toEqual(["running", "running"]);
  });

  it("always has between 10 and 20 seconds once warmed up", () => {
    const { s } = schedule();
    for (let t = 0; t <= 60_000; t += 250) {
      s.tick(t);
      if (t >= STAGGER_MS) {
        expect(s.available(t)).toBeGreaterThanOrEqual(STAGGER_MS / 1000);
        expect(s.available(t)).toBeLessThanOrEqual(KEEP_MS / 1000);
      }
    }
  });

  it("hands over the longest recording and starts again on the next tick", async () => {
    const { s, made } = schedule();
    for (let t = 0; t <= 15_000; t += 250) s.tick(t);
    const clip = await s.take();
    expect(await clip?.text()).toBe("0");
    expect(made[0]?.state).toBe("finished");
    expect(s.available(15_000)).toBeCloseTo(5);
    await s.take();
    expect(s.take()).toBeNull();
    s.tick(16_000);
    expect(made.at(-1)?.startedAt).toBe(16_000);
  });

  it("clears without keeping anything", () => {
    const { s, made } = schedule();
    for (let t = 0; t <= 12_000; t += 250) s.tick(t);
    s.clear();
    expect(made.every((r) => r.state === "discarded")).toBe(true);
    expect(s.available(12_000)).toBe(0);
  });
});

describe("clip files", () => {
  it("names the clip after the run time", () => {
    expect(clipFileName(670, 100)).toBe("sirenrun-1m07s.webm");
    expect(clipFileName(42, 100)).toBe("sirenrun-0m04s.webm");
  });

  it("prefers VP9, falls back, or gives up", () => {
    expect(pickMimeType(() => true)).toBe("video/webm;codecs=vp8");
    expect(pickMimeType((t) => t.includes("vp9"))).toBe("video/webm;codecs=vp9");
    expect(pickMimeType(() => false)).toBeNull();
  });
});
