#!/usr/bin/env node
/**
 * `pnpm review:check` —— HITL 驗收佇列的閘（GH#664）。唯讀。
 *
 * 三件事，兩種嚴格度：
 *   ① queue.json 新鮮度 —— 逐位元組比對，過期 ⇒ exit 1（機器修得好：pnpm review:build）。
 *   ② pending 數 —— **預設不擋**：⛔ 部署不可以被「人不在」卡死。
 *      要擋就設 GGD_REVIEW_PENDING_MAX=<n>，pending 超過才 exit 1。
 *   ③ GH#669 功能級帳本 —— ⭐ **登記閘**：帳本裡任何一批的 rollback 開關解析不到
 *      ⇒ exit 1。⚠️ 這一條硬擋是刻意的，而且它與②不衝突：②擋的是「人還沒看」
 *      （不該擋部署），③擋的是「這一批沒有回頭的路」（那是結構錯，跟①同一類）。
 *      功能級的 pending／未登記數只進**警示行**，⛔ 不擋。
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { queueText, QUEUE_REL } from "./triage.mjs";
import { buildFeatureQueue, FEATURE_LEDGER_REL } from "./features.mjs";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`review:check —— HITL 驗收佇列的閘（唯讀）

  · docs/_review/queue.json 過期（與現算不逐位元組相等）⇒ exit 1；修法：pnpm review:build
  · pending 數**預設不擋**（exit 0）—— 部署不可以被「人不在」卡死。
    要擋：GGD_REVIEW_PENDING_MAX=<n> pnpm review:check ⇒ pending > n 才 exit 1
  · GH#669 功能級帳本 docs/_review/feature-verdicts.json：**登記閘**——
    任何一批的 rollback 開關解析不到 ⇒ exit 1（修法：pnpm review:register 重登記）。
    功能級 pending／未登記數只進警示行，⛔ 不擋部署。
  · 審查頁：pnpm dev 起 client 後
      資產（#664）  http://localhost:39527/asset-review.html
      功能（#669）  http://localhost:39527/feature-review.html`);
  process.exit(0);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const fresh = queueText(repoRoot);
const queuePath = join(repoRoot, QUEUE_REL);
const committed = existsSync(queuePath) ? readFileSync(queuePath, "utf8") : "";
if (committed !== fresh) {
  console.error(`[review:check] ${QUEUE_REL} 過期（與現算不一致）→ 跑 pnpm review:build 然後 git add`);
  process.exit(1);
}

const q = JSON.parse(fresh);
const { pending, tier0, reviewed, assets } = q.counts;
console.log(`[review:check] pending ${pending} / 資產 ${assets}（Tier0 ${tier0} · 已審 ${reviewed}）`);
for (const it of q.items.slice(0, 5)) {
  console.log(`  · [risk ${it.risk}] ${it.kind}:${it.id} —— ${it.reasons.join("；")}`);
}
console.log("  審查頁：http://localhost:39527/asset-review.html（pnpm dev 起 client 後）");

// ── ③ GH#669 功能級：連續圖片批核的帳本 ────────────────────────────────
const fq = buildFeatureQueue(repoRoot);
const fc = fq.counts;
console.log(
  `[review:check] 功能批 ${fc.total}（待批核 ${fc.pending} · 已確認 ${fc.confirmed} · ` +
    `已否決 ${fc.vetoed} · 未登記 ${fc.unregistered}）—— ⛔ 預設不擋部署`,
);
for (const b of fq.batches) {
  if (b.blockers.length === 0) continue;
  console.log(`  · ${b.status} ${b.id} —— ${b.blockers.join("；")}`);
}
// ⭐ GH#795 Scope④ —— 「判不了」要是一個**看得見的數字**，⛔ 不是沉默。
if (fq.counts.evidenceUndeterminable > 0 || fq.counts.evidenceStale > 0) {
  console.log(
    `  📅 證據時間身分：⚠️ 比修復早 ${fq.counts.evidenceStale} 批 · ` +
      `ℹ️ 判不了 ${fq.counts.evidenceUndeterminable} 批（報告沒寫拍於哪個 HEAD）\n` +
      "     ⛔ 判不了的那些**補不回來** —— 捕捉發生在工作樹上，git 只給得出上界。\n" +
      "     ⭐ 往後的報告會自動蓋 HEAD（`bash scripts/visual-proof.sh --new`）。",
  );
}
console.log("  功能審查頁：http://localhost:39527/feature-review.html");

// ── 🔐 分署閘（GH#794，硬擋）────────────────────────────────────────────
// owner 2026-08-27：「批核材料跟批核結果**分署不同資料夾**」。
// ⭐ 這裡驗的是**分署有沒有落地**（材料檔在不在、兩個結果來源檔在不在），
//   ⛔ 欄位不相交那一條歸 vitest（`reviewSplitHomes.test.ts`），權限那一條歸
//   `bash scripts/review-access.sh guard` —— 三層各管一段，⛔ 不互相假設。
{
  const { existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { MATERIAL_REL, VERDICT_SOURCES, verdictRel } = await import("./stores.mjs");
  const missing = [MATERIAL_REL, ...VERDICT_SOURCES.map(verdictRel)].filter(
    (rel) => !existsSync(join(repoRoot, rel)),
  );
  if (missing.length > 0) {
    console.error(
      `[review:check] 批核分署還沒落地 —— 少了：\n${missing.map((m) => `  · ${m}`).join("\n")}\n` +
        "  修法：node tools/review/split-stores.mjs",
    );
    process.exit(1);
  }
  console.log("[review:check] 🔐 分署 OK：材料 docs/_review/material/ · 結果 docs/_review/verdicts/{local,live}.json");
}

// ⭐ 登記閘（硬擋）：登記進帳本卻寫不出可用的 rollback 開關 ⇒ 那一批沒有回頭的路。
const invalid = fq.batches.filter((b) => b.registered && b.rollbackOk !== true);
if (invalid.length > 0) {
  console.error(
    `[review:check] ${FEATURE_LEDGER_REL} 有 ${invalid.length} 批的 rollback 開關解析不到 ⇒ exit 1\n` +
      invalid.map((b) => `  · ${b.id}：${b.blockers.join("；")}`).join("\n") +
      `\n  修法：pnpm review:register --id <批次> --rollback-config <config id> --rollback-field <欄位> --rollback-to <還原值>`,
  );
  process.exit(1);
}

const max = process.env.GGD_REVIEW_PENDING_MAX;
if (max !== undefined && max !== "" && pending > Number(max)) {
  console.error(`[review:check] pending ${pending} > GGD_REVIEW_PENDING_MAX=${max} ⇒ exit 1`);
  process.exit(1);
}
