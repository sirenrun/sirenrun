"use client";

import { GAP_MAX, LINES, NITRO_CHARGES } from "@sirenrun/sim";
import { useEffect, useRef, useState } from "react";
import type { Market } from "@sirenrun/sdk";
import { useArena } from "../stores/arena";
import { frame } from "./frame";
import {
  RAIL_END,
  formatClock,
  gapFill,
  gapLevel,
  heatSegments,
  lineLabel,
  newlyCrossed,
  railPosition,
  stagingSecondsLeft,
} from "./hud-model";

const GAP_COLOURS = {
  safe: "var(--color-neon-cyan)",
  warn: "var(--color-amber)",
  danger: "var(--color-police-red)",
} as const;

const shortKey = (key: string) => `${key.slice(0, 4)}…${key.slice(-4)}`;

/**
 * Run HUD. React lays it out once; a requestAnimationFrame loop then writes the numbers and
 * bars straight to the DOM from the same frame state the 3D scene draws, so the timer and the
 * gap meter move at display rate without re-rendering anything.
 */
export function Hud({ channel }: { channel: number }) {
  const status = useArena((s) => s.status);
  const runner = useArena((s) => (s.latest?.nonce ? s.latest.runner.toBase58() : null));
  const timeRef = useRef<HTMLSpanElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const gapRef = useRef<HTMLDivElement>(null);
  const gapBarRef = useRef<HTMLDivElement>(null);
  const gapTextRef = useRef<HTMLSpanElement>(null);
  const heatRef = useRef<HTMLDivElement>(null);
  const nitroRef = useRef<HTMLDivElement>(null);
  const countdownRef = useRef<HTMLDivElement>(null);
  const courseRef = useRef<HTMLParagraphElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const stampRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    let raf = 0;
    let lastCountdown = -1;
    let lastMarkets: Market[] | null = null;
    let lastNonce = -1;
    let stamped = false;
    let lastLevel = "";

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const latest = useArena.getState().latest;
      if (latest === null) return;
      if (latest.nonce !== lastNonce) {
        lastNonce = latest.nonce;
        lastMarkets = null;
        stamped = false;
        stampRef.current?.classList.add("hidden");
      }
      const live = latest.status === "live" || latest.status === "settled";
      const tick = live && frame.ready ? frame.tick : latest.sim.t;
      const gap = live && frame.ready ? frame.policeGap : latest.sim.policeGap;

      if (timeRef.current) timeRef.current.textContent = formatClock(tick);
      if (railRef.current) railRef.current.style.transform = `scaleX(${railPosition(tick)})`;

      const level = gapLevel(gap);
      if (gapBarRef.current) {
        gapBarRef.current.style.transform = `scaleX(${gapFill(gap)})`;
        gapBarRef.current.style.backgroundColor = GAP_COLOURS[level];
      }
      if (gapTextRef.current) gapTextRef.current.textContent = String(Math.max(0, Math.round(gap)));
      if (level !== lastLevel && gapRef.current) {
        gapRef.current.classList.toggle(
          "hud-danger",
          level === "danger" && latest.status === "live",
        );
        lastLevel = level;
      }

      const heat = heatSegments(tick);
      heatRef.current?.childNodes.forEach((node, i) => {
        const el = node as HTMLElement;
        el.dataset.on = String(i < heat);
      });
      nitroRef.current?.childNodes.forEach((node, i) => {
        const el = node as HTMLElement;
        el.dataset.on = String(i < latest.sim.nitroLeft);
        el.dataset.active = String(frame.nitro && i === latest.sim.nitroLeft);
      });

      // Staging countdown, pulsing once per second.
      if (latest.status === "staging") {
        const left = stagingSecondsLeft(latest.phaseTicks);
        if (left !== lastCountdown && countdownRef.current) {
          lastCountdown = left;
          const el = countdownRef.current;
          el.textContent = left > 0 ? String(left) : "GO";
          el.classList.remove("hud-pulse");
          void el.offsetWidth; // restart the animation
          el.classList.add("hud-pulse");
        }
        if (courseRef.current) {
          courseRef.current.textContent = latest.seedReady
            ? `Course locked ✓ ${latest.seed.toString(16).padStart(16, "0").slice(0, 8)}`
            : "Rolling the course… (VRF)";
        }
      } else {
        lastCountdown = -1;
      }

      // Line markers and the crossed flash.
      latest.markets.forEach((m, i) => {
        const marker = linesRef.current?.children[i] as HTMLElement | undefined;
        if (marker) marker.dataset.status = m.status;
      });
      const crossed = newlyCrossed(lastMarkets, latest.markets);
      lastMarkets = latest.markets;
      const line =
        crossed.length > 0 ? latest.markets[crossed[crossed.length - 1] as number] : undefined;
      if (line !== undefined && bannerRef.current) {
        const el = bannerRef.current;
        el.textContent = `${lineLabel(line.line)} ✓  RIDE pays`;
        el.classList.remove("hidden", "hud-banner-in");
        void el.offsetWidth;
        el.classList.add("hud-banner-in");
        setAnnouncement(`${lineLabel(line.line)} line crossed. RIDE pays.`);
      }

      // BUSTED stamp with the final time.
      if (!stamped && latest.sim.busted && latest.status === "settled" && stampRef.current) {
        stamped = true;
        const el = stampRef.current;
        const final = formatClock(latest.sim.t);
        (el.lastElementChild as HTMLElement).textContent = final;
        el.classList.remove("hidden");
        setAnnouncement(`Busted at ${final}.`);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const playing = status === "live" || status === "settled";
  return (
    <div className="pointer-events-none absolute inset-0 select-none font-display">
      {/* Top left: clock and line rail */}
      <div className="absolute left-4 top-14 sm:left-6 sm:top-16">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Time</div>
        <span
          ref={timeRef}
          className="block text-5xl font-extrabold italic leading-none tabular-nums sm:text-6xl"
        >
          0:00.0
        </span>
        <div className="relative mt-3 h-1.5 w-56 rounded-full bg-white/10 sm:w-72">
          <div
            ref={railRef}
            className="h-full origin-left rounded-full bg-text/70"
            style={{ transform: "scaleX(0)" }}
          />
          <div ref={linesRef} className="absolute inset-0">
            {LINES.map((line) => (
              <div
                key={line}
                data-status="open"
                className="group absolute -top-1 -translate-x-1/2"
                style={{ left: `${(line / RAIL_END) * 100}%` }}
              >
                <div className="h-3.5 w-0.5 bg-text/60 group-data-[status=no]:bg-police-red group-data-[status=yes]:bg-neon-pink group-data-[status=void]:bg-muted" />
                <div className="mt-1 -translate-x-1/3 text-xs font-semibold text-muted group-data-[status=yes]:text-neon-pink group-data-[status=no]:text-police-red">
                  {lineLabel(line)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top right: heat */}
      <div className="absolute right-4 top-14 text-right sm:right-6 sm:top-16">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Heat</div>
        <div ref={heatRef} className="mt-1 flex gap-1" aria-hidden>
          {Array.from({ length: 5 }, (_, i) => (
            <span
              key={i}
              data-on="false"
              className={`h-4 w-3 skew-x-[-12deg] rounded-sm bg-white/10 transition-colors duration-150 ${
                i % 2 === 0 ? "data-[on=true]:bg-police-red" : "data-[on=true]:bg-police-blue"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Bottom left: gap meter and nitro */}
      <div
        className={`absolute bottom-5 left-4 right-4 sm:right-auto sm:left-6 ${playing ? "" : "opacity-40"}`}
      >
        <div className="flex items-baseline justify-between gap-6 sm:w-[28rem]">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Gap</span>
          <span ref={gapTextRef} className="text-2xl font-extrabold italic tabular-nums">
            {GAP_MAX}
          </span>
        </div>
        <div ref={gapRef} className="mt-1 h-3 overflow-hidden rounded-sm bg-white/10 sm:w-[28rem]">
          <div ref={gapBarRef} className="h-full origin-left bg-neon-cyan" />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Nitro</span>
          <div ref={nitroRef} className="flex gap-1.5" aria-hidden>
            {Array.from({ length: NITRO_CHARGES }, (_, i) => (
              <span
                key={i}
                data-on="true"
                data-active="false"
                className="h-3 w-3 rounded-full border border-amber/60 data-[on=true]:bg-amber data-[active=true]:bg-amber/40 data-[active=true]:shadow-[0_0_12px_var(--color-amber)]"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom right: channel and driver */}
      <div className="absolute bottom-5 right-6 hidden text-sm font-semibold text-muted sm:block">
        CH-{channel + 1}
        {runner !== null && <> · {shortKey(runner)}</>}
      </div>

      {/* Centre: staging countdown */}
      {status === "staging" && (
        <div className="absolute inset-x-0 top-[28%] flex flex-col items-center text-center">
          <div
            ref={countdownRef}
            className="text-8xl font-extrabold italic text-text drop-shadow-[0_0_24px_rgba(255,46,136,0.45)]"
          >
            10
          </div>
          <p ref={courseRef} className="mt-2 font-sans text-sm text-muted">
            Rolling the course… (VRF)
          </p>
        </div>
      )}

      {/* Centre: line crossed banner */}
      <div
        ref={bannerRef}
        className="absolute inset-x-0 top-[22%] mx-auto hidden w-fit rounded-md bg-neon-pink/90 px-6 py-2 text-3xl font-extrabold italic text-white"
      />

      {/* Centre: BUSTED stamp */}
      <div
        ref={stampRef}
        className="hud-stamp-in absolute inset-x-0 top-[30%] mx-auto hidden w-fit text-center"
      >
        <div className="-rotate-[8deg] rounded-lg border-4 border-police-red px-8 py-2 text-7xl font-extrabold italic tracking-wide text-police-red drop-shadow-[0_0_30px_rgba(255,59,59,0.5)]">
          BUSTED
        </div>
        <div className="mt-3 text-3xl font-extrabold italic tabular-nums">0:00.0</div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
