"use client";

import { priceYes } from "@sirenrun/sdk";
import Link from "next/link";
import { useEffect } from "react";
import { channelStatus } from "../lib/lobby";
import { lineSeconds, percent } from "../lib/markets";
import { shortAddress } from "../lib/results";
import { useNow } from "../lib/use-now";
import { useLobby } from "../stores/lobby";

const TONE = {
  idle: "text-muted",
  staging: "text-amber",
  live: "text-neon-pink",
  over: "text-police-red",
} as const;

function gapColour(fill: number): string {
  return fill > 0.6 ? "bg-neon-cyan" : fill > 0.3 ? "bg-amber" : "bg-police-red";
}

/** The three channels with live status, driver, gap and line prices. */
export function Lobby() {
  const watch = useLobby((s) => s.watch);
  const error = useLobby((s) => s.error);
  // Arena feeds tick ten times a second; the cards only need a few redraws.
  useNow(250);
  const arenas = useLobby.getState().arenas;

  useEffect(() => watch(), [watch]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-extrabold italic">Channels</h1>
      <p className="mt-1 text-muted">
        Drive an idle channel, or watch and trade a run in progress.
      </p>
      {error !== null && (
        <p className="mt-4 text-sm text-amber" role="alert">
          Connection problem: {error}
        </p>
      )}
      <ul className="mt-8 grid gap-4 sm:grid-cols-3">
        {arenas.map((arena, id) => {
          const status = channelStatus(arena);
          const running = arena !== null && arena.status !== "idle";
          return (
            <li
              key={id}
              className="flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-5 transition-[border-color,box-shadow,translate] duration-200 ease-[var(--ease-ui)] hover:-translate-y-0.5 hover:border-white/20 hover:shadow-[0_12px_32px_-16px_rgb(255_46_136/0.45)]"
            >
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-2xl font-extrabold italic">CH-{id + 1}</h2>
                <span className={`text-sm font-semibold tabular-nums ${TONE[status.tone]}`}>
                  {status.label}
                  {status.detail !== "" && (
                    <span className="ml-1 font-normal">{status.detail}</span>
                  )}
                </span>
              </div>
              <p className="mt-1 h-5 text-sm text-muted">
                {running && arena.nonce > 0
                  ? `Driver ${shortAddress(arena.runner.toBase58())}`
                  : "No driver"}
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
                {status.gap !== null && (
                  <div
                    className={`h-full origin-left transition-transform duration-200 ${gapColour(status.gap)}`}
                    style={{ transform: `scaleX(${status.gap})` }}
                  />
                )}
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                {(arena?.markets ?? []).map((m, i) => (
                  <div key={i} className="rounded-md bg-white/[0.04] py-1.5">
                    <dt className="text-xs text-muted">{lineSeconds(m.line)}s</dt>
                    <dd className="font-semibold tabular-nums">
                      {!running
                        ? "–"
                        : m.status === "open"
                          ? percent(priceYes(m.yesR, m.noR))
                          : m.status === "yes"
                            ? "RIDE ✓"
                            : m.status === "no"
                              ? "BUST ✓"
                              : "void"}
                    </dd>
                  </div>
                ))}
              </dl>
              <Link
                href={`/c/${id + 1}`}
                className={`mt-5 rounded-md py-2 text-center text-sm font-semibold ${
                  status.action === "Drive"
                    ? "btn-glow bg-neon-pink text-white hover:bg-[#e0267a]"
                    : "border border-white/25 hover:border-white/50 hover:bg-white/5"
                }`}
              >
                {status.action}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 text-xs text-muted">
        Open lines show the RIDE price: the market&apos;s chance the driver makes it. Settled
        positions on any channel are claimed for you while this page is open.
      </p>
    </main>
  );
}
