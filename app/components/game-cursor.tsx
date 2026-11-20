"use client";

import { useEffect, useRef, useState } from "react";
import { cursorMode, ringSettled, stepRing, type CursorMode, type Ring } from "../lib/cursor";

/**
 * A glowing ring that trails the pointer on a spring, grows over anything clickable and
 * squeezes on press. The reticle itself is the native CSS cursor (globals.css), so aiming never
 * lags; the ring only adds weight. Mouse only, and skipped under reduced motion.
 *
 * Moves with one transform per frame and no React renders; the loop sleeps once the ring has
 * caught up.
 */
export function GameCursor() {
  const [enabled, setEnabled] = useState(false);
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(fine.matches && !reduced.matches);
    update();
    fine.addEventListener("change", update);
    reduced.addEventListener("change", update);
    return () => {
      fine.removeEventListener("change", update);
      reduced.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!enabled || o === null || i === null) return;

    const ring: Ring = { x: 0, y: 0, vx: 0, vy: 0 };
    let tx = 0;
    let ty = 0;
    let seen = false;
    let mode: CursorMode = "default";
    let raf = 0;
    let last = 0;

    const draw = () => {
      o.style.transform = `translate3d(${ring.x}px, ${ring.y}px, 0)`;
    };
    const frame = (now: number) => {
      const dt = last === 0 ? 1 / 60 : (now - last) / 1000;
      last = now;
      stepRing(ring, tx, ty, dt);
      draw();
      if (ringSettled(ring, tx, ty)) {
        raf = 0;
        last = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    const wake = () => {
      if (raf === 0) raf = requestAnimationFrame(frame);
    };
    const setMode = (next: CursorMode) => {
      if (next === mode) return;
      mode = next;
      i.dataset.mode = next;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      tx = e.clientX;
      ty = e.clientY;
      if (!seen) {
        // First sighting: appear on the pointer rather than flying in from the corner.
        seen = true;
        ring.x = tx;
        ring.y = ty;
        draw();
        o.dataset.visible = "true";
      }
      const target = e.target instanceof Element ? e.target : null;
      setMode(cursorMode((sel) => target?.closest(sel) != null));
      wake();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") i.dataset.down = "true";
    };
    const onUp = () => delete i.dataset.down;
    const onLeave = () => {
      seen = false;
      delete o.dataset.visible;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div ref={outer} className="game-cursor" aria-hidden="true">
      <div ref={inner} className="game-cursor-ring" data-mode="default" />
    </div>
  );
}
