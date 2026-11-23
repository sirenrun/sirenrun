import { runTrades } from "@sirenrun/indexer/queries";
import { db, unavailable } from "../../../../../../lib/server/db";
import { parseRun } from "../../../../../../lib/stats-api";

/** Every trade of one run so far, so a viewer who joins mid-run sees exact totals. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ arena: string; nonce: string }> },
): Promise<Response> {
  const p = await params;
  const run = parseRun(p.arena, p.nonce);
  if (run === null) return Response.json({ error: "bad run" }, { status: 400 });
  const sql = db();
  if (sql === null) return unavailable();
  try {
    return Response.json(await runTrades(sql, run.arena, run.nonce), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return unavailable();
  }
}
