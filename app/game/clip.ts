"use client";

import { ClipSchedule, pickMimeType, type Recording } from "./clip-schedule";
import { formatClock, gapFill } from "./hud-model";

/** What the clip overlay shows, read from the frame and the arena each drawn frame. */
export interface ClipOverlay {
  tick: number;
  gap: number;
  busted: boolean;
  channel: string;
  /** One chip per line: "30s 82%", "30s RIDE ✓", … */
  lines: string[];
}

// Two encoders run at once (see ClipSchedule), on the CPU in most browsers, next to the game.
// 960 px at 24 fps and 2.5 Mbps keeps that cheap enough for a normal laptop and still reads
// fine as a shared clip.
const MAX_WIDTH = 960;
const FPS = 24;
const BITRATE = 2_500_000;

function record(stream: MediaStream, mime: string, now: number): Recording {
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: BITRATE });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(1000);
  return {
    startedAt: now,
    finish: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
        if (recorder.state === "inactive") resolve(new Blob(chunks, { type: mime }));
        else recorder.stop();
      }),
    discard: () => {
      recorder.ondataavailable = null;
      if (recorder.state !== "inactive") recorder.stop();
    },
  };
}

/**
 * Records the scene with a HUD overlay burned in, keeping the last 10 to 20 seconds ready to
 * save. The WebGL canvas is copied onto a 2D canvas right after each render (the drawing buffer
 * is only valid then), the overlay is drawn on top, and that canvas is what gets recorded.
 */
export class ClipRecorder {
  private readonly canvas = document.createElement("canvas");
  private readonly ctx: CanvasRenderingContext2D;
  private readonly stream: MediaStream;
  private readonly schedule: ClipSchedule;
  private readonly font: string;
  private lastDraw = 0;

  static supported(): boolean {
    return (
      typeof MediaRecorder !== "undefined" &&
      typeof HTMLCanvasElement.prototype.captureStream === "function" &&
      pickMimeType((t) => MediaRecorder.isTypeSupported(t)) !== null
    );
  }

  private readonly source: HTMLCanvasElement;

  constructor(source: HTMLCanvasElement) {
    this.source = source;
    const ctx = this.canvas.getContext("2d");
    const mime = pickMimeType((t) => MediaRecorder.isTypeSupported(t));
    if (ctx === null || mime === null) throw new Error("clip recording is not supported here");
    this.ctx = ctx;
    this.resize();
    this.stream = this.canvas.captureStream(FPS);
    this.schedule = new ClipSchedule((now) => record(this.stream, mime, now));
    // The display face next/font registered, so the overlay matches the HUD.
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-barlow");
    this.font = family.trim() || "sans-serif";
  }

  /** Copies the frame just rendered and draws the overlay; call right after the scene renders. */
  draw(overlay: ClipOverlay, now: number): void {
    this.schedule.tick(now);
    if (now - this.lastDraw < 1000 / FPS - 2) return;
    this.lastDraw = now;
    this.resize();
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.drawImage(this.source, 0, 0, w, h);
    const u = w / 1280;
    const display = (size: number) => `italic 800 ${Math.round(size * u)}px ${this.font}`;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 8 * u;
    ctx.fillStyle = "#edeaf7";
    ctx.textBaseline = "top";
    ctx.font = display(64);
    ctx.fillText(formatClock(overlay.tick), 28 * u, 24 * u);

    ctx.textAlign = "right";
    ctx.font = display(30);
    ctx.fillText("SIRENRUN", w - 28 * u, 26 * u);
    ctx.font = `600 ${Math.round(16 * u)}px ${this.font}`;
    ctx.fillStyle = "#8c86a6";
    ctx.fillText(overlay.channel, w - 28 * u, 62 * u);

    // Gap meter along the bottom left.
    const fill = gapFill(overlay.gap);
    const barW = 420 * u;
    const barY = h - 44 * u;
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(28 * u, barY, barW, 12 * u);
    ctx.fillStyle = fill > 0.55 ? "#22e1ff" : fill > 0.2 ? "#ffb020" : "#ff3b3b";
    ctx.fillRect(28 * u, barY, barW * fill, 12 * u);
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "#8c86a6";
    ctx.font = `600 ${Math.round(14 * u)}px ${this.font}`;
    ctx.fillText(`GAP ${Math.max(0, Math.round(overlay.gap))}`, 28 * u, barY - 6 * u);

    // Line chips along the bottom right.
    ctx.textAlign = "right";
    ctx.fillStyle = "#edeaf7";
    ctx.font = display(22);
    ctx.fillText(overlay.lines.join("   "), w - 28 * u, h - 30 * u);

    if (overlay.busted) {
      ctx.translate(w / 2, h * 0.38);
      ctx.rotate(-0.14);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = display(110);
      ctx.fillStyle = "#ff3b3b";
      ctx.fillText("BUSTED", 0, 0);
    }
    ctx.restore();
  }

  /** The clip so far (10 to 20 s), or null if recording has not started. */
  take(): Promise<Blob> | null {
    return this.schedule.take();
  }

  dispose(): void {
    this.schedule.clear();
    for (const track of this.stream.getTracks()) track.stop();
  }

  private resize(): void {
    const scale = Math.min(1, MAX_WIDTH / Math.max(1, this.source.width));
    // Encoders want even dimensions.
    const w = Math.max(2, Math.round((this.source.width * scale) / 2) * 2);
    const h = Math.max(2, Math.round((this.source.height * scale) / 2) * 2);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }
}
