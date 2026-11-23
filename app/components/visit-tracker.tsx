"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect } from "react";

const KEY = "sirenrun.visitor";

/** The browser's anonymous id, made once. Null where storage is blocked (private windows). */
function visitorId(): string | null {
  try {
    let id = localStorage.getItem(KEY);
    if (id === null) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

function send(id: string, wallet: string | null) {
  const body = JSON.stringify(wallet === null ? { id } : { id, wallet });
  void fetch("/api/visit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

/**
 * Counts this visit for the stats page: an anonymous id once per page load, and again with the
 * wallet address when one connects. Renders nothing.
 */
export function VisitTracker() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;

  useEffect(() => {
    const id = visitorId();
    if (id !== null) send(id, wallet);
  }, [wallet]);

  return null;
}
