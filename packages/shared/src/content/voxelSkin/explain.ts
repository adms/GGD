/**
 * voxelSkin/explain — WHY a champion came out that colour (task #231).
 *
 * ── THE REQUIREMENT THIS ANSWERS ────────────────────────────────────────────
 * #231's rule was "derive a palette rather than picking colours by hand for
 * 100+ champions, AND make the derivation inspectable so the owner can see WHY
 * a character came out that colour." The generator shipped the first half: a
 * four-layer chain (authored override → keyword rule → ability element band →
 * hash) that produces 114 distinct looks from the docs' own words. The second
 * half did not ship. `generateVoxelSkin` had a `trace` option, but it was an
 * internal opt-in that returned the raw haystack and the raw rule hits, the
 * `SkinRow` the contact sheet renders did not carry it, and no page showed it.
 *
 * So the sheet could show a champion IS teal and could not say why. For a
 * generator the owner is asked to APPROVE, that is the difference between a
 * review and a shrug — and it is why 「為什麼是這個顏色」 is the question this
 * module exists to answer, per axis, in his own language.
 *
 * ── WHAT IT IS, AND WHAT IT DELIBERATELY IS NOT ─────────────────────────────
 * `explainVoxelSkin` RE-RUNS the real generator and reports which of the four
 * layers decided each axis, plus the evidence that layer used: the literal word
 * that fired a rule, the ability `vfxKey` the element band came from, the salt
 * a collision forced. It computes NOTHING the generator does not; if it and
 * `generateVoxelSkin` ever disagreed about a value, the explanation would be a
 * plausible story about a different character. `explain.test.ts` therefore
 * asserts, for every champion on the live roster, that every explained value
 * equals the value actually present in the recipe.
 *
 * It is also NOT authority: nothing in the game reads it, and an axis nobody
 * can explain still renders. This is a lens, not a gate.
 */
import { generateVoxelSkin, haystackOf, type VoxelSkinTrace } from "./generate";
import { ELEMENT_BANDS, elementOf, hsvToRgb, toHex } from "./palette";
import type { RuleHit } from "./rules";
import { SKIN_TONES, type VoxelSkinInput, type VoxelSkinOverride, type VoxelSkinRecipe } from "./types";

/** The chrome skin hex, read from the ladder rather than re-typed. */
const CHROME_HEX = toHex(
  (SKIN_TONES.find((t) => t[0] === "chrome") ?? SKIN_TONES[0]!)[1] as [number, number, number],
);

/**
 * The four layers, highest precedence first. Spelled as a union rather than a
 * number so a rendered badge cannot silently mean the wrong tier.
 */
export type SkinLayer = "L1-override" | "L2-keyword" | "L3-element" | "L4-hash";

export const LAYER_LABEL: Readonly<Record<SkinLayer, string>> = Object.freeze({
  "L1-override": "手動指定",
  "L2-keyword": "關鍵字規則",
  "L3-element": "技能元素",
  "L4-hash": "雜湊",
});

/** Slot ordering shown on the page: identity first, trim last. */
export const EXPLAINED_AXES = Object.freeze([
  "palette.outfitPrimary",
  "palette.outfitSecondary",
  "palette.skin",
  "palette.hair",
  "palette.metal",
  "palette.eye",
  "palette.accent",
  "face.eye",
  "face.mouth",
  "face.mark",
  "hair.style",
  "outfit.top",
  "outfit.legs",
  "outfit.emblem",
  "motifs.head",
  "motifs.shoulder",
  "motifs.back",
] as const);

export type ExplainedAxis = (typeof EXPLAINED_AXES)[number];

export interface AxisExplanation {
  axis: ExplainedAxis;
  /** human label for the axis, in the owner's language */
  label: string;
  /** the value that really ended up in the recipe */
  value: string;
  layer: SkinLayer;
  /** one sentence: what decided it */
  reason: string;
  /**
   * The champion's own text / key that drove it, when the layer had one. `null`
   * for a pure hash draw — and saying "nothing, it is the id's hash" out loud
   * is more useful than inventing a rationalisation.
   */
  evidence: string | null;
}

