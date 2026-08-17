/**
 * 傳說武器三選一 — the pure logic behind 後台 → 傳說武器三選一
 * (`content/config/arena-rules.json` 的 `itemDraft` 區塊, GH#249).
 *
 * ── 這一頁在修的是什麼 ────────────────────────────────────────────────────
 * owner 2026-08-01 實戰:「傳說武器有時候只有跳出一個而不是三選一」。
 * 真正的缺陷是**順序** —— `MatchController` 先抽三張、再把不在白名單裡的刪掉,
 * 所以白名單比棱彩表小的時候(線上就是這個狀態:表擴到 49 條、耐久白名單還停在
 * 舊的那批),卡片會隨機縮成 2 張、1 張、甚至 0 張。那個修法**不是設定**,
 * 它在 `packages/shared/src/sim/economy/draft.ts` 的 `eligibleItemPool`。
 *
 * 這一頁調的是剩下那個**真的是決策**的問題:候選池真的不夠 `offerCount` 張時,
 * 要發短卡、要借別的表、還是重複補滿。出貨值是最保守的「發短卡」。
 *
 * ── ⚠️ 卡片張數 (`offerCount`) 不在這一頁 ─────────────────────────────────
 * 它已經是同一份文件的頂層欄位,而且**augment 三選一與武器三選一共用它** ——
 * 在這裡再畫一個輸入框,會讓操作者以為自己只改了武器卡。它顯示為唯讀。
 *
 * ── 存檔一定寫整份 arena-rules ────────────────────────────────────────────
 * 耐久覆蓋層存的是**整份文件**。只送 `itemDraft` 的話,`rounds` / `mobWaves` /
 * `guardianTower` … 會從線上那份消失 —— 也就是整個回合排程沒了。所以
 * {@link patchItemDraft} 一定在讀到的那份文件上覆寫,讀不到就拒絕存檔
 * (同 `matchConfig.ts` 的理由:替代方案是用一份猜出來的文件蓋掉線上)。
 */

import {
  DEFAULT_DRAFT_CONFLICT,
  DEFAULT_LEGENDARY_SHELF,
  type DraftConflict,
  type LegendaryShelfConfig,
} from "@ggd/shared/content/schema/config";
import { LEGENDARY_ORB_PRICE, legendaryShelfPrice } from "@ggd/shared/sim/economy/itemTiers";

/** The `config` collection doc this page edits (one doc, one block). */
export const ARENA_RULES_COLLECTION = "config";
export const ARENA_RULES_DOC_ID = "arena-rules";
export const ARENA_RULES_SCHEMA = "config.arena-rules@1";

/** 候選不足時的三種答案。順序 = 畫面上的順序,保守的排第一。 */
export type ShortPoolMode = "short" | "fallback" | "duplicate";

export interface ItemDraftConfig {
  shortPoolMode: ShortPoolMode;
  fallbackTable: string;
  maxDraws: number;
  /** 三選一不可以發哪些 `craftRole`（owner 2026-08-04）。 */
  excludedCraftRoles: readonly string[];
}

/**
 * 出貨值 —— `content/config/arena-rules.json` 的 `itemDraft`。
 * `itemDraftShippedCopy.test.ts` 逐格對著真的檔案比,所以它不會偷偷漂走。
 */
export const SHIPPED_ITEM_DRAFT: Readonly<ItemDraftConfig> = Object.freeze({
  shortPoolMode: "short" as const,
  fallbackTable: "",
  maxDraws: 64,
  excludedCraftRoles: Object.freeze(["token", "service"]),
});

/** 出貨的卡片張數（唯讀顯示；真正的欄位是 arena-rules 頂層的 `offerCount`）。 */
export const SHIPPED_OFFER_COUNT = 3;

/** 這一頁的欄位,**順序就是畫面順序**。 */
export type ItemDraftField = "shortPoolMode" | "fallbackTable" | "maxDraws" | "excludedCraftRoles";

export const ITEM_DRAFT_FIELD_ORDER: readonly ItemDraftField[] = [
  "shortPoolMode",
  "fallbackTable",
  "maxDraws",
  "excludedCraftRoles",
];

/**
 * 畫面上的分組 —— 第二格只在第一格選 `fallback` 時才有意義,所以它自成一組;
 * `retire` 是 owner 2026-08-01 的退場清單,它**不是** `itemDraft` 區塊的一部分
 * (見下面 SHIPPED_RETIRED_LOOT_TABLES 的說明),但它調的是同一個東西 ——
 * 「這一場的三選一可以從哪些池子抽」 —— 所以放在同一頁。
 */
export type ItemDraftGroup = "policy" | "safety" | "retire" | "pool" | "conflict" | "shelf";

export const ITEM_DRAFT_GROUP_ZH: Readonly<Record<ItemDraftGroup, string>> = Object.freeze({
  policy: "候選不足時怎麼辦",
  safety: "保險",
  retire: "退場的獎池",
  pool: "哪些東西可以被發出去",
  conflict: "同一回合撞卡時",
  shelf: "寶具能不能直接買",
});

export interface FieldLabel {
  zh: string;
  /** 它**影響什麼** —— 不是複述欄位名（CLAUDE.md 第一守則）。 */
  note: string;
  group: ItemDraftGroup;
}

/**
 * EXHAUSTIVE `Record<ItemDraftField, …>` —— schema 多一格就是型別錯誤,
 * 不是悄悄畫出一個沒有說明的輸入框。
 */
