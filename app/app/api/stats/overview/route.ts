import { overview } from "@sirenrun/indexer/queries";
import { db, unavailable } from "../../../../lib/server/db";

/** Platform totals for the stats page. Read only; cached briefly at the edge. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const sql = db();
  if (sql === null) return unavailable();
  try {
    return Response.json(await overview(sql), {
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" },
    });
  } catch {
    return unavailable();
  }
}
