import type { Overview, RunTrade, WalletStats } from "@sirenrun/indexer/queries";

/** Browser-side fetchers for the stats routes. Null means the stats are unavailable. */

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const fetchOverview = () => get<Overview>("/api/stats/overview");

export const fetchWalletStats = (wallet: string) =>
  get<WalletStats>(`/api/stats/wallet/${encodeURIComponent(wallet)}`);

export const fetchRunTrades = (arena: number, nonce: number) =>
  get<RunTrade[]>(`/api/stats/run/${arena}/${nonce}`);

export type { Overview, RunTrade, WalletStats };
