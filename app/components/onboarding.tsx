"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { formatTokenAmount, isSessionLive } from "@sirenrun/sdk";
import { useSyncExternalStore } from "react";
import { nextOnboardingStep, onboardingDone, type OnboardingStep } from "../lib/funding";
import { useNow } from "../lib/use-now";
import { useWalletSigner } from "../lib/use-wallet-signer";
import { useBalance } from "../stores/balance";
import { useFunds } from "../stores/funds";
import { useSession } from "../stores/session";
import { useUi } from "../stores/ui";
import { AmountForm } from "./amount-form";
import { FaucetButton } from "./faucet-button";

const noop = () => () => {};

/** False in server HTML and the first hydration pass, true on the client after that. */
function useMounted(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

const TITLES: Record<OnboardingStep, string> = {
  connect: "Connect a wallet",
  faucet: "Get test USDC",
  deposit: "Deposit to your game balance",
  session: "Start a session",
};

const HINTS: Record<OnboardingStep, string> = {
  connect: "Phantom, Solflare or Backpack on devnet.",
  faucet: "100 tUSDC from the devnet faucet, plus a little SOL for rent.",
  deposit: "One signature moves tUSDC into the game and into the rollup.",
  session: "One signature, then no more wallet popups for 1 hour.",
};

export function Onboarding() {
  const { connected, connecting, wallet } = useWallet();
  const mounted = useMounted();
  const { setVisible } = useWalletModal();
  const signer = useWalletSigner();
  const { walletTokens, location, game, loaded } = useBalance();
  const { session, pending, error: sessionError, start } = useSession();
  const funds = useFunds();
  const { onboardingDismissed, dismissOnboarding, drawerOpen } = useUi();
  const now = useNow(15_000) / 1000;

  const input = {
    connected,
    walletTokens,
    location,
    gameAvailable: game?.available ?? 0n,
    sessionLive: session !== null && isSessionLive(session, now),
  };
  const done = onboardingDone(input);
  const next = nextOnboardingStep(input);

  // Only guide a connected wallet: spectators can watch without one, and the header's wallet
  // button covers connecting. Never in server HTML, and only once balances are known.
  const reconnecting = connecting || (!connected && wallet !== null);
  // Also stay closed while the wallet drawer is open or money is moving: a deposit briefly
  // moves the balance back to Solana, which would otherwise re-open the deposit step.
  const open =
    mounted &&
    connected &&
    !onboardingDismissed &&
    next !== null &&
    !reconnecting &&
    loaded &&
    !drawerOpen &&
    !funds.busy;
  if (!open) return null;

  const action = (step: OnboardingStep) => {
    if (step !== next) return null;
    if (step === "connect") {
      return (
        <button type="button" onClick={() => setVisible(true)} className="btn-primary">
          Connect wallet
        </button>
      );
    }
    if (step === "faucet") return <FaucetButton />;
    if (step === "deposit") {
      return (
        <div className="space-y-1">
          <AmountForm
            label="Deposit"
            max={walletTokens}
            busy={funds.busy || signer === null}
            onSubmit={(amount) =>
              signer === null ? Promise.resolve(false) : funds.deposit(signer, amount)
            }
          />
          <p className="text-xs text-muted">
            Wallet holds {formatTokenAmount(walletTokens)} tUSDC.
          </p>
          {funds.status !== null && <p className="text-xs text-neon-cyan">{funds.status}</p>}
          {funds.error !== null && <p className="text-xs text-amber">{funds.error}</p>}
        </div>
      );
    }
    return (
      <div className="space-y-1">
        <button
          type="button"
          disabled={pending || signer === null}
          onClick={() => signer !== null && void start(signer)}
          className="btn-primary"
        >
          {pending ? "Waiting for your wallet…" : "Start session"}
        </button>
        {sessionError !== null && <p className="text-xs text-amber">{sessionError}</p>}
      </div>
    );
  };

  const steps: OnboardingStep[] = ["connect", "faucet", "deposit", "session"];
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="w-full max-w-md rounded-xl border border-white/10 bg-bg p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="onboarding-title" className="text-lg font-semibold">
              Get ready to ride
            </h2>
            <p className="text-sm text-muted">Four steps, under a minute.</p>
          </div>
          <button
            type="button"
            onClick={dismissOnboarding}
            aria-label="Close"
            className="text-muted hover:text-text"
          >
            ✕
          </button>
        </div>
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li
              key={step}
              className={`rounded-lg border p-3 ${step === next ? "border-neon-pink/50 bg-neon-pink/5" : "border-white/5"}`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done[step] ? "bg-neon-cyan text-bg" : "bg-white/10 text-muted"}`}
                  aria-label={done[step] ? "done" : `step ${index + 1}`}
                >
                  {done[step] ? "✓" : index + 1}
                </span>
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${done[step] ? "text-muted" : ""}`}>
                    {TITLES[step]}
                  </p>
                  {step === next && <p className="text-xs text-muted">{HINTS[step]}</p>}
                </div>
              </div>
              {step === next && <div className="mt-3 pl-9">{action(step)}</div>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
