import { MAX_LIVE_TICKS, SPEED_MAX } from "@sirenrun/sim";
import { Z_SCALE } from "./world";

/**
 * Roadside billboards for the stack and community the game is built with. Pure layout, so a
 * test can check the spacing and that every logo shows on both sides of the road.
 */

export type Partner = "solana" | "magicblock" | "superteamNepal";

export const PARTNERS: readonly Partner[] = ["solana", "magicblock", "superteamNepal"];

/** Official files, shown unmodified. */
export const PARTNER_LOGOS: Record<Partner, string> = {
  solana: "/partners/solana-mark.svg",
  magicblock: "/partners/magicblock-mark.svg",
  superteamNepal: "/partners/superteam-nepal.png",
};

/** Neon frame per partner, from the scene palette. */
export const PARTNER_FRAME: Record<Partner, string> = {
  solana: "#22e1ff",
  magicblock: "#ff2e88",
  superteamNepal: "#ffb020",
};

/** Panel size in metres: the two marks are square-ish, the Superteam lockup is wide. */
export const PANEL_SIZE: Record<Partner, { w: number; h: number }> = {
  solana: { w: 7, h: 6 },
  magicblock: { w: 7, h: 6 },
  superteamNepal: { w: 14, h: 4.2 },
};

/** Twelve boards in all, spread evenly over the longest possible run. */
export const BILLBOARD_COUNT = 12;
/** Metres of road a run can cover: top speed for every live tick (nitro runs are rare extras). */
export const COURSE_M = SPEED_MAX * MAX_LIVE_TICKS * Z_SCALE;
export const BILLBOARD_SPACING = COURSE_M / BILLBOARD_COUNT;

export interface BillboardSlot {
  side: -1 | 1;
  /** Metres from the start line. */
  at: number;
  partner: Partner;
}

/**
 * Fixed boards, not recycled: board i stands halfway into the i-th twelfth of the course, the
 * sides alternate and the logos cycle, so every logo gets four boards on both sides.
 */
export function billboardLayout(): BillboardSlot[] {
  return Array.from({ length: BILLBOARD_COUNT }, (_, i) => ({
    side: i % 2 === 0 ? -1 : 1,
    at: (i + 0.5) * BILLBOARD_SPACING,
    partner: PARTNERS[i % PARTNERS.length] as Partner,
  }));
}
