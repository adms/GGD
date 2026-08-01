/**
 * W3X ABILITY ART — abilities bound to the effect the ORIGINAL map really used.
 *
 * WHY THIS EXISTS. `fx.prim.*` (task #79) gives every ability a LEGIBLE look:
 * element in colour, shape in silhouette. That baseline stays — it covers all
 * 615 bound abilities and it is what makes 「哪招是哪招」 answerable at all.
 * What it cannot do is give a SIGNATURE cast its own identity: one holy nova
 * looks like every other holy nova. This table promotes the abilities where
 * the map's own art survives the import, so those casts read as themselves.
 *
 * PROVENANCE — every row is derived, never guessed. The source is
 * `tools/w3x-import/out/vfx-bindings/VFX_BINDINGS.json` (regenerate with
 * `python3 tools/w3x-import/build_vfx_bindings.py`), which joins the map's
 * `war3map.w3a` art fields, its `war3map.w3h` buff art and the literal model
 * strings in `war3map.j`. A row exists ONLY when the art reached the ability
 * through `w3a-override` (the author set the field himself), `w3h-override`
 * or `jass-literal` (the author named the model in a spawn call). Art that is
 * merely INHERITED from a Blizzard stock ability is never promoted — it is not
 * evidence of intent, and the model is not in this repo anyway.
 *
 * THE #230 SWEEP. `tools/w3x-import/build_vfx_census.py` re-ran this derivation
 * over EVERY champion × EVERY slot and found four ability rows that pass every
 * filter below and had simply been missed: 38-01 邪王炎殺劍 (both 飛影 docs, on
 * `flamessmoke`) and 12-002 仙氣發勁 (both 天地志狼 docs, on `supershinythingy`).
 * They are added; nothing else moved. The census also proves the table is not
 * merely incomplete but CORRECT about what it excludes — see `unrenderable` in
 * `content/assets/vfx/w3x-ability-provenance.json`.
 *
 * THE RENDERABILITY GATE — why only 34 of 668. Three filters, in order:
 *   1. the art must be a MAP-IMPORTED model (`IN_REPO_*`). 1305 of the 1529
 *      resolved art entries are retail Blizzard `.mdl` paths we cannot ship
 *      (#81/#116) — those abilities keep the primitive.
 *   2. the model must carry PRE2/RIBB emitters that shipped as content docs.
 *   3. EVERY emitter must be anchored to the MODEL ROOT. This is the filter
 *      that does the real work. `divinering` (20 emitters on `BlizParticle*`
 *      nodes) and `earthtornado2` / `lightningtornado` (13 of 14 on `evilbox*`
 *      spinner nodes) get their entire shape from the model's own animated
 *      node hierarchy. Replayed as world-position particle systems they would
 *      all fire from one point — a blob, not a ring or a tornado. Binding
 *      those would make legibility WORSE, so they stay on the primitive.
 *
 * ONE CAST = ONE EFFECT = SEVERAL EMITTERS. A WC3 effect is a SET of emitters
 * (`frostnova` is 4), but `vfxKey` resolves to exactly one doc. So the ability's
 * `vfxKey` carries the family's dominant emitter — which also drives the cast
 * pillar's tint — and `extraVfxDocIds()` carries the rest, which `VfxSystem`
 * fires alongside it. Cost is bounded: `frontLoadDoc` collapses each authored
 * continuous stream into ONE burst capped at `MAX_FRONT_LOAD_BURST`, so a
 * 6-emitter family costs about what 6 primitives cost, not its authored rate.
 *
 * GENERATION. Where the `fx.w3x.*` re-derivation (task #183) covers a family it
 * is preferred over the older `godie-*` pass — same emitters, more precisely
 * recovered parameters. Families it does not cover keep `godie-*`.
 *
 * This module is DATA + lookups. It imports nothing from `@babylonjs/*`, so it
 * stays importable from Node tests and the doc generator. It is not, however,
 * side-effect free any more: `setFamilyTuning` MINTS the console's tuned family
 * docs into `VfxDefs` (see THE TUNING SEAM below) — that write is the whole
 * reason a family knob does anything at all.
 */
