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
 * ⭐ 快取是 **checksum（md5）鍵**的（owner 2026-08-28 逐字：「善用redis cache在
 *    原資料沒更新(md5+checksum)的時候讀取cache就好不用每次都重算」）：
 *    build() 宣告它讀了哪些檔（deps）→ 對來源 bytes 算 md5 合成 key →
 *    命中（記憶體 → redis/檔案後端）就回 cache，未命中才算。
 *    「實時」的定義是**與磁碟現況一致**，⛔ 不是每次都白算一遍。
 *    ⚠️ 舊制是 mtime 鍵 —— macOS 目錄 mtime 不因就地改檔而動，外部編輯會拿到過期快取；
 *    checksum 兩個方向都對（bytes 變必 miss、沒變必 hit）。細節與後端（REDIS_URL ⇒
 *    redis；否則檔案）住 cache.mjs；開關 GGD_LIVE_CACHE=0；命中與否誠實寫在
 *    X-Live-Cache header（hit|miss|off key=前8碼 store=memory|file|redis）。
 *    守衛：packages/shared/src/ops/liveChecksumCache.test.ts（兩個方向都量）。
 *
 * ⚠️ dev-only：由 vite `configureServer` 掛載（apply:"serve"），production build
 *    不含這一段 —— 與 tools/review/middleware.mjs 同一個形狀。
 */
import { readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { cacheEnabled, createCacheStore, sourcesChecksum } from "./cache.mjs";

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

function sendJson(res, code, body) {
  sendJsonText(res, code, JSON.stringify(body));
}

function sendJsonText(res, code, text) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(text);
}

/** 快取後端單例（第一次用到才建）＋ 「後端連不上」只 warn 一次（fail-open 但要有聲音）。 */
let cacheStore = null;
let storeWarned = false;
function getCacheStore() {
  cacheStore ??= createCacheStore();
  return cacheStore;
}
function warnStoreOnce(err) {
  if (storeWarned) return;
  storeWarned = true;
  console.warn(`[admin-live] 快取後端連不上（fail-open 續算，header 標 -unreachable）：${String(err)}`);
}

/* ───────── ⭐ 共用寫入端（GH#821）—— 一條路，⛔ 不是 13 種寫法 ───────── */

/** glob（`*` 不跨 `/`）→ 是否命中。⛔ 不用 regex 特殊字元轉義拼字串（genguard 的教訓）。 */
function globHit(glob, path) {
  const safe = /^[a-zA-Z0-9_/@.-]$/;
  const re = new RegExp(
    "^" + glob.split("").map((c) => (c === "*" ? "[^/]*" : safe.test(c) ? c : "\\" + c)).join("") + "$",
  );
  return re.test(path);
}

// JSON pointer 樣式比對：pattern 裡的 `*` 命中任一段（例：entries.*.weight）。
// ⚠️ 這行是 // 註解：pointer 樣式含 `*` 加 `/`，寫進 /* */ 會提早關掉區塊註解。
function pointerHit(pattern, pointer) {
  const a = pattern.split("/").filter((s) => s !== "");
  const b = pointer.split("/").filter((s) => s !== "");
  return a.length === b.length && a.every((seg, i) => seg === "*" || seg === b[i]);
}

/** 宣告式 value 規格（⛔ 不是 zod —— 理由見檔頭）。回 null = 過。 */
function specError(spec, v) {
  if (v === null) return spec.nullable === true ? null : "這一格不可為 null（刪欄位要 nullable:true）";
  if (spec.type === "number") {
    if (typeof v !== "number" || !Number.isFinite(v)) return "要是有限數字";
    if (spec.integer === true && !Number.isInteger(v)) return "要是整數";
    if (spec.min !== undefined && v < spec.min) return `低於下界 ${spec.min}`;
    if (spec.max !== undefined && v > spec.max) return `高於上界 ${spec.max}`;
  } else if (spec.type === "string") {
    if (typeof v !== "string") return "要是字串";
    if (spec.maxLen !== undefined && v.length > spec.maxLen) return `超過長度上限 ${spec.maxLen}`;
    if (spec.enum !== undefined && !spec.enum.includes(v)) return `要在 ${spec.enum.join("/")} 裡`;
  } else if (spec.type === "boolean") {
    if (typeof v !== "boolean") return "要是布林";
  } else {
    return `規格缺 type（${String(spec.type)}）`;
  }
  return null;
}

