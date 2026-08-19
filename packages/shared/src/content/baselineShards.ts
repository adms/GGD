/**
 * 兩條棘輪基準線的**分片**讀寫 —— 一個英雄一個檔（GH#467 ③）。
 *
 * ⛔ 這支模組**不做任何內容決定**：分片是**搬家**，不是改行為。
 * 讀回來的鍵集合與分片前的單檔陣列**逐筆相同**，兩條守衛的判斷一個字都沒變。
 *
 * ── 為什麼要切開 ─────────────────────────────────────────────────────────────
 * `descriptionClaims.baseline`（163 鍵）與 `abilityCodeParity.baseline`（326 鍵）
 * 是**全域**的單一檔案，而每一條「修好一筆卡面說謊」的 lane 都必須動它 ——
 * 十條 lane ＝ 在同一個檔上排十次隊，外加十次合併衝突。
 * 按英雄切開之後，兩條 lane 只有在**修同一位英雄**時才會碰到同一個檔。
 *
 * ── ⭐ 分片的腐爛形態：**孤兒豁免** ──────────────────────────────────────────
 * 一個沒有對應英雄的檔留在目錄裡 ⇒ 它列的每一筆都被**永久**豁免，
 * 而原本那條「修好了就要從基準線刪掉」的棘輪**永遠不會叫**（它只看得到鍵，
 * 看不到鍵是從哪個檔來的）。所以這裡把結構性的四種腐爛全部關掉：
 *
 *   · 檔名 ↔ 內容不符（`godie-x.json` 裡寫著別人的鍵）→ throw
 *   · 空陣列（修完了卻留下空殼）→ throw，請**直接刪檔**
 *   · 同一個鍵出現在兩個檔 → throw
 *   · 檔名不對應任何一位**現存**的英雄 → ⛔ 不在這裡，由**各自的守衛**驗 ——
 *     「誰算存在」只有那條守衛的登錄表知道（descriptionClaims 是開放英雄＋
 *     固有能力，abilityCodeParity 是 `content/abilities` 裡的編號）。
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** 一份分片目錄讀回來的樣子。 */
export interface ShardedBaseline {
  /** 全部的棘輪鍵，順序 = 檔名排序後逐檔串接（⛔ 順序不影響判斷，兩條守衛都用集合）。 */
  readonly keys: readonly string[];
  /** 檔名（不含 `.json`，＝英雄）→ 該檔列的鍵。孤兒閘用得到。 */
  readonly byOwner: ReadonlyMap<string, readonly string[]>;
}

/** 讀一整個分片目錄。⛔ 結構性腐爛在這裡就 throw（見檔頭）。 */
export function loadShardedBaseline(dir: string, ownerOf: (key: string) => string): ShardedBaseline {
  const byOwner = new Map<string, readonly string[]>();
  const keys: string[] = [];
  const seen = new Map<string, string>();

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const owner = file.slice(0, -".json".length);
    const rows = JSON.parse(readFileSync(join(dir, file), "utf8")) as unknown;
    if (!Array.isArray(rows) || rows.some((r) => typeof r !== "string")) {
      throw new Error(`⛔ ${dir}/${file} 必須是一個字串陣列`);
    }
    if (rows.length === 0) {
      throw new Error(`⛔ ${dir}/${file} 是空的 —— 這一位已經全部修好了，請**刪檔**，⛔ 不要留空殼`);
    }
    for (const key of rows as string[]) {
      if (ownerOf(key) !== owner) {
        throw new Error(`⛔ ${dir}/${file} 裡的「${key}」不屬於 ${owner} —— 分片檔名必須等於它的英雄`);
      }
      const prev = seen.get(key);
      if (prev) throw new Error(`⛔ 「${key}」同時出現在 ${prev} 與 ${file}`);
      seen.set(key, file);
    }
    byOwner.set(owner, rows as string[]);
    keys.push(...(rows as string[]));
  }
  return { keys, byOwner };
}

/**
 * 把一整份鍵集合重新寫成分片（給兩條守衛的 `*_DUMP=1` 重新產生流程用）。
 * ⭐ 先清掉目錄裡的舊 `.json`，⛔ 不是疊加 —— 否則修好的那些會變成孤兒豁免。
 */
export function writeShardedBaseline(
  dir: string,
  keys: Iterable<string>,
  ownerOf: (key: string) => string,
): void {
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) rmSync(join(dir, f));

  const groups = new Map<string, string[]>();
  for (const key of keys) {
    const owner = ownerOf(key);
    (groups.get(owner) ?? groups.set(owner, []).get(owner)!).push(key);
  }
  for (const owner of [...groups.keys()].sort()) {
    writeFileSync(join(dir, `${owner}.json`), JSON.stringify(groups.get(owner), null, 2) + "\n", "utf8");
  }
}
