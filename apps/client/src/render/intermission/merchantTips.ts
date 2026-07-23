/**
 * merchantTips — what the 旅行商人 says while you shop (task #148).
 *
 * During the intermission the merchant cycles a rotating message box: a game
 * RULE, a play TIP, or an 出裝 (build) recommendation, one at a time, so a new
 * player learns the game just by standing at the counter. This file is the pure,
 * node-testable half — the tip DATA plus the "which tip next" rule — with no
 * React and no Babylon; the box that shows it is ui/MerchantTipBox.tsx and the
 * rotation cadence lives there. Kept beside layout.ts for the same reason: the
 * intermission's content is data first, imperative shell second.
 *
 * WHY A DEDICATED PICKER. "Random, but never the same tip twice in a row" is the
 * one rule with a sharp edge — a naïve `floor(random()*n)` repeats ~1/n of the
 * time, which reads as a bug ("it froze"). `nextTipIndex` draws uniformly from
 * the OTHER indices instead, so an immediate repeat is impossible BY
 * CONSTRUCTION rather than by re-rolling, and that guarantee is what the test
 * pins.
 */

/** A tip's kind — drives the little coloured tag the box shows. */
export type MerchantTipKind = "rule" | "tip" | "build";

export interface MerchantTip {
  readonly kind: MerchantTipKind;
  readonly text: string;
}

/** Human label + accent for each kind (the box reads these, never hard-codes). */
export const TIP_KIND_META: Record<MerchantTipKind, { label: string; accent: string }> = {
  rule: { label: "規則", accent: "#7fb2ff" },
  tip: { label: "提示", accent: "#7fe0a0" },
  build: { label: "出裝建議", accent: "#f2a13c" },
};

/**
 * The rotation pool. Traditional Chinese to match the game's UI. Every line is
 * grounded in a real mechanic this build ships:
 *   • rules  — the two-match format, the safe intermission, Ready semantics,
 *              and that death is per-round not per-match (SpectatorHint / lives);
 *   • tips   — the shortened cooldowns, the live stat preview, the undo button,
 *              the 6-slot cap, and the consecutive-stat 傳說 path;
 *   • build  — 武聖手鐲 is a real 300 g tier-1 crit item (godie-i002); the rest
 *              is format-agnostic economy advice (component-first, sell refunds
 *              only part of the cost — SELL_REFUND).
 * Keep every line short enough to read inside 5 s.
 */
export const MERCHANT_TIPS: readonly MerchantTip[] = [
  { kind: "rule", text: "兩場 3v3 同時開打，你只管眼前這一場。" },
  { kind: "rule", text: "中場是安全的整備時間，戰鬥不會在這裡開打。" },
  { kind: "rule", text: "按 Ready 只是提前開打；不按，時間到也會自動開始。" },
  { kind: "rule", text: "陣亡不代表出局——撐到回合結束，下一輪就復活。" },
  { kind: "tip", text: "本作冷卻已大幅縮短，別吝嗇，多放技能。" },
  { kind: "tip", text: "屬性面板會即時預覽「裝上這件後」的數值變化。" },
  { kind: "tip", text: "買錯了？點『↩ 復原上一步』就能還原這一手。" },
  { kind: "tip", text: "裝備欄只有六格，湊齊核心六件再考慮換裝。" },
  { kind: "tip", text: "連續強化屬性能累積成傳說級，別急著亂買打斷它。" },
  { kind: "build", text: "爆擊流開局先買「武聖手鐲」，便宜又補爆擊。" },
  { kind: "build", text: "錢不夠時，先收便宜的小件，之後再合成大裝。" },
  { kind: "build", text: "賣出只退回部分金幣，換裝前先想清楚。" },
];

/**
 * The index of the tip to show NEXT, given the one showing now.
 *
 * Guarantees (pinned by merchantTips.test.ts):
 *   • the result is always a valid index in [0, count);
 *   • it is NEVER equal to `current` when there is more than one tip (no
 *     immediate repeat), because we draw from the (count − 1) OTHER indices;
 *   • from a fresh start (`current < 0` or out of range) ANY index can be first.
 *
 * `rand` is injectable so the rotation is deterministic under test; it defaults
 * to Math.random. The `Math.min` clamps guard the rand()===1 edge.
 */
export function nextTipIndex(current: number, count: number, rand: () => number = Math.random): number {
  if (count <= 1) return 0;
  if (current < 0 || current >= count) {
    return Math.min(count - 1, Math.floor(rand() * count));
  }
  // draw one of the OTHER count-1 indices, then skip over `current`
  const r = Math.min(count - 2, Math.floor(rand() * (count - 1)));
  return r >= current ? r + 1 : r;
}
