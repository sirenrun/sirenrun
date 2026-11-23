import { connect, type Sql } from "@sirenrun/indexer/db";

/**
 * One small Postgres pool per server process, kept on `globalThis` so dev hot reloads do not
 * open a new pool each time. Null when `DATABASE_URL` is unset: the stats routes then answer
 * 503 and the game carries on without them.
 */
const holder = globalThis as { sirenrunSql?: Sql };

export function db(): Sql | null {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === "") return null;
  holder.sirenrunSql ??= connect(url, 3);
  return holder.sirenrunSql;
}

export function unavailable(): Response {
  return Response.json({ error: "stats unavailable" }, { status: 503 });
}
