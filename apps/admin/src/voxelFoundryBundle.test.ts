/**
 * 體素鑄造廠 MUST SHIP IN THE PRODUCTION ADMIN BUNDLE (task #229).
 *
 * WHY THIS FILE EXISTS. #229 asked for a 體素角色生成器 in 後台. One shipped —
 * 鑄形工坊 — and it is a good tool the owner cannot open: it lives behind
 * App.tsx's `import.meta.env.DEV`-guarded `import("./ContentPage")`, and
 * `contentGate.test.ts` does not merely permit that, it ENFORCES it, failing a
 * build whose output contains 鑄形工坊 / 體素角色生成器 / `ArcRotateCamera`.
 * That enforcement is correct — the studio drags ~1 MB of Babylon — and it is
 * also the reason the generator was, in practice, localhost-only. #242 hit the
 * same wall with Quick Approval and this file is deliberately its twin.
 *
 * So 體素鑄造廠 is a DIFFERENT page under the same generator core, built to the
 * three constraints a production bundle imposes, and this suite pins all three:
 *
 *   1. it is EAGER — a top-level static import with no DEV guard near it, and
 *      not a member of CONTENT_SUITE_PAGES;
 *   2. it is SESSION-GATED — its save is a platform admin write;
 *   3. it carries NO BABYLON — the constraint that decides whether it is
 *      allowed to be eager at all.
 *
 * Two layers, as in #242. The SOURCE assertions run on every `pnpm test`; the
 * REAL BUILD runs a `vite build --mode production` and greps the output:
 *
 *     GGD_BUILD_GATE=1 pnpm --filter @ggd/admin test
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");

/** Strip comments so the prose in this repo's long doc blocks cannot satisfy a check. */
const code = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const APP_SRC = read("apps/admin/src/ui/App.tsx");
const STORE_SRC = read("apps/admin/src/store.ts");
const PAGE_SRC = read("apps/admin/src/ui/VoxelFoundryPage.tsx");
const PAINT_SRC = read("apps/admin/src/ui/voxelFoundryPaint.ts");
const MODEL_SRC = read("apps/admin/src/assets/voxelFoundry.ts");

/** The strings whose presence in the bundle IS the claim. */
const NAV_LABEL = "體素鑄造廠";
const FORGE_LABEL = "鑄造模型";
const SAVE_LABEL = "寫入覆蓋層";

