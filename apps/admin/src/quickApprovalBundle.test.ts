/**
 * Quick Approval MUST SHIP IN THE PRODUCTION ADMIN BUNDLE (task #242,
 * requirement 1) — the exact INVERSE of contentGate.test.ts's describe "C".
 *
 * WHY THIS FILE EXISTS AT ALL. ui/App.tsx carries a bare
 * `if (!import.meta.env.DEV) return;` immediately above a statically-analysable
 * `import("./ContentPage")`. Vite substitutes the flag with `false`, rollup
 * proves the chunk unreachable, and the production console does not merely HIDE
 * 內容管理 — it does not CONTAIN it. Verified: a real `vite build --mode
 * production` of this app emits ONE chunk and zero lazily-emitted chunks, and
 * grepping it for 內容管理 / 英雄管理 / 鑄形工坊 / ArcRotateCamera returns nothing.
 *
 * That mechanism is correct for a dev-only editor and FATAL for this page. The
 * owner asked for Quick Approval because he kept hitting "only you can do this
 * step" on ggd.adms.ai — the remote family deploy, from a phone. A Quick
 * Approval that folded away in production would be usable only on the one
 * machine that never needed it.
 *
 * So there are two layers here, and the cheap one runs on every `pnpm test`:
 *
 *   1. A SOURCE assertion (always on): App.tsx imports the page as a top-level
 *      static import, and the string does not appear anywhere near an
 *      `import.meta.env.DEV` guard. This catches the mistake in milliseconds,
 *      including on a machine that never opts into the build gate.
 *   2. The REAL BUILD (GGD_BUILD_GATE=1): run the same production build
 *      contentGate.test.ts runs and assert the emitted bundle CONTAINS the nav
 *      label and the submit label. Only a real rollup pass can prove this —
 *      source that "looks eager" can still be dead-folded by a future refactor.
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

/** The two strings whose presence in the bundle IS the claim. */
const NAV_LABEL = "Quick Approval";
const SUBMIT_LABEL = "一鍵送出確認";

describe("Quick Approval is wired the EAGER way, not the dev-gated way", () => {
  it("App.tsx imports the page as a top-level static import", () => {
    cover("adminui-quick-approval-bundle");
    const src = code(APP_SRC);
    expect(src).toMatch(
      /^import \{ QuickApprovalPage \} from ["']\.\/QuickApprovalPage["'];/m,
    );
    // never through a dynamic import — that is the shape rollup can dead-fold
    expect(src).not.toMatch(/import\(\s*["']\.\/QuickApprovalPage["']\s*\)/);
  });

  it("no DEV guard sits anywhere near the page or its label", () => {
    cover("adminui-quick-approval-bundle");
    const src = code(APP_SRC);
    // the same 400-char window contentGate.test.ts uses to prove the OPPOSITE
    // about ./ContentPage, applied to every DEV guard in the file
    for (const m of src.matchAll(/import\.meta\.env\.DEV/g)) {
      const at = m.index ?? 0;
      const window = src.slice(at, at + 400);
      expect(window, "a DEV guard must not reach the Quick Approval page").not.toContain(
        "QuickApprovalPage",
      );
      expect(window, "a DEV guard must not reach the Quick Approval nav label").not.toContain(
        NAV_LABEL,
      );
    }
  });

  it("the nav label is written IN THE SHELL — not carried by a lazy chunk", () => {
    cover("adminui-quick-approval-bundle");
    const src = code(APP_SRC);
    expect(src).toContain(`label: "${NAV_LABEL}"`);
    expect(src).toMatch(/page:\s*"quickApproval"/);
    // and it is NOT a member of the dev content suite
    const suiteAt = src.indexOf("CONTENT_SUITE_PAGES");
    const suite = src.slice(suiteAt, src.indexOf("]", suiteAt));
    expect(suite).not.toContain("quickApproval");
  });

  it("the route is session-gated (every write is platform-admin-backed)", () => {
    cover("adminui-quick-approval-bundle");
    const src = code(STORE_SRC);
    const at = src.indexOf("SESSION_REQUIRED_PAGES");
    expect(at).toBeGreaterThan(0);
    const set = src.slice(at, src.indexOf("]", at));
    expect(set).toContain('"quickApproval"');
  });
});

// ---------------------------------------------------------------------------
// THE BUILD GATE — opt-in, because it runs a real production build.
//
//   GGD_BUILD_GATE=1 pnpm --filter @ggd/admin test
// ---------------------------------------------------------------------------

const BUILD_GATE = Boolean(process.env.GGD_BUILD_GATE);

describe("a real production build of the console CONTAINS Quick Approval", () => {
  it.runIf(BUILD_GATE)(
    "vite build emits the nav label and the submit button",
    () => {
      cover("adminui-quick-approval-bundle");
      const out = mkdtempSync(join(tmpdir(), "ggd-admin-qa-build-"));
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

        // THE CLAIM: the owner can open this page on the real deploy.
        expect(bundled, "the nav label must survive a production build").toContain(NAV_LABEL);
        expect(bundled, "the submit button must survive a production build").toContain(
          SUBMIT_LABEL,
        );
        // the row prose is the second requirement — a bundle with the button but
        // without the reasons would be the checkbox-list this task must not ship
        expect(bundled).toContain("為什麼在等");
        expect(bundled).toContain("數值");
        // and the endpoints it writes through are really in there
        expect(bundled).toContain("/curation/whitelist/bulk");
        expect(bundled).toContain("/approve");

        // it must NOT have dragged the dev editor in with it: this page is
        // eager, so anything it accidentally imported would ship too.
        for (const marker of ["/content-api", "內容管理", "鑄形工坊", "ArcRotateCamera"]) {
          expect(bundled, `Quick Approval must not pull ${marker} into the bundle`).not.toContain(
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
    cover("adminui-quick-approval-bundle");
    expect(readFileSync(new URL(import.meta.url), "utf8")).toContain("GGD_BUILD_GATE=1");
  });
});
