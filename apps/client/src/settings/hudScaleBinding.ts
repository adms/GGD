/**
 * hudScaleBinding — 從玩家設定推到 HUD 縮放層的**單向**橋（owner 2026-08-10）。
 *
 * 形狀完全照抄 `vfx/goreSettings.ts`，理由也一樣：`ui/hudScale.ts` 是純資料 +
 * 一個算子，沒有 settings singleton、沒有 localStorage —— 所以 `hudLayout.ts`
 * 那種可以在 node 裡純算的幾何模組能安全地 import 它。這個檔是兩邊唯一相遇的地方。
 *
 * 方向嚴格是 settings → HUD：沒有任何 HUD 程式碼可以回頭寫設定。
 *
 * ⚠️ **開機時要有人呼叫它**，否則玩家選的檔位存進了 localStorage 卻永遠不生效
 * （＝「按了、顯示他選的那個、而它不生效」，`settings/types.ts` 已經把這個列為
 * 設定 UI 最糟的行為）。掛載點在 `main.tsx`，跟 `bindGoreToSettings()` 同一排。
 */
import { applyHudScale } from "../ui/hudScale";
import { settingsStore } from "./index";
import type { Settings } from "./types";

let unbind: (() => void) | null = null;

/**
 * 把目前的設定推進 HUD 縮放層並持續同步。
 * Idempotent：呼叫兩次是「重新綁」，不會疊訂閱。回傳一個解綁器（測試 seam / teardown）。
 */
export function bindHudScaleToSettings(store = settingsStore): () => void {
  unbind?.();
  applyHudScale(store.ui().hudScale);
  const off = store.subscribe((s: Settings) => applyHudScale(s.ui.hudScale));
  unbind = (): void => {
    off();
    unbind = null;
  };
  return unbind;
}
