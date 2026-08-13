/**
 * ⭐【就緒框】—— owner 2026-08-13 逐字：
 *
 *   「**被動技的按鈕應該不能被按下**，所以圖案不會有按鈕的變色動畫框，
 *     反之其他如果 **CD 好了、MP 足夠 要有變色動畫框**」
 *
 * 這一句同時定義了**兩件事**，而它們是同一條規則的兩半：
 *
 *   ① 一格「按得下去」的按鈕 = 主動技。被動不是按鈕，所以沒有按下動畫、
 *      沒有 pointer 游標、也沒有就緒框。
 *   ② 一格按得下去的按鈕**現在按得動**（冷卻好了 **且** 魔力夠）才亮框。
 *
 * ⛔ 這個模組存在的理由是 AbilityBar 有**三個**磚家族（天生技 / QWER / EX），
 *    而 TouchControls 是第四個。三份各自寫一次 `border + animation` 就是
 *    「到處改改改」（第零守則⑨）—— 而且它們一定會 drift：#166 的虛線邊框
 *    今天就只在其中兩個家族上。**一個模板，四個接點。**
 *
 * ⚠️ 為什麼是「框」不是「濾鏡／縮放」：磚自己的 `transform` / `filter` 已經被
 *    按下動畫與拒絕抖動佔走了（`paintCastFlash` 直接寫 `el.style.transform`），
 *    而 `boxShadow` 也是（拒絕紅框）。所以就緒框畫在一個**子元素**上，
 *    跟 `cooldownReadyStyle()` 的一次性綻放同一個做法。
 *
 * ⚠️ 這條跟一次性綻放（`ggd-cd-ready`）**不衝突也不重複**：
 *    綻放是「它**剛剛**好了」（事件，340ms），就緒框是「它**現在**按得動」
 *    （狀態，常駐）。少了後者，玩家要盯著數字消失才知道能按；
 *    少了前者，回到可用的那一刻沒有任何提示。
 */
import type { CSSProperties } from "react";

/**
 * 一格磚**現在按不按得動**要看的四件事。
 *
 * ⚠️ `learned` 預設 true 是給天生技與 EX 用的（它們沒有點數階級）。
 *    QWER 一定要傳 —— 一格沒點的技能冷卻是 0、魔力也「夠」，
 *    不傳就會亮著框說「可以放」，那是**失敗形態④**：斷言方向跟缺陷無關。
 */
export interface AbilityTileReadiness {
  /** 這一格是不是按鈕。被動 = false（owner：「被動技的按鈕應該不能被按下」）。 */
  readonly pressable: boolean;
  /** 冷卻已經好了。 */
  readonly offCooldown: boolean;
  /** 魔力足夠。 */
  readonly manaOk: boolean;
  /** 已經學會（QWER 專用；天生技／EX 省略）。 */
  readonly learned?: boolean;
}

/** owner 的兩半合成一格布林。⛔ 四個條件缺一都不亮。 */
export function isAbilityTileReady(t: AbilityTileReadiness): boolean {
  return t.pressable && t.offCooldown && t.manaOk && (t.learned ?? true);
}

/**
 * 游標。**一格按不下去的磚上出現 pointer 就是一句謊**（#166 對純被動移掉的
 * 正是這個），所以它跟 `pressable` 綁在一起，⛔ 不各自判斷。
 */
export function abilityTileCursor(pressable: boolean): "pointer" | "default" {
  return pressable ? "pointer" : "default";
}

/**
 * 就緒框本體 —— 畫在磚的**子元素**上的一圈脈動內環 + 外暈。
 *
 * `rgb` 是磚自己的家族色（天生技紫 / QWER 藍 / EX 金），所以「哪一格好了」
 * 除了亮起來還帶著它本來的身分，不會四格亮成同一個顏色。
 *
 * ⚠️ `pointerEvents: "none"` 是必要的：它蓋滿整格，會吃掉 `onPointerDown`。
 */
export function abilityReadyFrameStyle(rgb: string): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    borderRadius: "inherit",
    boxShadow: `inset 0 0 0 2px rgba(${rgb},0.95), 0 0 10px 2px rgba(${rgb},0.55)`,
    animation: "ggd-ability-ready 1400ms ease-in-out infinite",
    pointerEvents: "none",
  };
}

/** 家族色（與各磚的 accent 同一組）—— `rgb()` 三元組，給上面那支拼透明度用。 */
export const READY_RGB_PASSIVE = "168, 140, 255";
export const READY_RGB_ACTIVE = "120, 190, 255";
export const READY_RGB_EX = "255, 206, 110";
