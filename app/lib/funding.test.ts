import { describe, expect, it } from "vitest";
import { depositPlan, nextOnboardingStep, onboardingDone, withdrawPlan } from "./funding";

describe("depositPlan", () => {
  it("creates the balance on the first deposit", () => {
    expect(depositPlan("none")).toEqual({
      steps: ["sign", "delegate-wait"],
      instructions: ["init-balance", "deposit", "delegate"],
    });
  });

  it("brings a delegated balance back to Solana first", () => {
    expect(depositPlan("er").steps).toEqual(["undelegate", "sign", "delegate-wait"]);
    expect(depositPlan("base").steps).toEqual(["sign", "delegate-wait"]);
    expect(depositPlan("base").instructions).toEqual(["deposit", "delegate"]);
  });
});

describe("withdrawPlan", () => {
  it("re-delegates whatever stays in the game", () => {
    expect(withdrawPlan("er", 10n, 4n)).toEqual({
      steps: ["undelegate", "sign", "delegate-wait"],
      instructions: ["withdraw", "delegate"],
    });
  });

  it("leaves the balance on Solana when everything is withdrawn", () => {
    expect(withdrawPlan("er", 10n, 10n)).toEqual({
      steps: ["undelegate", "sign"],
      instructions: ["withdraw"],
    });
    expect(withdrawPlan("base", 10n, 10n)).toEqual({ steps: ["sign"], instructions: ["withdraw"] });
  });

  it("rejects impossible amounts", () => {
    expect(withdrawPlan("none", 0n, 1n)).toEqual({ error: "no game balance yet" });
    expect(withdrawPlan("er", 10n, 0n)).toEqual({ error: "enter an amount" });
    expect(withdrawPlan("er", 10n, 11n)).toEqual({ error: "more than your game balance" });
  });
});

describe("onboarding", () => {
  const fresh = {
    connected: false,
    walletTokens: 0n,
    location: "none" as const,
    gameAvailable: 0n,
    sessionLive: false,
  };

  it("walks connect, faucet, deposit, session in order", () => {
    expect(nextOnboardingStep(fresh)).toBe("connect");
    expect(nextOnboardingStep({ ...fresh, connected: true })).toBe("faucet");
    expect(nextOnboardingStep({ ...fresh, connected: true, walletTokens: 5n })).toBe("deposit");
    const deposited = { ...fresh, connected: true, location: "er" as const, gameAvailable: 5n };
    expect(nextOnboardingStep(deposited)).toBe("session");
    expect(nextOnboardingStep({ ...deposited, sessionLive: true })).toBeNull();
  });

  it("counts the faucet as done once tokens are already in the game", () => {
    const done = onboardingDone({ ...fresh, connected: true, location: "er", gameAvailable: 5n });
    expect(done).toEqual({ connect: true, faucet: true, deposit: true, session: false });
  });

  it("needs the balance in the game, not just on Solana", () => {
    expect(
      onboardingDone({ ...fresh, connected: true, location: "base", gameAvailable: 5n }).deposit,
    ).toBe(false);
  });
});
