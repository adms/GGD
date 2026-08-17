/**
 * adminui-icon-autogen — creating content in 內容管理 asks the loopback icon
 *                        daemon for art WITHOUT blocking the save, and every
 *                        refusal (版權暫停 / 已有手繪圖 / 已產過) comes back as a
 *                        sentence rather than as silence.
 * adminui-icon-gate    — the client is inert outside a dev build, the daemon
 *                        refuses to bind anything but loopback, and nothing on
 *                        this path can write a placeholder image.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import * as api from "./iconApi";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");
/** Strip comments so prose in a doc block cannot satisfy a check. */
const code = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
/** Same idea for Python: drop docstrings and `#` comments before grepping. */
const pycode = (s: string): string =>
  s.replace(/"""[\s\S]*?"""/g, "").replace(/(^|[^"'])#[^\n]*/g, "$1");

const API_SRC = read("apps/admin/src/icons/iconApi.ts");
const STRIP_SRC = read("apps/admin/src/ui/IconGenStrip.tsx");
const PAGE_SRC = read("apps/admin/src/ui/ContentPage.tsx");
const VITE_SRC = read("apps/admin/vite.config.ts");
const DAEMON_SRC = read("tools/icon-gen/local/daemon.py");
const BATCH_SRC = read("tools/icon-gen/local/batch.py");
const KEYWORDS_SRC = read("tools/icon-gen/local/keywords.py");

// --------------------------------------------------------------- transport --

interface Call {
  url: string;
  init: RequestInit | undefined;
}

let calls: Call[] = [];

function stubFetch(status: number, body: unknown): void {
  api.setIconFetch(((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      headers: { get: () => null },
    } as unknown as Response);
  }) as unknown as typeof fetch);
}

beforeEach(() => {
  calls = [];
});
afterEach(() => api.setIconFetch(null));

// ----------------------------------------------------------------- the gate --

describe("the client is inert outside a dev build", () => {
  it("reads the DEV flag through the repo's guarded shape, and gates on it once", () => {
    cover("adminui-icon-gate");
    const src = code(API_SRC);
    expect(src).toMatch(/function isDevBuild\(\)\s*:\s*boolean\s*\{/);
    expect(src).toMatch(/import\.meta as unknown as \{ env\?: \{ DEV\?: boolean \} \}/);
    expect(src).toMatch(/catch\s*\{\s*return false;\s*\}/);
    expect(src).toMatch(/const ENABLED = isDevBuild\(\);/);
    // no runtime hostname / storage sniffing: reachability is the real gate
    expect(src).not.toMatch(/location\.hostname|window\.location|localStorage/);
  });

  it("EVERY network-touching export short-circuits on the gate first", () => {
    cover("adminui-icon-gate");
    const src = code(API_SRC);
    for (const fn of ["health", "jobs", "preflight", "enqueue", "cancelJob"]) {
      const m = new RegExp(`export function ${fn}\\([^)]*\\)[^{]*\\{\\s*\\n\\s*if \\(!ENABLED\\)`);
      expect(src, `${fn} must check ENABLED as its first statement`).toMatch(m);
    }
  });

  it("the admin vite server proxies /icon-api to the loopback daemon only", () => {
    cover("adminui-icon-gate");
    expect(VITE_SRC).toMatch(/"\/icon-api": \{/);
    expect(VITE_SRC).toMatch(/VITE_ICON_API_URL \?\? "http:\/\/127\.0\.0\.1:8789"/);
    // the surrounding server block is still loopback-pinned — the proxy is only
    // safe because a LAN device cannot reach the front door
    expect(VITE_SRC).toMatch(/host: "127\.0\.0\.1"/);
    expect(VITE_SRC).toMatch(/loopbackOnly\(\)/);
  });
});

// ----------------------------------------------------- never blocks the save --

describe("generation never blocks creating a document", () => {
  it("the create path fires the request AFTER the doc exists and does not await it", () => {
    cover("adminui-icon-autogen");
    const src = code(PAGE_SRC);
    // the enqueue must come after the create outcome is handled and the success
    // message is set — and must be a bare call, never `await`ed
    const create = src.slice(src.indexOf("const createNew ="), src.indexOf("return (", src.indexOf("const createNew =")));
    expect(create).toMatch(/await api\.create\(/);
    expect(create).toMatch(/gen\.request\(tab, id\);/);
    expect(create).not.toMatch(/await gen\.request/);
    expect(create.indexOf("gen.request")).toBeGreaterThan(create.indexOf("setCreateMsg"));
  });

  it("the hook's request returns void, so it CANNOT be awaited meaningfully", () => {
    cover("adminui-icon-autogen");
    expect(code(STRIP_SRC)).toMatch(
      /request:\s*\(collection:\s*string,\s*id:\s*string,\s*force\?:\s*boolean\)\s*=>\s*void/,
    );
  });
});

// ----------------------------------------------------------- honest failure --

describe("every failure mode says something", () => {
  it("a daemon that answered but cannot render is NOT live", () => {
    cover("adminui-icon-autogen");
    const engine = { name: "sd", device: "none", warm: false, method: "twopass-v3", ok: false, reason: "torch 未安裝" };
    const stub: api.IconHealth = { ok: false, stub: true, engine, method: "twopass-v3", blocked: 22, queue: {} };
    expect(api.serviceMode(stub)).toBe("readonly");
    expect(api.modeMessage("readonly", stub)).toContain("不會塞一張假圖");
    // …and an unreachable daemon prints the command that starts it
    expect(api.serviceMode(null)).toBe("readonly");
    expect(api.modeMessage("readonly", null)).toContain("daemon.py");
  });

  it("health with NO stub flag is treated as a stub — the safe default is NO", async () => {
    cover("adminui-icon-gate");
    stubFetch(200, { ok: true, engine: { device: "mps" } });
    const r = await api.health();
    expect(r.ok).toBe(true);
    expect(r.data?.stub).toBe(true);
    expect(api.serviceMode(r.data)).toBe("readonly");
  });

  it("a live daemon says so, with the device it will use", async () => {
    cover("adminui-icon-autogen");
    stubFetch(200, {
      ok: true, stub: false, blocked: 22, method: "twopass-v3",
      engine: { name: "sd", device: "mps", warm: true, method: "twopass-v3", ok: true, reason: "" },
      queue: {},
    });
    const r = await api.health();
    expect(api.serviceMode(r.data)).toBe("live");
    expect(api.modeMessage("live", r.data)).toContain("mps");
  });

  it("a 409 refusal is an OUTCOME with a reason, not a thrown error", async () => {
    cover("adminui-icon-autogen");
    stubFetch(409, { error: "在暫停名單裡", reason: "blocked" });
    const r = await api.enqueue({ collection: "champions", id: "godie-e00u" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("blocked");
    expect(r.error).toContain("暫停");
  });

  it("author art and already-done come back as their own reasons", async () => {
    cover("adminui-icon-autogen");
    for (const reason of ["author-art", "already-done"] as const) {
      stubFetch(409, { error: "x", reason });
      const r = await api.enqueue({ collection: "items", id: "godie-i065" });
      expect(r.reason).toBe(reason);
    }
  });

  it("a collection with no icon convention is refused locally, with no request", async () => {
    cover("adminui-icon-autogen");
    stubFetch(200, {});
    const r = await api.enqueue({ collection: "loot-tables", id: "quest-rewards" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no-icons");
    expect(calls).toHaveLength(0);
  });

  it("a queued job parses out of the 202 body", async () => {
    cover("adminui-icon-autogen");
    stubFetch(202, {
      jobId: "abc",
      job: { id: "abc", collection: "augments", docId: "aegis-surge", state: "queued", reason: "", message: "", iconPath: null, fieldWritten: false, signal: "", elapsedMs: 0, error: null },
    });
    const r = await api.enqueue({ collection: "augments", id: "aegis-surge" });
    expect(r.ok).toBe(true);
    expect(r.data?.state).toBe("queued");
    expect(calls[0]?.url).toBe("/icon-api/jobs");
    expect(calls[0]?.init?.method).toBe("POST");
  });

  it("a skipped job reads as a fact, and a failed one as an error", () => {
    cover("adminui-icon-autogen");
    const base = { id: "j", collection: "items", docId: "godie-i065", message: "已經有手動／w3x 的圖", iconPath: null, fieldWritten: false, signal: "", elapsedMs: 0, error: null };
    const skipped = api.jobLine({ ...base, state: "skipped", reason: "author-art" });
    expect(skipped.tone).toBe("warn");
    expect(skipped.text).toContain("w3x");
    const failed = api.jobLine({ ...base, state: "failed", reason: "no-engine", message: "這台機器不能產圖" });
    expect(failed.tone).toBe("err");
    expect(failed.text).toContain("不能產圖");
  });
});

// ------------------------------------------------------- the two doc shapes --

describe("the two schema shapes", () => {
  it("augments get the file only; everything else also gets the icon FIELD", () => {
    cover("adminui-icon-autogen");
    expect(api.writesIconField("augments")).toBe(false);
    for (const c of ["champions", "abilities", "items"] as const) {
      expect(api.writesIconField(c)).toBe(true);
    }
    expect(api.isIconable("loot-tables")).toBe(false);
    // the daemon enforces the same split, and batch.set_icon_field refuses
    // augments from its own side — two layers, one rule
    expect(DAEMON_SRC).toMatch(/FIELDLESS_FAMILIES = \{"augments"\}/);
    expect(DAEMON_SRC).toMatch(/if family not in FIELDLESS_FAMILIES:/);
    expect(BATCH_SRC).toMatch(/if family == "augments":\s*\n\s*return False/);
  });
});

// ------------------------------------------------------------- the daemon ---

describe("the daemon refuses the things it must refuse", () => {
  it("binds loopback only, and dies rather than publish content writes to the LAN", () => {
    cover("adminui-icon-gate");
    expect(DAEMON_SRC).toMatch(/refusing to bind .*loopback-only/);
    expect(DAEMON_SRC).toMatch(/def _peer_is_loopback/);
    expect(DAEMON_SRC).toMatch(/ALLOWED_ORIGINS = \{/);
    expect(DAEMON_SRC).toMatch(/http:\/\/127\.0\.0\.1:60721/);
    // the peer check reads the SOCKET, never a forwarded header
    expect(DAEMON_SRC).toMatch(/self\.client_address\[0\]/);
    expect(DAEMON_SRC).not.toMatch(/X-Forwarded-For/i);
  });

  it("respects the committed blocked list, and re-reads it when the plan changes", () => {
    cover("adminui-icon-autogen");
    expect(DAEMON_SRC).toMatch(/def blocked_ids/);
    expect(DAEMON_SRC).toMatch(/plan\.get\("blocked"\)/);
    expect(DAEMON_SRC).toMatch(/os\.path\.getmtime\(PLAN_PATH\)/);
    expect(DAEMON_SRC).toMatch(/"reason": "blocked"/);
  });

  it("never overwrites w3x / hand-picked art — the sidecar is what distinguishes ours", () => {
    cover("adminui-icon-autogen");
    expect(DAEMON_SRC).toMatch(/batch\._marker_path\(have_abs\)/);
    expect(DAEMON_SRC).toMatch(/"reason": "author-art"/);
    // and `force` cannot reach that branch: the author-art check has no force term
    const guard = DAEMON_SRC.slice(DAEMON_SRC.indexOf("    have = (doc.get"), DAEMON_SRC.indexOf('if batch._is_done(out)'));
    expect(guard).not.toMatch(/force/);
  });

  it("is idempotent: a current-method icon is already-done, so re-saving redraws nothing", () => {
    cover("adminui-icon-autogen");
    expect(DAEMON_SRC).toMatch(/batch\._is_done\(out\) and not force/);
    expect(DAEMON_SRC).toMatch(/"reason": "already-done"/);
    // the sidecar convention is BATCH's, not a new one
    expect(BATCH_SRC).toMatch(/def _marker_path/);
    expect(DAEMON_SRC).not.toMatch(/def _marker_path|def _is_done/);
  });

  it("re-checks eligibility immediately before rendering, not only at enqueue", () => {
    cover("adminui-icon-autogen");
    const render = DAEMON_SRC.slice(DAEMON_SRC.indexOf("def _render"));
    expect(render).toMatch(/pre = preflight\(collection, doc_id, job\["force"\]\)/);
    expect(render).toMatch(/"state": "skipped"/);
  });

  it("NEVER writes a placeholder: no engine and a blank render both FAIL loudly", () => {
    cover("adminui-icon-gate");
    const render = DAEMON_SRC.slice(DAEMON_SRC.indexOf("def _render"));
    // the no-engine branch returns before any _save
    const noEngine = render.slice(render.indexOf('if not eng["ok"]'), render.indexOf("args = SimpleNamespace"));
    expect(noEngine).toMatch(/"state": "failed"/);
    expect(noEngine).not.toMatch(/_save/);
    // the blank guard is batch's own spread test, and it discards rather than saves
    expect(render).toMatch(/if spread < 30:/);
    const blank = render.slice(render.indexOf("if spread < 30:"), render.indexOf("out = batch._icon_abs"));
    expect(blank).toMatch(/"state": "failed"/);
    expect(blank).not.toMatch(/_save/);
  });

  it("writes NO prompt text of its own — the rejected emblem/crest A/B stays respected", () => {
    cover("adminui-icon-autogen");
    // every word the model sees comes from keywords.py via batch.render_two_pass;
    // the daemon's own EXECUTABLE lines contain no prompt vocabulary at all, so
    // there is nowhere for an emblem/crest clause to creep back in
    const exec = pycode(DAEMON_SRC);
    expect(exec).toMatch(/batch\.render_two_pass\(item, args\)/);
    expect(exec).not.toMatch(/pass1_prompt\(|pass2_prompt\(|"a glowing|anime character,/);
    expect(exec).not.toMatch(/emblem|crest|heraldic/i);
    // and the rejection itself is still recorded where prompts are built
    expect(KEYWORDS_SRC).toMatch(/TRIED AND REJECTED/);
  });

  it("後台即時產圖與批次讀的是**同一份**火候，⛔ 不是各自寫死的六個數字", () => {
    cover("adminui-icon-autogen");
    // ⚠️ 這一條以前釘的是字面值（`strength=0.45` 之類），而它的檔頭理由是
    // 「一邊調參數要變成看得見的分歧，不是無聲的」—— 那個保證靠的是**人記得同時改兩處**。
    // 2026-08-17 風格搬進 `content/config/icon-style.json` 之後，`batch.py` 改成從那份
    // JSON 拿預設值而 `daemon.py` 沒跟上：後台按一下「重畫」出來的圖會跟批次不同畫風，
    // 而兩張都是成功的圖，畫面上看不出來 —— 正是它要防的那件事，它卻只報「0.45 不見了」。
    // ⇒ 改成守真正的性質：**兩支都從 `load_icon_style()` 取值**。
    //    ⛔ 不斷言任何一個火候的數字（那是後台欄位，owner 會改）。
    for (const [name, src] of [
      ["daemon.py", DAEMON_SRC],
      ["batch.py", BATCH_SRC],
    ] as const) {
      expect(src, `${name} 沒有讀 content/config/icon-style.json`).toMatch(/load_icon_style\(\)/);
    }
    // 六個旋鈕一個都不能漏 —— 漏掉的那一格會靜靜退回 Python 的常數。
    for (const key of ["strength", "size", "pass1Steps", "pass1Guidance", "pass2Steps", "pass2Guidance"]) {
      expect(DAEMON_SRC, `daemon.py 沒有從設定拿 ${key}`).toContain(`style["${key}"]`);
      expect(BATCH_SRC, `batch.py 沒有從設定拿 ${key}`).toContain(`style["${key}"]`);
    }
  });

  it("answers the same routes through the vite mount prefix and a direct curl", () => {
    cover("adminui-icon-gate");
    // the proxy forwards `/icon-api/health`; an operator curling :8789/health
    // must reach the SAME handler, not a second subtly different one
    expect(DAEMON_SRC).toMatch(/MOUNT = "icon-api"/);
    expect(DAEMON_SRC).toMatch(/parts\[1:\] if parts\[:1\] == \[self\.MOUNT\] else parts/);
    expect(api.ICON_BASE).toBe("/icon-api");
  });

  it("coalesces duplicate requests instead of drawing the same icon twice", () => {
    cover("adminui-icon-autogen");
    expect(DAEMON_SRC).toMatch(/j\["state"\] in \("queued", "running"\)/);
  });
});
