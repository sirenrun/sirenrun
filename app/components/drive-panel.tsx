"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { formatTokenAmount, isSessionLive } from "@sirenrun/sdk";
import { useEffect, useState } from "react";
import { bondOptions } from "../lib/bond";
import { roleOf } from "../lib/role";
import { useNow } from "../lib/use-now";
import { useWalletSigner } from "../lib/use-wallet-signer";
import { useArena } from "../stores/arena";
import { useBalance } from "../stores/balance";
import { useDrive } from "../stores/drive";
import { useSession } from "../stores/session";
import { useUi } from "../stores/ui";

/** True when the connected wallet drives the current, unfinished run. */
export function useIsDriver(): boolean {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  // Selects a string so components re-render only when the role changes, not every tick.
  return useArena((s) => roleOf(wallet, s.latest)) === "driver";
}

/** Keyboard and touch steering for the driver: ← → / A D change lanes, Space fires nitro. */
export function DriverControls() {
  const isDriver = useIsDriver();
  const { steer, nitro } = useDrive();
  // The key hint shows during the countdown and the first seconds of the run, then gets out
  // of the way of the road.
  const showHint = useArena((s) => s.status === "staging" || (s.latest?.sim.t ?? 0) < 60);

  useEffect(() => {
    if (!isDriver) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") steer(-1);
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") steer(1);
      else if (e.key === " ") nitro();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDriver, steer, nitro]);

  if (!isDriver) return null;
  return (
    <>
      {/* Touch: two half-screen zones and a nitro button. Pointer events fire on press, not release. */}
      <div className="absolute inset-0 flex [@media(pointer:fine)]:hidden">
        <button
          type="button"
          aria-label="Steer left"
          onPointerDown={() => steer(-1)}
          className="h-full flex-1"
        />
        <button
          type="button"
          aria-label="Steer right"
          onPointerDown={() => steer(1)}
          className="h-full flex-1"
        />
      </div>
      <button
        type="button"
        onPointerDown={nitro}
        className="absolute bottom-24 left-1/2 h-16 w-16 -translate-x-1/2 rounded-full border-2 border-amber bg-amber/20 font-display text-sm font-extrabold italic text-amber [@media(pointer:fine)]:hidden"
      >
        NITRO
      </button>
      <p
        className={`pointer-events-none absolute bottom-24 left-1/2 hidden -translate-x-1/2 rounded bg-black/50 px-3 py-1 text-sm text-muted transition-opacity duration-300 [@media(pointer:fine)]:block ${showHint ? "opacity-100" : "opacity-0"}`}
      >
        ← → to change lanes · Space for nitro
      </p>
    </>
  );
}

/** Shown while the channel is idle: everything needed to start a run, in order. */
export function DrivePanel() {
  const status = useArena((s) => s.status);
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const signer = useWalletSigner();
  const { session, pending, start: startSession } = useSession();
  const { config, game, location } = useBalance();
  const { start, starting, error } = useDrive();
  const setDrawer = useUi((s) => s.setDrawer);
  const now = useNow(15_000);
  const resultsOpen = useUi((s) => s.resultsOpen);
  // Null until the driver picks: then the minimum, whatever Config says it is now.
  const [picked, setPicked] = useState<bigint | null>(null);

  if (status !== "idle" || resultsOpen) return null;
  const options = config === null ? [] : bondOptions(config.bond);
  const bond = picked !== null && options.includes(picked) ? picked : (options[0] ?? null);
  const stake = config === null || bond === null ? null : config.entryFee + bond;
  const available = game?.available ?? 0n;
  const sessionLive = session !== null && isSessionLive(session, now / 1000);

  let action: React.ReactNode;
  if (publicKey === null) {
    action = (
      <button type="button" className="btn-primary w-full" onClick={() => setVisible(true)}>
        Connect wallet to drive
      </button>
    );
  } else if (stake === null) {
    action = <p className="text-sm text-muted">Loading…</p>;
  } else if (location !== "er" || available < stake) {
    action = (
      <button type="button" className="btn-primary w-full" onClick={() => setDrawer(true)}>
        Deposit {formatTokenAmount(stake)} tUSDC to drive
      </button>
    );
  } else if (!sessionLive) {
    action = (
      <button
        type="button"
        className="btn-primary w-full"
        disabled={pending || signer === null}
        onClick={() => signer !== null && void startSession(signer)}
      >
        {pending ? "Waiting for your wallet…" : "Start session to drive"}
      </button>
    );
  } else {
    action = (
      <button
        type="button"
        className="btn-primary w-full text-base"
        disabled={starting || bond === null}
        onClick={() => bond !== null && void start(bond)}
      >
        {starting ? "Starting…" : "Drive"}
      </button>
    );
  }

  return (
    <div className="absolute inset-x-4 bottom-24 mx-auto max-h-[calc(100%-7rem)] max-w-sm overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-bg/85 p-5 backdrop-blur sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">
      <h2 className="font-display text-3xl font-extrabold italic">Take the wheel</h2>
      <p className="mt-1 text-sm text-muted">
        Outrun the police for as long as you can. Spectators trade on whether you pass 30, 60 and 90
        seconds.
      </p>
      {config !== null && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[11px] font-semibold tracking-widest text-up uppercase">
                You earn
              </p>
              <p className="mt-0.5 tabular-nums">{config.runnerFeeBps / 100}% of every trade</p>
              <p>Half of what BUST loses on lines you pass</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-widest text-down uppercase">
                You pay
              </p>
              <p className="mt-0.5 tabular-nums">{formatTokenAmount(config.entryFee)} entry</p>
              <p className="tabular-nums">{formatTokenAmount(config.nitroFee)} per nitro used</p>
            </div>
          </div>
          <div className="mt-3">
            <p className="text-sm">Your bond, held during the run and returned after it</p>
            <div className="mt-1.5 flex gap-2" role="radiogroup" aria-label="Bond">
              {options.map((b) => (
                <button
                  key={b.toString()}
                  type="button"
                  role="radio"
                  aria-checked={bond === b}
                  onClick={() => setPicked(b)}
                  className={`flex-1 rounded-md border py-1.5 text-sm font-semibold tabular-nums ${
                    bond === b
                      ? "border-white/60 bg-white/10"
                      : "border-white/15 text-muted hover:border-white/35"
                  }`}
                >
                  {formatTokenAmount(b)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              A bigger bond leaves more room for BUST bets, so more trades and more fees for you,
              and puts more at risk if you get busted.
            </p>
          </div>
          <details className="mt-1 text-xs text-muted">
            <summary className="cursor-pointer select-none hover:text-text">
              How the bond works
            </summary>
            <p className="mt-1">
              If you get busted, the bond pays what BUST bets won on the lines you missed, never
              more. That goes to fans who bet RIDE on those lines, or to the house if there were
              none; the rest comes back. If nobody bet against you, you lose nothing. This stops a
              driver from betting BUST and crashing on purpose.
            </p>
          </details>
        </>
      )}
      <div className="mt-4">{action}</div>
      {error !== null && (
        <p className="mt-2 text-sm text-amber" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
