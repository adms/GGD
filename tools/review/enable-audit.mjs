#!/usr/bin/env node
/**
 * tools/review/enable-audit.mjs —— GH#473「**啟用上架的當下**跑稽核，結果排成可勾選的待修表」。
 *
 * owner 2026-08-18（逐字）：
 * > 「你應該是要**設計啟用的時候才做自動跑測試 script**，測試結果再排入是否修理」
 *
 * ⇒ 把第零守則的**判準**（「記得跑一下稽核」）換成**閘**（啟用當下必跑）：
 *   ⛔ 不啟用不花錢 · ⭐ 啟用就一定驗。
 *
 * ## ⛔ 這一支**刻意不自己實作任何一條稽核判準**
 * #473 的 Known risk 逐字寫著：
 * > 「稽核邏輯若只活在 .test.ts 裡，抽給 runtime 用時會出現**兩份實作各自漂**」
 * ⇒ 這裡只做**分派**：每一條稽核宣告它的實作住哪一個檔、進入點叫什麼名字，
 *   然後**去問那個檔**（讀原始碼找 `export function|const <symbol>`）——
 *   ⭐ callable 與否是**推導**出來的，⛔ 不是這張表上手寫的一個布林值
 *   （手寫的那種正是 `SIM_CAPABILITIES` 撒過兩次謊的形狀）。
 *
 * ## ⭐ 三態，⛔ 不是「過／不過」
 *   `ran`          —— 進入點在，跑得出 findings
 *   `not-callable` —— ⚠️ 判準只活在 `.test.ts` 裡 ⇒ runtime 叫不到它。
 *                     ⛔ 這**不是**「這個 id 沒問題」，是「這一條今天量不到」。
 *   `n/a`          —— 這條稽核不管這個集合（例：castability 不管道具）
 *
 * ## ⚠️ 出貨接線點在**這個柵欄之外**
 * 「白名單／貨架存檔」那一刻的掛鉤住 `apps/admin/`（見本檔尾的 WIRING 常數）。
 * 這一支提供的是**被呼叫的那一半**：`auditPlan(repoRoot, ids)` ＋ CLI。
 *
 * 用法：
 *   node tools/review/enable-audit.mjs --ids godie-e002.e,odm-gear
 *   node tools/review/enable-audit.mjs --ids … --json
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SHARED = "packages/shared/src/content";

/**
 * 三支稽核（#473 逐字點名）。每一列宣告**它的判準住哪裡**，
 * ⛔ 不在這裡重寫判準。`collections` 決定哪些 id 該送給它。
 */
export const AUDITS = [
  {
    id: "noOpModifierClaims",
    zh: "空頭宣稱：這條 modifier 在出貨設定下改得動任何數字嗎",
    // ⭐ 2026-08-31 抽出來了（GH#473）：判準原本只活在 `.test.ts` 裡 ⇒ runtime 叫不到。
    //   ⚠️ ⭐ 抽走之後那支測試**import 這一份**（⛔ 不是留一份副本）——
    //     同一個判準兩個住處一定會漂開,⭐ 而漂開時**兩邊都是綠的**（第〇·四守則）。
    module: `${SHARED}/noOpModifierClaims.ts`,
    symbol: "noOpClaimsOf",
    collections: ["items", "abilities", "augments", "champions"],
  },
  {
    id: "castability",
    zh: "可施放性普查：這支技能的 effect 真的有處理器嗎",
    module: `${SHARED}/abilityNoOpEffects.ts`,
    symbol: "analyseAbility",
    collections: ["abilities"],
    extractTo: null,
  },
  {
    id: "descriptionClaims",
    zh: "說明↔JSON 一致性：卡面上的數字與標籤對得上實作嗎",
    module: `${SHARED}/descriptionClaims.ts`,
    symbol: "scanAbility",
    collections: ["abilities"],
    extractTo: null,
  },
];

/** ⭐ 接線點（柵欄外）—— 寫在這裡是為了讓「還沒接」是一件**查得到**的事。 */
export const WIRING = {
  savePoint: "apps/admin/src/ui/CurationPage.tsx（白名單／貨架存檔）",
  tableShape: "apps/admin/src/ui/ApprovalsPage.tsx（#242 Quick Approval 的形狀，重用）",
  action: "apps/admin/src/store.ts（動作接線 —— ⚠️ 併行共用檔，pathspec 逐檔列名）",
  note: "⛔ 只對『這一次新啟用的 id』跑（成本斷言）；稽核失敗⛔不可靜默 —— 表上要有紅列。",
};

