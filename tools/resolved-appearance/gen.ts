/**
 * ⭐⭐ `ggd-resolved-appearance.json` —— **外觀的唯一解析入口，匯出給編輯器**（GH#934）。
 *
 * owner 逐字：「main 遊戲主程式 是**做出積木供使用**的角色」。
 *
 * ⛔⛔ 動手前量到一件票文沒寫的事：`resolvedAppearance.ts`
 * **已經完整存在**（每一個欄位都有，含 `isStandIn` 與 resolver fingerprint），
 * ⭐ 而它有 **零個 production 消費端** —— 失敗形態⑧。
 * ⇒ ⭐ 缺的不是 resolver，是**有人真的去呼叫它，而且把結果交出去**。
 *
 * ⭐ 這一支就是那個呼叫者：它掃出貨的 champion × model，逐位呼叫**同一支**
 * `resolveAppearance()`，把結果寫成一份 versioned 契約。
 * ⇒ ⭐ 票文的 Objective 逐字：「匯出 versioned `resolved-appearance@1`」。
 *
 * ⭐⭐ **`isStandIn` 為什麼是必要欄位**（票文逐字，⛔ 不是額外資訊）：
 * 2026-09-02 量到 **4 位**英雄站在共用替身網格上。
 * ⚠️ 一位英雄站在共用替身上時，畫面**看起來是正常的** —— ⛔ 它只是**別人**。
 * ⇒ ⭐ 一個沉默的 resolver 會讓外部編輯器忠實預覽出一個**錯的角色**，
 * 而且它不會知道自己錯了。
 *
 * 用法：`npx tsx tools/resolved-appearance/gen.ts [--check]`
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveAppearance,
  appearanceResolverFingerprint,
  RESOLVED_APPEARANCE_SCHEMA,
  type AppearanceChampion,
  type AppearanceModel,
} from "../../packages/shared/src/content/import/resolvedAppearance";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "docs/editor-contract/ggd-resolved-appearance.json");

function loadDir(dir: string): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  const base = join(ROOT, "content", dir);
  if (!existsSync(base)) return out;
  for (const f of readdirSync(base)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const d = JSON.parse(readFileSync(join(base, f), "utf8")) as Record<string, unknown>;
    if (typeof d["id"] === "string") out.set(d["id"], d);
  }
  return out;
}

function build(): string {
  const champions = loadDir("champions");
  const models = loadDir("models");

  const rows: unknown[] = [];
  const failures: unknown[] = [];
  let standIns = 0;

  for (const id of [...champions.keys()].sort()) {
    const champ = champions.get(id) as unknown as AppearanceChampion;
    const key = (champ as { modelKey?: unknown }).modelKey;
    const model =
      typeof key === "string" ? (models.get(key) as unknown as AppearanceModel | undefined) : undefined;
    // ⭐ **同一支** resolver —— ⛔ 這裡一行外觀邏輯都不重寫（票文：遊戲與 Editor 必須呼叫同一支）。
    const r = resolveAppearance(id, champ, model);
    if (r.ok) {
      if (r.appearance.isStandIn) standIns += 1;
      rows.push({ championId: id, ...r.appearance });
    } else {
      failures.push({ championId: id, ...r.failure });
    }
  }

  const body = {
    schema: RESOLVED_APPEARANCE_SCHEMA,
    note:
      "⛔ **產物** —— 改 `tools/resolved-appearance/gen.ts`，⛔ 不要手改。" +
      "⭐ 每一列都是**出貨那支** `resolveAppearance()` 算出來的（⛔ 這裡零行外觀邏輯）。" +
      "⚠️ ⭐ `isStandIn: true` 代表那位英雄站在**共用替身**網格上 —— " +
      "畫面看起來是正常的，⛔ 它只是**別人**。外部編輯器要據此警告，⛔ 不要忠實預覽一個錯的角色。",
    resolverFingerprint: appearanceResolverFingerprint(),
    totals: { champions: rows.length, standIns, failures: failures.length },
    appearances: rows,
    failures,
  };
  return `${JSON.stringify(body, null, 2)}\n`;
}

const text = build();
if (process.argv.includes("--check")) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (cur !== text) {
    console.error("⛔ ggd-resolved-appearance.json 過期 —— 跑 `pnpm appearance:build`");
    process.exit(1);
  }
  console.log("✓ ggd-resolved-appearance.json 是最新的");
} else {
  writeFileSync(OUT, text);
  const t = (JSON.parse(text) as { totals: Record<string, number> }).totals;
  console.log(`✓ 寫入 ${OUT}`);
  console.log(`  ⭐ ${t.champions} 位解析成功 · 替身 ${t.standIns} · 失敗 ${t.failures}`);
}