export const ITEM_DRAFT_LABELS: Readonly<Record<ItemDraftField, FieldLabel>> = Object.freeze({
  shortPoolMode: {
    zh: "候選不足時",
    note:
      "整張表扣掉「已持有 / 白名單沒開 / 攻擊型態不符」之後不到三件時，卡片要怎麼補。" +
      "⚠️ 這一格**不是**「三選一只跳一張」那個缺陷的開關 —— 那個是抽卡順序，已經修在程式裡。",
    group: "policy",
  },
  fallbackTable: {
    zh: "備援獎池",
    note:
      "上面選「借別的獎池」時，缺的那幾張從這張 loot table 借。留空 = 沒有備援（等同發短卡）。" +
      "借來的東西一樣要過白名單與攻擊型態閘。",
    group: "policy",
  },
  maxDraws: {
    zh: "單張卡抽取次數上限",
    note:
      "一張卡最多做幾次加權抽樣。今天不會被碰到（不放回抽樣本來就會停），它擋的是" +
      "「卡片張數被打成很大的數字」時整場卡在發卡上。",
    group: "safety",
  },
  excludedCraftRoles: {
    zh: "不可以發出去的道具角色",
    note:
      "列在這裡的 craftRole，免費武器卡與 2400 金傳說寶玉**兩條路都不會發**。" +
      "出貨值 token、service（兌換券與商店服務放進獎勵池沒有意義）。" +
      "⚠️ 2026-08-04 之前 component（合成原料）也在名單裡，但那道閘**只掛在寶玉上** —— " +
      "同一支原料免費卡發得出來、寶玉抽不到。owner 裁決「49 支可被隨機三選一就好」，" +
      "所以 component 被拿掉（這個遊戲沒有合成系統）。**要關回去就在這裡加一個 component。**",
    group: "pool",
  },
});

/**
 * 出貨樹裡真的存在的 `craftRole` 值。**警告用不是驗證用**（同 KNOWN_LOOT_TABLES）：
 * 新增一個角色而忘了更新這裡，`itemDraftShippedCopy.test.ts` 會紅。
 */
export const KNOWN_CRAFT_ROLES: readonly string[] = ["final", "component", "quest", "token", "service"];

/** 鏡射 `zItemDraftConfig.excludedCraftRoles` 的 `.max(8)` 與每格 `.max(32)`。 */
export const EXCLUDED_ROLES_MAX = 8;
export const CRAFT_ROLE_MAXLEN = 32;

/** 下拉選項 —— 每一個都寫「玩家會看到什麼」。 */
export const SHORT_POOL_MODE_OPTIONS: readonly { value: ShortPoolMode; zh: string; note: string }[] = [
  { value: "short", zh: "發短卡（出貨值）", note: "有幾件就發幾張。玩家看到兩張，代表真的只剩兩件。" },
  { value: "fallback", zh: "從備援獎池借", note: "缺的張數從下面那張表補。玩家永遠看到滿版的卡。" },
  { value: "duplicate", zh: "重複補滿", note: "把已抽到的重複填滿。⚠️ 同一件會出現兩次，那不是選擇。" },
];

/**
 * 數值欄位的合法區間 —— **兩端都有**（CLAUDE.md #277：只檢查下界的話，
 * 64 打成 640 會過表單、到 Zod 才被擋，而操作者看到的是「存檔失敗」）。
 * 這份 MIRRORS `zItemDraftConfig`（packages/shared/src/content/schema/config.ts）,
 * 由 `itemDraftShippedCopy.test.ts` 對著 Zod 釘住。
 */
export const MAX_DRAWS_MIN = 1;
export const MAX_DRAWS_MAX = 512;
/** `fallbackTable` 的長度上界，同樣鏡射 Zod 的 `.max(64)`。 */
export const FALLBACK_TABLE_MAXLEN = 64;

/**
 * 出貨樹裡真的存在的 loot table id。**警告用，不是驗證用**：操作者可能正要新增
 * 一張表，靜靜地把他的輸入判成錯誤比讓他看到「這張表我不認得」更糟。
 * `itemDraftShippedCopy.test.ts` 對著 `content/loot-tables/_index.json` 釘住，
 * 所以新增一張表而忘了更新這裡會紅。
 */
export const KNOWN_LOOT_TABLES: readonly string[] = [
  // ⚠️ 排序與 content/loot-tables/ 的檔名一致（守衛真的去讀那個目錄）。
  // ⭐ owner 2026-08-18：三個池 = 三個**階級**，一件寶具只屬於一個池
  //   （`legendary-weapons` = EX · `ex-release-weapons` = [EX解放] ·
  //    `ex-origin-weapons` = [EX∅ 根源]）。
  // ⚠️ `quest-rewards` / `round-reward` 同一天整張搬進 `content/_legacy/loot-tables/`
  //   （owner：「任務道具」是舊 DOTA 玩法的標籤，競技場新玩法完全不考慮它；
  //    四件基礎道具「完全沒用請放到 legacy」）。它們仍然列在
  //   `SHIPPED_RETIRED_LOOT_TABLES`，因為**退場宣告擋的是後台覆蓋層那條路**
  //   （#283 那裡沒有 Zod），⛔ 表不在了不代表沒有人排得到它。
  "ex-origin-weapons",
  "ex-release-weapons",
  "legendary-weapons",
];

