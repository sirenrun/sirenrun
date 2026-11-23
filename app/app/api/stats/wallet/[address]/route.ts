import { walletStats } from "@sirenrun/indexer/queries";
import { db, unavailable } from "../../../../../lib/server/db";
import { parseWalletAddress } from "../../../../../lib/stats-api";

/** One wallet's trading and driving PnL. Wallet activity is public onchain; nothing private here. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ address: string }> },
): Promise<Response> {
  const wallet = parseWalletAddress((await params).address);
  if (wallet === null) return Response.json({ error: "bad wallet" }, { status: 400 });
  const sql = db();
  if (sql === null) return unavailable();
  try {
    return Response.json(await walletStats(sql, wallet), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return unavailable();
  }
}
