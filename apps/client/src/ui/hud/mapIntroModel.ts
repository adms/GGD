/**
 * 戰鬥開場報地名 —— 純模型（owner 2026-08-14）。
 *
 * > 「新的七個地圖已經上線 但戰鬥開始的時候不會顯示這是什麼地圖，
 * >  請你記得要顯示出來」
 *
 * ⭐ 拆成「模型（這裡）＋ 畫面（`MapIntroOverlay.tsx`）」跟殭屍王出場演出同一個
 * 形狀，理由也一樣：模型是純函式 ⇒ 守衛可以用 `renderToStaticMarkup` 把**畫面上
 * 的字**讀回來，⛔ 不是斷言「某個變數等於某個字串」。
 * 「算對了」和「玩家看得到」是兩件事（失敗形態①）。
 *
 * ⚠️ 停留秒數是**欄位不是常數**，而 {@link mapIntroLifetime} 是那件事唯一會被
 * 觀察到的地方：把 `holdSec` 從 2.5 改成 0，同一個 `nowMs` 就必須從 `"live"`
 * 變成 `null`。守衛寫在**那個轉換**上（失敗形態⑦：掃屬性代替掃行為）。
 */
import { Configs } from "@ggd/shared/content";
import { DEFAULT_MAP_INTRO, resolveMapSpec, type MapIntroSpec } from "@ggd/shared/content";

export const MAP_SPEC_DOC_ID = "map-spec";

/** 幾毫秒問一次時鐘。跟殭屍王演出同一個節奏 —— 這是淡出，不需要每幀。 */
export const MAP_INTRO_POLL_MS = 100;

export type MapIntroRules = MapIntroSpec;

/**
 * 生效中的開場設定 —— 後台 overlay ?? `content/config/map-spec.json` ??
 * `DEFAULT_MAP_SPEC.intro`。
 *
 * ⚠️ 走 `Configs`（開機時灌進去的那一份），⛔ 不自己 fetch —— 同一份 bundle
 * 已經在記憶體裡，多一次 HTTP 只會多一種「兩邊不一致」的方式。
 */
export function mapIntroRules(): MapIntroRules {
  const doc = Configs.tryGet(MAP_SPEC_DOC_ID) as Parameters<typeof resolveMapSpec>[0];
  return resolveMapSpec(doc).intro ?? DEFAULT_MAP_INTRO;
}

export interface MapIntroLifetime {
  /** `"live"` = 停留中；`"out"` = 淡出中 */
  phase: "live" | "out";
  /** 0..1 —— 停留期間恆 1，淡出期間線性掉到 0 */
  opacity: number;
}

/**
 * PURE：開場提示現在還在不在畫面上，以及淡到哪裡。`null` ＝ 不畫。
 *
 * @param startedAtMs 這一回合的戰鬥是什麼時候開始的（`null` = 還沒開打）
 *
 * ⚠️ 時鐘倒退（OS 校時）一律回 `null` —— 永遠不會卡住一個不會消失的提示。
 * 這條是從殭屍王演出照抄的，因為它是同一種錯：`age` 變成負數時
 * 「還沒到 hold」與「早就過了」在數線上長得一樣。
 */
export function mapIntroLifetime(
  startedAtMs: number | null,
  nowMs: number,
  rules: MapIntroRules,
): MapIntroLifetime | null {
  if (startedAtMs === null) return null;
  if (!rules.enabled) return null;
  const age = nowMs - startedAtMs;
  if (age < 0) return null;
  const hold = Math.max(0, rules.holdSec) * 1000;
  const fade = Math.max(0, rules.fadeSec) * 1000;
  if (age > hold + fade) return null;
  if (age <= hold) return { phase: "live", opacity: 1 };
  // fade 為 0 時上面那條已經擋掉了（age > hold + 0），所以這裡除數不會是 0。
  return { phase: "out", opacity: Math.max(0, Math.min(1, 1 - (age - hold) / fade)) };
}
