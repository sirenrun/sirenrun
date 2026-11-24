// One-time setup: config, the house balance (funded and delegated) and three delegated
// arenas. Safe to re-run: every step checks what already exists.
// Usage: SIRENRUN_MINT=<mint> pnpm --filter @sirenrun/scripts init-devnet
import {
  TOKEN_UNIT,
  arenaPda,
  associatedTokenAddress,
  balancePda,
  createAtaIx,
  delegateArenaIx,
  delegateBalanceIx,
  depositIx,
  fetchBalance,
  fetchConfig,
  initArenaIx,
  initBalanceIx,
  initConfigIx,
  isDelegated,
  mintToIx,
  sendBase,
  waitForDelegation,
  type BaseInstruction,
} from "@sirenrun/sdk";
import { ARENAS } from "@sirenrun/sim";
import { adminKeypair, connections, log, mintAuthority, mintFromEnv } from "./env.ts";

/** Starting house funds: covers the 3 × 50 tUSDC pools of many concurrent runs. */
const HOUSE_DEPOSIT = 10_000n * TOKEN_UNIT;

const admin = adminKeypair();
const minter = mintAuthority();
const mint = mintFromEnv();
const { base, er, endpoints } = connections();
log("cluster", endpoints.cluster, "ER", endpoints.erRpc, "validator", endpoints.validator);

const exists = async (address: Parameters<typeof base.getAccountInfo>[0]) =>
  (await base.getAccountInfo(address)) !== null;

const config = await fetchConfig(base);
if (config === null) {
  await sendBase(base, admin, [
    initConfigIx({
      admin: admin.publicKey,
      mint,
      params: {
        house: admin.publicKey,
        feeBps: 200,
        runnerFeeBps: 200,
        // Run economics, from simulated drivers and crowds of 0 to 100 traders: see
        // docs/onchain-program.md, "Run economics".
        entryFee: TOKEN_UNIT / 2n,
        bond: 5n * TOKEN_UNIT,
        liquidity: 50n * TOKEN_UNIT,
        maxBuy: 50n * TOKEN_UNIT,
        nitroFee: TOKEN_UNIT / 4n,
        openBps: [8_500, 4_500, 1_500],
        // Validator 2.0 runs 10 ms slots and the crank every 10; 8 leaves room for jitter.
        minTickSlots: 8,
      },
    }),
  ]);
  log("config created");
} else if (!config.mint.equals(mint)) {
  throw new Error(`config already uses mint ${config.mint.toBase58()}`);
} else {
  log("config exists");
}

const house = balancePda(admin.publicKey).address;
if (!(await isDelegated(base, house))) {
  const steps: BaseInstruction[] = [];
  if (!(await exists(house))) steps.push(initBalanceIx({ owner: admin.publicKey }));
  const current = (await fetchBalance(base, admin.publicKey))?.available ?? 0n;
  if (current < HOUSE_DEPOSIT) {
    const amount = HOUSE_DEPOSIT - current;
    steps.push(
      createAtaIx({ payer: admin.publicKey, owner: admin.publicKey, mint }),
      mintToIx({
        mint,
        destination: associatedTokenAddress(admin.publicKey, mint),
        authority: minter.publicKey,
        amount,
      }),
      depositIx({ owner: admin.publicKey, mint, amount }),
    );
  }
  steps.push(delegateBalanceIx({ owner: admin.publicKey, validator: endpoints.validator }));
  await sendBase(base, admin, steps, { extraSigners: [minter] });
  await waitForDelegation(base, er, house, { timeoutMs: 60_000 });
  log("house balance funded and delegated");
} else {
  log("house balance already delegated");
}

for (let id = 0; id < ARENAS; id += 1) {
  const arena = arenaPda(id).address;
  if (await isDelegated(base, arena)) {
    log(`arena ${id} already delegated`);
    continue;
  }
  const steps: BaseInstruction[] = [];
  if (!(await exists(arena))) steps.push(initArenaIx({ admin: admin.publicKey, id }));
  steps.push(delegateArenaIx({ admin: admin.publicKey, id, validator: endpoints.validator }));
  await sendBase(base, admin, steps);
  await waitForDelegation(base, er, arena, { timeoutMs: 60_000 });
  log(`arena ${id} delegated`, arena);
}

const onEr = await fetchBalance(er, admin.publicKey);
log("house available on the ER", onEr?.available);
