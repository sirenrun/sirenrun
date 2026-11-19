import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROGRAM_ID } from "./index";

const repoFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

describe("PROGRAM_ID", () => {
  it("matches Anchor.toml", () => {
    expect(repoFile("Anchor.toml")).toMatch(new RegExp(`^sirenrun = "${PROGRAM_ID}"$`, "m"));
  });

  it("matches declare_id! in the program", () => {
    expect(repoFile("programs/sirenrun/src/lib.rs")).toContain(`declare_id!("${PROGRAM_ID}");`);
  });
});
