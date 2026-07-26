/**
 * migration-page-ships (task #243) — the MIRROR IMAGE of contentGate.test.ts.
 *
 * That file pins ABSENCE: 內容管理 must not exist in a production build. This
 * one pins PRESENCE, and nothing else in CI did until now. The distinction
 * matters because the two are one keystroke apart:
 *
 *   ui/App.tsx has TWO bare `if (!import.meta.env.DEV) return;` guards sitting
 *   immediately above dynamic imports. Vite replaces the flag with the literal
 *   `false`, rollup dead-folds the body, and the chunk is never emitted. That
 *   is exactly what those two pages want, and exactly what THIS page must never
 *   get — because a migration tool that only exists on localhost cannot migrate
 *   a host, which is the entire point of the feature.
 *
 * The single most likely way to get this wrong is to add the page to
 * ui/ContentPage.tsx's CONTENT_ROUTES, because that is where the last several
 * back-office pages went (#229's 鑄形工坊 lives there). That would put it in
 * the dev chunk and delete it from production. So the checks below are:
 *
 *   A. static (runs on every CI pass, no build): App.tsx imports the page
 *      STATICALLY, the NAV carries it, ContentPage.tsx does not mention it, and
 *      store.ts session-gates it;
 *   B. build (opt-in, GGD_BUILD_GATE=1): a real `vite build` and a dist grep
 *      proving the label and the route survive minification.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";

import {
  HEADER_WARNING,
  MAX_UPLOAD_BYTES,
  NOT_INCLUDED,
  RESOLVE_ADOPT_ARCHIVE,
  SECURITY_DELTA,
  adoptConsequence,
  exportBlocker,
  formatBytes,
  planTotals,
  selectedBytes,
  suggestedFileName,
  unresolvedCollisions,
  type ArchiveGroup,
  type PlanResp,
  type PreviewResp,
} from "./archive";
import { pageRequiresSession } from "./store";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");
/** Strip comments so prose cannot satisfy a check (the repo's codexEditGate idiom). */
const code = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const APP_SRC = read("apps/admin/src/ui/App.tsx");
const STORE_SRC = read("apps/admin/src/store.ts");
const CONTENT_PAGE_SRC = read("apps/admin/src/ui/ContentPage.tsx");

// ---------------------------------------------------------------------------
// A. the page is wired the way a PRODUCTION page is wired
// ---------------------------------------------------------------------------

