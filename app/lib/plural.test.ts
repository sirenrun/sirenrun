import { expect, it } from "vitest";
import { plural } from "./plural";

it("uses the singular for exactly one", () => {
  expect(plural(1, "run")).toBe("1 run");
  expect(plural(0, "run")).toBe("0 runs");
  expect(plural(15, "trade")).toBe("15 trades");
});
