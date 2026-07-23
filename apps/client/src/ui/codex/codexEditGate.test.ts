/**
 * codex-edit-dev-gate (task #96) — executable proof that the codex EDITOR
 * cannot exist in a production build.
 *
 * The user's rule 「localhost 在本機存儲的情況下視同管理者權限可編輯」 is a good
 * developer convenience and a terrible production default, so #96 is gated in
 * two independent layers and this file proves the CLIENT one:
 *
 *   1. `codexEdit.ts` — the only module here that writes — is guarded by
 *      `import.meta.env.DEV` through the repo's proven shape
 *      (render/views/blizzardOverlay.ts), and EVERY exported writer
 *      short-circuits on it, so the module is inert even if something else
 *      imports it (vitest, for one: plain node has no import.meta.env);
 *   2. `CodexPage.tsx` reaches it ONLY through a bare
 *      `if (!import.meta.env.DEV) return;` + dynamic `import()`. Vite
 *      substitutes that flag statically, rollup dead-folds the branch, and the
 *      chunk is never emitted — the write path is ABSENT from a production
 *      bundle, not merely hidden. The opt-in build test at the bottom runs a
 *      REAL `vite build` and greps dist/ to prove exactly that.
 *
 * Layer 2 — the server — is proved independently in
 * apps/content-api/src/guard.test.ts. A client-side check is never treated as
 * access control; this file only shows that the convenience cannot ship.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";

const DIR = __dirname;
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");

const EDIT_SRC = readFileSync(join(DIR, "codexEdit.ts"), "utf8");
const PAGE_SRC = readFileSync(join(DIR, "CodexPage.tsx"), "utf8");
const VITE_SRC = read("apps/client/vite.config.ts");

/** strip comments so prose in the doc blocks cannot satisfy a check */
const code = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ---------------------------------------------------------------------------

