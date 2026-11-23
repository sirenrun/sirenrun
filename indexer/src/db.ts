import postgres from "postgres";
import type { Write } from "./rows.ts";
import { SCHEMA } from "./schema.ts";

export type Sql = postgres.Sql;

/** One small pool per process; Neon's pooler handles the rest. */
export function connect(url: string | undefined, max = 5): Sql {
  if (url === undefined || url === "") throw new Error("DATABASE_URL is not set");
  return postgres(url, { max, idle_timeout: 30, connect_timeout: 30, onnotice: () => {} });
}

export async function migrate(sql: Sql): Promise<void> {
  await sql.unsafe(SCHEMA);
}

/**
 * Applies one event. Every write is idempotent (keyed by signature or run), so the live
 * feed and a backfill can overlap without double counting.
 */
export async function apply(sql: Sql, w: Write): Promise<void> {
  switch (w.kind) {
    case "runStarted":
      await sql`
        insert into runs (arena, nonce, runner, entry_fee, bond, started_at)
        values (${w.arena}, ${w.nonce}, ${w.runner}, ${w.entryFee}, ${w.bond}, ${w.at})
        on conflict (arena, nonce) do update
          set entry_fee = excluded.entry_fee, bond = excluded.bond,
              started_at = least(runs.started_at, excluded.started_at)`;
      return;
    case "runSettled":
      // A run whose start was missed still gets a row; its stake stays 0 until a backfill
      // finds the start.
      await sql`
        insert into runs (arena, nonce, runner, started_at, settled_at, t, outcomes,
                          runner_fees, runner_paid)
        values (${w.arena}, ${w.nonce}, ${w.runner}, ${w.at}, ${w.at}, ${w.t},
                ${w.outcomes}, ${w.runnerFees}, ${w.runnerPaid})
        on conflict (arena, nonce) do update
          set settled_at = excluded.settled_at, t = excluded.t, outcomes = excluded.outcomes,
              runner_fees = excluded.runner_fees, runner_paid = excluded.runner_paid`;
      return;
    case "trade":
      await sql`
        insert into trades (signature, market, arena, nonce, side, owner, amount, net, shares, at)
        values (${w.signature}, ${w.market}, ${w.arena}, ${w.nonce}, ${w.side}, ${w.owner},
                ${w.amount}, ${w.net}, ${w.shares}, ${w.at})
        on conflict do nothing`;
      return;
    case "claim":
      await sql`
        insert into claims (signature, owner, arena, nonce, market, paid, at)
        values (${w.signature}, ${w.owner}, ${w.arena}, ${w.nonce}, ${w.market}, ${w.paid}, ${w.at})
        on conflict do nothing`;
      return;
    case "nitro":
      await sql`
        insert into nitros (signature, arena, nonce, runner, fee, at)
        values (${w.signature}, ${w.arena}, ${w.nonce}, ${w.runner}, ${w.fee}, ${w.at})
        on conflict do nothing`;
      return;
  }
}

export async function getState(sql: Sql, key: string): Promise<string | null> {
  const rows = await sql<{ value: string }[]>`select value from indexer_state where key = ${key}`;
  return rows[0]?.value ?? null;
}

export async function setState(sql: Sql, key: string, value: string): Promise<void> {
  await sql`
    insert into indexer_state (key, value) values (${key}, ${value})
    on conflict (key) do update set value = excluded.value`;
}
