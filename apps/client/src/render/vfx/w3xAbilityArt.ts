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
 * THE RENDERABILITY GATE — why only 30 of 662. Three filters, in order:
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
 * This module is PURE DATA + lookups. It imports nothing from `@babylonjs/*`,
 * so it stays importable from Node tests and the doc generator.
 */
import { abilityVfxKeys } from "./bindings";

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
  // 邪眼師 - 飛影 — 38-04 黑龍波吸收  [roster]
  "godie-u010.r": {
    family: "flamessmoke",
    w3aId: "A09K",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.particle.flamessmoke.p01",
    extra: ["fx.w3x.particle.flamessmoke.p00", "fx.w3x.particle.flamessmoke.p02", "fx.w3x.particle.flamessmoke.p03"],
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

/** The promoted effect for an ability, or undefined when it keeps its primitive. */
export function w3xArtFor(abilityId: string | undefined): W3xAbilityArt | undefined {
  return abilityId ? W3X_ABILITY_ART[abilityId] : undefined;
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
  if (!abilityId || !W3X_ABILITY_ART[abilityId]) return undefined;
  primitiveKeys ??= abilityVfxKeys();
  return primitiveKeys[abilityId];
}
