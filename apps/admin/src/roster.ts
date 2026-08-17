/**
 * 英雄上下架 — `config/roster.json` 的兩張清單（下架 / 隱藏）背後的純邏輯。
 *
 * ⚠️ 這一頁存在的理由和 商店經濟 一模一樣：**這份文件以前根本沒有後台入口**。
 * `configDocCoverage.ts` 為它掛了一列 KNOWN_GAP，理由逐字是「apps/admin/src 對
 * roster / retiredChampions 零引用」—— 而 `roster.json` 自己的 note 同時寫著
 * 「把 id 從這裡拿掉就是重新上架，不用改程式、不用重新部署」。兩句話有一句是假的，
 * 假的是後者（第三守則）：真實成本是編 repo → `pnpm content:build` → 一次完整部署。
 *
 * ⚠️⚠️ **這一頁必須同時擁有兩張清單，⛔ 不是為了做大。** {@link rosterDocFor} 寫的是
 * **整份文件**，而 Zod 是 `.strict()` 且 `retiredChampions` 是**必填**。只寫
 * `hiddenChampions` 的話，耐久覆蓋層裡就會出現一份沒有 `retiredChampions` 的
 * roster —— 要嘛整份驗不過（內容載入失敗 → fail-open 退回骨架），要嘛（若驗證被
 * 繞過）那七位下架英雄**靜靜地復活**在選人畫面上。`storeEconomy.ts` 檔頭記過同一條
 * 教訓（`mcoinRewards` 被漏寫會讓吃雞的 M幣 消失），這是它的第二個受害者。
 *
 * ── 兩張清單的差別（頁面上必須講清楚，否則操作者一定會填錯格）──────────────
 *   · **下架** `retiredChampions`：手動選 ⛔ + 隨機抽 ⛔（兩條路都擋）
 *   · **隱藏** `hiddenChampions`：手動選 ⛔ + 隨機抽 ✅（彩蛋，owner 2026-08-17
 *     「隱藏角色可以隨機到 但不能選到」）
 * 所以同一個 id 同時填進兩張＝自相矛盾，{@link rosterConflicts} 把它擋在儲存之前。
 */
import { DEFAULT_HIDDEN_CHAMPIONS } from "@ggd/shared/content/schema/config";
// ⚠️ 刻意**重用**免費名單那個解析器而不是抄一份：它做的事逐字相同（一個 textarea →
// 去重排序的 id 清單 + 打錯字回報），而抄第二份就是第零守則⑨ 講的「到處改改改」——
// 兩份會各自腐爛，而它們腐爛的症狀（打錯的 id 靜靜地不生效）長得一模一樣。
import { parseFreeChampionIds, type FreeListParse } from "./storeEconomy";

/** The `config` collection doc the console writes through the durable overlay. */
export const ROSTER_COLLECTION = "config";
export const ROSTER_DOC_ID = "roster";
export const ROSTER_SCHEMA = "config.roster@1";

/** 一份 roster 文件裡這一頁在乎的東西（`note` 是原封不動帶著走的那一格）。 */
export interface RosterLists {
  retired: string[];
  hidden: string[];
  /** 文件自己的說明。⚠️ 不編輯，但**一定要帶著走**，否則存一次就把它刪掉了。 */
  note?: string;
}

/** 一張清單的解析結果（與免費名單同一個形狀，見檔頭的重用理由）。 */
export type IdListParse = FreeListParse;

/** textarea → 去重排序的 id 清單 + 「這幾個不在開放名單裡」的提醒。 */
export const parseChampionIdList = parseFreeChampionIds;

/**
 * 從 API 回來的東西（覆蓋層 / 出貨檔 / 什麼都沒有）讀出兩張清單。
 *
 * **schema 不對就回 null**，不是照樣讀：操作者若把別份 config 存錯到這個位置，
 * 我們寧可畫「讀不到」也不要把那份文件的欄位當成一張下架名單顯示出來。
 * ⚠️ `hiddenChampions` 缺席是**正常狀態**（欄位是 `.optional()`，線上存在著這一格
 * 出現以前寫下的 override），退路是出貨預設 {@link DEFAULT_HIDDEN_CHAMPIONS}。
 */
export function extractRoster(doc: unknown): RosterLists | null {
  if (!doc || typeof doc !== "object") return null;
  const d = doc as Record<string, unknown>;
  if (d.schema !== ROSTER_SCHEMA) return null;
  const ids = (v: unknown, fallback: readonly string[]): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : [...fallback];
  return {
    retired: ids(d.retiredChampions, []),
    hidden: ids(d.hiddenChampions, DEFAULT_HIDDEN_CHAMPIONS),
    ...(typeof d.note === "string" ? { note: d.note } : {}),
  };
}

/** 同時出現在兩張清單上的 id —— 自相矛盾，擋在儲存之前。 */
export function rosterConflicts(lists: RosterLists): string[] {
  const hidden = new Set(lists.hidden);
  return lists.retired.filter((id) => hidden.has(id)).sort();
}

/** 一行一個 id（排序過）——textarea 的內容。 */
export function idListText(ids: readonly string[]): string {
  return [...ids].sort().join("\n");
}

/**
 * 要 PUT 的文件主體。**永遠是整份**，`note` 也帶著。
 *
 * 見檔頭：`retiredChampions` 是必填且 `.strict()`，所以任何一次部分寫入都會讓
 * 覆蓋層裡出現一份不合法的 roster，而那份文件壞掉的後果是**全部英雄消失**
 * （內容載入失敗 → fail-open 退回 2 隻骨架），不是「這一頁怪怪的」。
 */
export function rosterDocFor(lists: RosterLists): Record<string, unknown> {
  return {
    id: ROSTER_DOC_ID,
    schema: ROSTER_SCHEMA,
    ...(lists.note !== undefined ? { note: lists.note } : {}),
    retiredChampions: [...lists.retired].sort(),
    hiddenChampions: [...lists.hidden].sort(),
  };
}

/** 頁首那一行人話摘要。 */
export function rosterSummary(lists: RosterLists, rosterSize: number | null): string {
  const live = rosterSize === null ? null : Math.max(0, rosterSize - lists.retired.length);
  const livePart = live === null ? "" : ` · 開放名單上還有 ${live} 位`;
  return `下架 ${lists.retired.length} 位（誰都拿不到）· 隱藏 ${lists.hidden.length} 位（隨機抽得到、選不到）${livePart}`;
}
