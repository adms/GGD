/**
 * marqueeRoster — the pure, testable half of the login ChampionMarquee. Turns a
 * loaded champion roster into the flat list of tiles the strip renders.
 *
 *   1. NON-SELECTABLE forms are excluded. Alt/transform bodies (tagged
 *      "transform-form") are not pickable heroes, so they never appear in the
 *      showcase — the marquee mirrors what a player can actually choose.
 *      Test/placeholder heroes (測試英雄) are excluded for the same reason.
 *   2. ONE TILE PER CHARACTER, decided by the SHARED IDENTITY RULE
 *      (`@ggd/shared/content` → championIdentity). See below.
 *   3. NO VISIBLY DUPLICATE PORTRAITS — a SEPARATE, purely cosmetic pass over a
 *      known content bug. See below.
 *   4. NO-PORTRAIT heroes are excluded. Champions whose w3x portrait is missing
 *      (Blizzard stock art, ~28 of the roster) are dropped entirely — the
 *      showcase only features heroes with a real headshot (per user request);
 *      no name-glyph placeholder chips.
 *   5. SEAMLESS LOOP. The tile list is duplicated `copies` times (default 2) so
 *      a CSS `translateX(-100%/copies)` keyframe wraps with no visible seam; no
 *      per-frame JS. Every copy carries a distinct React `key`.
 *
 * ---------------------------------------------------------------------------
 * TWO CONCERNS THAT USED TO BE ONE (and why that erased 黑化Saber)
 * ---------------------------------------------------------------------------
 * This file used to hand-maintain two exclusion lists: DUPLICATE_ALT_IDS (keyed
 * on the DISPLAY NAME plus the map's random-hero pool) and ICON_DUPLICATE_IDS
 * (keyed on the PORTRAIT PNG's md5). Both answered the question "is this the
 * same hero?" with evidence that cannot answer it, and both were wrong in the
 * same direction — they DELETED characters:
 *
 *   • 80 of 113 champions wear one of four CC0 stand-in meshes because their
 *     WC3 model was a Blizzard built-in; `champ.sela` alone is worn by 18
 *     unrelated heroes. A shared mesh means "art is missing", not "same hero".
 *   • Icon extraction mis-assigned portraits: 12 groups of champions ship
 *     BYTE-IDENTICAL PNGs at different paths (曹操孟德 literally wears 皮卡丘's
 *     portrait). A shared portrait means "the extractor guessed", not "same
 *     hero".
 *   • 英靈-亞瑟王 - 黑化Saber (`godie-e00q`) shares both with 亞瑟王 - Saber, so
 *     it was hidden as a duplicate — even though its kit is hero number **69**
 *     (力量強化 / 黑泥召喚 / 約束與勝利之劍 / 魔力增幅) against Saber's **20**, and
 *     黑泥 (the corrupted Grail mud) exists on no other champion in the map.
 *
 * So the two questions are now answered by two independent layers:
 *
 *   IDENTITY  — "are these the same character?" — belongs to CONTENT, not to a
 *   login banner. `distinctCharacters()` from `@ggd/shared/content` is the one
 *   rule, shared with the curation starter set and pinned by its own policy
 *   suite. It leans lenient (「遇到疑慮一律判斷寬鬆為多英雄」): merging needs
 *   positive evidence, so nothing silently disappears. This file must never
 *   grow a second opinion about it.
 *
 *   PORTRAITS — "would two tiles show the same picture?" — is a pure DISPLAY
 *   concern about a known ICON-ASSIGNMENT BUG, handled by
 *   `SHARED_PORTRAIT_GROUPS` below. It hides a *tile*, never a *champion*: the
 *   hidden ids stay in the roster, in champ select, in curation and in the
 *   whitelist. And a champion whose portrait is re-coloured at render time from
 *   its w3x `tint` is NOT a visual duplicate, so 黑化Saber (tint ≈ 0.29 grey =
 *   a black Saber) shows up again on its own tile.
 *
 * The view keeps a colored fallback chip only as a defensive runtime guard (an
 * icon that 404s at load time), but the roster never intentionally emits one.
 * No React / Babylon imports here → clean node unit test.
 */
import { compareCanonical, distinctCharacters } from "@ggd/shared/content";
import { contentAssetUrl } from "../../content/ContentDb";

/** Minimal champion shape the marquee needs (subset of the registry ChampionDef). */
export interface MarqueeChampion {
  id: string;
  /** Chinese combined 名字-稱號. */
  name: string;
  /** w3x portrait path ("assets/icons/champions/<id>.png") — absent for stock art. */
  icon?: string | null;
  tags?: readonly string[];
  /**
   * IDENTITY EVIDENCE — pass these through from the registry. They are what
   * lets the shared rule tell 黑化Saber (hero 69) from Saber (hero 20). With
   * them missing the rule simply treats every entry as its own character, which
   * is the safe direction (an extra tile, never a missing hero).
   */
  modelKey?: string | null;
  abilities?: Readonly<Record<string, { name?: string } | undefined>>;
  /** Per-champion w3x vertex tint `[r,g,b]` 0..1 — absent = untinted. */
  tint?: readonly number[] | null;
}

