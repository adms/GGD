/**
 * 手把／觸控自動瞄準的小怪讓路幅度 —— 從**出貨內容**讀，不是從客戶端常數（GH#315）。
 *
 * 和 `displayStatCaps` / `displayBodyScale` / `displayBaseBonus` 完全同一個形狀：
 * 客戶端經由 content bundle 拿得到 `config.combat-feel@1`，所以這一格真的是
 * 後台可調的（owner 2026-08-11 核准）。
 *
 * ⚠️ 讀不到文件 → 回 `DEFAULT_AIM_ASSIST`，⛔ 不是 0。回 0 等於「小怪不讓路」，
 * 那是一個**靜默的規則消失**：沒有錯誤訊息，遊戲照跑，手把被殭屍海淹沒。
 */
import { Configs } from "@ggd/shared/content";
import { COMBAT_FEEL_DOC_ID, combatFeelFromDoc, DEFAULT_AIM_ASSIST } from "@ggd/shared/sim/combatFeel";

export function aimAssistMobPenalty(): number {
  return (combatFeelFromDoc(Configs.tryGet(COMBAT_FEEL_DOC_ID)).aimAssist ?? DEFAULT_AIM_ASSIST)
    .mobPenalty;
}
