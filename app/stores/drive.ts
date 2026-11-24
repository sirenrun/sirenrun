import { create } from "zustand";
import {
  TransactionFailed,
  formatTokenAmount,
  isSessionLive,
  sendEr,
  sessionAuthority,
  setInputIx,
  startRunIx,
} from "@sirenrun/sdk";
import { chain } from "../lib/chain";
import { clampLane } from "../game/motion";
import { laneMotion } from "../game/controls";
import { useArena } from "./arena";
import { useBalance } from "./balance";
import { useSession } from "./session";

const FRIENDLY: Record<string, string> = {
  ArenaBusy: "Someone else just started a run on this channel.",
  InsufficientBalance: "Not enough tUSDC in your game balance for the entry and bond.",
  InvalidBond: "That bond is outside the allowed range; pick one of the options.",
  HouseInsufficient: "The house is out of liquidity for new runs right now.",
  Unauthorized: "Your session is not valid for this wallet. Start a new session.",
};

function describe(e: unknown): string {
  if (e instanceof TransactionFailed) {
    return (
      (e.errorName !== undefined ? FRIENDLY[e.errorName] : undefined) ?? e.errorName ?? e.message
    );
  }
  return e instanceof Error ? e.message : String(e);
}

interface DriveState {
  starting: boolean;
  error: string | null;
  /** Inputs sent but not yet confirmed; shown as a subtle "sending" hint if it grows. */
  inFlight: number;
  /** Starts a run with `bond` (from `bondOptions`), held during the run. */
  start: (bond: bigint) => Promise<void>;
  /** Moves one lane left (-1) or right (+1) from where the player is already heading. */
  steer: (direction: -1 | 1) => void;
  nitro: () => void;
}

function liveSession() {
  const session = useSession.getState().session;
  return session !== null && isSessionLive(session, Date.now() / 1000) ? session : null;
}

export const useDrive = create<DriveState>((set, get) => {
  function send(targetLane: number, nitro: boolean) {
    const session = liveSession();
    const arena = useArena.getState();
    if (session === null || arena.id === null) return;
    set({ inFlight: get().inFlight + 1 });
    // Fire and forget: the scene already moved; the chain catches up within a tick or two.
    sendEr(chain().er, session.keypair, [
      setInputIx({ auth: sessionAuthority(session), id: arena.id, targetLane, nitro }),
    ])
      .catch((e: unknown) => set({ error: describe(e) }))
      .finally(() => set({ inFlight: Math.max(0, get().inFlight - 1) }));
  }

  return {
    starting: false,
    error: null,
    inFlight: 0,

    start: async (bond) => {
      const session = liveSession();
      const { id } = useArena.getState();
      const config = useBalance.getState().config;
      if (session === null || id === null || config === null) return;
      set({ starting: true, error: null });
      try {
        const { er, endpoints } = chain();
        await sendEr(er, session.keypair, [
          startRunIx({
            auth: sessionAuthority(session),
            runner: session.authority,
            house: config.house,
            id,
            oracleQueue: endpoints.oracleQueue,
            bond,
          }),
        ]);
        set({ starting: false });
      } catch (e) {
        set({ starting: false, error: describe(e) });
      }
    },

    steer: (direction) => {
      const latest = useArena.getState().latest;
      if (latest === null) return;
      const lane = clampLane(laneMotion.targetLane(latest.sim.targetLane) + direction);
      laneMotion.press(lane, performance.now());
      send(lane, false);
    },

    nitro: () => {
      const latest = useArena.getState().latest;
      if (latest === null) return;
      // The program skips a boost the driver cannot pay for; say so instead of doing nothing.
      const { config, game } = useBalance.getState();
      const fee = config?.nitroFee ?? 0n;
      const left = latest.sim.nitroLeft > 0 && latest.sim.nitroTicks === 0;
      if (left && fee > 0n && (game?.available ?? 0n) < fee) {
        set({ error: `Nitro costs ${formatTokenAmount(fee)} tUSDC; top up your game balance.` });
        return;
      }
      send(laneMotion.targetLane(latest.sim.targetLane), true);
    },
  };
});
