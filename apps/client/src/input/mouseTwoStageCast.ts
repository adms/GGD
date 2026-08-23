/**
 * mouseTwoStageCast — 純滑鼠的**二段施放** (GH#639)。
 *
 * owner 2026-08-24：
 * > 「純滑鼠操作直接按技能按鈕應該要能二段選擇後施放才對，例如初號機陽離子砲」
 *
 * 在此之前，滑鼠點技能格只會出 hover 範圍圈（#152/GH#367）——**純滑鼠玩家
 * 沒有任何一條路可以把技能放出去**（鍵盤 quick-cast、觸控、手把都有，就滑鼠沒有）。
 *
 * 兩段：
 *   1. 點技能格 → 進入瞄準（地板範圍圈走**既有的** `ui/abilityHold` seam，
 *      ⛔ 不是第二條預覽路）；游標離開技能格後圈**持續存在**。
 *   2. 點場景 → `InputCapture.castTwoStage()` 用**同一支** `buildCastCommand`
 *      解析落點並送出（與鍵盤 quick-cast 完全同一條解析路，圈與落點不可能分岔）。
 *   取消：再點同一格、右鍵（場景或技能格上）、按下任何技能快捷鍵、或比賽拆場。
 *
 * ⚠️ `castType: "self"` 沒有可瞄的東西 —— 進入「瞄準模式」只是逼玩家多點一下
 * 一個跟落點無關的地方，所以它回 `"castSelf"`，由技能格當下直接送出。
 *
 * ⚠️ 鍵盤／手把／觸控的既有流程**一格都沒動**：這裡只是滑鼠系的第五個 writer，
 * 寫的是同一格 `abilityHold`，並遵守「只清自己放上去的那一格」的既有規矩。
 *
 * 模組級 plain store（同 `abilityHold` 的形狀）：有兩個消費端（AbilityBar 的
 * 技能格、InputCapture 的場景點擊），⛔ 不走 React state（client-08）。
 */
import type { CastableSlot } from "@ggd/shared/sim/intents";
import { uiCues } from "../ui/uiCuesConfig";
import { clearHeldAbility, setHeldAbility } from "../ui/abilityHold";
import type { AimAbility } from "./AimResolver";

/** 技能格按下時要給的 castType —— `"self"` 走直接施放，其餘進瞄準。 */
export type TwoStageCastType = AimAbility["castType"];

/** 正在瞄準（等第二下）的那一格；null = 沒有在瞄準。 */
let armed: CastableSlot | null = null;

/** 目前武裝中的技能格（InputCapture 的場景點擊與測試讀這個）。 */
export function getTwoStageArmedSlot(): CastableSlot | null {
  return armed;
}

/** 技能格按下（主鍵）之後，這一下的意思。`"disabled"` = 後台開關關著（#639 rollback）。 */
export type TilePressAction = "armed" | "cancelled" | "castSelf" | "disabled";

/**
 * 第一段：主鍵按在技能格上。
 *   · 同一格再按一下 → 取消瞄準（owner:「再點鈕⋯=取消」）
 *   · `self` 型 → 不進瞄準，回 `"castSelf"` 讓技能格直接送 `{type:"self"}`
 *   · 其餘 → 武裝這一格並把地板圈釘住（換格武裝時先收掉舊格的圈）
 */
export function mouseCastTilePress(slot: CastableSlot, castType?: TwoStageCastType): TilePressAction {
  // 後台「畫面提示」的一格 rollback（GH#639）：關掉 = 回到 #639 之前 ——
  // 技能格按下只亮範圍圈，滑鼠不武裝、不施放。鍵盤/觸控/手把本來就不走這裡。
  if (!uiCues().mouseTwoStageCast) {
    cancelTwoStageCast();
    return "disabled";
  }
  if (armed === slot) {
    cancelTwoStageCast();
    return "cancelled";
  }
  if (castType === "self") {
    cancelTwoStageCast();
    return "castSelf";
  }
  if (armed !== null) clearHeldAbility(armed);
  armed = slot;
  setHeldAbility(slot, "aim");
  return "armed";
}

/**
 * 解除瞄準並收回**自己**釘住的地板圈（`clearHeldAbility` 只清自己那一格 ——
 * 別的 writer（鍵盤長按）正持有別格時不會被扯掉）。回傳「剛才真的有在瞄準嗎」，
 * 讓右鍵手勢分得出「取消瞄準」與「下移動指令」。
 */
export function cancelTwoStageCast(): boolean {
  if (armed === null) return false;
  const slot = armed;
  armed = null;
  clearHeldAbility(slot);
  return true;
}