import { VfxDefs, type ConfigVfxFamiliesDoc } from "@ggd/shared/content";
import { abilityVfxKeys } from "./bindings";
import {
  bakedFamilyKeys,
  nearestBakedFamilyKey,
  requiredFamilyDocs,
  resolveFamilyArt,
  type ResolvedFamilyArt,
} from "./familyTuning";

/** One ability's promoted w3x effect. */
export interface W3xAbilityArt {
  /** the w3x model stem the effect came from, e.g. "frostnova" */
  readonly family: string;
  /** the map's own ability rawcode this art was read off */
  readonly w3aId: string;
  /** how the art reached the ability (see PROVENANCE above) */
  readonly provenance: "w3a-override" | "w3h-override" | "jass-literal";
  /** which channel carried it — w3a art slot, buff record, or a JASS call */
  readonly via: string;
  /** dominant emitter — this is the ability's `vfxKey` */
  readonly primary: string;
  /** the family's remaining emitters, fired alongside the primary */
  readonly extra: readonly string[];
  /**
   * #205 —— the console's PER-ABILITY art overrides for this cast, if any.
   *
   * ⚠️ This interface is the ONLY channel between the family layer and the
   * renderer, and until now it had no slot for these: `familyRow()` built a
   * `W3xAbilityArt` out of a `ResolvedFamilyArt` and every field the interface
   * did not declare **evaporated on that line**. That is why
   * `config.vfx-families@1.abilities.<id>.alpha` / `.timeScale` were dead knobs
   * — validated by the console, stored in the overlay, read by nobody.
   *
   * Absent on every `W3X_ABILITY_ART` row (the 34 hard-table promotions) and on
   * any family row the operator has not touched, and an absent value plays the
   * doc UNCHANGED (`applyVfxOverrides` returns the same object), so shipped
   * content is bit-identical to before.
   */
  readonly alpha?: number;
  readonly timeScale?: number;
  /**
   * #251 —— 這一招要播在離地多高（世界單位），家族原型的基準高度疊上原圖
   * `SetUnitFlyHeight` 之後的結果。
   *
   * ⚠️ 這一行以前不存在，所以 `resolveFamilyArt()` 算好的 `heightY` 在
   * `familyRow()` 那一行**蒸發** —— 和上面 α / 時間倍率同一個形狀的第②號故障，
   * 只是空間那兩格（`heightY` / `anchor`）當時還沒修。實測（2026-08-01，
   * 91 支 `shockwaveRing` → 105 個 emitter）世界 Y 的直方圖是單獨一格 `{1.0}`，
   * 而 config 要的是 0.15：**貼地的環全部浮在胸口**。
   *
   * `W3X_ABILITY_ART` 那 34 支硬表晉升沒有這一格（它們沒有家族原型，也就沒有
   * 「應該多高」這個答案），`familyCastHeightY` 對 absent 一律回平面高度。
   *
   * `anchor` 仍然是死的 —— 見 `DEAD_FAMILY_KNOBS`。
   */
  readonly heightY?: number;
}

