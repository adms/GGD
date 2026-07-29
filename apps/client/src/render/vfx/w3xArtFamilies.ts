/**
 * THE 21 W3X ART FAMILIES — one PARAMETERISED prototype per family, not 33
 * one-off effects.
 *
 * OWNER'S RULING, verbatim:
 *   「我的結論跟你類似，請你盡量用編輯器的方式，彈性調整方式複用」
 *   「WarStompCaster 常拿來放大/縮小、改變顏色/透明度後用於
 *     Saber 約束勝利之劍 等衝擊波特效」
 *
 * The L1 census counted 33 Blizzard stock models carrying 922 reference points
 * across the map. They are not 33 different effects — they are 21 SHAPES that
 * the author rescaled, recoloured and re-anchored. `WarStompCaster.mdl` alone
 * is 150 references at 5 distinct scales (1.0–5.0), 4 distinct vertex tints
 * ([75,75,75] / [255,0,0] / [255,100,100] / white) and 2 fly heights (50/360),
 * hanging off 5 different attachment points. One prototype + five knobs covers
 * all of it; 150 bespoke effects would be 150 things to maintain and 150 things
 * the owner cannot retune from the console.
 *
 * SO: a family is `(shape, colour, size, alpha, time, height, anchor)`. The
 * SHAPE comes from `primitives.ts` — 11 primitives already existed and are
 * reused as-is; only `column` (vertical pillar, 97 refs) and `fall` (arrives
 * from above, 51 refs) were added, because no existing silhouette read as
 * either. The other five knobs are per-invocation, which is the whole point.
 *
 * WHAT THIS IS NOT. It is not a claim that the shipped art IS `WarStompCaster`.
 * Those files are Blizzard's and are not in this repo (#81/#116). What is
 * faithful here is WHICH SHAPE the original reached for, and the map's OWN
 * numbers for each call site (`w3xFamilyArt.ts`). That is a strictly stronger
 * claim than `bindings.ts`, which reads a shape off the ability's Chinese NAME
 * — and `bindings.ts` deliberately stays as the fallback for the ~390
 * abilities the import proves nothing about.
 *
 * THE SCALE MAPPING IS NOT THE IDENTITY, ON PURPOSE. A WC3 `usca` of 10.0 on a
 * ~120-unit model is not "ten times a GGD particle": the units are unrelated
 * (`W3X_MODEL_UNIT` in `w3xEmitter.ts` is 1 world unit ≈ 128 WC3 units) and the
 * arena camera is much closer than WC3's. `w3xScaleToDoc` compresses the
 * authored range through a GAIN so the map's ordering survives (a 5.0 call
 * still reads bigger than a 1.0 one) without a single cast whiting out the
 * screen. Gain and clamps are CONFIG (`config.vfx-families@1`), not constants,
 * because this is exactly the sort of number the owner has overturned before.
 *
 * PURE DATA + PURE FUNCTIONS. No `@babylonjs/*` import — importable from Node
 * tests, from the doc generator and from the audition page.
 */
import type { VfxDoc } from "@ggd/shared/content";
import { PRIMITIVES, type PrimitiveKind, type Rgb } from "./primitives";
import { ELEMENTS, elementStyle, type Element } from "./elements";
import { applyArtParams, type ArtParams } from "./artParams";

/** The 21 families the owner prioritised, keyed by the L1 census family id. */
export type W3xArtFamily =
  | "shockwaveRing"
  | "blink"
  | "burst"
  | "dissipate"
  | "missile"
  | "boltStrike"
  | "tornado"
  | "groundDust"
  | "flamePillar"
  | "mirrorImage"
  | "resurrect"
  | "mark"
  | "lightColumn"
  | "portal"
  | "breath"
  | "levelUp"
  | "cloud"
  | "shine"
  | "blood"
  | "starfall"
  | "uncategorised";

/** One family's prototype: the shape, its default look, and its provenance. */
export interface W3xFamilyPrototype {
  readonly id: W3xArtFamily;
  /** the owner-facing 中文 name (the census label) */
  readonly label: string;
  /** lowercase slug — doc ids must match `ID_RE` (`^[a-z0-9][a-z0-9._-]*$`) */
  readonly slug: string;
  /** the Blizzard stock model stems this family collapses */
  readonly models: readonly string[];
  /** L1 census reference points across the whole map (for reports) */
  readonly refCount: number;
  /** the silhouette, from `primitives.ts` */
  readonly primitive: PrimitiveKind;
  /** default colour when the ability carries no element and no w3x tint */
  readonly element: Element;
  /** family base size multiplier, before the per-invocation scale */
  readonly scale: number;
  /** family base alpha 0..1 */
  readonly alpha: number;
  /** family base lifetime stretch */
  readonly timeScale: number;
  /** world-y the effect plays at (0.1 = on the floor, 3 = overhead) */
  readonly heightY: number;
  /** one line on WHAT IT LOOKS LIKE — for the console, not a restatement of id */
  readonly note: string;
}

