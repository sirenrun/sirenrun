"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { useBalance } from "../stores/balance";

/** Asks the devnet faucet for 100 tUSDC (and a little SOL for a new wallet). */
export function useFaucet() {
  const { publicKey } = useWallet();
  const refresh = useBalance((s) => s.refresh);
  const [state, setState] = useState<{ busy: boolean; note: string | null }>({
    busy: false,
    note: null,
  });

  const claim = async () => {
    if (publicKey === null) return;
    setState({ busy: true, note: null });
    try {
      const response = await fetch("/api/faucet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: publicKey.toBase58() }),
      });
      const body = (await response.json()) as { error?: string };
      setState({
        busy: false,
        note: response.ok ? "100 tUSDC sent" : (body.error ?? "faucet failed"),
      });
      if (response.ok) await refresh();
    } catch {
      setState({ busy: false, note: "faucet unreachable" });
    }
  };

  return { ...state, claim, available: publicKey !== null };
}

/**
 * `floatNote` drops the status note below the button instead of beside it, for tight rows
 * like the header where a note appearing would shift everything.
 */
export function FaucetButton({
  className = "",
  floatNote = false,
}: {
  className?: string;
  floatNote?: boolean;
}) {
  const { busy, note, claim, available } = useFaucet();
  if (!available) return null;
  return (
    <div className={`relative flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => void claim()}
        disabled={busy}
        className="h-9 rounded-lg border border-neon-cyan/40 px-3 text-sm font-medium text-neon-cyan enabled:hover:bg-neon-cyan/10 enabled:hover:shadow-[0_0_16px_-6px_var(--color-neon-cyan)] disabled:opacity-50"
      >
        {busy ? "Sending…" : "Get test USDC"}
      </button>
      {note !== null && (
        <span
          className={`text-xs text-muted ${floatNote ? "absolute top-full right-0 mt-1 whitespace-nowrap" : ""}`}
        >
          {note}
        </span>
      )}
    </div>
  );
}
