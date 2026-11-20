import { create } from "zustand";
import { fetchArena, subscribeArena, type Arena, type ArenaStatus } from "@sirenrun/sdk";
import { TICK_MS } from "@sirenrun/sim";
import { chain } from "../lib/chain";
import { DemoRun, type DemoOptions } from "../game/demo";
import { Timeline } from "../game/playback";

/**
 * Live feed of one arena. Snapshots go into a `Timeline` that the render loop reads every
 * frame through `getState()`, never through React. Components select single coarse fields
 * (status, nonce, seedReady), which change a few times per run.
 */
interface ArenaState {
  id: number | null;
  status: ArenaStatus | null;
  nonce: number;
  seedReady: boolean;
  /** Newest snapshot; HUD and markets poll it, React does not re-render on it. */
  latest: Arena | null;
  timeline: Timeline;
  error: string | null;
  connect: (id: number) => () => void;
  /** Plays offline bot runs back to back instead of a chain feed. Returns a stop function. */
  demo: (opts?: DemoOptions) => () => void;
}

export const useArena = create<ArenaState>((set, get) => {
  function receive(arena: Arena) {
    get().timeline.push(arena, performance.now());
    // Components select single fields, so `status` etc. re-render only when they change;
    // nothing should subscribe to `latest` through React.
    set({ latest: arena, status: arena.status, nonce: arena.nonce, seedReady: arena.seedReady });
  }

  return {
    id: null,
    status: null,
    nonce: 0,
    seedReady: false,
    latest: null,
    timeline: new Timeline(),
    error: null,

    connect: (id) => {
      set({
        id,
        status: null,
        nonce: 0,
        seedReady: false,
        latest: null,
        timeline: new Timeline(),
        error: null,
      });
      const { er } = chain();
      let stopped = false;
      const unsubscribe = subscribeArena(
        er,
        id,
        (arena) => !stopped && receive(arena),
        (e) => set({ error: e instanceof Error ? e.message : String(e) }),
      );
      fetchArena(er, id)
        .then((arena) => {
          if (stopped) return;
          if (arena === null) set({ error: `channel ${id + 1} does not exist` });
          else if (get().latest === null) receive(arena);
        })
        .catch(
          (e: unknown) => !stopped && set({ error: e instanceof Error ? e.message : String(e) }),
        );
      return () => {
        stopped = true;
        unsubscribe();
      };
    },

    demo: (opts) => {
      set({
        id: null,
        status: null,
        nonce: 0,
        seedReady: false,
        latest: null,
        timeline: new Timeline(),
        error: null,
      });
      let run = new DemoRun(1, opts);
      receive(run.arena());
      const timer = setInterval(() => {
        if (!run.tick()) run = new DemoRun(run.nonce + 1, { miss: opts?.miss });
        receive(run.arena());
      }, TICK_MS);
      return () => clearInterval(timer);
    },
  };
});
