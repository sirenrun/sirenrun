import { describe, expect, it } from "vitest";
import { formatUsd, formatUsdShort, pnlTone } from "./money";

describe("formatUsd", () => {
  it("shows wins with a plus sign", () => {
    expect(formatUsd(10_000_000n, { sign: true })).toBe("+$10.00");
    expect(formatUsd("9800000", { sign: true })).toBe("+$9.80");
  });

  it("always signs losses and never signs zero", () => {
    expect(formatUsd(-930_000n)).toBe("-$0.93");
    expect(formatUsd(0n, { sign: true })).toBe("$0.00");
    expect(formatUsd(-4_000n, { sign: true })).toBe("$0.00");
  });

  it("rounds half away from zero and groups thousands", () => {
    expect(formatUsd(5_000n)).toBe("$0.01");
    expect(formatUsd(-5_000n)).toBe("-$0.01");
    expect(formatUsd(1_234_567_890_000n)).toBe("$1,234,567.89");
    expect(formatUsd(123_000_000n)).toBe("$123.00");
  });
});

describe("formatUsdShort", () => {
  it("compacts big numbers", () => {
    expect(formatUsdShort(7_000_000n)).toBe("$7.00");
    expect(formatUsdShort(950_000_000n)).toBe("$950.00");
    expect(formatUsdShort(16_704_727n)).toBe("$16.70");
    expect(formatUsdShort(12_400_000_000n)).toBe("$12.4K");
    expect(formatUsdShort("3100000000000")).toBe("$3.1M");
  });
});

describe("pnlTone", () => {
  it("classifies gains and losses", () => {
    expect(pnlTone(1n)).toBe("up");
    expect(pnlTone("-1")).toBe("down");
    expect(pnlTone(0n)).toBe("flat");
  });
});
