/**
 * ⭐【出貨內容的單一入口】—— GH#323 的模板。
 *
 * 2026-08-13 有 41 位英雄（235 支技能）從 `content/` 搬進 `content/_legacy/`。
 * 那之後 36 條斷言同時紅，而它們紅的訊息**跟自己在守的東西完全無關**：
 *
 * | 症狀 | 測試以為它在說 | 真相 |
 * |---|---|---|
 * | `ENOENT: content/abilities/godie-h001.w.json` | 「這支技能壞了」 | 它退場了，測試在讀一個不存在的路徑 |
 * | `expected 19 to be greater than or equal to 40` | 「覆蓋率掉了」 | 名單從 119 縮到 78，門檻是搬家前抄的 |
 * | `74 bound ability doc(s) do not exist` | 「綁定表壞了」 | 綁定表裡有 74 筆指向已退場的技能 |
 *
 * ⛔ 修法**不是**把 40 改成 19、把 id 換一個還活著的 —— 那是第四次抄同一個
 *    會過期的東西。⭐ 這個檔提供兩件事，讓每一條斷言可以**推導**而不是抄：
 *
 *   ① `readContentJson()` —— 先找 `content/`，再找 `content/_legacy/`。
 *      給**驗引擎**的測試用：那些測試只是需要一份真的 doc 當夾具，
 *      它是不是還在名單上根本不影響它們在守的機制。
 *   ② `shippedAbilityIds()` / `shippedChampionIds()` —— 只有**出貨**的那些。
 *      給**驗覆蓋率／名單**的測試用：門檻與清單一律從這裡長出來。
 *
 * ⚠️ 判準（挑①還是②）：**這條測試如果名單再縮一次，應該紅嗎？**
 *    · 不應該（它在驗引擎行為）→ ①
 *    · 應該（它在驗「每一位出貨英雄都…」）→ ②，而且門檻要用 ② 算，⛔ 不是寫死
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
export const CONTENT = join(REPO, "content");
export const LEGACY = join(CONTENT, "_legacy");

/** repo 根目錄下的絕對路徑。 */
export function repoPath(rel: string): string {
  return join(REPO, rel);
}

/**
 * 讀一份內容文件，`content/` 找不到就找 `content/_legacy/`。
 *
 * ⚠️ 只給「拿真 doc 當夾具驗引擎」的測試用。⛔ 不要拿它來數數量或算覆蓋率 ——
 *    那會把已退場的內容算進出貨的帳裡。
 */
export function readContentJson<T>(relFromContent: string): T {
  for (const base of [CONTENT, LEGACY]) {
    const p = join(base, relFromContent);
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")) as T;
  }
  throw new Error(
    `${relFromContent} 在 content/ 與 content/_legacy/ 都找不到 —— ` +
      `它可能真的被刪了（不是退場）。請確認這份夾具還存在，⛔ 不要改成別的 id 就算了。`,
  );
}

/** 這份文件現在還出貨嗎？（`_legacy/` 裡的算「退場」，回 false） */
export function isShipped(collection: string, id: string): boolean {
  return existsSync(join(CONTENT, collection, `${id}.json`));
}

function idsIn(collection: string): readonly string[] {
  const dir = join(CONTENT, collection);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => f.slice(0, -5))
    .sort();
}

/** 出貨的英雄 id（⛔ 不含 `_legacy/`）。 */
export function shippedChampionIds(): readonly string[] {
  return idsIn("champions");
}

/** 出貨的技能 id（⛔ 不含 `_legacy/`）。 */
export function shippedAbilityIds(): readonly string[] {
  return idsIn("abilities");
}

/** 出貨的英雄文件，逐份 parse 過。 */
export function shippedChampionDocs<T = Record<string, unknown>>(): readonly T[] {
  return shippedChampionIds().map(
    (id) => JSON.parse(readFileSync(join(CONTENT, "champions", `${id}.json`), "utf8")) as T,
  );
}

/** 出貨的技能文件，逐份 parse 過。 */
export function shippedAbilityDocs<T = Record<string, unknown>>(): readonly T[] {
  return shippedAbilityIds().map(
    (id) => JSON.parse(readFileSync(join(CONTENT, "abilities", `${id}.json`), "utf8")) as T,
  );
}

/**
 * 把一張「id → 什麼」的對照表縮到**還出貨的**那些。
 *
 * ⭐ 這是 74 筆 `bound ability doc(s) do not exist` 的解 —— 綁定表本身沒有錯，
 *    它記錄的是「這支技能該用哪個原作特效」，退場的那些留著不礙事（將來復活就用得上）。
 *    錯的是**斷言的範圍**：它該問「還出貨的每一筆都指得到嗎」，
 *    ⛔ 不是「表上每一筆都指得到嗎」。
 */
export function shippedOnly<T>(
  table: Readonly<Record<string, T>>,
  collection = "abilities",
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, v] of Object.entries(table)) if (isShipped(collection, id)) out[id] = v;
  return out;
}