/**
 * 一條稽核今天叫不叫得到 —— ⭐ **去問那個檔**，⛔ 不看表上手寫的布林。
 * @returns { callable: boolean, why: string }
 */
export function probeCallable(repoRoot, audit) {
  const abs = join(repoRoot, audit.module);
  if (!existsSync(abs)) return { callable: false, why: `實作檔不存在：${audit.module}` };
  if (audit.symbol === null)
    return {
      callable: false,
      why:
        `判準只活在 ${audit.module}（.test.ts）裡，沒有匯出的進入點 ⇒ runtime 叫不到。` +
        `⭐ 修法：抽成 ${audit.extractTo}，讓測試與 runtime **import 同一個**（⛔ 不是複製一份）`,
    };
  const src = readFileSync(abs, "utf8");
  const re = new RegExp(`^export\\s+(?:async\\s+)?(?:function|const)\\s+${audit.symbol}\\b`, "m");
  return re.test(src)
    ? { callable: true, why: `${audit.module} 匯出 ${audit.symbol}()` }
    : { callable: false, why: `${audit.module} 沒有匯出 ${audit.symbol}（表過期了）` };
}

/** id → 它住哪一個集合（⭐ 從出貨檔案推導，⛔ 不靠命名慣例猜）。 */
export function collectionOf(repoRoot, id) {
  for (const c of ["abilities", "items", "augments", "champions"])
    if (existsSync(join(repoRoot, `content/${c}/${id}.json`))) return c;
  return null;
}

/**
 * ⭐ 啟用當下要跑什麼、跑不跑得了、跑出什麼 —— 一張可勾選的待修表的**資料**。
 * ⛔ 只對傳進來的 id 跑（#473 的成本斷言：不啟用不花錢）。
 */
export function auditPlan(repoRoot, ids) {
  const rows = [];
  for (const id of ids) {
    const collection = collectionOf(repoRoot, id);
    if (collection === null) {
      rows.push({ id, collection: null, audit: null, status: "unknown-id", detail: `content/ 底下找不到 ${id}.json` });
      continue;
    }
    for (const audit of AUDITS) {
      if (!audit.collections.includes(collection)) {
        rows.push({ id, collection, audit: audit.id, status: "n/a", detail: `這條稽核不管 ${collection}` });
        continue;
      }
      const probe = probeCallable(repoRoot, audit);
      rows.push({
        id,
        collection,
        audit: audit.id,
        zh: audit.zh,
        status: probe.callable ? "callable" : "not-callable",
        detail: probe.why,
        module: audit.module,
        symbol: audit.symbol,
      });
    }
  }
  const counts = rows.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
  return { schema: "enable-audit-plan@1", ids, counts, rows, wiring: WIRING };
}

// ─────────────────────────────── CLI ───────────────────────────────
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const idsArg = argv[argv.indexOf("--ids") + 1];
  if (argv.includes("--help") || !argv.includes("--ids") || idsArg === undefined) {
    console.log(
      "enable-audit —— 啟用上架的當下跑三支稽核（GH#473）\n\n" +
        "  node tools/review/enable-audit.mjs --ids <id1,id2,…> [--json]\n\n" +
        `  接線點（⚠️ 柵欄外）：${WIRING.savePoint}\n  表的形狀：${WIRING.tableShape}`,
    );
    process.exit(0);
  }
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const plan = auditPlan(repoRoot, idsArg.split(",").map((s) => s.trim()).filter((s) => s !== ""));
  if (argv.includes("--json")) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    console.log(`[enable-audit] ${plan.ids.length} 個新啟用的 id × ${AUDITS.length} 條稽核`);
    for (const r of plan.rows) console.log(`  ${r.status.padEnd(13)} ${r.id} · ${r.audit ?? "-"} —— ${r.detail}`);
    const stuck = plan.counts["not-callable"] ?? 0;
    if (stuck > 0)
      console.log(
        `\n  ⚠️ ${stuck} 格**叫不到** —— ⛔ 那不等於「沒問題」，等於這一條今天量不到。\n` +
          "     ⭐ 修法是把判準抽出 .test.ts，讓測試與 runtime import 同一個（⛔ 不是複製一份）。",
      );
  }
}
