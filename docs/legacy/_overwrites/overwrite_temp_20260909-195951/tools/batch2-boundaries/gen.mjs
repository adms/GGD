#!/usr/bin/env node
/**
 * ⭐⭐ **第二批 37 名的「五道界線」矩陣** —— GH#1150 的第一條 AC。
 *
 * owner 2026-09-08 逐字（⭐ 五件事分別確認）：
 *
 * > 「檔案存在 · GLB 轉換成功 · 已標準化入庫 · 遊戲畫面驗收 · 正式發布 —— 五件事分別確認。
 * >   ⛔ 一件成立**不蘊含**下一件」
 *
 * 而 #1150 的 AC 逐字要求這張表「⭐ 由 A／B／C 的**收據推導**，⛔ 不手填」。
 *
 * ⚠️ ⭐ 為什麼它必須是產生器：一張手填的 37×5 表，**每一格都是一句散文** ——
 *   而這份 repo 記錄過五次「一句活過保存期限的散文，⛔ 而沒有東西變紅」。
 *
 * ⛔ 每一格只填**量得到**的那一道；量不到就寫 `?`（⭐ 一個誠實的答案，
 *   ⛔ 不是猜一個，也⛔ 不是留白 —— 留白讀起來像「不適用」）。
 *
 *   node tools/batch2-boundaries/gen.mjs --receipts <dir> [--check]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = join(REPO, "docs/_reports/batch2-37-boundaries.md");

const args = process.argv.slice(2);
const check = args.includes("--check");
const rd = args[args.indexOf("--receipts") + 1];
if (!rd || !existsSync(rd)) {
  console.error("⛔ 用法：--receipts <收據目錄>（要有 package-report.json 等）");
  process.exit(2);
}
const read = (n) => {
  const p = join(rd, `${n}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
};

// ⭐ compiled 目錄（可選）—— 有它才答得出 ⓪；沒有就誠實回 `?`。
const cdIdx = args.indexOf("--compiled");
const compiledDir = cdIdx >= 0 ? args[cdIdx + 1] : "";
/** ⭐ 用**出貨的**驗證器，⛔ 不是自己再寫一份規則（那會是第二個住處）。 */
let validate = null;   // ⭐ `null` ＝ **載不到驗證器** ⇒ ⓪ 一律 `?`，⛔ 不是 ⛔（那會是誣告）
try {
  const m = await import("../../packages/shared/src/content/loader.ts");
  validate = (c, d) => m.validateDoc(c, d).ok === true;
} catch (e) {
  // ⚠️ ⭐ fail-loud：⛔ 靜默地把 37 隻都判成「schema 不過」比沒有這一欄更糟。
  console.error(`⚠️ 載不到出貨驗證器 ⇒ ⓪ 一律 \`?\`（⛔ 不是 ⛔）：${String(e).slice(0, 160)}`);
}

const pkg = read("package-report");
const pipe = read("pipeline-report");
const review = read("author-review");
if (!pkg) {
  console.error("⛔ 缺 package-report.json —— ⭐ 沒有收據就沒有矩陣（⛔ 不猜）");
  process.exit(2);
}

/** ⭐ `?` ＝ 這一道**沒有收據回答得了**，⛔ 不是「不適用」也⛔ 不是「失敗」。 */
const UNKNOWN = "?";
const YES = "✅";
const NO = "⛔";

const byId = new Map((review?.heroes ?? []).map((h) => [h.id ?? h.heroId, h]));

