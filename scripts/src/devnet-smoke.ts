// One scripted run on devnet: a bot driver and a bot trader, each with a fresh wallet and a
// session key, through start_run, VRF seed, live trading, settlement, claims and withdrawal.
// The driver steers perfectly for the first 35 s and then stops, so the 30 s line resolves
// YES and the 60 s and 90 s lines resolve NO; the trader holds one of each side.
// Usage: SIRENRUN_MINT=<mint> pnpm --filter @sirenrun/scripts smoke
import { Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction } from "@solana/web3.js";
import {
  TOKEN_UNIT,
  TransactionFailed,
  associatedTokenAddress,
  balancePda,
  buyIx,
  claimIx,
  claimableEntries,
  createAtaIx,
  createSession,
  delegateBalanceIx,
  depositIx,
  fetchArena,
  fetchBalance,
  fetchConfig,
  fetchTokenBalance,
  formatTokenAmount,
  initBalanceIx,
  minSharesFor,
  mintToIx,
  quoteBuy,
  revokeSessionIx,
  sendBase,
  sendEr,
  sessionAuthority,
  setInputIx,
  startRunIx,
  subscribeArena,
  subscribeEvents,
  undelegateBalanceIx,
  waitForDelegation,
  waitForUndelegation,
  withdrawIx,
  type Arena,
  type Session,
  type Side,
} from "@sirenrun/sdk";
import { generateRow } from "@sirenrun/sim";
import { adminKeypair, connections, log, mintAuthority, mintFromEnv, sleep } from "./env.ts";

process.on("unhandledRejection", (e) => {
  if (e instanceof TransactionFailed) console.error("FAILED", e.errorName ?? e.message, e.logs);
  else console.error("FAILED", e);
  process.exit(1);
});

const ARENA = Number(process.env.SIRENRUN_ARENA ?? 0);
const STEER_UNTIL_TICK = 350;
const FUNDS = 100n * TOKEN_UNIT;
const SOL_PER_BOT = 0.03 * LAMPORTS_PER_SOL;

const admin = adminKeypair();
const minter = mintAuthority();
const mint = mintFromEnv();
const { base, er, endpoints } = connections();
const tusdc = (v: bigint) => `${formatTokenAmount(v)} tUSDC`;

const config = await fetchConfig(base);
if (config === null) throw new Error("no config: run init-devnet first");
const house = config.house;
const buyTerms = {
  feeBps: config.feeBps,
  runnerFeeBps: config.runnerFeeBps,
  maxBuy: config.maxBuy,
};