/**
 * The prototypes. `refCount` and `models` are the L1 census numbers verbatim
 * (`tools/w3x-import/out/vfx-census/MODEL_USAGE.json`), re-checked by
 * `w3xArtFamilies.test.ts` — so a family that silently loses a model, or a
 * count that drifts from the census, is a red test rather than a stale comment.
 */
export const W3X_ART_FAMILIES: Readonly<Record<W3xArtFamily, W3xFamilyPrototype>> = {
  shockwaveRing: {
    id: "shockwaveRing",
    label: "衝擊波環",
    slug: "shockwave-ring",
    models: ["warstompcaster", "thunderclapcaster"],
    refCount: 273,
    primitive: "shockwave",
    element: "earth",
    scale: 1,
    alpha: 1,
    timeScale: 1,
    heightY: 0.15,
    note: "地面向外擴的環。放大＋轉聖光色 = Saber 約束勝利之劍；縮小＋土色 = 一般踏地。",
  },
  blink: {
    id: "blink",
    label: "閃現",
    slug: "blink",
    models: ["blinktarget", "blinkcaster"],
    refCount: 118,
    primitive: "dash",
    element: "arcane",
    scale: 0.9,
    alpha: 0.9,
    timeScale: 0.7,
    heightY: 1,
    note: "瞬移殘影：短、低、寬的一抹拖尾，一眨眼就沒。",
  },
  burst: {
    id: "burst",
    label: "爆裂",
    slug: "burst",
    models: [
      "stampedemissiledeath",
      "neutralbuildingexplosion",
      "steamtankimpact",
      "abominationexplosion",
      "firelorddeathexplode",
      "doomdeath",
    ],
    refCount: 115,
    primitive: "explosion",
    element: "fire",
    scale: 1,
    alpha: 1,
    timeScale: 1,
    heightY: 0.9,
    note: "全向爆開＋上飄餘燼。命中、自爆、死亡爆炸共用同一顆。",
  },
  dissipate: {
    id: "dissipate",
    label: "消散",
    slug: "dissipate",
    models: ["nagadeath", "hcanceldeath", "undeaddissipate"],
    refCount: 63,
    primitive: "swarm",
    element: "void",
    scale: 0.85,
    alpha: 0.75,
    timeScale: 1.35,
    heightY: 0.9,
    note: "身體化成碎光往上飄散、慢慢淡掉 —— 死亡與解除的收尾。",
  },
  missile: {
    id: "missile",
    label: "飛彈",
    slug: "missile",
    models: ["phoenix_missile", "ancientprotectormissile"],
    refCount: 43,
    primitive: "bolt",
    element: "fire",
    scale: 1,
    alpha: 1,
    timeScale: 1,
    heightY: 1,
    note: "一顆飛出去的彈頭＋短尾。與 beam（持續光束）不同，是分離的一發。",
  },
  boltStrike: {
    id: "boltStrike",
    label: "雷擊",
    slug: "bolt-strike",
    models: ["monsoonbolttarget"],
    refCount: 42,
    primitive: "fall",
    element: "lightning",
    scale: 1.15,
    alpha: 1,
    timeScale: 0.8,
    heightY: 3.2,
    note: "從天上劈下來、打在地上。生成點在頭頂，靠強負重力落下。",
  },
  tornado: {
    id: "tornado",
    label: "龍捲",
    slug: "tornado",
    models: ["tornadoelemental", "tornadoelementalsmall"],
    refCount: 32,
    primitive: "tornado",
    element: "wind",
    scale: 1,
    alpha: 0.9,
    timeScale: 1.2,
    heightY: 0.4,
    note: "旋轉上升的柱狀氣流。census 記到 7 種染色、6 種飛行高度。",
  },
  groundDust: {
    id: "groundDust",
    label: "地面塵土",
    slug: "ground-dust",
    models: ["impaletargetdust"],
    refCount: 28,
    primitive: "shockwave",
    element: "earth",
    scale: 0.8,
    alpha: 0.7,
    timeScale: 1.15,
    heightY: 0.1,
    note: "貼地掀起的土屑，比衝擊波環低、慢、混濁（alpha 混色而非加色）。",
  },
  flamePillar: {
    id: "flamePillar",
    label: "火柱",
    slug: "flame-pillar",
    models: ["flamestriketarget"],
    refCount: 27,
    primitive: "column",
    element: "fire",
    scale: 1.1,
    alpha: 1,
    timeScale: 1.2,
    heightY: 0.1,
    note: "從地板竄起的火柱，站在原地燒。",
  },
  mirrorImage: {
    id: "mirrorImage",
    label: "分身",
    slug: "mirror-image",
    models: ["mirrorimagecaster"],
    refCount: 25,
    primitive: "pulse",
    element: "arcane",
    scale: 1,
    alpha: 0.8,
    timeScale: 1.1,
    heightY: 1,
    note: "本體外圍浮起一圈鏡像感的光暈 —— 分身/幻影出現的那一下。",
  },
  resurrect: {
    id: "resurrect",
    label: "復活光",
    slug: "resurrect",
    models: ["resurrecttarget", "resurrectcaster"],
    refCount: 25,
    primitive: "column",
    element: "holy",
    scale: 1,
    alpha: 1,
    timeScale: 1.4,
    heightY: 0.1,
    note: "一道從腳下打上來的聖光柱，比火柱慢、比火柱白。",
  },
  mark: {
    id: "mark",
    label: "印記",
    slug: "mark",
    models: ["markofchaostarget"],
    refCount: 24,
    primitive: "nova",
    element: "blood",
    scale: 0.85,
    alpha: 0.9,
    timeScale: 1.2,
    heightY: 1,
    note: "在目標身上炸開一圈符印光 —— 標記/詛咒生效的提示。",
  },
  lightColumn: {
    id: "lightColumn",
    label: "書/光柱",
    slug: "light-column",
    models: ["tomeofretrainingcaster"],
    refCount: 19,
    primitive: "column",
    element: "arcane",
    scale: 1,
    alpha: 1,
    timeScale: 1.2,
    heightY: 0.1,
    note: "細而亮的魔法光柱（原作是「書」的使用特效）。",
  },
  portal: {
    id: "portal",
    label: "傳送門",
    slug: "portal",
    models: ["darkportaltarget"],
    refCount: 14,
    primitive: "column",
    element: "void",
    scale: 1.2,
    alpha: 0.85,
    timeScale: 1.6,
    heightY: 0.1,
    note: "暗色的門柱：比光柱粗、比光柱久，顏色偏紫黑。",
  },
  breath: {
    id: "breath",
    label: "吐息",
    slug: "breath",
    models: ["bloodbreathstream"],
    refCount: 13,
    primitive: "beam",
    element: "blood",
    scale: 1.1,
    alpha: 1,
    timeScale: 1.25,
    heightY: 1.2,
    note: "從嘴部往前噴的錐狀氣流，比 beam 慢一點、散一點。",
  },
  levelUp: {
    id: "levelUp",
    label: "升級光",
    slug: "level-up",
    models: ["levelupcaster"],
    refCount: 12,
    primitive: "column",
    element: "holy",
    scale: 0.9,
    alpha: 1,
    timeScale: 1.1,
    heightY: 0.1,
    note: "腳下一圈金光往上收 —— 升級/強化的那一閃。",
  },
  cloud: {
    id: "cloud",
    label: "雲",
    slug: "cloud",
    models: ["herocloudcyd"],
    refCount: 10,
    primitive: "swarm",
    element: "wind",
    scale: 1.2,
    alpha: 0.55,
    timeScale: 1.6,
    heightY: 1.2,
    note: "慢慢翻滾的一團雲氣，最低的 alpha，用來壟罩而不是打擊。",
  },
  shine: {
    id: "shine",
    label: "閃光",
    slug: "shine",
    models: ["supershinythingy"],
    refCount: 9,
    primitive: "nova",
    element: "holy",
    scale: 1,
    alpha: 1,
    timeScale: 0.85,
    heightY: 1.1,
    note: "很短的一記白亮爆閃，沒有殘留。",
  },
  blood: {
    id: "blood",
    label: "血",
    slug: "blood",
    models: ["herobloodelfblood"],
    refCount: 9,
    primitive: "explosion",
    element: "blood",
    scale: 0.7,
    alpha: 0.95,
    timeScale: 0.9,
    heightY: 1,
    note: "小範圍的血花，向下掉（重力為負）而不是往上飄。",
  },
  starfall: {
    id: "starfall",
    label: "星墜",
    slug: "starfall",
    models: ["starfalltarget"],
    refCount: 9,
    primitive: "fall",
    element: "arcane",
    scale: 0.95,
    alpha: 1,
    timeScale: 1.1,
    heightY: 3.5,
    note: "從更高處落下的星屑，比雷擊慢、比雷擊碎。",
  },
  uncategorised: {
    id: "uncategorised",
    label: "未分類（自訂匯入）",
    slug: "kaboom",
    models: ["boomnl"],
    refCount: 12,
    primitive: "explosion",
    element: "fire",
    scale: 1.15,
    alpha: 1,
    timeScale: 1.1,
    heightY: 0.9,
    // L1 decoded the model: internal name KABOOM, 0 geosets, 1 PRE2 on
    // Textures\Clouds8x8Fire.blp, additive, red→orange→yellow, size 20→30→50.
    note: "Boomnl.mdx（內部名 KABOOM）：純火焰爆炸煙團，紅→橙→黃，無幾何。",
  },
};