const rows = (pkg.heroes ?? []).map((h) => {
  const assets = Array.isArray(h.assets) ? h.assets.length : 0;
  // ⭐ 收據**自己**回答得了這一道：`model.kind`。
  //   ⚠️ `explicit-proxy` ＝ 這隻用的是**核准過的代理本體**，⛔ 不是它本尊的 GLB
  //   ⇒ 「GLB 轉換成功」對它是 ⛔（⭐ 而那不是缺陷，是**這一道還沒走到**）。
  const kind = h.model?.kind ?? "";
  const glb = kind === "native" || kind === "own" ? YES : kind ? NO : UNKNOWN;
  // ⭐ 「已標準化入庫」＝ 這一包被打包器判 passed **且**有 zip 的 sha
  const intake = h.status === "passed" && typeof h.zipSha256 === "string" ? YES : NO;
  // ⭐ 「遊戲畫面驗收」—— 收據有一格 `liveGameVerified`（⚠️ ⭐ 而它今天全是 false）
  //   ⛔ 沒有那一格才回 `?`；有而是 false ⇒ ⛔ 就是 ⛔，⛔ 不要柔化成「未知」。
  const screen = typeof h.model?.liveGameVerified === "boolean"
    ? (h.model.liveGameVerified ? YES : NO)
    : UNKNOWN;
  // ⭐ 「正式發布」＝ 這隻在**出貨的** content/champions/ 裡嗎（⛔ 不是「打包過」）
  const shipped = existsSync(join(REPO, "content/champions", `${h.id}.json`)) ? YES : NO;
  const r = byId.get(h.id);
  // ⭐⭐ ⓪ **schema 驗得過嗎** —— ⛔ 這一道在 owner 的五道**之前**，
  //   而在此之前沒有人量過它。⇒ 2026-09-09 實跑出貨的 `validateDoc("champions", …)`：
  //   **37/37 通過**。⭐ 它把「卡在哪」講得更死：⛔ 不是內容壞掉，是②④還沒走到。
  const compiled = compiledDir ? join(compiledDir, `${h.id}.json`) : "";
  let schema = UNKNOWN;
  if (compiled && existsSync(compiled)) {
    const d = JSON.parse(readFileSync(compiled, "utf8"));
    schema = !validate ? UNKNOWN : d?.champion ? (validate("champions", d.champion) ? YES : NO) : NO;
  }
  return {
    id: h.id,
    schema,
    files: assets > 0 ? YES : NO,
    assets,
    glb,
    intake,
    screen,
    shipped,
    slots: r?.slots?.length ?? r?.reviewedSlots ?? UNKNOWN,
  };
});

const tally = (k, v) => rows.filter((r) => r[k] === v).length;
const md = [
  "<!-- ⛔ 產物 —— 改 `tools/batch2-boundaries/gen.mjs`，⛔ 不要手改。 -->",
  "# 第二批 37 名 —— 五道界線矩陣（GH#1150 AC①）",
  "",
  "> owner 2026-09-08：「檔案存在 · GLB 轉換成功 · 已標準化入庫 · 遊戲畫面驗收 · 正式發布",
  "> —— 五件事分別確認。⛔ 一件成立**不蘊含**下一件」",
  "",
  `⭐ **由收據推導**，⛔ 不手填。收據 buildHash \`${pkg.buildHash ?? "?"}\`` +
    `・pipeline \`${pipe?.status ?? "?"}\`・target \`${pkg.target?.migrationFingerprint ?? "?"}\``,
  "",
  "⚠️ `?` ＝ **沒有收據回答得了這一道**（⛔ 不是「不適用」，也⛔ 不是「失敗」）。",
  "",
  "| # | 英雄 | ⓪schema 驗得過 | ①檔案存在 | ②GLB 轉換 | ③標準化入庫 | ④畫面驗收 | ⑤正式發布 |",
  "|---:|---|:---:|:---:|:---:|:---:|:---:|:---:|",
  ...rows.map((r, i) =>
    `| ${i + 1} | \`${r.id}\` | ${r.schema} | ${r.files}（${r.assets}） | ${r.glb} | ${r.intake} | ${r.screen} | ${r.shipped} |`),
  "",
  "## 逐道合計",
  "",
  "| 界線 | ✅ | ⛔ | ? |",
  "|---|---:|---:|---:|",
  ...[["⓪schema 驗得過", "schema"], ["①檔案存在", "files"], ["②GLB 轉換", "glb"], ["③標準化入庫", "intake"],
      ["④畫面驗收", "screen"], ["⑤正式發布", "shipped"]].map(([label, k]) =>
    `| ${label} | ${tally(k, YES)} | ${tally(k, NO)} | ${tally(k, UNKNOWN)} |`),
  "",
  `⇒ ⭐ **正式發布 ${tally("shipped", YES)}／${rows.length}** —— ⛔ 這一格由 \`content/champions/\` 決定，`,
  "⛔ 不是由「打包過」決定（⭐ 一件成立不蘊含下一件）。",
  "",
].join("\n") + "\n";

if (check) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (cur !== md) {
    console.error("⛔ batch2-37-boundaries.md 過期 ⇒ 重生成：node tools/batch2-boundaries/gen.mjs --receipts <dir>");
    process.exit(1);
  }
  console.log(`batch2:boundaries:check OK（${rows.length} 列）`);
} else {
  writeFileSync(OUT, md);
  console.log(`✅ 寫出 ${OUT}（${rows.length} 列；正式發布 ${tally("shipped", YES)}/${rows.length}）`);
}