/** One rendered strip cell (a real tile OR one of its seamless-loop copies). */
export interface MarqueeTile {
  /** unique per DOM node (`<id>#<copy>`) so React keys never collide across copies. */
  key: string;
  id: string;
  name: string;
  /** resolved portrait URL, or null → the view renders the fallback chip. */
  iconUrl: string | null;
  /** first glyph of the name, drawn on the fallback chip. */
  initial: string;
  /** deterministic 0–359 hue so a champion's fallback chip color is stable. */
  hue: number;
  /**
   * `rgb(...)` for a multiply-blend overlay over the portrait, or null when the
   * champion is untinted. This is the champion's own w3x colour (task #49's
   * `tint`), the same one the 3D model is painted with — so 黑化Saber's tile
   * reads as the black Saber it is instead of an identical copy of Saber's.
   */
  tintCss: string | null;
}

/** Tags marking a body that is NOT a pickable hero (alt/transform form). */
const NON_SELECTABLE_TAGS: ReadonlySet<string> = new Set(["transform-form"]);

/**
 * PORTRAIT COLLISIONS — groups of champion ids that ship the SAME PNG BYTES at
 * different paths, because w3x icon extraction resolved several heroes to one
 * shared BLP. **This is a content bug (see docs/todo/champion-identity.md), not
 * an identity claim**: every id below is a real, playable, distinct champion,
 * and every one of them stays in the roster/whitelist/champ-select. The list
 * only stops the login strip from showing the same picture twice.
 *
 * Membership is DERIVED, not judged: ChampionMarquee.test.ts md5-hashes
 * content/assets/icons/champions/*.png over the live roster and asserts this
 * table equals what is on disk — so fixing an icon shrinks the table (the test
 * fails until it does) and no entry can quietly outlive the bug it describes.
 * Order does not matter: the tile that survives is chosen by the SHARED
 * `compareCanonical` ranking, never by hand.
 */
export const SHARED_PORTRAIT_GROUPS: readonly (readonly string[])[] = [
  ["godie-u011", "godie-u012"], // 克勞薩先生 / 克勞薩II世
  ["godie-n00p", "godie-nsjs"], // 妖狐藏馬 - 南野秀一 (also one character)
  ["godie-u01q", "godie-u01u", "godie-udre"], // 索隆 (incl. the test hero)
  ["godie-o00x", "godie-ogrh"], // 悟空
  ["godie-u010", "godie-uvng"], // 邪眼師 - 飛影
  ["godie-o00l", "godie-o02s"], // 傑洛士 ⇢ 涼宮八ㄦ匕 borrowed the icon
  ["godie-n01c", "godie-nbbc"], // 勇者小呆
  ["godie-e001", "godie-e00n"], // 龍宮禮奈
  ["godie-h01n", "godie-h01o"], // 黑崎一護
  ["godie-emfr", "godie-h022"], // 涅吉 (魔法老師 / 白色之翼)
  ["godie-n003", "godie-n01g"], // 依文潔琳
  ["godie-e007", "godie-ewar"], // 天地志狼
  ["godie-u00l", "godie-umal"], // 拳四郎 ×2 (distinct skins, one portrait)
  ["godie-e002", "godie-e00l", "godie-e00q"], // Saber ×2 + 黑化Saber (tint saves it)
  ["godie-o02l", "godie-o02o", "godie-ofar"], // 皮卡丘 ×2 + 曹操 wearing its icon
  ["godie-u00n", "godie-u00o"], // 魯夫
  ["godie-o01z", "godie-o02v"], // 高町奈葉
  ["godie-h020", "godie-hjai"], // 莉娜因巴斯
  ["godie-e00j", "godie-e015", "godie-harf"], // 皇者 + 金居福/鄭先生 borrowed it
  ["godie-h02y", "godie-o02p"], // 初音 ⇢ 志志雄 borrowed the icon
  ["godie-e00w", "godie-e00x"], // 櫻綻剎那
  ["godie-e00k", "godie-e00z"], // 安云
  ["godie-h021", "godie-hblm"], // 賈修貝爾 ⇢ 阿強一號 borrowed the icon
];

/**
 * How far two tints must diverge (max |Δ| on any channel, 0..1) before the same
 * portrait bitmap reads as two different pictures. 0.25 is a clearly visible
 * brightness step: it keeps 黑化Saber (0.29 vs Saber's implicit 1.0) while
 * still folding 拳四郎's two entries (1.0 vs 0.78) and 克勞薩's (identical).
 */
const TINT_VISIBLE_DELTA = 0.25;

const WHITE: readonly number[] = [1, 1, 1];
const tintOf = (c: MarqueeChampion): readonly number[] =>
  c.tint && c.tint.length === 3 ? c.tint : WHITE;

/** True when `c` would visibly differ from `other` despite the shared bitmap. */
function tintLooksDifferent(c: MarqueeChampion, other: MarqueeChampion): boolean {
  const a = tintOf(c);
  const b = tintOf(other);
  return [0, 1, 2].some((i) => Math.abs((a[i] ?? 1) - (b[i] ?? 1)) >= TINT_VISIBLE_DELTA);
}