/** Stable iteration order: the census's own ranking (most referenced first). */
export const W3X_ART_FAMILY_IDS: readonly W3xArtFamily[] = Object.keys(W3X_ART_FAMILIES)
  .sort(
    (a, b) =>
      W3X_ART_FAMILIES[b as W3xArtFamily].refCount - W3X_ART_FAMILIES[a as W3xArtFamily].refCount ||
      a.localeCompare(b),
  ) as W3xArtFamily[];

export function isW3xArtFamily(v: string): v is W3xArtFamily {
  return Object.prototype.hasOwnProperty.call(W3X_ART_FAMILIES, v);
}

// ---------------------------------------------------------------------------
// The WC3 → doc scale mapping
// ---------------------------------------------------------------------------

/**
 * Defaults for the WC3-scale compression. Shipped values; the live ones come
 * from `config.vfx-families@1` (`scaleGain` / `scaleMin` / `scaleMax`).
 *
 * gain 0.35 maps the census's authored range like this:
 *   usca 0.9 → 0.965 · 1.0 → 1.0 · 2.0 → 1.35 · 5.0 → 2.4 · 10.0 → 4.15→3.0(clamp)
 * so `20-03 約束與勝利之劍`'s big ring still reads as the biggest thing on
 * screen while a 1.0 踏地 ring stays a 踏地 ring.
 */