/**
 * ⭐ 落盤走 python3 round-trip，⛔ 不用 JSON.stringify 重寫整檔 ——
 * content/abilities 那一族是 python 產生器/正規化器寫的，數字帶 `15.0` 這種 float 標記；
 * node 的 stringify 會把它們**全檔**正規化成 `15`（實測 e2e 一次 save 造出 6 行無關 churn），
 * 而那正是「下一次 sync/--check 把它打回來」的形狀。python json 保留 int/float 之別，
 * 對 node 風格的手編檔（arena-rules、loot-tables）輸出也逐位元組一致（e2e 驗過 git diff 乾淨）。
 * 中途節點必須已存在（⛔ 不創造）；value=null ⇒ 刪欄位（只限物件成員）。
 */
const PY_SET = `
import json, sys
path, pointer, raw = sys.argv[1], sys.argv[2], sys.argv[3]
value = json.loads(raw)
doc = json.load(open(path, encoding="utf-8"))
segs = [s for s in pointer.split("/") if s]
node = doc
for s in segs[:-1]:
    node = node[int(s)] if isinstance(node, list) else node[s]
last = segs[-1]
if isinstance(node, list):
    i = int(last)
    if not (0 <= i < len(node)): raise IndexError(f"index {i} out of range {len(node)}")
    if value is None: raise ValueError("array element cannot be null-deleted")
    old = node[i]; node[i] = value
else:
    if not isinstance(node, dict): raise TypeError("parent is not an object")
    old = node.get(last)
    if value is None: node.pop(last, None)
    else: node[last] = value
open(path, "w", encoding="utf-8").write(json.dumps(doc, ensure_ascii=False, indent=2) + "\\n")
print(json.dumps({"old": old}, ensure_ascii=False))
`;

function setAtPointerOnDisk(abs, pointer, value) {
  const py = spawnSync("python3", ["-c", PY_SET, abs, pointer, JSON.stringify(value)], {
    encoding: "utf8",
    timeout: 20000,
  });
  if (py.status !== 0) return { error: `寫入失敗：${(py.stderr ?? "").trim().split("\n").pop() ?? "python3 非零離開"}` };
  try {
    return { old: JSON.parse(py.stdout).old ?? null };
  } catch {
    return { error: `寫入器輸出不是 JSON：${(py.stdout ?? "").slice(0, 200)}` };
  }
}

/**
 * POST /__live/<name>/save 的處理。⭐ 每一步都會**大聲**失敗（fail-open 沒錯，靜默才是缺陷）：
 * 405 沒宣告寫入端（附 readonlyWhy）· 403 live 模式寫材料側 · 400 規則/規格/check 不過 ·
 * 409 genguard 擋（產生器產物 —— 指名擁有者與正確修法）。
 */
