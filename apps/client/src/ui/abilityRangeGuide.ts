/**
 * abilityRangeGuide — the ONE 住處 for every tunable of the 技能範圍指引
 * (GH#367, owner 2026-08-18)：
 *
 * > 「技能缺乏範圍指引（可參考 LoL 英雄聯盟的新手模式與教學），理論上**按著技能
 * >   按鈕或 hover 時**要能顯示可施展的範圍才對（**特殊顏色框框 + 顏色半透明填滿**）」
 *
 * ── 為什麼這個檔存在（第一守則）────────────────────────────────────────────
 * 這批數字全部是**決策點**，不是實作細節：「hover 幾毫秒才浮出來」是手感、
 * 「填滿要多透」是可讀性 vs 遮擋、「框框什麼顏色」是 owner 的美術意見。
 * 它們原本會自然散落成三個檔各兩個魔術數字（`AbilityBar.tsx` 的 setTimeout、
 * `AimIndicator.ts` 的 alpha、又一個 Color3），而那正是第一守則點名的形狀 ——
 * 「改一個寫死的數字 = 一次完整部署」，乘以三個檔就是三次找。
 *
 * ⚠️ 這裡**還不是**後台欄位。誠實的說法：一份 `config.*@1` 要同時落在
 * `content/config/` + Zod schema + admin 表單三處（見 CLAUDE.md 第一守則），
 * 而 #367 本體是接線（把鍵盤/hover 接上既有那條預覽）。所以這一輪先把三處
 * 魔術數字收斂成**一個具名物件**，讓那一天的搬遷是「換一個 provider」而不是
 * 「去三個檔裡找數字」。搬遷的帳單開在 GH issue 上，⛔ 不是這行註解。
 *
 * ⛔ 不要在別的檔案裡再寫一次這些數字。要調就調這裡。
 */

import type { ChampionAbilitySlot } from "@ggd/shared/sim/intents";
import { clearHeldAbility, setHeldAbility } from "./abilityHold";

/** RGB 三元組（Babylon `Color3` 的參數，0..1）—— 這個檔刻意不 import 渲染型別。 */
export type Rgb01 = readonly [number, number, number];

export const ABILITY_RANGE_GUIDE = {
  /**
   * 滑鼠停在技能圖示上幾毫秒後浮出地板範圍圈。
   *
   * ⚠️ 不是 0：技能列是六格緊鄰的按鈕，游標從畫面一端掃到另一端會**依序**經過
   * 全部六格。零延遲 = 地板上閃六個圈。140ms 短到「我停下來了」還是即時，
   * 長到「路過」不會觸發（跟一般 tooltip 的 ~150ms 同一個量級）。
   */
  hoverDelayMs: 140,

  /** 施法距離圈 —— 藍色，「我打得到多遠」。 */
  rangeRgb: [0.45, 0.75, 1.0] as Rgb01,
  /**
   * 距離圈的半透明填滿。⚠️ 刻意很淡：這個圈是**整個施法距離**（大技能十幾單位
   * 直徑），填太濃會把腳下的地板、屍體、掉落物全部染色，反而看不到要打誰。
   */
  rangeFillAlpha: 0.09,

  /** 命中範圍圈 —— 琥珀色，「它落在哪」。 */
  aoeRgb: [1.0, 0.62, 0.23] as Rgb01,
  /** AoE 圈小得多，所以可以濃一點 —— 這是玩家真正要瞄的那一圈。 */
  aoeFillAlpha: 0.2,

  /** 「特殊顏色框框」的不透明度。框要比填滿實得多，否則邊界讀不出來。 */
  rimAlpha: 0.85,
  /**
   * 框的粗細（世界單位，torus 的管徑）。⚠️ 是**絕對**值不是半徑比例：
   * 比例會讓大技能的框粗得像另一個 AoE，小技能的框細到消失。
   */
  rimThickness: 0.18,
} as const;

// ---------------------------------------------------------------------------
// hover 手勢的計時器 —— ⛔ 不住在 AbilityBar.tsx 裡
// ---------------------------------------------------------------------------
/**
 * ONE timer for the whole bar, at module scope, because there is ONE cursor.
 * Per-tile timers would let a fast sweep across the six tiles leave five pending
 * callbacks that each fire later and fight over the same global held slot.
 *
 * ⛔ Deliberately NOT React state (client-08: per-move data never goes through
 * React), and deliberately NOT inside `AbilityBar.tsx`: the timing rule is the
 * decision, the JSX is just where the pointer events happen to land. Living
 * here means a node test can drive it without mounting the whole HUD.
 */
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
let hoverSlot: ChampionAbilitySlot | null = null;

/** Drop any pending hover reveal (a press outranks it; so does leaving). */
export function cancelHoverGuide(): void {
  if (hoverTimer !== null) clearTimeout(hoverTimer);
  hoverTimer = null;
}

/** Cursor entered a tile — arm the delayed range guide (never the banner). */
export function hoverGuideEnter(slot: ChampionAbilitySlot): void {
  cancelHoverGuide();
  hoverSlot = slot;
  hoverTimer = setTimeout(() => {
    hoverTimer = null;
    // still the same tile? (a sweep past it has already re-armed with another)
    if (hoverSlot === slot) setHeldAbility(slot, "aim");
  }, ABILITY_RANGE_GUIDE.hoverDelayMs);
}

/**
 * A real press on `slot` — take the tile over from the hover timer so a late
 * callback cannot DOWNGRADE the full hold (banner + guide) back to guide-only.
 */
export function pressGuide(slot: ChampionAbilitySlot): void {
  cancelHoverGuide();
  hoverSlot = slot;
}

/** Cursor left the tile — disarm, and retract only OUR slot (never someone else's). */
export function hoverGuideLeave(slot: ChampionAbilitySlot): void {
  if (hoverSlot === slot) {
    cancelHoverGuide();
    hoverSlot = null;
  }
  clearHeldAbility(slot);
}