export const W3X_ABILITY_ART: Readonly<Record<string, W3xAbilityArt>> = {
  // 亞瑟王 - Saber — 20-03 約束與勝利之劍  [roster]
  "godie-e002.e": {
    family: "holyawakening",
    w3aId: "A0D5",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.particle.holyawakening.p04",
    extra: ["fx.w3x.particle.holyawakening.p00", "fx.w3x.particle.holyawakening.p01", "fx.w3x.particle.holyawakening.p02", "fx.w3x.particle.holyawakening.p03", "fx.w3x.particle.holyawakening.p05"],
  },
  // 龍之子 - 天地志狼 — 12-04 龍氣爆發  [roster]
  "godie-e007.r": {
    family: "supershinythingy",
    w3aId: "A04X",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.particle.supershinythingy.p00",
    extra: ["fx.w3x.particle.supershinythingy.p01", "fx.w3x.particle.supershinythingy.p02"],
  },
  // 最終泛用人型決戰兵器 - 初號機 — 59-03 AT力場  [roster]
  "godie-e00r.e": {
    family: "heroeva01s2",
    w3aId: "A0GH",
    provenance: "w3a-override",
    via: "art:special",
    primary: "fx.w3x.particle.heroeva01s2.p01",
    extra: ["fx.w3x.particle.heroeva01s2.p00"],
  },
  // 時空勇者 - 林克 — 60-04 迴旋斬  [roster]
  "godie-h00l.r": {
    family: "bladestorm-swordeffect",
    w3aId: "A0BR",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "godie-bladestorm-swordeffect-p0",
    extra: [],
  },
  // 種子神奇寶貝 - 妙蛙花 — 90-04 陽光烈焰  [roster]
  "godie-h02r.r": {
    family: "supershinythingy",
    w3aId: "A0R4",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.particle.supershinythingy.p00",
    extra: ["fx.w3x.particle.supershinythingy.p01", "fx.w3x.particle.supershinythingy.p02"],
  },
  // 最終幻想 - 克勞德 — 01-04 超究武神霸斬  [roster]
  "godie-hart.r": {
    family: "herocloudkfksword",
    w3aId: "A077",
    provenance: "jass-literal",
    via: "jass:effectTargetUnit",
    primary: "fx.w3x.orb.herocloudkfksword.p00",
    extra: [],
  },
  // 黑暗福音 - 依文潔琳 — 42-04 世界終結  [roster]
  "godie-n003.r": {
    family: "frostnova",
    w3aId: "A05D",
    provenance: "jass-literal",
    via: "jass:effectLoc",
    primary: "fx.w3x.locust.frostnova.p01",
    extra: ["fx.w3x.locust.frostnova.p00", "fx.w3x.locust.frostnova.p02", "fx.w3x.locust.frostnova.p03"],
  },
  // 神性的流失 - 賽菲洛斯 — 74-01 獄門  [roster]
  "godie-u00j.q": {
    family: "herocloudkfksword",
    w3aId: "A0S4",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.orb.herocloudkfksword.p00",
    extra: [],
  },
  // 黑手黨老大 - 基廉列克 — 78-04 死亡噴射肘擊  [roster]
  "godie-u00v.r": {
    family: "boomnl",
    w3aId: "A0L6",
    provenance: "jass-literal",
    via: "jass:effectLoc",
    primary: "fx.w3x.locust.boomnl.p01",
    extra: ["fx.w3x.locust.boomnl.p00", "fx.w3x.locust.boomnl.p02", "fx.w3x.locust.boomnl.p03", "fx.w3x.locust.boomnl.p04"],
  },
  // 邪眼師 - 飛影 — 38-03 邪王炎殺黑龍波  [roster]
  "godie-u010.e": {
    family: "tectonicfury",
    w3aId: "A09I",
    provenance: "w3a-override",
    via: "art:missile",
    primary: "godie-tectonicfury-p0",
    extra: ["godie-tectonicfury-p1"],
  },
  // 邪眼師 - 飛影 — 38-01 邪王炎殺劍  [roster]  (#230)
  // A0OG sets BOTH casterArt AND effectArt to `flamessmoke.mdx` — two channels
  // agreeing, author-set on both. p01 is the family's tall plume (pivot z=+254.7
  // against p00/p02/p03 at −62.6/+20.9/−2.1), so it is the visible body of the
  // effect, and it is already 38-04's proven primary on the same model — one
  // dominant emitter for the whole family.
  "godie-u010.q": {
    family: "flamessmoke",
    w3aId: "A0OG",
    provenance: "w3a-override",
    via: "art:caster+art:effect",
    primary: "fx.w3x.particle.flamessmoke.p01",
    extra: ["fx.w3x.particle.flamessmoke.p00", "fx.w3x.particle.flamessmoke.p02", "fx.w3x.particle.flamessmoke.p03"],
  },
  // 邪眼師 - 飛影 — 38-04 黑龍波吸收  [roster]
  "godie-u010.r": {
    family: "flamessmoke",
    w3aId: "A09K",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.particle.flamessmoke.p01",
    extra: ["fx.w3x.particle.flamessmoke.p00", "fx.w3x.particle.flamessmoke.p02", "fx.w3x.particle.flamessmoke.p03"],
  },
  // 龍之子 - 天地志狼 — 12-002 仙氣發勁  [roster]  (#230)
  // The A0SQ handler literal-names `SuperShinyThingy.mdx` — the strongest
  // provenance there is. Every other art channel on this ability is Blizzard
  // stock (MirrorImageCaster / NagaDeath) and cannot ship (#81/#116). Emitter
  // choice is positionally NEUTRAL here: all three emitters share one identical
  // pivot (1.0, −0.7, −17.6), so p00 is picked because it is index 0 and is
  // already the established primary for 12-04 and 90-04 on the same model.
  "godie-e007.ex": {
    family: "supershinythingy",
    w3aId: "A0SQ",
    provenance: "jass-literal",
    via: "jass:effectTargetUnit",
    primary: "fx.w3x.particle.supershinythingy.p00",
    extra: ["fx.w3x.particle.supershinythingy.p01", "fx.w3x.particle.supershinythingy.p02"],
  },
  // 邪眼師 - 飛影 — 38-02 邪王炎殺煉獄焦  [roster]
  "godie-u010.w": {
    family: "fireblast",
    w3aId: "A09H",
    provenance: "w3a-override",
    via: "art:missile",
    primary: "godie-fireblast-p3",
    extra: ["godie-fireblast-p0", "godie-fireblast-p1", "godie-fireblast-p2"],
  },
  // 三刀流劍士 - 索隆 — 11-01 燒鬼斬  [roster]
  "godie-u01u.q": {
    family: "lavabreathdamage",
    w3aId: "A0BC",
    provenance: "w3a-override",
    via: "art:target",
    primary: "fx.w3x.particle.lavabreathdamage.p00",
    extra: [],
  },
  // 亞瑟王 - Saber — 20-03 約束與勝利之劍  [off-roster]
  "godie-e00l.e": {
    family: "holyawakening",
    w3aId: "A0D5",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.particle.holyawakening.p04",
    extra: ["fx.w3x.particle.holyawakening.p00", "fx.w3x.particle.holyawakening.p01", "fx.w3x.particle.holyawakening.p02", "fx.w3x.particle.holyawakening.p03", "fx.w3x.particle.holyawakening.p05"],
  },
  // 英靈-亞瑟王 - 黑化Saber — 69-03 約束與勝利之劍  [off-roster]
  "godie-e00q.e": {
    family: "holyawakening",
    w3aId: "A0D5",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.particle.holyawakening.p04",
    extra: ["fx.w3x.particle.holyawakening.p00", "fx.w3x.particle.holyawakening.p01", "fx.w3x.particle.holyawakening.p02", "fx.w3x.particle.holyawakening.p03", "fx.w3x.particle.holyawakening.p05"],
  },
  // 會叫的野獸 - 傳說中的大刀 — 93-01 期末報告  [off-roster]
  "godie-ekee.q": {
    family: "darkbreathdamage",
    w3aId: "Abof",
    provenance: "w3h-override",
    via: "buff:Bbof/target",
    primary: "fx.w3x.orb.darkbreathdamage.p00",
    extra: [],
  },
  // 龍之子 - 天地志狼 — 12-04 龍氣爆發  [off-roster]
  "godie-ewar.r": {
    family: "supershinythingy",
    w3aId: "A04X",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.particle.supershinythingy.p00",
    extra: ["fx.w3x.particle.supershinythingy.p01", "fx.w3x.particle.supershinythingy.p02"],
  },
  // 白色之翼 - 涅吉。史普林。菲爾德 — 82-03 雷之投擲  [off-roster]
  "godie-h022.e": {
    family: "lightningnova",
    w3aId: "A0Q5",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.orb.lightningnova.p00",
    extra: ["fx.w3x.orb.lightningnova.p01"],
  },
  // 白色之翼 - 涅吉。史普林。菲爾德 — 82-04 闇之魔法  [off-roster]
  "godie-h022.r": {
    family: "boomnl",
    w3aId: "A0Q6",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.locust.boomnl.p01",
    extra: ["fx.w3x.locust.boomnl.p00", "fx.w3x.locust.boomnl.p02", "fx.w3x.locust.boomnl.p03", "fx.w3x.locust.boomnl.p04"],
  },
  // 種子神奇寶貝 - 妙蛙種子 — 90-04 陽光烈焰  [off-roster]
  "godie-hgam.r": {
    family: "supershinythingy",
    w3aId: "A0R4",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.particle.supershinythingy.p00",
    extra: ["fx.w3x.particle.supershinythingy.p01", "fx.w3x.particle.supershinythingy.p02"],
  },
  // 黑暗福音 - 依文潔琳 — 42-04 世界終結  [off-roster]
  "godie-n01g.r": {
    family: "frostnova",
    w3aId: "A05D",
    provenance: "jass-literal",
    via: "jass:effectLoc",
    primary: "fx.w3x.locust.frostnova.p01",
    extra: ["fx.w3x.locust.frostnova.p00", "fx.w3x.locust.frostnova.p02", "fx.w3x.locust.frostnova.p03"],
  },
  // 時空管理局執務官 - 菲特·泰斯塔羅沙 — 23-03 雷牙一閃˙雷牙烈霸  [off-roster]
  "godie-ntin.e": {
    family: "gxhuge",
    w3aId: "A0SY",
    provenance: "w3a-override",
    via: "art:missile",
    primary: "fx.w3x.particle.gxhuge.p00",
    extra: [],
  },
  // 時空管理局執務官 - 菲特·泰斯塔羅沙 — 23-01 電離光槍 - 繁星飛躍  [off-roster]
  "godie-ntin.q": {
    family: "gx",
    w3aId: "A0NA",
    provenance: "w3a-override",
    via: "art:missile",
    primary: "fx.w3x.particle.gx.p00",
    extra: [],
  },
  // 時空管理局執務官 - 菲特·泰斯塔羅沙 — 23-04 雷焰聖劍  [off-roster]
  "godie-ntin.r": {
    family: "lightningnova",
    w3aId: "A0OD",
    provenance: "w3a-override",
    via: "art:special",
    primary: "fx.w3x.orb.lightningnova.p00",
    extra: ["fx.w3x.orb.lightningnova.p01"],
  },
  // 職業獵人 - 傑 富力士 — 06-04 傑桑變化  [off-roster]
  "godie-u034.r": {
    family: "boomnl",
    w3aId: "A0Y1",
    provenance: "w3h-override",
    via: "buff:B04R/target",
    primary: "fx.w3x.locust.boomnl.p01",
    extra: ["fx.w3x.locust.boomnl.p00", "fx.w3x.locust.boomnl.p02", "fx.w3x.locust.boomnl.p03", "fx.w3x.locust.boomnl.p04"],
  },
  // 職業獵人 - 傑 富力士 — 06-04 傑桑變化  [off-roster]
  "godie-ucrl.r": {
    family: "boomnl",
    w3aId: "A0Y1",
    provenance: "w3h-override",
    via: "buff:B04R/target",
    primary: "fx.w3x.locust.boomnl.p01",
    extra: ["fx.w3x.locust.boomnl.p00", "fx.w3x.locust.boomnl.p02", "fx.w3x.locust.boomnl.p03", "fx.w3x.locust.boomnl.p04"],
  },
  // 三刀流劍士 - 索隆 — 11-01 燒鬼斬  [off-roster]
  "godie-udre.q": {
    family: "lavabreathdamage",
    w3aId: "A0BC",
    provenance: "w3a-override",
    via: "art:target",
    primary: "fx.w3x.particle.lavabreathdamage.p00",
    extra: [],
  },
  // 邪眼師 - 飛影 — 38-03 邪王炎殺黑龍波  [off-roster]
  "godie-uvng.e": {
    family: "tectonicfury",
    w3aId: "A09I",
    provenance: "w3a-override",
    via: "art:missile",
    primary: "godie-tectonicfury-p0",
    extra: ["godie-tectonicfury-p1"],
  },
  // 龍之子 - 天地志狼 — 12-002 仙氣發勁  [off-roster]  (#230)
  "godie-ewar.ex": {
    family: "supershinythingy",
    w3aId: "A0SQ",
    provenance: "jass-literal",
    via: "jass:effectTargetUnit",
    primary: "fx.w3x.particle.supershinythingy.p00",
    extra: ["fx.w3x.particle.supershinythingy.p01", "fx.w3x.particle.supershinythingy.p02"],
  },
  // 邪眼師 - 飛影 — 38-01 邪王炎殺劍  [off-roster]  (#230)
  "godie-uvng.q": {
    family: "flamessmoke",
    w3aId: "A0OG",
    provenance: "w3a-override",
    via: "art:caster+art:effect",
    primary: "fx.w3x.particle.flamessmoke.p01",
    extra: ["fx.w3x.particle.flamessmoke.p00", "fx.w3x.particle.flamessmoke.p02", "fx.w3x.particle.flamessmoke.p03"],
  },
  // 邪眼師 - 飛影 — 38-04 黑龍波吸收  [off-roster]
  "godie-uvng.r": {
    family: "flamessmoke",
    w3aId: "A09K",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.particle.flamessmoke.p01",
    extra: ["fx.w3x.particle.flamessmoke.p00", "fx.w3x.particle.flamessmoke.p02", "fx.w3x.particle.flamessmoke.p03"],
  },
  // 邪眼師 - 飛影 — 38-02 邪王炎殺煉獄焦  [off-roster]
  "godie-uvng.w": {
    family: "fireblast",
    w3aId: "A09H",
    provenance: "w3a-override",
    via: "art:missile",
    primary: "godie-fireblast-p3",
    extra: ["godie-fireblast-p0", "godie-fireblast-p1", "godie-fireblast-p2"],
  },
};

