/**
 * resolveChoice — pure resolution of an augment-draft offer id to a display
 * name + description (+ w3x icon when present). Extracted from AugmentDraftPanel
 * so it is node-testable (no React/store import), mirroring the exSlot / icons
 * pattern. A draft choice is an augment, an ABILITY/augment doc, or a weapon
 * (item); each surfaces its w3x `icon` field via the same iconSrc/IconImg path
 * — icon-less choices fall back to the text card.
 */
import { Abilities, Augments, Items } from "@ggd/shared/sim/content/registry";
import { parseAttrChoice } from "@ggd/shared/sim/economy/attrDraft";
import { ATTR_STAT_SOURCE, type AttrKey } from "@ggd/shared/sim/stats/attributes";
import type { Stat } from "@ggd/shared/sim/stats/statTypes";
import type { AbilityId, AugmentId, ItemId } from "@ggd/shared/ids";
import { docDescription } from "../components/abilityText";
import { statLabel } from "./statDisplay";
import { noblePhantasmLabel } from "./fateLexicon";

export interface ResolvedChoice {
  name: string;
  desc: string;
  /** w3x icon path ("assets/icons/…") or undefined → text card fallback */
  icon?: string;
}

/**
 * WHAT an attribute point BUYS, derived from the shared 三圍→數值 table rather
 * than re-typed: 力量 feeds 生命/生命回復/攻擊力, 敏捷 feeds 護甲/攻擊速度,
 * 智慧 feeds 魔力/魔力回復/法術強度.
 *
 * It deliberately names the STATS and not the coefficients. The coefficients are
 * live combat-env values an operator can retune, so printing them here would be
 * a number that can go stale on a card that cannot be re-rendered — and #125's
 * rule is that a SHOWN number must be the post-multiplier final one. The
 * magnitude the player is choosing between (`+1.4`) is exact and IS shown.
 */
export function attrFeedsLabel(attr: AttrKey): string {
  return (Object.entries(ATTR_STAT_SOURCE) as [Stat, { attr: AttrKey }][])
    .filter(([, src]) => src.attr === attr)
    .map(([stat]) => statLabel(stat))
    .join("・");
}

export function resolveChoice(choice: string): ResolvedChoice {
  // 能力屬性強化 三選一 (#260). The magnitude lives IN the id, so the number the
  // player reads is byte-identical to the one the server applies — and it rides
  // in the card's NAME, which is also what the a11y label speaks (draftA11y),
  // so 「顯示在卡片上面」 holds for eyes and screen readers alike.
  const attr = parseAttrChoice(choice);
  if (attr) {
    return { name: attr.label, desc: attrFeedsLabel(attr.attr) };
  }

  // Augments carry no w3x art (they are our own pool, not imported); the icon
  // pipeline draws `assets/icons/augments/<id>.webp` for each one.
  //
  // ⭐ 2026-08-18 —— **the doc field is now the primary source.** Until then
  // `augment@1` was `.strict()` with NO `icon` field, so 91 docs could not carry
  // their own art and this line resolved it BY CONVENTION instead. owner
  // authorised the field ("補完其他沒有圖示的寶具跟固有能力"), the 91 PNGs that
  // were already on disk got wired, and `set_icon_field` no longer refuses.
  //
  // ⚠️ The convention fallback STAYS, and deliberately so: it is what kept the
  // cards from rendering as GlyphTile letter tiles (「鐵」「疾」「B」) for the
  // whole time the field was missing — the exact defect a playtest caught, and
  // #110 makes the card icon mandatory. A doc authored without `icon` (the field
  // is `.optional()`) still gets its art. Field first, convention second.
  //
  // A missing file is safe either way: GlyphTile draws its deterministic glyph
  // underneath and <IconImg> simply never paints over it.
  const aug = Augments.tryGet(choice as AugmentId);
  if (aug) {
    return {
      name: aug.name,
      desc: aug.description ?? "",
      icon: aug.icon ?? `assets/icons/augments/${aug.id}.webp`,
    };
  }

  // ability/augment choice → surface its w3x icon + recovered description
  const ability = Abilities.tryGet(choice as AbilityId);
  if (ability) {
    const out: ResolvedChoice = { name: ability.name, desc: docDescription(ability) ?? "" };
    if (ability.icon !== undefined) out.icon = ability.icon;
    return out;
  }

  // weapon cards (legendary items) → item icon + cost
  const item = Items.tryGet(choice as ItemId);
  if (item) {
    // ⭐ owner 2026-08-16：武器卡不再講「傳說武器道具」，講**寶具**：Rank + 種別。
    // ⚠️ 種別是**逐把不同**的（規模不是強弱），所以它在卡片上、不在標頭上 ——
    // 標頭是一整盤共用的，放不下逐把的資訊。
    // ⛔ 原本這一格是 `${item.cost} g`，而武器抽卡一律 0 g，所以那一行對玩家
    // 的資訊量是零 —— 換掉它不會蓋掉任何有用的東西。
    const out: ResolvedChoice = { name: item.name, desc: noblePhantasmLabel(item.id) };
    if (item.icon !== undefined) out.icon = item.icon;
    return out;
  }

  return { name: choice, desc: "" };
}
