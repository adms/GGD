/**
 * GH#1059 — the "why is this import relative?" prose in two headers said
 * tools/icon-gen had no package.json. It gained one at a3d4b8ac6 and nothing
 * went red (CLAUDE.md 第三守則: comments lie, verify). So the claim is now a
 * structured line — `ggd:workspace-package <dir>=yes|no …` — and this test
 * derives the truth from `existsSync(<dir>/package.json)` instead of trusting
 * the sentence. Both directions: a dir gaining a package.json (tools/testkit)
 * or losing one (tools/icon-gen) turns the stale claim red and names the file.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CLAIMANTS = ["tools/icon-gen/test/icon-gen.test.ts", "tools/testkit/findPython.ts"];

describe("workspace-package claims match package.json on disk (GH#1059)", () => {
  it.each(CLAIMANTS)("%s", (rel) => {
    const line = /ggd:workspace-package\s+([^\n]+)/.exec(readFileSync(join(REPO, rel), "utf8"))?.[1];
    expect(line, `${rel}: no \`ggd:workspace-package\` claim line — the header lost its pinned claim`).toBeDefined();
    const claims = [...line!.matchAll(/(\S+)=(yes|no)\b/g)].map((m) => [m[1]!, m[2] === "yes"] as const);
    expect(claims.length, `${rel}: claim line carries no <dir>=yes|no entries`).toBeGreaterThan(0);
    for (const [dir, claimed] of claims) {
      const actual = existsSync(join(REPO, dir, "package.json"));
      expect(
        actual,
        `${rel} claims ${dir} ${claimed ? "IS" : "is NOT"} a workspace package, but ${dir}/package.json ` +
          `${actual ? "exists" : "does not exist"} — fix the header (and revisit whether the relative import still has a reason)`,
      ).toBe(claimed);
    }
  });
});
