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

function SessionStatus() {
  const signer = useWalletSigner();
  const { session, pending, error, start } = useSession();
  const now = useNow(30_000);
  if (signer === null) return null;

  if (session !== null && isSessionLive(session, now / 1000)) {
    const minutes = sessionMinutesLeft(session.validUntil, now);
    return (
      <span
        className="flex shrink-0 items-center gap-2 px-3 text-xs text-muted"
        title={`Session active: no wallet popups for ${minutes} more min`}
      >
        <span className="relative flex size-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-neon-cyan/60 motion-reduce:hidden" />
          <span className="relative size-2 rounded-full bg-neon-cyan" />
        </span>
        <span className="tabular-nums">
          <span className="hidden sm:inline">Session </span>
          {minutes}m
        </span>
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => void start(signer)}
      title={error ?? "One signature; no more wallet popups for an hour"}
      className="flex items-center gap-2 px-3 text-xs font-medium text-muted hover:bg-white/5 hover:text-text disabled:opacity-50"
    >
      <span className="size-2 rounded-full border border-current" aria-hidden />
      {pending ? "Signing…" : error !== null ? "Retry session" : "Start session"}
    </button>
  );
}

function GameBalance() {
  const { game, walletTokens, location, loaded } = useBalance();
  const setDrawer = useUi((s) => s.setDrawer);
  if (!loaded) return <span className="flex items-center px-3 text-xs text-muted">Loading…</span>;
  return (
    <button
      type="button"
      onClick={() => setDrawer(true)}
      title="Open wallet"
      className="flex shrink-0 flex-col items-end justify-center gap-0.5 px-3 text-right leading-none whitespace-nowrap hover:bg-white/5"
    >
      <span className="text-sm font-semibold tabular-nums">
        {formatTokenAmount(game?.available ?? 0n)}{" "}
        <span className="hidden text-xs font-medium text-muted sm:inline">tUSDC</span>
      </span>
      <span className="hidden text-[11px] text-muted tabular-nums sm:block">
        {location === "er" ? "in game" : location === "base" ? "on Solana" : "no game balance"} ·
        wallet {formatTokenAmount(walletTokens)}
      </span>
    </button>
  );
}

/** Session status and game balance in one chip, the same height as the buttons beside it. */
function Account() {
  const { publicKey } = useWallet();
  if (publicKey === null) return null;
  return (
    <div className="flex h-9 items-stretch overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
      <SessionStatus />
      <span className="my-2 w-px bg-white/10 first:hidden" aria-hidden />
      <GameBalance />
    </div>
  );
}

export function Header() {
  useWalletSync();
  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-white/5 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" aria-label="SIRENRUN home" className="shrink-0">
            <Image
              src="/logo.svg"
              alt="SIRENRUN"
              width={150}
              height={22}
              unoptimized
              priority
              className="h-5 w-auto sm:h-6"
            />
          </Link>
          <Link
            href="/lobby"
            className="hidden text-sm font-semibold text-muted hover:text-text sm:block"
          >
            Channels
          </Link>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <FaucetButton className="hidden md:flex" floatNote />
          <Account />
          <WalletMultiButton />
        </div>
      </header>
      <Onboarding />
      <WalletDrawer />
    </>
  );
}
