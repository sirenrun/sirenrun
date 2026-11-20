import { Connection } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  VRF_EPHEMERAL_QUEUE,
  VRF_EPHEMERAL_TEST_QUEUE,
  assertLayer,
  createConnections,
  endpoints,
  isErRegion,
  type BaseConnection,
  type ErConnection,
} from "./index.ts";

describe("endpoints", () => {
  it("default to the Asia ER on devnet", () => {
    const e = endpoints({ cluster: "devnet" });
    expect(e.erRpc).toBe("https://devnet-as.magicblock.app");
    expect(e.erWs).toBe("wss://devnet-as.magicblock.app");
    expect(e.validator.toBase58()).toBe("MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57");
    expect(e.oracleQueue.equals(VRF_EPHEMERAL_QUEUE)).toBe(true);
  });

  it("pair each region with its validator identity", () => {
    const e = endpoints({ cluster: "devnet", region: "eu" });
    expect(e.erRpc).toBe("https://devnet-eu.magicblock.app");
    expect(e.validator.toBase58()).toBe("MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e");
  });

  it("use the local stack ports and the test VRF queue", () => {
    const e = endpoints({ cluster: "local" });
    expect([e.baseRpc, e.baseWs, e.erRpc, e.erWs]).toEqual([
      "http://127.0.0.1:8899",
      "ws://127.0.0.1:8900",
      "http://127.0.0.1:7799",
      "ws://127.0.0.1:7800",
    ]);
    expect(e.oracleQueue.equals(VRF_EPHEMERAL_TEST_QUEUE)).toBe(true);
  });

  it("derive the base websocket from an overridden RPC", () => {
    const e = endpoints({ cluster: "devnet", baseRpc: "https://rpc.magicblock.app/devnet" });
    expect(e.baseWs).toBe("wss://rpc.magicblock.app/devnet");
  });

  it("reject the 2.0 region and unknown regions", () => {
    expect(isErRegion("us")).toBe(false);
    expect(() => endpoints({ cluster: "devnet", region: "us" as never })).toThrow(/unsupported/);
  });
});

describe("createConnections", () => {
  it("tags each connection with its layer", () => {
    const { base, er } = createConnections({ cluster: "local" });
    expect(base.layer).toBe("base");
    expect(er.layer).toBe("er");
    expect(base.rpcEndpoint).toBe("http://127.0.0.1:8899");
    expect(er.rpcEndpoint).toBe("http://127.0.0.1:7799");
    expect(er.commitment).toBe("processed");
  });

  it("asserts the layer at runtime", () => {
    const { base, er } = createConnections({ cluster: "local" });
    expect(() => assertLayer(base, "base")).not.toThrow();
    expect(() => assertLayer(base, "er")).toThrow(/expected the er connection, got base/);
    expect(() => assertLayer(new Connection("http://127.0.0.1:1"), "er")).toThrow(/untagged/);
    void er;
  });

  it("keeps base and ER connections apart at compile time", () => {
    const { base, er } = createConnections({ cluster: "local" });
    const onlyEr = (c: ErConnection) => c.layer;
    const onlyBase = (c: BaseConnection) => c.layer;
    expect(onlyEr(er)).toBe("er");
    expect(onlyBase(base)).toBe("base");
    // @ts-expect-error a base connection is not an ER connection
    onlyEr(base);
    // @ts-expect-error an ER connection is not a base connection
    onlyBase(er);
    // @ts-expect-error a plain Connection has no layer
    onlyEr(new Connection("http://127.0.0.1:1"));
  });
});
