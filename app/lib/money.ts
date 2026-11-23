import { TOKEN_UNIT } from "@sirenrun/sdk";

/** Inserts thousands separators into a string of digits. */
function group(digits: string): string {
  let out = "";
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ",";
    out += digits[i];
  }
  return out;
}

/**
 * tUSDC base units (6 decimals) as dollars: tUSDC is treated as 1 USD (docs/onchain-program.md,
 * Run economics). Rounds half away from zero to cents. `sign` puts "+" on gains, so a win
 * reads "+$9.80"; losses always carry "-".
 */
export function formatUsd(units: bigint | string, opts: { sign?: boolean } = {}): string {
  const value = typeof units === "string" ? BigInt(units) : units;
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const centUnit = TOKEN_UNIT / 100n;
  const cents = (abs + centUnit / 2n) / centUnit;
  const text = `$${group((cents / 100n).toString())}.${(cents % 100n).toString().padStart(2, "0")}`;
  if (cents === 0n) return text;
  if (negative) return `-${text}`;
  return opts.sign === true ? `+${text}` : text;
}

/** Compact dollars for headline numbers: exact cents under $1,000, then $12.4K, $3.1M. */
export function formatUsdShort(units: bigint | string): string {
  const value = typeof units === "string" ? BigInt(units) : units;
  const dollars = Number(value) / Number(TOKEN_UNIT);
  const abs = Math.abs(dollars);
  if (abs < 1_000) return formatUsd(value);
  const sign = dollars < 0 ? "-" : "";
  if (abs < 1_000_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
}

/** Tone of a PnL figure, for colour next to the sign already in the text. */
export function pnlTone(units: bigint | string): "up" | "down" | "flat" {
  const value = typeof units === "string" ? BigInt(units) : units;
  return value > 0n ? "up" : value < 0n ? "down" : "flat";
}
