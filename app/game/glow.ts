import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";

let cached: CanvasTexture | null = null;

/**
 * A soft radial gradient used for additive halos around lights (lamps, tail lights, police
 * bars). It stands in for a bloom pass: cheap, and it reads as neon glow.
 */
export function glowTexture(): CanvasTexture {
  if (cached !== null) return cached;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.2, "rgba(255,255,255,0.55)");
    g.addColorStop(0.5, "rgba(255,255,255,0.12)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  cached = new CanvasTexture(canvas);
  cached.colorSpace = SRGBColorSpace;
  cached.minFilter = LinearFilter;
  return cached;
}
