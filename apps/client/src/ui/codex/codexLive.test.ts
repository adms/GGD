/**
 * codex-no-baked-content — THE LIVENESS GATE.
 *
 * The user's load-bearing requirement for the codex is 「動態即時非寫死」: the page
 * must READ the real content at runtime. Edit a JSON under content/, reload,
 * see the change. So this is a source scan over the codex's source — both
 * apps/client/src/ui/codex/** and packages/shared/src/codex/** — in the spirit
 * of architecture.test.ts, that fails the build if the page ever grows a baked
 * copy of the content:
 *
 *   1. no JSON import anywhere in the directory (a generated snapshot is
 *      exactly what a `import data from "./codex-content.json"` looks like);
 *   2. no data file checked in beside the code;
 *   3. no reach into the content/ tree at build time (`../../../../content/…`);
 *   4. no literal content ids (`godie-…`) — the tell-tale of copied rows;
 *   5. no hardcoded collection sizes — the counts on the page must be the
 *      length of what was fetched, not a number someone typed;
 *   6. positively: the loader really does fetch `<collection>/_index.json` and
 *      each doc path over HTTP, and it is the ONLY module that fetches docs.
 *
 * `codexData.test.ts` covers the runtime half of the same claim (mutate the
 * served tree between two loads → the second load shows the new text).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";

const DIR = __dirname;

/**
 * THE GATE FOLLOWS THE CODE. The measurement half of the codex — the coverage
 * maths, the icon plan reader, the byte scanner and the shared types — now
 * lives in packages/shared, because the admin console counts from the same
 * modules and a second definition of "how many icons are missing" is exactly
 * what must never exist. Those files did not stop being the codex, so they do
 * not stop being scanned: if this list ever fell behind a move, the liveness
 * rules would quietly stop applying to the very modules that own the numbers.
 */
const SHARED_DIR = join(DIR, "../../../../../packages/shared/src/codex");
const DIRS = [DIR, SHARED_DIR] as const;

/** Every non-test source file in the codex directories. */
function sources(): string[] {
  return DIRS.flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .map((f) => join(dir, f)),
  );
}

/** strip comments so the prose in this file's own doc blocks can't trip it */
function readSource(p: string): string {
  return readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

/** a label a human can act on: bare filename here, package specifier there */
const rel = (p: string): string =>
  p.startsWith(DIR) ? p.slice(DIR.length + 1) : "@ggd/shared/codex/" + p.slice(SHARED_DIR.length + 1);

describe("codex is live, never baked (task #71)", () => {
  it("scans a real source tree", () => {
    cover("codex-no-baked-content");
    expect(sources().length).toBeGreaterThan(5);
  });

  it("imports no JSON — a generated snapshot could only arrive that way", () => {
    cover("codex-no-baked-content");
    const violations = sources().filter((f) => /(from|import)\s*\(?\s*["'][^"']*\.json["']/.test(readSource(f)));
    expect(violations.map(rel)).toEqual([]);
  });

  it("ships no data file beside the code", () => {
    cover("codex-no-baked-content");
    const stray = DIRS.flatMap((dir) =>
      readdirSync(dir)
        .map((f) => join(dir, f))
        .filter((p) => statSync(p).isFile() && !/\.tsx?$/.test(p)),
    );
    expect(stray.map(rel)).toEqual([]);
  });

  it("never reaches into the content/ tree at build time", () => {
    cover("codex-no-baked-content");
    const violations = sources().filter((f) => /["'][./]*(\.\.\/)+content\//.test(readSource(f)));
    expect(violations.map(rel)).toEqual([]);
  });

  it("contains no literal content id — nothing was copied out of a doc", () => {
    cover("codex-no-baked-content");
    const violations = sources().filter((f) => /godie-[a-z0-9]/i.test(readSource(f)));
    expect(violations.map(rel)).toEqual([]);
  });

  it("hardcodes no collection size — every count is a fetched length", () => {
    cover("codex-no-baked-content");
    // the shipped sizes today: 113 champions / 212 items / 554 abilities / 879 total
    const violations = sources().filter((f) => /\b(113|212|554|879)\b/.test(readSource(f)));
    expect(violations.map(rel)).toEqual([]);
  });

  it("the loader really reads the content mount over HTTP", () => {
    cover("codex-no-baked-content");
    const loader = readSource(join(DIR, "codexData.ts"));
    expect(loader).toMatch(/_index\.json/);
    expect(loader).toMatch(/CONTENT_BASE\s*=\s*"\/content"/);
    // the doc path comes from the index entry, so every doc is fetched by URL
    expect(loader).toMatch(/\$\{base\}\/\$\{e\.path\}|\$\{base\}\/\$\{collection\}/);
  });

  it("only the loader, the icon scanner and the dev-only writer may fetch", () => {
    cover("codex-no-baked-content");
    // codexEdit.ts is the task #96 write path: dev-build gated, loaded through a
    // guarded dynamic import, absent from a production bundle. It is the ONLY
    // module here allowed to send a mutating request, and codexEditGate.test.ts
    // holds it to that.
    // codexPlan.ts is a READ-ONLY GET of content/config/icon-plan.json on the
    // same live mount — the icon plan the broken-data table explains itself
    // with. It is here for exactly the reason this gate exists: the alternative
    // was importing the plan (or worse, re-typing its numbers into the source,
    // which is how the old note ended up claiming 695 stock icons when the real
    // figure is 584).
    const allowed = new Set([
      "codexData.ts",
      "codexEdit.ts",
      "@ggd/shared/codex/codexIcons.ts",
      "@ggd/shared/codex/codexPlan.ts",
    ]);
    const violations = sources().filter((f) => !allowed.has(rel(f)) && /\bfetch\s*\(/.test(readSource(f)));
    expect(violations.map(rel)).toEqual([]);
  });

  it("the page renders from the live loader, not from an import of content", () => {
    cover("codex-no-baked-content");
    expect(readSource(join(DIR, "useCodex.ts"))).toMatch(/loadCodex/);
    expect(readSource(join(DIR, "CodexPage.tsx"))).toMatch(/useCodex\(\)/);
  });
});