/**
 * THE SECOND SOURCE — evidence-bound FAMILY PROTOTYPES (`w3xFamilyArt.ts`).
 *
 * `W3X_ABILITY_ART` above can only promote an ability whose art SHIPPED as
 * emitter docs, which is 34 of 668. The other proven abilities point at
 * Blizzard stock models this repo does not have, so they get the family
 * PROTOTYPE the owner asked for — the same shape, rescaled/recoloured with the
 * map's own per-call-site numbers — instead of a shape guessed from their name.
 *
 * It is folded in HERE, inside `w3xArtFor`, and that is the whole integration:
 * `VfxSystem.playCastVfx` already routes anything `w3xArtFor` claims through
 * the rig (rung 1) → pooled docs (rung 2) → the `fx.prim.*` fallback (rung 3) →
 * a spark (rung 4). A family row needs none of those rungs changed. If this
 * function stopped answering, 258 casts would silently drop back to their name
 * classification — which is why `familyArtIntegration.test.ts` asserts against
 * `w3xArtFor` itself rather than against the table.
 *
 * The family row carries NO `extra`: a prototype is one emitter by
 * construction, unlike a real WC3 effect which is a set.
 */
let familyRowCache: Map<string, W3xAbilityArt> | null = null;

function familyRow(abilityId: string): W3xAbilityArt | undefined {
  familyRowCache ??= new Map();
  const hit = familyRowCache.get(abilityId);
  if (hit) return hit;
  const resolved = resolveFamilyArt(abilityId, activeFamilyTuning);
  if (!resolved) return undefined;
  const row: W3xAbilityArt = {
    family: resolved.family,
    w3aId: resolved.evidence?.w3aId ?? "",
    provenance: familyProvenance(resolved.evidence?.provenance),
    via: resolved.evidence ? `family:${resolved.evidence.via}` : "family:console",
    primary: playableFamilyKey(resolved),
    extra: [],
    // #205 —— 這兩行以前不存在,所以 `resolveFamilyArt` 算好的 per-ability
    // α / 時間倍率在這一行蒸發。ABSENT ≠ 1:沒設就不寫,下游走 identity。
    ...(resolved.alpha !== undefined ? { alpha: resolved.alpha } : {}),
    ...(resolved.timeScale !== undefined ? { timeScale: resolved.timeScale } : {}),
    // #251 —— 空間那一格。同一行、同一個第②號故障:少了它,`resolveFamilyArt`
    // 每一支都算出來的 `heightY` 在這裡蒸發,91 支貼地的衝擊波環全部浮在
    // y=1.0。**要不要採用**是 `familyCastHeightY` 讀 config 決定的,不是這裡。
    heightY: resolved.heightY,
  };
  familyRowCache.set(abilityId, row);
  return row;
}