export interface SkinExplanation {
  championId: string;
  /** the exact string the keyword table was matched against */
  haystack: string;
  /** rules that fired, in table order */
  hits: readonly RuleHit[];
  /** dominant / secondary ability element, and the vfxKeys they came from */
  element: string;
  elementSecondary: string;
  elementSources: readonly { vfxKey: string; element: string }[];
  /** the band's base colour, so the drift the jitter added is visible */
  elementBandHex: string;
  /** >1 means a look-signature collision forced a re-roll */
  salt: number;
  /** which axes an L1 override claimed */
  overriddenAxes: readonly ExplainedAxis[];
  axes: readonly AxisExplanation[];
}

const AXIS_LABEL: Readonly<Record<ExplainedAxis, string>> = Object.freeze({
  "palette.outfitPrimary": "服裝主色",
  "palette.outfitSecondary": "服裝副色",
  "palette.skin": "膚色",
  "palette.hair": "髮色",
  "palette.metal": "金屬色",
  "palette.eye": "眼睛",
  "palette.accent": "點綴色",
  "face.eye": "眼型",
  "face.mouth": "嘴型",
  "face.mark": "臉部標記",
  "hair.style": "髮型",
  "outfit.top": "上衣",
  "outfit.legs": "下身",
  "outfit.emblem": "紋章",
  "motifs.head": "頭部配件",
  "motifs.shoulder": "肩部配件",
  "motifs.back": "背部配件",
});

/** Read an `a.b` path out of a recipe as a string. */
function axisValue(r: VoxelSkinRecipe, axis: ExplainedAxis): string {
  const [group, key] = axis.split(".") as [string, string];
  const g = (r as unknown as Record<string, Record<string, unknown>>)[group];
  return String(g?.[key] ?? "");
}

/** Which recipe axis each L2 rule axis lands on. */
const RULE_AXIS_TO_EXPLAINED: Readonly<Record<string, ExplainedAxis>> = Object.freeze({
  skin: "palette.skin",
  top: "outfit.top",
  legs: "outfit.legs",
  eye: "face.eye",
  mouth: "face.mouth",
  head: "motifs.head",
  shoulder: "motifs.shoulder",
  back: "motifs.back",
});

/** The axes the element band drives — everything the palette derives from hue. */
const ELEMENT_AXES: readonly ExplainedAxis[] = Object.freeze([
  "palette.outfitPrimary",
  "palette.outfitSecondary",
  "palette.eye",
  "palette.accent",
]);

/** Which override keys touch which axes. */
function overriddenAxesOf(ov: VoxelSkinOverride | null | undefined): ExplainedAxis[] {
  if (!ov) return [];
  const out: ExplainedAxis[] = [];
  for (const k of Object.keys(ov.palette ?? {})) {
    const axis = `palette.${k}` as ExplainedAxis;
    if ((EXPLAINED_AXES as readonly string[]).includes(axis)) out.push(axis);
  }
  for (const [group, obj] of [
    ["face", ov.face],
    ["hair", ov.hair],
    ["outfit", ov.outfit],
    ["motifs", ov.motifs],
  ] as const) {
    for (const k of Object.keys(obj ?? {})) {
      const axis = `${group}.${k}` as ExplainedAxis;
      if ((EXPLAINED_AXES as readonly string[]).includes(axis)) out.push(axis);
    }
  }
  return out;
}

/**
 * Explain one champion's generated look.
 *
 * `salt` must be the salt the ROSTER run settled on (`generateAllVoxelSkins`
 * escalates on a signature collision), or the explanation would describe the
 * champion's first attempt rather than the look that shipped.
 */
