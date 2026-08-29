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
  · 審查頁：pnpm dev 起 client 後 http://localhost:5173/__review/
    （queue API：GET /__review/queue · 裁決：POST /__review/verdict）`);
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
console.log("  審查頁：http://localhost:5173/__review/（pnpm dev 起 client 後）");

const max = process.env.GGD_REVIEW_PENDING_MAX;
if (max !== undefined && max !== "" && pending > Number(max)) {
  console.error(`[review:check] pending ${pending} > GGD_REVIEW_PENDING_MAX=${max} ⇒ exit 1`);
  process.exit(1);
}