async function handleSave(repoRoot, mode, entry, dsName, body, res) {
  const w = entry.mod.write;
  if (!w || !Array.isArray(w.rules) || w.rules.length === 0)
    return sendJson(res, 405, {
      error: `${dsName} 沒有宣告寫入端（export const write）`,
      readonlyWhy: entry.mod.readonlyWhy ?? null,
    });
  const path = String(body?.path ?? "");
  const pointer = String(body?.pointer ?? "");
  const value = body?.value === undefined ? null : body.value;
  if (path === "" || pointer === "" || path.includes("..") || path.startsWith("/"))
    return sendJson(res, 400, { error: "需要 repo 相對 path 與 JSON pointer（⛔ 不收 .. 或絕對路徑）" });
  const rule = w.rules.find((r) => (r.paths ?? []).some((g) => globHit(g, path)) && (r.pointers ?? []).some((p) => pointerHit(p, pointer)));
  if (!rule)
    return sendJson(res, 400, {
      error: `${dsName} 的寫入規則不覆蓋 ${path} 的 ${pointer}`,
      allowed: w.rules.map((r) => ({ paths: r.paths, pointers: r.pointers, why: r.why ?? null })),
    });
  const verr = specError(rule.value ?? {}, value);
  if (verr !== null) return sendJson(res, 400, { error: `value ${verr}`, spec: rule.value ?? {} });
  if (mode === "live" && w.kind !== "overlay")
    return sendJson(res, 403, {
      error:
        "⛔ 線上不開放寫**材料**側（owner 2026-08-27「批核材料跟批核結果分署」）——" +
        " content 在線上是 :ro 掛載。這一格請在本機後台改完再 git push。",
      kind: w.kind,
    });
  if (typeof rule.check === "function") {
    const msg = await rule.check(repoRoot, { path, pointer, value });
    if (typeof msg === "string" && msg !== "") return sendJson(res, 400, { error: msg });
  }
  // ⭐ genguard —— 與 PreToolUse hook 同一套裁決（spawn 它，⛔ 不抄它的表）。
  const gg = spawnSync("bash", ["scripts/genguard.sh", path], { cwd: repoRoot, encoding: "utf8", timeout: 20000 });
  const ggOut = `${gg.stdout ?? ""}${gg.stderr ?? ""}`.trim();
  if (gg.status !== 0)
    return sendJson(res, 409, { error: "genguard 擋下這一格 —— 目標是產生器的產物，直接寫等於沒寫。", genguard: ggOut });
  const abs = join(repoRoot, path);
  if (!existsSync(abs)) return sendJson(res, 404, { error: `找不到 ${path}（這個端點只改既有檔，⛔ 不創檔）` });
  const applied = setAtPointerOnDisk(abs, pointer, value);
  if (applied.error) return sendJson(res, 400, { error: applied.error });
  entry.cache = null; // build() 的 mtime 快取立即失效 —— 重讀就看到新值
  const notes = [];
  if (ggOut.includes("正規化器")) notes.push(ggOut.split("\n")[0]);
  if (path.startsWith("content/")) notes.push("⚠️ 改了 content/ —— 出貨前要跑 pnpm content:build 並 commit 產物（bundle/_index）。");
  return sendJson(res, 200, { ok: true, path, pointer, old: applied.old, value, kind: w.kind, notes });
}

export function createAdminLiveMiddleware(repoRoot, options = {}) {
  const mode = options.mode ?? "local";
  return async (req, res, next) => {
    const url = (req.url ?? "").split("?")[0];
    if (!url.startsWith("/__live/")) return next();
    const name = url.slice("/__live/".length);
    if (name === "_list") return sendJson(res, 200, { datasets: listDatasets() });
    if (req.method === "POST" && name.endsWith("/save")) {
      const dsName = name.slice(0, -"/save".length);
      try {
        const entry = await loadModule(dsName);
        if (!entry) return sendJson(res, 404, { error: `沒有這個 dataset：${dsName}`, have: listDatasets() });
        let raw = "";
        req.on("data", (c) => (raw += c));
        req.on("end", async () => {
          try {
            await handleSave(repoRoot, mode, entry, dsName, raw ? JSON.parse(raw) : {}, res);
          } catch (err) {
            sendJson(res, 500, { error: String(err && err.stack ? err.stack : err) });
          }
        });
      } catch (err) {
        sendJson(res, 500, { error: String(err && err.stack ? err.stack : err) });
      }
      return;
    }
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
