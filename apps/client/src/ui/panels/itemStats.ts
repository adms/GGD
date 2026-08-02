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
import {
  itemRequirementLabels,
  requirementShortLabel,
  type ClassRequirement,
} from "@ggd/shared/sim/content/requirement";
import { hookConditionLabels, type EffectCondition } from "@ggd/shared/sim/content/condition";
import { ATTR_KEYS, ATTR_LABEL } from "@ggd/shared/sim/stats/attributes";
import { STAT_META, statMeta } from "./statDisplay";

// ---------------------------------------------------------------------------
// player-readable name — NEVER the raw id (task #202)
// ---------------------------------------------------------------------------

/**
 * Shown in place of an item id whenever a registry lookup misses. The owner's
 * complaint 「購買不是顯示描述而是 ID」 was every shop surface doing
 * `def?.name ?? itemId`: on a `tryGet` miss (client/server content divergence,
 * a renamed/overlay item, an unregistered id like `legendary-attunement`) the
 * fallback rendered the raw "godie-i0xx" string as user-facing text. A neutral
 * placeholder is the honest answer — the player never reads a machine id.
 */
export const UNKNOWN_ITEM_LABEL = "未知道具";

/**
 * A player-readable name for an item, given whatever the (possibly-missing)
 * registry def carries plus the id that was looked up. Returns the def's name
 * when it is present AND is a real name — never the id. Two ways it degrades to
 * {@link UNKNOWN_ITEM_LABEL}, and both are id-leaks this closes:
 *   - the def is missing (`tryGet` miss) → `name` is empty/undefined;
 *   - the def IS the id (a craftRole "component" whose importer left name==id,
 *     never meant for the shelf but reachable if ever equipped).
 * The id is used ONLY to detect the name==id case; it is never returned.
 */
export function itemDisplayName(name: string | null | undefined, id: string): string {
  const n = (name ?? "").trim();
  if (n.length > 0 && n !== id) return n;
  return UNKNOWN_ITEM_LABEL;
}

// ---------------------------------------------------------------------------
// merge + format authored modifiers
// ---------------------------------------------------------------------------

export interface MergedMod {
  stat: Stat;
  op: ModOp;
  value: number;
  /**
   * 職業限定閘 carried by the entries that were merged into this one. Present
   * only when the modifier is gated; the chip renders it in parentheses.
   */
  requires?: ClassRequirement;
}

/** A stat modifier as an ITEM may author it — with the optional carrier gate. */
export interface RowStatModifier extends StatModifier {
  readonly requires?: ClassRequirement;
}

/**
 * Merge key for a requirement. Two entries may only be SUMMED when they are
 * gated identically — 貫雷槍's `range +4 (melee)` and `range +2 (ranged)` share
 * `stat|op` and summing them to 「攻擊距離 +6」 would print a number no champion
 * in the game ever receives (失敗形態 ④: the card reads plausible and is wrong).
 * Field order is fixed here rather than taken from `JSON.stringify`, whose key
 * order follows insertion and would split one gate into two chips.
 */
function requiresKey(r: ClassRequirement | undefined): string {
  if (r === undefined) return "";
  return `${r.attackType ?? ""}/${r.primaryStat ?? ""}/${r.onMismatch ?? ""}/${r.mismatchScale ?? ""}`;
}

const STAT_ORDER: Readonly<Record<string, number>> = Object.fromEntries(
  STAT_META.map((m, i) => [m.stat, i]),
);

/**
 * Sum modifiers that share a (stat, op) and return them in the fixed panel
 * order. Stable and total: an unknown stat sorts to the end rather than
 * throwing, so a future stat never crashes the shop.
 *
 * ⚠️ `capRaise` IS THE ONE EXCEPTION, and it takes MAX (GH#286). Its value is a
 * ceiling to lift the stat TO, not an amount to grant, and `sim/statPipeline.ts`
 * folds multiple raises with `max`. Summing here would print 「上限 12」 on a
 * card whose two `capRaise 5 / 7` sources give the player 7 — two numbers that
 * both look reasonable, with nothing broken to notice (#125).
 */
