"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  formatTokenAmount,
  isSessionLive,
  quoteBuy,
  runCap,
  TOKEN_UNIT,
  type Arena,
  type Config,
  type Side,
} from "@sirenrun/sdk";
import { COOLDOWN_TICKS } from "@sirenrun/sim";
import { useState } from "react";
import {
  PRESETS,
  SIDE_LABEL,
  ago,
  marketView,
  percent,
  positionRows,
  tradeBlocker,
  trendOf,
  type MarketView,
  type PriceHistory,
} from "../lib/markets";
import { useNow } from "../lib/use-now";
import { useWalletSigner } from "../lib/use-wallet-signer";
import { useArena } from "../stores/arena";
import { useBalance } from "../stores/balance";
import { useMarkets } from "../stores/markets";
import { useSession } from "../stores/session";
import { useUi } from "../stores/ui";
import { RunStatsCard } from "./run-stats-card";

/** Line colours, shared by the rows and the price chart. */
/** Per-line identity colours. Green and pink are kept out: they mean RIDE/BUST and win/loss. */
export const LINE_COLOURS = ["#22e1ff", "#a78bfa", "#ffb020"] as const;
const ARROW = { up: "▲", down: "▼", flat: "" } as const;

/** The arena as of the last poll. Prices change every tick; 4 renders a second is plenty. */
export function usePolledArena(): { arena: Arena | null; now: number } {
  const now = useNow(250);
  return { arena: useArena.getState().latest, now };
}

export function Chart({ history }: { history: PriceHistory }) {
  const points = history.points;
  if (points.length < 2) {
    return <div className="h-16 rounded bg-white/[0.03]" aria-hidden />;
  }
  const first = points[0]?.t ?? 0;
  const span = Math.max(1, (points[points.length - 1]?.t ?? 1) - first);
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="h-16 w-full rounded bg-white/[0.03]"
      aria-hidden
    >
      <line x1="0" x2="100" y1="20" y2="20" stroke="white" strokeOpacity="0.08" strokeWidth="0.5" />
      {LINE_COLOURS.map((colour, m) => (
        <polyline
          key={colour}
          fill="none"
          stroke={colour}
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
          points={points
            .map(
              (p) =>
                `${(((p.t - first) / span) * 100).toFixed(2)},${(40 - (p.yes[m] ?? 0) * 40).toFixed(2)}`,
            )
            .join(" ")}
        />
      ))}
    </svg>
  );
}

function payout(config: Config | null, arena: Arena, view: MarketView, side: Side, amount: bigint) {
  const pool = arena.markets[view.index];
  if (config === null || pool === undefined) return null;
  const q = quoteBuy(
    { feeBps: config.feeBps, runnerFeeBps: config.runnerFeeBps, maxBuy: config.maxBuy },
    pool,
    runCap(arena, view.index),
    side,
    amount,
  );
  return q.ok ? formatTokenAmount(q.quote.shares) : null;
}

function MarketRow(props: {
  arena: Arena;
  view: MarketView;
  history: PriceHistory;
  amount: bigint;
  canTrade: boolean;
  config: Config | null;
  demo: boolean;
}) {
  const { arena, view, history, amount, canTrade, config, demo } = props;
  const { buy, buying } = useMarkets();
  const trend = trendOf(history, view.index);
  // The program stops taking buys COOLDOWN_TICKS before a line (LineClosing).
  const line = arena.markets[view.index]?.line ?? 0;
  const closing = view.open && arena.status === "live" && arena.sim.t >= line - COOLDOWN_TICKS;
  const button = (side: Side) => {
    const busy = buying?.market === view.index && buying.side === side;
    const pays = view.open ? payout(config, arena, view, side, amount) : null;
    return (
      <button
        type="button"
        disabled={!canTrade || !view.open || closing || buying !== null}
        onClick={() => void buy(view.index, side, amount)}
        className={`flex flex-1 flex-col items-center rounded-md border px-2 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
          side === "yes"
            ? "border-up/50 bg-up/10 enabled:hover:bg-up/25 enabled:hover:shadow-[0_0_18px_-6px_var(--color-up)]"
            : "border-down/50 bg-down/10 enabled:hover:bg-down/25 enabled:hover:shadow-[0_0_18px_-6px_var(--color-down)]"
        }`}
      >
        <span>
          {busy ? "Buying…" : SIDE_LABEL[side]}{" "}
          <span className="tabular-nums">
            {percent(side === "yes" ? view.ride : 1 - view.ride)}
          </span>
        </span>
        {pays !== null && (
          <span className="text-[11px] font-normal tabular-nums text-muted">pays {pays}</span>
        )}
      </button>
    );
  };

  return (
    <li className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-2 font-display text-xl font-extrabold italic">
          <span className="h-2 w-2 rounded-full" style={{ background: LINE_COLOURS[view.index] }} />
          {view.seconds}s
        </span>
        {view.result !== null ? (
          <span
            className={`text-sm font-semibold ${view.status === "yes" ? "text-up" : view.status === "no" ? "text-down" : "text-muted"}`}
          >
            {view.result}
          </span>
        ) : (
          <span className="text-sm tabular-nums text-muted">
            RIDE {percent(view.ride)}{" "}
            <span className={trend === "up" ? "text-up" : "text-down"}>{ARROW[trend]}</span>
          </span>
        )}
      </div>
      {view.open && !demo && (
        <div className="mt-2 flex gap-2">
          {button("yes")}
          {button("no")}
        </div>
      )}
      {closing && !demo && (
        <p className="mt-1 text-[11px] text-amber">Closed: this line resolves in a moment.</p>
      )}
    </li>
  );
}