describe("體素鑄造廠 is wired the EAGER way, not the dev-gated way", () => {
  it("App.tsx imports the page as a top-level static import", () => {
    cover("adminui-voxel-foundry-bundle");
    const src = code(APP_SRC);
    expect(src).toMatch(/^import \{ VoxelFoundryPage \} from ["']\.\/VoxelFoundryPage["'];/m);
    // never through a dynamic import — that is the shape rollup can dead-fold
    expect(src).not.toMatch(/import\(\s*["']\.\/VoxelFoundryPage["']\s*\)/);
  });

  it("no DEV guard sits anywhere near the page or its label", () => {
    cover("adminui-voxel-foundry-bundle");
    const src = code(APP_SRC);
    for (const m of src.matchAll(/import\.meta\.env\.DEV/g)) {
      const at = m.index ?? 0;
      const window = src.slice(at, at + 400);
      expect(window, "a DEV guard must not reach 體素鑄造廠").not.toContain("VoxelFoundryPage");
      expect(window, "a DEV guard must not reach the nav label").not.toContain(NAV_LABEL);
    }
  });

  it("the nav label is written IN THE SHELL — not carried by a lazy chunk", () => {
    cover("adminui-voxel-foundry-bundle");
    const src = code(APP_SRC);
    expect(src).toContain(`label: "${NAV_LABEL}"`);
    expect(src).toMatch(/page:\s*"voxelForge"/);
    const suiteAt = src.indexOf("CONTENT_SUITE_PAGES");
    const suite = src.slice(suiteAt, src.indexOf("]", suiteAt));
    expect(suite).not.toContain("voxelForge");
  });

  it("the route is session-gated (its save is a platform admin write)", () => {
    cover("adminui-voxel-foundry-bundle");
    const src = code(STORE_SRC);
    const at = src.indexOf("SESSION_REQUIRED_PAGES");
    expect(at).toBeGreaterThan(0);
    const set = src.slice(at, src.indexOf("]", at));
    expect(set).toContain('"voxelForge"');
  });

  it("it writes through the PLATFORM overlay, never the loopback content-api", () => {
    cover("adminui-voxel-foundry-bundle");
    const src = code(PAGE_SRC);
    expect(src).toMatch(/putOverlayDoc/);
    // contentApi is the dev-gated loopback writer; touching it would fold this
    // page away exactly like the studio, and would break contentGate's walk
    // that proves contentApi.ts is the console's ONLY /content-api caller.
    expect(src).not.toMatch(/from\s+["']\.\.\/contentApi["']/);
    expect(code(MODEL_SRC)).not.toContain("/content-api");
    expect(src).not.toContain("/content-api");
  });

  it("carries NO 3D engine — the constraint that lets it be eager", () => {
    cover("adminui-voxel-foundry-bundle");
    // The whole page's preview is a 2D canvas over the shared figure. If this
    // ever regressed to Babylon, contentGate's build gate would fail on
    // ArcRotateCamera and the RIGHT fix would be to come back here, not to
    // weaken that gate.
    for (const src of [PAGE_SRC, PAINT_SRC, MODEL_SRC]) {
      expect(code(src)).not.toMatch(/@babylonjs/);
      expect(code(src)).not.toContain("ArcRotateCamera");
    }
    expect(code(PAINT_SRC)).toContain('getContext("2d")');
  });

  it("bakes through the SHARED generator, not a look-alike of its own", () => {
    cover("adminui-voxel-foundry-bundle");
    // 「不要 fork 第二個產生器」, checked as an import graph.
    expect(code(MODEL_SRC)).toMatch(/from\s+["']@ggd\/shared\/voxel["']/);
    expect(code(MODEL_SRC)).toMatch(/\bbakeLook\b/);
    expect(code(PAINT_SRC)).toMatch(/\bbuildFigure\b/);
  });

  it("reports the budget, and treats getting heavier as a FAILURE", () => {
    cover("adminui-voxel-foundry-bundle");
    const src = code(MODEL_SRC);
    // #226 exists because of weight; a generator page that emitted a file
    // without pricing it would be reintroducing the blindness.
    expect(src).toMatch(/RETIRED_MODELS/);
    expect(src).toMatch(/budgetVerdict/);
    expect(src).toMatch(/stats\.triangles < baseline\.triangles/);
    expect(src).toMatch(/stats\.bytes < baseline\.bytes/);
  });

  it("does not touch the owner-tuned stand-in scale overrides", () => {
    cover("adminui-voxel-foundry-bundle");
    // #77/#150 relativeScale numbers are lore, not derived data.
    for (const src of [PAGE_SRC, MODEL_SRC, PAINT_SRC]) {
      expect(code(src)).not.toMatch(/relativeScale\s*[:=]/);
    }
  });
});

// ---------------------------------------------------------------------------
// THE BUILD GATE — opt-in, because it runs a real production build.
//
//   GGD_BUILD_GATE=1 pnpm --filter @ggd/admin test
// ---------------------------------------------------------------------------

const BUILD_GATE = Boolean(process.env.GGD_BUILD_GATE);

describe("a real production build of the console CONTAINS 體素鑄造廠", () => {
  it.runIf(BUILD_GATE)(
    "vite build emits the nav label, the forge button and the generator",
    () => {
      cover("adminui-voxel-foundry-bundle");
      const out = mkdtempSync(join(tmpdir(), "ggd-admin-forge-build-"));
      try {
        execFileSync(
          "npx",
          ["vite", "build", "--outDir", out, "--emptyOutDir", "--mode", "production"],
          {
            cwd: join(REPO, "apps/admin"),
            stdio: "pipe",
            env: { ...process.env, NODE_ENV: "production" },
          },
        );
        const files: string[] = [];
        const walk = (dir: string): void => {
          for (const name of readdirSync(dir)) {
            const p = join(dir, name);
            if (statSync(p).isDirectory()) walk(p);
            else files.push(p);
          }
        };
        walk(out);
        const bundled = files
          .filter((f) => /\.(js|mjs|css|html)$/.test(f))
          .map((f) => readFileSync(f, "utf8"))
          .join("\n");
        expect(bundled.length).toBeGreaterThan(0);

        // THE CLAIM: the owner can open this page on the real deploy…
        expect(bundled, "the nav label must survive a production build").toContain(NAV_LABEL);
        expect(bundled, "the forge button must survive").toContain(FORGE_LABEL);
        expect(bundled, "the save button must survive").toContain(SAVE_LABEL);
        // …and it can really PRODUCE a file there: the glTF writer's own
        // constants are in the bundle, so the bake is not a stub.
        expect(bundled, "the GLB writer must be in the bundle").toContain("ggd-voxel-gen");
        expect(bundled, "the model doc path must be in the bundle").toContain(
          "assets/models/voxel",
        );
        expect(bundled, "the overlay write endpoint must be in the bundle").toContain(
          "/content-overlay/docs/",
        );

        // and it did NOT drag the dev editor or the engine in with it
        for (const marker of [
          "/content-api",
          "內容管理",
          "鑄形工坊",
          "體素角色生成器",
          "ArcRotateCamera",
          "HemisphericLight",
        ]) {
          expect(bundled, `體素鑄造廠 must not pull ${marker} into the bundle`).not.toContain(
            marker,
          );
        }
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    },
    600_000,
  );

  it("names how to run the build gate when it is skipped", () => {
    cover("adminui-voxel-foundry-bundle");
    expect(readFileSync(new URL(import.meta.url), "utf8")).toContain("GGD_BUILD_GATE=1");
  });
});
