import type { Arena } from "@sirenrun/sdk";
import { formatClock, gapFill, stagingSecondsLeft } from "../game/hud-model";

export interface ChannelStatus {
  /** IDLE, STAGING, LIVE, BUSTED or VOID. */
  label: string;
  /** Countdown, run clock or final time; empty when idle. */
  detail: string;
  tone: "idle" | "staging" | "live" | "over";
  /** Gap meter fill 0..1 for the card's mini meter, null when no run is on. */
  gap: number | null;
  /** The button the card offers: drive an idle channel, watch a busy one. */
  action: "Drive" | "Watch";
}

/** What a lobby card says about one channel. */
export function channelStatus(arena: Arena | null): ChannelStatus {
  if (arena === null) {
    return { label: "…", detail: "", tone: "idle", gap: null, action: "Watch" };
  }
  switch (arena.status) {
    case "idle":
      return { label: "IDLE", detail: "", tone: "idle", gap: null, action: "Drive" };
    case "staging":
      return {
        label: "STAGING",
        detail: arena.seedReady ? `${stagingSecondsLeft(arena.phaseTicks)}s` : "rolling course",
        tone: "staging",
        gap: 1,
        action: "Watch",
      };
    case "live":
      return {
        label: "LIVE",
        detail: formatClock(arena.sim.t),
        tone: "live",
        gap: gapFill(arena.sim.policeGap),
        action: "Watch",
      };
    case "settled": {
      const aborted = arena.markets.every((m) => m.status === "void");
      return {
        label: aborted ? "VOID" : "BUSTED",
        detail: aborted ? "no seed, refunded" : formatClock(arena.sim.t),
        tone: "over",
        gap: aborted ? null : 0,
        action: "Watch",
      };
    }
  }
}
