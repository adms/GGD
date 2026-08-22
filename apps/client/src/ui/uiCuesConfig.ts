/**
 * uiCuesConfig — `config.ui-cues@1` 的 client 端**現值**（owner 2026-08-23 的三則
 * [優先]：白色魔法陣 / 被動觸發閃圖示 / 主揪多等 1 分鐘）。
 *
 * ── ⭐ 為什麼是**懶讀**，不是 `applyXxxDoc()` 那一族的推送 ─────────────────────
 * `rangeGuideConfig` / `applyGoreDoc` 那一族要 `ContentDb.load()` 裡**多一行**才會
 * 生效，而那一行漏掉的症狀是「後台存得起來、頁面重整讀得回自己填的值，場上一輩子
 * 看不到」（失敗形態②，`rangeGuideWiring.test.ts` 就是為它存在的）。
 *
 * 這一份走 `ui/platform/lobbyRally.activeLobbyRally()` 的路：**每次讀的當下**問
 * `Configs.tryGet()`。⛔ 沒有第二個必須記得的接線點，所以沒有那個失敗形態。
 * 代價只有一次 Map 查詢，而下面那顆快取讓「同一份文件」只解析一次 ——
 * 呼叫端包含 `AbilityBar` 的 rAF 迴圈（每幀），⛔ 不可以每幀配一顆新物件。
 *
 * 內容還沒載完時回退到出貨值（大廳／首次繪製都比內容早），而出貨值就是 owner
 * 明說的那一組，所以那個回退**不改變任何行為**。
 */
import { Configs, DEFAULT_UI_CUES, UI_CUES_DOC_ID, resolveUiCues } from "@ggd/shared/content";
import type { ConfigUiCuesDoc, UiCuesDoc } from "@ggd/shared/content";

export type { UiCuesDoc };

/**
 * 上一次解析過的那一份文件與它的結果。
 *
 * ⚠️ key 是**文件物件本身**（`===`），⛔ 不是它的內容：內容覆蓋層換上一份新文件時
 * 那是一顆新物件，所以快取自己就失效了；同一份文件被讀一百萬次則一次都不重算。
 */
let cachedDoc: unknown = Symbol("never");
let cachedValues: UiCuesDoc = DEFAULT_UI_CUES;

/** 這一刻生效的畫面提示設定（後台覆蓋層 ?? `content/config/ui-cues.json` ?? 出貨值）。 */
export function uiCues(): UiCuesDoc {
  const doc = Configs.tryGet(UI_CUES_DOC_ID);
  if (doc === cachedDoc) return cachedValues;
  cachedDoc = doc;
  cachedValues = resolveUiCues(doc as ConfigUiCuesDoc | undefined);
  return cachedValues;
}

/** 丟掉快取。**測試專用** —— 每一條案例都從乾淨的一頁開始。 */
export function resetUiCuesCache(): void {
  cachedDoc = Symbol("never");
  cachedValues = DEFAULT_UI_CUES;
}
