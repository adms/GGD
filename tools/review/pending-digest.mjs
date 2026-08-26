#!/usr/bin/env node
/**
 * 📣 **把待裁決的批次推到 owner 已經在看的地方**（GH#785）。
 *
 * owner 2026-08-27：「**你還是沒告訴我去後台哪裡審查**」，而在那之前更早的病是：
 * `classic_dragonslave_visual-proof_20260825` 這一批的**標題自己就寫著「⚠️ 0 亮像素」**，
 * 帳本誠實記著，⛔ 但要 owner 自己開 dev server 才看得到 —— 他從來沒開過。
 * 隔天他在遊戲裡發現龍破斬沒特效（#779）。
 *
 * ⭐ **警報沒有到達的警報 ＝ 沒有警報**（fail-open 靜默的第 N 個變形）。
 * ⇒ 這支把「待裁決 ＋ 帶紅旗」產出成一段 markdown，給兩個 owner 真的會讀的地方用：
 *   · **release note**（`scripts/release.sh` / note 草稿）
 *   · **戰情表**（`scripts/board-roll.sh` —— 他本機的 GGD戰情版.md）
 *
 * ⛔ 它**不是**第二份資料：一切從 `docs/_review/feature-verdicts.json` 推導
 * （與後台批核頁、13 頁的 ReviewStrip 同一份帳本，第〇·四守則）。
 *
 * 用法：
 *   node tools/review/pending-digest.mjs            # 印出 markdown 段落
 *   node tools/review/pending-digest.mjs --limit 8  # 只列前 N 批（其餘計數）
 */
import { buildFeatureQueue } from "./features.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** 標題帶這些字＝這一批自己承認有問題 ⇒ ⭐ 置頂標紅。 */
const RED_FLAG = /⚠️|未驗收|0 亮像素|沒過|失敗|仍然/;

export function pendingDigest(repoRoot = REPO, limit = 10) {
  const q = buildFeatureQueue(repoRoot);
  const batches = q.batches ?? [];
  const pending = batches.filter((b) => (b.status ?? (b.verdict ? "done" : "pending")) === "pending");
  const flagged = pending.filter((b) => RED_FLAG.test(b.title ?? ""));
  const plain = pending.filter((b) => !RED_FLAG.test(b.title ?? ""));
  const unreg = batches.filter((b) => b.status === "unregistered");

  if (pending.length === 0 && unreg.length === 0) {
    return "## 🧑‍⚖️ 一頁批次後台驗收\n\n⭐ 沒有待裁決的批次 —— 全部已確認或已否決。\n";
  }

  const rows = [...flagged, ...plain].slice(0, limit).map((b) => {
    const flag = RED_FLAG.test(b.title ?? "") ? "⚠️ " : "";
    const issues = (b.issues ?? []).map((n) => `#${n}`).join(" ");
    const frames = (b.frames ?? []).length;
    const rb = b.rollback?.configId
      ? `\`${b.rollback.configId}\` › \`${b.rollback.field}\``
      : "⚠️ **沒有登記開關**";
    return `| ${flag}${(b.title ?? b.id).slice(0, 46)} | ${issues || "—"} | ${frames} | ${rb} |`;
  });

  const more = pending.length - Math.min(pending.length, limit);
  return [
    "## 🧑‍⚖️ 一頁批次後台驗收 —— ⭐ 等你裁決",
    "",
    `**待裁決 ${pending.length} 批**` +
      (flagged.length > 0 ? ` · ⚠️ **其中 ${flagged.length} 批自己承認有問題（已置頂）**` : "") +
      (unreg.length > 0 ? ` · ⛔ 未登記 ${unreg.length} 批（沒有 rollback 開關）` : ""),
    "",
    "> owner 的定義（2026-08-24 逐字）：「**先上線成果**，但是在後台可以**一鍵否決還原**，" +
      "**追加原因的 HITL**，但**預設是直接上線**」。",
    "> ⇒ 這是**事後否決權**，⛔ 不是上線前審批門。否決＝翻下表那一格開關，⛔ 不是 revert commit。",
    "",
    "| 批次 | 票 | 連續圖片 | 一鍵還原 |",
    "|---|---|---:|---|",
    ...rows,
    ...(more > 0 ? [`| …另外 ${more} 批 | | | |`] : []),
    "",
    "📍 **在後台哪裡看**：左欄 **營運 › 🧑‍⚖️ 批次驗收（連續圖片）**" +
      "（每一個對照/設定頁的頂端也各有一條與它相關的批核區）。",
    "",
  ].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf("--limit");
  process.stdout.write(pendingDigest(REPO, i >= 0 ? Number(process.argv[i + 1]) : 10));
}
