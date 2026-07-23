/**
 * Codex duplicate-art scan — it must be ON DEMAND, never automatic.
 *
 * WHAT WENT WRONG. `useCodex` fired `hashIcons(declaredIconPaths(data))` two
 * seconds after the docs landed, on EVERY codex open, and `hashIcons` calls
 * `res.arrayBuffer()` on each path — the whole file, because a content hash
 * needs the content. Its only product is `duplicateIconGroups()`, the
 * supplementary duplicate-art table at the bottom of the page.
 *
 * WHY NOT THE .hash SIDECARS. tools/icon-gen writes `<out>.hash`, but it is an
 * IDEMPOTENCE hash over the generator INPUTS (template version + prompt +
 * family + model + quality), not a digest of the emitted image — two different
 * prompts that happen to emit identical art (exactly the bug being hunted) get
 * different sidecars. And none exist for icons anyway. Both facts are asserted
 * below against the real tree, so if the pipeline ever starts emitting true
 * content digests for icons, this test fails and the decision gets revisited.
 *
 * Node env: the cost is measured off the content on disk and the button is
 * rendered through react-dom/server (same approach as AudioToggle.test).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { declaredIconPaths } from "./useCodex";
import { CodexIssueTable } from "./CodexIssueTable";
import type { CodexData } from "@ggd/shared/codex/codexTypes";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..", "..");
const CONTENT = join(REPO, "content");

function docsIn(dir: string): Record<string, unknown>[] {
  const abs = join(CONTENT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(readFileSync(join(abs, f), "utf8")) as Record<string, unknown>);
}

/** The real content, shaped as the codex sees it (only `icon` matters here). */
function realCodexData(): CodexData {
  return {
    champions: docsIn("champions"),
    abilities: docsIn("abilities"),
    items: docsIn("items"),
  } as unknown as CodexData;
}

describe("codex icon-byte scan is opt-in (not an automatic 1.8 MB download)", () => {
  it("measures what the automatic scan used to cost, off the real content", () => {
    cover("codex-icon-scan-cost-measured");
    const paths = declaredIconPaths(realCodexData());
    expect(paths.length).toBe(new Set(paths).size); // distinct by construction
    expect(paths.length).toBeGreaterThan(200); // 279 today

    let bytes = 0;
    let onDisk = 0;
    for (const p of paths) {
      const f = join(CONTENT, p);
      if (!existsSync(f)) continue;
      onDisk++;
      bytes += statSync(f).size;
    }
    expect(onDisk).toBe(paths.length); // every declared icon is servable
    // ~1.83 MB. The exact figure moves as art is regenerated; what must not
    // move is the ORDER OF MAGNITUDE being paid for a supplementary report.
    expect(bytes).toBeGreaterThan(1_000_000);
  });

  it("useCodex has no timer-driven scan left in it", () => {
    cover("codex-icon-scan-not-automatic");
    const src = readFileSync(join(HERE, "useCodex.ts"), "utf8");
    // exactly one live call site (the other match is the header's post-mortem)
    expect(src.match(/hashIcons\(declaredIconPaths\(data\), \{ concurrency/g)?.length).toBe(1);
    expect(src).toMatch(/const startIconScan = useCallback\(/);
    // and nothing schedules it
    expect(src).not.toMatch(/setTimeout/);
    expect(src).not.toMatch(/ICON_SCAN_DELAY_MS/);
  });

  it("the report offers a button that states the cost, and hides it while running", () => {
    cover("codex-icon-scan-button");
    let started = 0;
    const idle = renderToStaticMarkup(
      createElement(CodexIssueTable, {
        groups: [],
        iconScan: "idle" as const,
        iconScanFileCount: 279,
        onStartIconScan: () => started++,
        onJump: () => {},
      }),
    );
    expect(idle).toContain("掃描圖示位元組");
    expect(idle).toContain("279"); // the price is on the button, not hidden
    expect(idle).toContain("<button");

    const running = renderToStaticMarkup(
      createElement(CodexIssueTable, {
        groups: [],
        iconScan: "running" as const,
        iconScanFileCount: 279,
        onStartIconScan: () => started++,
        onJump: () => {},
      }),
    );
    expect(running).not.toContain("<button");
    expect(running).toContain("掃描中");

    const done = renderToStaticMarkup(
      createElement(CodexIssueTable, {
        groups: [],
        iconScan: "done" as const,
        iconScanFileCount: 279,
        onStartIconScan: () => started++,
        onJump: () => {},
      }),
    );
    expect(done).not.toContain("掃描圖示位元組");
    // static markup never invokes handlers — the point is only that nothing
    // in the render path can start a 1.8 MB download by itself.
    expect(started).toBe(0);
  });

  it("the .hash sidecars could not have replaced the scan (and none exist for icons)", () => {
    cover("codex-icon-hash-sidecars-unusable");
    const iconRoot = join(CONTENT, "assets", "icons");
    const sidecars: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".hash")) sidecars.push(p);
      }
    };
    walk(iconRoot);
    expect(sidecars).toEqual([]);

    // …and the generator that WOULD write them hashes its inputs, not the PNG.
    const gen = readFileSync(join(REPO, "tools", "icon-gen", "src", "generate.py"), "utf8");
    expect(gen).toContain("sha256 of everything that");
    expect(gen).toContain("determines the image: the pinned template version, the full prompt");
    expect(gen).not.toContain("sha256 of the image"); // it is NOT a content digest
  });
});
