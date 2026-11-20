"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { formatTokenAmount, isSessionLive } from "@sirenrun/sdk";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { sessionMinutesLeft } from "../lib/game-balance";
import { useNow } from "../lib/use-now";
import { useWalletSigner } from "../lib/use-wallet-signer";
import { useBalance } from "../stores/balance";
import { useSession } from "../stores/session";
import { useUi } from "../stores/ui";
import { FaucetButton } from "./faucet-button";
import { Onboarding } from "./onboarding";
import { WalletDrawer } from "./wallet-drawer";

/** Keeps the balance store following the connected wallet and drops the session on disconnect. */
function useWalletSync() {
  const { publicKey } = useWallet();
  const watch = useBalance((s) => s.watch);
  const reset = useBalance((s) => s.reset);
  const clearSession = useSession((s) => s.clear);
  const restoreSession = useSession((s) => s.restore);
  const key = publicKey?.toBase58();
  useEffect(() => {
    if (publicKey === null) {
      reset();
      clearSession();
      return;
    }
    restoreSession(publicKey);
    return watch(publicKey);
    // `key` identifies the wallet; the PublicKey object can change identity between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, watch, reset, clearSession, restoreSession]);
}

/**
 * The wallet button's label depends on the remembered wallet, which only the browser knows,
 * so it renders on the client only. The placeholder has the same size to avoid layout shift.
 */
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  {
    ssr: false,
    loading: () => <div className="h-9 w-36 rounded-lg bg-neon-pink/20" aria-hidden />,
  },
);

function SessionPill() {
  const signer = useWalletSigner();
  const { session, pending, error, start } = useSession();
  const now = useNow(30_000);
  if (signer === null) return null;

  if (session !== null && isSessionLive(session, now / 1000)) {
    return (
      <span className="rounded-full bg-neon-pink/15 px-3 py-1 text-xs font-medium text-neon-pink">
        Session active · {sessionMinutesLeft(session.validUntil, now)} min
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => void start(signer)}
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
  const setDrawer = useUi((s) => s.setDrawer);
  if (publicKey === null) return null;
  if (!loaded) return <span className="text-sm text-muted">Loading…</span>;
  return (
    <button
      type="button"
      onClick={() => setDrawer(true)}
      className="rounded-md px-2 py-1 text-right leading-tight transition-colors hover:bg-white/5"
    >
      <span className="block text-sm font-semibold tabular-nums">
        {formatTokenAmount(game?.available ?? 0n)} <span className="text-muted">tUSDC</span>
      </span>
      <span className="block text-xs text-muted tabular-nums">
        {location === "er" ? "in game" : location === "base" ? "on Solana" : "no game balance"} ·
        wallet {formatTokenAmount(walletTokens)}
      </span>
    </button>
  );
}

export function Header() {
  useWalletSync();
  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-white/5 px-4 py-3 sm:px-6">
        <Link href="/" aria-label="SIRENRUN home" className="shrink-0">
          <Image
            src="/logo.svg"
            alt="SIRENRUN"
            width={140}
            height={40}
            unoptimized
            priority
            className="h-8 w-auto"
          />
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link
            href="/lobby"
            className="text-sm font-semibold text-muted transition-colors hover:text-text"
          >
            Channels
          </Link>
          <FaucetButton className="hidden sm:flex" />
          <SessionPill />
          <GameBalance />
          <WalletMultiButton />
        </div>
      </header>
      <Onboarding />
      <WalletDrawer />
    </>
  );
}