export function mergeItemModifiers(mods: readonly RowStatModifier[] | undefined): MergedMod[] {
  if (!mods || mods.length === 0) return [];
  const acc = new Map<string, MergedMod>();
  for (const m of mods) {
    // 職業限定閘 IS PART OF THE KEY — see `requiresKey`.
    const key = `${m.stat}|${m.op}|${requiresKey(m.requires)}`;
    const cur = acc.get(key);
    if (cur) cur.value = m.op === ModOp.CapRaise ? Math.max(cur.value, m.value) : cur.value + m.value;
    else
      acc.set(key, {
        stat: m.stat as Stat,
        op: m.op,
        value: m.value,
        ...(m.requires !== undefined ? { requires: m.requires } : {}),
      });
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

/**
 * A labelled authored bonus chip: "攻擊力 +28.8", "吸血 +36%".
 *
 * ⚠️ `capRaise` is NOT a bonus and must never wear a `+` (GH#286). It grants
 * ZERO of the stat — it only moves that stat's ceiling — so 「攻擊速度 +10」 is
 * a number the buyer can never reconcile with his own sheet (his attack speed
 * may still read 0.7). The chip says what the modifier actually does.
 */
export function formatAuthoredBonus(m: MergedMod): string {
  const label = statMeta(m.stat)?.label ?? m.stat;
  // 職業限定閘, appended to the CHIP rather than to the card's ✦ line. A gated
  // modifier is 「這一條給誰」, not 「這件武器給誰」 — 貫雷槍 gives everybody
  // something — so the answer has to sit on the row it qualifies. Derived from
  // the same object the sim gates on (never typed into the prose), so changing
  // the gate changes the chip.
  const gate = requirementShortLabel(m.requires);
  const suffix = gate === null ? "" : `（${gate}）`;
  if (m.op === ModOp.CapRaise) {
    return `${label} 上限解鎖 ${authoredMagnitude(m.stat, m.op, m.value)}${suffix}`;
  }
  const sign = m.value < 0 ? "−" : "+";
  return `${label} ${sign}${authoredMagnitude(m.stat, m.op, m.value)}${suffix}`;
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
  readonly modifiers?: readonly RowStatModifier[];
  /**
   * Item passives. Two INDEPENDENT gates ride here and both are read structurally
   * (never by re-typing their prose): `requires` = 職業限定閘 「誰能用」,
   * `condition` = 觸發條件 「什麼時候發動」.
   */
  readonly passive?: readonly {
    requires?: ClassRequirement;
    condition?: EffectCondition;
  }[];
  /** 光環 payloads — their hooks carry both gates too. */
  readonly auras?: readonly {
    hooks?: readonly { requires?: ClassRequirement; condition?: EffectCondition }[];
  }[];
  /**
   * 三圍加成 (`ItemDef.attributes`) — 四魂之玉 「力敏智+30」, 朗基努斯之槍
   * 「力量+12 敏捷+12」.
   *
   * ⚠️ WITHOUT THIS THE GRANT IS INVISIBLE, which is failure shape ② with the
   * layers reversed: the sim pays it, and no surface says so. {@link ATTR}
   * lists 力量/敏捷/智慧 among the stat-CLAIM keywords, so
   * `isStatClaimLine` STRIPS 「力量+12」 out of the ✦ effect line on the
   * assumption that a chip is carrying it. Before this field there was no such
   * chip and no modifier to build one from — 三圍 are not `Stat` members — so
   * 朗基努斯之槍's two best lines were deleted from every tooltip in the game.
   */
  readonly attributes?: Readonly<Partial<Record<"str" | "agi" | "int", number>>>;
  readonly description?: string;
}

/**
 * 「力量 +12」「敏捷 +12」 chips for an item's {@link RowItem.attributes}.
 *
 * Reads `ATTR_KEYS` / `ATTR_LABEL` from the shared attribute model rather than
 * re-typing 力量/敏捷/智慧 here, so the shop's 三圍 rows, the 能力屬性強化 card
 * and this chip cannot disagree about which is which. A zero or absent entry
 * produces no chip: 朗基努斯之槍 grants no 智慧 and must not advertise 「智慧 +0」.
 */
export function attributeChips(
  attrs: RowItem["attributes"] | undefined,
): string[] {
  if (!attrs) return [];
  const out: string[] = [];
  for (const k of ATTR_KEYS) {
    const v = attrs[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v === 0) continue;
    out.push(`${ATTR_LABEL[k]} ${v < 0 ? "−" : "+"}${trimZeros(Math.abs(v).toFixed(1))}`);
  }
  return out;
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
  /**
   * 職業限定閘的條件文字 (owner 2026-07-30 的四類傳說武器), DERIVED from the
   * same `requires` objects `effects/hooks.ts` gates on — never typed into a
   * description by hand, so the sentence cannot drift away from the rule.
   *
   * WHY IT IS ALSO FOLDED INTO `effect` BELOW. This array exists so a surface
   * can render a BADGE, but the badge is opt-in per surface and `buildItemRow`
   * feeds four of them (shop shelf, 三選一 card, equipment tooltip, 戰場情報).
   * A player who is shown a legendary he cannot use, with no stated reason, is
   * worse off than one who never saw it — so the condition also rides the `✦`
   * line every one of those surfaces ALREADY prints. Adding a surface later
   * cannot silently drop it.
   */
  requirements: string[];
  /** merged modifiers, for callers that want the raw numbers (tests / panel). */
  merged: MergedMod[];
  /**
   * owner 手寫的**原文**, 一個字都沒動 —— 給 `<ItemCardBody>` 在渲染時解析
   * (owner 2026-08-02「卡片道具的排版連在一起不好閱讀」)。
   *
   * ⚠️ 它與上面的 `effect` / `claims` / `lore` **不是**同一件事, 而且 NOT 可以互相
   * 取代:那三個是這個檔案為了做出「一行摘要」而**拆過、過濾過、用 ` · ` 接過**的
   * 產物,正是 owner 抱怨的那個排版。這一格是未經處理的來源,讓卡片自己決定怎麼
   * 分行上色。兩者並存是刻意的 —— 貨架的壓縮列仍然需要那一行摘要。
   */
  description: string | null;
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
  // 三圍 chips FIRST — a primary attribute outranks a derived stat in what it
  // tells the buyer (one point of 力量 is health AND regen AND attack damage),
  // and 力/敏/智 is the order every 三圍 surface iterates in (`ATTR_KEYS`).
  // They are NEVER the anchor: no shelf anchors on an attribute, and an
  // attribute has no `Stat` to compare against if one did.
  const secondary: string[] = attributeChips(item.attributes);
  for (const m of merged) {
    if (anchorStat !== null && m.stat === anchorStat && m.op === ModOp.Flat) {
      // flat contribution to the anchor stat → the anchor column
      anchorText = authoredMagnitude(m.stat, m.op, m.value);
      continue;
    }
    secondary.push(formatAuthoredBonus(m));
  }

  // 職業限定閘 FIRST in the ✦ line: 「這件我用不用得到」 is the question a
  // player must answer BEFORE reading what it does.
  //
  // 觸發條件 comes SECOND, and it is a different question — 「我用得到，那它什麼
  // 時候會發動」 — derived by `hookConditionLabels` from the very same
  // `condition` objects `effects/hooks.ts` gates on (see sim/content/
  // condition.ts). Ordering them 誰能用 → 何時發動 → 做什麼 is the order the
  // player actually needs them in, and none of the three is typed by hand.
  const requirements = itemRequirementLabels(item);
  const conditions = hookConditionLabels(item);
  const mechanics = effectLine(parsed.efficacy);
  const gates = [...requirements, ...conditions];
  const effect =
    gates.length > 0
      ? [...gates, ...(mechanics === null ? [] : [mechanics])].join(" · ")
      : mechanics;

  return {
    rarity: parsed.rarity,
    anchorText,
    secondary,
    effect,
    lore: parsed.lore,
    claims: parsed.efficacy.filter(isStatClaimLine),
    requirements,
    merged,
    description: item.description ?? null,
  };
}
