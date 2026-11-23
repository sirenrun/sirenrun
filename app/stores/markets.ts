import { create } from "zustand";
import {
  TransactionFailed,
  arenaPda,
  buyIx,
  formatTokenAmount,
  isSessionLive,
  minSharesFor,
  quoteBuy,
  runCap,
  sendEr,
  sessionAuthority,
  subscribeEvents,
  type Arena,
  type Side,
} from "@sirenrun/sdk";
import { chain } from "../lib/chain";
import {
  SIDE_LABEL,
  SLIPPAGE_BPS,
  appendHistory,
  friendlyError,
  lineSeconds,
  tickerItem,
  type PriceHistory,
  type TickerItem,
} from "../lib/markets";
import { addTrade, emptyStats, followRun, type RunStats } from "../lib/run-stats";
import { useArena } from "./arena";
import { useBalance } from "./balance";
import { claimSettled } from "./claims";
import { useSession } from "./session";
import { useToasts } from "./toast";

const TICKER_LENGTH = 12;

interface MarketsState {
  history: PriceHistory;
  ticker: TickerItem[];
  /** Volume, trade count and driver fee of the current run, from trades seen live. */
  stats: RunStats;
  /** The buy in flight, if any: one at a time keeps the balance and slippage simple. */
  buying: { market: number; side: Side } | null;
  error: string | null;
  /**
   * Follows one arena's prices, trades and payouts; returns a stop function. With `null` it
   * only records prices, for the offline demo run.
   */
  watch: (id: number | null) => () => void;
  buy: (market: number, side: Side, amount: bigint) => Promise<void>;
}

function describe(e: unknown): string {
  if (e instanceof TransactionFailed) return friendlyError(e.errorName, e.message);
  return e instanceof Error ? e.message : String(e);
}

function liveSession() {
  const session = useSession.getState().session;
  return session !== null && isSessionLive(session, Date.now() / 1000) ? session : null;
}

export const useMarkets = create<MarketsState>((set, get) => {
  return {
    history: { nonce: -1, points: [] },
    ticker: [],
    stats: emptyStats(-1, false),
    buying: null,
    error: null,

    watch: (id) => {
      set({
        history: { nonce: -1, points: [] },
        ticker: [],
        stats: emptyStats(-1, false),
        error: null,
      });
      const onArena = (arena: Arena | null) => {
        if (arena === null || (id !== null && arena.id !== id)) return;
        const history = appendHistory(get().history, arena);
        if (history !== get().history) set({ history });
        const stats = followRun(get().stats, arena);
        if (stats !== get().stats) set({ stats });
        if (id !== null) claimSettled(arena, (error) => set({ error }));
      };
      onArena(useArena.getState().latest);
      const stopArena = useArena.subscribe((s, prev) => {
        if (s.latest !== prev.latest) onArena(s.latest);
      });
      // A payout can become claimable when the balance (not the arena) changes, e.g. after
      // the session starts or a deposit lands.
      const stopBalance = useBalance.subscribe((s, prev) => {
        if (s.game !== prev.game) onArena(useArena.getState().latest);
      });
      if (id === null) return stopArena;
      const address = arenaPda(id).address;
      const stopEvents = subscribeEvents(chain().er, (event, signature) => {
        if (event.name !== "Trade" || !event.data.arena.equals(address)) return;
        const lines = useArena.getState().latest?.markets.map((m) => m.line) ?? [];
        const item = tickerItem(signature, event.data, lines);
        // Before the config loads, fees count as zero: volume reads slightly low, never high.
        const config = useBalance.getState().config;
        const terms = { feeBps: config?.feeBps ?? 0, runnerFeeBps: config?.runnerFeeBps ?? 0 };
        set({
          ticker: [item, ...get().ticker.filter((t) => t.key !== item.key)].slice(0, TICKER_LENGTH),
          stats: addTrade(get().stats, item.key, event.data, terms),
        });
      });
      return () => {
        stopArena();
        stopBalance();
        stopEvents();
      };
    },

    buy: async (market, side, amount) => {
      const session = liveSession();
      const arena = useArena.getState().latest;
      const config = useBalance.getState().config;
      if (session === null || arena === null || config === null || get().buying !== null) return;
      const pool = arena.markets[market];
      if (pool === undefined) return;
      const quoted = quoteBuy(
        { feeBps: config.feeBps, runnerFeeBps: config.runnerFeeBps, maxBuy: config.maxBuy },
        pool,
        runCap(arena, market),
        side,
        amount,
      );
      if (!quoted.ok) {
        set({ error: friendlyError(quoted.error, quoted.error) });
        return;
      }
      set({ buying: { market, side }, error: null });
      try {
        await sendEr(chain().er, session.keypair, [
          buyIx({
            auth: sessionAuthority(session),
            owner: session.authority,
            house: config.house,
            id: arena.id,
            market,
            side,
            amount,
            minShares: minSharesFor(quoted.quote.shares, SLIPPAGE_BPS),
          }),
        ]);
        useToasts
          .getState()
          .push(
            `Bought ${SIDE_LABEL[side]} ${lineSeconds(pool.line)}s: ${formatTokenAmount(quoted.quote.shares)} shares`,
            "good",
          );
        void useBalance.getState().refresh();
        set({ buying: null });
      } catch (e) {
        set({ buying: null, error: describe(e) });
      }
    },
  };
});
