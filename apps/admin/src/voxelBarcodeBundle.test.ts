/**
 * 體素條碼 MUST BE REACHABLE ON THE HOST — the wiring guard.
 *
 * The page itself is proved by voxelBarcodeSave.test.ts, which mounts it and
 * reads back what it sends and what it paints. This file guards the three ways a
 * working page still reaches nobody:
 *
 *   1. IT IS NOT IN THE PRODUCTION BUNDLE. The nine 內容·素材管理 routes live
 *      behind App.tsx's `import.meta.env.DEV`-guarded `import("./ContentPage")`
 *      and rollup dead-folds the whole chunk away — contentGate.test.ts does not
 *      merely permit that, it ENFORCES it. A barcode editor that only exists on
 *      localhost cannot author the host the family plays on.
 *   2. IT IS NOT IN SESSION_REQUIRED_PAGES. An EAGER page left out of that set
 *      renders a fully interactive editor to a signed-out operator, who fills in
 *      eleven colours and learns on 儲存 that there was never a session.
 *   3. IT DRAGS IN A GRAPHICS LIBRARY. Babylon is what forces 鑄形工坊 to stay
 *      dev-only; this page's whole claim is that it needs none, and the claim
 *      has to be enforced or the next edit quietly breaks it.
 *
 * Two layers, as in voxelFoundryBundle.test.ts. The BEHAVIOURAL checks (the
 * session rule, the import graph) run on every `pnpm test`; the SOURCE checks
 * cover the shape rollup reads; and the REAL BUILD greps the emitted assets:
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
import { pageRequiresSession } from "./store";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");

/** Strip comments so this repo's long doc blocks cannot satisfy a check. */
const code = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const APP_SRC = read("apps/admin/src/ui/App.tsx");
const PAGE_SRC = read("apps/admin/src/ui/VoxelBarcodePage.tsx");
const MODEL_SRC = read("apps/admin/src/voxelBarcode.ts");

/** The string whose presence in the bundle IS the claim. */
const NAV_LABEL = "體素條碼";

describe("the route needs a real operator session", () => {
  it("pageRequiresSession says so — a behaviour, not a grep", () => {
    cover("admin-voxel-barcode-bundle");
    // its save is a platform admin `putOverlayDoc`, exactly like 內容覆蓋層 /
    // 體素鑄造廠 / 殭屍波系統
    expect(pageRequiresSession("voxelBarcode")).toBe(true);
    // sanity: the predicate is not just answering true to everything
    expect(pageRequiresSession("hub")).toBe(false);
    expect(pageRequiresSession("champions")).toBe(false);
  });
});

describe("the page is wired the EAGER way, not the dev-gated way", () => {
  it("App.tsx imports it as a top-level static import", () => {
    cover("admin-voxel-barcode-bundle");
    const src = code(APP_SRC);
    expect(src).toMatch(/^import \{ VoxelBarcodePage \} from ["']\.\/VoxelBarcodePage["'];/m);
    // never through a dynamic import — that is the shape rollup can dead-fold
    expect(src).not.toMatch(/import\(\s*["']\.\/VoxelBarcodePage["']\s*\)/);
  });

  it("the nav label lives in the eager shell, so it survives `vite build`", () => {
    cover("admin-voxel-barcode-bundle");
    const src = code(APP_SRC);
    expect(src).toContain(`page: "voxelBarcode"`);
    expect(src).toContain(NAV_LABEL);
    // and the route actually renders the page
    expect(src).toMatch(/page === "voxelBarcode" && <VoxelBarcodePage \/>/);
  });

  it("is NOT a member of the dev content suite", () => {
    cover("admin-voxel-barcode-bundle");
    // the dev chunk's routes are spliced in by name from ./ContentPage; a page
    // that appeared there would vanish from a production build
    const contentPage = code(read("apps/admin/src/ui/ContentPage.tsx"));
    expect(contentPage).not.toContain("voxelBarcode");
    expect(contentPage).not.toContain(NAV_LABEL);
  });
});

describe("the page carries no graphics library and no pixel path", () => {
  it("imports nothing from Babylon, and no canvas/image API appears", () => {
    cover("admin-voxel-barcode-bundle");
    for (const [name, src] of [
      ["VoxelBarcodePage.tsx", code(PAGE_SRC)],
      ["voxelBarcode.ts", code(MODEL_SRC)],
    ] as const) {
      expect(src, `${name} imports Babylon`).not.toMatch(/@babylonjs/);
      // the four ways a "no pixels" page starts producing pixels
      expect(src, `${name} reaches for a canvas`).not.toMatch(/getContext\(/);
      expect(src, `${name} builds an ImageData`).not.toMatch(/\bImageData\b/);
      expect(src, `${name} builds an OffscreenCanvas`).not.toMatch(/OffscreenCanvas/);
      expect(src, `${name} encodes a data URL`).not.toMatch(/toDataURL|createObjectURL/);
    }
  });

  it("never touches the loopback content-api (the #102 gate applies here too)", () => {
    cover("admin-voxel-barcode-bundle");
    // contentGate.test.ts enforces this across all of admin/src; restated here
    // so a change to THIS page fails in the file the change was made to
    expect(code(PAGE_SRC)).not.toContain("/content-api");
    expect(code(MODEL_SRC)).not.toContain("/content-api");
  });

  it("writes to the durable overlay key and to nothing else", () => {
    cover("admin-voxel-barcode-bundle");
    const src = code(PAGE_SRC);
    expect(src).toMatch(/putOverlayDoc\(BARCODE_COLLECTION, BARCODE_DOC_ID/);
    // it must never write the SEED sidecar — that key is a 400 at the platform
    // (an overlay id may not begin with an underscore), and the seed is the
    // repo's version-controlled baseline, not operator state
    expect(src).not.toMatch(/putOverlayDoc\([^)]*_voxel-barcodes/);
  });
});

// ---------------------------------------------------------------------------
// THE BUILD GATE — opt-in, because it runs a real production build.
//
//   GGD_BUILD_GATE=1 pnpm --filter @ggd/admin test
// ---------------------------------------------------------------------------

const BUILD_GATE = Boolean(process.env.GGD_BUILD_GATE);

describe("a real production build contains the page and still no Babylon", () => {
  it.runIf(BUILD_GATE)(
    "vite build emits the nav label and none of the graphics markers",
    () => {
      cover("admin-voxel-barcode-bundle");
      const out = mkdtempSync(join(tmpdir(), "ggd-admin-barcode-"));
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

        // THE claim: the page is IN the production bundle.
        expect(bundled, "體素條碼 was folded out of the production build").toContain(NAV_LABEL);
        // one of the page's own strings, so a surviving nav entry with no page
        // behind it does not pass
        expect(bundled).toContain("正規化佔比");

        // …and it did not smuggle the engine in with it
        for (const marker of ["ArcRotateCamera", "HemisphericLight", "BABYLON"]) {
          expect(bundled, `a production bundle must not contain ${marker}`).not.toContain(marker);
        }
        expect(bundled).not.toContain("/content-api");
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    },
    600_000,
  );

  it("names how to run the build gate when it is skipped", () => {
    cover("admin-voxel-barcode-bundle");
    expect(readFileSync(new URL(import.meta.url), "utf8")).toContain("GGD_BUILD_GATE=1");
  });
});
