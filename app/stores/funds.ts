import { create } from "zustand";
import {
  TransactionFailed,
  balancePda,
  delegateBalanceIx,
  depositIx,
  initBalanceIx,
  isSessionLive,
  sendBase,
  sendEr,
  sessionAuthority,
  undelegateBalanceIx,
  waitForDelegation,
  waitForUndelegation,
  withdrawIx,
  type BaseInstruction,
  type WalletSigner,
} from "@sirenrun/sdk";
import { chain } from "../lib/chain";
import { depositPlan, withdrawPlan, type FundingStep } from "../lib/funding";
import { useBalance } from "./balance";
import { useSession } from "./session";

const STEP_TEXT: Record<FundingStep, string> = {
  undelegate: "Moving your balance back to Solana…",
  sign: "Waiting for your wallet…",
  "delegate-wait": "Moving your balance into the game…",
};

interface FundsState {
  busy: boolean;
  /** What is happening now, for the progress line. */
  status: string | null;
  error: string | null;
  deposit: (wallet: WalletSigner, amount: bigint) => Promise<boolean>;
  withdraw: (wallet: WalletSigner, amount: bigint) => Promise<boolean>;
}

function describe(e: unknown): string {
  if (e instanceof TransactionFailed) return e.errorName ?? e.message;
  return e instanceof Error ? e.message : String(e);
}

/** Commits the balance back to Solana, signed by the session key when there is one. */
async function undelegate(wallet: WalletSigner) {
  const { base, er } = chain();
  const session = useSession.getState().session;
  const live = session !== null && isSessionLive(session, Date.now() / 1000);
  const ix = undelegateBalanceIx({
    auth: live ? sessionAuthority(session) : { signer: wallet.publicKey },
    owner: wallet.publicKey,
  });
  await sendEr(er, live ? session.keypair : wallet, [ix]);
  await waitForUndelegation(base, balancePda(wallet.publicKey).address, { timeoutMs: 60_000 });
}

export const useFunds = create<FundsState>((set) => {
  async function run(steps: FundingStep[], work: (step: FundingStep) => Promise<void>) {
    set({ busy: true, error: null });
    try {
      for (const step of steps) {
        set({ status: STEP_TEXT[step] });
        await work(step);
      }
      set({ busy: false, status: null });
      await useBalance.getState().refresh();
      return true;
    } catch (e) {
      set({ busy: false, status: null, error: describe(e) });
      await useBalance.getState().refresh();
      return false;
    }
  }

  return {
    busy: false,
    status: null,
    error: null,

    deposit: async (wallet, amount) => {
      const { location, config } = useBalance.getState();
      if (config === null) {
        set({ error: "program config not loaded" });
        return false;
      }
      const { base, er, endpoints } = chain();
      const plan = depositPlan(location);
      const owner = wallet.publicKey;
      return run(plan.steps, async (step) => {
        if (step === "undelegate") return undelegate(wallet);
        if (step === "delegate-wait") {
          return waitForDelegation(base, er, balancePda(owner).address, { timeoutMs: 60_000 });
        }
        const ixs: BaseInstruction[] = plan.instructions.map((name) =>
          name === "init-balance"
            ? initBalanceIx({ owner })
            : name === "deposit"
              ? depositIx({ owner, mint: config.mint, amount })
              : delegateBalanceIx({ owner, validator: endpoints.validator }),
        );
        await sendBase(base, wallet, ixs);
      });
    },

    withdraw: async (wallet, amount) => {
      const { location, config, game } = useBalance.getState();
      const plan = withdrawPlan(location, game?.available ?? 0n, amount);
      if ("error" in plan) {
        set({ error: plan.error });
        return false;
      }
      if (config === null) {
        set({ error: "program config not loaded" });
        return false;
      }
      const { base, er, endpoints } = chain();
      const owner = wallet.publicKey;
      return run(plan.steps, async (step) => {
        if (step === "undelegate") return undelegate(wallet);
        if (step === "delegate-wait") {
          return waitForDelegation(base, er, balancePda(owner).address, { timeoutMs: 60_000 });
        }
        const ixs: BaseInstruction[] = plan.instructions.map((name) =>
          name === "withdraw"
            ? withdrawIx({ owner, mint: config.mint, amount })
            : delegateBalanceIx({ owner, validator: endpoints.validator }),
        );
        await sendBase(base, wallet, ixs);
      });
    },
  };
});
