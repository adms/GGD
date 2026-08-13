/**
 * ⭐【出貨內容的單一入口】—— GH#323，與 `apps/client/src/testkit/contentFixtures.ts` 同一份契約。
 *
 * 2026-08-13 有 41 位英雄（235 支技能）從 `content/` 搬進 `content/_legacy/`。
 * 判準只有一句：**「這條測試如果名單再縮一次，應該紅嗎？」**
 *
 *   · 不該紅（它在驗引擎／協定，doc 只是夾具）→ `readContentJson()`，走 `_legacy/` 後備
 *   · 該紅（它在驗「每一位出貨英雄都…」）→ `isShipped()`，門檻從出貨內容長出來
 *
 * ⛔ 兩種都不是「把 90 改成 78」。那是把同一個會過期的東西再抄一次。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
export const CONTENT = join(REPO, "content");
const LEGACY = join(CONTENT, "_legacy");

/** 讀一份內容文件，`content/` 找不到就找 `content/_legacy/`。⛔ 不要拿來數數量。 */
export function readContentJson<T>(relFromContent: string): T {
  for (const base of [CONTENT, LEGACY]) {
    const p = join(base, relFromContent);
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")) as T;
  }
  throw new Error(
    `${relFromContent} 在 content/ 與 content/_legacy/ 都找不到 —— 它可能真的被刪了（不是退場）。`,
  );
}

/** 這份文件現在還出貨嗎？（`_legacy/` 裡的算「退場」） */
export function isShipped(collection: string, id: string): boolean {
  return existsSync(join(CONTENT, collection, `${id}.json`));
}

/** 出貨的英雄 id（⛔ 不含 `_legacy/`）。 */
export function shippedChampionIds(): readonly string[] {
  const dir = join(CONTENT, "champions");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => f.slice(0, -5))
    .sort();
}
