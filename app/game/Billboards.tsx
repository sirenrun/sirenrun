"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, SRGBColorSpace, type Group } from "three";
import {
  BILLBOARD_SPAN,
  PANEL_H,
  PANEL_W,
  PARTNER_FRAME,
  PARTNER_LOGOS,
  billboardLayout,
  type Partner,
} from "./billboards";
import { frame } from "./frame";
import { BILLBOARD_X } from "./layout";
import { recycledZ } from "./recycle";
import { worldZ } from "./world";

const TEX_W = 1024;
const TEX_H = Math.round((TEX_W * PANEL_H) / PANEL_W);
const POST_H = 6;
/** Panels turn toward the road so the driver reads them on approach, not edge-on. */
const YAW = 0.42;

/** A dark lit panel with a neon frame; the logo is drawn in once its SVG has loaded. */
function panelTexture(partner: Partner): CanvasTexture {
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
    if (logo !== null && logo.naturalWidth > 0) {
      // Fit the logo inside the frame with margin, keeping its aspect.
      const maxW = TEX_W * 0.78;
      const maxH = TEX_H * 0.5;
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
    () => ({ solana: panelTexture("solana"), magicblock: panelTexture("magicblock") }),
    [],
  );
  useEffect(
    () => () => {
      textures.solana.dispose();
      textures.magicblock.dispose();
    },
    [textures],
  );
  const groups = useRef<(Group | null)[]>([]);

  useFrame(() => {
    const carZ = worldZ(frame.distance);
    slots.forEach((slot, i) => {
      const g = groups.current[i];
      if (g === null || g === undefined) return;
      g.position.z = recycledZ(slot.offset, carZ, BILLBOARD_SPAN, 30);
    });
  });

  return (
    <>
      {slots.map((slot, i) => (
        <group
          key={i}
          ref={(g) => {
            groups.current[i] = g;
          }}
          position={[slot.side * BILLBOARD_X, 0, 0]}
          rotation={[0, -slot.side * YAW, 0]}
        >
          {[-1, 1].map((post) => (
            <mesh key={post} position={[post * PANEL_W * 0.3, POST_H / 2, -0.2]}>
              <boxGeometry args={[0.3, POST_H, 0.3]} />
              <meshStandardMaterial color="#1a1426" roughness={0.6} metalness={0.5} />
            </mesh>
          ))}
          <mesh position={[0, POST_H + PANEL_H / 2, -0.35]}>
            <boxGeometry args={[PANEL_W + 0.3, PANEL_H + 0.3, 0.25]} />
            <meshStandardMaterial color="#120c1e" roughness={0.7} />
          </mesh>
          <mesh position={[0, POST_H + PANEL_H / 2, -0.2]}>
            <planeGeometry args={[PANEL_W, PANEL_H]} />
            {/* Lit sign: unaffected by scene light, slightly hot so the frame blooms. */}
            <meshBasicMaterial map={textures[slot.partner]} toneMapped={false} color="#e6e6e6" />
          </mesh>
        </group>
      ))}
    </>
  );
}
