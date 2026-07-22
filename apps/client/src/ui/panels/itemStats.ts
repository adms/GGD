/**
 * itemStats — the AUTHORED read of an item: what the item IS, formatted stably
 * so the same item reads identically on every row, in every session, before and
 * after any purchase. This is the half of #106 that must NOT go through the
 * pipeline: 17 live items carry `as pctAdd` and 11 carry `manaRegen pctAdd`, and
 * if the catalogue printed RESOLVED percentages every row would silently
 * renumber itself after each buy. The pipeline-resolved read lives in
 * statPreview.ts and appears only in the stat panel ("what it does for ME").
 *
 * Three transforms, all pure and all tested:
 *
 *   1. MERGE duplicate modifiers first. 13 catalogue items list a stat twice and
 *      #83 ships 4 with fully doubled arrays; the pipeline SUMS them, so the row
 *      must print the sum (丈八蛇矛 `ad 18 + ad 10.8` → `攻擊力 +28.8`), never
 *      the authoring artefact.
 *   2. FORMAT each bonus by the stat's nature — a `flat 0.36` on 吸血 reads
 *      `+36%`, a `pctAdd 0.154` on 攻速 reads `+15.4%`, a `flat 237` on 生命
 *      reads `+237`. Reuses statDisplay so the row and the panel never disagree
 *      on how a given stat is written.
 *   3. STRIP the stat-claim lines out of the WC3 `效能` block, because those
 *      numbers (a) duplicate the modifier chips and (b) frequently DISAGREE with
 *      them (魔戒 says 全能力+12, gives hp39/ad1.9/mana23 — that contradiction is
 *      #108's, not ours to print). What survives is the `✦` effect line: exactly
 *      the mechanical text the stat chips cannot express — 擴散傷害60%,
 *      15%機率造成2倍傷害, 永久隱身, 傳送到同盟, 施展需求魔力：150點.
 */
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { ModOp, type StatModifier } from "@ggd/shared/sim/stats/modifiers";
import { STAT_META, statMeta } from "./statDisplay";

// ---------------------------------------------------------------------------
// merge + format authored modifiers
// ---------------------------------------------------------------------------

export interface MergedMod {
  stat: Stat;
  op: ModOp;
  value: number;
}

const STAT_ORDER: Readonly<Record<string, number>> = Object.fromEntries(
  STAT_META.map((m, i) => [m.stat, i]),
);

/**
 * Sum modifiers that share a (stat, op) and return them in the fixed panel
 * order. Stable and total: an unknown stat sorts to the end rather than
 * throwing, so a future stat never crashes the shop.
 */
export function mergeItemModifiers(mods: readonly StatModifier[] | undefined): MergedMod[] {
  if (!mods || mods.length === 0) return [];
  const acc = new Map<string, MergedMod>();
  for (const m of mods) {
    const key = `${m.stat}|${m.op}`;
    const cur = acc.get(key);
    if (cur) cur.value += m.value;
    else acc.set(key, { stat: m.stat as Stat, op: m.op, value: m.value });
  }
  return [...acc.values()].sort(
    (a, b) => (STAT_ORDER[a.stat] ?? 99) - (STAT_ORDER[b.stat] ?? 99) || a.op.localeCompare(b.op),
  );
}