describe("A: 資料搬遷 is a production route, not a dev-chunk route", () => {
  it("App.tsx imports the page STATICALLY, never behind an import.meta.env.DEV gate", () => {
    cover("migration-page-ships");
    const src = code(APP_SRC);
    expect(src).toMatch(/^\s*import\s+\{\s*DataMigrationPage\s*\}\s+from\s+["']\.\/DataMigrationPage["'];/m);
    // …and NOT dynamically. A dynamic import is what rollup can fold away.
    expect(src).not.toContain('import("./DataMigrationPage")');
    // Belt and braces: no DEV guard anywhere near the specifier.
    const at = src.indexOf("DataMigrationPage");
    const around = src.slice(Math.max(0, at - 400), at + 400);
    expect(around).not.toMatch(/import\.meta\.env\.DEV/);
  });

  it("the NAV carries the route and the shell renders it", () => {
    cover("migration-page-ships");
    const src = code(APP_SRC);
    expect(src).toContain('page: "dataMigration"');
    expect(src).toContain("資料搬遷");
    expect(src).toMatch(/page === "dataMigration" && <DataMigrationPage \/>/);
  });

  it("ContentPage.tsx does NOT own this route — that is the one way to lose it", () => {
    cover("migration-page-ships");
    const src = code(CONTENT_PAGE_SRC);
    expect(src).not.toContain("DataMigrationPage");
    expect(src).not.toContain("dataMigration");
    expect(src).not.toContain("資料搬遷");
  });

  it("store.ts declares the page AND session-gates it", () => {
    cover("migration-page-ships");
    const src = code(STORE_SRC);
    expect(src).toContain('| "dataMigration"');
    // The gate itself, asserted through the exported predicate rather than by
    // grepping the set — so a rename of SESSION_REQUIRED_PAGES cannot pass.
    expect(pageRequiresSession("dataMigration")).toBe(true);
    // …and the comparison that gives it meaning: the dev content routes are NOT
    // session-gated, so this is a real distinction, not a blanket true.
    expect(pageRequiresSession("champions")).toBe(false);
  });

  it("the archive API module is imported by the page, not by the dev chunk", () => {
    cover("migration-page-ships");
    const page = code(read("apps/admin/src/ui/DataMigrationPage.tsx"));
    expect(page).toMatch(/from "\.\.\/api"/);
    expect(page).toMatch(/from "\.\.\/archive"/);
    // It must NOT reach the loopback content-api: this page talks to the
    // platform, which has its own argon2id + JWT + AdminOnly gate.
    expect(page).not.toContain("/content-api");
  });
});

// ---------------------------------------------------------------------------
// B. the copy is product, and the numbers agree with the server
// ---------------------------------------------------------------------------

describe("B: the page tells the truth about what it does", () => {
  it("the header names the three things the operator cannot infer", () => {
    cover("migration-page-ships");
    const all = HEADER_WARNING.join("\n");
    expect(all).toContain("密碼雜湊"); // what is in the file
    expect(all).toContain("邀請碼");
    expect(all).toContain("scp"); // how to move it
    expect(all).toContain("email");
    // the plaintext central directory — engineering cannot remove this, only
    // disclose it
    expect(all).toContain("明文");
  });

  it("states the #179 security delta instead of inheriting it silently", () => {
    cover("migration-page-ships");
    expect(SECURITY_DELTA).toContain("帳號");
    expect(SECURITY_DELTA).toContain("邀請碼");
    expect(SECURITY_DELTA).toMatch(/AI 金鑰|webhook/);
  });

  it("says out loud that the asset pack does NOT travel", () => {
    cover("migration-page-ships");
    const overlay = NOT_INCLUDED.find((n) => n.name.includes("blizzard-overlay"));
    expect(overlay).toBeDefined();
    // A fresh host looking empty of art is EXPECTED, and this sentence is the
    // only thing that stops it being reported as a bug.
    expect(overlay?.why).toContain("很空是正常的");
    for (const row of NOT_INCLUDED) expect(row.why.length).toBeGreaterThan(8);
  });

  it("the upload ceiling matches the platform's own cap", () => {
    cover("migration-page-ships");
    // platformarchive.MaxUploadBytes / server.maxArchiveUploadBytes / the nginx
    // location must all be 512 MiB. Grep the Go side so a change on one side
    // fails here rather than at 3am on the host.
    expect(MAX_UPLOAD_BYTES).toBe(512 * 1024 * 1024);
    const go = read("apps/platform/internal/platformarchive/manifest.go");
    expect(go).toContain("MaxUploadBytes = 512 << 20");
    const server = read("apps/platform/internal/server/server.go");
    expect(server).toContain("maxArchiveUploadBytes int64 = 512 << 20");
    const nginx = read("nginx/nginx.conf");
    expect(nginx).toContain("client_max_body_size 512m");
    expect(nginx).toContain("location = /api/v1/admin/platform-archive/stage");
  });

  it("blocks the export button with an ACTIONABLE reason when the scope is too big", () => {
    cover("migration-page-ships");
    const preview: PreviewResp = {
      groups: [
        { group: "core", zh: "核心資料", entries: 200, bytes: 300_000 },
        { group: "replays", zh: "對戰回放", entries: 84, bytes: 600 * 1024 * 1024 },
      ],
    };
    const none = new Set<ArchiveGroup>();
    expect(exportBlocker(preview, none)).toBeNull();
    const withReplays = new Set<ArchiveGroup>(["replays"]);
    const msg = exportBlocker(preview, withReplays);
    expect(msg).not.toBeNull();
    expect(msg).toContain("scp"); // names the fix, not just the problem
    expect(selectedBytes(preview, withReplays)).toBeGreaterThan(MAX_UPLOAD_BYTES);
  });

  it("the adopt-archive consequence names the outcome, not the mechanism", () => {
    cover("migration-page-ships");
    const line = adoptConsequence([
      {
        collection: "accounts/by-username",
        key: "takuro",
        targetAccountId: "u_new",
        archiveAccountId: "u_old",
        resolved: false,
      },
    ]);
    expect(line).toContain("takuro");
    expect(line).toContain("不會被刪除");
    expect(line).toContain("重新登入");
  });

  it("rolls a plan up correctly and finds unresolved collisions", () => {
    cover("migration-page-ships");
    const plan: PlanResp = {
      collections: [
        {
          collection: "accounts",
          zh: "帳號",
          group: "core",
          policy: "additive",
          added: 35,
          unchanged: 0,
          written: 0,
          skipped: 0,
          blocked: 0,
        },
        {
          collection: "accounts/by-username",
          zh: "使用者名稱索引",
          group: "core",
          policy: "additive",
          added: 34,
          unchanged: 0,
          written: 0,
          skipped: 0,
          blocked: 1,
        },
      ],
      collisions: [
        {
          collection: "accounts/by-username",
          key: "takuro",
          targetAccountId: "a",
          archiveAccountId: "b",
          resolved: false,
        },
        {
          collection: "accounts/by-email",
          key: "x@y.z",
          targetAccountId: "a",
          archiveAccountId: "b",
          resolved: true,
        },
      ],
      writes: 69,
      blocked: true,
      targetPopulated: true,
      digest: "d",
    };
    expect(planTotals(plan)).toEqual({ added: 69, written: 0, unchanged: 0, skipped: 0, blocked: 1 });
    expect(unresolvedCollisions(plan).map((c) => c.key)).toEqual(["takuro"]);
  });

  it("formats bytes and builds a timestamped, host-scoped file name", () => {
    cover("migration-page-ships");
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(214 * 1024 * 1024)).toBe("214 MB");
    const name = suggestedFileName("ggd.adms.ai", new Date(Date.UTC(2026, 6, 26, 14, 3, 11)));
    expect(name).toBe("ggd-platform-archive-ggd-adms-ai-20260726-140311Z.zip");
    expect(RESOLVE_ADOPT_ARCHIVE).toBe("adopt-archive");
  });
});

// ---------------------------------------------------------------------------
// C. THE BUILD GATE — the claim that actually matters, opt-in because it runs a
// real production build:
//
//     GGD_BUILD_GATE=1 pnpm --filter @ggd/admin test
// ---------------------------------------------------------------------------

const BUILD_GATE = Boolean(process.env.GGD_BUILD_GATE);

describe("C: a real production build CONTAINS the migration page", () => {
  it.runIf(BUILD_GATE)(
    "vite build emits the label and the archive routes",
    () => {
      cover("migration-page-ships");
      const out = mkdtempSync(join(tmpdir(), "ggd-admin-migration-build-"));
      try {
        execFileSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir", "--mode", "production"], {
          cwd: join(REPO, "apps/admin"),
          stdio: "pipe",
          env: { ...process.env, NODE_ENV: "production" },
        });
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

        // The nav label survives minification (string literals do).
        expect(bundled).toContain("資料搬遷");
        // Every route the page can call must be constructible.
        expect(bundled).toContain("/admin/platform-archive/export");
        expect(bundled).toContain("/admin/platform-archive/stage");
        expect(bundled).toContain("/admin/platform-archive/plan");
        expect(bundled).toContain("/admin/platform-archive/commit");
        // And the warning the owner has to read before pressing anything.
        expect(bundled).toContain("密碼雜湊");
        // Sanity: this is the SAME build the content gate proves is empty of
        // the editor, so the two claims are about one artefact.
        expect(bundled).not.toContain("/content-api");
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    },
    600_000,
  );

  it("names how to run the build gate when it is skipped", () => {
    cover("migration-page-ships");
    expect(readFileSync(new URL(import.meta.url), "utf8")).toContain("GGD_BUILD_GATE=1");
  });
});
