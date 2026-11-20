import { create } from "zustand";
import {
  createSession,
  revokeSessionIx,
  sendBase,
  type Session,
  type WalletSigner,
} from "@sirenrun/sdk";
import type { PublicKey } from "@solana/web3.js";
import { chain } from "../lib/chain";
import { forgetSession, loadSession, saveSession } from "../lib/session-storage";

/**
 * The session key signs set_input, buy, claim, start_run and undelegate. It is kept for the
 * browser tab (see lib/session-storage.ts) so reloads do not ask for a new signature.
 */
interface SessionState {
  session: Session | null;
  pending: boolean;
  error: string | null;
  start: (wallet: WalletSigner) => Promise<void>;
  revoke: (wallet: WalletSigner) => Promise<void>;
  /** Drops the key without a transaction, e.g. when the wallet disconnects. */
  clear: () => void;
  /** Picks up this tab's stored session for `authority`, if it is still valid. */
  restore: (authority: PublicKey) => void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const useSession = create<SessionState>((set, get) => ({
  session: null,
  pending: false,
  error: null,

  start: async (wallet) => {
    set({ pending: true, error: null });
    try {
      const { session, ix } = createSession({
        authority: wallet.publicKey,
        nowSeconds: Math.floor(Date.now() / 1000),
      });
      await sendBase(chain().base, wallet, [ix]);
      saveSession(session);
      set({ session, pending: false });
    } catch (e) {
      set({ pending: false, error: message(e) });
    }
  },

  revoke: async (wallet) => {
    const { session } = get();
    if (session === null) return;
    set({ pending: true, error: null });
    try {
      await sendBase(chain().base, wallet, [
        revokeSessionIx({ authority: wallet.publicKey, sessionSigner: session.keypair.publicKey }),
      ]);
      forgetSession();
      set({ session: null, pending: false });
    } catch (e) {
      set({ pending: false, error: message(e) });
    }
  },

  clear: () => set({ session: null, error: null }),

  restore: (authority) => {
    const current = get().session;
    if (current !== null && current.authority.equals(authority)) return;
    set({ session: loadSession(authority, Math.floor(Date.now() / 1000)), error: null });
  },
}));
