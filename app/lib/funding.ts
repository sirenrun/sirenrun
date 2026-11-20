import type { BalanceLocation } from "./game-balance";

/**
 * Deposits and withdrawals move tokens on the base layer only, so the game balance has to
 * be there first. These plans list the steps for a given starting point; the funds store
 * runs them and shows each as progress.
 */
export type FundingStep =
  /** ER: commit the balance back to Solana and wait until the base layer owns it. */
  | "undelegate"
  /** Base: one wallet signature for the listed instructions. */
  | "sign"
  /** Wait until the delegated balance is readable on the ER. */
  | "delegate-wait";

export interface DepositPlan {
  steps: FundingStep[];
  /** Instructions in the signed transaction, in order. */
  instructions: ("init-balance" | "deposit" | "delegate")[];
}

export function depositPlan(location: BalanceLocation): DepositPlan {
  const instructions: DepositPlan["instructions"] =
    location === "none" ? ["init-balance", "deposit", "delegate"] : ["deposit", "delegate"];
  const steps: FundingStep[] =
    location === "er" ? ["undelegate", "sign", "delegate-wait"] : ["sign", "delegate-wait"];
  return { steps, instructions };
}

export interface WithdrawPlan {
  steps: FundingStep[];
  instructions: ("withdraw" | "delegate")[];
}

/**
 * Withdraws `amount` of `available`. Whatever stays behind is delegated again in the same
 * signature, so the player can keep trading without another setup.
 */
export function withdrawPlan(
  location: BalanceLocation,
  available: bigint,
  amount: bigint,
): WithdrawPlan | { error: string } {
  if (location === "none") return { error: "no game balance yet" };
  if (amount <= 0n) return { error: "enter an amount" };
  if (amount > available) return { error: "more than your game balance" };
  const keep = available > amount;
  const steps: FundingStep[] = [
    ...(location === "er" ? (["undelegate"] as const) : []),
    "sign",
    ...(keep ? (["delegate-wait"] as const) : []),
  ];
  return { steps, instructions: keep ? ["withdraw", "delegate"] : ["withdraw"] };
}

export type OnboardingStep = "connect" | "faucet" | "deposit" | "session";

export interface OnboardingInput {
  connected: boolean;
  walletTokens: bigint;
  location: BalanceLocation;
  gameAvailable: bigint;
  sessionLive: boolean;
}

/** Which onboarding steps are done. A step counts once anything later shows it happened. */
export function onboardingDone(i: OnboardingInput): Record<OnboardingStep, boolean> {
  const deposit = i.location === "er" && i.gameAvailable > 0n;
  return {
    connect: i.connected,
    faucet: i.connected && (i.walletTokens > 0n || i.gameAvailable > 0n),
    deposit: i.connected && deposit,
    session: i.connected && i.sessionLive,
  };
}

/** The first step that is not done, or null when the player is ready. */
export function nextOnboardingStep(i: OnboardingInput): OnboardingStep | null {
  const done = onboardingDone(i);
  const order: OnboardingStep[] = ["connect", "faucet", "deposit", "session"];
  return order.find((s) => !done[s]) ?? null;
}