/** `rgb(...)` multiply overlay for a tinted champion, else null (no overlay). */
export function tintCssOf(c: MarqueeChampion): string | null {
  const t = tintOf(c);
  if (t === WHITE) return null;
  const ch = (v: number | undefined): number => Math.round(Math.min(1, Math.max(0, v ?? 1)) * 255);
  if (ch(t[0]) === 255 && ch(t[1]) === 255 && ch(t[2]) === 255) return null;
  return `rgb(${ch(t[0])}, ${ch(t[1])}, ${ch(t[2])})`;
}

/** Test/placeholder heroes (e.g. 測試英雄) never belong in the showcase. Matches
 * real test markers only — NOT names that merely contain 假 (e.g. 瘋狂假面). */
const TEST_NAME_RE = /測試|範例|範本|placeholder|(?:^|[^A-Za-z])test(?:[^A-Za-z]|$)/i;

/** True when the name marks a test/placeholder hero, not a real one. */
export function isTestHero(name: string): boolean {
  return TEST_NAME_RE.test(name);
}

/**
 * True unless the champion is a transform form or a test hero.
 *
 * NOTE this is deliberately a PER-CHAMPION question only. "Is this a duplicate
 * of some other entry?" cannot be answered one champion at a time — that is
 * what `distinctCharacters()` does over the whole roster, and it is why the old
 * id blocklists lived here and got it wrong.
 */
export function isSelectableChampion(c: MarqueeChampion): boolean {
  if ((c.tags ?? []).some((t) => NON_SELECTABLE_TAGS.has(t))) return false;
  if (isTestHero(c.name)) return false;
  return true;
}

/**
 * Drop tiles that would render the SAME PICTURE as an earlier tile: within each
 * `SHARED_PORTRAIT_GROUPS` entry only the `compareCanonical`-best champion is
 * shown, unless a member's `tint` re-colours the shared bitmap enough to read
 * as a different portrait. Champions outside every group pass through
 * untouched. Purely cosmetic — no champion is removed from anything but this
 * strip.
 */
export function withoutDuplicatePortraits<T extends MarqueeChampion>(
  champions: readonly T[],
): T[] {
  const present = new Map(champions.map((c) => [c.id, c]));
  const hidden = new Set<string>();
  for (const group of SHARED_PORTRAIT_GROUPS) {
    const members = group.map((id) => present.get(id)).filter((c): c is T => c !== undefined);
    if (members.length < 2) continue;
    const [shown, ...rest] = [...members].sort(compareCanonical);
    if (!shown) continue;
    for (const other of rest) {
      if (!tintLooksDifferent(other, shown)) hidden.add(other.id);
    }
  }
  return champions.filter((c) => !hidden.has(c.id));
}

/** Stable hue (0–359) hashed from the id — keeps a fallback chip's color fixed. */
export function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** First user-perceived glyph of a name (code-point aware), or "?" when empty. */
export function firstGlyph(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") return "?";
  return [...trimmed][0] ?? "?";
}

/** Build one tile for a champion; `copy` disambiguates the seamless duplicates. */
export function toTile(c: MarqueeChampion, copy: number): MarqueeTile {
  return {
    key: `${c.id}#${copy}`,
    id: c.id,
    name: c.name,
    iconUrl: contentAssetUrl(c.icon),
    initial: firstGlyph(c.name),
    hue: hueFromId(c.id),
    tintCss: tintCssOf(c),
  };
}

export interface BuildMarqueeOptions {
  /**
   * How many back-to-back copies of the roster to emit. Must be ≥ 2 for the
   * seamless CSS loop (the keyframe shifts by one copy width). Default 2.
   */
  copies?: number;
}

/**
 * Roster → the flat, duplicated tile list the marquee renders, in four ordered
 * passes: selectable → ONE ENTRY PER CHARACTER (shared identity rule) → has a
 * real portrait → no visibly duplicate portrait. Empty roster → empty list (the
 * component then renders nothing rather than an empty band).
 */
export function buildMarqueeTiles(
  champions: readonly MarqueeChampion[],
  opts: BuildMarqueeOptions = {},
): MarqueeTile[] {
  const copies = Math.max(2, Math.floor(opts.copies ?? 2));
  const selectable = champions.filter(isSelectableChampion);
  // IDENTITY first, and only via the shared rule — see the header. Runs before
  // the portrait pass so "same character" is decided on the kit, never on which
  // PNG the extractor happened to hand out.
  const distinct = distinctCharacters(selectable);
  // No-portrait heroes are dropped so the showcase is all headshots (no
  // name-glyph placeholder chips).
  const withPortrait = distinct.filter((c) => contentAssetUrl(c.icon) !== null);
  const featured = withoutDuplicatePortraits(withPortrait);
  if (featured.length === 0) return [];
  const out: MarqueeTile[] = [];
  for (let copy = 0; copy < copies; copy++) {
    for (const c of featured) out.push(toTile(c, copy));
  }
  return out;
}