// ─────────────────────────────────────────────────── 已退場的抽獎池 ───────
//
// owner 2026-08-01:「第 2、5 回合改發棱彩傳說之後,那 13 支任務小飾品沒有任何
// 回合排它＝拿不到。排回去還是退場? **=> 退場**」
//
// ⚠️ 為什麼這一組**不在** `ItemDraftField` 裡:它是 arena-rules 的**頂層**欄位
// (`retiredLootTables`),不是 `itemDraft` 區塊的一格。`itemDraftShippedCopy.
// test.ts` 釘死「後台的欄位清單 === `zItemDraftConfig` 的鍵」,把它混進去會讓那
// 條守衛從此對不上 —— 而那條守衛正是這一頁存在的理由。所以它是同一頁上的第二
// 組欄位,有自己的出貨值、自己的界、自己的 drift 測試
// (`retiredTablesShippedCopy.test.ts`)。
//
// ⚠️ 這一格**不是**在刪東西。表還在、13 支道具還在白名單上、圖鑑照樣看得到;
// 它擋的是「有人把那張表排回某個回合」。規則本體在
// `packages/shared/src/content/retiredLootTables.ts`,`ContentLoader` 與
// game-server 的 `rulesFromDoc` 讀的是同一支函式。

/**
 * 出貨值 —— `content/config/arena-rules.json` 的 `retiredLootTables`。
 *
 * ⚠️ 2026-08-18 從 1 變 2：owner 把 `quest-rewards` 與 `round-reward` 兩張表
 * **整張**搬進 `content/_legacy/loot-tables/`。搬走之後 content 那條路已經由
 * 參照圖擋住（排一張不存在的表 = DanglingRefError），但**後台耐久覆蓋層那條路
 * 仍然沒有 Zod**（#283）—— 所以退場宣告留著，而且 `round-reward` 必須補上：
 * 它以前是 `gacha.lootTable` 的出貨值，是最容易被覆蓋層寫回去的那一個。
 */
export const SHIPPED_RETIRED_LOOT_TABLES: readonly string[] = Object.freeze([
  "quest-rewards",
  "round-reward",
]);

/** 鏡射 `zConfigArenaRulesDoc.retiredLootTables` 的 `.max(16)`。 */
export const RETIRED_TABLES_MAX = 16;
/** 每一格 id 的長度上界，鏡射同一個 Zod 的 `.max(64)`。 */
export const RETIRED_TABLE_ID_MAXLEN = 64;

export const RETIRED_TABLES_LABEL: FieldLabel & { group: "retire" } = Object.freeze({
  zh: "已退場的抽獎池",
  note:
    "列在這裡的 loot table **不可以被任何回合、gacha 或備援欄位排到**。" +
    "它不是刪除 —— 表與道具都還在（圖鑑、白名單、內容編輯都照舊），" +
    "只是玩家在一場比賽裡再也拿不到。要復活一張表，先把它從這裡移除；" +
    "沒移除就直接排回去的話，存檔會被拒絕並指名是哪一個回合。",
  group: "retire",
});

// ────────────────────────────── 同一回合撞卡時發哪一個（#340）─────────────
//
// owner 2026-08-17:「調整寶具跟固有能力三選一 不要同時出現 造成選擇時間不夠
// (兩者有衝突不顯示寶具三選一)」
//
// ⚠️ 為什麼這一組也**不在** `ItemDraftField` 裡:同 `retiredLootTables`,它是
// arena-rules 的**頂層**欄位,不是 `itemDraft` 區塊的一格。`itemDraftShippedCopy.
// test.ts` 釘死「後台的欄位清單 === `zItemDraftConfig` 的鍵」,混進去那條守衛就
// 從此對不上。所以走同一條已經驗過的路:同一頁上的第三組欄位,自己的出貨值 +
// 自己的 drift 測試。

/**
 * 出貨值。⛔ **不是**在這裡重打一份 —— 直接引用 schema 那一份(同
 * `grailDraft.ts` 的 `SHIPPED_GRAIL_DRAFT`),所以三個住處
 * (`content/config/arena-rules.json` · Zod `DEFAULT_DRAFT_CONFLICT` · 這裡)
 * 少掉一個會漂走的抄本。
 */
export const SHIPPED_DRAFT_CONFLICT: DraftConflict = DEFAULT_DRAFT_CONFLICT;

export const DRAFT_CONFLICT_LABEL: FieldLabel & { group: "conflict" } = Object.freeze({
  zh: "撞卡時發哪一個",
  note:
    "有些回合**同時**排了聖杯願望（能力三選一）與寶具（傳說武器三選一）。" +
    "兩張卡共用同一段中場倒數,所以「都發」的代價是玩家的選擇時間被切成兩半 —— " +
    "owner 2026-08-17 實測回報的就是這個。這一格決定撞到時誰讓路。" +
    "⚠️ 它**不會**改動回合排程:那些回合照樣排著兩者,切回「兩張都發」就整批回來。",
  group: "conflict",
});

