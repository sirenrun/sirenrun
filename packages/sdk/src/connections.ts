import { Connection, PublicKey, type Commitment } from "@solana/web3.js";
import { VRF_EPHEMERAL_QUEUE, VRF_EPHEMERAL_TEST_QUEUE } from "./constants.ts";

export type Layer = "base" | "er";
export type Cluster = "devnet" | "local";

/** ER regions the app may use; every account must be delegated to the same one. */
export const ER_REGIONS = ["as", "eu"] as const;
export type ErRegion = (typeof ER_REGIONS)[number];

export interface Endpoints {
  cluster: Cluster;
  region: ErRegion | "local";
  baseRpc: string;
  baseWs: string;
  erRpc: string;
  erWs: string;
  /** Validator identity that delegated accounts must be assigned to. */
  validator: PublicKey;
  /** Oracle queue `start_run` requests randomness from. */
  oracleQueue: PublicKey;
}

const ER_VALIDATORS: Record<ErRegion, string> = {
  as: "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57",
  eu: "MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e",
};

const LOCAL_VALIDATOR = "mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev";

export function isErRegion(value: string): value is ErRegion {
  return (ER_REGIONS as readonly string[]).includes(value);
}

export interface EndpointOptions {
  cluster: Cluster;
  /** Devnet only. Defaults to `as`. */
  region?: ErRegion;
  /** Overrides the base RPC, e.g. a private devnet RPC to avoid rate limits. */
  baseRpc?: string;
  baseWs?: string;
}

export function endpoints(options: EndpointOptions): Endpoints {
  if (options.cluster === "local") {
    return {
      cluster: "local",
      region: "local",
      baseRpc: options.baseRpc ?? "http://127.0.0.1:8899",
      baseWs: options.baseWs ?? "ws://127.0.0.1:8900",
      erRpc: "http://127.0.0.1:7799",
      erWs: "ws://127.0.0.1:7800",
      validator: new PublicKey(LOCAL_VALIDATOR),
      oracleQueue: VRF_EPHEMERAL_TEST_QUEUE,
    };
  }
  const region = options.region ?? "as";
  if (!isErRegion(region)) {
    throw new Error(
      `unsupported ER region "${String(region)}", use one of ${ER_REGIONS.join(", ")}`,
    );
  }
  // MagicBlock's devnet RPC proxies Solana devnet with far looser rate limits than
  // api.devnet.solana.com, which throttles a browser that subscribes and polls.
  const baseRpc = options.baseRpc ?? "https://rpc.magicblock.app/devnet";
  return {
    cluster: "devnet",
    region,
    baseRpc,
    baseWs: options.baseWs ?? baseRpc.replace(/^http/, "ws"),
    erRpc: `https://devnet-${region}.magicblock.app`,
    erWs: `wss://devnet-${region}.magicblock.app`,
    validator: new PublicKey(ER_VALIDATORS[region]),
    oracleQueue: VRF_EPHEMERAL_QUEUE,
  };
}

/** A `Connection` tagged with the layer it talks to, so base and ER calls cannot be mixed. */
export type LayerConnection<L extends Layer> = Connection & { readonly layer: L };
export type BaseConnection = LayerConnection<"base">;
export type ErConnection = LayerConnection<"er">;

export interface Connections {
  endpoints: Endpoints;
  base: BaseConnection;
  er: ErConnection;
}

function tag<L extends Layer>(connection: Connection, layer: L): LayerConnection<L> {
  return Object.defineProperty(connection, "layer", {
    value: layer,
    enumerable: true,
  }) as LayerConnection<L>;
}

export function createConnections(
  options: EndpointOptions & { commitment?: Commitment },
): Connections {
  const urls = endpoints(options);
  const base = new Connection(urls.baseRpc, {
    commitment: options.commitment ?? "confirmed",
    wsEndpoint: urls.baseWs,
  });
  // The ER confirms in one 50 ms slot; "processed" is what the game and markets read.
  const er = new Connection(urls.erRpc, { commitment: "processed", wsEndpoint: urls.erWs });
  return { endpoints: urls, base: tag(base, "base"), er: tag(er, "er") };
}

/** Throws if `connection` is not tagged with `layer`. Guards untyped call sites. */
export function assertLayer<L extends Layer>(
  connection: Connection,
  layer: L,
): asserts connection is LayerConnection<L> {
  const actual = (connection as Partial<LayerConnection<Layer>>).layer;
  if (actual !== layer) {
    throw new Error(`expected the ${layer} connection, got ${actual ?? "an untagged connection"}`);
  }
}