/**
 * `W3xAbilityArt.provenance` predates this layer and names only the three
 * AUTHOR-SET channels. The family layer also carries `jass-spawn` and
 * `stock-inherited`, which have no slot in that union, so they are narrowed to
 * their nearest sibling here — `jass-spawn` → `jass-literal` (both ARE JASS
 * call sites), `stock-inherited` → `jass-literal` only because the union offers
 * nothing weaker.
 *
 * ⚠️ That narrowing LOSES information, so nothing may report provenance off
 * this field. The unnarrowed truth is `W3X_FAMILY_ART[id].provenance` and that
 * is what `w3xFamilyArt.test.ts` and any report must read. This function exists
 * solely so the old struct still type-checks.
 */
function familyProvenance(p: string | undefined): W3xAbilityArt["provenance"] {
  return p === "w3a-override" ? "w3a-override" : p === "w3h-override" ? "w3h-override" : "jass-literal";
}

// ---------------------------------------------------------------------------
// THE TUNING SEAM — why a family knob used to DELETE the effect
// ---------------------------------------------------------------------------
/**
 * ⚠️ REPRODUCED, then fixed (GH#230 L2).
 *
 * `fx.fam.*` docs are pre-baked FILES whose id encodes (family, colour,
 * quantised scale). The runtime resolves a KEY and hands it to
 * `ContentDb.vfxFor`. So every console knob that MOVES the key —
 * `families.*.scale`, `families.*.element`, per-ability `tint` / `w3xScale` —
 * used to compute a key with no file behind it:
 *
 *     vfxFor(key) = null → `playCastVfx`'s doc set is empty → rung 1 refuses
 *     (`docs.length === 0`) → rung 3 → the generic `fx.prim.*` stand-in.
 *
 * MEASURED: nudging `families.shockwaveRing.scale` 1 → 1.3 makes ALL 91
 * shockwave-ring keys miss the 78 baked files. The operator asks for a slightly
 * bigger ring and the family art of 91 abilities disappears.
 *
 * TWO LAYERS FIX IT, in this order:
 *
 *  A. MINT (`mintTunedFamilyDocs`, below). The tuned doc is BUILT — by the same
 *     `buildFamilyDocTuned` the generator uses — and registered into `VfxDefs`,
 *     which is exactly the map `ContentDb.vfxFor` reads. The knob then really
 *     applies at runtime instead of depending on someone re-running the
 *     generator, and that includes the knobs which do NOT move the key at all
 *     (`alpha` / `timeScale` / `primitive`), which were previously inert.
 *
 *  B. SNAP (`playableFamilyKey`, below). When the registry cannot answer — the
 *     degraded `ContentDb.loadByFetch` path, or any caller that reads art before
 *     content boot — fall back to the nearest BAKED doc of the SAME FAMILY and
 *     say so in the console. The effect is then "not tuned yet", never "gone".
 *
 * ⛔ What must NEVER be done here is to hide or clamp the knob. The owner asked
 * for 「用編輯器的方式彈性調整複用」; a knob that silently refuses to move is the
 * same betrayal as one that deletes the art.
 */