/** A fresh wallet with SOL for rent, 100 tUSDC deposited and delegated, and a live session. */
async function bot(name: string): Promise<{ wallet: Keypair; session: Session }> {
  const wallet = Keypair.generate();
  const fund = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: admin.publicKey,
      toPubkey: wallet.publicKey,
      lamports: SOL_PER_BOT,
    }),
  );
  const { blockhash, lastValidBlockHeight } = await base.getLatestBlockhash();
  fund.recentBlockhash = blockhash;
  fund.feePayer = admin.publicKey;
  fund.sign(admin);
  const signature = await base.sendRawTransaction(fund.serialize());
  await base.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

  await sendBase(
    base,
    admin,
    [
      createAtaIx({ payer: admin.publicKey, owner: wallet.publicKey, mint }),
      mintToIx({
        mint,
        destination: associatedTokenAddress(wallet.publicKey, mint),
        authority: minter.publicKey,
        amount: FUNDS,
      }),
    ],
    { extraSigners: [minter] },
  );
  await sendBase(base, wallet, [
    initBalanceIx({ owner: wallet.publicKey }),
    depositIx({ owner: wallet.publicKey, mint, amount: FUNDS }),
    delegateBalanceIx({ owner: wallet.publicKey, validator: endpoints.validator }),
  ]);
  await waitForDelegation(base, er, balancePda(wallet.publicKey).address, { timeoutMs: 60_000 });

  const { session, ix } = createSession({
    authority: wallet.publicKey,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  await sendBase(base, wallet, [ix]);
  log(`${name} ready`, wallet.publicKey, "balance delegated, session", session.token);
  return { wallet, session };
}

async function waitFor(what: string, done: () => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (!done()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(100);
  }
}

const idle = await fetchArena(er, ARENA);
if (idle?.status !== "idle")
  throw new Error(`arena ${ARENA} is ${idle?.status ?? "missing"}, not idle`);

const driver = await bot("driver");
const trader = await bot("trader");
const driverAuth = sessionAuthority(driver.session);
const traderAuth = sessionAuthority(trader.session);

let arena: Arena = idle;
let updates = 0;
let lastLane = -1;
let steering: Promise<unknown> = Promise.resolve();
const stopArena = subscribeArena(er, ARENA, (next) => {
  if (next.status !== arena.status || next.seedReady !== arena.seedReady) {
    log(
      `arena ${next.status}${next.seedReady ? " (seed ready)" : ""} nonce ${next.nonce} t ${next.sim.t}`,
    );
  }
  arena = next;
  updates += 1;
  // Steer to the next row's safe lane, like the perfect bot, until STEER_UNTIL_TICK.
  if (next.status === "live" && !next.sim.busted && next.sim.t < STEER_UNTIL_TICK) {
    const lane = generateRow(next.seed, next.sim.row, next.sim.safeLane).safeLane;
    if (lane !== lastLane && lane !== next.sim.targetLane) {
      lastLane = lane;
      steering = sendEr(er, driver.session.keypair, [
        setInputIx({ auth: driverAuth, id: ARENA, targetLane: lane, nitro: false }),
      ]).catch((e: unknown) => log("set_input failed", e instanceof Error ? e.message : e));
    }
  }
});
const counts = new Map<string, number>();
let paidToTrader = 0n;
const stopEvents = subscribeEvents(er, (event) => {
  counts.set(event.name, (counts.get(event.name) ?? 0) + 1);
  if (event.name === "Trade")
    log(`Trade market ${event.data.market} ${event.data.side} shares ${tusdc(event.data.shares)}`);
  if (event.name === "LineCrossed")
    log(`LineCrossed market ${event.data.market} at t ${event.data.t}`);
  if (event.name === "RunSettled")
    log(`RunSettled t ${event.data.t} outcomes ${event.data.outcomes.join(", ")}`);
  if (event.name === "Claimed" && event.data.owner.equals(trader.wallet.publicKey)) {
    paidToTrader += event.data.paid;
    log(`Claimed market ${event.data.market} paid ${tusdc(event.data.paid)}`);
  }
});

await sendEr(er, driver.session.keypair, [
  startRunIx({
    auth: driverAuth,
    runner: driver.wallet.publicKey,
    house,
    id: ARENA,
    oracleQueue: endpoints.oracleQueue,
  }),
]);
log("start_run sent by the driver's session key");
await waitFor("the VRF seed", () => arena.seedReady || arena.status === "settled", 20_000);
if (!arena.seedReady) throw new Error("seed never arrived; the run aborted");

async function trade(market: number, side: Side, amount: bigint) {
  const pool = arena.markets[market];
  if (pool === undefined) throw new Error(`no market ${market}`);
  const quote = quoteBuy(buyTerms, pool, arena, side, amount);
  if (!quote.ok) throw new Error(`quote failed: ${quote.error}`);
  await sendEr(er, trader.session.keypair, [
    buyIx({
      auth: traderAuth,
      owner: trader.wallet.publicKey,
      house,
      id: ARENA,
      market,
      side,
      amount,
      minShares: minSharesFor(quote.quote.shares, 100),
    }),
  ]);
  log(
    `bought ${side.toUpperCase()} on market ${market} for ${tusdc(amount)}, quoted ${tusdc(quote.quote.shares)} shares`,
  );
}
await trade(0, "yes", 5n * TOKEN_UNIT);
await trade(2, "no", 3n * TOKEN_UNIT);

await waitFor("settlement", () => arena.status === "settled" || arena.status === "idle", 200_000);
await steering;
log(`run over at t ${arena.sim.t}; ${updates} arena updates received`);

const traderBalance = await fetchBalance(er, trader.wallet.publicKey);
const houseBalance = await fetchBalance(er, house);
if (traderBalance === null) throw new Error("trader balance missing");
const claims = claimableEntries(traderBalance, arena, houseBalance?.available);
for (const claim of claims) {
  log(`claiming entry ${claim.index}: expect ${claim.preview.kind} ${tusdc(claim.preview.paid)}`);
  await sendEr(er, trader.session.keypair, [
    claimIx({
      auth: traderAuth,
      owner: trader.wallet.publicKey,
      house,
      id: ARENA,
      entryIndex: claim.index,
    }),
  ]);
}
await sleep(1_000);

// The crank writes the driver's and the house's balances until the arena is idle again;
// the program refuses to undelegate them before that (BalanceInUse).
await waitFor("the arena to return to idle", () => arena.status === "idle", 20_000);

async function cashOut(name: string, wallet: Keypair, session: Session) {
  const onEr = await fetchBalance(er, wallet.publicKey);
  await sendEr(er, session.keypair, [
    undelegateBalanceIx({ auth: sessionAuthority(session), owner: wallet.publicKey }),
  ]);
  await waitForUndelegation(base, balancePda(wallet.publicKey).address, { timeoutMs: 60_000 });
  const available = onEr?.available ?? 0n;
  if (available > 0n)
    await sendBase(base, wallet, [
      withdrawIx({ owner: wallet.publicKey, mint, amount: available }),
    ]);
  await sendBase(base, wallet, [
    revokeSessionIx({ authority: wallet.publicKey, sessionSigner: session.keypair.publicKey }),
  ]);
  const tokens = await fetchTokenBalance(base, wallet.publicKey, mint);
  log(
    `${name} withdrew ${tusdc(available)}; wallet now holds ${tusdc(tokens)} (started with ${tusdc(FUNDS)})`,
  );
  return tokens;
}
stopArena();
stopEvents();
const driverEnd = await cashOut("driver", driver.wallet, driver.session);
const traderEnd = await cashOut("trader", trader.wallet, trader.session);

log("events", Object.fromEntries(counts));
const ok = (counts.get("Trade") ?? 0) >= 2 && claims.length > 0 && paidToTrader > 0n;
log(ok ? "SMOKE OK" : "SMOKE FAILED", {
  driverPnl: formatTokenAmount(driverEnd - FUNDS),
  traderPnl: formatTokenAmount(traderEnd - FUNDS),
  paidToTrader: formatTokenAmount(paidToTrader),
});
process.exit(ok ? 0 : 1);
