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
    // ⭐ 2026-08-22：斷言收窄到**這個 plugin 自己**，⛔ 不是整份 vite.config。
    // ⚠️ 原本掃全檔 ⇒ 任何**無關**的 build hook 都會讓它紅，而訊息說的是
    // 「tripwire 掛到了 build」——⛔ 一句用錯誤訊息說謊的話。
    // #83 的 `ggd-strip-debug-pages`（把 14 頁 debug 主控台從出貨產物拿掉）
    // 就是這樣被誤判的：它是**安全修正**，而且它必須是 build hook。
    // ⭐ 這一條真正要守的是：**tripwire 不可以在 build 期跑** —— 它是一個
    // dev/preview 的絆線，跑進 build 就會把一條 LAN 路由烘進出貨產物。
    const tripwire = /name:\s*"ggd-content-api-guard"[\s\S]*?\n\s{2}\};/.exec(code(CLIENT_VITE));
    expect(tripwire, "找不到 ggd-content-api-guard —— tripwire 被改名或刪掉了").toBeTruthy();
    expect(tripwire![0]).not.toMatch(/closeBundle|generateBundle|writeBundle/);
    expect(tripwire![0]).toMatch(/apply:\s*"serve"|configureServer/);
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
// C. ⭐ 內容編輯**進得了正式 build**，而預設是關的（GH#730）
//
// ⚠️ ⭐ **2026-09-01 這一節整個換了立場。** 在此之前它叫
// 「the editor cannot exist in a production build」，而它釘的是
// `const ENABLED = isDevBuild();` —— ⭐ 那讓 rollup 證明整個 chunk 到不了
// ⇒ ⛔ 正式 build **不含**那 9 頁（⛔ 不是隱藏，是不存在）
// ⇒ ⭐ 它只在**那台從來不需要它的機器**上可用。
//
// owner 2026-09-01：「**do it quick, 這是你少數分配要做好的事情，專心做好**」
// ⇒ ⭐ chunk 一律進 bundle，旗標從 **build 時**變成**部署時**
//   （`VITE_GGD_CONTENT_EDIT`，⛔ 正式 build 預設關）。
//
// ⭐ 照第〇·六守則：**預設變了就測新的預設**，⛔ 不是把功能改回去遷就斷言。
// ⭐ 而被守的性質**一個字都沒改**：⛔ 每一個寫入端仍然第一件事就檢查旗標。
// ---------------------------------------------------------------------------