/** The console's live tuning doc, installed by the composition root. */
let activeFamilyTuning: ConfigVfxFamiliesDoc | null = null;

/** keys we have already complained about, so a cast does not spam the console */
const snapWarned = new Set<string>();

/**
 * Does the live registry actually carry the family docs?
 *
 * This is the discriminator between the two content paths, and it has to be a
 * PROBE rather than a flag: `ContentDb.load()` either registered the whole
 * content tree into `VfxDefs` (`fromRegistries`) or fell back to
 * `loadByFetch`, which fills a private map `VfxDefs` never sees. Minting into a
 * registry nothing reads would look like a fix and change nothing on screen
 * (failure ②), so when the probe says no we do not mint — we snap instead, and
 * a snapped key is a BAKED key, which is the one thing that path can serve.
 */
function registryCarriesFamilyDocs(): boolean {
  for (const k of bakedFamilyKeys()) return VfxDefs.tryGet(k) !== undefined;
  return false;
}

/**
 * Build + register every doc the current tuning asks for. Returns how many were
 * actually written (0 when nothing moved), which the guards read.
 *
 * A doc identical to the one already registered is skipped so the shipped
 * config — which `generateFamilyContent.ts` derives from the very same
 * constants — costs nothing and cannot shadow the bytes on disk with a
 * different object.
 */
