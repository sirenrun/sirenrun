import { create } from "zustand";
import {
  createSession,
  revokeSessionIx,
  sendBase,
  type Session,
  type WalletSigner,
} from "@sirenrun/sdk";
import { chain } from "../lib/chain";

/**
 * The session key lives in memory only (never in storage), as MagicBlock recommends: a reload
 * asks for one new signature. It signs set_input, buy, claim, start_run and undelegate.
 */
interface SessionState {
  session: Session | null;
  pending: boolean;
  error: string | null;
  start: (wallet: WalletSigner) => Promise<void>;
  revoke: (wallet: WalletSigner) => Promise<void>;
  /** Drops the key without a transaction, e.g. when the wallet disconnects. */
  clear: () => void;
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
      set({ session: null, pending: false });
    } catch (e) {
      set({ pending: false, error: message(e) });
    }
  },

  clear: () => set({ session: null, error: null }),
}));
