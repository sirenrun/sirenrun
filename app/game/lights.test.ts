import { describe, expect, it } from "vitest";
import { CAR_LENGTH } from "./car-fit";
import { createFrame } from "./frame";
import { reflections, type PoliceLights } from "./lights";
import { worldX, worldZ } from "./world";

const police = (over: Partial<PoliceLights> = {}): PoliceLights => ({
  visible: true,
  x: 1.2,
  z: -40,
  red: 1,
  closeness: 0.5,
  ...over,
});

describe("road reflections", () => {
  it("puts the tail lights on the car's rear bumper", () => {
    const f = {
      ...createFrame(),
      ready: true,
      status: "live" as const,
      distance: 2000,
      displayX: 720,
    };
    const r = reflections(f, police());
    expect(r.tail.x).toBeCloseTo(worldX(720));
    expect(r.tail.z).toBeCloseTo(worldZ(2000) + CAR_LENGTH / 2);
    expect(r.tail.on).toBe(1);
  });

  it("mirrors the police bar where the cruiser is, brighter as it closes in", () => {
    const f = { ...createFrame(), ready: true, status: "live" as const };
    const far = reflections(f, police({ closeness: 0 }));
    const near = reflections(f, police({ closeness: 1 }));
    expect(near.police.x).toBe(1.2);
    expect(near.police.z).toBe(-40);
    expect(near.police.strength).toBeGreaterThan(far.police.strength);
    expect(reflections(f, police({ red: 0 })).police.red).toBe(0);
  });

  it("blinks the tail lights with the car after a hit", () => {
    const f = { ...createFrame(), ready: true, status: "live" as const, invuln: 5 };
    expect(reflections({ ...f, time: 0 }, police()).tail.on).toBe(1);
    expect(reflections({ ...f, time: 1 / 12 + 0.001 }, police()).tail.on).toBe(0);
  });

  it("mirrors nothing while the arena is idle or the cruisers are off screen", () => {
    const idle = reflections(createFrame(), police());
    expect(idle.tail.on).toBe(0);
    expect(idle.police.strength).toBe(0);
    const live = { ...createFrame(), ready: true, status: "live" as const };
    expect(reflections(live, police({ visible: false })).police.strength).toBe(0);
  });
});
