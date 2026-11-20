import { Keypair, PublicKey } from "@solana/web3.js";
import { createConnections, isErRegion, type Connections } from "@sirenrun/sdk";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Shared setup for the devnet scripts. Configuration comes from the environment (see
 * `.env.example`); keypair files are read, never printed.
 */

export function loadKeypair(path: string): Keypair {
  const bytes = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

/** The admin wallet: config admin, tUSDC mint authority and house. */
export function adminKeypair(): Keypair {
  const path = process.env.SIRENRUN_ADMIN_KEYPAIR ?? join(homedir(), ".config/solana/id.json");
  return loadKeypair(path);
}

/** Holds the tUSDC mint authority: the faucet key once `set-faucet` ran, else the admin. */
export function mintAuthority(): Keypair {
  const path = process.env.SIRENRUN_FAUCET_KEYPAIR;
  return path === undefined ? adminKeypair() : loadKeypair(path);
}

export function connections(): Connections {
  const cluster = process.env.SIRENRUN_CLUSTER === "local" ? "local" : "devnet";
  const region = process.env.NEXT_PUBLIC_ER_REGION ?? "as";
  if (!isErRegion(region))
    throw new Error(`NEXT_PUBLIC_ER_REGION must be "as" or "eu", got "${region}"`);
  const baseRpc = process.env.NEXT_PUBLIC_BASE_RPC || undefined;
  return createConnections({ cluster, region, baseRpc });
}

export function mintFromEnv(): PublicKey {
  const value = process.env.SIRENRUN_MINT ?? process.argv[2];
  if (value === undefined)
    throw new Error("pass the tUSDC mint as SIRENRUN_MINT or the first argument");
  return new PublicKey(value);
}

const started = Date.now();

export function log(...parts: unknown[]): void {
  const seconds = ((Date.now() - started) / 1000).toFixed(1).padStart(6);
  console.log(`[${seconds}s]`, ...parts.map(show));
}

function show(value: unknown): unknown {
  if (value instanceof PublicKey) return value.toBase58();
  if (typeof value === "bigint") return value.toString();
  return value;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
