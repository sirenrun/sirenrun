// Admin rescue for an arena stuck in Settled (its crank can no longer run).
// Usage: SIRENRUN_ARENA=0 pnpm --filter @sirenrun/scripts recover-arena
import { fetchArena, recoverArenaIx, sendEr } from "@sirenrun/sdk";
import { adminKeypair, connections, log } from "./env.ts";

const id = Number(process.env.SIRENRUN_ARENA ?? 0);
const admin = adminKeypair();
const { er } = connections();

const before = await fetchArena(er, id);
log(
  `arena ${id} is ${before?.status ?? "missing"} (nonce ${before?.nonce}, phase ${before?.phaseTicks})`,
);
if (before?.status !== "settled") {
  log("nothing to do: only a settled arena can be recovered");
  process.exit(0);
}
await sendEr(er, admin, [recoverArenaIx({ admin: admin.publicKey, id })]);
const after = await fetchArena(er, id);
log(`arena ${id} is now ${after?.status}`);
