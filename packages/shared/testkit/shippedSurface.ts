/**
 * ⭐【「上架中」是一個**推導出來的集合**，⛔ 不是 `readdirSync(content/…)`】
 *
 * owner 講過兩次，兩次都是同一條規則的不同一半（GH#472）：
 *
 * > M48（2026-08-18）：「這些是哪裡來的老舊東西，根本沒上架阿 幹嘛修…
 * >  **你的判斷標準究竟是？**」
 * > M105-1（2026-08-19）：「記得只要做**有開放的角色技能及隨機三選一**就好，
 * >  **沒開放的別浪費 token**」
 *
 * ── 這一支與 `balancePopulation.ts` 的分工（⚠️ 兩個**不同**的母體） ──────────
 *
 * | 母體 | 是什麼 | 誰該用 |
 * |---|---|---|
 * | `balancePopulationIds()` | **49 位可選本體**（⛔ 不含變身態） | 平衡量測：級距 / 中位 / 錨點 / 屬性上限 |
 * | `shippedChampionIds()` | **49 位 ＋ 那 49 位的 20 個變身態** | 稽核：「這張卡上的字會不會被玩家看到」 |
 * | `readdirSync(content/champions)` | **71 張卡**（多 2 張 fail-open 骨架） | ⛔ 兩者都不是 |
 *
 * ⭐ 為什麼稽核要**含**變身態，而平衡母體**不含**：
 * 變身態是同一位英雄的**第二張卡**（同一個 `NN-XX` 編號）—— 進平衡母體＝把同一位
 * 英雄數兩次（owner 2026-08-21：「查所有屬性級距等 **都是不考慮變身態的**」）。
 * 但玩家**變身之後真的會看到那張卡**：它的技能會施放、它的說明會印在畫面上。
 * ⇒ 「這支技能的說明有沒有在說謊」這種稽核，變身態**必須**在裡面。
 * ⛔ 「不可選」與「退場」是兩件事（GH#472 的 owner 裁決逐字：那 20 個變身態的內容檔
 * 一份都不搬，因為搬走會讓 10 位英雄的變身技同時變成空的）。
 *
 * ── 道具那一半是這條規則今天**唯一還在漏的地方**（量到的，2026-08-21） ─────────
 *
 * 技能樹 420 份裡有 412 份屬於上架英雄（其餘 8 份是 fail-open 骨架）；
 * 英雄樹 71 張裡有 69 張在上架面。**但道具樹 142 件裡只有 89 件玩家拿得到** ——
 * 剩下 **53 件（37%）在任何一場比賽裡都不存在**：
 *
 *   · `weaponShelfOpen` 出貨是 **false**（owner 2026-07-28「其他武器道具先全部暫時下架」）
 *     ⇒ 有價武器**買不到**；
 *   · 而它們也不在任何一張 `content/loot-tables/` 的表裡 ⇒ **抽不到**。
 *
 * ⭐ 而這是**可逆的一格後台開關**（`config.arena-rules@1` 的 `weaponShelfOpen`），
 * 所以這份名單⛔**不可以**寫成一張手打的 id 清單 —— owner 哪天把貨架打開，
 * 上架面要**自己**跟著長大。這正是 GH#472 那句「讓母體從白名單推導」。
 *
 * ── 三條取得路徑，缺一條就有東西被誤判成「拿不到」 ────────────────────────
 *
 *   ① **抽**：`content/loot-tables/*.json` 的 `entries[].itemId`
 *      （三選一卡 `offerItems` · 傳說寶玉 `legendaryPool` · `rollItemReward`）
 *   ② **買**：`arena-rules.weaponShelfOpen` 打開時，`cost > 0` 的都上架；
 *      兩個**商店服務**（能力屬性強化 / 傳說寶玉）永遠買得到
 *   ③ **合成**：①② 拿得到的東西，它 `recipe` 指到的**元件與卷軸**也一定拿得到
 *      —— ⛔ 少了這一步，10 件 component 會被誤判成退場物
 *
 * ⚠️ **`--check` 友善**：這一支不讀時鐘、不讀 `data/curation/whitelist.json`
 * （那是 `.gitignore` 的營運狀態，CI 上不存在 —— 掛在它身上的閘等於沒有閘）。
 * 三個來源全部在 git 裡。
 *
 * ⚠️ **空集合一律 throw**，⛔ 不靜默回空：一份靜默回空的上架面會讓每一條用它過濾的
 * 稽核變成「零筆待修」而且每一支腳本都 EXIT 0 —— 那正是這支要防的失敗形態。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { SELA, THORNE } from "../src/sim/content/skeleton";
import { SHOP_SERVICE_ITEM_IDS } from "../src/sim/economy/itemTiers";
import {
  balancePopulationIds,
  BALANCE_POPULATION_PROVENANCE,
  CHAMPIONS_DIR_REL,
} from "./balancePopulation";

/** 道具的目錄。 */
export const ITEMS_DIR_REL = "content/items";
/** 獎池的目錄 —— 取得路徑①。 */
export const LOOT_TABLES_DIR_REL = "content/loot-tables";
/** 技能的目錄。⛔ 只拿來列檔名，⚠️ **不是**母體。 */
export const ABILITIES_DIR_REL = "content/abilities";
/** 貨架開關的住處 —— 取得路徑②（`config.arena-rules@1`，後台可調）。 */
export const ARENA_RULES_REL = "content/config/arena-rules.json";

