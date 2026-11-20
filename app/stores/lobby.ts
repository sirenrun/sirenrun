import { create } from "zustand";
import { fetchArena, subscribeArena, type Arena } from "@sirenrun/sdk";
import { ARENAS } from "@sirenrun/sim";
import { chain } from "../lib/chain";
import { useBalance } from "./balance";
import { claimSettled } from "./claims";

interface LobbyState {
  arenas: (Arena | null)[];
  error: string | null;
  /** Follows every channel and claims settled positions on any of them; returns a stop function. */
  watch: () => () => void;
}

export const useLobby = create<LobbyState>((set, get) => ({
  arenas: Array.from({ length: ARENAS }, () => null),
  error: null,

  watch: () => {
    const { er } = chain();
    let stopped = false;
    const onError = (e: unknown) => set({ error: e instanceof Error ? e.message : String(e) });
    const receive = (arena: Arena) => {
      if (stopped) return;
      const arenas = [...get().arenas];
      arenas[arena.id] = arena;
      set({ arenas, error: null });
      claimSettled(arena);
    };
    const stops = Array.from({ length: ARENAS }, (_, id) => {
      fetchArena(er, id)
        .then((arena) => arena !== null && receive(arena))
        .catch(onError);
      return subscribeArena(er, id, receive, onError);
    });
    // Positions can become claimable when the balance changes too (session starts, deposit).
    const stopBalance = useBalance.subscribe((s, prev) => {
      if (s.game === prev.game) return;
      for (const arena of get().arenas) if (arena !== null) claimSettled(arena);
    });
    return () => {
      stopped = true;
      for (const stop of stops) stop();
      stopBalance();
    };
  },
}));
