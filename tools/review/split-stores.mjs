#!/usr/bin/env node
/**
 * `node tools/review/split-stores.mjs [--check]` —— 把**分署之前**的混合帳本
 * `docs/_review/feature-verdicts.json` 拆成 owner 要的兩個資料夾（GH#794）。
 *
 * owner 2026-08-27：「為避免**讀寫混淆**，請將批核材料跟批核結果**分署不同資料夾**」
 *
 *   docs/_review/feature-verdicts.json   （舊：材料 ＋ 結果混在一起）
 *     ├─→ docs/_review/material/batches.json      📦 我寫的登記（444）
 *     └─→ docs/_review/verdicts/local.json        🧑‍⚖️ owner 按的裁決（644）
 *
 * ⭐ 這支是**冪等**的：拆過之後再跑一次，兩邊的內容不變（`--check` 就是靠這個）。
 * ⚠️ 舊檔**不刪**（第零守則：覆蓋／刪除前先留一份）—— 它變成一份唯讀的歷史，
 *    而 `stores.mjs` 只在新檔還不存在時才回頭讀它。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LEGACY_LEDGER_REL, MATERIAL_FIELDS, MATERIAL_REL, VERDICT_DIR_REL, VERDICT_SOURCES,
  loadMaterial, loadVerdicts, saveMaterial, saveVerdictEntry, verdictRel,
} from "./stores.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const check = process.argv.includes("--check");

const legacyPath = join(repoRoot, LEGACY_LEDGER_REL);
const legacy = existsSync(legacyPath) ? JSON.parse(readFileSync(legacyPath, "utf8")).batches ?? {} : {};
mkdirSync(join(repoRoot, VERDICT_DIR_REL), { recursive: true });

const material = {};
const verdicts = [];
for (const [id, reg] of Object.entries(legacy)) {
  material[id] = Object.fromEntries(Object.entries(reg).filter(([k]) => MATERIAL_FIELDS.has(k)));
  if (reg.verdict !== undefined && reg.verdict !== null) {
    verdicts.push([id, {
      verdict: reg.verdict,
      verdictHash: reg.verdictHash ?? null,
      reason: reg.reason ?? "",
      verdictAt: reg.verdictAt ?? null,
    }]);
  }
}

if (check) {
  const haveMat = existsSync(join(repoRoot, MATERIAL_REL));
  const nMat = Object.keys(loadMaterial(repoRoot).batches).length;
  const nVer = Object.keys(loadVerdicts(repoRoot)).length;
  const missing = Object.keys(material).filter((id) => !(id in loadMaterial(repoRoot).batches));
  const noVerdictFile = VERDICT_SOURCES.filter((sc) => !existsSync(join(repoRoot, verdictRel(sc))));
  if (!haveMat || missing.length > 0 || noVerdictFile.length > 0) {
    console.error(
      `⛔ 分署還沒落地：${!haveMat ? `${MATERIAL_REL} 不存在` : missing.length > 0 ? `材料檔少了 ${missing.length} 批（${missing.slice(0, 5).join(", ")}…）` : `結果檔缺 ${noVerdictFile.join(" / ")}`}\n` +
        "   修法：node tools/review/split-stores.mjs",
    );
    process.exit(1);
  }
  console.log(`✓ 批核材料/結果已分署：材料 ${nMat} 批 · 結果 ${nVer} 筆（${MATERIAL_REL} / ${verdictRel("local")}）`);
  process.exit(0);
}

// ⭐ 合併既有的材料檔（如果已經拆過，這一步讓它冪等）。
const existing = loadMaterial(repoRoot).batches;
saveMaterial(repoRoot, { ...material, ...existing });
for (const [id, v] of verdicts) saveVerdictEntry(repoRoot, "local", id, v);
// ⚠️ **零筆裁決也要把兩個結果檔生出來**：一個不存在的目錄與一個空的目錄，
//    對同步腳本與批核頁長得一模一樣，而前者會讓 rsync 靜默地什麼都不做
//    （fail-open 沒錯，**靜默**才是缺陷）。
for (const source of VERDICT_SOURCES) {
  if (!existsSync(join(repoRoot, verdictRel(source)))) writeFileSync(
    join(repoRoot, verdictRel(source)),
    `${JSON.stringify({ schema: "review-verdicts@1", source, note: `🧑‍⚖️ 批核結果（來源：${source}）—— 還沒有人按過。`, verdicts: {} }, null, 2)}\n`,
  );
}

console.log(
  `✓ 拆好了：材料 ${Object.keys({ ...material, ...existing }).length} 批 → ${MATERIAL_REL}（444）\n` +
    `           結果 ${verdicts.length} 筆 → ${verdictRel("local")}（644）\n` +
    `⚠️ 舊的混合檔 ${LEGACY_LEDGER_REL} **保留不刪** —— 它現在是歷史，⛔ 不再是真相。`,
);