/** ⛔ 唯一的上架面定義，逐字印進用得到它的產出。 */
export const SHIPPED_SURFACE_PROVENANCE =
  `對戰可選本體（${BALANCE_POPULATION_PROVENANCE}）＋ 這些本體的變身態` +
  `｜道具＝${LOOT_TABLES_DIR_REL} 的獎池 ∪ ${ARENA_RULES_REL} 打開的貨架 ∪ 兩者的合成前置`;

/**
 * ⛔ **fail-open 骨架** —— `apps/client/src/main.tsx` 在內容驗證失敗時註冊的那兩位。
 * ⭐ 從 `SELA` / `THORNE` **推導**，⛔ 不抄兩個字串（骨架換人時這裡自己跟著動）。
 *
 * ⚠️ 它們的英雄卡與 8 份技能檔真的躺在出貨樹裡（`loader.test.ts` 用它們證明整棵樹
 * 載得起來），所以任何**掃目錄**的稽核都會撿到它們 —— 而玩家永遠選不到。
 * 2026-08-21 owner 逐字點名過這個症狀：「Scorch Ring（`sela.e`）排進平衡清單」。
 */
export const SKELETON_CHAMPION_IDS: ReadonlySet<string> = new Set([
  String(SELA.id),
  String(THORNE.id),
]);

interface ChampionCard {
  readonly id: string;
  readonly transform?: { role?: string; counterpartId?: string };
}

function readChampionCards(repoRoot: string): ChampionCard[] {
  const dir = join(repoRoot, CHAMPIONS_DIR_REL);
  const out: ChampionCard[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as ChampionCard;
    if (doc.id) out.push(doc);
  }
  if (out.length === 0) {
    throw new Error(`${CHAMPIONS_DIR_REL} 讀出 0 張英雄卡 —— 讀取器壞了，⛔ 不是內容空了`);
  }
  return out;
}

/**
 * **上架面的英雄** = 對戰可選本體 ∪ 這些本體的變身態。
 *
 * ⛔ 不含 fail-open 骨架、⛔ 不含退場、⛔ 不含「檔案還在但沒有人指得到」的孤兒
 * （那一族由 `roster:check` 的第 ⑧ 條「內容樹 ↔ 三種身分」負責喊）。
 */
export function shippedChampionIds(repoRoot: string): Set<string> {
  const selectable = balancePopulationIds(repoRoot);
  const altOfBase = new Map<string, string>();
  for (const c of readChampionCards(repoRoot)) {
    if (c.transform?.role === "base" && c.transform.counterpartId) {
      altOfBase.set(c.id, c.transform.counterpartId);
    }
  }
  const out = new Set(selectable);
  for (const id of selectable) {
    const alt = altOfBase.get(id);
    if (alt) out.add(alt);
  }
  return out;
}

/**
 * 一份技能檔的**擁有者英雄 id**。
 *
 * 出貨的 420 份技能檔**每一份**都是 `<英雄 id>.<槽位>.json`，而文件裡的 `id`
 * 逐字等於檔名去掉副檔名（2026-08-21 全樹量過，零例外）。⇒ 擁有者 = `id` 的第一段。
 * ⛔ 不查 `championId` 欄位：那個欄位在技能 schema 上根本不存在。
 */
export function abilityOwnerId(abilityId: string): string {
  return abilityId.split(".")[0] ?? abilityId;
}

/**
 * **上架面的技能** = 上架面英雄（含變身態）持有的技能檔。
 *
 * ⚠️ 這裡故意**不**去讀英雄卡的 `abilities` / `passiveAbility` / `exAbility` 參照：
 * 那三處只涵蓋 Q/W/E/R + 天生 + EX，而出貨樹裡還有一批合法但沒被內嵌參照的槽位。
 * 判準是**擁有者上不上架**，⛔ 不是「這一支有沒有被某個欄位指到」。
 */
