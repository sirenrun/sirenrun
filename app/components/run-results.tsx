"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { formatTokenAmount, type PositionEntry } from "@sirenrun/sdk";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatClock } from "../game/hud-model";
import { rememberPositions, summarizeRun, type RunSummary } from "../lib/results";
import { useArena } from "../stores/arena";
import { useBalance } from "../stores/balance";
import { useUi } from "../stores/ui";
import { SaveClip } from "./save-clip";

const signed = (v: bigint) => `${v > 0n ? "+" : ""}${formatTokenAmount(v)}`;
const toneOf = (v: bigint) =>
  v > 0n ? "text-neon-pink" : v < 0n ? "text-police-red" : "text-muted";

/**
 * The results card after a run: lines passed, the driver's take and the viewer's P/L. It stays
 * up after the channel goes idle, until it is closed or the next run starts.
 */
export function RunResults() {
  const { publicKey } = useWallet();
  const status = useArena((s) => s.status);
  const nonce = useArena((s) => s.nonce);
  const setResultsOpen = useUi((s) => s.setResultsOpen);
  const ensureConfig = useBalance((s) => s.ensureConfig);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const kept = useRef<PositionEntry[]>([]);

  useEffect(() => void ensureConfig(), [ensureConfig]);

  // Remember the viewer's positions while the run is on: claims at the end empty their slots.
  useEffect(() => {
    const remember = () => {
      const latest = useArena.getState().latest;
      const game = useBalance.getState().game;
      if (latest === null || game === null) return;
      if (latest.status !== "staging" && latest.status !== "live") return;
      kept.current = rememberPositions(kept.current, game.entries, latest.id, latest.nonce);
    };
    remember();
    const stopArena = useArena.subscribe(remember);
    const stopBalance = useBalance.subscribe(remember);
    return () => {
      stopArena();
      stopBalance();
    };
  }, []);

  const config = useBalance((s) => s.config);
  useEffect(() => {
    const latest = useArena.getState().latest;
    if (status === "settled" && latest !== null && config !== null) {
      setSummary(summarizeRun(latest, kept.current, config));
    } else if (status === "staging") {
      setSummary(null);
    }
  }, [status, nonce, config]);

  useEffect(() => setResultsOpen(summary !== null), [summary, setResultsOpen]);

  if (summary === null) return null;
  const driving =
    publicKey !== null && useArena.getState().latest?.runner.equals(publicKey) === true;
  return (
    <div className="absolute inset-x-4 bottom-20 z-10 mx-auto max-w-md rounded-xl border border-white/10 bg-bg/90 p-5 backdrop-blur">
      <h2 className="font-display text-3xl font-extrabold italic">
        {summary.aborted ? "Run void" : `Busted at ${formatClock(summary.t)}`}
      </h2>
      {summary.aborted && (
        <p className="mt-1 text-sm text-muted">
          The course seed never arrived. Everything was refunded.
        </p>
      )}
      <ul className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
        {summary.lines.map((l) => (
          <li key={l.seconds} className="rounded-md bg-white/[0.04] py-1.5">
            <span className="block text-xs text-muted">{l.seconds}s</span>
            <span
              className={`font-semibold ${l.status === "yes" ? "text-neon-pink" : l.status === "no" ? "text-neon-cyan" : "text-muted"}`}
            >
              {l.status === "yes" ? "RIDE ✓" : l.status === "no" ? "BUST ✓" : "void"}
            </span>
          </li>
        ))}
      </ul>
      {!summary.aborted && (
        <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">
            {driving ? "You drove" : `Driver ${summary.driver.address}`}
          </dt>
          <dd className={`text-right font-semibold tabular-nums ${toneOf(summary.driver.net)}`}>
            {signed(summary.driver.net)} tUSDC
          </dd>
          <dt className="col-span-2 text-xs text-muted">
            Earned {formatTokenAmount(summary.driver.fees)} in trading fees; bond{" "}
            {summary.driver.bondBack ? "returned (passed 90 s)" : "lost"}.
          </dt>
          {summary.you !== null && (
            <>
              <dt className="mt-2 text-muted">Your trades</dt>
              <dd
                className={`mt-2 text-right font-semibold tabular-nums ${toneOf(summary.you.pnl)}`}
              >
                {signed(summary.you.pnl)} tUSDC
              </dd>
              <dt className="col-span-2 text-xs text-muted">
                Spent {formatTokenAmount(summary.you.spent)}, paid out{" "}
                {formatTokenAmount(summary.you.paid)} (claimed automatically).
              </dt>
            </>
          )}
        </dl>
      )}
      <div className="mt-5 flex gap-2">
        <Link
          href="/lobby"
          className="flex-1 rounded-md border border-white/25 py-2 text-center text-sm font-semibold hover:border-white/50"
        >
          Watch next
        </Link>
        <SaveClip className="flex-1 rounded-md border border-white/25 py-2 text-center text-sm font-semibold hover:border-white/50" />
        <button type="button" className="btn-primary flex-1" onClick={() => setSummary(null)}>
          Close
        </button>
      </div>
    </div>
  );
}