export function explainVoxelSkin(
  input: VoxelSkinInput,
  opts: { salt?: number; override?: VoxelSkinOverride | null } = {},
): SkinExplanation {
  const trace: { out?: VoxelSkinTrace } = {};
  const salt = opts.salt ?? 1;
  const recipe = generateVoxelSkin(input, { salt, override: opts.override ?? null, trace });
  const haystack = trace.out?.haystack ?? haystackOf(input);
  const hits = trace.out?.hits ?? [];

  const elementSources = (input.vfxKeys ?? [])
    .filter((k): k is string => typeof k === "string" && k.length > 0)
    .map((vfxKey) => ({ vfxKey, element: elementOf(vfxKey) }));

  const band = ELEMENT_BANDS[recipe.element] ?? ELEMENT_BANDS["?"]!;
  const elementBandHex = toHex(hsvToRgb(band.h, band.sat, band.val));

  const overridden = overriddenAxesOf(opts.override);
  const overriddenSet = new Set<string>(overridden);
  const byRuleAxis = new Map<ExplainedAxis, RuleHit>();
  for (const h of hits) {
    const axis = RULE_AXIS_TO_EXPLAINED[h.axis];
    if (axis) byRuleAxis.set(axis, h);
  }

  const axes: AxisExplanation[] = EXPLAINED_AXES.map((axis) => {
    const value = axisValue(recipe, axis);
    const label = AXIS_LABEL[axis];
    if (overriddenSet.has(axis)) {
      return {
        axis,
        label,
        value,
        layer: "L1-override" as const,
        reason: "_voxel-skins.json 手動指定，蓋過所有自動推導",
        evidence: "content/models/_voxel-skins.json",
      };
    }
    const hit = byRuleAxis.get(axis);
    if (hit) {
      return {
        axis,
        label,
        value,
        layer: "L2-keyword" as const,
        reason: `關鍵字規則：${hit.why}`,
        evidence: `「${hit.match}」`,
      };
    }
    if (ELEMENT_AXES.includes(axis)) {
      const src = elementSources.find((s) => s.element === recipe.element);
      return {
        axis,
        label,
        value,
        layer: "L3-element" as const,
        reason: `技能元素 ${recipe.element} 的色帶 ${elementBandHex}，再依 id 抖動色相/明度`,
        evidence: src ? src.vfxKey : `無技能特效可判讀，落在預設色帶 ${recipe.element}`,
      };
    }
    // metal has a tag-driven special case inside the generator; say so rather
    // than calling it a hash draw, which would be a small lie in the one place
    // an owner is most likely to check.
    if (axis === "palette.metal") {
      const tags = (input.tags ?? []).join(" ");
      const gun = /\bgun\b/.test(tags);
      const blade = /katana|sword|greatsword/.test(tags);
      if (gun || blade) {
        return {
          axis,
          label,
          value,
          layer: "L2-keyword" as const,
          reason: gun ? "武器標籤是槍械 — 槍鐵色" : "武器標籤是刀劍 — 鋼色",
          evidence: gun ? "tag: gun" : "tag: katana/sword",
        };
      }
    }
    if (axis === "hair.style" && recipe.palette.skin === CHROME_HEX) {
      // chrome bodies are forced bald before the hash gets a say
      return {
        axis,
        label,
        value,
        layer: "L2-keyword" as const,
        reason: "機械材質的角色一律光頭（有瀏海的鉻合金看起來像人穿戲服）",
        evidence: "skin=chrome",
      };
    }
    return {
      axis,
      label,
      value,
      layer: "L4-hash" as const,
      reason:
        salt > 1
          ? `id 雜湊抽選（salt ${salt} — 第一次抽到的外觀和別人撞了，往上加鹽重抽）`
          : "id 雜湊抽選：這條軸沒有任何規則或元素可依據，由 championId 決定",
      evidence: null,
    };
  });

  return {
    championId: recipe.championId,
    haystack,
    hits,
    element: recipe.element,
    elementSecondary: recipe.elementSecondary,
    elementSources,
    elementBandHex,
    salt: recipe.salt,
    overriddenAxes: overridden,
    axes,
  };
}

/** One-line summary for a table cell: the layers that actually did the work. */
export function explanationSummary(ex: SkinExplanation): string {
  const counts = new Map<SkinLayer, number>();
  for (const a of ex.axes) counts.set(a.layer, (counts.get(a.layer) ?? 0) + 1);
  const order: SkinLayer[] = ["L1-override", "L2-keyword", "L3-element", "L4-hash"];
  return order
    .filter((l) => (counts.get(l) ?? 0) > 0)
    .map((l) => `${LAYER_LABEL[l]} ${counts.get(l)}`)
    .join(" · ");
}