/** 下拉選項 —— 每一個都寫「玩家會看到什麼」。 */
export const DRAFT_CONFLICT_OPTIONS: readonly { value: DraftConflict; zh: string; note: string }[] = [
  {
    value: "alternate",
    zh: "輪流讓路（出貨值）",
    note: "撞到的回合輪流:**第一個**排了寶具的回合發聖杯,**第二個**發寶具,依此類推。出貨排程下 = 第 2 回合聖杯、第 5 回合寶具 ⇒ 一場保證有一次免費寶具,而兩張卡一秒都沒有同時出現。⭐ 這一格是為了修 GH#347:每一回合都排了聖杯,所以「只發聖杯」等於免費寶具那條路整場關閉。",
  },
  {
    value: "grail-wins",
    zh: "只發聖杯願望（嚴格）",
    note: "撞到的那幾回合,玩家只看到能力三選一;寶具卡不出現。⚠️ 出貨排程裡**每一回合**都排了聖杯,所以選這個 = 一場比賽下來**一張免費傳說武器都不會發**（商店仍然買得到）。",
  },
  {
    value: "weapon-wins",
    zh: "只發寶具",
    note: "反過來:玩家只看到傳說武器三選一,那一回合沒有聖杯願望可挑。",
  },
  {
    value: "both",
    zh: "兩張都發（2026-08-17 之前的行為）",
    note: "兩張三選一擠在同一段倒數裡連續跳出來。這是 owner 回報「選擇時間不夠」的那個狀態。",
  },
];

/** 從 API 回來的文件裡挖出這一格；schema 不符或缺欄位 → 出貨值。 */
export function readDraftConflict(doc: unknown): DraftConflict {
  if (!doc || typeof doc !== "object") return SHIPPED_DRAFT_CONFLICT;
  const d = doc as Record<string, unknown>;
  if (d.schema !== ARENA_RULES_SCHEMA) return SHIPPED_DRAFT_CONFLICT;
  const v = d.draftConflict;
  // ⚠️ 缺欄位回**出貨值**不是 `both`:線上的耐久覆蓋層是這一格存在之前存的,
  // 照 `rulesFromDoc` 的 `??` 它在遊戲裡拿到的就是出貨值。後台畫成 `both` 的話
  // 畫面會說一件遊戲裡沒有在做的事。
  return isDraftConflict(v) ? v : SHIPPED_DRAFT_CONFLICT;
}

export function isDraftConflict(v: unknown): v is DraftConflict {
  return v === "grail-wins" || v === "weapon-wins" || v === "both" || v === "alternate";
}

/**
 * 把這一格接回**整份** arena-rules 文件（同 {@link patchRetiredTables} 的理由：
 * 覆蓋層存的是整份，少送一個區塊就是把那個機制從線上刪掉）。
 */
export function patchDraftConflict(
  doc: Record<string, unknown>,
  value: DraftConflict,
): Record<string, unknown> {
  return { ...doc, draftConflict: value };
}

/** 給操作者看的一句話：**這一場實際上會發生什麼**。 */
export function draftConflictSummary(value: DraftConflict): string {
  return DRAFT_CONFLICT_OPTIONS.find((o) => o.value === value)?.note ?? "";
}

// ──────────────────── 寶具（傳說武器）能不能直接買（owner 2026-08-17）──────
//
// 「寶具(傳說武器) 可以上架直接販售了，價格統一是**隨機抽的 6 倍**（後台可設定）」
//
// ⚠️ 為什麼這一組也**不在** `ItemDraftField` 裡:同 `retiredLootTables` /
// `draftConflict`，它是 arena-rules 的**頂層**欄位，不是 `itemDraft` 區塊的一格。
// `itemDraftShippedCopy.test.ts` 釘死「後台的欄位清單 === `zItemDraftConfig`
// 的鍵」，混進去那條守衛就從此對不上。
//
// ⚠️ 為什麼放在**這一頁**：這一頁已經是「寶具怎麼到玩家手上」的那一頁（發卡
// 規則、撞卡裁決、退場獎池）。上架直接買是第四條路，分到別頁只會讓操作者以為
// 三選一與商店是兩個互不相干的系統。

/**
 * 出貨值。⛔ **不是**在這裡重打一份 —— 直接引用 schema 那一份（同
 * {@link SHIPPED_DRAFT_CONFLICT}），所以三個住處只有兩份抄本。
 */
export const SHIPPED_LEGENDARY_SHELF: LegendaryShelfConfig = DEFAULT_LEGENDARY_SHELF;

/** 鏡射 `zLegendaryShelfConfig.priceMultiplier` 的 `.min(0.1).max(50)`。 */
export const PRICE_MULTIPLIER_MIN = 0.1;
export const PRICE_MULTIPLIER_MAX = 50;
/**
 * 鏡射 `zLegendaryShelfConfig.sellRefundPct` 的 `.min(0).max(1)`。
 * ⚠️ 上界 1 不是裝飾：> 1 = 賣得比買得多 = 買了賣、買了賣的無限金幣。
 */
export const SELL_REFUND_PCT_MIN = 0;
export const SELL_REFUND_PCT_MAX = 1;
/** 鏡射 `zLegendaryShelfConfig.randomOnlyTables` 的 `.max(32)`。 */
export const RANDOM_ONLY_TABLES_MAX = 32;

export const LEGENDARY_SHELF_LABEL: FieldLabel & { group: "shelf" } = Object.freeze({
  zh: "寶具直接販售",
  note:
    "開啟後，49 把寶具會出現在中場商店，玩家可以直接用金幣買 —— " +
    "⛔ 這**不會**打開 #261 暫時下架的那些普通武器道具（那是另一個開關）。" +
    "關掉就回到 2026-08-01 的舊裁決「寶具只能隨機三選一 / 傳說寶玉抽到」，" +
    "三選一與寶玉在**兩種狀態下都照常發卡**，這一格只管商店那條路。",
  group: "shelf",
});

