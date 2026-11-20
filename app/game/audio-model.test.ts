import { GAP_MAX, SPEED_MAX, SPEED_START } from "@sirenrun/sim";
import { describe, expect, it } from "vitest";
import { cues, engineHz, sirenLevel, type AudioInput } from "./audio-model";

const base: AudioInput = {
  running: true,
  speed: SPEED_MAX,
  nitro: false,
  policeGap: GAP_MAX,
  busted: false,
  hit: false,
  crossed: 0,
  nonce: 3,
};

describe("run audio", () => {
  it("pitches the engine up with speed and nitro", () => {
    expect(engineHz(SPEED_START, false)).toBeLessThan(engineHz(SPEED_MAX, false));
    expect(engineHz(SPEED_MAX, true)).toBeGreaterThan(engineHz(SPEED_MAX, false));
    expect(engineHz(0, false)).toBe(42);
  });

  it("brings the siren in as the gap closes", () => {
    expect(sirenLevel(GAP_MAX, true, false)).toBe(0);
    expect(sirenLevel(GAP_MAX / 2, true, false)).toBeCloseTo(0.25);
    expect(sirenLevel(0, true, false)).toBe(1);
    expect(sirenLevel(0, false, false)).toBe(0);
    expect(sirenLevel(GAP_MAX, false, true)).toBe(1);
  });

  it("fires each cue once, on the change", () => {
    expect(cues(base, { ...base, hit: true })).toEqual(["hit"]);
    expect(cues(base, { ...base, crossed: 1 })).toEqual(["line"]);
    expect(cues(base, { ...base, nitro: true })).toEqual(["nitro"]);
    expect(cues({ ...base, nitro: true }, { ...base, nitro: true })).toEqual([]);
    expect(cues(base, { ...base, busted: true, running: false })).toEqual(["bust"]);
  });

  it("stays quiet on the first frame and when a new run starts", () => {
    expect(cues(null, { ...base, busted: true })).toEqual([]);
    expect(cues({ ...base, busted: true }, { ...base, nonce: 4, crossed: 0 })).toEqual([]);
  });
});