describe("layer A: the write module is dev-build gated", () => {
  it("uses the repo's guarded import.meta.env.DEV shape (safe under plain node)", () => {
    cover("codex-edit-dev-gate");
    const src = code(EDIT_SRC);
    expect(src).toMatch(/function isDevBuild\(\)\s*:\s*boolean\s*\{/);
    expect(src).toMatch(/import\.meta as unknown as \{ env\?: \{ DEV\?: boolean \} \}/);
    expect(src).toMatch(/catch\s*\{\s*return false;\s*\}/);
    expect(src).toMatch(/const ENABLED = isDevBuild\(\);/);
    // …and the asset gate proves the SAME guarded-import.meta convention. #176
    // centralised that gate into config/fullAssets.ts; blizzardOverlay.ts now
    // DELEGATES to it (const isDevBuild = fullAssetsEnabled), so assert the
    // delegation here and the guarded try/catch import.meta shape at its source.
    const overlay = code(read("apps/client/src/render/views/blizzardOverlay.ts"));
    expect(overlay).toMatch(/from "\.\.\/\.\.\/config\/fullAssets"/);
    const gate = code(read("apps/client/src/config/fullAssets.ts"));
    expect(gate).toMatch(/import\.meta as unknown as \{ env\?:/);
    expect(gate).toMatch(/catch\s*\{\s*return undefined;\s*\}/);
  });

  it("EVERY exported writer short-circuits on the gate as its first statement", () => {
    cover("codex-edit-dev-gate");
    const src = code(EDIT_SRC);
    const exported = [...src.matchAll(/export async function (\w+)\(/g)].map((m) => m[1] as string);
    // the surface really exists (a rename must not quietly empty this test)
    expect(exported.sort()).toEqual(
      ["listBackups", "probeContentApi", "restoreBackup", "saveDocs", "validateDoc"].sort(),
    );
    for (const name of exported) {
      const at = src.indexOf(`export async function ${name}(`);
      const nextExport = src.indexOf("\nexport ", at + 1);
      const body = src.slice(at, nextExport < 0 ? src.length : nextExport);
      // the FIRST branch in the function must be the gate — nothing may run
      // before it, least of all a fetch
      const firstIf = body.indexOf("if (");
      const firstFetch = body.search(/\bfetch\b|\bsend\(/);
      expect(firstIf, `${name} must have a guard`).toBeGreaterThan(0);
      expect(body.slice(firstIf, firstIf + 40), `${name} must open with the ENABLED guard`).toMatch(
        /^if \(!ENABLED\)/,
      );
      if (firstFetch >= 0) {
        expect(firstFetch, `${name} must not reach the network before the gate`).toBeGreaterThan(firstIf);
      }
    }
  });

  it("is the ONLY module in ui/codex that sends a mutating request", () => {
    cover("codex-edit-dev-gate");
    // (codexLive.test.ts owns the wider "who may fetch at all" allowlist — the
    // other fetchers there are read-only GETs of the live content mount.)
    const offenders = readdirSync(DIR)
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && f !== "codexEdit.ts")
      .filter((f) =>
        /method:\s*["'`](PUT|POST|DELETE|PATCH)["'`]/i.test(code(readFileSync(join(DIR, f), "utf8"))),
      );
    expect(offenders).toEqual([]);
  });
});

/** Modules that must never be imported for VALUE outside the gated chain. */
const EDITOR_MODULES = ["./CodexEditPanel", "./codexEdit", "./codexEditModel"];

describe("layer A: the page can only REACH the editor in a dev build", () => {
  it("nothing outside the editor imports an editor module for value", () => {
    cover("codex-edit-dev-gate");
    const insideChain = new Set(["CodexEditPanel.tsx", "codexEdit.ts", "codexEditModel.ts"]);
    for (const f of readdirSync(DIR).filter((n) => /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n))) {
      if (insideChain.has(f)) continue;
      const src = code(readFileSync(join(DIR, f), "utf8"));
      for (const mod of EDITOR_MODULES) {
        const valueImport = new RegExp(
          `^\\s*import\\s+(?!type\\b)[^;]*?from\\s+["']${mod.replace(".", "\\.")}["']`,
          "m",
        );
        expect(valueImport.test(src), `${f} must not import ${mod} for value`).toBe(false);
      }
    }
    // …and the type-only reference that survives is exactly that: type-only
    expect(code(PAGE_SRC)).toMatch(/import type \{ CodexEditSessionProps \} from "\.\/CodexEditPanel"/);
  });

  it("guards the dynamic import with a BARE import.meta.env.DEV early return", () => {
    cover("codex-edit-dev-gate");
    const src = code(PAGE_SRC);
    const at = src.indexOf('import("./CodexEditPanel")');
    expect(at, "CodexPage must load ./CodexEditPanel dynamically").toBeGreaterThan(0);
    const before = src.slice(Math.max(0, at - 400), at);
    // bare, statically substitutable form — NOT a runtime hostname/env lookup
    expect(before).toMatch(/if \(!import\.meta\.env\.DEV\) return;/);
    expect(before).not.toMatch(/location\.hostname|window\.location|localStorage/);
  });

  it("the detail pane treats a missing editor as the normal case", () => {
    cover("codex-edit-dev-gate");
    const detail = code(readFileSync(join(DIR, "CodexDetail.tsx"), "utf8"));
    // the session arrives as a PROP and defaults to null, so a production
    // render is the read-only codex even though the component is shared
    expect(detail).toMatch(/EditSession = null/);
    expect(detail).toMatch(/EditSession === null \?/);
    // its only editor-side runtime import is the createContext(null) shim
    expect(detail).toMatch(/import \{ useDetailEdit \} from "\.\/codexEditContext"/);
    const ctx = code(readFileSync(join(DIR, "codexEditContext.ts"), "utf8"));
    expect(ctx).toMatch(/createContext<DetailEdit \| null>\(null\)/);
    // the shim must stay a shim: react only, everything else type-only
    const valueImports = [...ctx.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map(
      (m) => m[1] as string,
    );
    expect(valueImports).toEqual(["react"]);
  });
});

describe("layer A: the dev-server route is dev-server only", () => {
  it("registers contentApiGuard() and hooks ONLY the dev/preview servers", () => {
    cover("codex-edit-dev-gate");
    expect(VITE_SRC).toMatch(/plugins:\s*\[[^\]]*contentApiGuard\(\)/);
    expect(VITE_SRC).toMatch(/configureServer/);
    // the exact assertion the copyright gate uses: never a build-time hook
    // (comments stripped — prose about the rule must not satisfy the rule)
    expect(code(VITE_SRC)).not.toMatch(/closeBundle|generateBundle|writeBundle/);
  });

  it("the GAME CLIENT has no /content-api route at all — the guard is terminal", () => {
    cover("codex-edit-dev-gate");
    const src = code(VITE_SRC);
    // This is the ONE vite server the user publishes to the LAN (`client-lan`,
    // --host 0.0.0.0). A proxy hop LAUNDERS the peer address — the content-api
    // would see 127.0.0.1 and its loopback rule would pass — and the Origin
    // allowlist does not cover curl, which sends no Origin at all. So the route
    // is absent, not guarded, and this plugin is the tripwire that keeps it
    // absent. (Editing lives on the loopback-bound admin console instead.)
    expect(src).not.toMatch(/["']\/content-api["']\s*:\s*\{/);
    // terminal: the deny handler must NOT call next(), or a re-added proxy
    // entry mounted after it would still be reached
    const guard = src.slice(src.indexOf("function contentApiGuard()"));
    const body = guard.slice(0, guard.indexOf("\n}\n") + 3);
    expect(body).toMatch(/res\.statusCode = 404/);
    expect(body).not.toMatch(/\bnext\(\)/);
    // it still reads the SOCKET and no forwarded header
    expect(body).toMatch(/req\.socket\.remoteAddress/);
    expect(src).not.toMatch(/x-forwarded-for|x-real-ip/i);
  });

  it("the loopback-bound consoles are the ones that may proxy it", () => {
    cover("codex-edit-dev-gate");
    // apps/admin pins host 127.0.0.1 AND makes --host fatal, so no proxy there
    // can launder a LAN peer into a loopback one.
    const admin = read("apps/admin/vite.config.ts");
    expect(admin).toMatch(/["']\/content-api["']\s*:\s*\{/);
    expect(admin).toMatch(/host:\s*["']127\.0\.0\.1["']/);
    expect(admin).toMatch(/loopbackOnly\(\)/);
    // and the content-api's origin allowlist names that console, not the
    // LAN-published game client
    const origins = read("apps/content-api/src/guard.ts");
    const list = origins.slice(origins.indexOf("ALLOWED_ORIGINS"), origins.indexOf("];", origins.indexOf("ALLOWED_ORIGINS")));
    expect(list).toContain("60721");
    expect(list).not.toContain("39527");
  });
});

describe("layer A: no deployed artefact can carry the route", () => {
  it("prod nginx (source AND the Helm copy) has no /content-api location", () => {
    cover("codex-edit-dev-gate");
    for (const conf of ["nginx/nginx.conf", "deploy/helm/ggd/files/nginx.conf"]) {
      const body = read(conf);
      expect(body, conf).not.toMatch(/^\s*location\s+\/content-api/m);
    }
  });

  it("the dev-only content-api route is reachable ONLY behind dev.enabled", () => {
    cover("codex-edit-dev-gate");
    // it exists as a separate include, never inlined into the base config
    expect(existsSync(join(REPO, "nginx/dev/content-api.conf"))).toBe(true);
    const configmap = read("deploy/helm/ggd/templates/edge-configmap.yaml");
    const at = configmap.indexOf("content-api.dev.conf");
    expect(at).toBeGreaterThan(0);
    expect(configmap.slice(0, at)).toMatch(/\{\{-? if \.Values\.dev\.enabled \}\}/);
    // and the edge image never bakes the dev routes in
    expect(read("docker/edge.Dockerfile")).not.toMatch(/^COPY\s+nginx\/dev/im);
  });

  it("the dev route documents that writes through it are refused", () => {
    cover("codex-edit-dev-gate");
    // the proxy sets X-Forwarded-For; the content-api ignores it on purpose, so
    // the peer it sees is nginx and writes 403. That trade must be written down
    // where the next person meets it.
    const conf = read("nginx/dev/content-api.conf");
    expect(conf).toMatch(/403/);
    expect(conf).toMatch(/loopback/i);
    expect(conf).not.toMatch(/set_real_ip_from|real_ip_header/);
  });
});

describe("layer B exists and is independent", () => {
  it("the content-api installs its own guard on every mutating request", () => {
    cover("codex-edit-dev-gate");
    const server = code(read("apps/content-api/src/server.ts"));
    expect(server).toMatch(/registerDevWriteGuard\(app\)/);
    // comments stripped: guard.ts EXPLAINS at length why it ignores the
    // forwarded headers, and that prose must not be mistaken for using them
    const guard = code(read("apps/content-api/src/guard.ts"));
    expect(guard).toMatch(/req\.raw\.socket\?\.remoteAddress/);
    // (the refusal MESSAGE says "Forwarded headers are ignored by design" — the
    // rule is that no forwarded header is ever READ)
    expect(guard).not.toMatch(/headers\[["'`]?x-(forwarded|real)/i);
    expect(guard).not.toMatch(/req\.ip\b/);
    expect(guard).not.toMatch(/trustProxy/);
    // the client gate is not a precondition of the server one
    expect(guard).not.toMatch(/import\.meta/);
  });
});

// ---------------------------------------------------------------------------
// THE BUILD GATE — opt-in because it runs a real production build.
//
//   GGD_BUILD_GATE=1 pnpm --filter @ggd/client test
//
// This is the test that actually proves the claim: it builds the client the way
// CI/docker does and shows that no emitted chunk mentions the write path.
// ---------------------------------------------------------------------------

const BUILD_GATE = Boolean(process.env.GGD_BUILD_GATE);

describe("a real production build contains no write path", () => {
  it.runIf(BUILD_GATE)(
    "vite build emits no codexEdit chunk and no content-api write call",
    () => {
      cover("codex-edit-dev-gate");
      const out = mkdtempSync(join(tmpdir(), "ggd-codex-build-"));
      try {
        execFileSync(
          "npx",
          ["vite", "build", "--outDir", out, "--emptyOutDir", "--mode", "production"],
          { cwd: join(REPO, "apps/client"), stdio: "pipe", env: { ...process.env, NODE_ENV: "production" } },
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
        expect(files.length).toBeGreaterThan(0);

        // 1. no chunk is NAMED after a module rollup would only emit for the
        //    dynamic import
        expect(files.filter((f) => /codexEdit|CodexEditPanel/i.test(f))).toEqual([]);

        // 2. no emitted asset mentions the content-api at all — not the mount,
        //    not the routes — and none of the editor's own UI strings survive.
        const bundled = files
          .filter((f) => /\.(js|mjs|css|html)$/.test(f))
          .map((f) => readFileSync(f, "utf8"))
          .join("\n");
        for (const needle of [
          "/content-api", // the write mount
          "確認寫入", // the commit button
          "復原上一次儲存", // the undo button
          "以逗號分隔", // a field-editor hint
          "同步內嵌副本", // the mirror-write note
        ]) {
          expect(bundled, `production bundle must not contain ${needle}`).not.toContain(needle);
        }
        // sanity: the READ-ONLY codex really did get built (otherwise the
        // absences above prove nothing)
        expect(bundled).toContain("內容圖鑑");
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    },
    600_000,
  );

  it("names how to run the build gate when it is skipped", () => {
    cover("codex-edit-dev-gate");
    // a gate nobody knows how to run is a gate nobody runs
    expect(readFileSync(__filename, "utf8")).toContain("GGD_BUILD_GATE=1");
  });
});