export function shippedAbilityIds(repoRoot: string): Set<string> {
  const owners = shippedChampionIds(repoRoot);
  const dir = join(repoRoot, ABILITIES_DIR_REL);
  const out = new Set<string>();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const id = f.slice(0, -".json".length);
    if (owners.has(abilityOwnerId(id))) out.add(id);
  }
  if (out.size === 0) {
    throw new Error(
      `${ABILITIES_DIR_REL} 過濾後剩 0 支技能 —— 讀取器壞了，⛔ 不是沒有技能上架` +
        `（來源：${SHIPPED_SURFACE_PROVENANCE}）`,
    );
  }
  return out;
}

interface ItemCard {
  readonly id: string;
  readonly cost?: number;
  readonly recipe?: { components?: string[]; book?: string };
}

function readItemCards(repoRoot: string): Map<string, ItemCard> {
  const dir = join(repoRoot, ITEMS_DIR_REL);
  const out = new Map<string, ItemCard>();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as ItemCard;
    if (doc.id) out.set(doc.id, doc);
  }
  if (out.size === 0) {
    throw new Error(`${ITEMS_DIR_REL} 讀出 0 件道具 —— 讀取器壞了，⛔ 不是內容空了`);
  }
  return out;
}

/** 獎池裡出現過的道具 id（取得路徑①）。 */
export function pooledItemIds(repoRoot: string): Set<string> {
  const dir = join(repoRoot, LOOT_TABLES_DIR_REL);
  const out = new Set<string>();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as {
      entries?: { itemId?: string }[];
    };
    for (const e of doc.entries ?? []) if (e.itemId) out.add(e.itemId);
  }
  if (out.size === 0) {
    throw new Error(`${LOOT_TABLES_DIR_REL} 讀出 0 個獎池條目 —— 讀取器壞了，⛔ 不是獎池空了`);
  }
  return out;
}

/**
 * **上架面的道具** = 抽得到 ∪ 買得到 ∪ 前兩者的合成前置。
 *
 * ⭐ 「買得到」讀的是**出貨 config**（`arena-rules.weaponShelfOpen`），⛔ 不是一張
 * 手打名單 —— owner 在後台把貨架打開的那一刻，這個集合自己就長大了。
 */
export function shippedItemIds(repoRoot: string): Set<string> {
  const items = readItemCards(repoRoot);
  const rules = JSON.parse(readFileSync(join(repoRoot, ARENA_RULES_REL), "utf8")) as {
    weaponShelfOpen?: boolean;
  };

  const frontier: string[] = [];
  const push = (id: string): void => {
    if (items.has(id)) frontier.push(id);
  };
  for (const id of pooledItemIds(repoRoot)) push(id); // ① 抽
  for (const id of SHOP_SERVICE_ITEM_IDS) push(String(id)); // ② 買 —— 商店服務永遠在
  if (rules.weaponShelfOpen === true) {
    for (const [id, doc] of items) if ((doc.cost ?? 0) > 0) push(id); // ② 買 —— 貨架開著
  }

  // ③ 合成前置：拿得到的東西，它的元件與卷軸也一定拿得到。
  const out = new Set<string>();
  while (frontier.length > 0) {
    const id = frontier.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    const recipe = items.get(id)?.recipe;
    for (const c of recipe?.components ?? []) push(c);
    if (recipe?.book) push(recipe.book);
  }

  if (out.size === 0) {
    throw new Error(
      `${ITEMS_DIR_REL} 過濾後剩 0 件道具 —— 讀取器壞了，⛔ 不是沒有道具上架` +
        `（來源：${SHIPPED_SURFACE_PROVENANCE}）`,
    );
  }
  return out;
}

/**
 * 出貨樹裡**玩家今天拿不到**的道具（排序）。
 *
 * ⚠️ 它們⛔**不是**退場物 —— 退場物住 `content/_legacy/items/`。這一族是
 * 「還在出貨樹、但三條取得路徑一條都不通」：多數是 #261 那批被一格開關收起來的
 * 有價武器。⇒ 稽核可以略過它們（owner：沒開放的別浪費 token），
 * 但⛔ 不可以刪掉它們，也⛔ 不可以把這份名單抄成常數。
 */
export function unreachableItemIds(repoRoot: string): string[] {
  const shipped = shippedItemIds(repoRoot);
  return [...readItemCards(repoRoot).keys()].filter((id) => !shipped.has(id)).sort();
}

/**
 * 稜彩增益卡（`content/augments/`）**全部都在**三選一池裡。
 *
 * ⛔ 這裡刻意沒有 `shippedAugmentIds()`：增益卡沒有「貨架」也沒有獎池表 ——
 * 抽卡直接吃整個集合，per-card 的過濾寫在卡自己的 hook 上
 * （`content/config/augment-filter.json` 的註記逐字說明了這件事）。
 * ⇒ 對增益卡而言「掃全部」**就是**「掃上架中」，加一層過濾只會製造一個會說謊的名詞。
 */
export const AUGMENTS_ARE_ALL_SHIPPED = true;
