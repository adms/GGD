/**
 * GUARD: every render tree carries the global chrome (defect P0-6(b), shape S9).
 *
 * THE DEFECT THIS ENCODES. `main.tsx` has TWO `root.render(` sites: `<AppRoot/>`
 * normally, `<ReplayApp/>` when the URL carries `#replay=`. `AudioToggle`
 * (task #14 — "on every screen") and `VersionBadge` (task #66 — "pinned to the
 * bottom of EVERY screen") were mounted by hand inside AppRoot, so the replay
 * page — the one screen the owner screenshots for playtest feedback — had
 * neither. Nothing failed; the components simply did not exist there.
 *
 * WHY THIS TEST IS SOURCE-LEVEL. The failure is structural ("which tree mounts
 * what"), not behavioural, and the components involved portal to <body> and
 * touch the audio subsystem, which react-dom/server cannot render in this node
 * env. So the recipe from the audit is executed literally: enumerate every
 * `root.render(` in main.tsx, and require each rendered tree to render
 * `<GlobalChrome/>`. A THIRD entry point added later fails here until it is
 * either wired to GlobalChrome or explicitly listed as chrome-free.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

/** Components that must exist on every page, whichever entry booted it. */
const REQUIRED_CHROME = ["AudioToggle", "VersionBadge"] as const;

/**
 * Where each top-level tree component lives. A `root.render(<X/>)` whose X is
 * not in this map is an unreviewed second tree — the exact thing that hid the
 * defect — so the test fails rather than silently skipping it.
 */
const TREE_SOURCES: Record<string, string> = {
  AppRoot: "./platform/AppRoot.tsx",
  ReplayApp: "./replay/ReplayApp.tsx",
};

function renderedTrees(mainSrc: string): string[] {
  const names: string[] = [];
  const re = /root\.render\(\s*<([A-Z][A-Za-z0-9_]*)/g;
  for (let m = re.exec(mainSrc); m; m = re.exec(mainSrc)) names.push(m[1]!);
  return names;
}

describe("global chrome is in EVERY render tree (global-chrome-every-tree)", () => {
  it("main.tsx renders exactly the known trees — a new one must be reviewed", () => {
    cover("global-chrome-every-tree");
    const trees = renderedTrees(read("../main.tsx"));
    // Both entry points are still there: the normal app and the replay viewer.
    expect(trees).toContain("AppRoot");
    expect(trees).toContain("ReplayApp");
    for (const name of trees) {
      expect(
        Object.keys(TREE_SOURCES),
        `main.tsx renders <${name}/> as a top-level tree, but this guard does not know it. ` +
          "Add it to TREE_SOURCES and make it render <GlobalChrome/>, or the audio " +
          "toggle and the build stamp will silently not exist on that page.",
      ).toContain(name);
    }
  });

  it("every tree renders <GlobalChrome/> — including the replay tree", () => {
    cover("global-chrome-every-tree");
    for (const [name, rel] of Object.entries(TREE_SOURCES)) {
      const src = read(rel);
      expect(src, `${name} (${rel}) must render <GlobalChrome/>`).toContain("<GlobalChrome");
      expect(src, `${name} (${rel}) must import GlobalChrome`).toMatch(
        /import\s*\{[^}]*\bGlobalChrome\b[^}]*\}\s*from/,
      );
    }
  });

  it("GlobalChrome actually renders the audio toggle and the build stamp", () => {
    cover("global-chrome-every-tree");
    const src = read("./GlobalChrome.tsx");
    for (const name of REQUIRED_CHROME) {
      // imported AND rendered: importing without rendering is the same failure
      // one level down, and would leave the trees green while the page is bare.
      expect(src, `GlobalChrome must import ${name}`).toMatch(
        new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`),
      );
      expect(src, `GlobalChrome must render <${name}/>`).toContain(`<${name} />`);
    }
  });

  it("no tree mounts the global components directly any more", () => {
    cover("global-chrome-every-tree");
    // Hand-mounting is what let one tree drift from the other. Once GlobalChrome
    // exists, a direct <VersionBadge/> in a tree means someone re-forked it.
    for (const rel of Object.values(TREE_SOURCES)) {
      const src = read(rel);
      for (const name of REQUIRED_CHROME) {
        expect(src, `${rel} should mount ${name} via <GlobalChrome/>, not directly`).not.toContain(
          `<${name} />`,
        );
      }
    }
  });
});
