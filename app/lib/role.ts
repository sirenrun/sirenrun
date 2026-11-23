import type { Arena } from "@sirenrun/sdk";

/**
 * Who is looking at a channel. The driver of the current, unfinished run sees the road, their
 * controls and how the crowd is betting; everyone else sees the trading panel.
 */
export type Role = "driver" | "watcher";

export function roleOf(wallet: string | null, arena: Arena | null): Role {
  if (wallet === null || arena === null || arena.nonce === 0) return "watcher";
  if (arena.status !== "staging" && arena.status !== "live") return "watcher";
  return arena.runner.toBase58() === wallet ? "driver" : "watcher";
}