export const W3X_SCALE_GAIN = 0.35;
export const W3X_SCALE_MIN = 0.5;
export const W3X_SCALE_MAX = 3;

export interface ScaleMapping {
  gain: number;
  min: number;
  max: number;
}

export const DEFAULT_SCALE_MAPPING: ScaleMapping = {
  gain: W3X_SCALE_GAIN,
  min: W3X_SCALE_MIN,
  max: W3X_SCALE_MAX,
};

/** A WC3 `usca`/`SetUnitScalePercent` value → the doc-space size multiplier. */
export function w3xScaleToDoc(w3xScale: number, m: ScaleMapping = DEFAULT_SCALE_MAPPING): number {
  if (!Number.isFinite(w3xScale) || w3xScale <= 0) return 1;
  const mapped = 1 + (w3xScale - 1) * m.gain;
  const clamped = mapped < m.min ? m.min : mapped > m.max ? m.max : mapped;
  return Math.round(clamped * 1000) / 1000;
}

/** WC3 vertex colour 0..255 → the 0..1 rgb `ArtParams.tint` wants. */
export function w3xTintToRgb(tint: readonly [number, number, number]): Rgb {
  return [tint[0] / 255, tint[1] / 255, tint[2] / 255];
}

// ---------------------------------------------------------------------------
// Doc keys + doc construction
// ---------------------------------------------------------------------------

/**
 * SIZE IN THE DOC ID — quantised, not bucketed into tiers.
 *
 * The first cut used three tiers (sm/md/lg). It was WRONG, and the coverage
 * guard caught it: `tornadoelemental` is authored at both `usca` 2.0 and 3.0,
 * which compress to 1.35 and 1.7 — both inside "lg", so both call sites got the
 * SAME doc and the map's own ordering was silently thrown away. That is failure
 * ⑦ wearing a different hat: the tier is a property, the SIZE is the behaviour.
 *
 * So the doc id carries the compressed scale itself, quantised to 0.05 (about
 * 5% — below what reads on screen, and enough to keep the doc count bounded:
 * 258 call sites collapse to well under a hundred distinct docs).
 */
export const SCALE_QUANTUM = 0.05;

export function quantizeScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return Math.round(Math.round(scale / SCALE_QUANTUM) * SCALE_QUANTUM * 100) / 100;
}

/** `s100` = ×1.00. Integer hundredths, so the id stays ID_RE-legal. */
export function scaleToken(scale: number): string {
  return `s${Math.round(quantizeScale(scale) * 100)}`;
}

