import { overview } from "@sirenrun/indexer/queries";
import { db, unavailable } from "../../../../lib/server/db";

/** Platform totals for the stats page. Read only; cached briefly at the edge. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One database read serves every visitor for this long; the page refreshes every 30 s. */
const TTL_MS = 15_000;
let cached: { at: number; body: Awaited<ReturnType<typeof overview>> } | null = null;

export async function GET(): Promise<Response> {
  const sql = db();
  if (sql === null) return unavailable();
  try {
    const now = Date.now();
    if (cached === null || now - cached.at > TTL_MS)
      cached = { at: now, body: await overview(sql) };
    return Response.json(cached.body, {
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" },
    });
  } catch {
    return unavailable();
  }
}
