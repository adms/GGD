/**
 * purchaseLines — what the PLAYER'S hero says when he buys something (owner ask:
 * 「購買完 玩家英雄應該要根據個性特色回應自己的想法 不只是擺出攻擊動作而已」).
 *
 * A completed purchase used to only play an ANIMATION on the hero (a victory /
 * attack clip, or a squash-pop). The owner wants the character to also RESPOND
 * IN-CHARACTER — a short in-character thought — so it reads as HIM reacting to
 * his new gear, not a mute attack pose. A sibling phase authored three distinct
 * personality lines per champion; they ship as the plain static asset
 * `content/config/_purchase-lines.json` (leading underscore is deliberate —
 * fsStore skips `_` files, keeping it out of the content bundle) and are shown
 * by ui/HeroReactionBubble.
 *
 * This is the pure, node-testable half: the tolerant parse of that doc, the
 * per-champion lookup, and the "random, never an immediate repeat" pick (the
 * same guarantee merchantTips uses — reused here via `nextTipIndex`). No React,
 * no fetch, no Babylon, so the whole decision is unit-tested without a browser.
 */
import { nextTipIndex } from "./merchantTips";

export interface PurchaseLine {
  /** display name of the champion (diagnostics; the bubble shows the line) */
  readonly name: string;
  /** the in-character purchase reactions (usually three) */
  readonly reactions: string[];
  /** authored tone tag (diagnostics only) */
  readonly tone: string;
}

/** championId → its authored purchase reactions. */
export type PurchaseLinesMap = Record<string, PurchaseLine>;

/**
 * The graceful fallback when a champion has NO authored entry (a new/unmapped
 * hero, or the config never loaded). Generic but still in-voice — never blank,
 * never a crash. The owner's floor: 「不錯，這件我收下了」.
 */
export const FALLBACK_REACTION = "不錯，這件我收下了";

/** Tolerant parse of the purchase-lines doc; {} = not usable (fallback only). */
export function purchaseLinesFromDoc(doc: unknown): PurchaseLinesMap {
  if (!doc || typeof doc !== "object") return {};
  const out: PurchaseLinesMap = {};
  for (const [id, raw] of Object.entries(doc as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as { name?: unknown; reactions?: unknown; tone?: unknown };
    const reactions = Array.isArray(o.reactions)
      ? o.reactions.filter((s): s is string => typeof s === "string" && s.length > 0)
      : [];
    out[id] = {
      name: typeof o.name === "string" ? o.name : id,
      reactions,
      tone: typeof o.tone === "string" ? o.tone : "",
    };
  }
  return out;
}

/** The reactions authored for a champion (empty when none / unmapped). */
export function reactionsFor(map: PurchaseLinesMap | null, championId: string): string[] {
  if (!map || !championId) return [];
  return map[championId]?.reactions ?? [];
}

/** A picked reaction: the index chosen (−1 for the fallback) and its text. */
export interface ReactionPickResult {
  readonly index: number;
  readonly text: string;
}

/**
 * Pick the reaction to show NEXT for a champion.
 *
 *   • empty reactions ⇒ the generic FALLBACK_REACTION, index −1 (never blank);
 *   • otherwise a uniform pick from the OTHER indices (no immediate repeat),
 *     via `nextTipIndex`, so buying twice in a row never repeats the same line.
 *
 * `rand` is injectable so the pick is deterministic under test.
 */
export function pickPurchaseReaction(
  reactions: readonly string[],
  current: number,
  rand: () => number = Math.random,
): ReactionPickResult {
  if (reactions.length === 0) return { index: -1, text: FALLBACK_REACTION };
  const index = nextTipIndex(current, reactions.length, rand);
  return { index, text: reactions[index] ?? FALLBACK_REACTION };
}