export const PRICE_MULTIPLIER_LABEL: FieldLabel & { group: "shelf" } = Object.freeze({
  zh: "統一價倍率",
  note:
    "寶具的售價 = **傳說寶玉價 × 這個數**，49 把同一個價（owner：「價格統一是隨機抽的 N 倍」）。" +
    "⛔ 它不是一個金額：寫成金額的話，寶玉之後調價兩者就會各自漂走。" +
    "調大 = 直接買更貴、抽寶玉更划算；調小 = 直接買會取代抽獎。" +
    "⚠️ 買不買得起要對照**回合固定發放**的累計金幣：" +
    "第 3 場 1,575 · 第 5 場 3,625 · 第 8 場 7,575 · 第 10 場 12,075 · " +
    "第 12 場 20,075 · 第 13 場 24,075（外加小怪 20/隻、守護塔 150、精英 5,000、殭屍王 30,000）。",
  group: "shelf",
});

export const SELL_REFUND_PCT_LABEL: FieldLabel & { group: "shelf" } = Object.freeze({
  zh: "賣出退款率",
  note:
    "賣掉一件裝備退回 **那一格當初實付金額 × 這個數**（owner：「賣價一定是取得價的 40%」）。" +
    "⛔ 乘的**不是**道具標價 —— 49 把寶具的標價全部是 0，照標價算會變成「買 9,600、賣回 0」。" +
    "⭐ 三選一卡與傳說寶玉**免費**發到手的那幾把，實付是 0，所以賣掉也退 0（否則等於印鈔機）。" +
    "⚠️ 它管的是**整間商店**，不只是寶具。1 = 原價賣回（不虧），0 = 賣出不退錢。",
  group: "shelf",
});

export const RANDOM_ONLY_TABLES_LABEL: FieldLabel & { group: "shelf" } = Object.freeze({
  zh: "隨機限定抽獎表",
  note:
    "填**抽獎表 id**（逗號或換行分隔）。這些表裡的每一件道具**永遠不會出現在商店**，" +
    "只能靠三選一卡或傳說寶玉抽到（owner：「仍然可以有寶具是隨機才能取得的」）。" +
    "⭐ 為 [EX解放] / [EX∅ 根源] 準備：每一階做成**一張抽獎表**，這裡填表名就整批生效，" +
    "⛔ 不用逐份道具改設定、也不用改程式。出貨是空的 —— 現在 49 把寶具全部買得到。",
  group: "shelf",
});

/**
 * 給操作者看的一句話：**現在實際會發生什麼**。
 *
 * ⭐ 這一行是**唯讀的推導結果**，不是複述欄位值 —— 操作者不用心算，
 * 而且「乘的是哪一個價格」在畫面上是明說的（不是藏在程式裡的一個常數）。
 */
export function legendaryShelfSummary(cfg: LegendaryShelfConfig): string {
  const pct = cfg.sellRefundPct ?? SHIPPED_LEGENDARY_SHELF.sellRefundPct ?? 0;
  const tables = cfg.randomOnlyTables ?? [];
  const extras =
    `；賣掉退回**實付金額的 ${Math.round(pct * 100)}%**` +
    `（免費抽到的實付 0 → 退 0）` +
    (tables.length > 0 ? `；${tables.length} 張抽獎表被設成隨機限定，裡面的道具不上架` : "");
  if (!cfg.open) {
    return (
      "寶具**不上架** —— 商店裡買不到，只能靠三選一或 " +
      `${LEGENDARY_ORB_PRICE.toLocaleString("en-US")} 金傳說寶玉抽到（2026-08-01 的舊行為）` +
      extras
    );
  }
  const price = legendaryShelfPrice(cfg.priceMultiplier);
  return (
    `目前寶具統一價：${price.toLocaleString("en-US")} 金` +
    `（＝寶玉 ${LEGENDARY_ORB_PRICE.toLocaleString("en-US")} × ${cfg.priceMultiplier}）` +
    `，49 把同價，商店直接買得到` +
    // ⭐ 唯讀的推導結果：操作者不用去翻回合表就知道「這個價要打到第幾場」。
    // 對照的是 arena-rules 的 `grantGold` 累計（保證收入，不含打怪）。
    `${roundAffordability(price)}` +
    extras
  );
}

/**
 * 「這個價，第幾回合買得起第一把 / 第二把」——⭐ 推導，⛔ 不是寫死的一句話。
 *
 * 讀的是 arena-rules `grantGold` 的**累計保證收入**（整合者量的那一組）。
 * ⚠️ 這幾個數字會隨回合表被調而過期，所以它們住在**一個地方**，而且畫面上
 * 明說了它們是「固定發放」不含打怪 —— 一個標了計算基礎的估計值，比一句
 * 沒有基礎的斷言誠實。
 */
const GUARANTEED_GOLD_BY_ROUND: readonly (readonly [round: number, cumulative: number])[] = [
  [3, 1575],
  [5, 3625],
  [8, 7575],
  [10, 12075],
  [12, 20075],
  [13, 24075],
];

