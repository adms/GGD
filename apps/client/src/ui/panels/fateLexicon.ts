/**
 * fateLexicon —— 聖杯願望三選一的**玩家端用語**（owner 2026-08-16）。
 *
 * 規則母本：`docs/聖杯願望三選一-設計規則.md`。這一支是它 §2 §3 §17 §18 的實作。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 為什麼是**一支模組**而不是散在各面板
 * ─────────────────────────────────────────────────────────────────────────────
 * 這幾個字要同時出現在**四個地方**：抽卡面板的階級標頭、對話框的無障礙標籤、
 * 面板登錄表的名字、以及未來的靈基刻印列表。
 * ⛔ 各寫各的 = 玩家在三個畫面看到三種說法，而**沒有任何東西會紅**。
 *
 * ⚠️ 無障礙那一份尤其危險：`draftA11y.ts` 的註解自己寫著
 * 「announced string IS the visible header, character for character」——
 * 兩邊分家的時候畫面是對的、螢幕閱讀器唸的是舊的，⛔ 而目視測試看不出來。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 後台的 `silver / gold / prismatic` **不動**（規則 §3 明說）
 * ─────────────────────────────────────────────────────────────────────────────
 * owner：「後台仍可保留 silver / gold / prismatic」「玩家端統一使用 Fate Rank」。
 * ⇒ 這是**純顯示層轉換**。⛔ 不要改 `augment@1` 的 tier enum ——
 * 改了會讓 31 份現有文件全部要重寫，而且後台與內容的 tier 語意會分家。
 */

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 2026-08-16 第二輪 —— **這些字現在住在 JSON，後台可改**
 * ─────────────────────────────────────────────────────────────────────────────
 * owner：「記得這些替換的介面提示等用語，應該是一個 JSON 檔，可以在後台替換設定」。
 *
 * 落點：`content/config/ui-lexicon.json`（schema `config.ui-lexicon@1`）→
 * `ContentDb` 開機時呼叫 {@link applyUiLexiconDoc} → 下面每一個讀取函式。
 * ⛔ 沒有那一行呼叫，這份 JSON 就是一份沒有人讀的檔案（失敗形態②：
 * 後台改了、存檔成功、畫面完全不變）。
 *
 * ⚠️ **所以下面全部改成「函式」不是「常數」。** 常數在 import 那一刻就定值，
 * 而內容是開機後才載入的 —— 一個 `export const X = LEX.foo` 會永遠是出貨值，
 * 而後台改了完全沒反應，⛔ 且型別與測試都不會紅。
 *
 * ⚠️ 另一半：owner 同一則說**傳說武器也要 Fate 化**（「不要講傳說武器道具這種
 * 字眼」）。這**推翻**了本檔第一版的判斷（見 {@link draftSuffixFor} 的舊註解：
 * 「武器屬於裝備層，不是願望」）。照第〇·六守則，owner 的新說明是第 1 層，贏。
 * ⇒ 武器不再叫「三選一」，改叫**寶具**，走**另一套詞**（種別 + Rank），
 * 而不是跟願望共用「聖杯顯現」—— 兩層仍然分得開，只是兩層都有 Fate 味了。
 */
import type { ConfigUiLexiconDoc } from "@ggd/shared/content/schema/config";

/** 出貨值 —— ⛔ 這是 fallback 不是真相；真相是 `content/config/ui-lexicon.json`。 */
const SHIPPED = {
  grail: {
    systemName: "聖杯顯現",
    prompt: "聖杯自無數可能性中顯現三項願望 —— 選擇其中一項刻入靈基，直到本場聖杯戰爭結束。",
    inscribeVerb: "刻入靈基",
    inscriptionsTitle: "靈基刻印",
    ranks: { silver: "C級願望", gold: "A級願望", prismatic: "EX級願望" } as Record<string, string>,
  },
  noblePhantasm: {
    systemName: "寶具顯現",
    defaultRank: "EX",
    defaultClass: "對人",
    classNames: {} as Record<string, string>,
    itemClass: {} as Record<string, string>,
  },
  shopLines: {} as Record<string, string>,
};

let LEX: typeof SHIPPED = SHIPPED;

/**
 * 套用後台那份文件。傳 null（檔案不存在／schema 不合）＝ 回到出貨值，
 * ⛔ 不是「沒有文字」——一個空白的抽卡標頭比一個舊的文案糟得多。
 */