/**
 * The COLOUR half of a family doc id. Either an element name (the ability's
 * `bindings.ts` classification, or the family default) or `w3x-rrggbb` when
 * the map itself stored a vertex tint for that call site — the map's own colour
 * always wins over a colour guessed from the ability's name.
 */
export type FamilyColour = { kind: "element"; element: Element } | { kind: "w3x"; rgb255: readonly [number, number, number] };

function hex2(v: number): string {
  const n = Math.max(0, Math.min(255, Math.round(v)));
  return n.toString(16).padStart(2, "0");
}

export function colourSlug(c: FamilyColour): string {
  return c.kind === "element" ? c.element : `w3x-${hex2(c.rgb255[0])}${hex2(c.rgb255[1])}${hex2(c.rgb255[2])}`;
}

export function colourRgb(c: FamilyColour): Rgb {
  return c.kind === "element" ? elementStyle(c.element).color : w3xTintToRgb(c.rgb255);
}

/** `fx.fam.<family-slug>.<colour>.s<hundredths>` — the doc id AND the file stem. */
export function familyVfxKey(family: W3xArtFamily, colour: FamilyColour, scale: number): string {
  return `fx.fam.${W3X_ART_FAMILIES[family].slug}.${colourSlug(colour)}.${scaleToken(scale)}`;
}

/** True for any key this module owns (the census page and the guards read it). */
export const FAMILY_VFX_PREFIX = "fx.fam.";
export function isFamilyVfxKey(key: string | undefined): boolean {
  return !!key && key.startsWith(FAMILY_VFX_PREFIX);
}

/**
 * Build the family's doc at one (colour, tier). This is the ONE place a family
 * prototype becomes a `vfx@1` doc, so the generated `content/vfx/fx.fam.*.json`
 * files and any runtime/preview construction can never disagree.
 *
 * `applyArtParams` does the per-invocation transform — the same function
 * `bindings.curatedDocs()` uses for its size tiers (task #50). Deleting that
 * call is the mutation `w3xArtFamilies.test.ts` pins: without it every doc of a
 * family is byte-identical and the whole "one prototype, many looks" claim is
 * false while still rendering something.
 */
export function buildFamilyDoc(family: W3xArtFamily, colour: FamilyColour, scale: number): VfxDoc {
  return buildFamilyDocWith(W3X_ART_FAMILIES[family], colour, scale, familyVfxKey(family, colour, scale));
}

/**
 * The assembly itself, against an ARBITRARY prototype — so the console's tuned
 * prototype (`familyTuning.resolvePrototype`) and the shipped one go through
 * ONE body. A second copy of these six lines is how a preview stops matching
 * what ships.
 */
export function buildFamilyDocWith(
  proto: W3xFamilyPrototype,
  colour: FamilyColour,
  scale: number,
  id: string,
): VfxDoc {
  const rgb = colourRgb(colour);
  const blend = colour.kind === "element" ? elementStyle(colour.element).blend : elementStyle(proto.element).blend;
  const base = PRIMITIVES[proto.primitive]({ id, color: rgb, blend });
  // `scale` is the FINAL doc-space multiplier — the resolver has already folded
  // in the family default, so it must NOT be multiplied by `proto.scale` again.
  const doc = applyArtParams(base, {
    scale: quantizeScale(scale),
    alpha: proto.alpha,
    timeScale: proto.timeScale,
  });
  doc.id = id;
  return doc;
}

/**
 * The SPATIAL half of a play — what `VfxSystem` needs but a `VfxDoc` cannot
 * carry. `flyHeight` is WC3 units; `W3X_MODEL_UNIT` (128 WC3 units per world
 * unit, from `w3xEmitter.ts`) is the same divisor the emitter importer uses, so
 * a 360-unit fly height is 2.8 world units above the family's own height.
 */
export const W3X_HEIGHT_UNIT = 128;

export function familyHeightY(family: W3xArtFamily, flyHeight?: number): number {
  const base = W3X_ART_FAMILIES[family].heightY;
  if (flyHeight === undefined || !Number.isFinite(flyHeight)) return base;
  // A NEGATIVE fly height is the map hiding a dummy under the terrain; it must
  // never drag a visible cast below the floor (failure ①: 畫在地板下).
  return Math.max(0.05, Math.round((base + flyHeight / W3X_HEIGHT_UNIT) * 1000) / 1000);
}

/** The knobs a call site may override, as `artParams.ts` expresses them. */
export type FamilyArtParams = ArtParams;

/** Every element name, for the console's colour dropdown. */
export const FAMILY_ELEMENTS = Object.keys(ELEMENTS) as Element[];
