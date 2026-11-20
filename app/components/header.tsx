"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { formatTokenAmount, isSessionLive, type WalletSigner } from "@sirenrun/sdk";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sessionMinutesLeft } from "../lib/game-balance";
import { useBalance } from "../stores/balance";
import { useSession } from "../stores/session";

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Keeps the balance store following the connected wallet and drops the session on disconnect. */
function useWalletSync() {
  const { publicKey } = useWallet();
  const watch = useBalance((s) => s.watch);
  const reset = useBalance((s) => s.reset);
  const clearSession = useSession((s) => s.clear);
  const key = publicKey?.toBase58();
  useEffect(() => {
    if (publicKey === null) {
      reset();
      clearSession();
      return;
    }
    return watch(publicKey);
    // `key` identifies the wallet; the PublicKey object can change identity between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, watch, reset, clearSession]);
}

function Faucet() {
  const { publicKey } = useWallet();
  const refresh = useBalance((s) => s.refresh);
  const [state, setState] = useState<{ busy: boolean; note: string | null }>({
    busy: false,
    note: null,
  });
  if (publicKey === null) return null;

  const claim = async () => {
    setState({ busy: true, note: null });
    try {
      const response = await fetch("/api/faucet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: publicKey.toBase58() }),
      });
      const body = (await response.json()) as { error?: string };
      setState({
        busy: false,
        note: response.ok ? "100 tUSDC sent" : (body.error ?? "faucet failed"),
      });
      if (response.ok) await refresh();
    } catch {
      setState({ busy: false, note: "faucet unreachable" });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void claim()}
        disabled={state.busy}
        className="rounded-md border border-neon-cyan/40 px-3 py-1.5 text-sm text-neon-cyan transition-colors hover:bg-neon-cyan/10 disabled:opacity-50"
      >
        {state.busy ? "Sending…" : "Get test USDC"}
      </button>
      {state.note !== null && <span className="text-xs text-muted">{state.note}</span>}
    </div>
  );
}

function SessionPill() {
  const wallet = useWallet();
  const { session, pending, error, start } = useSession();
  const now = useNow(30_000);
  if (wallet.publicKey === null) return null;

  if (session !== null && isSessionLive(session, now / 1000)) {
    return (
      <span className="rounded-full bg-neon-pink/15 px-3 py-1 text-xs font-medium text-neon-pink">
        Session active · {sessionMinutesLeft(session.validUntil, now)} min
      </span>
    );
  }
  const signer: WalletSigner | null =
    wallet.signTransaction === undefined
      ? null
      : { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction };
  return (
    <button
      type="button"
      disabled={pending || signer === null}
      onClick={() => signer !== null && void start(signer)}
      title={error ?? "One signature; no more wallet popups for an hour"}
      className="rounded-full border border-muted/40 px-3 py-1 text-xs text-muted transition-colors hover:text-text disabled:opacity-50"
    >
      {pending ? "Signing…" : error !== null ? "Session failed · retry" : "Start session"}
    </button>
  );
}

function GameBalance() {
  const { publicKey } = useWallet();
  const { game, walletTokens, location, loaded } = useBalance();
  if (publicKey === null) return null;
  if (!loaded) return <span className="text-sm text-muted">Loading…</span>;
  return (
    <div className="text-right leading-tight">
      <div className="text-sm font-semibold tabular-nums">
        {formatTokenAmount(game?.available ?? 0n)} <span className="text-muted">tUSDC</span>
      </div>
      <div className="text-xs text-muted tabular-nums">
        {location === "er" ? "in game" : location === "base" ? "on Solana" : "no game balance"} ·
        wallet {formatTokenAmount(walletTokens)}
      </div>
    </div>
  );
}

export function Header() {
  useWalletSync();
  return (
    <header className="flex items-center justify-between gap-4 border-b border-white/5 px-4 py-3 sm:px-6">
      <Link href="/" aria-label="SIRENRUN home" className="shrink-0">
        <Image
          src="/logo.svg"
          alt="SIRENRUN"
          width={140}
          height={40}
          unoptimized
          className="h-8 w-auto"
        />
      </Link>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Faucet />
        <SessionPill />
        <GameBalance />
        <WalletMultiButton />
      </div>
    </header>
  );
}
