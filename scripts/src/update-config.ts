// Changes run economics in the onchain Config. Without --apply it only reads: prints the
// current settings, the proposed ones and the house balance, and loads no key.
// Usage:
//   pnpm --filter @sirenrun/scripts update-config -- --bond 10 --runner-fee-bps 150
//   pnpm --filter @sirenrun/scripts update-config -- --bond 10 --runner-fee-bps 150 --apply
// Runs already in progress keep the terms they started with; new runs use the new ones.
// A Config from before `min_tick_slots` is grown first (resize_config) in the same transaction.
import {
  TOKEN_UNIT,
  configPda,
  decodeConfig,
  fetchBalance,
  formatTokenAmount,
  resizeConfigIx,
  sendBase,
  updateConfigIx,
  type ConfigParams,
} from "@sirenrun/sdk";
import { adminKeypair, connections, log } from "./env.ts";

/** Token amounts are given in whole tUSDC with up to 6 decimals, e.g. "10" or "0.5". */
function tokens(text: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(text)) throw new Error(`not a tUSDC amount: ${text}`);
  const [whole = "0", frac = ""] = text.split(".");
  return BigInt(whole) * TOKEN_UNIT + BigInt(frac.padEnd(6, "0"));
}

/** `Config::SPACE` onchain; a Config written before `min_tick_slots` is one byte shorter. */
const CONFIG_SPACE = 189;

function slots(text: string): number {
  if (!/^\d{1,3}$/.test(text) || Number(text) > 255) throw new Error(`not a slot count: ${text}`);
  return Number(text);
}

function bps(text: string): number {
  if (!/^\d{1,5}$/.test(text)) throw new Error(`not a bps value: ${text}`);
  return Number(text);
}

const args = process.argv.slice(2).filter((a) => a !== "--");
const apply = args.includes("--apply");
const flags = new Map<string, string>();
for (let i = 0; i < args.length; i += 1) {
  const a = args[i] ?? "";
  if (a.startsWith("--") && a !== "--apply") {
    const value = args[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${a} needs a value`);
    flags.set(a.slice(2), value);
    i += 1;
  }
}
const known = [
  "bond",
  "entry-fee",
  "nitro-fee",
  "liquidity",
  "max-buy",
  "fee-bps",
  "runner-fee-bps",
  "min-tick-slots",
];
for (const key of flags.keys()) {
  if (!known.includes(key)) throw new Error(`unknown option --${key} (known: ${known.join(", ")})`);
}

const { base, er } = connections();
const account = await base.getAccountInfo(configPda().address);
if (account === null) throw new Error("no Config on this cluster; run init-devnet first");
const needsResize = account.data.length < CONFIG_SPACE;
// Read an old Config as if its missing `min_tick_slots` were 0 (guard off), which is what
// resize_config writes.
const config = decodeConfig(
  needsResize
    ? Buffer.concat([account.data, Buffer.alloc(CONFIG_SPACE - account.data.length)])
    : account.data,
);

const get = (key: string) => flags.get(key);
const next: ConfigParams = {
  house: config.house,
  feeBps: get("fee-bps") !== undefined ? bps(get("fee-bps") ?? "") : config.feeBps,
  runnerFeeBps:
    get("runner-fee-bps") !== undefined ? bps(get("runner-fee-bps") ?? "") : config.runnerFeeBps,
  entryFee: get("entry-fee") !== undefined ? tokens(get("entry-fee") ?? "") : config.entryFee,
  bond: get("bond") !== undefined ? tokens(get("bond") ?? "") : config.bond,
  liquidity: get("liquidity") !== undefined ? tokens(get("liquidity") ?? "") : config.liquidity,
  maxBuy: get("max-buy") !== undefined ? tokens(get("max-buy") ?? "") : config.maxBuy,
  nitroFee: get("nitro-fee") !== undefined ? tokens(get("nitro-fee") ?? "") : config.nitroFee,
  openBps: [config.openBps[0] ?? 0, config.openBps[1] ?? 0, config.openBps[2] ?? 0],
  minTickSlots:
    get("min-tick-slots") !== undefined ? slots(get("min-tick-slots") ?? "") : config.minTickSlots,
};
// Mirrors ConfigParams::validate in the program, so a bad change fails before signing.
if (next.runnerFeeBps > next.feeBps || next.feeBps > 10_000 || next.liquidity === 0n) {
  throw new Error("invalid: runner fee must be at most the fee, fee at most 100%, liquidity > 0");
}

const pct = (b: number) => `${b / 100}%`;
const rows: [string, string, string][] = [
  ["trade fee", pct(config.feeBps), pct(next.feeBps)],
  ["  to the driver", pct(config.runnerFeeBps), pct(next.runnerFeeBps)],
  [
    "  to the house",
    pct(config.feeBps - config.runnerFeeBps),
    pct(next.feeBps - next.runnerFeeBps),
  ],
  ["entry fee", formatTokenAmount(config.entryFee), formatTokenAmount(next.entryFee)],
  ["bond", formatTokenAmount(config.bond), formatTokenAmount(next.bond)],
  ["nitro, per charge", formatTokenAmount(config.nitroFee), formatTokenAmount(next.nitroFee)],
  ["liquidity per line", formatTokenAmount(config.liquidity), formatTokenAmount(next.liquidity)],
  ["max single buy", formatTokenAmount(config.maxBuy), formatTokenAmount(next.maxBuy)],
  ["min slots per tick", String(config.minTickSlots), String(next.minTickSlots)],
];
for (const [name, now, then] of rows) {
  log(
    `${name.padEnd(20)} ${now.padStart(10)} -> ${then.padStart(10)}${now === then ? "" : "   changed"}`,
  );
}

const house = await fetchBalance(er, config.house);
log(
  `house ${config.house.toBase58()}: ${house === null ? "no balance on the rollup" : `${formatTokenAmount(house.available)} tUSDC available on the rollup`}`,
);

if (needsResize) log("config predates min_tick_slots: --apply resizes it first");

if (!apply) {
  log("dry run: nothing sent. Add --apply to sign with the admin key.");
} else {
  const admin = adminKeypair();
  if (!admin.publicKey.equals(config.admin)) {
    throw new Error(
      `the admin key is ${config.admin.toBase58()}, not ${admin.publicKey.toBase58()}`,
    );
  }
  const signature = await sendBase(base, admin, [
    ...(needsResize ? [resizeConfigIx({ admin: admin.publicKey })] : []),
    updateConfigIx({ admin: admin.publicKey, params: next }),
  ]);
  log("config updated", signature);
}
