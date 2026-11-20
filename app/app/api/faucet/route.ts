import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import {
  associatedTokenAddress,
  createAtaIx,
  createConnections,
  fetchConfig,
  mintToIx,
} from "@sirenrun/sdk";
import {
  FAUCET_SOL,
  FAUCET_TOKENS,
  RateLimiter,
  SOL_ENOUGH,
  parseSecretKey,
  parseWallet,
} from "../../../lib/faucet";

/**
 * Devnet faucet, the app's only server code: mints test USDC (and a little SOL for rent) to a
 * wallet. Signed by a dedicated faucet key that is the tUSDC mint authority and nothing else.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new RateLimiter();

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

export async function POST(request: Request): Promise<Response> {
  const secret = parseSecretKey(process.env.FAUCET_SECRET_KEY);
  if (secret === null) return json(503, { error: "faucet is not configured" });

  const wallet = parseWallet(await request.json().catch(() => null));
  if (wallet === null) return json(400, { error: "invalid wallet address" });

  const now = Date.now();
  const wait = limiter.waitFor(wallet.toBase58(), now);
  if (wait > 0) {
    return json(429, { error: `already claimed; try again in ${Math.ceil(wait / 60_000)} min` });
  }

  const faucet = Keypair.fromSecretKey(secret);
  const { base } = createConnections({
    cluster: "devnet",
    baseRpc: process.env.NEXT_PUBLIC_BASE_RPC || undefined,
  });
  const config = await fetchConfig(base);
  if (config === null) return json(503, { error: "program is not initialised" });

  const tx = new Transaction().add(
    createAtaIx({ payer: faucet.publicKey, owner: wallet, mint: config.mint }).instruction,
    mintToIx({
      mint: config.mint,
      destination: associatedTokenAddress(wallet, config.mint),
      authority: faucet.publicKey,
      amount: FAUCET_TOKENS,
    }).instruction,
  );
  const sol = await base.getBalance(wallet);
  if (sol < SOL_ENOUGH) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: faucet.publicKey,
        toPubkey: wallet,
        lamports: FAUCET_SOL,
      }),
    );
  }

  // Record before sending so parallel requests from one wallet cannot both pass.
  limiter.record(wallet.toBase58(), now);
  try {
    const { blockhash, lastValidBlockHeight } = await base.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = faucet.publicKey;
    tx.sign(faucet);
    const signature = await base.sendRawTransaction(tx.serialize());
    await base.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    return json(200, {
      signature,
      tokens: FAUCET_TOKENS.toString(),
      sol: sol < SOL_ENOUGH ? FAUCET_SOL : 0,
    });
  } catch (error) {
    limiter.forget(wallet.toBase58());
    console.error("faucet failed", error);
    return json(502, { error: "faucet transaction failed; try again" });
  }
}
