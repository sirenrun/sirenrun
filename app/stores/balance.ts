import type { PublicKey } from "@solana/web3.js";
import { create } from "zustand";
import {
  associatedTokenAddress,
  balancePda,
  decodeBalance,
  fetchBalance,
  fetchConfig,
  type Balance,
  type Config,
} from "@sirenrun/sdk";
import { chain } from "../lib/chain";
import { backoffMs, locateBalance, tokenAmount, type BalanceLocation } from "../lib/game-balance";

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
  /** Last refresh error; cleared by the next success. Refreshes retry with backoff. */
  error: string | null;
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
  error: null,
};

export const useBalance = create<BalanceState>((set, get) => {
  const sync: {
    running: Promise<void> | null;
    again: boolean;
    failures: number;
    retry: number | null;
  } = {
    running: null,
    again: false,
    failures: 0,
    retry: null,
  };

  /** One base-layer round trip for the balance, the wallet's SOL and its token account. */
  async function fetchOnce(): Promise<void> {
    const owner = get().owner;
    if (owner === null) return;
    const { base, er } = chain();
    try {
      const config = get().config ?? (await fetchConfig(base));
      const pda = balancePda(owner).address;
      const ata = config === null ? null : associatedTokenAddress(owner, config.mint);
      const [info, wallet, token] = await base.getMultipleAccountsInfo(
        ata === null ? [pda, owner] : [pda, owner, ata],
      );
      const location = locateBalance(info?.owner);
      // The base copy of a delegated balance is stale; read the live one from the ER.
      const game =
        location === "none"
          ? null
          : location === "er"
            ? await fetchBalance(er, owner)
            : info == null
              ? null
              : decodeBalance(info.data);
      if (get().owner?.equals(owner) !== true) return; // wallet changed meanwhile
      sync.failures = 0;
      set({
        config,
        walletLamports: wallet?.lamports ?? 0,
        walletTokens: tokenAmount(token),
        location,
        game,
        loaded: true,
        error: null,
      });
    } catch (e) {
      sync.failures += 1;
      set({ error: e instanceof Error ? e.message : String(e) });
      if (sync.retry === null) {
        sync.retry = window.setTimeout(() => {
          sync.retry = null;
          void get().refresh();
        }, backoffMs(sync.failures));
      }
    }
  }

  return {
    ...empty,
    config: null,

    refresh: () => {
      // Coalesce: bursts of account notifications (base and ER) become one fetch, and at most
      // one more is queued while a fetch is in flight.
      if (sync.running) {
        sync.again = true;
        return sync.running;
      }
      sync.running = (async () => {
        do {
          sync.again = false;
          await fetchOnce();
        } while (sync.again);
      })().finally(() => {
        sync.running = null;
      });
      return sync.running;
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
  };
});
