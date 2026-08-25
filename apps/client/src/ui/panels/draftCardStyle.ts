/**
 * draftCardStyle — pure presentation constants for the 3-choose-1 draft cards
 * (task #110). Extracted from AugmentDraftPanel so the tier→colour mapping, the
 * tier label and the confirm-sfx key are node-testable with no React/store
 * import (same pattern as resolveChoice / prepCountdown).
 *
 * The tier COLOUR is the card's whole identity: it tints the flowing border
 * glow (the `--ggd-card-glow` custom property that buttonFx.css `.ggd-btn--card`
 * reads), the GlyphTile frame, the card name and the tier header — so silver /
 * gold / prismatic augments and legendary WEAPON cards read apart at a glance
 * exactly like LoL-Arena rarities.
 */
import { Items } from "@ggd/shared/sim/content/registry";
import { ATTR_OFFER_TIER } from "@ggd/shared/sim/economy/attrDraft";
import { fateRankLabel } from "./fateLexicon";
import type { ItemId } from "@ggd/shared/ids";
import { GOLD } from "../theme";
import { buildItemRow, formatAuthoredBonus, type RowItem } from "./itemStats";

/** audio-map.json sfx key for the card lock-in cue (content/config/audio-map.json). */
export const DRAFT_CONFIRM_SFX = "draftConfirm";

/**
 * What a WEAPON (item) draft card says the weapon does.
 *
 * The AUTHORED `description` wins whenever the doc has one. owner 2026-08-01,
 * on being shown that 死之王的意志 rendered an empty card: 「卡片應該要顯示全部
 * 敘述阿」. The 效能/解說 prose is the spec — it is where the mechanics that the
 * effect vocabulary cannot yet express (斬殺, 格擋, 套裝, 反彈…) are written down,
 * and a card built only from `modifiers` silently drops every one of them.
 *
 * The derived effect+stat read is the FALLBACK, not the primary: it only runs
 * for docs with no authored prose, where re-deriving from content still beats
 * resolveChoice's bare `300 g`. Returns null when neither exists, and the caller
 * keeps resolveChoice's text.
 *
 * The `as unknown as RowItem` mirrors MerchantShop: the runtime item doc carries
 * `description`, which the compile-time ItemDef type omits.
 */
export function weaponEffectDescription(choice: string): string | null {
  const item = Items.tryGet(choice as ItemId);
  if (!item) return null;
  const authored = (item as unknown as RowItem).description?.trim();
  if (authored) return authored;
  // no anchor stat on a draft card → every bonus stays a labelled chip
  const row = buildItemRow(item as unknown as RowItem, null);
  const parts: string[] = [];
  if (row.effect) parts.push(row.effect);
  for (const m of row.merged) parts.push(formatAuthoredBonus(m));
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * 這個抽卡選項如果是一件**有 owner 原文的道具**,回那段原文;否則 null。
 *
 * `weaponEffectDescription` 已經在做同一件查找,但它會在沒有原文時**回退成
 * 「由 modifiers 重新推導出來的一句話」**。卡片排版只想要真正的原文 —— 推導出來
 * 的那一句沒有 `效能` 結構、沒有 `[標記]`,丟給 `parseItemCard` 只會得到一行。
 * 所以這裡分開一個查找,而不是在元件裡用字串特徵去猜哪一種回來了。
 */
export function itemCardDescription(choice: string): string | null {
  const item = Items.tryGet(choice as ItemId);
  if (!item) return null;
  const authored = (item as unknown as RowItem).description?.trim();
  return authored ? authored : null;
}

/** Rarity/kind → accent colour. Mirrors LoL-Arena's silver/gold/prismatic. */
export const DRAFT_TIER_COLOR: Record<string, string> = {
  silver: "#b8c4d6",
  gold: "#f2c637",
  prismatic: "#c67ef2",
  weapon: "#f28a37",
  // ⭐ 更高階寶具（owner 2026-08-17）。⚠️ 兩色都比 `weapon` 更亮更冷，因為它們是
  // 「逆轉用」的卡 —— 玩家要在 0.3 秒內看出「這一張不一樣」，⛔ 不是靠讀標題。
  "weapon:ex-release": "#ff5fa2",
  "weapon:ex-origin": "#8affff",
  // 能力屬性強化 (#260) — a teal that belongs to no augment rarity, because the
  // card is not a rarity roll: all three magnitudes come off the same uniform
  // 0.1–2.0 draw, so tinting it silver/gold would promise a quality it never has.
  [ATTR_OFFER_TIER]: "#5fd6c4",
};

/** The accent colour for a tier, falling back to GOLD for an unknown tier. */
export function tierColor(tier: string): string {
  return DRAFT_TIER_COLOR[tier] ?? GOLD;
}

/** Bespoke header labels; unknown tiers render as "<TIER> AUGMENT". */
export const DRAFT_TIER_LABEL: Record<string, string> = {
  weapon: "寶具",
  // ⚠️ 這兩行是**顯示**用的第二份文字（權威那一份是 `config.arena-rules@1`
  // 的 `weaponTiers[].label`）。刻意如此：那一份要跟著網路過來，而卡片在快照
  // 到達之前就要畫。⛔ 但 id 對不上時這裡會靜靜退回「WEAPON:XXX AUGMENT」，
  // 所以 operator 新增一階的當天要補一行 —— ⚠️ 這條覆蓋目前**尚無守衛**
  // （GH#706；draftCardStyle.test.ts 只釘既有階級的字面值，不從 config 推導）。
  "weapon:ex-release": "寶具 · EX解放",
  "weapon:ex-origin": "寶具 · EX∅ 根源",
  [ATTR_OFFER_TIER]: "能力屬性強化 · 力／敏／智",
};

/**
 * 這張卡的階級標頭。
 *
 * ⭐ 三個增益階級走 Fate Rank（owner 2026-08-16，`docs/聖杯願望三選一-設計規則.md` §3）：
 * `silver/gold/prismatic` → **C級／A級／EX級願望**。
 * ⛔ 後台與 `augment@1` 的 tier **一個字都沒動** —— 這是純顯示層轉換。
 *
 * ⚠️ 順序是刻意的：Fate Rank 先查，查不到才走 {@link DRAFT_TIER_LABEL}。
 *
 * ⭐ owner 2026-08-16 第二則**推翻了第一版的判斷**：「傳說武器這些字眼也都要變得
 * FATE 味，不要講傳說武器道具這種字眼」。⇒ 武器**也** Fate 化，但走**另一套詞**
 * （寶具＋種別＋Rank，見 `fateLexicon.noblePhantasmLabel`），
 * ⛔ 不是跟願望共用「聖杯顯現」—— 規則 §1 的兩層仍然分得開，只是兩層都有味道了。
 * ⚠️ 這裡只放系統名；**種別是逐把不同的**，所以它在卡片上不在標頭上。
 */
export function tierLabel(tier: string): string {
  return fateRankLabel(tier) ?? DRAFT_TIER_LABEL[tier] ?? `${tier.toUpperCase()} AUGMENT`;
}
