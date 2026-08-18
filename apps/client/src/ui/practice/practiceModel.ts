/**
 * 練習面板（GH#365）的**純邏輯** —— 六個分頁的內容從哪裡來、輸入怎麼解析。
 *
 * owner 2026-08-18：「練習模式的作弊碼選單一樣沒有看到，請你修正到練習模式可以
 * 開出各種**經驗值、等級、寶具、屬性、技能、狀態開關、殭屍生成**等調整介面出來，
 * **重新設計一個適合現在的比較快**」
 *
 * ── ⭐ 這個檔案存在的唯一理由：**每一張清單都是推導出來的** ──────────────────
 * 面板上會出現幾百顆按鈕（119 隻英雄 · 數百件寶具 · 40 種狀態 · 20+ 條屬性），
 * 而它們**沒有一顆**寫在原始碼裡。全部來自出貨的登錄表：
 *
 * | 分頁 | 清單來自 | 加一份新內容之後 |
 * |---|---|---|
 * | 寶具 | `Items`（出貨註冊表） | 面板自己多一顆按鈕 |
 * | 屬性 | `Stat` enum + `ATTR_KEYS` | 引擎加一條屬性，面板自己多一列 |
 * | 狀態 | `StatusEffects`（`status-effect@1` 文件） | 加一份 JSON，面板自己多一顆 |
 * | 技能 | `CastableSlot` 型別（六個槽位是型別，不是資料） | — |
 *
 * ⛔ 手寫任何一份等於埋一個「上線第二天開始說謊」的名單，而且不會有東西紅
 *（第〇·五守則 + 第零守則⑨）。這一條決定了這個面板值不值得做。
 *
 * ⭐ 狀態那一頁還多做一件事：每一顆按鈕都標出**掛上去真的會發生什麼**
 *（`cheatStatusFlags`，與伺服器**同一支函式**）。有些狀態的機制住在技能 JSON 的
 * `applyStatus` 參數裡而不是文件裡，所以「掛上去只會有一個 HUD 圖示」是真的會
 * 發生的事 —— 面板必須說出來，⛔ 不可以讓使用者以為他掛上了一個會做事的東西
 *（第一·五守則：卡片上不可以有「說了但不會發生」的字）。
 */
import { Champions, Items } from "@ggd/shared/sim/content/registry";
import { StatusEffects } from "@ggd/shared/content/registries";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { STAT_LABEL_ZH } from "@ggd/shared/sim/baseBonus";
import { ATTR_KEYS, ATTR_LABEL } from "@ggd/shared/sim/stats/attributes";
import {
  cheatStatusFlags,
  cheatStatusHasMechanics,
  describeCheatStatusFlags,
} from "@ggd/shared/sim/cheatStatusFlags";
import type { CastableSlot } from "@ggd/shared/sim/intents";
import type { CheatListEntry } from "../cheats";

export type PracticeTabId = "growth" | "items" | "stats" | "abilities" | "status" | "mobs";

/** 六個分頁 —— owner 逐字列的六類，順序照他寫的順序。 */
export const PRACTICE_TABS: readonly { id: PracticeTabId; label: string }[] = Object.freeze([
  { id: "growth", label: "成長" },
  { id: "items", label: "寶具" },
  { id: "stats", label: "屬性" },
  { id: "abilities", label: "技能" },
  { id: "status", label: "狀態" },
  { id: "mobs", label: "殭屍" },
] as const);

/**
 * 可以指定施放的六個槽位。
 *
 * ⭐ 這是唯一一份寫在程式裡的清單，而它是**型別**不是資料：`CastableSlot` 是
 * `"Q"|"W"|"E"|"R"|"EX"|"PASSIVE"` 的聯集，所以引擎加一個槽位時**這一行會型別
 * 錯誤**（下面的 `satisfies` 把它釘住），⛔ 不會靜默過期。
 */
