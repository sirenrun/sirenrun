import {
  PROGRAM_ID,
  arenaPda,
  createConnections,
  isErRegion,
  parseEvents,
  subscribeEvents,
  type ErConnection,
} from "@sirenrun/sdk";
import { ARENAS } from "@sirenrun/sim";
import { apply, connect, getState, migrate, setState, type Sql } from "./db.ts";
import { toWrite } from "./rows.ts";

/**
 * Long-running worker: follows the program's logs on the Ephemeral Rollup and writes the
 * events the stats need into Postgres. On start it backfills what it missed while it was
 * down, from the newest signature it stored. Every write is idempotent.
 */

/** Most signatures to walk back on one start. Ticks dominate (10 a second per live arena). */
const MAX_BACKFILL = Number(process.env.INDEXER_MAX_BACKFILL ?? 6000);
const BACKFILL_CONCURRENCY = 6;
const CURSOR = "last_signature";

const arenaIds = new Map(
  Array.from({ length: ARENAS }, (_, id) => [arenaPda(id).address.toBase58(), id] as const),
);

const log = (...args: unknown[]) => console.log(new Date().toISOString(), ...args);

let skipped = 0;

/**
 * Writes one transaction's events. A transaction whose events do not decode (e.g. from a
 * program build before the current event layout) is skipped, not fatal.
 */
async function handle(sql: Sql, logs: readonly string[], signature: string, at: Date) {
  let events;
  try {
    events = parseEvents(logs);
  } catch {
    skipped += 1;
    return;
  }
  for (const event of events) {
    const write = toWrite(event, signature, at, arenaIds);
    if (write !== null) await apply(sql, write);
  }
}

async function backfill(sql: Sql, er: ErConnection) {
  const until = (await getState(sql, CURSOR)) ?? undefined;
  const signatures: { signature: string; err: unknown }[] = [];
  let before: string | undefined;
  while (signatures.length < MAX_BACKFILL) {
    const page = await er.getSignaturesForAddress(
      PROGRAM_ID,
      { before, until, limit: 1000 },
      "confirmed",
    );
    if (page.length === 0) break;
    signatures.push(...page);
    before = page.at(-1)?.signature;
    if (page.length < 1000) break;
  }
  const todo = signatures.filter((s) => s.err === null).reverse(); // oldest first
  log(`backfill: ${todo.length} transactions since ${until ?? "the start of the window"}`);
  let done = 0;
  for (let i = 0; i < todo.length; i += BACKFILL_CONCURRENCY) {
    await Promise.all(
      todo.slice(i, i + BACKFILL_CONCURRENCY).map(async ({ signature }) => {
        const tx = await er.getTransaction(signature, {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        });
        const logs = tx?.meta?.logMessages;
        if (logs === undefined || logs === null) return;
        const at = tx?.blockTime ? new Date(tx.blockTime * 1000) : new Date();
        await handle(sql, logs, signature, at).catch((e: unknown) =>
          log("backfill write failed", signature, e),
        );
      }),
    );
    done += Math.min(BACKFILL_CONCURRENCY, todo.length - i);
    if (done % 600 < BACKFILL_CONCURRENCY) log(`backfill: ${done}/${todo.length}`);
  }
  if (skipped > 0) log(`backfill: skipped ${skipped} transactions with undecodable events`);
  const newest = signatures[0]?.signature;
  if (newest !== undefined) await setState(sql, CURSOR, newest);
}

/** Retries a startup step with backoff: hosted Postgres can be slow to accept a first connection. */
async function retry<T>(what: string, fn: () => Promise<T>, attempts = 6): Promise<T> {
  for (let i = 1; ; i += 1) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts) throw e;
      const wait = Math.min(30_000, 1_000 * 2 ** i);
      log(`${what} failed (attempt ${i}/${attempts}), retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function main() {
  const sql = connect(process.env.DATABASE_URL);
  await retry("database connect", () => migrate(sql));
  const region = process.env.SIRENRUN_ER_REGION ?? "as";
  if (!isErRegion(region)) throw new Error(`unsupported SIRENRUN_ER_REGION "${region}"`);
  const { er } = createConnections({ cluster: "devnet", region });
  log(`indexer: program ${PROGRAM_ID.toBase58()}, ER region ${region}`);

  // Live first, so nothing lands between the backfill window and the subscription.
  let newest: string | null = null;
  let events = 0;
  const stop = subscribeEvents(
    er,
    (event, signature) => {
      const write = toWrite(event, signature, new Date(), arenaIds);
      if (write === null) return;
      events += 1;
      newest = signature;
      apply(sql, write).catch((e: unknown) => log("write failed", signature, e));
    },
    (e) => log("subscription error", e),
    "confirmed",
  );

  await backfill(sql, er).catch((e: unknown) => log("backfill failed", e));

  // The cursor only needs to be roughly current: overlap on restart is harmless.
  const timer = setInterval(() => {
    if (newest !== null) void setState(sql, CURSOR, newest).catch(() => {});
    log(`live: ${events} events written`);
  }, 60_000);

  const shutdown = async () => {
    clearInterval(timer);
    stop();
    if (newest !== null) await setState(sql, CURSOR, newest).catch(() => {});
    await sql.end({ timeout: 5 });
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
