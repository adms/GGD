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
 * ⭐ GH#376 —— **它現在真的是後台欄位了。** 值住在 `config.range-guide@1`
 * （`content/config/range-guide.json` + Zod + 後台『範圍指引與預告』頁），
 * 解析與現值住在 `./rangeGuideConfig`，`ContentDb.load()` 呼叫
 * `applyRangeGuideDoc()` 把它灌進來。這個檔只留**手勢**（hover 的計時規則）。
 *
 * ⚠️ 所以 {@link ABILITY_RANGE_GUIDE} 的每一格是 **getter，不是常數** ——
 * 讀的當下拿到的是這一場生效的值。既有的呼叫端（`AimIndicator`、
 * `telegraphChannel.test.ts`）一個字都不用改，而它們現在讀的是後台的值。
 *
 * ⛔ 不要在別的檔案裡再寫一次這些數字。要調就去後台那一頁。
 */

import type { ChampionAbilitySlot } from "@ggd/shared/sim/intents";
import { clearHeldAbility, setHeldAbility } from "./abilityHold";
import { rangeGuide, type Rgb01 } from "./rangeGuideConfig";

export type { Rgb01 };

/**
 * 技能範圍指引的**現值**視圖。
 *
 * ⚠️ 這不是一個 `as const` 的常數表了（GH#376）：每一格是 getter，回傳
 * `rangeGuide()` 這一刻的值。⛔ 不要把它解構起來存著 —— 解構等於把後台的值
 * 凍在那一行執行的那一瞬間。
 */
export const ABILITY_RANGE_GUIDE = {
  /** 滑鼠停在技能圖示上幾毫秒後浮出地板範圍圈。 */
  get hoverDelayMs(): number {
    return rangeGuide().hoverDelayMs;
  },
  /** 施法距離圈 —— 「我打得到多遠」。 */
  get rangeRgb(): Rgb01 {
    return rangeGuide().rangeRgb;
  },
  /** 距離圈的半透明填滿（出貨刻意很淡，理由在後台那一頁）。 */
  get rangeFillAlpha(): number {
    return rangeGuide().rangeFillAlpha;
  },
  /** 命中範圍圈 —— 「它落在哪」。 */
  get aoeRgb(): Rgb01 {
    return rangeGuide().aoeRgb;
  },
  /** AoE 圈小得多，所以可以濃一點 —— 這是玩家真正要瞄的那一圈。 */
  get aoeFillAlpha(): number {
    return rangeGuide().aoeFillAlpha;
  },
  /** 「特殊顏色框框」的不透明度。 */
  get rimAlpha(): number {
    return rangeGuide().rimAlpha;
  },
  /** 框的粗細（世界單位，torus 的管徑）—— **絕對**值不是半徑比例。 */
  get rimThickness(): number {
    return rangeGuide().rimThickness;
  },
};

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

/**
 * Cursor entered a tile — arm the delayed range guide.
 *
 * ⭐ GH#376：「hover 要不要**同時**打開頂端說明橫幅」現在是後台的
 * `hoverOpensBanner`，⛔ 不是這一行寫死的 `"aim"`。出貨 false（只出範圍圈）——
 * 理由是技能格自己的 anchored Tooltip 已經在講同一段文字，而橫幅會在游標掃過
 * 技能列時閃六次。owner 想要相反的那一側時，那是一格下拉選單，不是一次部署。
 */
export function hoverGuideEnter(slot: ChampionAbilitySlot): void {
  cancelHoverGuide();
  hoverSlot = slot;
  const cfg = rangeGuide();
  hoverTimer = setTimeout(() => {
    hoverTimer = null;
    // still the same tile? (a sweep past it has already re-armed with another)
    if (hoverSlot === slot) setHeldAbility(slot, cfg.hoverOpensBanner ? "full" : "aim");
  }, cfg.hoverDelayMs);
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
