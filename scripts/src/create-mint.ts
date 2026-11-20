// Creates the tUSDC test mint (6 decimals, mint authority = admin, no freeze authority).
// Usage: pnpm --filter @sirenrun/scripts create-mint
import { Keypair } from "@solana/web3.js";
import { MINT_SIZE, createMintAccountIx, initializeMintIx, sendBase } from "@sirenrun/sdk";
import { adminKeypair, connections, log } from "./env.ts";

const admin = adminKeypair();
const { base, endpoints } = connections();
if (endpoints.cluster !== "devnet" && endpoints.cluster !== "local")
  throw new Error("devnet or local only");

const mint = Keypair.generate();
const lamports = await base.getMinimumBalanceForRentExemption(MINT_SIZE);
await sendBase(
  base,
  admin,
  [
    createMintAccountIx({ payer: admin.publicKey, mint: mint.publicKey, lamports }),
    initializeMintIx({ mint: mint.publicKey, authority: admin.publicKey }),
  ],
  { extraSigners: [mint] },
);
log("tUSDC mint", mint.publicKey, "authority", admin.publicKey);
log(`next: SIRENRUN_MINT=${mint.publicKey.toBase58()} pnpm --filter @sirenrun/scripts init-devnet`);
