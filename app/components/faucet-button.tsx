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

export function FaucetButton({ className = "" }: { className?: string }) {
  const { busy, note, claim, available } = useFaucet();
  if (!available) return null;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => void claim()}
        disabled={busy}
        className="rounded-md border border-neon-cyan/40 px-3 py-1.5 text-sm text-neon-cyan transition-colors hover:bg-neon-cyan/10 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Get test USDC"}
      </button>
      {note !== null && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}