export function applyUiLexiconDoc(doc: ConfigUiLexiconDoc | null | undefined): void {
  if (!doc) {
    LEX = SHIPPED;
    return;
  }
  LEX = {
    grail: {
      systemName: doc.grail.systemName,
      prompt: doc.grail.prompt,
      inscribeVerb: doc.grail.inscribeVerb,
      inscriptionsTitle: doc.grail.inscriptionsTitle,
      ranks: { ...doc.grail.ranks },
    },
    noblePhantasm: {
      systemName: doc.noblePhantasm.systemName,
      defaultRank: doc.noblePhantasm.defaultRank,
      defaultClass: doc.noblePhantasm.defaultClass,
      classNames: { ...doc.noblePhantasm.classNames },
      itemClass: { ...doc.noblePhantasm.itemClass },
    },
    shopLines: { ...doc.shopLines },
  };
}

/** 測試用：回到出貨值。 */
export function resetUiLexicon(): void {
  LEX = SHIPPED;
}

// ── 聖杯願望側 ───────────────────────────────────────────────────────────

/** 系統名（規則 §2）。 */
export function grailManifest(): string {
  return LEX.grail.systemName;
}

/** 抽卡面板的一行說明（規則 §2）。 */
export function grailManifestPrompt(): string {
  return LEX.grail.prompt;
}

/** 選取的動詞（規則 §18）。玩家不是「獲得一張卡」。 */
export function inscribeVerb(): string {
  return LEX.grail.inscribeVerb;
}

/** 已選願望的列表標題（規則 §18）。 */
export function inscriptionsTitle(): string {
  return LEX.grail.inscriptionsTitle;
}

/**
 * 一個階級的玩家端說法。⛔ 查不到就回 null ——
 * ⚠️ 這是**刻意的醜**：一個沒有對照的新階級應該在畫面上看起來就是漏的，
 * ⛔ 而不是被塞進「C級願望」裡假裝有人設計過它。
 */
export function fateRankLabel(tier: string): string | null {
  return LEX.grail.ranks[tier] ?? null;
}

/** 「⋯已刻入靈基。」的完整句（規則 §18）。 */
export function inscribedLine(wishName: string): string {
  return `「${wishName}」已${inscribeVerb()}。`;
}

// ── 寶具側（owner 2026-08-16 第二則）─────────────────────────────────────

/** 武器抽卡的系統名。⛔ 不再是「三選一」，也不是「聖杯顯現」。 */
export function noblePhantasmManifest(): string {
  return LEX.noblePhantasm.systemName;
}

/**
 * 這把武器的**種別全名**（「對軍寶具」）。
 *
 * ⭐ **種別是規模不是強弱** —— owner 給的對照表逐字寫著對人寶具
 * 「不是代表弱，而是效果集中」。⛔ 不可以拿它排序或當抽卡權重。
 */
export function noblePhantasmClass(itemId: string): string {
  const np = LEX.noblePhantasm;
  const code = np.itemClass[itemId] ?? np.defaultClass;
  return np.classNames[code] ?? `${code}寶具`;
}

/**
 * 這把武器的 Rank。出貨全部 **EX** ——
 * owner 2026-08-16：「照我們目前武器道具開放都是 EX 等級才對」。
 */
export function noblePhantasmRank(_itemId: string): string {
  return LEX.noblePhantasm.defaultRank;
}

/** 卡片上那一行：「EX 對軍寶具」。 */
export function noblePhantasmLabel(itemId: string): string {
  return `${noblePhantasmRank(itemId)} ${noblePhantasmClass(itemId)}`;
}

/** 商店回絕訊息的 Fate 版；沒設定就回 null（呼叫端用原本的機制訊息）。 */
export function shopLine(reason: string): string | null {
  return LEX.shopLines[reason] ?? null;
}

/**
 * 這個階級的抽卡後綴。
 *
 * 🔴 這個函式存在的理由是一個**量到的缺陷**：第一版把後綴整個換成「聖杯顯現」，
 * 於是傳說武器卡變成「傳說武器 · WEAPON · 聖杯顯現」。
 * ⚠️ 那種錯不會被型別或既有測試抓到：兩個字串都合法，畫面也長得很正常。
 * ⇒ 後綴必須跟著**階級**走，⛔ 不是一個全域常數。
 *
 * ⭐ owner 第二則之後，武器那一邊也不再是「三選一」了 —— 它有自己的系統名。
 */
export function draftSuffixFor(tier: string): string {
  return fateRankLabel(tier) !== null ? grailManifest() : noblePhantasmManifest();
}
