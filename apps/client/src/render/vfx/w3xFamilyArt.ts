/**
 * W3X FAMILY ART — the abilities whose art the ORIGINAL map PROVES, bound to a
 * parameterised family prototype instead of to a one-off effect.
 *
 * WHY THIS IS A SECOND TABLE AND NOT MORE ROWS IN `w3xAbilityArt`.
 * `W3X_ABILITY_ART` promotes the 34 abilities whose art SHIPPED as real emitter
 * docs (`fx.w3x.*` / `godie-*`), extracted byte-exact from models the map
 * imported. Those rows name a concrete doc and their content `vfxKey` is that
 * doc — `w3xAbilityArt.test.ts` asserts exactly that.
 *
 * Every family below is a BLIZZARD STOCK model (`WarStompCaster.mdl`,
 * `BlinkTarget.mdl`, …). This repo does not have those files and cannot ship
 * them (#81/#116), so there is no doc to name. What the import DOES prove is
 * WHICH stock effect the author reached for, and — this is the owner's own
 * reading — the author was reaching for a SHAPE he then rescaled and recoloured:
 *
 *   「WarStompCaster 常拿來放大/縮小、改變顏色/透明度後用於
 *     Saber 約束勝利之劍 等衝擊波特效」
 *   「請你盡量用編輯器的方式，彈性調整方式複用」
 *
 * So a row here binds an ability to a family PROTOTYPE (`w3xArtFamilies.ts`)
 * plus the per-invocation numbers the map really stored for that call site.
 * 33 stock models collapse into 21 prototypes; nothing here is a bespoke effect.
 *
 * PROVENANCE — every row is DERIVED, never guessed. Source:
 *   · `tools/w3x-import/out/vfx-census/MODEL_USAGE.json` (L1's model → reference
 *     inverse index: w3a/w3h/w3u overrides, JASS literals, JASS spawns, and
 *     Blizzard base-ability inheritance, with the map's 204 deliberately-CLEARED
 *     art cells excluded so inheritance cannot invent what the author deleted)
 *   · `tools/w3x-import/out/vfx-bindings/VFX_BINDINGS.json` `ggdDocIndex`
 *     (GGD ability doc id → w3x rawcode). ONLY `CONFIRMED` links are used;
 *     `INFERRED` ones are dropped.
 * `w3xFamilyArt.test.ts` RE-DERIVES this whole table from those two files and
 * fails on any row that does not fall out of them — so a hand-edited row, or a
 * plausible-looking name typed in by eye, is a red test.
 *
 * WHAT THE NUMBERS MEAN.
 *   · `scale` / `tint` / `flyHeight` are the map's OWN per-invocation values
 *     (`SetUnitScalePercent`, the dummy unit's `uclr/uclg/uclb`, `SetUnitFlyHeight`).
 *     ABSENT means the map did not state one — NOT that it stated 1.0. The
 *     family default applies and the row says so via `paramSource`.
 *   · `paramSource: "ref"` = read off this call site. `"model"` = the model has
 *     exactly ONE distinct value across all 3682 references, so the call site is
 *     unambiguous even though this ref did not carry it. Anything with more than
 *     one candidate value is left ABSENT rather than averaged.
 *   · `anchor` is the WC3 attachment string as authored ("chest", "origin",
 *     "right,hand"), passed through verbatim.
 *
 * PURE DATA. No `@babylonjs/*`, no content reads — importable from Node tests
 * and from the doc generator.
 */
import type { W3xArtFamily } from "./w3xArtFamilies";

/** How the art reached the ability, strongest first. */
export type W3xArtProvenance =
  | "w3a-override"
  | "jass-literal"
  | "jass-spawn"
  | "w3h-override"
  | "stock-inherited";

/** One ability's evidence-bound family prototype + the map's own numbers. */
export interface W3xFamilyArtRow {
  /** the prototype in `w3xArtFamilies.ts` */
  readonly family: W3xArtFamily;
  /** the Blizzard stock model stem the evidence names */
  readonly model: string;
  /** the map's own ability rawcode the evidence hangs on (CONFIRMED link only) */
  readonly w3aId: string;
  readonly provenance: W3xArtProvenance;
  /** the exact channel: a w3a art slot, a buff record, or a JASS call */
  readonly via: string;
  /** WC3 attachment string, verbatim (absent = the effect is not attached) */
  readonly anchor?: string;
  /** the map's own scale multiplier for THIS call site (absent = not stated) */
  readonly scale?: number;
  /** the map's own vertex tint, 0..255 (absent = white, i.e. not stated) */
  readonly tint?: readonly [number, number, number];
  /** the map's own fly height in WC3 units (absent = not stated) */
  readonly flyHeight?: number;
  /** where scale/tint/flyHeight came from; absent when none was stated */
  readonly paramSource?: "ref" | "model";
}

