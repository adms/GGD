/**
 * draftA11y — the accessible-name wiring for the 三選一 draft (task #265,
 * owner's #252: 「三選一卡片沒有無障礙名稱 —— 手把焦點停上去沒東西可念」).
 *
 * ── WHAT WAS ACTUALLY BROKEN ────────────────────────────────────────────────
 * `AugmentDraftPanel.tsx` carried no ARIA attribute of any kind. Each card is
 * an `SfxButton` (a real `<button>`) whose children are:
 *
 *   <GlyphTile …/>        ← `aria-hidden` (components/GlyphTile.tsx), so the
 *                           icon contributes NOTHING to the name
 *   <div>{name}</div>     ← the augment/weapon name
 *   <div>{cardDesc}</div> ← the effect summary
 *
 * so name-from-contents did produce *something* — but only by concatenating two
 * unlabelled divs, with no declared relationship, no dialog announcement around
 * them, and nothing at all to read while the reveal animation holds the cards
 * at `opacity: 0`. The panel also had no `role="dialog"`, so nothing ever said
 * 「SILVER AUGMENT 三選一」 when it opened over the shop.
 *
 * ── THE FIX, AND WHY IT IS `aria-labelledby` AND NOT `aria-label` ────────────
 * The name and the description are ALREADY rendered, already 繁中, and already
 * protected by #202's registry-miss fallback (`resolveChoice`) and #110's
 * `weaponEffectDescription`. Writing a second copy into an `aria-label` would
 * create a string that can silently drift from the one on screen — the classic
 * a11y rot. So each card points at the two nodes it already draws:
 *
 *     aria-labelledby="<name id> <desc id>"   →   "鐵壁 每回合開始獲得 12 護甲"
 *
 * `SfxButton` spreads `...rest` onto the real `<button>`, so this needs no
 * change to the button component.
 *
 * Ids are derived here (not inlined in the JSX) so that the guard test can
 * recompute the exact same id for a given offer and assert the reference
 * resolves — an `aria-labelledby` pointing at a missing id is worse than no
 * label at all, because it reads as an EMPTY name.
 */

import { draftSuffixFor } from "./fateLexicon";

/** Prefix for every id this module mints. */
const PREFIX = "ggd-draft";

/**
 * Ids must survive being put in an HTML attribute and looked up again. Offer
 * ids come from the server and are opaque, so anything outside [A-Za-z0-9_-]
 * is replaced rather than trusted.
 */
function idSafe(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, "_");
}

/** Id of the card's NAME node (the `<div>{name}</div>` already rendered). */
export function draftCardNameId(offerId: string, index: number): string {
  return `${PREFIX}-${idSafe(offerId)}-${index}-name`;
}

/** Id of the card's DESCRIPTION node (the effect summary already rendered). */
export function draftCardDescId(offerId: string, index: number): string {
  return `${PREFIX}-${idSafe(offerId)}-${index}-desc`;
}

/**
 * The `aria-labelledby` value for one card: name THEN effect summary, which is
 * the order the owner asked for (增益名稱 + 效果摘要) and the order a screen
 * reader will speak them in.
 */
export function draftCardLabelledBy(offerId: string, index: number): string {
  return `${draftCardNameId(offerId, index)} ${draftCardDescId(offerId, index)}`;
}

/**
 * The FLAT fallback name for a card, built from the same two values the card
 * renders. Per accname `aria-labelledby` outranks `aria-label`, so a compliant
 * screen reader never reaches this — it exists for tree walkers that implement
 * neither `aria-labelledby` nor name-from-contents across nested elements.
 *
 * Measured, not assumed (2026-07-26, this repo's browser tooling, control probe
 * injected into a live page):
 *
 *   <button aria-labelledby="#external">X</button>   → read as "X"   (labelledby ignored)
 *   <button><div>名稱</div><div>描述</div></button>  → read as ""     (no contents walk)
 *   <button aria-label="…">…</button>                → read as the label
 *
 * So a card carrying ONLY `aria-labelledby` shows up unnamed in that snapshot —
 * indistinguishable from the bug this task exists to fix. Both attributes carry
 * the same characters from the same expressions, so there is nothing to drift.
 */
export function draftCardFallbackLabel(name: string, desc: string): string {
  return desc.trim() === "" ? name.trim() : `${name.trim()} ${desc.trim()}`;
}

/** Id of the dialog's own label node (the tier header). */
export function draftDialogLabelId(offerId: string): string {
  return `${PREFIX}-${idSafe(offerId)}-title`;
}

/**
 * The dialog's spoken label. `tierLabel` already yields 「A級願望」/
 * 「傳說武器 · WEAPON」; this suffix is what makes it a sentence rather
 * than a rarity word, and it matches the visible header exactly.
 *
 * ⭐ owner 2026-08-16（`docs/聖杯願望三選一-設計規則.md` §2）：玩家端的系統名是
 * **聖杯顯現**，⛔ 不是「三選一」——「三選一」是內部說法。
 * ⚠️ 這一格與畫面上那一行是**同一個常數**（見檔頭：唸出來的字必須逐字等於看到的字），
 * ⛔ 改一邊會讓螢幕閱讀器唸舊的而目視測試看不出來。
 */
export function draftChoiceSuffix(tier: string): string {
  return draftSuffixFor(tier);
}

export function draftDialogLabel(tierLabel: string, tier: string): string {
  return `${tierLabel} · ${draftChoiceSuffix(tier)}`;
}