function roundAffordability(price: number): string {
  const firstAt = GUARANTEED_GOLD_BY_ROUND.find(([, g]) => g >= price)?.[0];
  const secondAt = GUARANTEED_GOLD_BY_ROUND.find(([, g]) => g >= price * 2)?.[0];
  const say = (r: number | undefined): string => (r === undefined ? "整場固定發放都不夠" : `第 ${r} 場`);
  return `（只算回合固定發放：${say(firstAt)}買得起第一把、${say(secondAt)}買得起第二把）`;
}

/** 從 API 回來的文件裡挖出這一組；schema 不符或缺欄位 → 出貨值。 */
export function readLegendaryShelf(doc: unknown): LegendaryShelfConfig {
  if (!doc || typeof doc !== "object") return { ...SHIPPED_LEGENDARY_SHELF };
  const d = doc as Record<string, unknown>;
  if (d.schema !== ARENA_RULES_SCHEMA) return { ...SHIPPED_LEGENDARY_SHELF };
  const block = d.legendaryShelf;
  // ⚠️ 缺欄位回**出貨值**：線上的耐久覆蓋層是這一格存在之前存的，照
  // `rulesFromDoc` 的 `??` 它在遊戲裡拿到的就是出貨值。後台畫成別的東西的話，
  // 畫面會說一件遊戲裡沒有在做的事。
  if (!block || typeof block !== "object" || Array.isArray(block)) return { ...SHIPPED_LEGENDARY_SHELF };
  const b = block as Record<string, unknown>;
  return {
    open: typeof b.open === "boolean" ? b.open : SHIPPED_LEGENDARY_SHELF.open,
    priceMultiplier:
      typeof b.priceMultiplier === "number" && Number.isFinite(b.priceMultiplier)
        ? b.priceMultiplier
        : SHIPPED_LEGENDARY_SHELF.priceMultiplier,
    sellRefundPct:
      typeof b.sellRefundPct === "number" && Number.isFinite(b.sellRefundPct)
        ? b.sellRefundPct
        : SHIPPED_LEGENDARY_SHELF.sellRefundPct,
    // 缺欄位 → 出貨值（空陣列）。⛔ 不要退回 `undefined`：畫面上那格輸入框
    // 會變成 uncontrolled，而操作者存檔時會不小心把整格刪掉。
    randomOnlyTables: Array.isArray(b.randomOnlyTables)
      ? b.randomOnlyTables.filter((t): t is string => typeof t === "string")
      : [...(SHIPPED_LEGENDARY_SHELF.randomOnlyTables ?? [])],
  };
}

/**
 * 這一組填得對不對。回 null = 沒問題。
 * **兩端都檢查**（CLAUDE.md #277）：6 打成 60 = 144,000 金，一整場都買不起，
 * 而畫面上只會看起來「好貴」—— 沒有人會發現那是設定打錯。
 */
export function validateLegendaryShelf(cfg: LegendaryShelfConfig): string | null {
  const m = cfg.priceMultiplier;
  if (!Number.isFinite(m)) return "統一價倍率必須是數字";
  if (m < PRICE_MULTIPLIER_MIN) return `統一價倍率不可小於 ${PRICE_MULTIPLIER_MIN}（schema 下限）`;
  if (m > PRICE_MULTIPLIER_MAX) return `統一價倍率不可超過 ${PRICE_MULTIPLIER_MAX}（schema 上限）`;
  const pct = cfg.sellRefundPct;
  if (pct !== undefined) {
    if (!Number.isFinite(pct)) return "賣出退款率必須是數字";
    if (pct < SELL_REFUND_PCT_MIN) return `賣出退款率不可小於 ${SELL_REFUND_PCT_MIN}（schema 下限）`;
    // ⛔ 上界不是裝飾：1.2 = 買 100 賣 120 = 無限金幣，而畫面上只會是「錢變多」。
    if (pct > SELL_REFUND_PCT_MAX) return `賣出退款率不可超過 ${SELL_REFUND_PCT_MAX}（賣得比買得多＝無限金幣）`;
  }
  const tables = cfg.randomOnlyTables;
  if (tables !== undefined && tables.length > RANDOM_ONLY_TABLES_MAX) {
    return `隨機限定抽獎表最多 ${RANDOM_ONLY_TABLES_MAX} 張（schema 上限）`;
  }
  return null;
}

/** 把這一組接回**整份** arena-rules 文件（同 {@link patchDraftConflict} 的理由）。 */
export function patchLegendaryShelf(
  doc: Record<string, unknown>,
  cfg: LegendaryShelfConfig,
): Record<string, unknown> {
  return { ...doc, legendaryShelf: { ...cfg } };
}

/** 逗號 / 換行分隔的輸入 → 乾淨的 id 陣列（去空白、去重複、保持輸入順序）。 */
export function parseRetiredTables(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const id = raw.trim();
    if (id !== "" && !out.includes(id)) out.push(id);
  }
  return out;
}

/** id 陣列 → 輸入框原文。 */
export function formatRetiredTables(ids: readonly string[]): string {
  return ids.join(", ");
}

/** 從 API 回來的文件裡挖出退場清單；沒有這個欄位 = 沒有任何表退場。 */
export function readRetiredTables(doc: unknown): string[] {
  if (!doc || typeof doc !== "object") return [];
  const d = doc as Record<string, unknown>;
  if (d.schema !== ARENA_RULES_SCHEMA) return [];
  const raw = d.retiredLootTables;
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}

