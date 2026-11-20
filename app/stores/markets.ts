import { create } from "zustand";
import {
  TransactionFailed,
  arenaPda,
  buyIx,
  claimIx,
  claimableEntries,
  formatTokenAmount,
  isSessionLive,
  minSharesFor,
  quoteBuy,
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
import { useArena } from "./arena";
import { useBalance } from "./balance";
import { useSession } from "./session";
import { useToasts } from "./toast";

const TICKER_LENGTH = 12;

interface MarketsState {
  history: PriceHistory;
  ticker: TickerItem[];
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
  /** Entries being claimed, keyed by slot and position, so a slot is claimed once. */
  const claiming = new Set<string>();

  /**
   * Claims every settled position on this arena with the session key: wins pay out, losses
   * free their slot, refunds come back. No popups, so it runs whenever state changes.
   */
  function autoClaim(arena: Arena) {
    const session = liveSession();
    const { game, location, config } = useBalance.getState();
    if (session === null || game === null || location !== "er" || config === null) return;
    if (!game.owner.equals(session.authority)) return;
    for (const { index, entry, preview } of claimableEntries(game, arena)) {
      const key = `${index}:${entry.arenaId}:${entry.nonce}:${entry.market}:${entry.side}`;
      if (claiming.has(key)) continue;
      claiming.add(key);
      sendEr(chain().er, session.keypair, [
        claimIx({
          auth: sessionAuthority(session),
          owner: session.authority,
          house: config.house,
          id: arena.id,
          entryIndex: index,
        }),
      ])
        .then(() => {
          const line = arena.markets[entry.market];
          const label = `${SIDE_LABEL[entry.side === "yes" ? "yes" : "no"]} ${line === undefined ? "" : `${lineSeconds(line.line)}s`}`;
          if (preview.kind === "win") {
            useToasts
              .getState()
              .push(`${label} paid ${formatTokenAmount(preview.paid)} tUSDC`, "good");
          } else if (preview.kind === "refund") {
            useToasts.getState().push(`${label} refunded ${formatTokenAmount(preview.paid)} tUSDC`);
          }
          void useBalance.getState().refresh();
        })
        .catch((e: unknown) => {
          // Let a later state change try again.
          claiming.delete(key);
          set({ error: describe(e) });
        });
    }
  }

  return {
    history: { nonce: -1, points: [] },
    ticker: [],
    buying: null,
    error: null,

    watch: (id) => {
      set({ history: { nonce: -1, points: [] }, ticker: [], error: null });
      const onArena = (arena: Arena | null) => {
        if (arena === null || (id !== null && arena.id !== id)) return;
        const history = appendHistory(get().history, arena);
        if (history !== get().history) set({ history });
        if (id !== null) autoClaim(arena);
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
        set({
          ticker: [item, ...get().ticker.filter((t) => t.key !== item.key)].slice(0, TICKER_LENGTH),
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
        arena,
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