export const PRACTICE_CAST_SLOTS = ["Q", "W", "E", "R", "EX", "PASSIVE"] satisfies CastableSlot[];

/** 屬性分頁的一列。`attr` = 三圍（走另一條管線，見 `Cheat.setStat`）。 */
export interface PracticeStatRow {
  key: string;
  label: string;
  attr: boolean;
}

/**
 * 屬性分頁的清單 —— 三圍在前（owner 逐字「力/敏/智」排第一），其餘照 {@link Stat}
 * 宣告順序。⛔ 沒有手寫名單：引擎 2026-08-17 才剛加了三條輸出倍率屬性，任何手寫
 * 的「AD/AP/HP/MP/攻速」都已經漏了它們。
 */
export function practiceStatRows(): PracticeStatRow[] {
  const rows: PracticeStatRow[] = ATTR_KEYS.map((a) => ({ key: a, label: ATTR_LABEL[a], attr: true }));
  for (const s of Object.values(Stat)) {
    // 查不到繁中標籤就用 key 本身 —— ⛔ 不要把這一列藏起來：藏起來的話新加的屬性
    // 會從面板上消失，而那正是「手寫名單」要避免的那個故障，只是換了個地方發生。
    rows.push({ key: s, label: STAT_LABEL_ZH[s] ?? s, attr: false });
  }
  return rows;
}

/** 狀態分頁的一列。 */
export interface PracticeStatusRow {
  id: string;
  name: string;
  polarity: "buff" | "debuff" | undefined;
  /** 掛上去真的會發生什麼（「暈眩·沉默·繳械」）。空字串 = 只有圖示。 */
  effect: string;
  /** ⭐ false = 掛上去**只有一個 HUD 圖示**，遊戲裡什麼都不會發生。 */
  hasMechanics: boolean;
}

/**
 * 狀態分頁的清單 —— 出貨的每一份 `status-effect@1`，各自標出它的實際效果。
 *
 * ⚠️ `hasMechanics === false` 的那些**照樣列出來**，⛔ 不過濾掉：它們拿來測
 * 「條件葉讀不讀得到這個狀態」「HUD 的狀態列畫不畫得出來」都是有用的，
 * 而面板只要**誠實標示**就沒有說謊。過濾掉反而是把一個能力藏起來。
 */
export function practiceStatusRows(): PracticeStatusRow[] {
  return StatusEffects.all()
    .map((d) => {
      const flags = cheatStatusFlags(d.id, d.tags);
      return {
        id: d.id,
        name: d.name,
        polarity: d.polarity,
        effect: describeCheatStatusFlags(flags),
        hasMechanics: cheatStatusHasMechanics(flags),
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** 寶具分頁的清單 —— 出貨註冊表的每一件（含 [EX∅ 根源]）。 */
export function practiceItemRows(): CheatListEntry[] {
  return Items.all().map((i) => ({ id: i.id, name: i.name, tags: i.tags }));
}

/** 成長分頁的換角清單 —— 出貨註冊表的每一隻。 */
export function practiceChampionRows(): CheatListEntry[] {
  return Champions.all().map((c) => ({ id: c.id, name: c.name, role: c.role, tags: c.tags }));
}

/**
 * 數字輸入框 → 一個要送出去的數。
 *
 * ⚠️ 與 `parseSpawnCount` 的差別是**空字串**：那邊的空白是「交給後台預設」這個
 * 有意義的答案，這裡的空白只是「還沒填」⇒ `null` ⇒ 按鈕不送。⛔ 不要退回 0：
 * 「把攻擊力設成 0」與「我還沒打字」是兩件事，而前者是一個合法的作弊。
 *
 * 負值一律**允許**（「把移動速度設成 -100 看看會怎樣」正是練習房存在的理由），
 * 只夾一個防手滑的絕對值上界。
 */
export function parseCheatNumber(raw: string, max = 1e7): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.max(-max, Math.min(max, n));
}