/** 258 abilities, 19 families. Regenerate/verify via `w3xFamilyArt.test.ts`. */
export const W3X_FAMILY_ART: Readonly<Record<string, W3xFamilyArtRow>> = {
  // 22-00 嗚鎖打!
  "godie-e001.passive": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0CL",
    provenance: "stock-inherited",
    via: "ability.casterArt",
  },
  // 22-04 雛見澤症候群L5
  "godie-e001.r": {
    family: "burst",
    model: "doomdeath",
    w3aId: "A02Q",
    provenance: "w3a-override",
    via: "ability.targetArt",
    tint: [100, 100, 100],
    paramSource: "model",
  },
  // 20-03 約束與勝利之劍
  "godie-e002.e": {
    family: "burst",
    model: "neutralbuildingexplosion",
    w3aId: "A0D5",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 12-002 仙氣發勁
  "godie-e007.ex": {
    family: "dissipate",
    model: "nagadeath",
    w3aId: "A0SQ",
    provenance: "w3a-override",
    via: "ability.specialArt",
    scale: 1.5,
    tint: [10, 10, 10],
    paramSource: "model",
  },
  // 12-01 鬥仙術
  "godie-e007.q": {
    family: "levelUp",
    model: "levelupcaster",
    w3aId: "A04Y",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 12-04 龍氣爆發
  "godie-e007.r": {
    family: "shine",
    model: "supershinythingy",
    w3aId: "A04X",
    provenance: "w3a-override",
    via: "ability.casterArt",
    anchor: "hand,left",
  },
  // 21-03 赤焰爆發
  "godie-e008.e": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0BF",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 21-04 討滅封絕
  "godie-e008.r": {
    family: "flamePillar",
    model: "flamestriketarget",
    w3aId: "A0HB",
    provenance: "w3a-override",
    via: "ability.casterArt",
    scale: 1.1,
    tint: [255, 0, 0],
    paramSource: "model",
  },
  // 95-03 皇者戰氣第五十重天
  "godie-e00j.e": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0Y8",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 95-002 固有結界-和諧世界
  "godie-e00j.ex": {
    family: "resurrect",
    model: "resurrectcaster",
    w3aId: "A0YA",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "origin",
    scale: 0.9,
    paramSource: "model",
  },
  // 95-04 藍色戰氣一百重天
  "godie-e00j.r": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A0Y9",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 19-03 瞬切百殺
  "godie-e00k.e": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0H9",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 19-002 紫色披風
  "godie-e00k.ex": {
    family: "mark",
    model: "markofchaostarget",
    w3aId: "A0SZ",
    provenance: "w3a-override",
    via: "ability.missileArt",
    tint: [255, 100, 0],
    flyHeight: 150,
    paramSource: "model",
  },
  // 19-00 閃擊
  "godie-e00k.passive": {
    family: "blink",
    model: "blinkcaster",
    w3aId: "A0RG",
    provenance: "w3a-override",
    via: "ability.casterArt",
    anchor: "chest",
  },
  // 19-02 迴切
  "godie-e00k.w": {
    family: "cloud",
    model: "herocloudcyd",
    w3aId: "A0H5",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 20-03 約束與勝利之劍
  "godie-e00l.e": {
    family: "burst",
    model: "neutralbuildingexplosion",
    w3aId: "A0D5",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 22-00 嗚鎖打!
  "godie-e00n.passive": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0CL",
    provenance: "stock-inherited",
    via: "ability.casterArt",
  },
  // 22-04 雛見澤症候群L5
  "godie-e00n.r": {
    family: "burst",
    model: "doomdeath",
    w3aId: "A02Q",
    provenance: "w3a-override",
    via: "ability.targetArt",
    tint: [100, 100, 100],
    paramSource: "model",
  },
  // 69-03 約束與勝利之劍
  "godie-e00q.e": {
    family: "burst",
    model: "neutralbuildingexplosion",
    w3aId: "A0D5",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 59-01 吞噬
  "godie-e00r.q": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0O5",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 59-04 野戰型陽電子砲
  "godie-e00r.r": {
    family: "groundDust",
    model: "impaletargetdust",
    w3aId: "A0GI",
    provenance: "w3a-override",
    via: "ability.missileArt",
  },
  // 70-01 伸卡球
  "godie-e00s.q": {
    family: "burst",
    model: "steamtankimpact",
    w3aId: "A0UJ",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
    tint: [255, 170, 170],
    paramSource: "model",
  },
  // 77-03 GLADIARIA ALAT
  "godie-e00w.e": {
    family: "resurrect",
    model: "resurrectcaster",
    w3aId: "A0JG",
    provenance: "w3a-override",
    via: "ability.missileArt",
    scale: 0.9,
    paramSource: "model",
  },
  // 77-01 百烈櫻華斬
  "godie-e00w.q": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0TV",
    provenance: "stock-inherited",
    via: "ability.casterArt",
  },
  // 77-03 GLADIARIA ALAT
  "godie-e00x.e": {
    family: "resurrect",
    model: "resurrectcaster",
    w3aId: "A0JG",
    provenance: "w3a-override",
    via: "ability.missileArt",
    scale: 0.9,
    paramSource: "model",
  },
  // 77-01 百烈櫻華斬
  "godie-e00x.q": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0TV",
    provenance: "stock-inherited",
    via: "ability.casterArt",
  },
  // 19-03 瞬切百殺
  "godie-e00z.e": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0H9",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 19-002 紫色披風
  "godie-e00z.ex": {
    family: "mark",
    model: "markofchaostarget",
    w3aId: "A0SZ",
    provenance: "w3a-override",
    via: "ability.missileArt",
    tint: [255, 100, 0],
    flyHeight: 150,
    paramSource: "model",
  },
  // 19-00 閃擊
  "godie-e00z.passive": {
    family: "blink",
    model: "blinkcaster",
    w3aId: "A0RH",
    provenance: "w3a-override",
    via: "ability.casterArt",
    anchor: "chest",
  },
  // 19-02 迴切
  "godie-e00z.w": {
    family: "cloud",
    model: "herocloudcyd",
    w3aId: "A0H5",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 47-00 龍搥閃
  "godie-e012.passive": {
    family: "levelUp",
    model: "levelupcaster",
    w3aId: "A03J",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 47-04 天翔龍閃
  "godie-e012.r": {
    family: "tornado",
    model: "tornadoelementalsmall",
    w3aId: "A012",
    provenance: "w3a-override",
    via: "ability.specialArt",
  },
  // 47-02 神速
  "godie-e012.w": {
    family: "blink",
    model: "blinkcaster",
    w3aId: "A014",
    provenance: "stock-inherited",
    via: "ability.specialArt",
  },
  // 94-03 珍奶顏射
  "godie-e015.e": {
    family: "missile",
    model: "phoenix_missile",
    w3aId: "A0QJ",
    provenance: "w3h-override",
    via: "buff.targetArt",
    anchor: "weapon",
    scale: 4,
    paramSource: "model",
  },
  // 94-01 北斗爆橘拳
  "godie-e015.q": {
    family: "burst",
    model: "abominationexplosion",
    w3aId: "A0OV",
    provenance: "jass-spawn",
    via: "jass.unitSpawn",
    scale: 1.1,
    paramSource: "ref",
  },
  // 94-02 橘山斬空破
  "godie-e015.w": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A0QG",
    provenance: "stock-inherited",
    via: "ability.casterArt",
    anchor: "origin",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 45-03 千鳥
  "godie-edem.e": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A0IJ",
    provenance: "w3a-override",
    via: "ability.casterArt",
    anchor: "weapon",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 45-002 天照
  "godie-edem.ex": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A102",
    provenance: "stock-inherited",
    via: "ability.casterArt",
  },
  // 45-01 火遁-豪火龍之術
  "godie-edem.q": {
    family: "burst",
    model: "steamtankimpact",
    w3aId: "A0M7",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "chest",
    tint: [255, 170, 170],
    paramSource: "model",
  },
  // 45-02 千鳥流
  "godie-edem.w": {
    family: "boltStrike",
    model: "monsoonbolttarget",
    w3aId: "A0JX",
    provenance: "jass-spawn",
    via: "jass.unitSpawn",
    scale: 10,
    paramSource: "ref",
  },
  // 93-03 這次考試很簡單
  "godie-ekee.e": {
    family: "mark",
    model: "markofchaostarget",
    w3aId: "A0NG",
    provenance: "w3a-override",
    via: "ability.effectArt",
    tint: [255, 100, 0],
    flyHeight: 150,
    paramSource: "model",
  },
  // 93-002 二一
  "godie-ekee.ex": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0WN",
    provenance: "w3a-override",
    via: "ability.targetArt",
    anchor: "chest",
  },
  // 93-00 小考
  "godie-ekee.passive": {
    family: "boltStrike",
    model: "monsoonbolttarget",
    w3aId: "A0WK",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 93-04 當掉
  "godie-ekee.r": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0WJ",
    provenance: "w3a-override",
    via: "ability.targetArt",
    anchor: "chest",
  },
  // 15-03 雷電風暴
  "godie-emfr.e": {
    family: "boltStrike",
    model: "monsoonbolttarget",
    w3aId: "A052",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "chest",
  },
  // 15-04 千之雷
  "godie-emfr.r": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A053",
    provenance: "w3a-override",
    via: "ability.targetArt",
  },
  // 44-03 火車輾過
  "godie-emns.e": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A05H",
    provenance: "stock-inherited",
    via: "ability.casterArt",
  },
  // 14-02 式神炸裂
  "godie-etyr.e": {
    family: "lightColumn",
    model: "tomeofretrainingcaster",
    w3aId: "A0JM",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 14-01 東風繪扇、南風末廣
  "godie-etyr.q": {
    family: "resurrect",
    model: "resurrecttarget",
    w3aId: "A0JL",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "chest",
    scale: 3,
    tint: [255, 0, 0],
    flyHeight: 150,
    paramSource: "model",
  },
  // 14-04 聖夜降臨
  "godie-etyr.r": {
    family: "resurrect",
    model: "resurrecttarget",
    w3aId: "A0SS",
    provenance: "w3a-override",
    via: "ability.effectArt",
    scale: 3,
    tint: [255, 0, 0],
    flyHeight: 150,
    paramSource: "model",
  },
  // 14-03 魔力應援
  "godie-etyr.w": {
    family: "lightColumn",
    model: "tomeofretrainingcaster",
    w3aId: "A0JM",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 12-002 仙氣發勁
  "godie-ewar.ex": {
    family: "dissipate",
    model: "nagadeath",
    w3aId: "A0SQ",
    provenance: "w3a-override",
    via: "ability.specialArt",
    scale: 1.5,
    tint: [10, 10, 10],
    paramSource: "model",
  },
  // 12-01 鬥仙術
  "godie-ewar.q": {
    family: "levelUp",
    model: "levelupcaster",
    w3aId: "A04Y",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 12-04 龍氣爆發
  "godie-ewar.r": {
    family: "shine",
    model: "supershinythingy",
    w3aId: "A04X",
    provenance: "w3a-override",
    via: "ability.casterArt",
    anchor: "hand,left",
  },
  // 17-03 空破圓斬
  "godie-ewrd.e": {
    family: "blink",
    model: "blinkcaster",
    w3aId: "A07M",
    provenance: "w3a-override",
    via: "ability.specialArt",
  },
  // 17-04 狂龍斬
  "godie-ewrd.r": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A07N",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 17-02 殺無真空斬
  "godie-ewrd.w": {
    family: "cloud",
    model: "herocloudcyd",
    w3aId: "A07L",
    provenance: "w3a-override",
    via: "ability.casterArt",
    anchor: "chest",
  },
  // 41-02 地裂術
  "godie-h001.w": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A0Z2",
    provenance: "w3a-override",
    via: "ability.specialArt",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 79-002 虛化
  "godie-h01n.ex": {
    family: "mark",
    model: "markofchaostarget",
    w3aId: "A0W5",
    provenance: "w3a-override",
    via: "ability.casterArt",
    tint: [255, 100, 0],
    flyHeight: 150,
    paramSource: "model",
  },
  // 79-01 瞬步
  "godie-h01n.q": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0RX",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "chest",
  },
  // 79-04 卍解
  "godie-h01n.r": {
    family: "resurrect",
    model: "resurrecttarget",
    w3aId: "A0LN",
    provenance: "w3a-override",
    via: "ability.casterArt",
    scale: 3,
    tint: [255, 0, 0],
    flyHeight: 150,
    paramSource: "model",
  },
  // 79-02 斬擊
  "godie-h01n.w": {
    family: "flamePillar",
    model: "flamestriketarget",
    w3aId: "A0LK",
    provenance: "w3a-override",
    via: "ability.casterArt",
    scale: 1.1,
    tint: [255, 0, 0],
    paramSource: "model",
  },
  // 79-002 虛化
  "godie-h01o.ex": {
    family: "mark",
    model: "markofchaostarget",
    w3aId: "A0W5",
    provenance: "w3a-override",
    via: "ability.casterArt",
    tint: [255, 100, 0],
    flyHeight: 150,
    paramSource: "model",
  },
  // 79-01 瞬步
  "godie-h01o.q": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0RX",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "chest",
  },
  // 79-04 卍解
  "godie-h01o.r": {
    family: "resurrect",
    model: "resurrecttarget",
    w3aId: "A0LN",
    provenance: "w3a-override",
    via: "ability.casterArt",
    scale: 3,
    tint: [255, 0, 0],
    flyHeight: 150,
    paramSource: "model",
  },
  // 79-02 斬擊
  "godie-h01o.w": {
    family: "flamePillar",
    model: "flamestriketarget",
    w3aId: "A0LK",
    provenance: "w3a-override",
    via: "ability.casterArt",
    scale: 1.1,
    tint: [255, 0, 0],
    paramSource: "model",
  },
  // 80-03 鬼神烈戟
  "godie-h01u.e": {
    family: "burst",
    model: "neutralbuildingexplosion",
    w3aId: "A0N0",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "origin",
  },
  // 80-04 赤兔咆哮
  "godie-h01u.r": {
    family: "dissipate",
    model: "undeaddissipate",
    w3aId: "A0MZ",
    provenance: "w3h-override",
    via: "buff.specialArt",
    anchor: "chest",
  },
  // 04-03 龍破斬
  "godie-h020.e": {
    family: "dissipate",
    model: "hcanceldeath",
    w3aId: "A04R",
    provenance: "w3a-override",
    via: "ability.casterArt",
    tint: [255, 0, 0],
    paramSource: "model",
  },
  // 04-01 火球術
  "godie-h020.q": {
    family: "dissipate",
    model: "hcanceldeath",
    w3aId: "A0AY",
    provenance: "w3a-override",
    via: "ability.effectArt",
    tint: [255, 0, 0],
    paramSource: "model",
  },
  // 04-04 神滅斬
  "godie-h020.r": {
    family: "cloud",
    model: "herocloudcyd",
    w3aId: "A07F",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 04-02 炸彈陣
  "godie-h020.w": {
    family: "flamePillar",
    model: "flamestriketarget",
    w3aId: "A021",
    provenance: "stock-inherited",
    via: "ability.effectArt",
    scale: 1.1,
    tint: [255, 0, 0],
    paramSource: "model",
  },
  // 05-03 及喀爾度
  "godie-h021.e": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A091",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 05-00 啦嗚薩喀爾
  "godie-h021.passive": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0KY",
    provenance: "w3a-override",
    via: "ability.specialArt",
  },
  // 82-03 雷之投擲
  "godie-h022.e": {
    family: "boltStrike",
    model: "monsoonbolttarget",
    w3aId: "A0Q5",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 82-01 雷之斧
  "godie-h022.q": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0Q4",
    provenance: "w3a-override",
    via: "ability.effectArt",
  },
  // 82-04 闇之魔法
  "godie-h022.r": {
    family: "uncategorised",
    model: "boomnl",
    w3aId: "A0Q6",
    provenance: "w3a-override",
    via: "ability.casterArt",
    scale: 1,
    paramSource: "model",
  },
  // 82-02 虛空瞬動
  "godie-h022.w": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A0PM",
    provenance: "stock-inherited",
    via: "ability.casterArt",
    anchor: "origin",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 89-002 俄羅斯輪盤
  "godie-h02k.ex": {
    family: "lightColumn",
    model: "tomeofretrainingcaster",
    w3aId: "A0TU",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 90-04 陽光烈焰
  "godie-h02r.r": {
    family: "shine",
    model: "supershinythingy",
    w3aId: "A0R4",
    provenance: "w3a-override",
    via: "ability.casterArt",
    anchor: "chest",
  },
  // 90-02 麻痺粉
  "godie-h02r.w": {
    family: "groundDust",
    model: "impaletargetdust",
    w3aId: "A0NB",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 91-03 碎心打擊
  "godie-h02s.e": {
    family: "burst",
    model: "abominationexplosion",
    w3aId: "A0W1",
    provenance: "w3a-override",
    via: "ability.effectArt",
  },
  // 91-002 亡靈大軍
  "godie-h02s.ex": {
    family: "groundDust",
    model: "impaletargetdust",
    w3aId: "A0VS",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 92-04 馬勒戈壁
  "godie-h02u.r": {
    family: "flamePillar",
    model: "flamestriketarget",
    w3aId: "A06Y",
    provenance: "w3a-override",
    via: "ability.casterArt",
    scale: 1.1,
    tint: [255, 0, 0],
    paramSource: "model",
  },
  // 92-04 馬勒戈壁
  "godie-h02v.r": {
    family: "flamePillar",
    model: "flamestriketarget",
    w3aId: "A06Y",
    provenance: "w3a-override",
    via: "ability.casterArt",
    scale: 1.1,
    tint: [255, 0, 0],
    paramSource: "model",
  },
  // 97-04 終極秘劍-火產靈神
  "godie-h02y.r": {
    family: "tornado",
    model: "tornadoelementalsmall",
    w3aId: "A0YH",
    provenance: "w3a-override",
    via: "ability.specialArt",
  },
  // 91-03 碎心打擊
  "godie-h02z.e": {
    family: "burst",
    model: "abominationexplosion",
    w3aId: "A0W1",
    provenance: "w3a-override",
    via: "ability.effectArt",
  },
  // 91-002 亡靈大軍
  "godie-h02z.ex": {
    family: "groundDust",
    model: "impaletargetdust",
    w3aId: "A0VS",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 52-002 射殺百頭
  "godie-hapm.ex": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A0U5",
    provenance: "w3a-override",
    via: "ability.missileArt",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 26-002 鄉民的正義
  "godie-harf.ex": {
    family: "resurrect",
    model: "resurrecttarget",
    w3aId: "A106",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
    scale: 3,
    tint: [255, 0, 0],
    flyHeight: 150,
    paramSource: "model",
  },
  // 26-01 腳底按摩
  "godie-harf.q": {
    family: "missile",
    model: "phoenix_missile",
    w3aId: "A00L",
    provenance: "w3h-override",
    via: "buff.targetArt",
    anchor: "weapon",
    scale: 4,
    paramSource: "model",
  },
  // 01-03 畫龍點睛
  "godie-hart.e": {
    family: "tornado",
    model: "tornadoelemental",
    w3aId: "A000",
    provenance: "jass-spawn",
    via: "jass.unitSpawn",
    scale: 2,
    tint: [150, 150, 255],
    flyHeight: -500,
    paramSource: "ref",
  },
  // 01-01 凶斬
  "godie-hart.q": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A072",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "chest",
  },
  // 01-04 超究武神霸斬
  "godie-hart.r": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A077",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 05-03 及喀爾度
  "godie-hblm.e": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A091",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 05-00 啦嗚薩喀爾
  "godie-hblm.passive": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0KY",
    provenance: "w3a-override",
    via: "ability.specialArt",
  },
  // 90-04 陽光烈焰
  "godie-hgam.r": {
    family: "shine",
    model: "supershinythingy",
    w3aId: "A0R4",
    provenance: "w3a-override",
    via: "ability.casterArt",
    anchor: "chest",
  },
  // 90-02 麻痺粉
  "godie-hgam.w": {
    family: "groundDust",
    model: "impaletargetdust",
    w3aId: "A0NB",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 04-03 龍破斬
  "godie-hjai.e": {
    family: "dissipate",
    model: "hcanceldeath",
    w3aId: "A04R",
    provenance: "w3a-override",
    via: "ability.casterArt",
    tint: [255, 0, 0],
    paramSource: "model",
  },
  // 04-01 火球術
  "godie-hjai.q": {
    family: "dissipate",
    model: "hcanceldeath",
    w3aId: "A0AY",
    provenance: "w3a-override",
    via: "ability.effectArt",
    tint: [255, 0, 0],
    paramSource: "model",
  },
  // 04-04 神滅斬
  "godie-hjai.r": {
    family: "cloud",
    model: "herocloudcyd",
    w3aId: "A07F",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 04-02 炸彈陣
  "godie-hjai.w": {
    family: "flamePillar",
    model: "flamestriketarget",
    w3aId: "A021",
    provenance: "stock-inherited",
    via: "ability.effectArt",
    scale: 1.1,
    tint: [255, 0, 0],
    paramSource: "model",
  },
  // 03-04 全彈發射
  "godie-hlgr.r": {
    family: "burst",
    model: "neutralbuildingexplosion",
    w3aId: "A04N",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 35-04 光牙
  "godie-hpal.r": {
    family: "burst",
    model: "stampedemissiledeath",
    w3aId: "A0U6",
    provenance: "w3a-override",
    via: "ability.specialArt",
    tint: [255, 0, 0],
    paramSource: "model",
  },
  // 07-03 列、在、前
  "godie-hpb1.e": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0G3",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 07-02 者、皆、陣
  "godie-hpb1.w": {
    family: "burst",
    model: "stampedemissiledeath",
    w3aId: "A0G2",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
    scale: 3,
    tint: [255, 0, 0],
    paramSource: "ref",
  },
  // 28-03 分身
  "godie-huth.e": {
    family: "mirrorImage",
    model: "mirrorimagecaster",
    w3aId: "A03T",
    provenance: "stock-inherited",
    via: "ability.specialArt",
  },
  // 48-00 石化之眼
  "godie-hvsh.passive": {
    family: "lightColumn",
    model: "tomeofretrainingcaster",
    w3aId: "A0RR",
    provenance: "jass-spawn",
    via: "jass.unitSpawn",
    scale: 4,
    tint: [255, 0, 255],
    paramSource: "ref",
  },
  // 48-04 騎英之疆繩
  "godie-hvsh.r": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0RQ",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 02-002 神通眼
  "godie-hvwd.ex": {
    family: "lightColumn",
    model: "tomeofretrainingcaster",
    w3aId: "A0S6",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 42-03 暗夜吹雪
  "godie-n003.e": {
    family: "lightColumn",
    model: "tomeofretrainingcaster",
    w3aId: "A05C",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 42-002 魔力印章
  "godie-n003.ex": {
    family: "mark",
    model: "markofchaostarget",
    w3aId: "A06K",
    provenance: "w3a-override",
    via: "ability.missileArt",
    tint: [255, 100, 0],
    flyHeight: 150,
    paramSource: "model",
  },
  // 57-02 任意門
  "godie-n00b.e": {
    family: "blink",
    model: "blinkcaster",
    w3aId: "A0D2",
    provenance: "stock-inherited",
    via: "ability.specialArt",
  },
  // 57-04 竹蜻蜓
  "godie-n00b.r": {
    family: "tornado",
    model: "tornadoelemental",
    w3aId: "A0JN",
    provenance: "w3a-override",
    via: "ability.targetArt",
  },
  // 57-03 複製鏡
  "godie-n00b.w": {
    family: "blink",
    model: "blinkcaster",
    w3aId: "A0D2",
    provenance: "stock-inherited",
    via: "ability.specialArt",
  },
  // 18-02 寄生種子
  "godie-n00p.w": {
    family: "breath",
    model: "bloodbreathstream",
    w3aId: "A0RV",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "chest",
  },
  // 08-03 龍鬥氣砲咒文
  "godie-n01c.e": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A05J",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 08-002 龍魔人
  "godie-n01c.ex": {
    family: "mark",
    model: "markofchaostarget",
    w3aId: "A0T1",
    provenance: "w3a-override",
    via: "ability.missileArt",
    tint: [255, 100, 0],
    flyHeight: 150,
    paramSource: "model",
  },
  // 08-01 雙龍紋
  "godie-n01c.q": {
    family: "resurrect",
    model: "resurrectcaster",
    w3aId: "A0CF",
    provenance: "w3a-override",
    via: "ability.casterArt",
    scale: 0.9,
    paramSource: "model",
  },
  // 08-04 阿邦快速劍X
  "godie-n01c.r": {
    family: "mirrorImage",
    model: "mirrorimagecaster",
    w3aId: "A0EZ",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 08-02 萊丁快速劍
  "godie-n01c.w": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A05T",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "chest",
  },
  // 42-03 暗夜吹雪
  "godie-n01g.e": {
    family: "lightColumn",
    model: "tomeofretrainingcaster",
    w3aId: "A05C",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 42-002 魔力印章
  "godie-n01g.ex": {
    family: "mark",
    model: "markofchaostarget",
    w3aId: "A06K",
    provenance: "w3a-override",
    via: "ability.missileArt",
    tint: [255, 100, 0],
    flyHeight: 150,
    paramSource: "model",
  },
  // 98-002 夢想前程的彼方
  "godie-n01l.ex": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A0ZG",
    provenance: "stock-inherited",
    via: "ability.casterArt",
    anchor: "origin",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 27-03 忍法千變萬化之刀
  "godie-naka.e": {
    family: "flamePillar",
    model: "flamestriketarget",
    w3aId: "A03I",
    provenance: "w3h-override",
    via: "buff.targetArt",
    scale: 1.1,
    tint: [255, 0, 0],
    paramSource: "model",
  },
  // 27-002 祕法-霧隱分身之術
  "godie-naka.ex": {
    family: "mirrorImage",
    model: "mirrorimagecaster",
    w3aId: "A08R",
    provenance: "stock-inherited",
    via: "ability.specialArt",
  },
  // 27-04 忍法暗殺奧義-飛燕閃
  "godie-naka.r": {
    family: "breath",
    model: "bloodbreathstream",
    w3aId: "A030",
    provenance: "w3a-override",
    via: "ability.targetArt",
    anchor: "chest",
  },
  // 08-03 龍鬥氣砲咒文
  "godie-nbbc.e": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A05J",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 08-002 龍魔人
  "godie-nbbc.ex": {
    family: "mark",
    model: "markofchaostarget",
    w3aId: "A0T1",
    provenance: "w3a-override",
    via: "ability.missileArt",
    tint: [255, 100, 0],
    flyHeight: 150,
    paramSource: "model",
  },
  // 08-01 雙龍紋
  "godie-nbbc.q": {
    family: "resurrect",
    model: "resurrectcaster",
    w3aId: "A0CF",
    provenance: "w3a-override",
    via: "ability.casterArt",
    scale: 0.9,
    paramSource: "model",
  },
  // 08-04 阿邦快速劍X
  "godie-nbbc.r": {
    family: "mirrorImage",
    model: "mirrorimagecaster",
    w3aId: "A0EZ",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 08-02 萊丁快速劍
  "godie-nbbc.w": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A05T",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "chest",
  },
  // 24-03 變態絕技悶絕地獄車
  "godie-nbst.e": {
    family: "lightColumn",
    model: "tomeofretrainingcaster",
    w3aId: "A0AP",
    provenance: "jass-spawn",
    via: "jass.unitSpawn",
    scale: 5,
    flyHeight: 150,
    paramSource: "ref",
  },
  // 24-002 來~快點吃吧
  "godie-nbst.ex": {
    family: "dissipate",
    model: "undeaddissipate",
    w3aId: "A0SG",
    provenance: "w3a-override",
    via: "ability.targetArt",
    anchor: "chest",
  },
  // 24-01 這是我的豆皮壽司
  "godie-nbst.q": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A00A",
    provenance: "stock-inherited",
    via: "ability.casterArt",
  },
  // 16-04 劍之精靈
  "godie-nplh.e": {
    family: "portal",
    model: "darkportaltarget",
    w3aId: "A044",
    provenance: "jass-spawn",
    via: "jass.unitSpawn",
    scale: 2,
    flyHeight: 50,
    paramSource: "ref",
  },
  // 16-002 布都御魂
  "godie-nplh.ex": {
    family: "mirrorImage",
    model: "mirrorimagecaster",
    w3aId: "A06M",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 16-03 無無明亦無
  "godie-nplh.q": {
    family: "portal",
    model: "darkportaltarget",
    w3aId: "A044",
    provenance: "jass-spawn",
    via: "jass.unitSpawn",
    scale: 2,
    flyHeight: 50,
    paramSource: "ref",
  },
  // 16-02 阿彌陀流真空佛陀斬
  "godie-nplh.r": {
    family: "resurrect",
    model: "resurrectcaster",
    w3aId: "A042",
    provenance: "jass-spawn",
    via: "jass.unitSpawn",
    scale: 0.9,
    paramSource: "ref",
  },
  // 16-01 超．占事略決
  "godie-nplh.w": {
    family: "resurrect",
    model: "resurrectcaster",
    w3aId: "A042",
    provenance: "jass-spawn",
    via: "jass.unitSpawn",
    scale: 0.9,
    paramSource: "ref",
  },
  // 18-02 寄生種子
  "godie-nsjs.w": {
    family: "breath",
    model: "bloodbreathstream",
    w3aId: "A0RV",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "chest",
  },
  // 23-03 雷牙一閃˙雷牙烈霸
  "godie-ntin.e": {
    family: "flamePillar",
    model: "flamestriketarget",
    w3aId: "A0SY",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
    scale: 1.1,
    tint: [255, 0, 0],
    paramSource: "model",
  },
  // 23-04 雷焰聖劍
  "godie-ntin.r": {
    family: "dissipate",
    model: "nagadeath",
    w3aId: "A0OD",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "weapon",
    scale: 1.5,
    tint: [10, 10, 10],
    paramSource: "model",
  },
  // 86-03 神鳴
  "godie-o00k.e": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A04V",
    provenance: "w3h-override",
    via: "buff.effectArt",
  },
  // 86-01 十萬伏特
  "godie-o00k.q": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A0BZ",
    provenance: "w3a-override",
    via: "ability.casterArt",
    anchor: "body",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 86-04 打雷絕招
  "godie-o00k.r": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A0C0",
    provenance: "w3a-override",
    via: "ability.casterArt",
    anchor: "body",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 86-02 電光一閃
  "godie-o00k.w": {
    family: "blink",
    model: "blinkcaster",
    w3aId: "A0BY",
    provenance: "stock-inherited",
    via: "ability.specialArt",
  },
  // 53-01 獸王牙操彈
  "godie-o00l.q": {
    family: "burst",
    model: "steamtankimpact",
    w3aId: "A0K1",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "chest",
    tint: [255, 170, 170],
    paramSource: "model",
  },
  // 53-04 暴爆咒
  "godie-o00l.r": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0UE",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 53-02 強化炸彈陣
  "godie-o00l.w": {
    family: "flamePillar",
    model: "flamestriketarget",
    w3aId: "A0DQ",
    provenance: "stock-inherited",
    via: "ability.effectArt",
    scale: 1.1,
    tint: [255, 0, 0],
    paramSource: "model",
  },
  // 09-03 超級賽亞人
  "godie-o00x.e": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A09E",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "origin",
  },
  // 09-01 界王拳
  "godie-o00x.q": {
    family: "burst",
    model: "doomdeath",
    w3aId: "A082",
    provenance: "w3h-override",
    via: "buff.targetArt",
    anchor: "right,hand",
    tint: [100, 100, 100],
    paramSource: "model",
  },
  // 09-04 龜派氣功
  "godie-o00x.r": {
    family: "burst",
    model: "neutralbuildingexplosion",
    w3aId: "A03S",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 09-02 瞬間移動
  "godie-o00x.w": {
    family: "blink",
    model: "blinkcaster",
    w3aId: "A03Y",
    provenance: "stock-inherited",
    via: "ability.specialArt",
  },
  // 81-03 Divine Buster Extention
  "godie-o01z.e": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A0XN",
    provenance: "w3a-override",
    via: "ability.missileArt",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 81-01 Barrel Shot
  "godie-o01z.q": {
    family: "burst",
    model: "firelorddeathexplode",
    w3aId: "A0XG",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 81-04 Starlight Breaker Plus
  "godie-o01z.r": {
    family: "missile",
    model: "phoenix_missile",
    w3aId: "A0XO",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "chest",
    scale: 4,
    paramSource: "model",
  },
  // 81-02 Acxel Shooter
  "godie-o01z.w": {
    family: "burst",
    model: "firelorddeathexplode",
    w3aId: "A0LB",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 58-002 打雷絕招
  "godie-o02l.ex": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A0SL",
    provenance: "w3a-override",
    via: "ability.casterArt",
    anchor: "body",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 58-00 電光一閃
  "godie-o02l.passive": {
    family: "blink",
    model: "blinkcaster",
    w3aId: "A0R6",
    provenance: "stock-inherited",
    via: "ability.specialArt",
  },
  // 58-01 十萬伏特
  "godie-o02l.q": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A0BZ",
    provenance: "w3a-override",
    via: "ability.casterArt",
    anchor: "body",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 58-04 瘋狂皮卡丘
  "godie-o02l.r": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A040",
    provenance: "w3a-override",
    via: "ability.missileArt",
  },
  // 87-03 天下號令
  "godie-o02o.e": {
    family: "resurrect",
    model: "resurrectcaster",
    w3aId: "A0DB",
    provenance: "w3a-override",
    via: "ability.missileArt",
    scale: 0.9,
    paramSource: "model",
  },
  // 87-04 逆我必殺
  "godie-o02o.r": {
    family: "resurrect",
    model: "resurrectcaster",
    w3aId: "A0C2",
    provenance: "w3a-override",
    via: "ability.casterArt",
    scale: 0.9,
    paramSource: "model",
  },
  // 99-03 初音未來的消失
  "godie-o02p.e": {
    family: "resurrect",
    model: "resurrectcaster",
    w3aId: "A11B",
    provenance: "w3a-override",
    via: "ability.casterArt",
    scale: 0.9,
    paramSource: "model",
  },
  // 53-02 強化炸彈陣
  "godie-o02s.q": {
    family: "burst",
    model: "steamtankimpact",
    w3aId: "A0K1",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "chest",
    tint: [255, 170, 170],
    paramSource: "model",
  },
  // 53-03 破法對咒
  "godie-o02s.r": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0DT",
    provenance: "stock-inherited",
    via: "ability.casterArt",
  },
  // 53-01 獸王牙操彈
  "godie-o02s.w": {
    family: "flamePillar",
    model: "flamestriketarget",
    w3aId: "A0DQ",
    provenance: "stock-inherited",
    via: "ability.effectArt",
    scale: 1.1,
    tint: [255, 0, 0],
    paramSource: "model",
  },
  // 81-03 Divine Buster Extention
  "godie-o02v.e": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A0XN",
    provenance: "w3a-override",
    via: "ability.missileArt",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 81-01 Barrel Shot
  "godie-o02v.q": {
    family: "burst",
    model: "firelorddeathexplode",
    w3aId: "A0XG",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 81-04 Starlight Breaker Plus
  "godie-o02v.r": {
    family: "missile",
    model: "phoenix_missile",
    w3aId: "A0XO",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "chest",
    scale: 4,
    paramSource: "model",
  },
  // 81-02 Acxel Shooter
  "godie-o02v.w": {
    family: "burst",
    model: "firelorddeathexplode",
    w3aId: "A0LB",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 96-03 吸星大法
  "godie-o02w.e": {
    family: "lightColumn",
    model: "tomeofretrainingcaster",
    w3aId: "A0Y0",
    provenance: "w3a-override",
    via: "ability.specialArt",
  },
  // 96-002 易筋經
  "godie-o02w.ex": {
    family: "burst",
    model: "firelorddeathexplode",
    w3aId: "A0XY",
    provenance: "w3a-override",
    via: "ability.specialArt",
  },
  // 96-04 獨孤九劍
  "godie-o02w.r": {
    family: "cloud",
    model: "herocloudcyd",
    w3aId: "A0Y5",
    provenance: "w3a-override",
    via: "ability.missileArt",
  },
  // 33-03 地道突襲
  "godie-obla.e": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A07D",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 33-02 吃完的口香糖
  "godie-obla.w": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A00P",
    provenance: "w3a-override",
    via: "ability.targetArt",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 58-002 打雷絕招
  "godie-ofar.ex": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A0SL",
    provenance: "w3a-override",
    via: "ability.casterArt",
    anchor: "body",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 58-00 電光一閃
  "godie-ofar.passive": {
    family: "blink",
    model: "blinkcaster",
    w3aId: "A0R6",
    provenance: "stock-inherited",
    via: "ability.specialArt",
  },
  // 58-01 十萬伏特
  "godie-ofar.q": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A0BZ",
    provenance: "w3a-override",
    via: "ability.casterArt",
    anchor: "body",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 58-04 瘋狂皮卡丘
  "godie-ofar.r": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A040",
    provenance: "w3a-override",
    via: "ability.missileArt",
  },
  // 72-04 黑化
  "godie-ogld.r": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0CO",
    provenance: "stock-inherited",
    via: "ability.casterArt",
  },
  // 09-03 超級賽亞人
  "godie-ogrh.e": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A09E",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "origin",
  },
  // 09-01 界王拳
  "godie-ogrh.q": {
    family: "burst",
    model: "doomdeath",
    w3aId: "A082",
    provenance: "w3h-override",
    via: "buff.targetArt",
    anchor: "right,hand",
    tint: [100, 100, 100],
    paramSource: "model",
  },
  // 09-04 龜派氣功
  "godie-ogrh.r": {
    family: "burst",
    model: "neutralbuildingexplosion",
    w3aId: "A03S",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 09-02 瞬間移動
  "godie-ogrh.w": {
    family: "blink",
    model: "blinkcaster",
    w3aId: "A03Y",
    provenance: "stock-inherited",
    via: "ability.specialArt",
  },
  // 32-03 閃光龍牙
  "godie-opgh.e": {
    family: "mark",
    model: "markofchaostarget",
    w3aId: "A0I1",
    provenance: "w3a-override",
    via: "ability.casterArt",
    anchor: "weapon",
    tint: [255, 100, 0],
    flyHeight: 150,
    paramSource: "model",
  },
  // 32-002 見龍卸甲
  "godie-opgh.ex": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A111",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 32-01 一騎槍閃
  "godie-opgh.q": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A049",
    provenance: "w3a-override",
    via: "ability.targetArt",
    anchor: "chest",
  },
  // 32-04 狂龍霸體
  "godie-opgh.r": {
    family: "portal",
    model: "darkportaltarget",
    w3aId: "A0TI",
    provenance: "w3a-override",
    via: "ability.effectArt",
    scale: 2,
    flyHeight: 50,
    paramSource: "model",
  },
  // 30-002 變態紳士
  "godie-orkn.ex": {
    family: "mark",
    model: "markofchaostarget",
    w3aId: "A0YT",
    provenance: "w3a-override",
    via: "ability.missileArt",
    tint: [255, 100, 0],
    flyHeight: 150,
    paramSource: "model",
  },
  // 30-04 電車之狼衝擊
  "godie-orkn.r": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A01P",
    provenance: "w3h-override",
    via: "buff.effectArt",
  },
  // 34-002 冥道殘月破
  "godie-osam.ex": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0MV",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 34-00 靈魂吞噬
  "godie-osam.passive": {
    family: "dissipate",
    model: "undeaddissipate",
    w3aId: "ACdr",
    provenance: "w3a-override",
    via: "ability.targetArt",
  },
  // 34-04 奧義˙蒼龍破
  "godie-osam.r": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A0FP",
    provenance: "w3a-override",
    via: "ability.casterArt",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 29-04 電光毒龍鑽
  "godie-oshd.r": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A00Z",
    provenance: "w3a-override",
    via: "ability.missileArt",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 31-03 野性的呼喚
  "godie-othr.e": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0I2",
    provenance: "w3a-override",
    via: "ability.specialArt",
  },
  // 31-02 重爪擊
  "godie-othr.w": {
    family: "breath",
    model: "bloodbreathstream",
    w3aId: "A0AQ",
    provenance: "w3h-override",
    via: "buff.targetArt",
    anchor: "chest",
  },
  // 75-02 龍捲風
  "godie-u00b.e": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A07Z",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 75-00 戰鬥之歌
  "godie-u00b.passive": {
    family: "portal",
    model: "darkportaltarget",
    w3aId: "A026",
    provenance: "w3a-override",
    via: "ability.casterArt",
    scale: 2,
    flyHeight: 50,
    paramSource: "model",
  },
  // 75-03 暴雷無限刃
  "godie-u00b.r": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A07Z",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 39-00 無明神風流-玄武
  "godie-u00h.passive": {
    family: "flamePillar",
    model: "flamestriketarget",
    w3aId: "A07C",
    provenance: "w3a-override",
    via: "ability.casterArt",
    scale: 1.1,
    tint: [255, 0, 0],
    paramSource: "model",
  },
  // 39-04 祕奧義．金色的神風
  "godie-u00h.r": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0DJ",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 74-03 闇之天使
  "godie-u00j.e": {
    family: "flamePillar",
    model: "flamestriketarget",
    w3aId: "A0F4",
    provenance: "w3a-override",
    via: "ability.casterArt",
    scale: 1.1,
    tint: [255, 0, 0],
    paramSource: "model",
  },
  // 74-002 超新星
  "godie-u00j.ex": {
    family: "burst",
    model: "stampedemissiledeath",
    w3aId: "A0S3",
    provenance: "w3a-override",
    via: "ability.targetArt",
    anchor: "chest",
    tint: [255, 0, 0],
    paramSource: "model",
  },
  // 74-01 獄門
  "godie-u00j.q": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0S4",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "chest",
  },
  // 74-02 八刀一閃
  "godie-u00j.w": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A0ET",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 71-04 萬惡歸宗
  "godie-u00k.r": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A0HK",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "chest",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 25-03 北斗百裂拳
  "godie-u00l.e": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0HV",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 25-002 喔拉喔拉喔拉喔拉
  "godie-u00l.ex": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A10Y",
    provenance: "w3a-override",
    via: "ability.effectArt",
  },
  // 25-01 北斗懺悔拳
  "godie-u00l.q": {
    family: "burst",
    model: "abominationexplosion",
    w3aId: "A0AF",
    provenance: "jass-spawn",
    via: "jass.unitSpawn",
    scale: 1.1,
    paramSource: "ref",
  },
  // 25-04 ChangeDNA
  "godie-u00l.r": {
    family: "boltStrike",
    model: "monsoonbolttarget",
    w3aId: "A0HW",
    provenance: "jass-spawn",
    via: "jass.unitSpawn",
    scale: 10,
    paramSource: "ref",
  },
  // 76-03 伸縮自如的槍亂打
  "godie-u00n.e": {
    family: "burst",
    model: "steamtankimpact",
    w3aId: "A0IV",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "chest",
    tint: [255, 170, 170],
    paramSource: "model",
  },
  // 76-002 霸王色
  "godie-u00n.ex": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0ZK",
    provenance: "stock-inherited",
    via: "ability.casterArt",
  },
  // 76-00 二檔
  "godie-u00n.passive": {
    family: "flamePillar",
    model: "flamestriketarget",
    w3aId: "A0IR",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
    scale: 1.1,
    tint: [255, 0, 0],
    paramSource: "model",
  },
  // 76-01 伸縮自如的橡膠戰斧
  "godie-u00n.q": {
    family: "mirrorImage",
    model: "mirrorimagecaster",
    w3aId: "A0IS",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 76-04 三檔.巨人迴旋彈
  "godie-u00n.r": {
    family: "mirrorImage",
    model: "mirrorimagecaster",
    w3aId: "A0RZ",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 76-02 伸縮自如的橡膠火箭砲
  "godie-u00n.w": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0IP",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "hand",
  },
  // 76-03 伸縮自如的槍亂打
  "godie-u00o.e": {
    family: "burst",
    model: "steamtankimpact",
    w3aId: "A0IV",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "chest",
    tint: [255, 170, 170],
    paramSource: "model",
  },
  // 76-002 霸王色
  "godie-u00o.ex": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0ZK",
    provenance: "stock-inherited",
    via: "ability.casterArt",
  },
  // 76-00 二檔
  "godie-u00o.passive": {
    family: "flamePillar",
    model: "flamestriketarget",
    w3aId: "A0IR",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
    scale: 1.1,
    tint: [255, 0, 0],
    paramSource: "model",
  },
  // 76-01 伸縮自如的橡膠戰斧
  "godie-u00o.q": {
    family: "mirrorImage",
    model: "mirrorimagecaster",
    w3aId: "A0IS",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 76-04 三檔.巨人迴旋彈
  "godie-u00o.r": {
    family: "mirrorImage",
    model: "mirrorimagecaster",
    w3aId: "A0RZ",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 76-02 伸縮自如的橡膠火箭砲
  "godie-u00o.w": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0IP",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "hand",
  },
  // 78-03 廬山昇龍破
  "godie-u00v.e": {
    family: "tornado",
    model: "tornadoelemental",
    w3aId: "A0L2",
    provenance: "jass-spawn",
    via: "jass.unitSpawn",
    scale: 3,
    tint: [200, 100, 100],
    flyHeight: -900,
    paramSource: "ref",
  },
  // 78-04 死亡噴射肘擊
  "godie-u00v.r": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0L6",
    provenance: "w3a-override",
    via: "ability.targetArt",
    anchor: "chest",
  },
  // 78-02 地走龍牙破
  "godie-u00v.w": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0L4",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 38-03 邪王炎殺黑龍波
  "godie-u010.e": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A09I",
    provenance: "w3a-override",
    via: "ability.casterArt",
    anchor: "weapon",
  },
  // 38-04 黑龍波吸收
  "godie-u010.r": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A09K",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "chest",
  },
  // 61-00百連我殺
  "godie-u011.passive": {
    family: "resurrect",
    model: "resurrecttarget",
    w3aId: "Aphx",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
    scale: 3,
    tint: [255, 0, 0],
    flyHeight: 150,
    paramSource: "model",
  },
  // 61-00百連我殺
  "godie-u012.passive": {
    family: "resurrect",
    model: "resurrecttarget",
    w3aId: "Aphx",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
    scale: 3,
    tint: [255, 0, 0],
    flyHeight: 150,
    paramSource: "model",
  },
  // 11-03 鬼氣九刀流-阿修羅壹霧銀
  "godie-u01u.e": {
    family: "mirrorImage",
    model: "mirrorimagecaster",
    w3aId: "A06P",
    provenance: "w3a-override",
    via: "ability.missileArt",
  },
  // 11-002 武裝色霸氣
  "godie-u01u.ex": {
    family: "mark",
    model: "markofchaostarget",
    w3aId: "A10N",
    provenance: "w3a-override",
    via: "ability.missileArt",
    tint: [255, 100, 0],
    flyHeight: 150,
    paramSource: "model",
  },
  // 11-04 三千世界
  "godie-u01u.r": {
    family: "mirrorImage",
    model: "mirrorimagecaster",
    w3aId: "A0MQ",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 11-02 虎狩獵
  "godie-u01u.w": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A06N",
    provenance: "stock-inherited",
    via: "ability.casterArt",
  },
  // 06-00 猜猜拳
  "godie-u034.passive": {
    family: "burst",
    model: "steamtankimpact",
    w3aId: "A08Y",
    provenance: "w3a-override",
    via: "ability.missileArt",
    tint: [255, 170, 170],
    paramSource: "model",
  },
  // 06-04 傑桑變化
  "godie-u034.r": {
    family: "uncategorised",
    model: "boomnl",
    w3aId: "A0Y1",
    provenance: "w3h-override",
    via: "buff.targetArt",
    anchor: "chest",
    scale: 1,
    paramSource: "model",
  },
  // 37-02 黑核晶
  "godie-ubal.e": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0KC",
    provenance: "w3h-override",
    via: "buff.effectArt",
  },
  // 37-03 災難之牆
  "godie-ubal.w": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0KC",
    provenance: "w3h-override",
    via: "buff.effectArt",
  },
  // 06-00 猜猜拳
  "godie-ucrl.passive": {
    family: "burst",
    model: "steamtankimpact",
    w3aId: "A08Y",
    provenance: "w3a-override",
    via: "ability.missileArt",
    tint: [255, 170, 170],
    paramSource: "model",
  },
  // 06-04 傑桑變化
  "godie-ucrl.r": {
    family: "uncategorised",
    model: "boomnl",
    w3aId: "A0Y1",
    provenance: "w3h-override",
    via: "buff.targetArt",
    anchor: "chest",
    scale: 1,
    paramSource: "model",
  },
  // 65-03 魔法膨脹
  "godie-udea.e": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0CH",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 65-01 神出鬼沒
  "godie-udea.q": {
    family: "blink",
    model: "blinkcaster",
    w3aId: "A04G",
    provenance: "stock-inherited",
    via: "ability.specialArt",
  },
  // 65-04 天譴
  "godie-udea.r": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A04C",
    provenance: "w3a-override",
    via: "ability.casterArt",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 65-02 寒冰破碎
  "godie-udea.w": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A05S",
    provenance: "w3a-override",
    via: "ability.specialArt",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 11-03 鬼氣九刀流-阿修羅壹霧銀
  "godie-udre.e": {
    family: "mirrorImage",
    model: "mirrorimagecaster",
    w3aId: "A06P",
    provenance: "w3a-override",
    via: "ability.missileArt",
  },
  // 11-002 武裝色霸氣
  "godie-udre.ex": {
    family: "mark",
    model: "markofchaostarget",
    w3aId: "A10N",
    provenance: "w3a-override",
    via: "ability.missileArt",
    tint: [255, 100, 0],
    flyHeight: 150,
    paramSource: "model",
  },
  // 11-04 三千世界
  "godie-udre.r": {
    family: "mirrorImage",
    model: "mirrorimagecaster",
    w3aId: "A0MQ",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
  },
  // 11-02 虎狩獵
  "godie-udre.w": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A06N",
    provenance: "stock-inherited",
    via: "ability.casterArt",
  },
  // 25-03 北斗百裂拳
  "godie-umal.e": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A0HV",
    provenance: "w3a-override",
    via: "ability.casterArt",
  },
  // 25-002 喔拉喔拉喔拉喔拉
  "godie-umal.ex": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A10Y",
    provenance: "w3a-override",
    via: "ability.effectArt",
  },
  // 25-01 北斗懺悔拳
  "godie-umal.q": {
    family: "burst",
    model: "abominationexplosion",
    w3aId: "A0AF",
    provenance: "jass-spawn",
    via: "jass.unitSpawn",
    scale: 1.1,
    paramSource: "ref",
  },
  // 25-04 ChangeDNA
  "godie-umal.r": {
    family: "boltStrike",
    model: "monsoonbolttarget",
    w3aId: "A0HW",
    provenance: "jass-spawn",
    via: "jass.unitSpawn",
    scale: 10,
    paramSource: "ref",
  },
  // 49-00 撲殺爪擊
  "godie-usyl.passive": {
    family: "shockwaveRing",
    model: "thunderclapcaster",
    w3aId: "A0NJ",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectLocBJ",
    tint: [0, 255, 255],
    paramSource: "model",
  },
  // 38-03 邪王炎殺黑龍波
  "godie-uvng.e": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A09I",
    provenance: "w3a-override",
    via: "ability.casterArt",
    anchor: "weapon",
  },
  // 38-04 黑龍波吸收
  "godie-uvng.r": {
    family: "shockwaveRing",
    model: "warstompcaster",
    w3aId: "A09K",
    provenance: "jass-literal",
    via: "jass.AddSpecialEffectTargetUnitBJ",
    anchor: "chest",
  },
  // 43-04 爆裂海景佛跳牆
  "godie-uwar.e": {
    family: "burst",
    model: "abominationexplosion",
    w3aId: "ANfd",
    provenance: "w3a-override",
    via: "ability.targetArt",
  },
  // 43-03 少林絕學-火雲掌
  "godie-uwar.r": {
    family: "burst",
    model: "abominationexplosion",
    w3aId: "ANfd",
    provenance: "w3a-override",
    via: "ability.targetArt",
  },
};

/** The evidence row for an ability, or undefined when the map proves nothing. */
export function familyArtFor(abilityId: string | undefined): W3xFamilyArtRow | undefined {
  return abilityId ? W3X_FAMILY_ART[abilityId] : undefined;
}

/** How many bound abilities each family carries (for reports + the audition page). */
export function familyArtCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of Object.values(W3X_FAMILY_ART)) out[row.family] = (out[row.family] ?? 0) + 1;
  return out;
}
