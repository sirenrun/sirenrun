import { recordVisit } from "@sirenrun/indexer/queries";
import { db } from "../../../lib/server/db";
import { isVisitorId, parseWalletAddress } from "../../../lib/stats-api";

/**
 * Counts a visit: an anonymous id the browser made, plus the wallet if one is connected.
 * No IP, user agent or cookie is stored. Always answers 204 so a counting failure never
 * shows up for the visitor.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const sql = db();
  const body: unknown = await req.json().catch(() => null);
  if (sql !== null && typeof body === "object" && body !== null) {
    const { id, wallet } = body as { id?: unknown; wallet?: unknown };
    if (isVisitorId(id)) {
      await recordVisit(sql, id, wallet === undefined ? null : parseWalletAddress(wallet)).catch(
        () => {},
      );
    }
  }
  return new Response(null, { status: 204 });
}
