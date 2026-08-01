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
}

/**
 * 出貨值 —— `content/config/arena-rules.json` 的 `itemDraft`。
 * `itemDraftShippedCopy.test.ts` 逐格對著真的檔案比,所以它不會偷偷漂走。
 */
export const SHIPPED_ITEM_DRAFT: Readonly<ItemDraftConfig> = Object.freeze({
  shortPoolMode: "short" as const,
  fallbackTable: "",
  maxDraws: 64,
});

/** 出貨的卡片張數（唯讀顯示；真正的欄位是 arena-rules 頂層的 `offerCount`）。 */
export const SHIPPED_OFFER_COUNT = 3;

/** 這一頁的欄位,**順序就是畫面順序**。 */
export type ItemDraftField = "shortPoolMode" | "fallbackTable" | "maxDraws";

export const ITEM_DRAFT_FIELD_ORDER: readonly ItemDraftField[] = [
  "shortPoolMode",
  "fallbackTable",
  "maxDraws",
];

/**
 * 畫面上的分組 —— 第二格只在第一格選 `fallback` 時才有意義,所以它自成一組;
 * `retire` 是 owner 2026-08-01 的退場清單,它**不是** `itemDraft` 區塊的一部分
 * (見下面 SHIPPED_RETIRED_LOOT_TABLES 的說明),但它調的是同一個東西 ——
 * 「這一場的三選一可以從哪些池子抽」 —— 所以放在同一頁。
 */
export type ItemDraftGroup = "policy" | "safety" | "retire";

export const ITEM_DRAFT_GROUP_ZH: Readonly<Record<ItemDraftGroup, string>> = Object.freeze({
  policy: "候選不足時怎麼辦",
  safety: "保險",
  retire: "退場的獎池",
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
});

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
export const KNOWN_LOOT_TABLES: readonly string[] = ["legendary-weapons", "quest-rewards", "round-reward"];

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

/** 出貨值 —— `content/config/arena-rules.json` 的 `retiredLootTables`。 */
export const SHIPPED_RETIRED_LOOT_TABLES: readonly string[] = Object.freeze(["quest-rewards"]);

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
}

export function formFromConfig(cfg: ItemDraftConfig): ItemDraftForm {
  return {
    shortPoolMode: cfg.shortPoolMode,
    fallbackTable: cfg.fallbackTable,
    maxDrawsText: String(cfg.maxDraws),
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

  return out;
}

/** 表單 → 文件區塊。只在 {@link validateItemDraftForm} 回空陣列時呼叫。 */
export function itemDraftFromForm(form: ItemDraftForm): ItemDraftConfig {
  return {
    shortPoolMode: form.shortPoolMode,
    fallbackTable: form.fallbackTable.trim(),
    maxDraws: Math.trunc(Number(form.maxDrawsText.trim())),
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
    if (cfg[f] !== SHIPPED_ITEM_DRAFT[f]) out.push(f);
  }
  return out;
}