function Positions({ arena }: { arena: Arena }) {
  const game = useBalance((s) => s.game);
  const rows = positionRows(game, arena);
  if (rows.length === 0) return null;
  const tone = {
    open: "text-text",
    won: "text-up",
    lost: "text-muted",
    refund: "text-amber",
    expired: "text-muted",
  };
  const word = { open: "now", won: "won", lost: "lost", refund: "refund", expired: "expired" };
  return (
    <section>
      <h3 className="text-xs font-semibold tracking-widest text-muted uppercase">Your positions</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.index} className="flex justify-between gap-2 tabular-nums">
            <span>
              {r.label}
              <span className="ml-2 text-xs text-muted">cost {formatTokenAmount(r.cost)}</span>
            </span>
            <span className={tone[r.state]}>
              {word[r.state]}{" "}
              {r.state === "lost" || r.state === "expired" ? "" : formatTokenAmount(r.value)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The trades of one run, newest first: side badge, line, amount after fees, age. */
export function Ticker() {
  const ticker = useMarkets((s) => s.ticker);
  const live = useArena((s) => s.status === "staging" || s.status === "live");
  const now = useNow(1_000);
  if (ticker.length === 0) return null;
  const ride = ticker.filter((t) => t.side === "yes").reduce((sum, t) => sum + t.net, 0n);
  const total = ticker.reduce((sum, t) => sum + t.net, 0n);
  const ridePct = total === 0n ? 50 : Number((ride * 100n) / total);
  return (
    <section aria-label="Trades">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold tracking-widest text-muted uppercase">
          Trades · {live ? "this run" : "last run"}
        </h3>
        <span className="text-xs tabular-nums text-muted">latest {ticker.length}</span>
      </div>
      {/* Money split between the two sides across the trades shown. */}
      <div className="mt-2 flex h-1.5 overflow-hidden rounded-full" aria-hidden>
        <div className="bg-up" style={{ width: `${ridePct}%` }} />
        <div className="flex-1 bg-down" />
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums">
        <span className="text-up">RIDE {ridePct}%</span>
        <span className="text-down">BUST {100 - ridePct}%</span>
      </div>
      <ul className="mt-2 divide-y divide-white/5 text-sm tabular-nums" aria-live="polite">
        {ticker.map((t) => (
          <li key={t.key} className="flex items-center gap-2 py-1.5">
            <span
              className={`w-12 rounded px-1.5 py-0.5 text-center text-[11px] font-bold ${
                t.side === "yes" ? "bg-up/15 text-up" : "bg-down/15 text-down"
              }`}
            >
              {SIDE_LABEL[t.side]}
            </span>
            <span className="text-muted">{t.seconds === null ? "line" : `${t.seconds}s line`}</span>
            <span className="ml-auto font-semibold">{formatTokenAmount(t.net)}</span>
            <span className="w-9 text-right text-[11px] text-muted">{ago(t.at, now)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The three lines of the current run: RIDE/BUST prices, one-click buys with the session key,
 * the price chart, the viewer's positions (claimed automatically) and the trade ticker.
 * A right-hand column on wide screens, a bottom sheet for spectators on phones.
 */
export function MarketsPanel({ demo = false }: { demo?: boolean }) {
  const { arena, now } = usePolledArena();
  const history = useMarkets((s) => s.history);
  const error = useMarkets((s) => s.error);
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const signer = useWalletSigner();
  const { session, pending, start: startSession } = useSession();
  const { config, game, location } = useBalance();
  const setDrawer = useUi((s) => s.setDrawer);
  const [preset, setPreset] = useState<number>(PRESETS[1]);
  const [open, setOpen] = useState(false);

  const sessionLive = session !== null && isSessionLive(session, now / 1000);
  const blocker = tradeBlocker({
    arena,
    wallet: publicKey?.toBase58() ?? null,
    sessionLive,
    balanceDelegated: location === "er",
    available: game?.available ?? 0n,
  });
  const amount = BigInt(preset) * TOKEN_UNIT;
  const views = arena?.markets.map(marketView) ?? [];

  const action =
    blocker?.action === "connect" ? (
      <button type="button" className="btn-primary w-full" onClick={() => setVisible(true)}>
        Connect wallet
      </button>
    ) : blocker?.action === "deposit" ? (
      <button type="button" className="btn-primary w-full" onClick={() => setDrawer(true)}>
        Deposit tUSDC
      </button>
    ) : blocker?.action === "session" ? (
      <button
        type="button"
        className="btn-primary w-full"
        disabled={pending || signer === null}
        onClick={() => signer !== null && void startSession(signer)}
      >
        {pending ? "Waiting for your wallet…" : "Start session"}
      </button>
    ) : null;

  return (
    <aside
      className="relative z-20 flex max-h-[60%] shrink-0 flex-col border-t border-white/10 bg-bg lg:max-h-none lg:w-[22rem] lg:border-l lg:border-t-0 2xl:w-[26rem]"
      aria-label="Markets"
    >
      {/* Phone: a bar with the three prices that opens the full panel. */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center justify-between gap-2 px-4 py-3 text-sm lg:hidden"
      >
        <span className="font-semibold">Markets</span>
        <span className="flex gap-3 tabular-nums text-muted">
          {views.map((v) => (
            <span key={v.index}>
              {v.seconds}s{" "}
              {v.open ? (
                <span className="text-up">{percent(v.ride)}</span>
              ) : v.status === "yes" ? (
                <span className="font-semibold text-up">RIDE</span>
              ) : v.status === "no" ? (
                <span className="font-semibold text-down">BUST</span>
              ) : (
                "void"
              )}
            </span>
          ))}
          <span aria-hidden>{open ? "▾" : "▴"}</span>
        </span>
      </button>
      <div
        className={`flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-4 lg:block lg:pt-4 ${open ? "block" : "hidden"}`}
      >
        <div className="hidden items-baseline justify-between lg:flex">
          <h2 className="font-display text-2xl font-extrabold italic">Markets</h2>
          <span className="text-xs text-muted">RIDE = makes it · BUST = caught</span>
        </div>
        {!demo && arena !== null && arena.status !== "idle" && <RunStatsCard driver={false} />}
        {arena !== null && arena.status !== "idle" && <Chart history={history} />}
        {arena?.status === "idle" && (
          <h3 className="text-xs font-semibold tracking-widest text-muted uppercase">Last run</h3>
        )}
        {arena !== null && (
          <ul className="space-y-2">
            {views.map((v) => (
              <MarketRow
                key={v.index}
                arena={arena}
                view={v}
                history={history}
                amount={amount}
                canTrade={!demo && blocker === null}
                demo={demo}
                config={config}
              />
            ))}
          </ul>
        )}
        {demo && (
          <p className="rounded-lg border border-white/10 p-3 text-sm text-muted">
            Demo run: prices follow a simple model of the run. Trading opens on the live channels.
          </p>
        )}
        <div
          className={`flex items-center gap-2 ${demo ? "hidden" : ""}`}
          role="radiogroup"
          aria-label="Amount"
        >
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={preset === p}
              onClick={() => setPreset(p)}
              className={`flex-1 rounded-md border py-1.5 text-sm font-semibold tabular-nums ${
                preset === p
                  ? "border-white/60 bg-white/10"
                  : "border-white/15 text-muted hover:border-white/35"
              }`}
            >
              {p} tUSDC
            </button>
          ))}
        </div>
        {!demo && blocker !== null && (
          <div className="space-y-2 rounded-lg border border-white/10 p-3 text-sm">
            <p className="text-muted">{blocker.reason}</p>
            {action}
          </div>
        )}
        {error !== null && (
          <p className="text-sm text-amber" role="alert">
            {error}
          </p>
        )}
        {!demo && arena !== null && <Positions arena={arena} />}
        <Ticker />
        {!demo && config !== null && (
          <p className="text-[11px] text-muted">
            Fee {config.feeBps / 100}%, of which {config.runnerFeeBps / 100}% goes to the driver.
            Winning shares pay 1 tUSDC each and are claimed for you when the line resolves.
          </p>
        )}
      </div>
    </aside>
  );
}
