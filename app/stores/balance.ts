import type { PublicKey } from "@solana/web3.js";
import { create } from "zustand";
import {
  associatedTokenAddress,
  balancePda,
  fetchBalance,
  fetchConfig,
  fetchTokenBalance,
  type Balance,
  type Config,
} from "@sirenrun/sdk";
import { chain } from "../lib/chain";
import { locateBalance, type BalanceLocation } from "../lib/game-balance";

/** Wallet funds and the game balance, wherever it lives (base layer or ER). */
interface BalanceState {
  owner: PublicKey | null;
  config: Config | null;
  /** tUSDC in the wallet's token account. */
  walletTokens: bigint;
  walletLamports: number;
  location: BalanceLocation;
  game: Balance | null;
  loaded: boolean;
  refresh: () => Promise<void>;
  /** Starts following `owner`; returns a function that stops. */
  watch: (owner: PublicKey) => () => void;
  reset: () => void;
}

const empty = {
  owner: null,
  walletTokens: 0n,
  walletLamports: 0,
  location: "none" as BalanceLocation,
  game: null,
  loaded: false,
};

export const useBalance = create<BalanceState>((set, get) => ({
  ...empty,
  config: null,

  refresh: async () => {
    const owner = get().owner;
    if (owner === null) return;
    const { base, er } = chain();
    const config = get().config ?? (await fetchConfig(base));
    const pda = balancePda(owner).address;
    const [info, walletLamports, walletTokens] = await Promise.all([
      base.getAccountInfo(pda),
      base.getBalance(owner),
      config === null ? Promise.resolve(0n) : fetchTokenBalance(base, owner, config.mint),
    ]);
    const location = locateBalance(info?.owner);
    const game =
      location === "none" ? null : await fetchBalance(location === "er" ? er : base, owner);
    // Ignore results for a wallet that disconnected while we were fetching.
    if (get().owner?.equals(owner) !== true) return;
    set({ config, walletLamports, walletTokens, location, game, loaded: true });
  },

  watch: (owner) => {
    set({ ...empty, owner });
    const { base, er } = chain();
    const pda = balancePda(owner).address;
    const refresh = () => void get().refresh();
    const subscriptions = [
      base.onAccountChange(pda, refresh, { commitment: "confirmed" }),
      base.onAccountChange(owner, refresh, { commitment: "confirmed" }),
    ];
    const erSubscription = er.onAccountChange(pda, refresh, { commitment: "processed" });
    let tokenSubscription: number | null = null;
    let stopped = false;
    void get()
      .refresh()
      .then(() => {
        const mint = get().config?.mint;
        if (!stopped && mint !== undefined) {
          tokenSubscription = base.onAccountChange(associatedTokenAddress(owner, mint), refresh, {
            commitment: "confirmed",
          });
        }
      });
    return () => {
      stopped = true;
      for (const id of subscriptions) void base.removeAccountChangeListener(id);
      void er.removeAccountChangeListener(erSubscription);
      if (tokenSubscription !== null) void base.removeAccountChangeListener(tokenSubscription);
    };
  },

  reset: () => set({ ...empty }),
}));
