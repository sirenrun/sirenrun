"use client";

import { formatTokenAmount, isSessionLive } from "@sirenrun/sdk";
import { useEffect } from "react";
import { sessionMinutesLeft } from "../lib/game-balance";
import { useNow } from "../lib/use-now";
import { useWalletSigner } from "../lib/use-wallet-signer";
import { useBalance } from "../stores/balance";
import { useFunds } from "../stores/funds";
import { useSession } from "../stores/session";
import { useUi } from "../stores/ui";
import { AmountForm } from "./amount-form";
import { FaucetButton } from "./faucet-button";

export function WalletDrawer() {
  const { drawerOpen, setDrawer } = useUi();
  const signer = useWalletSigner();
  const { walletTokens, walletLamports, location, game } = useBalance();
  const funds = useFunds();
  const { session, pending, start, revoke, error: sessionError } = useSession();
  const now = useNow(30_000);

  useEffect(() => {
    if (!drawerOpen) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [drawerOpen, setDrawer]);

  if (!drawerOpen || signer === null) return null;
  const available = game?.available ?? 0n;
  const live = session !== null && isSessionLive(session, now / 1000);

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/50"
      onClick={() => setDrawer(false)}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Wallet"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-sm flex-col gap-6 overflow-y-auto overscroll-contain border-l border-white/10 bg-bg p-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Wallet</h2>
          <button
            type="button"
            onClick={() => setDrawer(false)}
            aria-label="Close"
            className="text-muted hover:text-text"
          >
            ✕
          </button>
        </div>

        <section className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted">Game balance</p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatTokenAmount(available)} tUSDC
          </p>
          <p className="text-xs text-muted">
            {location === "er"
              ? "In the rollup, ready to drive and trade."
              : location === "base"
                ? "On Solana. Deposit to move it into the game."
                : "No game balance yet."}
          </p>
        </section>

        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">Deposit</p>
            <p className="text-xs text-muted">
              wallet {formatTokenAmount(walletTokens)} tUSDC · {(walletLamports / 1e9).toFixed(3)}{" "}
              SOL
            </p>
          </div>
          <AmountForm
            label="Deposit"
            max={walletTokens}
            busy={funds.busy}
            onSubmit={(a) => funds.deposit(signer, a)}
          />
          {walletTokens === 0n && <FaucetButton />}
        </section>

        <section className="space-y-2">
          <p className="text-sm font-medium">Withdraw</p>
          <AmountForm
            label="Withdraw"
            max={available}
            busy={funds.busy}
            onSubmit={(a) => funds.withdraw(signer, a)}
          />
          <p className="text-xs text-muted">
            Withdrawing takes a few seconds: your balance moves back to Solana first.
          </p>
        </section>

        {(funds.status !== null || funds.error !== null) && (
          <p
            className={`text-sm ${funds.error !== null ? "text-amber" : "text-neon-cyan"}`}
            role="status"
          >
            {funds.error ?? funds.status}
          </p>
        )}

        <section className="space-y-2 border-t border-white/5 pt-4">
          <p className="text-sm font-medium">Session</p>
          {live ? (
            <>
              <p className="text-xs text-muted">
                Active for {sessionMinutesLeft(session.validUntil, now)} more min. Driving, trading
                and claiming sign without popups.
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() => void revoke(signer)}
                className="rounded-md border border-police-red/50 px-3 py-1.5 text-sm text-police-red disabled:opacity-50"
              >
                {pending ? "Waiting for your wallet…" : "Revoke session"}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => void start(signer)}
              className="btn-primary"
            >
              {pending ? "Waiting for your wallet…" : "Start session"}
            </button>
          )}
          {sessionError !== null && <p className="text-xs text-amber">{sessionError}</p>}
        </section>
      </aside>
    </div>
  );
}