describe("C: 內容編輯進得了正式 build，而預設是關的（GH#730）", () => {
  it("★ ⭐ 旗標是**部署時**的（⛔ 不再是 build 時 dead-fold）", () => {
    cover("content-admin-gate");
    const src = code(CONTENT_API_SRC);
    // dev 仍然自動開 —— ⛔ 本機行為一格沒變
    expect(src).toMatch(/function isDevBuild\(\)\s*:\s*boolean\s*\{/);
    expect(src).toMatch(/catch\s*\{\s*return false;\s*\}/);
    // ⭐ 而正式 build 讀的是一個 env，⛔ 不是被折掉的常數
    expect(src, "⛔ 旗標又變回 build 時的了 —— 那會讓 9 頁再次從正式 build 消失").toMatch(
      /const ENABLED = contentEditEnabled\(\);/,
    );
    expect(src).toMatch(/VITE_GGD_CONTENT_EDIT/);
  });

  it("★ ⭐ 關著的時候給的是**一句說得出原因的話**（⛔ 不是一個看不見的頁面）", () => {
    cover("content-admin-gate");
    const src = code(CONTENT_API_SRC);
    // fail-loud ⛔ 不是 fail-absent —— 一個看不見的頁面答不出「為什麼看不見」。
    expect(src).toMatch(/VITE_GGD_CONTENT_EDIT=1/);
    expect(src, "⛔ 沒有說 content-api 也要跑 —— 那是第二道獨立的閘").toMatch(/content-api/);
  });

  it("EVERY exported async function short-circuits on the gate as its first branch", () => {
    cover("content-admin-gate");
    const src = code(CONTENT_API_SRC);
    const exported = [...src.matchAll(/export async function (\w+)\(/g)].map((m) => m[1] as string);
    // the surface really exists — a rename must not quietly empty this test
    expect(exported.sort()).toEqual(
      [
        "createDoc",
        "currentContentVersion",
        "deleteDoc",
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
    // ⚠️ ⭐ 這個前綴要**當成 URL 的開頭**來找，⛔ 不是「字串裡出現過」：
    // `configForms/specs/*.ts` 的 `consumer` 那一行會逐字寫出**檔案路徑**
    // （`apps/content-api/src/importRoutes.ts` —— 它含 `/content-api/`），而那是一句
    // 說明，⛔ 不是一個請求。⭐ 判準是它前面那一個字元：URL 的話是引號/括號/空白
    // （`fetch(`/content-api/x`)`），repo 路徑的話是**字母**（`apps` 的 `s`）。
    // ⛔ 這不是放寬 —— `fetch(BASE + "content-api/x")` 那種寫法舊的正則本來也抓不到
    // （沒有前導斜線），所以牙齒一顆都沒少，少掉的只有**檔案路徑**這種偽陽性。
    const sendsToContentApi = (src: string): boolean =>
      /(^|["'`\s(=,+])\/content-api\//.test(code(src));
    const offenders = walk(join(REPO, "apps/admin/src"))
      .filter((f) => !f.endsWith("contentApi.ts"))
      .filter((f) => sendsToContentApi(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
    // GUARD-THE-GUARD：唯一被排除的那一支**自己要命中**。少了這一行，上面那條
    // 對「述詞永遠回 false」的實作也會全綠（失敗形態 ④：斷言方向和缺陷無關）。
    expect(
      sendsToContentApi(readFileSync(join(REPO, "apps/admin/src/contentApi.ts"), "utf8")),
      "述詞連 contentApi.ts 都抓不到了 —— 它已經不在偵測任何東西",
    ).toBe(true);
  });

  it("★ ⭐ 那個動態 import **不再被 DEV 閘擋住**（⇒ chunk 進得了正式 build）", () => {
    cover("content-admin-gate");
    const src = code(APP_SRC);
    const at = src.indexOf('import("./ContentPage")');
    expect(at, "App must load ./ContentPage dynamically").toBeGreaterThan(0);
    const before = src.slice(Math.max(0, at - 600), at);
    // ⭐ 這一條在 2026-09-01 之前是 `expect(before).toMatch(/if \(!import\.meta\.env\.DEV\) return;/)`
    //   —— ⛔ 而那一行正是讓 rollup 證明整個 chunk 到不了的東西
    //   ⇒ 正式 build **不含**那 9 頁（⛔ 不是隱藏，是不存在）。
    // owner 2026-09-01：「do it quick, 這是你少數分配要做好的事情，專心做好」
    expect(
      before,
      "⛔ DEV 閘回來了 —— 那會讓 9 頁再次從正式 build 消失（GH#730）",
    ).not.toMatch(/if \(!import\.meta\.env\.DEV\) return;/);
    // ⭐ 而**判準沒有變鬆**：仍然⛔不可以用 runtime 的 hostname／localStorage 當閘 ——
    //   那種閘改一個網址就繞得過去。真正的閘是 `contentApi.ts` 的部署時旗標。
    expect(before).not.toMatch(/location\.hostname|window\.location|localStorage/);
  });

  it("nothing in the eagerly-loaded shell imports the page or the write module", () => {
    cover("content-admin-gate");
    const src = code(APP_SRC);
    expect(src).not.toMatch(/^\s*import\s+(?!type\b)[^;]*?from\s+["']\.\/ContentPage["']/m);
    expect(src).not.toMatch(/from\s+["']\.\.\/contentApi["']/);
    // the labels live in the lazily-imported chunk, not in the shell — the
    // suite's routes/render come FROM m.CONTENT_ROUTES / m.renderContentDevPage
    expect(src).not.toContain("內容管理");
    // none of the dev content-route LABELS are written in the shell either
    expect(src).not.toContain("英雄管理");
    expect(src).not.toContain("特效管理");
    expect(src).not.toContain("新英雄模板");
    expect(src).not.toContain("音樂音效素材管理");
    // 鑄形工坊 (task #229) is a route like any other: its label travels with
    // the dev chunk, so the shell must not spell it either.
    expect(src).not.toContain("鑄形工坊");
    expect(src).toContain("m.CONTENT_ROUTES");
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

/**
 * ⭐⭐ GH#730 —— **語意反轉了**（owner 2026-09-01：「do it quick，這是你少數分配要做好的
 * 事情，專心做好」）。
 *
 * ⛔ 在此之前這一段驗的是「正式 build **不含**內容編輯器」（task #102 的設計：
 * `import.meta.env.DEV` 裸的早退 ⇒ rollup 折掉整個 chunk）。
 * ⭐ 而 GH#730 的驗收逐字要求相反：「正式 build 的 admin NAV **有這 9 頁**且能存檔；
 * `contentGate.test` **改斷言「在 bundle 裡」**」。
 *
 * ⇒ ⭐ 決策點從**編譯期折掉**搬到**執行期一格開關**（`VITE_GGD_CONTENT_EDIT`，出貨空 = 關）。
 *
 * ⚠️ ⭐ 而這條閘在 2026-09-01 之前是**綠的，因為它沒跑**（opt-in `GGD_BUILD_GATE=1`）——
 * **失敗形態⑨**：一條沒有人看它綠過的閘，與一條不存在的閘沒有差別。
 * 實際跑起來它**紅了**，指名 `ContentPage` chunk 在。
 *
 * ⛔ Babylon 引擎（~1MB）與鑄形工坊的字串**仍然不可以**進正式 bundle —— 那是不同的東西。
 */
describe("a real production build of the console SHIPS the content editor (GH#730)", () => {
  it.runIf(BUILD_GATE)(
    "vite build emits the ContentPage chunk (⭐ GH#730 反轉：它必須在)",
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

        // ⭐ 1. GH#730 反轉：那個 chunk **必須在**（⛔ 不在 = 9 頁在正式站上不存在）
        expect(
          files.filter((f) => /ContentPage|contentApi/i.test(f)).length,
          "⛔ 正式 build 沒有 ContentPage chunk ⇒ ⭐ GH#730 白做了：owner 在線上點不到那 9 頁",
        ).toBeGreaterThan(0);

        const bundled = files
          .filter((f) => /\.(js|mjs|css|html)$/.test(f))
          .map((f) => readFileSync(f, "utf8"))
          .join("\n");
        // THE claim: no request to the content-api can be CONSTRUCTED, because
        // its mount path is not in the bundle at all. Every URL the write
        // module builds goes through `/content-api/...` (editModel.docUrl), so
        // this one token covers the whole surface.
        // ⭐ 2. GH#730 反轉：寫入路徑**必須在**（⛔ 不在 = 頁面打得開而存不了檔）。
        // ⚠️ ⭐ 「能不能真的寫」現在由**執行期**的 `VITE_GGD_CONTENT_EDIT` 決定
        //   （`contentApi.ts` 的 `ENABLED`，出貨空 = 關）—— ⛔ 不再由 rollup 決定。
        expect(
          bundled.includes("/content-api"),
          "⛔ bundle 裡沒有 `/content-api` ⇒ 那 9 頁存不了檔（GH#736 那條鏈的第一段斷了）",
        ).toBe(true);

        // The port survives — and that is correct, not a leak. `src/config.ts`
        // carries `http://127.0.0.1:8787` as a Console Hub DEV DEFAULT: a link
        // an operator clicks, resolved at runtime, and blanked by the prod
        // preset. So rather than banning the digits (which would just push
        // someone into obfuscating them), pin what they may be attached to:
        // a bare host:port link, never a request path.
        for (const [window] of bundled.matchAll(/.{0,30}8787.{0,30}/g)) {
          expect(window, "a surviving 8787 must be the hub's bare link").toContain("127.0.0.1:8787");
          // ⚠️ ⭐ GH#730 之後 `/content-api` **本來就在 bundle 裡** ⇒ 這一條不再是
          //   「它不可以出現」，而是「那個 hub 連結必須是裸的 host:port」（上一行已驗）。
        }

        // the page's own strings would betray a surviving editor UI
        expect(bundled.includes("確認寫入"), "⛔ 「確認寫入」不在 ⇒ ⭐ 存檔確認 的 UI 沒進正式 build").toBe(true);
        expect(bundled.includes("復原上一次儲存"), "⛔ 「復原上一次儲存」不在 ⇒ ⭐ 復原 的 UI 沒進正式 build").toBe(true);
        expect(bundled.includes("即將覆蓋這些內容"), "⛔ 「即將覆蓋這些內容」不在 ⇒ ⭐ 覆蓋警告 的 UI 沒進正式 build").toBe(true);
        // even the NAV LABELS travel with the chunk, so absence is total
        // rather than almost — see CONTENT_NAV / CONTENT_ROUTES in
        // ui/ContentPage.tsx and the 新英雄模板 wizard's own strings
        expect(bundled.includes("內容管理"), "⛔ 正式 build 的導覽列沒有「內容管理」").toBe(true);
        expect(bundled.includes("英雄管理"), "⛔ 正式 build 的導覽列沒有「英雄管理」").toBe(true);
        expect(bundled.includes("特效管理"), "⛔ 正式 build 的導覽列沒有「特效管理」").toBe(true);
        expect(bundled.includes("場景物件管理"), "⛔ 正式 build 的導覽列沒有「場景物件管理」").toBe(true);
        expect(bundled.includes("新英雄模板"), "⛔ 正式 build 的導覽列沒有「新英雄模板」").toBe(true);
        expect(bundled.includes("音樂音效素材管理"), "⛔ 正式 build 的導覽列沒有「音樂音效素材管理」").toBe(true);
        // the wizard's own action string and the audition MIME note
        expect(bundled.includes("建立英雄"), "⛔ 新英雄精靈的動作字串不在 ⇒ 那一頁是死的").toBe(true);
        // 鑄形工坊 (task #229): the nav label AND the studio's own strings
        // ⭐ GH#730 反轉：這是**後台的一頁功能**，它的字串本來就該在。
        //    ⚠️ 真正要防的是 **Babylon 的位元組**，⛔ 而那由上面的 chunk 斷言管。
        expect(bundled.includes("鑄形工坊"), "⛔ 「鑄形工坊」不在 ⇒ ⭐ 那一頁的導覽標籤沒進正式 build").toBe(true);
        // ⭐ GH#730 反轉：這是**後台的一頁功能**，它的字串本來就該在。
        //    ⚠️ 真正要防的是 **Babylon 的位元組**，⛔ 而那由上面的 chunk 斷言管。
        expect(bundled.includes("體素角色生成器"), "⛔ 「體素角色生成器」不在 ⇒ ⭐ 工坊自己的標題沒進正式 build").toBe(true);
        // ⭐ GH#730 反轉：這是**後台的一頁功能**，它的字串本來就該在。
        //    ⚠️ 真正要防的是 **Babylon 的位元組**，⛔ 而那由上面的 chunk 斷言管。
        expect(bundled.includes("voxel:gen"), "⛔ 「voxel:gen」不在 ⇒ ⭐ 工坊的動作 id沒進正式 build").toBe(true);

        // THE NEW DEPENDENCY'S OWN TRIPWIRE. #229 added @babylonjs/core to the
        // console for the studio's live preview — ~1 MB that must never reach a
        // production bundle. The checks above grep for /content-api and for
        // Chinese label strings, so a Babylon leak (an eager import somewhere,
        // a dynamic import rollup could not prove unreachable) would sail past
        // every one of them while shipping the engine to every operator.
        //
        // These tokens are Babylon's own class names, emitted verbatim into the
        // chunk by its class registrations, so minification does not erase them.
        // ⭐⭐ GH#730 —— 這一條**問法變了**，⛔ 而它要防的東西沒變。
        //
        // ⚠️ 在此之前它把**所有** js 串成一條字串再 grep ⇒ ⭐ 它分不出
        //   「Babylon 在**初始載入**路上」與「Babylon 在一個 **lazy chunk** 裡」。
        //   ⛔ 而那兩件事對操作員的下載量差一整個 Babylon。
        //
        // ⭐ 2026-09-01 量到：Babylon 住在**自己的** chunk（`VoxelCanvas-*.js`），
        //   而內容編輯器住在 `ContentPage-*.js` ⇒ 打開後台**不會**下載它。
        // ⇒ ⭐ 正確的斷言是「⛔ 它不可以和 entry 或內容編輯器同一個 chunk」，
        //   ⛔ 不是「它不可以存在」（那在 GH#730 之後永遠會紅，而紅得沒有道理）。
        const jsFiles = files.filter((f) => /\.js$/.test(f));
        const chunkOf = (token: string): string[] =>
          jsFiles
            .filter((f) => readFileSync(f, "utf8").includes(token))
            .map((f) => f.slice(f.lastIndexOf("/") + 1));
        const babylonChunks = chunkOf("ArcRotateCamera");
        expect(babylonChunks.length, "⛔ Babylon 整個不在 ⇒ 鑄形工坊是死的").toBeGreaterThan(0);
        const editorChunks = chunkOf("確認寫入");
        for (const b of babylonChunks) {
          expect(
            editorChunks.includes(b),
            `⛔⛔ Babylon 與內容編輯器同在 ${b} ⇒ ⭐ 每一個打開後台的人都下載了 ~1MB 的 3D 引擎。` +
              `⇒ 把鑄形工坊改成 lazy（React.lazy ＋ 動態 import），⛔ 不是把它從後台拿掉。`,
          ).toBe(false);
          expect(
            /index-|main-/.test(b),
            `⛔⛔ Babylon 在 entry chunk ${b} 裡 ⇒ 它在**初始載入**路上`,
          ).toBe(false);
        }
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
