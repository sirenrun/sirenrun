import {
  TransactionFailed,
  claimIx,
  claimableEntries,
  formatTokenAmount,
  isSessionLive,
  sendEr,
  sessionAuthority,
  type Arena,
} from "@sirenrun/sdk";
import { chain } from "../lib/chain";
import { SIDE_LABEL, friendlyError, lineSeconds } from "../lib/markets";
import { formatUsd } from "../lib/money";
import { useBalance } from "./balance";
import { useSession } from "./session";
import { useToasts } from "./toast";
import { useWinPops } from "./win-pop";

/** Entries being claimed, keyed by slot and position, so each is sent once at a time. */
const claiming = new Set<string>();

/**
 * Claims every settled position the viewer holds on `arena` with the session key: wins pay
 * out, refunds come back, losses free their slot. No popups, so callers run it whenever the
 * arena or the balance changes. Failures are left for a later call to retry; `onError` hears
 * about them.
 */
export function claimSettled(arena: Arena, onError?: (message: string) => void): void {
  const session = useSession.getState().session;
  if (session === null || !isSessionLive(session, Date.now() / 1000)) return;
  const { game, location, config } = useBalance.getState();
  if (game === null || location !== "er" || config === null) return;
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
        const market = arena.markets[entry.market];
        const side = SIDE_LABEL[entry.side === "yes" ? "yes" : "no"];
        const label = market === undefined ? side : `${side} ${lineSeconds(market.line)}s`;
        const toasts = useToasts.getState();
        if (preview.kind === "win") {
          toasts.push(`${label} paid ${formatTokenAmount(preview.paid)} tUSDC`, "good");
          useWinPops.getState().push(formatUsd(preview.paid, { sign: true }), label);
        } else if (preview.kind === "refund") {
          toasts.push(`${label} refunded ${formatTokenAmount(preview.paid)} tUSDC`);
        }
        void useBalance.getState().refresh();
      })
      .catch((e: unknown) => {
        claiming.delete(key);
        const message =
          e instanceof TransactionFailed
            ? friendlyError(e.errorName, e.message)
            : e instanceof Error
              ? e.message
              : String(e);
        onError?.(message);
      });
  }
}
