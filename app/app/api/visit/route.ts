import { recordVisit } from "@sirenrun/indexer/queries";
import { db } from "../../../lib/server/db";
import { WindowCounter, clientIp, isVisitorId, parseWalletAddress } from "../../../lib/stats-api";

/**
 * Counts a visit: an anonymous id the browser made, plus the wallet if one is connected.
 * No IP, user agent or cookie is stored. Always answers 204 so a counting failure never
 * shows up for the visitor.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 20 reports per IP per 10 minutes: a reload loop or a script cannot pad the numbers. */
const limiter = new WindowCounter(20, 10 * 60_000);

export async function POST(req: Request): Promise<Response> {
  const sql = db();
  if (!limiter.allow(clientIp(req.headers), Date.now())) return new Response(null, { status: 204 });
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
