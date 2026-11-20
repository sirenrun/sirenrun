import { INVULN_TICKS, LINES } from "@sirenrun/sim";
import { describe, expect, it } from "vitest";
import { DemoRun } from "./demo";

function finish(run: DemoRun): string[] {
  const phases: string[] = [];
  while (run.tick()) {
    const status = run.arena().status;
    if (phases.at(-1) !== status) phases.push(status);
  }
  return phases;
}

describe("demo run", () => {
  it("goes staging, live, settled and then ends", () => {
    const run = new DemoRun(1, { seed: 7n });
    expect(run.arena().status).toBe("staging");
    expect(finish(run)).toEqual(["staging", "live", "settled"]);
    expect(run.sim.busted).toBe(true);
  });

  it("replays the same run for the same seed", () => {
    const a = new DemoRun(1, { seed: 99n, miss: 0.2 });
    const b = new DemoRun(5, { seed: 99n, miss: 0.2 });
    finish(a);
    finish(b);
    expect(a.sim).toEqual(b.sim);
  });

  it("resolves each line like the program: YES once t reaches it, else NO at the bust", () => {
    for (const seed of [1n, 7n, 42n, 99n]) {
      const run = new DemoRun(1, { seed, miss: 0.15 });
      finish(run);
      const { markets, sim } = run.arena();
      LINES.forEach((line, i) => {
        const m = markets[i];
        expect(m?.status).toBe(sim.t >= line ? "yes" : "no");
        expect(m?.resolvedTick).toBe(sim.t >= line ? line : sim.t);
      });
    }
  });

  it("never gets hit when it never misses, and saved nitro outlasts the plain perfect bot", () => {
    for (const seed of [1n, 3n, 42n]) {
      const run = new DemoRun(1, { seed, miss: 0, skip: 400 });
      expect(run.arena().status).toBe("live");
      expect(run.sim.t).toBe(400);
      let hits = 0;
      while (run.tick()) if (run.sim.invuln === INVULN_TICKS) hits += 1;
      expect(hits).toBe(0);
      // The perfect bot without nitro is caught at 900; nitro saved for a close gap buys more.
      expect(run.sim.t).toBeGreaterThan(900);
      expect(run.sim.t).toBeLessThan(1500);
    }
  });

  it("counts the HUD staging clock down over the short demo staging", () => {
    const run = new DemoRun(1, { seed: 1n });
    const start = run.arena().phaseTicks;
    run.tick();
    expect(run.arena().phaseTicks).toBeGreaterThan(start);
    while (run.arena().status === "staging") {
      expect(run.arena().phaseTicks).toBeLessThanOrEqual(100);
      run.tick();
    }
  });
});
