/**
 * content-admin-gate (task #102) — executable proof of the authorisation model
 * and of the dev-only gate around the content editor.
 *
 * THE MODEL, IN ONE LINE: authorisation by REACHABILITY, not by DETECTION.
 * Nothing anywhere decides whether a caller "is local". A non-local caller
 * cannot open the socket. Peer-checking is the second layer, never the first.
 *
 * That matters HERE specifically because of a fact about this repo that a
 * generic "localhost = admin" design would get badly wrong: the user tests the
 * game from a phone. `client-lan` in .claude/launch.json runs the game's vite
 * server with `--host 0.0.0.0`, and it was verified reachable at
 * http://192.168.0.106:39527 on a shared wifi. A VITE PROXY LAUNDERS THE
 * SOURCE ADDRESS — the phone's request arrives at the proxied service FROM
 * 127.0.0.1, because the vite process is the one connecting. So any
 * remote-address check behind that proxy is not merely weak, it is inverted:
 * it says "loopback" about the one caller it exists to exclude.
 *
 * Hence the three things this file pins:
 *
 *   A. the LAN-published game server has NO /content-api route at all (a
 *      guarded route is not as strong as no route), and a tripwire 404s the
 *      whole prefix so a re-added proxy entry still cannot reach :8787;
 *   B. the admin console — which DOES proxy /content-api — binds loopback and
 *      REFUSES TO START with a non-loopback --host, so there is no front door
 *      to launder anything through;
 *   C. the editor is absent from a production build, not hidden.
 *
 * What is deliberately NOT here: any change to the platform's real admin auth.
 * argon2id + alg-pinned HS256 + AdminOnly (which reloads the account on every
 * request) is untouched, and the Go side gains no address-based trust at all —
 * see apps/platform/internal/server/devsurface_test.go, which asserts that as
 * a source invariant. This is an ADDITIONAL dev-only path, never a hole in the
 * real one.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { isLoopbackHostValue, loopbackOnly, refusalMessage } from "./dev/loopbackOnly";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");

/**
 * Strip comments so prose in the doc blocks cannot satisfy a check — the
 * repo's codexEditGate idiom, with one correction that matters HERE: a naive
 * `//`-to-end-of-line rule eats the `//127.0.0.1:8787` out of a proxy target
 * and would turn "the port is not mentioned" into a false pass on a config
 * that proxies it. So a `//` preceded by `:` (a URL scheme) is not a comment.
 */
const code = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const CLIENT_VITE = read("apps/client/vite.config.ts");
const ADMIN_VITE = read("apps/admin/vite.config.ts");
const CONTENT_API_SRC = read("apps/admin/src/contentApi.ts");
const APP_SRC = read("apps/admin/src/ui/App.tsx");

// ---------------------------------------------------------------------------
// A. the LAN-published server has no route to the content-api
// ---------------------------------------------------------------------------

