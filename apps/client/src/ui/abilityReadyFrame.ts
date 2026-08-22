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
import { prefersReducedMotion } from "./buttonSfx";
import {
  ensureToggleKeyframes,
  toggleAbility,
  toggleRgbTriplet,
  TOGGLE_ANIM_NAME,
  type ToggleAbilityValues,
} from "./toggleAbility";

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

// ═══════════════════════════════════════════════════════════════════════════
// ⭐【開啟中】—— 第三種狀態，⛔ 不是就緒框的一個參數（GH#546）
// ═══════════════════════════════════════════════════════════════════════════
/**
 * owner 2026-08-22：「**風王結界這種開關型按鈕 圖示跟特效要明顯看出是開還是關
 * 狀態**（w3x會有特殊攻擊特效跟隨手部、**圖示也會有流轉作為打開中顯示**）」。
 *
 * ⚠️ 為什麼它不能靠就緒框表達：出貨的 20-01 風王結界**開著的期間自己在 60 秒
 * 冷卻裡**，所以 `isAbilityTileReady()` 對它是 false —— 一支**開著的**切換技與
 * 一支**單純在冷卻**的技能，在這一段落地之前於畫面上逐位元一模一樣。
 *
 * ⛔ 這裡沒有為風王結界寫任何一個 if（第〇·五守則）：`toggleOn` 是**一格狀態**，
 * 出貨的兩支切換技（20-01 風王結界 · 70-00 紮根，各兩個英雄變體共 4 份文件）
 * 與未來每一支都走同一條路。
 */
export interface AbilityTileState extends AbilityTileReadiness {
  /** 這顆按鈕現在是**開著的**切換技嗎（`sim/abilities/toggle.ts::isToggleOn`）。 */
  readonly toggleOn?: boolean;
}

/**
 * 「開啟中」的框 —— **常駐鑲邊（狀態）+ 掃光（流轉）**，畫在磚的子元素上。
 *
 * 兩半是刻意分開的，⛔ 不是同一個效果的兩個參數：
 *   · **鑲邊 + 外暈** 說「它是開著的」。它**永遠在**，減少動態也在。
 *   · **掃光** 是 owner 點名的「流轉」。它是動作，所以 `prefers-reduced-motion`
 *     下整段消失 —— ⭐ 保留那句話，拿掉動作（同 `cooldown.css` 的兩支）。
 *
 * ⚠️ 用 `background` 掃光而不是轉一圈的 conic 鑲邊：磚自己的 `transform` 已經被
 * 按下動畫與拒絕抖動佔走（`paintCastFlash` 直接寫 `el.style.transform`），而一個
 * 會 `rotate` 的方形子元素會轉出磚外。`background-position` 動的東西不碰版面。
 *
 * ⚠️ `pointerEvents: "none"` 與就緒框同一個理由：它蓋滿整格，會吃掉
 * `onPointerDown` —— 少了它，技能一旦開啟就再也**關不掉**。
 */
export function abilityToggleFrameStyle(
  rgb: string,
  v: ToggleAbilityValues = toggleAbility(),
  reduced: boolean = prefersReducedMotion(),
): CSSProperties {
  ensureToggleKeyframes();
  const c = toggleRgbTriplet(v.color, rgb);
  return {
    position: "absolute",
    inset: 0,
    borderRadius: "inherit",
    // 掃光被磚的圓角切齊；⛔ 它不裁掉自己的外暈（`overflow` 只管子元素）。
    overflow: "hidden",
    boxShadow: `inset 0 0 0 ${v.rimPx}px rgba(${c},0.95), 0 0 ${v.glowPx}px rgba(${c},0.6)`,
    background: reduced
      ? "none"
      : `linear-gradient(115deg, rgba(${c},0) 38%, rgba(255,255,255,0.32) 50%, rgba(${c},0) 62%)`,
    backgroundSize: "300% 100%",
    animation: reduced ? "none" : `${TOGGLE_ANIM_NAME} ${v.sweepMs}ms linear infinite`,
    pointerEvents: "none",
  };
}

/**
 * ⭐ **四個磚家族的唯一入口** —— 這一格現在該畫哪一種框（`null` = 不畫）。
 *
 * 三態的優先序，以及為什麼「兩個框並存」**沒有做成後台欄位**：開著的期間那支
 * 技能本來就在冷卻，所以就緒框在出貨內容上**不可能**同時亮 —— 一格切不出任何
 * 差別的欄位就是第一·五守則說的「說了但不會發生」，⛔ 所以它不存在。
 *
 * ⛔ 呼叫端不要自己 `if (toggleOn)` 再挑一支 style：那就是把這個決定寫四遍
 *（天生技 / QWER / EX / TouchControls），而它們一定會漂（#166 的虛線邊框當年
 * 就只在其中兩個家族上）。
 */
export function abilityTileFrameStyle(rgb: string, t: AbilityTileState): CSSProperties | null {
  if (t.toggleOn === true && toggleAbility().enabled) return abilityToggleFrameStyle(rgb);
  return isAbilityTileReady(t) ? abilityReadyFrameStyle(rgb) : null;
}