export function mintTunedFamilyDocs(doc: ConfigVfxFamiliesDoc | null): number {
  // No console doc = shipped defaults = the files on disk are already right.
  if (!doc) return 0;
  if (!registryCarriesFamilyDocs()) return 0;
  let minted = 0;
  for (const [id, built] of requiredFamilyDocs(doc)) {
    const current = VfxDefs.tryGet(id);
    if (current && JSON.stringify(current) === JSON.stringify(built)) continue;
    VfxDefs.register(built);
    minted += 1;
  }
  return minted;
}

/**
 * The key this row may actually PLAY — the tuned one when something can serve
 * it, else the nearest baked doc of the same family.
 *
 * Returning the tuned key when neither can be verified is deliberate: with an
 * empty registry there is no information, and `VfxSystem`'s rung 3 still has
 * the ability's `fx.prim.*` under it.
 */
function playableFamilyKey(r: ResolvedFamilyArt): string {
  const tuned = r.vfxKey;
  const live = registryCarriesFamilyDocs();
  if (live && VfxDefs.tryGet(tuned)) return tuned;
  const baked = nearestBakedFamilyKey(r.family, r.colour, r.docScale);
  if (!baked || baked === tuned) return tuned;
  if (live && !VfxDefs.tryGet(baked)) return tuned;
  if (!snapWarned.has(tuned)) {
    snapWarned.add(tuned);
    console.warn(
      `[vfx-families] 「${tuned}」沒有對應的預烘特效文件，這次先退回同家族的「${baked}」——` +
        `特效不會消失，但這組調整要重新產生 doc 才會真的變大/變色：` +
        `pnpm exec tsx apps/client/src/render/vfx/generateFamilyContent.ts && pnpm content:build`,
    );
  }
  return baked;
}

