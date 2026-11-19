import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import * as constants from "./constants.ts";

const rustSource = readFileSync(
  new URL("../../../programs/sirenrun/src/constants.rs", import.meta.url),
  "utf8",
);

function parseRustValue(raw: string): number | number[] {
  const parse = (n: string) => Number(n.trim().replaceAll("_", ""));
  return raw.startsWith("[") ? raw.slice(1, -1).split(",").map(parse) : parse(raw);
}

const rustConstants = Object.fromEntries(
  [...rustSource.matchAll(/^pub const (\w+): [^=]+= (.+);$/gm)].map(([, name, value]) => [
    name,
    parseRustValue(value ?? ""),
  ]),
);

it("mirrors every constant in programs/sirenrun/src/constants.rs", () => {
  expect(Object.keys(rustConstants).length).toBeGreaterThan(0);
  expect({ ...constants }).toEqual(rustConstants);
});