describe("A: the game client (LAN-published) has NO content-api route", () => {
  it("has no /content-api proxy entry and never names port 8787", () => {
    cover("content-admin-no-lan-route");
    const src = code(CLIENT_VITE);
    expect(src).not.toMatch(/["']\/content-api["']\s*:\s*\{/);
    // `code()` here is URL-safe (see its definition), so this really does mean
    // "no live reference to the content-api port", not "the comment stripper
    // ate the URL".
    expect(src).not.toContain("8787");
  });

  it("proxies EXACTLY /colyseus and /api — an allowlist, not an absence", () => {
    cover("content-admin-no-lan-route");
    // Enumerating the survivors is what makes this test survive a rename: a
    // future "/content-api-v2" entry fails here even though the string
    // "/content-api" never appears.
    const src = code(CLIENT_VITE);
    const at = src.indexOf("proxy: {");
    expect(at).toBeGreaterThan(0);
    const tail = src.slice(at, src.indexOf("build: {", at));
    const keys = [...tail.matchAll(/["'](\/[a-z0-9._\-/]+)["']\s*:\s*\{/gi)].map((m) => m[1]);
    expect(keys.sort()).toEqual(["/api", "/colyseus"]);
  });

  it("keeps the tripwire: /content-api 404s on EVERY verb, GET included", () => {
    cover("content-admin-no-lan-route");
    const src = code(CLIENT_VITE);
    expect(src).toMatch(/plugins:\s*\[[^\]]*contentApiGuard\(\)/);
    const at = src.indexOf("function contentApiGuard()");
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf("\n}", src.indexOf("return {", at)));
    // 404, terminal — NOT 403-and-next(), which would fall through to whatever
    // else is mounted (a re-added proxy, most of all)
    expect(body).toMatch(/statusCode = 404/);
    expect(body).not.toMatch(/statusCode = 403/);
    // no verb is exempt: an unconditional early `return next()` would be one
    expect(body).not.toMatch(/return next\(\)/);
    // and it is still socket-only, never a forwarded header
    expect(body).not.toMatch(/x-forwarded-for|x-real-ip/i);
  });

  it("the tripwire hooks ONLY the dev/preview servers, never a build step", () => {
    cover("content-admin-no-lan-route");
    expect(CLIENT_VITE).toMatch(/configureServer/);
    expect(code(CLIENT_VITE)).not.toMatch(/closeBundle|generateBundle|writeBundle/);
  });
});

// ---------------------------------------------------------------------------
// B. the admin console is reachable only from this machine
// ---------------------------------------------------------------------------

describe("B: the admin console binds loopback and refuses --host", () => {
  it("declares host 127.0.0.1 for both the dev and preview servers", () => {
    cover("content-admin-loopback-bind");
    const src = code(ADMIN_VITE);
    expect(src).toMatch(/host:\s*"127\.0\.0\.1"/);
    expect(src).toMatch(/preview:\s*\{[^}]*host:\s*"127\.0\.0\.1"/s);
  });

  it("installs loopbackOnly() FIRST in the plugin list", () => {
    cover("content-admin-loopback-bind");
    const src = code(ADMIN_VITE);
    expect(src).toMatch(/plugins:\s*\[\s*loopbackOnly\(\)/);
    // …and it is the /content-api proxy that makes the bind load-bearing
    expect(src).toMatch(/["']\/content-api["']\s*:\s*\{/);
    expect(src).toContain("8787");
  });

  it("accepts every loopback spelling", () => {
    cover("content-admin-loopback-bind");
    for (const h of ["127.0.0.1", "localhost", "::1", "[::1]", "::ffff:127.0.0.1", "127.1.2.3", "0:0:0:0:0:0:0:1"]) {
      expect(isLoopbackHostValue(h), h).toBe(true);
    }
    // vite's own defaults are loopback
    expect(isLoopbackHostValue(undefined)).toBe(true);
    expect(isLoopbackHostValue(false)).toBe(true);
  });

  it("REFUSES every form of `--host`, including the bare flag", () => {
    cover("content-admin-loopback-bind");
    // `true` is what `vite dev --host` with no value resolves to — the exact
    // shape of the accident this guard exists for.
    for (const h of [true, "0.0.0.0", "::", "192.168.0.106", "10.0.0.5", "", "  ", "example.com", "127.0.0.256"]) {
      expect(isLoopbackHostValue(h as never), JSON.stringify(h)).toBe(false);
    }
  });

  it("throws from configResolved — before any socket exists", () => {
    cover("content-admin-loopback-bind");
    const plugin = loopbackOnly();
    const hook = plugin.configResolved;
    expect(typeof hook).toBe("function");
    const call = (server: unknown, preview: unknown): void => {
      (hook as (c: unknown) => void).call(plugin, { server: { host: server }, preview: { host: preview } });
    };
    expect(() => call("127.0.0.1", "127.0.0.1")).not.toThrow();
    expect(() => call(undefined, undefined)).not.toThrow();
    expect(() => call("0.0.0.0", "127.0.0.1")).toThrow(/refuses to bind server\.host/);
    expect(() => call(true, "127.0.0.1")).toThrow(/refuses to bind server\.host/);
    // the preview server is not a loophole
    expect(() => call("127.0.0.1", "0.0.0.0")).toThrow(/refuses to bind preview\.host/);
  });

  it("the refusal explains the consequence and names the alternative", () => {
    cover("content-admin-loopback-bind");
    // a refusal nobody understands gets worked around
    const msg = refusalMessage("server", "0.0.0.0");
    expect(msg).toMatch(/write/i);
    expect(msg).toMatch(/launders/);
    expect(msg).toMatch(/39527/); // the phone keeps the GAME client
  });

  it("has NO escape hatch: no env override, no trusted-proxy CIDR", () => {
    cover("content-admin-loopback-bind");
    const src = code(read("apps/admin/src/dev/loopbackOnly.ts"));
    expect(src).not.toMatch(/process\.env/);
    expect(src).not.toMatch(/x-forwarded-for|x-real-ip|trustProxy/i);
    expect(src).not.toMatch(/\/(8|16|24)\b/); // a CIDR would be a hole with a comment on it
  });
});

// ---------------------------------------------------------------------------
// C. the editor cannot exist in a production build
// ---------------------------------------------------------------------------

describe("C: the write module is dev-build gated", () => {
  it("uses the repo's guarded import.meta.env.DEV shape (safe under plain node)", () => {
    cover("content-admin-gate");
    const src = code(CONTENT_API_SRC);
    expect(src).toMatch(/function isDevBuild\(\)\s*:\s*boolean\s*\{/);
    expect(src).toMatch(/import\.meta as unknown as \{ env\?: \{ DEV\?: boolean \} \}/);
    expect(src).toMatch(/catch\s*\{\s*return false;\s*\}/);
    expect(src).toMatch(/const ENABLED = isDevBuild\(\);/);
  });

  it("EVERY exported async function short-circuits on the gate as its first branch", () => {
    cover("content-admin-gate");
    const src = code(CONTENT_API_SRC);
    const exported = [...src.matchAll(/export async function (\w+)\(/g)].map((m) => m[1] as string);
    // the surface really exists — a rename must not quietly empty this test
    expect(exported.sort()).toEqual(
      [
        "currentContentVersion",
        "fetchDoc",
        "listBackups",
        "probeContentApi",
        "restoreBackup",
        "saveDocs",
        "validateDoc",
      ].sort(),
    );
    for (const name of exported) {
      const at = src.indexOf(`export async function ${name}(`);
      const nextExport = src.indexOf("\nexport ", at + 1);
      const body = src.slice(at, nextExport < 0 ? src.length : nextExport);
      const firstIf = body.indexOf("if (");
      const firstNetwork = body.search(/\bfetch\b|\bsend\(/);
      expect(firstIf, `${name} must have a guard`).toBeGreaterThan(0);
      expect(body.slice(firstIf, firstIf + 40), `${name} must open with the ENABLED guard`).toMatch(
        /^if \(!ENABLED\)/,
      );
      if (firstNetwork >= 0) {
        expect(firstNetwork, `${name} must not reach the network before the gate`).toBeGreaterThan(firstIf);
      }
    }
  });

  it("is the ONLY module in the admin console that sends a mutating request", () => {
    cover("content-admin-gate");
    // src/api.ts talks to the PLATFORM, which has its own argon2id + JWT +
    // AdminOnly gate — a different authority, and not this file's business.
    // What must be unique is the unauthenticated content-write path.
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
      }
      return out;
    };
    const offenders = walk(join(REPO, "apps/admin/src"))
      .filter((f) => !f.endsWith("contentApi.ts"))
      .filter((f) => /\/content-api\//.test(code(readFileSync(f, "utf8"))));
    expect(offenders).toEqual([]);
  });

  it("guards the page's dynamic import with a BARE import.meta.env.DEV early return", () => {
    cover("content-admin-gate");
    const src = code(APP_SRC);
    const at = src.indexOf('import("./ContentPage")');
    expect(at, "App must load ./ContentPage dynamically").toBeGreaterThan(0);
    const before = src.slice(Math.max(0, at - 400), at);
    // bare, statically substitutable form — NOT a runtime hostname/env lookup
    expect(before).toMatch(/if \(!import\.meta\.env\.DEV\) return;/);
    expect(before).not.toMatch(/location\.hostname|window\.location|localStorage/);
  });

  it("nothing in the eagerly-loaded shell imports the page or the write module", () => {
    cover("content-admin-gate");
    const src = code(APP_SRC);
    expect(src).not.toMatch(/^\s*import\s+(?!type\b)[^;]*?from\s+["']\.\/ContentPage["']/m);
    expect(src).not.toMatch(/from\s+["']\.\.\/contentApi["']/);
    // the label lives in the lazily-imported chunk, not in the shell
    expect(src).not.toContain("內容管理");
    expect(src).toContain("m.CONTENT_NAV");
  });
});

// ---------------------------------------------------------------------------
// D. the second layer is independent of the first
// ---------------------------------------------------------------------------

describe("D: the content-api enforces the rule on its own", () => {
  it("refuses to BIND anywhere but loopback, and re-checks the socket peer", () => {
    cover("content-admin-gate");
    const index = code(read("apps/content-api/src/index.ts"));
    expect(index).toMatch(/isLoopbackHost\(host\)/);
    expect(index).toMatch(/process\.exit\(1\)/);
    const guard = code(read("apps/content-api/src/guard.ts"));
    expect(guard).toMatch(/req\.raw\.socket\?\.remoteAddress/);
    // the peer decision is never header-driven — this is the landmine that
    // reopens the hole while looking correct in review
    expect(guard).not.toMatch(/headers\[["'`]?x-(forwarded|real)/i);
    expect(guard).not.toMatch(/req\.ip\b/);
    expect(guard).not.toMatch(/trustProxy/);
    // and it does not depend on any client-side flag
    expect(guard).not.toMatch(/import\.meta/);
  });

  it("allows the admin console origin and no longer the LAN-published game", () => {
    cover("content-admin-gate");
    const guard = read("apps/content-api/src/guard.ts");
    const list = guard.slice(guard.indexOf("ALLOWED_ORIGINS"), guard.indexOf("];", guard.indexOf("ALLOWED_ORIGINS")));
    expect(list).toContain("http://127.0.0.1:60721");
    // :39527 is the server the user publishes with --host; it has no
    // /content-api route any more, so listing it would describe a door that
    // does not exist
    expect(list).not.toContain("39527");
  });
});

// ---------------------------------------------------------------------------
// THE BUILD GATE — opt-in, because it runs a real production build.
//
//   GGD_BUILD_GATE=1 pnpm --filter @ggd/admin test
//
// This is the test that actually proves the claim: it builds the console the
// way CI/docker does and shows that no emitted chunk mentions the write path.
// ---------------------------------------------------------------------------

const BUILD_GATE = Boolean(process.env.GGD_BUILD_GATE);

describe("a real production build of the console contains no write path", () => {
  it.runIf(BUILD_GATE)(
    "vite build emits no ContentPage chunk and no content-api call",
    () => {
      cover("content-admin-gate");
      const out = mkdtempSync(join(tmpdir(), "ggd-admin-build-"));
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
        expect(files.length).toBeGreaterThan(0);

        // 1. no chunk is NAMED after the modules rollup would have emitted
        expect(files.filter((f) => /ContentPage|contentApi/i.test(f))).toEqual([]);

        // 2. no emitted asset mentions the content-api at all
        const bundled = files
          .filter((f) => /\.(js|mjs|css|html)$/.test(f))
          .map((f) => readFileSync(f, "utf8"))
          .join("\n");
        // THE claim: no request to the content-api can be CONSTRUCTED, because
        // its mount path is not in the bundle at all. Every URL the write
        // module builds goes through `/content-api/...` (editModel.docUrl), so
        // this one token covers the whole surface.
        expect(bundled).not.toContain("/content-api");

        // The port survives — and that is correct, not a leak. `src/config.ts`
        // carries `http://127.0.0.1:8787` as a Console Hub DEV DEFAULT: a link
        // an operator clicks, resolved at runtime, and blanked by the prod
        // preset. So rather than banning the digits (which would just push
        // someone into obfuscating them), pin what they may be attached to:
        // a bare host:port link, never a request path.
        for (const [window] of bundled.matchAll(/.{0,30}8787.{0,30}/g)) {
          expect(window, "a surviving 8787 must be the hub's bare link").toContain("127.0.0.1:8787");
          expect(window, "no 8787 may carry a content-api request path").not.toContain("/content-api");
        }

        // the page's own strings would betray a surviving editor UI
        expect(bundled).not.toContain("確認寫入");
        expect(bundled).not.toContain("復原上一次儲存");
        expect(bundled).not.toContain("即將覆蓋這些內容");
        // even the NAV LABEL travels with the chunk, so absence is total
        // rather than almost — see CONTENT_NAV in ui/ContentPage.tsx
        expect(bundled).not.toContain("內容管理");
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    },
    600_000,
  );

  it("names how to run the build gate when it is skipped", () => {
    cover("content-admin-gate");
    // a gate nobody knows how to run is a gate nobody runs
    expect(readFileSync(new URL(import.meta.url), "utf8")).toContain("GGD_BUILD_GATE=1");
  });
});
