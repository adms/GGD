#!/usr/bin/env node
/**
 * 🧾 GH#473 —— 把「啟用上架時的稽核」**預算成一份出貨產物**。
 *
 * ── ⛔ 為什麼需要它 ────────────────────────────────────────────────────────
 * 稽核今天走 `/__review` 的 dev 端點 ⇒ ⭐ **正式後台按下「啟用」時看到的是
 * 「⚠️ 稽核沒有跑」** —— 那是**誠實的**（`enableAudit.ts` 的三態刻意分開），
 * ⛔ 但不是最終狀態。
 *
 * ── ⭐ 為什麼可以預算（⛔ 不必開一條 platform API）──────────────────────────
 * `auditPlan()` 只讀兩樣東西：`content/` 底下那個 id 屬於哪個集合，
 * 以及那條稽核的實作檔**有沒有匯出的進入點**（`probeCallable`）。
 * ⇒ ⭐ **零個執行期狀態** —— 它在 build 的那一刻就完全決定了。
 * ⇒ ⛔ 開一條 API 去算一個常數，是把一份靜態檔案偽裝成服務。
 *
 * ── ⭐ 產物住哪 ────────────────────────────────────────────────────────────
 * `content/assets/review/enable-audit.json` —— 跟著 `content/` 一起 bind-mount
 * ⇒ ⭐ 正式站**不必重建映像**就拿得到（與 bundle 同一條路）。
 *
 * ⚠️ 它是**產物**：⛔ 不要手改（`genguard` 會擋）。改稽核清單要改
 * `tools/review/enable-audit.mjs` 的 `AUDITS` 再重跑這一支。
 *
 *   node tools/review/build-enable-audit.mjs           # 產生
 *   node tools/review/build-enable-audit.mjs --check   # 過期就非零
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { auditPlan } from "./enable-audit.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(REPO, "content/assets/review/enable-audit.json");

/** ⭐ 涵蓋的是**每一份可上架的內容**（⛔ 不是「今天啟用的那些」—— 那是執行期狀態）。 */
const COLLECTIONS = ["champions", "abilities", "items", "augments"];

function allIds() {
  const ids = [];
  for (const c of COLLECTIONS) {
    const dir = join(REPO, "content", c);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      ids.push(f.slice(0, -5));
    }
  }
  return ids.sort();
}

const ids = allIds();
// ⚠️ ⭐ `auditPlan` 回的是**整份計畫**（`{schema, ids, counts, rows, wiring}`），
//   ⛔ 不是裸的 rows —— 第一版我假設成後者，產物就寫出 `rows: undefined`
//   而**產生器 exit 0**。⇒ ⭐ 讀回傳型別，⛔ 不要憑名字猜。
const plan = auditPlan(REPO, ids);
const doc = {
  schema: "ops.enable-audit@1",
  note:
    "⭐ GH#473 —— 「啟用上架」稽核的 **build 期預算**。⛔ 產物，不要手改。" +
    "⭐ 它零執行期狀態（只讀 content/ 的集合歸屬 ＋ 稽核實作檔有沒有匯出進入點）" +
    "⇒ 正式後台不必開一條 API 就答得出「這一格啟用之後要驗什麼」。",
  ids: ids.length,
  counts: plan.counts,
  wiring: plan.wiring,
  rows: plan.rows,
};
const body = JSON.stringify(doc, null, 2) + "\n";

if (process.argv.includes("--check")) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (cur !== body) {
    process.stderr.write(
      `⛔ ${OUT.replace(REPO + "/", "")} 過期了 —— 跑 node tools/review/build-enable-audit.mjs 然後 git add\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`✓ enable-audit 預算是最新的（${ids.length} 個 id · ${plan.rows.length} 列）\n`);
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, body);
  process.stdout.write(`✓ ${ids.length} 個 id · ${plan.rows.length} 列 → ${OUT.replace(REPO + "/", "")}\n`);
}
