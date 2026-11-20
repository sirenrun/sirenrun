import { describe, expect, it } from "vitest";
import { heroMode } from "./attract";

describe("landing hero", () => {
  it("plays the run while the hero is on screen", () => {
    expect(heroMode({ webgl: true, reducedMotion: false, visible: true })).toBe("live");
  });

  it("stops rendering once the hero scrolls away", () => {
    expect(heroMode({ webgl: true, reducedMotion: false, visible: false })).toBe("paused");
  });

  it("shows a still poster without WebGL or under reduced motion", () => {
    expect(heroMode({ webgl: false, reducedMotion: false, visible: true })).toBe("poster");
    expect(heroMode({ webgl: true, reducedMotion: true, visible: true })).toBe("poster");
    expect(heroMode({ webgl: false, reducedMotion: true, visible: false })).toBe("poster");
  });
});
