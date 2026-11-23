/**
 * Roadside billboards for the stack the game runs on. Pure layout, so a test can check the
 * spacing and that both logos show on both sides of the road.
 */

export type Partner = "solana" | "magicblock";

export const PARTNER_LOGOS: Record<Partner, string> = {
  solana: "/partners/solana.svg",
  magicblock: "/partners/magicblock.svg",
};

/** Neon frame per partner, from the scene palette. */
export const PARTNER_FRAME: Record<Partner, string> = {
  solana: "#22e1ff",
  magicblock: "#ff2e88",
};

/** Even, so each side still alternates logos when its billboards recycle. */
export const BILLBOARDS_PER_SIDE = 4;
/** One billboard per side every 120 m, the two sides offset by half that. */
export const BILLBOARD_SPACING = 120;
export const BILLBOARD_SPAN = BILLBOARDS_PER_SIDE * BILLBOARD_SPACING;
/** Panel size in metres; the texture is drawn at the same aspect. */
export const PANEL_W = 14;
export const PANEL_H = 4.2;

export interface BillboardSlot {
  side: -1 | 1;
  offset: number;
  partner: Partner;
}

export function billboardLayout(): BillboardSlot[] {
  const slots: BillboardSlot[] = [];
  for (let i = 0; i < BILLBOARDS_PER_SIDE * 2; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const k = Math.floor(i / 2);
    slots.push({
      side,
      offset: k * BILLBOARD_SPACING + (side === 1 ? BILLBOARD_SPACING / 2 : 0),
      // Each side alternates, and the two sides start on different logos.
      partner: (k + (side === 1 ? 1 : 0)) % 2 === 0 ? "solana" : "magicblock",
    });
  }
  return slots;
}
