"use client";

import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import {
  PANEL_SIZE,
  PARTNER_FILL,
  PARTNER_FRAME,
  PARTNER_LOGOS,
  PARTNERS,
  billboardLayout,
  type Partner,
} from "./billboards";
import { BILLBOARD_X } from "./layout";

/** Texture pixels per metre of panel. */
const TEX_PER_M = 96;
const POST_H = 6;
/** Panels turn toward the road so the driver reads them on approach, not edge-on. */
const YAW = 0.42;

/** A dark lit panel with a neon frame; the logo is drawn in once its SVG has loaded. */
function panelTexture(partner: Partner): CanvasTexture {
  const TEX_W = Math.round(PANEL_SIZE[partner].w * TEX_PER_M);
  const TEX_H = Math.round(PANEL_SIZE[partner].h * TEX_PER_M);
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return tex;
  const paint = (logo: HTMLImageElement | null) => {
    const bg = ctx.createLinearGradient(0, 0, 0, TEX_H);
    bg.addColorStop(0, "#1a1030");
    bg.addColorStop(1, "#0a0618");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, TEX_W, TEX_H);
    ctx.strokeStyle = PARTNER_FRAME[partner];
    ctx.lineWidth = 14;
    ctx.strokeRect(10, 10, TEX_W - 20, TEX_H - 20);
    if (logo !== null && logo.naturalWidth > 0 && PARTNER_FILL[partner]) {
      // Full-bleed logo: cover the area inside the frame, cropping evenly if aspects differ.
      const inset = 17;
      const boxW = TEX_W - inset * 2;
      const boxH = TEX_H - inset * 2;
      const scale = Math.max(boxW / logo.naturalWidth, boxH / logo.naturalHeight);
      const sw = boxW / scale;
      const sh = boxH / scale;
      ctx.drawImage(
        logo,
        (logo.naturalWidth - sw) / 2,
        (logo.naturalHeight - sh) / 2,
        sw,
        sh,
        inset,
        inset,
        boxW,
        boxH,
      );
    } else if (logo !== null && logo.naturalWidth > 0) {
      // Fit the logo inside the frame with margin, keeping its aspect.
      const maxW = TEX_W * 0.78;
      const maxH = TEX_H * 0.62;
      const scale = Math.min(maxW / logo.naturalWidth, maxH / logo.naturalHeight);
      const w = logo.naturalWidth * scale;
      const h = logo.naturalHeight * scale;
      ctx.drawImage(logo, (TEX_W - w) / 2, (TEX_H - h) / 2, w, h);
    }
    tex.needsUpdate = true;
  };
  paint(null);
  const img = new Image();
  img.onload = () => paint(img);
  img.src = PARTNER_LOGOS[partner];
  return tex;
}

export function Billboards() {
  const slots = useMemo(() => billboardLayout(), []);
  const textures = useMemo(
    () =>
      Object.fromEntries(PARTNERS.map((p) => [p, panelTexture(p)])) as Record<
        Partner,
        CanvasTexture
      >,
    [],
  );
  useEffect(
    () => () => {
      for (const p of PARTNERS) textures[p].dispose();
    },
    [textures],
  );
  return (
    <>
      {slots.map((slot, i) => {
        const { w, h } = PANEL_SIZE[slot.partner];
        return (
          <group
            key={i}
            // Metres along the road map straight to world z: the car drives toward -z.
            position={[slot.side * BILLBOARD_X, 0, -slot.at]}
            rotation={[0, -slot.side * YAW, 0]}
          >
            {[-1, 1].map((post) => (
              <mesh key={post} position={[post * w * 0.3, POST_H / 2, -0.2]}>
                <boxGeometry args={[0.3, POST_H, 0.3]} />
                <meshStandardMaterial color="#1a1426" roughness={0.6} metalness={0.5} />
              </mesh>
            ))}
            <mesh position={[0, POST_H + h / 2, -0.35]}>
              <boxGeometry args={[w + 0.3, h + 0.3, 0.25]} />
              <meshStandardMaterial color="#120c1e" roughness={0.7} />
            </mesh>
            <mesh position={[0, POST_H + h / 2, -0.2]}>
              <planeGeometry args={[w, h]} />
              {/* Lit sign: unaffected by scene light, slightly hot so the frame blooms. */}
              <meshBasicMaterial map={textures[slot.partner]} toneMapped={false} color="#e6e6e6" />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