/**
 * Install (or clear) the `config.vfx-families@1` overrides. Clears the memo, so
 * an admin save takes effect on the next cast without a reload — and mints the
 * docs that save now needs (layer A above; without it the save would delete the
 * art of every ability whose key moved).
 */
export function setFamilyTuning(doc: ConfigVfxFamiliesDoc | null): void {
  activeFamilyTuning = doc;
  familyRowCache = null;
  snapWarned.clear();
  mintTunedFamilyDocs(doc);
}

/** The promoted effect for an ability, or undefined when it keeps its primitive. */
export function w3xArtFor(abilityId: string | undefined): W3xAbilityArt | undefined {
  if (!abilityId) return undefined;
  return W3X_ABILITY_ART[abilityId] ?? familyRow(abilityId);
}

/**
 * The family's NON-primary emitter docs for an ability. The primary already
 * plays through `vfxKey`, so firing these completes the original effect
 * instead of showing 1-of-N of it. Empty for single-emitter families.
 */
export function extraVfxDocIds(abilityId: string | undefined): readonly string[] {
  return w3xArtFor(abilityId)?.extra ?? [];
}

/** memoized `abilityVfxKeys()` — the roster classification, built once */
let primitiveKeys: Record<string, string> | null = null;

/**
 * THE PRIMITIVE THIS ROW OVERRODE — the fallback when the promoted art cannot
 * be played.
 *
 * A promoted ability's content `vfxKey` names the w3x doc, so if that doc does
 * not resolve (content not rebuilt, an older `contentVersion` still served, the
 * doc withdrawn) the ability has NOTHING left to draw. That silent no-op is the
 * exact failure this whole batch exists to remove, so the baseline
 * classification in `./bindings` — the `fx.prim.<element>.<shape>` key the row
 * overrode — is recovered here and played instead.
 *
 * Returns undefined for the 17 OFF-ROSTER rows (duplicate hero numbers outside
 * `data/curation/whitelist.json`). They have no `bindings` row because they
 * were never classified — and they are also not castable in a match, since a
 * champion outside the whitelist cannot be picked. Callers still owe those a
 * visible cue; `VfxSystem` degrades them to a hit spark rather than to silence.
 */
export function primitiveFallbackFor(abilityId: string | undefined): string | undefined {
  // A FAMILY row needs this rung at least as much as a promoted row: its
  // `fx.fam.*` doc is generated content, so a stale `contentVersion` or a
  // missed `pnpm content:build` leaves it unresolvable — and 258 silent casts
  // is a far bigger hole than 34. Same `bindings` classification, same rung 3.
  if (!abilityId || !w3xArtFor(abilityId)) return undefined;
  primitiveKeys ??= abilityVfxKeys();
  return primitiveKeys[abilityId];
}
