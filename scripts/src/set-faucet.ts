// Makes a dedicated faucet key the tUSDC mint authority and funds it with devnet SOL, so
// the app's faucet route never holds the admin key (config admin and house).
// Create the key first: solana-keygen new -o ~/.config/solana/sirenrun-faucet.json
// Usage: SIRENRUN_MINT=<mint> SIRENRUN_FAUCET_KEYPAIR=<path> pnpm --filter @sirenrun/scripts set-faucet
import { LAMPORTS_PER_SOL, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { fetchConfig, sendBase, setMintAuthorityIx, type BaseInstruction } from "@sirenrun/sdk";
import { adminKeypair, connections, loadKeypair, log, mintFromEnv } from "./env.ts";

/** Covers about 50 new users at 0.02 SOL each plus fees. */
const FAUCET_SOL = 1 * LAMPORTS_PER_SOL;

const path = process.env.SIRENRUN_FAUCET_KEYPAIR;
if (path === undefined) throw new Error("set SIRENRUN_FAUCET_KEYPAIR to the faucet keypair file");
const faucet = loadKeypair(path).publicKey;
const admin = adminKeypair();
const mint = mintFromEnv();
const { base } = connections();

const config = await fetchConfig(base);
if (config !== null && !config.mint.equals(mint)) {
  throw new Error(`config uses mint ${config.mint.toBase58()}, not ${mint.toBase58()}`);
}

const transfer: BaseInstruction = {
  layer: "base",
  instruction: SystemProgram.transfer({
    fromPubkey: admin.publicKey,
    toPubkey: faucet,
    lamports: FAUCET_SOL,
  }) as TransactionInstruction,
  signers: [],
};
await sendBase(base, admin, [
  setMintAuthorityIx({ mint, current: admin.publicKey, next: faucet }),
  transfer,
]);
log("mint authority is now the faucet key", faucet, "funded with 1 SOL");
log("set FAUCET_SECRET_KEY on the app server to the contents of", path);
