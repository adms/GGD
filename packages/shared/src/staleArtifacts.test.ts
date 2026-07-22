/**
 * Build-hygiene gate: no compiled `.js` may sit next to its `.ts` source.
 *
 * Every tsconfig here sets `noEmit`, but naming a file on the command line
 * (`tsc packages/shared/src/sim/content/registry.ts`) makes tsc ignore the
 * project config and emit a `.js` for that file AND every file it imports —
 * one such command scatters ~40 artifacts through src/.
 *
 * That is not merely untidy, it silently breaks the sim: Vite resolves
 * extensionless imports with `.js` ahead of `.ts`, so @ggd/shared's own
 * relative imports start loading the stale copy while bare `@ggd/shared/*`
 * specifiers keep resolving to the `.ts` through the package `exports` map.
 * The module-level registries in sim/content/registry.ts then exist twice:
 * `registerAll()` populates one instance and `Champions.get()` reads the other
 * and throws `content not registered: <id>`, even though content loaded fine.
 *
 * vitest.shared.ts pins `.ts` ahead of `.js` for the test runs, but the dev
 * server and the production build still use Vite's default order — so the
 * artifacts must simply not exist. This gate is what says so out loud.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../testkit/cover";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const SOURCE_TREES = ["packages", "apps", "tools"];
/** Real build output (git-ignored) and dependencies are none of our business. */
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "bin", ".git", "coverage"]);
const EMITTED = [".js", ".jsx", ".mjs", ".cjs"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** `foo.js` / `foo.js.map` is stray iff a `foo.ts` (or `.tsx`) sits beside it. */
function strayArtifacts(): string[] {
  const stray: string[] = [];
  for (const tree of SOURCE_TREES) {
    const root = join(REPO_ROOT, tree);
    if (!existsSync(root)) continue;
    for (const file of walk(root)) {
      const base = file.endsWith(".map") ? file.slice(0, -4) : file;
      const ext = EMITTED.find((e) => base.endsWith(e));
      if (!ext) continue;
      const stem = base.slice(0, -ext.length);
      if (existsSync(stem + ".ts") || existsSync(stem + ".tsx")) {
        stray.push(file.slice(REPO_ROOT.length + 1));
      }
    }
  }
  return stray.sort();
}

describe("build hygiene — no compiled output beside sources", () => {
  it("no .js/.js.map shadows a .ts source anywhere in packages/, apps/ or tools/", () => {
    cover("build-hygiene-no-stale-js");
    expect(
      strayArtifacts(),
      "delete these — a stray `tsc <file>` emitted them beside their sources, " +
        "and they shadow the .ts at resolve time (see the header comment)",
    ).toEqual([]);
  });
});