/** True when a stat is stored 0..1 (or as a multiplier) and reads as a percent. */
function isPercentStat(stat: Stat): boolean {
  const u = statMeta(stat)?.unit;
  return u === "pct" || u === "pctBonus";
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/**
 * The authored magnitude of one merged modifier, WITHOUT a label — "28.8",
 * "15.4%", "36%", "237". A percentage op, or a flat op on a percent-natured
 * stat, both render as a percentage; a flat op on an absolute stat renders in
 * that stat's own precision.
 */
export function authoredMagnitude(stat: Stat, op: ModOp, value: number): string {
  const mag = Math.abs(value);
  if (op === ModOp.PercentAdd || op === ModOp.PercentMult || isPercentStat(stat)) {
    return `${trimZeros((mag * 100).toFixed(1))}%`;
  }
  const unit = statMeta(stat)?.unit ?? "num1";
  if (unit === "int") return String(Math.round(mag));
  if (unit === "num2") return trimZeros(mag.toFixed(2));
  return trimZeros(mag.toFixed(1));
}

/** A labelled authored bonus chip: "攻擊力 +28.8", "吸血 +36%". */
export function formatAuthoredBonus(m: MergedMod): string {
  const sign = m.value < 0 ? "−" : "+";
  return `${statMeta(m.stat)?.label ?? m.stat} ${sign}${authoredMagnitude(m.stat, m.op, m.value)}`;
}

// ---------------------------------------------------------------------------
// description → rarity badge + effect line + lore
// ---------------------------------------------------------------------------

/** Leading kind/rarity words the importer wrote as a bare first line. */
const RARITY_WORDS = new Set([
  "神器",
  "傳說",
  "夢幻",
  "精品",
  "飾品",
  "武器",
  "法器",
  "防具",
  "任務",
  "特殊",
  "積分獎勵",
  "消耗品",
  "普通",
]);

/**
 * Attribute keywords whose "<attr>+<number>" lines are stat CLAIMS — duplicated
 * by (and often contradicting) the modifier chips, so they are stripped from
 * the effect line. Longer names precede their prefixes so the alternation is
 * greedy (生命力 before 生命, 魔力回復速度 before 魔力).
 */
const ATTR =
  "(?:攻擊力|力量|敏捷|智力|智慧|全能力|生命力|生命|魔力回復速度|魔力回復|魔力|裝甲|護甲|魔法抗性|魔抗|攻擊速度|移動速度|爆擊率|爆擊傷害|吸血|法術強度|每秒回復生命|生命回復)";
const STAT_CLAIM_RE = new RegExp(`^${ATTR}\\s*[+＋]\\s*\\d+(?:\\.\\d+)?%?點?$`);

/**
 * A line is a stat claim (strippable) only when the WHOLE line is
 * "<attribute><+><number>". A line that adds mechanical text — an orb tag
 * `吸血25%（法球）`, a proc `15%機率…`, a keyword `永久隱身` — is kept, because
 * that is information the stat chips cannot carry.
 */
export function isStatClaimLine(line: string): boolean {
  return STAT_CLAIM_RE.test(line.trim());
}

export interface ParsedDescription {
  /** the leading 神器 / 傳說 / 武器 … badge word, or null. */
  rarity: string | null;
  /** the 效能 block, line by line (non-empty), rarity + headers removed. */
  efficacy: string[];
  /** the 解說 lore as one dim line, or null. */
  lore: string | null;
}

/**
 * Split a WC3 item description into its rarity badge, its `效能` effect lines,
 * and its `解說` lore. Robust to the three shapes measured in content/items:
 * `效能`+`解說`, rarity+`效能`+`解說`, and `解說`-only.
 */
export function parseItemDescription(desc: string | undefined | null): ParsedDescription {
  const lines = (desc ?? "").split("\n").map((s) => s.trim());
  const nonEmpty = lines.filter((l) => l.length > 0);
  let rarity: string | null = null;
  let start = 0;
  if (nonEmpty.length > 0 && RARITY_WORDS.has(nonEmpty[0]!)) {
    rarity = nonEmpty[0]!;
    start = 1;
  }
  const efficacy: string[] = [];
  const lore: string[] = [];
  let mode: "pre" | "eff" | "lore" = "pre";
  for (let i = start; i < nonEmpty.length; i++) {
    const l = nonEmpty[i]!;
    if (l === "效能") {
      mode = "eff";
      continue;
    }
    if (l === "解說") {
      mode = "lore";
      continue;
    }
    if (mode === "lore") lore.push(l);
    else efficacy.push(l); // "pre" (headerless body) reads as effect text
  }
  return { rarity, efficacy, lore: lore.length > 0 ? lore.join(" ") : null };
}

/**
 * The `✦` effect line: the efficacy block with its stat-claim lines removed,
 * joined with ` · `. null when nothing mechanical survives (a pure stat stick).
 */
export function effectLine(efficacy: readonly string[]): string | null {
  const kept = efficacy.filter((l) => !isStatClaimLine(l));
  return kept.length > 0 ? kept.join(" · ") : null;
}

// ---------------------------------------------------------------------------
// the whole row model
// ---------------------------------------------------------------------------

/** The minimal item shape the row needs (structural, not the full ItemDef). */
export interface RowItem {
  readonly id: string;
  readonly name: string;
  readonly modifiers?: readonly StatModifier[];
  readonly passive?: readonly unknown[];
  readonly description?: string;
}

export interface ItemRow {
  /** rarity/kind badge word, or null. */
  rarity: string | null;
  /** anchor value TEXT for the shelf's anchor stat (bare number), or null. */
  anchorText: string | null;
  /** non-anchor bonus chips, canonical order, formatted + merged. */
  secondary: string[];
  /** the ✦ effect line, or null. */
  effect: string | null;
  /** the 解說 lore (expanded row only), or null. */
  lore: string | null;
  /**
   * The 效能 stat-claim lines that were STRIPPED from the effect line — the WC3
   * 原文 numbers that frequently disagree with the modifiers (#108). Shown only
   * in the expanded row, clearly labelled as non-authoritative. Same classifier
   * as `effectLine`, so the two can never disagree about what a claim is.
   */
  claims: string[];
  /** merged modifiers, for callers that want the raw numbers (tests / panel). */
  merged: MergedMod[];
}

/**
 * Build the row model for one item against a shelf's anchor stat. The anchor
 * stat is lifted OUT of the secondary chips and shown once in the anchor column;
 * only its FLAT contribution counts (anchors are ad/ap/maxHealth/ms, all flat in
 * the catalogue), so a stray percentage on an anchor stat still shows as a chip.
 */
export function buildItemRow(item: RowItem, anchorStat: Stat | null): ItemRow {
  const merged = mergeItemModifiers(item.modifiers);
  const parsed = parseItemDescription(item.description);

  let anchorText: string | null = null;
  const secondary: string[] = [];
  for (const m of merged) {
    if (anchorStat !== null && m.stat === anchorStat && m.op === ModOp.Flat) {
      // flat contribution to the anchor stat → the anchor column
      anchorText = authoredMagnitude(m.stat, m.op, m.value);
      continue;
    }
    secondary.push(formatAuthoredBonus(m));
  }

  return {
    rarity: parsed.rarity,
    anchorText,
    secondary,
    effect: effectLine(parsed.efficacy),
    lore: parsed.lore,
    claims: parsed.efficacy.filter(isStatClaimLine),
    merged,
  };
}
