/**
 * VFX-SCRIPT STUDIO API (GH#838) — dev-only 寫回通道，掛在 client vite dev server。
 *
 * 模式照抄 tools/review/middleware.mjs（GH#664 的跨 lane 契約）：
 * vite.config.ts 在 configureServer 時動態 import 這一份；模組缺席 ⇒ 路由回 503
 * 指名缺什麼，⛔ 不是白畫面。`apply:"serve"` ⇒ 這條路**不存在於任何出貨 build**。
 *
 * 路由（全部 JSON）：
 *   GET  /__vfxstudio/scripts        → { scripts: [{id, abilityId, path}] }（掃目錄）
 *   GET  /__vfxstudio/script?id=X    → 該檔原文
 *   POST /__vfxstudio/script         → { id, doc } 寫進 content/vfx-scripts/<id>.json
 *
 * ⚠️ 驗證的分工：**權威 Zod 驗證在頁面側**（studio import 出貨的 zVfxScriptDoc，
 * 存檔前 parse —— schema 單一住處）；這裡只做結構與路徑安全（id 白名單字元、
 * doc 是物件、id 一致），⛔ 不重打一份 schema。存了之後出貨還要 `pnpm content:build`
 * ＋ commit —— 回應裡帶著這句提醒，studio 的 UI 會顯示它。
 *
 * ⚠️ 寫的是 `content/vfx-scripts/`（手編集合，genguard 無擁有者）——
 * ⛔ 這支永遠不可以長出「寫別的集合」的參數：那等於繞過產物隔離區。
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROUTE_PREFIX = "/__vfxstudio";
const ID_RE = /^[a-z0-9][a-z0-9.-]{0,80}$/;

/** @param {string} repoRoot */
export function createVfxStudioMiddleware(repoRoot) {
  const dir = join(repoRoot, "content", "vfx-scripts");

  /** @param {import("node:http").ServerResponse} res */
  const sendJson = (res, code, body) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
  };

  /**
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   * @param {() => void} next
   */
  return function vfxStudioMiddleware(req, res, next) {
    const url = new URL(req.url ?? "/", "http://local");
    if (!url.pathname.startsWith(ROUTE_PREFIX)) return next();

    if (req.method === "GET" && url.pathname === `${ROUTE_PREFIX}/scripts`) {
      const scripts = [];
      if (existsSync(dir)) {
        for (const f of readdirSync(dir).sort()) {
          if (!f.endsWith(".json") || f.startsWith("_")) continue;
          try {
            const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
            scripts.push({ id: String(doc.id ?? f.replace(/\.json$/, "")), abilityId: doc.abilityId ?? null, path: `vfx-scripts/${f}` });
          } catch {
            scripts.push({ id: f.replace(/\.json$/, ""), abilityId: null, path: `vfx-scripts/${f}`, parseError: true });
          }
        }
      }
      return sendJson(res, 200, { scripts });
    }

    if (req.method === "GET" && url.pathname === `${ROUTE_PREFIX}/script`) {
      const id = url.searchParams.get("id") ?? "";
      if (!ID_RE.test(id)) return sendJson(res, 400, { error: `id 不合法：${id}` });
      const p = join(dir, `${id}.json`);
      if (!existsSync(p)) return sendJson(res, 404, { error: `content/vfx-scripts/${id}.json 不存在` });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(readFileSync(p, "utf8"));
    }

    if (req.method === "POST" && url.pathname === `${ROUTE_PREFIX}/script`) {
      let raw = "";
      req.on("data", (c) => {
        raw += c;
        if (raw.length > 512 * 1024) req.destroy(); // script 上限 64 段 —— 512KB 已是天文
      });
      req.on("end", () => {
        try {
          const body = JSON.parse(raw);
          const id = String(body?.id ?? "");
          const doc = body?.doc;
          if (!ID_RE.test(id)) return sendJson(res, 400, { error: `id 不合法：${id}` });
          if (typeof doc !== "object" || doc === null || Array.isArray(doc))
            return sendJson(res, 400, { error: "doc 要是一個物件" });
          if (doc.id !== id) return sendJson(res, 400, { error: `doc.id（${doc.id}）與 id（${id}）不一致` });
          if (doc.schema !== "vfx-script@1")
            return sendJson(res, 400, { error: `schema 要是 vfx-script@1，收到 ${doc.schema}` });
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, `${id}.json`), JSON.stringify(doc, null, 2) + "\n", "utf8");
          return sendJson(res, 200, {
            ok: true,
            path: `content/vfx-scripts/${id}.json`,
            reminder: "已寫進工作樹。出貨前要：pnpm content:build ＋ git add（bundle 是 build 的產物）。",
          });
        } catch (err) {
          return sendJson(res, 400, { error: `body 不是 JSON：${err instanceof Error ? err.message : String(err)}` });
        }
      });
      return;
    }

    return sendJson(res, 404, { error: `未知路由 ${req.method} ${url.pathname}` });
  };
}
