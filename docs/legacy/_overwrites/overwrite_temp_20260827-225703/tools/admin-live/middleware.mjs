/**
 * 🔴 LIVE 後台資料面 —— **每次請求當場算**，⛔ 不是 build-time 烘的 JSON。
 *
 * owner 2026-08-26（逐字）：
 * > 「這些後台頁面的內容都要 **script 實時動態產生**，**不是靜態內容**喔」
 *
 * 路由：GET /__live/<dataset>            → datasets/<dataset>.mjs 的 build() 當場跑
 *       GET /__live/_list                → 列出可用的 dataset（自動發現）
 *       POST /__live/<dataset>           → 帶 body 的計算（例：skill-suggest）
 *       POST /__live/<dataset>/save      → ⭐ **共用寫入端**（GH#821，owner 2026-08-27
 *         「全部都要即時動態資料讀取**及儲存**（by JSON），不是唯讀」）。
 *         body {path, pointer, value}；每個 dataset 用 `export const write` 宣告
 *         kind(source/overlay)＋rules（paths glob × pointers × value 規格 × check）。
 *         寫入前逐次 spawn `bash scripts/genguard.sh <path>` —— 產生器產物一律 409
 *         指名擁有者（⛔ 直接寫產物等於沒寫，下一次 sync 打回來）。
 *         沒有 write 的 dataset 要 `export const readonlyWhy`（能被反駁的理由）——
 *         覆蓋率閘 packages/shared/src/ops/liveWriteCoverage.test.ts 逐頁在驗。
 *         ⚠️ 驗證是宣告式規格（type/min/max/enum/nullable）＋rule.check(跨檔驗證)，
 *         ⛔ 不是 zod —— tools/ 不在 pnpm workspace 套件裡，bare import "zod" 解析不到；
 *         規格是資料，兩邊（閘與端點）讀同一份宣告。
 *
 * ⭐ dataset 是**自動發現**的（掃 datasets/*.mjs），⛔ 不是一張要手動加列的表 ——
 *    第〇·七守則的「一行接線」病：每加一頁就要在這裡加一行的設計，撞車次數
 *    會把它變成重災區。掃目錄 = 加檔案就上線。
 *
 * ⭐ 快取是 **mtime 鍵**的：build() 宣告它讀了哪些檔（deps），下次請求先比對
 *    這些檔的 mtime，全都沒動才回快取 —— 「實時」的定義是**與磁碟現況一致**，
 *    ⛔ 不是每次都白算一遍。deps 動了就重算。
 *
 * ⚠️ dev-only：由 vite `configureServer` 掛載（apply:"serve"），production build
 *    不含這一段 —— 與 tools/review/middleware.mjs 同一個形狀。
 */
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATASETS = join(HERE, "datasets");

/** dataset 名 → { build, mtimeKey, cached }。模組本身也熱載（mtime 變了重 import）。 */
const registry = new Map();

function listDatasets() {
  if (!existsSync(DATASETS)) return [];
  return readdirSync(DATASETS)
    .filter((f) => f.endsWith(".mjs") && !f.startsWith("_"))
    .map((f) => f.slice(0, -4));
}

async function loadModule(name) {
  const file = join(DATASETS, `${name}.mjs`);
  if (!existsSync(file)) return null;
  const mtime = statSync(file).mtimeMs;
  const hit = registry.get(name);
  if (hit && hit.moduleMtime === mtime) return hit;
  // 熱載：query string 讓 node 重新 import（dev-only，洩漏可忽略）
  const mod = await import(`${pathToFileURL(file).href}?v=${mtime}`);
  const entry = { mod, moduleMtime: mtime, cache: null };
  registry.set(name, entry);
  return entry;
}

function depsKey(repoRoot, deps) {
  const parts = [];
  for (const d of deps ?? []) {
    const p = join(repoRoot, d);
    try {
      const st = statSync(p);
      parts.push(`${d}:${st.isDirectory() ? "d" : ""}${st.mtimeMs}`);
    } catch {
      parts.push(`${d}:absent`);
    }
  }
  return parts.join("|");
}

function sendJson(res, code, body) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export function createAdminLiveMiddleware(repoRoot) {
  return async (req, res, next) => {
    const url = (req.url ?? "").split("?")[0];
    if (!url.startsWith("/__live/")) return next();
    const name = url.slice("/__live/".length);
    if (name === "_list") return sendJson(res, 200, { datasets: listDatasets() });
    try {
      const entry = await loadModule(name);
      if (!entry) return sendJson(res, 404, { error: `沒有這個 dataset：${name}`, have: listDatasets() });
      const { build, deps, compute } = entry.mod;
      if (req.method === "POST") {
        if (typeof compute !== "function")
          return sendJson(res, 405, { error: `${name} 沒有 compute()（POST 入口）` });
        let raw = "";
        req.on("data", (c) => (raw += c));
        req.on("end", async () => {
          try {
            sendJson(res, 200, await compute(repoRoot, raw ? JSON.parse(raw) : {}));
          } catch (err) {
            sendJson(res, 500, { error: String(err) });
          }
        });
        return;
      }
      if (typeof build !== "function")
        return sendJson(res, 500, { error: `${name} 沒有 export build()` });
      const key = depsKey(repoRoot, typeof deps === "function" ? deps(repoRoot) : deps);
      if (entry.cache && entry.cache.key === key) {
        res.setHeader("X-Live-Cache", "hit");
        return sendJson(res, 200, entry.cache.body);
      }
      const t0 = Date.now();
      const body = await build(repoRoot);
      body._live = { computedAt: new Date().toISOString(), ms: Date.now() - t0, cacheKey: key ? "mtime" : "none" };
      entry.cache = { key, body };
      res.setHeader("X-Live-Cache", "miss");
      return sendJson(res, 200, body);
    } catch (err) {
      return sendJson(res, 500, { error: String(err && err.stack ? err.stack : err) });
    }
  };
}