/**
 * 退場清單填得對不對。回 null = 沒問題。
 *
 * ⚠️ 交叉檢查 `fallbackTable`:把備援池自己列進退場等於「選了借,但借不到」——
 * 後端會拒絕存檔,而操作者在畫面上完全看不出原因。在這裡先講。
 */
export function validateRetiredTables(text: string, fallbackTable: string): string | null {
  const ids = parseRetiredTables(text);
  if (ids.length > RETIRED_TABLES_MAX) {
    return `最多只能列 ${RETIRED_TABLES_MAX} 張表（超過通常代表貼錯東西進來了）`;
  }
  for (const id of ids) {
    if (id.length > RETIRED_TABLE_ID_MAXLEN) {
      return `獎池 id 不可超過 ${RETIRED_TABLE_ID_MAXLEN} 個字元：${id.slice(0, 20)}…`;
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return `獎池 id 只能是小寫英數字與連字號：${id}`;
  }
  const fb = fallbackTable.trim();
  if (fb !== "" && ids.includes(fb)) {
    return `「${fb}」同時是備援獎池又被列為退場 —— 借不到任何東西，請二選一`;
  }
  return null;
}

/**
 * 把退場清單接回**整份** arena-rules 文件。空清單寫成 `[]` 而不是刪掉這個鍵,
 * 因為「沒有任何表退場」是一個**明說**的狀態 —— 缺鍵和空陣列在遊戲裡等價,
 * 但在下一個讀文件的人眼裡不等價(那正是這個功能要修的那個誤會)。
 */
export function patchRetiredTables(
  doc: Record<string, unknown>,
  ids: readonly string[],
): Record<string, unknown> {
  return { ...doc, retiredLootTables: [...ids] };
}

/** 給操作者看的一句話：**這一場實際上會發生什麼**。 */
export function retiredTablesSummary(ids: readonly string[]): string {
  if (ids.length === 0) return "沒有任何抽獎池退場 —— 每一張表都可以被排進回合";
  return `${ids.join("、")} 已退場：排進任何回合 / gacha / 備援欄位都會被拒絕存檔`;
}

// ─────────────────────────────────────────────────────────── 讀 / 寫 ──────

/**
 * 把 `itemDraft` 從 API 回來的東西裡挖出來（覆蓋層文件、出貨文件，或什麼都沒有）。
 * SCHEMA 不對就回 null，而不是照樣讀 —— 操作者把別份 config 存錯地方的話，
 * 那份文件的欄位會被畫成抽卡規則。
 */
export function extractItemDraft(doc: unknown): ItemDraftConfig | null {
  if (!doc || typeof doc !== "object") return null;
  const d = doc as Record<string, unknown>;
  if (d.schema !== ARENA_RULES_SCHEMA) return null;
  const block = d.itemDraft;
  // 區塊是 `.optional()`：舊文件沒有它 = 出貨政策，不是壞掉。
  if (!block || typeof block !== "object" || Array.isArray(block)) return { ...SHIPPED_ITEM_DRAFT };
  const b = block as Record<string, unknown>;
  const mode = b.shortPoolMode;
  return {
    shortPoolMode: isShortPoolMode(mode) ? mode : SHIPPED_ITEM_DRAFT.shortPoolMode,
    fallbackTable: typeof b.fallbackTable === "string" ? b.fallbackTable : SHIPPED_ITEM_DRAFT.fallbackTable,
    maxDraws:
      typeof b.maxDraws === "number" && Number.isFinite(b.maxDraws)
        ? Math.trunc(b.maxDraws)
        : SHIPPED_ITEM_DRAFT.maxDraws,
    // `.optional()`：舊文件沒有這一格 = 出貨清單，不是「什麼都不排除」。
    excludedCraftRoles: Array.isArray(b.excludedCraftRoles)
      ? b.excludedCraftRoles.filter((v): v is string => typeof v === "string")
      : [...SHIPPED_ITEM_DRAFT.excludedCraftRoles],
  };
}

export function isShortPoolMode(v: unknown): v is ShortPoolMode {
  return v === "short" || v === "fallback" || v === "duplicate";
}

/** 這份 arena-rules 文件的 `offerCount`（唯讀顯示用）；讀不到就回出貨值。 */
export function readOfferCount(doc: unknown): number {
  if (!doc || typeof doc !== "object") return SHIPPED_OFFER_COUNT;
  const n = (doc as Record<string, unknown>).offerCount;
  return typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : SHIPPED_OFFER_COUNT;
}

/**
 * 把區塊接回**整份** arena-rules 文件。每一個兄弟區塊（rounds / overflow /
 * flowers / guardianTower / mobWaves …）原封不動帶著走 —— 覆蓋層存的是整份文件，
 * 少送一個區塊就是把那個機制從線上刪掉。
 */
export function patchItemDraft(
  doc: Record<string, unknown>,
  cfg: ItemDraftConfig,
): Record<string, unknown> {
  return { ...doc, itemDraft: { ...cfg } };
}

// ───────────────────────────────────────────────────────────── 表單 ───────

/** 表單狀態：兩格是字串（輸入框原文），一格是列舉。 */
export interface ItemDraftForm {
  shortPoolMode: ShortPoolMode;
  fallbackTable: string;
  maxDrawsText: string;
  /** 逗號 / 換行分隔，與退場清單同一個輸入形狀。 */
  excludedCraftRolesText: string;
}

export function formFromConfig(cfg: ItemDraftConfig): ItemDraftForm {
  return {
    shortPoolMode: cfg.shortPoolMode,
    fallbackTable: cfg.fallbackTable,
    maxDrawsText: String(cfg.maxDraws),
    excludedCraftRolesText: cfg.excludedCraftRoles.join(", "),
  };
}

export type FieldError = { field: ItemDraftField; error: string };

/**
 * 一份表單填得對不對。回空陣列 = 沒問題。
 *
 * 純函式而且住在這裡（不是 `ItemDraftPage.tsx`），因為這是**規則**不是畫面：
 * 規則寫在畫面裡就沒有人測得到。
 */
export function validateItemDraftForm(form: ItemDraftForm): FieldError[] {
  const out: FieldError[] = [];

  if (!isShortPoolMode(form.shortPoolMode)) {
    out.push({ field: "shortPoolMode", error: "請選一種候選不足時的處理方式" });
  }

  const table = form.fallbackTable.trim();
  if (table.length > FALLBACK_TABLE_MAXLEN) {
    out.push({ field: "fallbackTable", error: `獎池 id 不可超過 ${FALLBACK_TABLE_MAXLEN} 個字元` });
  } else if (table !== "" && !/^[a-z0-9][a-z0-9-]*$/.test(table)) {
    out.push({ field: "fallbackTable", error: "獎池 id 只能是小寫英數字與連字號" });
  } else if (form.shortPoolMode === "fallback" && table === "") {
    out.push({
      field: "fallbackTable",
      error: "選了「從備援獎池借」卻沒有填獎池 —— 這樣會靜靜地退化成發短卡",
    });
  } else if (table !== "" && table === "legendary-weapons") {
    out.push({
      field: "fallbackTable",
      error: "備援獎池不能是武器卡自己那一張（它已經抽完了，借不到任何東西）",
    });
  }

  const text = form.maxDrawsText.trim();
  if (text === "") {
    out.push({ field: "maxDraws", error: "請輸入抽取次數上限" });
  } else if (!/^\d+$/.test(text)) {
    out.push({ field: "maxDraws", error: "抽取次數上限必須是不含小數的正整數" });
  } else {
    const n = Number(text);
    if (n < MAX_DRAWS_MIN) out.push({ field: "maxDraws", error: `不可小於 ${MAX_DRAWS_MIN}` });
    else if (n > MAX_DRAWS_MAX) {
      out.push({ field: "maxDraws", error: `不可超過 ${MAX_DRAWS_MAX}（schema 上限）` });
    }
  }

  const roles = parseRetiredTables(form.excludedCraftRolesText);
  if (roles.length > EXCLUDED_ROLES_MAX) {
    out.push({
      field: "excludedCraftRoles",
      error: `最多只能列 ${EXCLUDED_ROLES_MAX} 個角色（超過通常代表貼錯東西進來了）`,
    });
  } else {
    for (const r of roles) {
      if (r.length > CRAFT_ROLE_MAXLEN) {
        out.push({ field: "excludedCraftRoles", error: `角色名稱不可超過 ${CRAFT_ROLE_MAXLEN} 個字元：${r.slice(0, 20)}…` });
        break;
      }
      if (!/^[a-z][a-z0-9-]*$/.test(r)) {
        out.push({ field: "excludedCraftRoles", error: `角色名稱只能是小寫英數字與連字號：${r}` });
        break;
      }
    }
  }

  return out;
}

/** 表單 → 文件區塊。只在 {@link validateItemDraftForm} 回空陣列時呼叫。 */
export function itemDraftFromForm(form: ItemDraftForm): ItemDraftConfig {
  return {
    shortPoolMode: form.shortPoolMode,
    fallbackTable: form.fallbackTable.trim(),
    maxDraws: Math.trunc(Number(form.maxDrawsText.trim())),
    excludedCraftRoles: parseRetiredTables(form.excludedCraftRolesText),
  };
}

/**
 * 給操作者看的一句話：**這一場實際上會發生什麼**。
 * 說的是玩家看到的東西，不是欄位值。
 */
export function itemDraftSummary(cfg: ItemDraftConfig, offerCount: number): string {
  const head = `每回合的傳說武器卡固定 ${offerCount} 張`;
  switch (cfg.shortPoolMode) {
    case "fallback":
      return cfg.fallbackTable === ""
        ? `${head}；候選不足時「借備援獎池」但沒填獎池 —— 實際上會發短卡`
        : `${head}；候選不足時從 ${cfg.fallbackTable} 借滿`;
    case "duplicate":
      return `${head}；候選不足時重複補滿（同一件會出現兩次）`;
    default:
      return `${head}；候選真的不足時就發短卡（有幾件發幾張）`;
  }
}

/** 這一格跟出貨值不一樣嗎 —— 畫面上標「已修改」用。 */
export function changedFields(cfg: ItemDraftConfig): ItemDraftField[] {
  const out: ItemDraftField[] = [];
  for (const f of ITEM_DRAFT_FIELD_ORDER) {
    // ⚠️ 陣列欄位要比**內容**不是比參考 —— `!==` 對兩個內容相同的陣列永遠為真,
    // 那會讓「已修改」在沒有人改過的時候就亮著（一個永遠說謊的指示燈）。
    const a = cfg[f];
    const b = SHIPPED_ITEM_DRAFT[f];
    const same = Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v, i) => v === b[i]) : a === b;
    if (!same) out.push(f);
  }
  return out;
}
