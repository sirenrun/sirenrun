import type { Arena } from "@sirenrun/sdk";
import { describe, expect, it } from "vitest";
import { PlaybackClock, RENDER_DELAY_TICKS, Timeline, sample } from "./playback";

function arena(t: number, nonce = 1): Arena {
  return {
    nonce,
    status: "live",
    sim: { t, distance: t * 100, carX: t * 10, policeGap: 3000 - t, speed: 100 + t },
  } as unknown as Arena;
}

describe("Timeline", () => {
  it("blends between the snapshots around a fractional tick", () => {
    const line = new Timeline();
    line.push(arena(10), 0);
    line.push(arena(11), 100);
    const s = sample(line, 10.25);
    expect(s?.distance).toBeCloseTo(1025);
    expect(s?.carX).toBeCloseTo(102.5);
  });

  it("bridges missing ticks linearly", () => {
    const line = new Timeline();
    line.push(arena(10), 0);
    line.push(arena(13), 300);
    expect(sample(line, 11.5)?.distance).toBeCloseTo(1150);
  });

  it("drops stale updates and keeps the newer copy of a repeated tick", () => {
    const line = new Timeline();
    line.push(arena(12), 0);
    line.push(arena(11), 10);
    expect(line.latest?.arena.sim.t).toBe(12);
    const again = { ...arena(12), status: "settled" } as Arena;
    line.push(again, 50);
    expect(line.latest).toEqual({ arena: again, at: 0 });
  });

  it("starts over when a new run begins", () => {
    const line = new Timeline();
    line.push(arena(500, 1), 0);
    line.push(arena(0, 2), 10);
    expect(line.latest?.arena.nonce).toBe(2);
    expect(sample(line, 400)?.distance).toBe(0);
  });
});

describe("PlaybackClock", () => {
  it("renders RENDER_DELAY_TICKS behind the newest snapshot", () => {
    expect(PlaybackClock.target(20, 1_000, 1_000)).toBe(20 - RENDER_DELAY_TICKS);
    expect(PlaybackClock.target(20, 1_000, 1_050)).toBeCloseTo(20 - RENDER_DELAY_TICKS + 0.5);
    expect(PlaybackClock.target(20, 1_000, 5_000)).toBe(20);
  });

  it("advances in real time between updates without jumping", () => {
    const clock = new PlaybackClock();
    clock.advance(16, 20, 0, 0);
    let previous = clock.tick ?? 0;
    for (let now = 16; now <= 96; now += 16) {
      const tick = clock.advance(16, 20, 0, now);
      expect(tick).toBeGreaterThan(previous);
      expect(tick - previous).toBeLessThan(0.3);
      previous = tick;
    }
  });

  it("absorbs jitter: a late burst of updates does not make it leap", () => {
    const clock = new PlaybackClock();
    clock.advance(16, 20, 0, 0);
    const before = clock.tick ?? 0;
    // Two ticks arrive at once, 200 ms late.
    const after = clock.advance(16, 22, 16, 16);
    expect(after - before).toBeLessThan(0.5);
  });

  it("jumps when far behind, e.g. after the tab was hidden", () => {
    const clock = new PlaybackClock();
    clock.advance(16, 20, 0, 0);
    expect(clock.advance(16, 200, 10_000, 10_000)).toBe(200 - RENDER_DELAY_TICKS);
  });

  it("never runs ahead of the newest snapshot", () => {
    const clock = new PlaybackClock();
    clock.advance(16, 20, 0, 0);
    for (let now = 16; now < 2_000; now += 16) clock.advance(16, 20, 0, now);
    expect(clock.tick).toBeLessThanOrEqual(20);
  });
});
