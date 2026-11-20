import { createConnections, isErRegion, type Connections } from "@sirenrun/sdk";

/**
 * Base and ER connections for the browser, created once. Next inlines `NEXT_PUBLIC_*`
 * values at build time, so they must be read with their full names.
 */
let cached: Connections | undefined;

export function chain(): Connections {
  if (cached === undefined) {
    const region = process.env.NEXT_PUBLIC_ER_REGION ?? "as";
    cached = createConnections({
      cluster: "devnet",
      region: isErRegion(region) ? region : "as",
      baseRpc: process.env.NEXT_PUBLIC_BASE_RPC || undefined,
    });
  }
  return cached;
}
