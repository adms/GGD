/**
 * THE FIELD ADOPTION CENSUS — detection recipe **S8** as a standing CI guard.
 *
 * S8 (docs/_false-completions.md) is 「機制上線、內容 0 筆」: the schema, the sim
 * and the UI all ship, every test is green, and not one content document fills
 * the field — so the mechanism never happens in a match and nothing anywhere
 * says so. It is the quietest of the 27 false completions because there is no
 * error to find: the code is correct, it is simply never reached.
 *
 * WHAT MAKES THIS TEST WORTH KEEPING (and not just a restatement of the audit)
 * --------------------------------------------------------------------------
 * Both sides of the comparison are derived AT TEST TIME:
 *
 *   supply  ← `nameSchemas`/`register` walk the Zod schemas in ./schema
 *   demand  ← the real `content/` tree, loaded through the real loader
 *
 * Nothing below hard-codes what is currently wrong. A field is censused because
 * it EXISTS, on the commit that adds it — so the next S8, the one nobody has
 * thought of yet, fails this test the day it lands. The audit doc's own version
 * of the recipe was `grep -rl '"hitFeel"' content/ | wc -l`, and a grep can only
 * ever find what you already suspected.
 *
 * That is not a hypothetical distinction. Of the three zeroes the audit named:
 *   • `hitFeel` is now on 142 ability docs and 112 champion docs,
 *   • champion weapon tags are on 33 of 113 champions (katana 20, sword 8,
 *     greatsword 3, gun 1, bow 1 — so `attackKatana`/`attackGreatsword`/
 *     `gunshot` are all reachable now),
 *   • `evasion` reached content DURING the writing of this file (7 docs).
 * A test that asserted the audit's findings would have been wrong within hours.
 * This one recomputes them and reports whatever is true today.
 *
 * WHAT IT ASSERTS
 * ---------------
 *  1. Every registered, reachable, sufficiently-sampled key has at least one
 *     content doc using it — or a documented exemption saying why not.
 *  2. No exemption is STALE. An exemption whose key has since been adopted is
 *     a hard failure, because a permanently-true exemption list is how the
 *     guard rots into a rubber stamp (same discipline as
 *     apps/game-server/src/net/eventFanout.test.ts).
 *  3. No `landing` grace has expired. See THE NEW-FIELD PROBLEM below.
 *  4. The census actually measured the whole tree (guard the guard).
 *
 * THE NEW-FIELD PROBLEM
 * ---------------------
 * A brand-new field is legitimately at zero on the day it lands — the schema
 * change and the content migration are usually two commits, often two people.
 * Failing that is how a guard gets disabled. But "it's new" with no expiry is
 * how a guard gets useless: every S8 in the audit doc was new once.
 *
 * The answer here is a BOUNDED, SELF-EXPIRING grace: status `"landing"` with a
 * `since` date. It suppresses the failure for `GRACE_DAYS`, and then the test
 * fails and names the entry. The clock does the follow-up nobody remembers to
 * do. Deliberately not `"debt"`, which never expires but is printed as a loud
 * banner on every single run — a debt you have to look at is a debt you might
 * pay; a debt that is silent is the pathology itself.
 *
 * WHAT THIS DOES NOT CATCH (stated so nobody mistakes green for coverage)
 * ----------------------------------------------------------------------
 *  • ADOPTION > 0 BUT MEANINGLESS. One doc setting a field is enough to make
 *    this test green. `craftRole: "service"` on 2 of 214 items passes here; if
 *    that is too few to matter, that is a balance/curation question and needs
 *    its own guard. This test answers exactly one question: is it ZERO.
 *  • SMALL SAMPLES. `MIN_REACH` (3) mutes every `config@1` singleton and any
 *    container present in fewer than 3 docs — `projectiles.meshShape`'s `orb`
 *    and `shard`, the `gore.style` options, the per-hook `abilitySlot` filter.
 *    A dead option inside a one-doc container will not be reported.
 *  • REQUIRED FIELDS. Present in 100 % of docs by construction, so they cannot
 *    be an S8 — but a required field the SIM never reads is a different
 *    pathology this does not look for.
 *  • CURATION. A field adopted only by docs outside the operator's whitelist
 *    still counts as adopted. Whether the whitelist reaches it is P0-2's
 *    question, not this one.
 *  • FREE-TEXT VOCABULARIES the code reads out of `string[]` fields are only
 *    censused when declared in `TAG_VOCABULARIES`. `weaponClass` is declared;
 *    a future `if (tags.includes("…"))` in some system is invisible until
 *    someone adds it there. This is the one place the guard needs a human.
 *  • THE OTHER DIRECTION. Content that sets a field NO code reads (the mirror
 *    pathology) is not this test — see the `onLevelUp` note in EXEMPTIONS,
 *    which this census found only because the member also had zero adoption.
 *
 * COST: one `ContentLoader` pass over the real tree (~1450 docs) plus a paired
 * schema/value walk. Measured ~1.4 s wall for the load and ~90 ms for the
 * census itself on an M-series laptop — the same order as
 * castTimeCoverage.test.ts, which loads the identical tree. Cheap enough to
 * run on every commit; that is the point of it existing at all.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { FsContentSource } from "./node/FsContentSource";
import {
  censusAdoption,
  formatCensus,
  unadopted,
  MIN_REACH,
  TAG_VOCABULARIES,
  type Census,
} from "./fieldAdoption";
import type { ContentStore } from "./store";
import { ALL_STATS } from "../sim/stats/statTypes";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");

/**
 * How long a `"landing"` exemption may suppress a failure. 30 days is roughly
 * "the schema commit and the content commit are in the same月", and short
 * enough that a forgotten migration surfaces while the author still remembers
 * writing it.
 */
export const GRACE_DAYS = 30;

type ExemptionStatus =
  /** the behaviour ships from a CODE DEFAULT; the field only overrides it, so
   *  zero adoption means "nobody needed to override", not "mechanism dead". */
  | "default-live"
  /** the field is filled by code that SYNTHESIZES docs at runtime, so it can be
   *  live in a match while no doc on disk carries it. */
  | "runtime-authored"
  /** content CANNOT legally set it here — another schema rule forbids it. */
  | "schema-impossible"
  /** a dead field kept for compatibility; adopting it would be the bug. */
  | "superseded"
  /** a REAL S8. Never expires, but is printed as a loud banner every run. */
  | "debt"
  /** brand new; adoption expected. EXPIRES after GRACE_DAYS — see above. */
  | "landing";

interface Exemption {
  readonly status: ExemptionStatus;
  /** why zero is acceptable, or (for `debt`) what is actually broken. */
  readonly why: string;
  /** ISO date. Required for `landing`; the grace counts from here. */
  readonly since?: string;
}

/**
 * ===========================================================================
 * THE EXEMPTION LIST — every key the census reports at zero, with a reason.
 * ===========================================================================
 *
 * RULES OF THE ROAD
 *   • A key here must currently be at zero. If it gets adopted, this test goes
 *     red and the entry must be DELETED (test 2). That is the whole reason the
 *     list cannot quietly grow into a rubber stamp.
 *   • Never add a key to silence a failure you have not understood. The three
 *     honest outcomes are: fix the content, mark it `debt` with what is
 *     actually broken, or mark it `landing` and finish the migration.
 *   • The `why` is for a reader six months from now who has never seen the
 *     field. "not used" is not a reason.
 *
 * Sorted by key, matching the census output order.
 */
const EXEMPTIONS: Readonly<Record<string, Exemption>> = {
  // --- 職業限定閘 / 道具光環 (owner 2026-07-30 的四類傳說武器) --------------
  // Three keys became REACHABLE today because `item@1` grew two surfaces:
  // `auras` (so an item can project 「周圍的友軍…」 — the three tier-5 積分獎勵
  // needed it) and its own hook variant `zItemHookDef` (`zHookDef` + `requires`).
  //
  // ⚠️ The two `items.passive[].*` keys below are NOT new FIELDS — `abilitySlot`
  // and `victim` were always authorable on an item passive. They are new CENSUS
  // KEYS: `items.passive` used to be the very same schema node as an ability's
  // hooks, so the walker counted them once, under the ability path. Extending
  // only the item's copy split that node in two, and the item side is genuinely
  // at zero. Nothing regressed; the census simply stopped rounding two surfaces
  // into one. (See schema/item.ts for why the field was added to the item's
  // copy rather than to the shared `zHookDef`.)
  // --- 觸發條件 (owner 2026-07-30 「on-attack by condition 這個一定要實作」) ---
  // ONE field on the shared `zHookDef`, so the census sees it twice: once under
  // the ability-passive hook node and once under `items.passive`, which item.ts
  // split off when it added `requires`. Both are genuinely at zero adoption
  // TODAY, and both are expected to move as the 鑄技工坊 pass re-authors the proc
  // families — the 攻擊觸發 template already ships the 獸矛 gate as its slot
  // default, so the FIRST card expanded from it adopts the ability-side key.
  //
  // ⚠️ It is `landing` and NOT `default-live`: an absent condition really does
  // mean 「無條件觸發」, so a code default is not covering for the zero. If this
  // is still red in 30 days, the honest conclusion is that no content adopted
  // the mechanism and it should be re-triaged, not re-granted.
  "field:items.passive[].condition": {
    status: "landing",
    since: "2026-07-30",
    why: "Same field, second census node (item.ts split `items.passive` off `zHookDef` when it added `requires`). The 「X% 機率造成 Y」/「血量低於 Z% 時…」 item family is the intended first adopter; none of the shipped items has been re-authored against it yet.",
  },

  "field:items.auras[].lingerSec": {
    status: "landing",
    since: "2026-07-30",
    why: "WC3's aura buff-tail. There is NO number to port — `Dur`/`HeroDur` is 0 on all 32 stock aura rows (see zAuraDef.lingerSec), so an authored value is a design choice or the anti-flicker knob. The three item auras shipped today are all pure in/out, which is the intended resting state.",
  },

  // ── RESTORED 2026-07-30, and the reason is the whole point of this census ──
  // These three were DELETED earlier today, correctly: fixing 66-04 靈壓震撼
  // (it was a permanent, free, always-on −65 % enemy attack-speed field AND a
  // dead R button) dropped `passive.ranks[].auras` to reach 1, and the CASCADE
  // rule hid its optional children. Their triage was preserved as prose ~350
  // lines below so the next aura to ship could restore them verbatim.
  //
  // That next aura arrived the same day: the 天生技 lane shipped four
  // (`godie-h01n` / `h01o` / `n01b` / `nman`), reach went 1 → 5, the cascade
  // stopped hiding the children, and the census went red again — correctly,
  // because a visible key with zero adoption and no exemption is exactly what
  // it is built to shout about. Restored below with the ORIGINAL triage, which
  // was measured against the retail MPQ `AbilityData.slk` plus the map's own
  // w3a — not against the schema comments, which disagreed with it.
  "field:abilities.passive.ranks[].auras[].lingerSec": {
    status: "landing",
    since: "2026-07-30",
    why: "MEASURED, there is no number to port: `Dur1`/`HeroDur1` is 0 on all 32 stock aura rows AND on both imported auras (`A0GM`, `A0ID`). WC3's tail is ENGINE behaviour; authoring one would be inventing content. If we ever want it, it is uniform across every aura and belongs in a 後台-tunable default, not per-doc.",
  },
  "field:abilities.passive.ranks[].auras[].hooks": {
    status: "landing",
    since: "2026-07-30",
    why: 'NOT "nobody needs it": 86 map abilities derive from a stock aura row and only 5 are ported. Waiting on three Thorns auras (`ACah` CP-00 棘刺之光, `AEah` 25-04 無想轉生 7/14/21 %, `A0XK`) and three Plague auras (`Aap1`/`Aap2`/`Aap3` 汗臭味 / 疫病雲) — neither reflection nor a periodic tick is expressible as a `StatModifier`. Resolve by porting 無想轉生 onto an `onDamageTaken` aura hook.',
  },
  "enum:abilities.passive.ranks[].auras[].affects=all": {
    status: "landing",
    since: "2026-07-30",
    why: "A DECISION, not a migration. No teamless unit can receive an aura under any value of `affects` (`world.stats.set` is called only in spawnChampion.ts / auraCarrier.ts), and 0 of the 86 aura-derived map abilities target friend and enemy together. Either author the first friend-and-foe aura or DELETE the member together with `AuraAffects` and the `affects === \"all\"` early-return in `affectsTarget`.",
  },
  "field:items.passive[].abilitySlot": {
    status: "landing",
    since: "2026-07-30",
    why: "Restricts an item hook to one ability slot. No shipped item wants that yet — every item passive today keys off 普攻/受擊/施法 in general, not off Q vs W. New census key from the item-hook split, not a new capability.",
  },
  "field:items.passive[].victim": {
    status: "landing",
    since: "2026-07-30",
    why: "Pays a hook differently for a 部隊 kill vs a 英雄 kill (#244). Reachable on items since the hook split; the natural first customer is a 「對部隊造成N倍傷害」 legendary (雷神之鎚's own text), which is still an inert 製作書. New census key, not a new capability.",
  },

  // --- 無敵/免疫 (GH#289 lane P3, content bound 2026-07-30) ---------------
  // These four enum members were UNREACHABLE until today: the census only
  // descends into a variant's own fields once the variant itself has adoption,
  // and `variant:abilities.effects[]#invulnerable` was 0/805 until the 13 docs
  // below were bound. So they are new-today in exactly the sense `landing` is
  // for, and the clock starts now.
  //
  // WHAT IS ACTUALLY MISSING. The 13 bound docs are the ones with a JASS
  // site to point at (`SetUnitInvulnerable` / `UnitAddAbility('Avul')` in
  // war3map.j) — every one of them is a full-invulnerability window on the
  // CASTER, i.e. `applyTo:"self"` + `blocksDamage:"all"`. The other three
  // damage modes are the map's OTHER invulnerability family, described in
  // ability TEXT with no JASS trigger:
  //   · 魔法免疫  47-04 天翔龍閃 / 97-04 火產靈神 / 99-04  → blocksDamage:"magic"
  //   · 純免控    07-01 臨、兵、鬥「可抵擋對方負性魔法」    → blocksDamage:"none"
  // Binding those needs a description-vs-JASS adjudication (the map has no
  // trigger for them, so the WC3 native ability data is the only source), and
  // that is a separate pass — NOT something to guess at here.
  //
  // ⚠️ CORRECTION 2026-07-30 (第三守則 — the previous version of this comment
  // was WRONG and is kept visible rather than quietly rewritten). It claimed
  // "every one of the bound docs is a window on the CASTER" and that
  // `applyTo:"target"` is text-only with "no JASS trigger". Re-reading
  // war3map.j, both halves are false — there are TWO `UnitAddAbilityBJ('Avul', …)`
  // sites whose subject is the SPELL TARGET, not the caster:
  //   · :51731  Trig_Trample_Start   → udg_Buncle_trample_Target  (52-02 蹂躪編年史)
  //   · :52065  Trig_Nine_Lives_EX   → udg_Buncle_Nine_Target     (52-002 射殺百頭,
  //             which grants Avul to the caster at :52064 AND the target at :52065)
  // So `applyTo:"target"` has a real JASS provenance, and the two 52-xx docs
  // currently ship `applyTo:"self"` — 52-002 is half-right (it keeps the caster
  // grant, drops the target one) and 52-02 is inverted outright.
  // NOT fixed here on purpose: in WC3 the victim's Avul is a MECHANIC SHIELD
  // (PauseUnit + SetUnitPathing false + 'Arav' raven form) that keeps the body
  // alive while it is carried, and the ability's own damage lands only after
  // :51835 removes it. Porting that as-is would make our trample refuse its own
  // damage packet. Whether GGD wants the fidelity or the simpler self-window is
  // a DESIGN DECISION for the owner, not something to guess at while the
  // exemption clock is the only thing forcing the question.
  // `blocksDamage:"physical"` has no known case in this map at all; if the
  // 30 days expire with it still empty, `debt` or deletion is the honest call.
  "enum:abilities.effects[]#invulnerable.applyTo=target": {
    status: "landing",
    since: "2026-07-30",
    why: "Has REAL JASS provenance — war3map.j:51731 (52-02 蹂躪編年史) and :52065 (52-002 射殺百頭) both add 'Avul' to the spell TARGET — plus the AoE form 29-03 有功夫無懦夫「統統進入無敵狀態」. Not bound yet because in the source the victim's Avul is a mechanic shield removed (:51835) before the ability's own damage lands; porting it literally would make the skill refuse its own damage. Needs an owner decision (fidelity vs. the simpler self-window), which is why the 30-day clock is the right pressure here.",
  },
  "enum:abilities.effects[]#invulnerable.blocksDamage=none": {
    status: "landing",
    since: "2026-07-30",
    why: "純免控 (07-01 臨、兵、鬥「可抵擋對方負性魔法」) — the one shape that blocks CC while still taking damage; text-only, same follow-up pass.",
  },
  "enum:abilities.effects[]#invulnerable.blocksDamage=physical": {
    status: "landing",
    since: "2026-07-30",
    why: "No 物理免疫-only ability is known in this map; the enum member exists for symmetry. If this is still empty when the grace expires, the honest outcome is `debt` or removing the member.",
  },

  // --- hit-feel: the sim DERIVES every one of these from the damage tier.
  // An authored value is an override, so zero authored overrides is the
  // designed resting state, not a dead mechanism (task #133).
  "enum:abilities.hitFeel.sparkKind=counter": {
    status: "default-live",
    why: "sim/combat/hitFeel.ts:131 emits `counter` itself when the hit is a counter — content authoring it would only pin what the default already picks situationally.",
  },
  "enum:abilities.hitFeel.sparkKind=hit": {
    status: "default-live",
    why: "`hit` IS the default spark (hitFeel.ts SparkKind head). Authoring it explicitly writes the fallback into 662 docs for no behaviour change.",
  },
  "field:abilities.hitFeel.exFreeze": {
    status: "default-live",
    why: "cosmetic client-side EX freeze; the default already applies it to EX hits only. An override is for an ability that wants a non-EX freeze.",
  },

  // --- recovery / cast root: LIVE BY DEFAULT, deliberately (task #181,
  // sim/abilities/abilityRecovery.ts DEFAULT_RECOVERY_SEC = 0.6). Absence of
  // the field does NOT mean absence of the 後搖 — every ability has one.
  // --- #244 hook victim filter. `"any"` IS the absent behaviour, so writing it
  // into a doc is a no-op. The two filtering members ("mob"/"champion") are
  // authored on 黑泥吞噬 and 飛將神弓 respectively, which is the proof the
  // mechanism works end to end.
  "field:abilities.recoveryRoots": {
    status: "default-live",
    why: "defaults false ON PURPOSE (recovery locks output, not movement — abilityRecovery.ts DECISION 2). Zero adoption = no ability has opted into the full lock.",
  },
  "field:abilities.rootWhileCasting": {
    status: "default-live",
    why: "abilitySystem.ts:239 `def.rootWhileCasting !== false` — every cast roots unless a doc opts out, and none does.",
  },
  "field:champions.abilities.*.recoveryRoots": {
    status: "default-live",
    why: "mirror of field:abilities.recoveryRoots.",
  },
  "field:champions.abilities.*.rootWhileCasting": {
    status: "default-live",
    why: "mirror of field:abilities.rootWhileCasting.",
  },

  // --- #205 多層特效模板: the OPTIONAL per-layer overrides ---------------------
  //
  // `field:abilities.vfxLayers` and its champion-embedded mirror USED to sit
  // here as `landing`. Both were deleted on 2026-07-30 because they got
  // adopted: 10 standalone ability docs and 8 champion docs now ship a stack
  // (godie-e008.q/.e, godie-h02r.q, godie-hgam.q, godie-hlgr.e, godie-hvwd.e,
  // godie-nman.w, godie-o02v.w, godie-othr.w, godie-u00j.ex). That is the
  // migration this census was holding open, and it happened.
  //
  // What is left at zero is a DIFFERENT thing: the four optional per-layer
  // override cells and one enum member. Those 10 shipped stacks author
  // `attachTo:"point"`, `delayMs`, `flyHeight` and `w3xScale` — measured, not
  // assumed — and spell every other knob by omission. Each entry below names
  // the admin cell that writes it and the runtime line that reads it, and the
  // WHOLE chain (admin form cell → ability doc → real zAbilityDoc → real
  // VfxSystem → real Babylon ParticleSystem) is driven by
  // apps/client/src/vfx/VfxSystem.layerKnobs.test.ts. So none of these is
  // "schema has a field": an operator who fills the cell sees the picture
  // change, and if that ever stops being true, that file goes red — not this
  // one.
  "enum:abilities.vfxLayers[].attachTo=caster": {
    status: "default-live",
    why: "`caster` IS the absent behaviour: schema/abilityVfx.ts:231 resolves `layer.attachTo ?? \"caster\"`, and render/vfx/abilityLayers.ts:126 only leaves the caster when the value is \"point\". Writing it explicitly therefore produces a byte-identical ResolvedVfxLayer — and because attachTo is not one of the picked override fields it does not enter the pool-key signature either, so not even the particle pool can tell the two apart. The admin dropdown offers it (vfxLayers.ts:134-138 ATTACH_OPTIONS) so an operator can pin a layer down deliberately; all 10 shipped stacks spell it by omission, which is the designed resting state. The sibling member \"point\" is authored on 6 of those 10 docs, which is what proves the enum is read at all.",
  },
  "field:abilities.vfxLayers[].enabled": {
    status: "default-live",
    why: "ABSENT == play. schema/abilityVfx.ts:227 `if (layer.enabled === false) continue` is the only thing this field can do, so `enabled: true` is a no-op and `enabled: false` is a WORKBENCH state — 'mute this layer but keep its settings' while an operator auditions a stack in 鑄技工坊 (admin vfxLayers.ts:157/236, label 「這一層播不播」). Shipped content at zero is therefore correct by construction: a layer that ships disabled is a layer that should have been deleted. Proven live by VfxSystem.layerKnobs.test.ts, which switches the second layer off in the form and watches the engine come back with one emitter instead of two.",
  },
  "field:abilities.vfxLayers[].tint": {
    status: "default-live",
    why: "ABSENT == untinted (keep the template's own ramp). Admin writes it as three 0-255 cells that must be filled together or left blank together (vfxLayers.ts:164-166/248-251 + validateLayerDraft's all-or-nothing rule); runtime consumes it at render/vfx/abilityLayers.ts:56, dividing by 255 into ArtParams before applyArtParams re-hues every stop. Zero adoption = every shipped stack points at a template whose colour is already the colour it wants — which is exactly what #205's 'one prototype, many looks' promises when the prototype was picked well. VfxSystem.layerKnobs.test.ts fills 255/40/40 on an icy-blue template and reads r > b back off the engine, so the recolour is measured, not asserted.",
  },

  // --- absent == identity. Writing the neutral value into every doc is
  // explicitly forbidden by the schema comments (zTintRgb / zAlpha: "we never
  // write [1,1,1]"), so zero here is the schema's own instruction being obeyed.
  "field:champions.alpha": {
    status: "default-live",
    why: "zAlpha: ABSENT == 1 (opaque). No w3x champion is authored translucent, and schema/champion.ts forbids writing the identity value.",
  },
  "field:skins.alpha": {
    status: "default-live",
    why: "same contract as champions.alpha; the 5 shipped skins are all opaque.",
  },
  "field:skins.tint": {
    status: "default-live",
    why: "zTintRgb: ABSENT == untinted, and `[1,1,1]` must never be written. Skin tint is for a recolour variant; none has shipped.",
  },

  // --- structurally impossible here.
  "field:champions.abilities.*.innateKind": {
    status: "schema-impossible",
    why: "zChampionDoc pins the embedded slots to Q/W/E/R, and zAbilityDoc.refineInnate REJECTS innateKind on anything but slot PASSIVE. A doc setting it would fail to load.",
  },

  // --- dead fields kept for compatibility. Adoption would be the bug.
  "field:items.iconKey": {
    status: "superseded",
    why: "the skeleton-era symbolic key, replaced by `icon` (214/214 adopted). schema/item.ts calls it legacy in so many words.",
  },
  "field:status-effects.iconKey": {
    status: "superseded",
    why: "same legacy key as items.iconKey; status effects render from `polarity` + tags today.",
  },

  // --- filled by code, not by files.
  "field:vfx#vfx@1.spriteSheet": {
    status: "runtime-authored",
    why: "apps/client/src/render/vfx/w3xEmitter.ts:520 SYNTHESIZES the VfxDoc and sets spriteSheet from the w3x emitter's rows/cols at load; particleFactory.ts:244 consumes it. Live in matches, absent from content/.",
  },

  // --- 變身 (#249). The `championForm` VARIANT itself is adopted — 3 of the 26
  // w3x pairs ship the effect today (godie-nsjs.e 妖狐變化, godie-umal.r
  // ChangeDNA, godie-ofar.r 瘋狂皮卡丘), which is what proves the path runs end
  // to end. These are its two OTHER direction values, and both are waiting on
  // content that is deliberately not in the first batch:
  "enum:abilities.effects[]#championForm.to=base": {
    status: "landing",
    since: "2026-07-29",
    why: "`to: \"base\"` is a MANUAL cancel — 'drop the form now, before it expires'. No w3x ability asks for one: all 26 metamorphoses either time out on `ahdu` or are toggles, and the automatic reverts (expiry, death, combat end) go through `revertToBaseForm` in ChampionFormSystem, not through an authored effect. It is exercised by championFormContent.test.ts on all 26 pairs, so the direction works; what is missing is a DESIGN decision that some hero should be able to cancel early. Resolve by authoring it on that hero, or reclassify to \"runtime-authored\" once the owner rules that no hero ever will.",
  },
  // --- 護盾類型過濾 (GH#289 lane P6). owner 2026-07-30:「護盾的確有分**吸收所有
  // 傷害**跟**吸收 AP 傷害 only**」. The `magic` member is ADOPTED — 破法對咒
  // (godie-o00l.e / godie-o02s.r plus both champion-embedded mirrors) is the
  // WC3 `Aam2` anti-magic barrier and now says so, which is what proves the
  // filter runs end to end. These are the three OTHER members, and each is
  // zero for a DIFFERENT reason:
  "enum:abilities.effects[]#shield.absorbs=all": {
    status: "default-live",
    why: "`all` IS the absent behaviour, and combat/damage.ts `addShield` NORMALISES an explicit \"all\" away rather than storing it — so a doc that writes it produces a byte-identical pool to a doc that omits it. Zero adoption is the designed resting state (every one of the other shipped shields is an all-shield spelled by omission); a non-zero count here would mean somebody wrote the default into a doc for no behaviour change.",
  },
  "enum:abilities.effects[]#shield.absorbs=physical": {
    status: "debt",
    why: "the sim honours it (sim/effects/shieldAbsorb.test.ts drives a real step for every member) but NO shipped doc is a physical-only barrier: the map's three shield spells are 破法對咒 (magic, now authored), 守護之光 「阻擋任何傷害」 and 機警 「可抵擋90%傷害」, both genuinely all-type. The member exists because the enum mirrors `DamageType` — the seam's stated reason (sim/effects/effect.ts) — not because content asked. Kept `debt` rather than `landing` so it stays in the banner instead of expiring into silence; delete this entry when a physical-only barrier is imported, or narrow the enum to `\"all\" | \"magic\"` if owner rules none ever will be.",
  },
  "enum:abilities.effects[]#shield.absorbs=true": {
    status: "debt",
    why: "same story as the physical member, one step further: a true-damage-absorbing pool would also eat the arena fire ring (#270 made the burn true damage), which is a balance decision nobody has made. Live in the sim, unused by content, deliberately visible here until it is either authored or removed.",
  },

  // "enum:abilities.effects[]#championForm.to=toggle" exemption DELETED
  // 2026-07-29, exactly as its own text instructed. It held the three w3x
  // toggles back because both halves of each pair share one modelKey, so the
  // swap is invisible — but the owner ruled 「紮根 + 取代芬多精變形」 for
  // 白木卡迪那 #70, and `godie-e00s.passive` (70-00 紮根, A0O6) now ships
  // `to: "toggle"` on the 天生技 slot. The direction is adopted; what a player
  // sees change is the STAT SHEET (armor 2 → 10, the w3a's own
  // 「初使裝甲增加為10點」) and the snapshot's FORM bit, not the mesh.
  // Guarded end-to-end by sim/championFormToggle.test.ts.

  // --- landing: the schema arrived on this branch, the content arrives with
  // the bake it describes.
  "field:models.voxel": {
    status: "landing",
    since: "2026-07-26",
    why: "task #229's 鑄形工坊 studio authors this block and task #226's `pnpm voxel:gen` consumes it; the field is the seam BETWEEN the two, so it lands with the schema and is populated when the first generated model doc is written (the studio's own save, or #226's five archetype docs). Zero adoption today is correct — no generated model exists yet — and NOT permanent: `packages/shared/src/voxel/doc.test.ts` proves a populated doc validates, so the only thing missing is a saved character. Delete this entry the moment one lands.",
  },

  // "enum:abilities.effects[]#applyBuff.modifiers[].op=capRaise" exemption
  // DELETED 2026-07-28 (#188/#189), exactly as its own text instructed: the
  // owner made the balance call the entry was waiting on, and TWO shipped docs
  // now author the op — `augments/limit-breaker` (稜彩 攻速 ×2 + 解鎖 10.0) and
  // `items/endless-edge` (傳說近戰武器). The mechanism is no longer a mechanism
  // with no content.

  // --- an enum member with a documented decision to stay unused.
  "enum:arenas.groundStyle=wood": {
    status: "default-live",
    why: "apps/client/src/render/groundMaterials.test.ts:25 already pins this: `wood` is in the enum, no shipped arena uses it, and groundTextureSet falls back to stone. Deliberate.",
  },

  // ===================================================================
  // DEBT — real S8s. Each of these is a mechanism that ships and never
  // happens. They print as a banner on every run until someone fixes them.
  // ===================================================================
  // "field:abilities.passive.ranks[].auras" exemption DELETED 2026-07-25: the
  // JASS effect-audit batch converted 66-04 靈壓震撼 (godie-e00t.r, A0IC/A0ID)
  // to a passive slow-aura — the first content aura, so the key is adopted.
  "field:abilities.descriptionRoles": {
    status: "debt",
    why: "task #114 (semantic colour-role markup) is marked COMPLETE and the render path handles it, but the importer has never been re-run, so 0 of 662 abilities carry it and every tooltip falls back to plain text. schema/ability.ts predicted exactly this: 'absent until the importer re-runs'.",
  },
  "field:champions.abilities.*.descriptionRoles": {
    status: "debt",
    why: "the champion-embedded mirror of the above; same missing importer run.",
  },
  // `field:champions.abilities.*.hitFeel` was exempt here as "a MIRROR GAP, not a
  // plain zero" — 30 standalone ability docs carried hitFeel and 0 of their
  // champion-embedded twins did. The gap is closed: all 30 embedded copies now
  // carry it, so the exemption became a lie and this suite said so. Deleted
  // rather than re-worded, which is what the stale-exemption check asks for.
  "field:champions.baseAttackTime": {
    status: "debt",
    why: "task #144 (per-champion w3x movement/attack speed) is still pending, so all 113 champions use BasicAttackSystem.ts:173's `?? 1.0` and every hero attacks at the same base cadence — the w3x per-hero values were never imported.",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].on=onDamageDealt": {
    status: "debt",
    why: "sim/combat/damage.ts:582 FIRES this hook every time damage is dealt, and no content subscribes to it across all 43 hook-carrying docs (abilities, items, augments, champion passives). Every on-damage-dealt proc in the source map is currently unimported.",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].on=onLevelUp": {
    status: "debt",
    why: "the opposite failure, found by the same census: the member exists in zHookEvent and in modifiers.ts's HookEvent type, but NOTHING in sim/ ever fires it. Content adopting it would be inert. Resolve by implementing the dispatch or deleting the member — do not 'adopt' it.",
  },
  "enum:items.craftRole=direct": {
    status: "debt",
    why: "extract_item_roles.py recovers 7 roles from the map triggers and assigned `direct` to nothing across 214 items. Either the extractor never emits it (a recovery gap worth checking against the JASS) or the role is redundant and should leave the enum.",
  },
  // `enum:status-effects.polarity=buff` used to sit here: all 5 shipped
  // status-effect docs were debuffs. The #247 JASS-fidelity follow-up adopted
  // it — `moon-combo` is the 者、皆、陣 combo window (war3map.j:34438), a
  // caster-side marker that is unambiguously positive — so the exemption became
  // a lie and was deleted, which is exactly what this census asks for.
  // 鑄技工坊 (Skill Forge P1, #141/#205): the `template` link landed on
  // zAbilityDef this commit, and the 29 template@1 docs + the pure expand() ship
  // with it, but NO existing content doc references a template yet — the editor's
  // job is to re-author skills onto them. Until the 8 enabled families are
  // adopted by real content this is an intentional zero. Kept as `debt` (not
  // `landing`) so it stays visible in the banner rather than silently expiring.
  "field:abilities.template": {
    status: "debt",
    why: "Skill Forge P1: the template@1 schema + expand() are live and the diff=0 roundtrip (godie-hgam.e via tpl-instant-blast) is proven in expand.test.ts, but no shipped ability yet stores template{ref,params} — that migration is the editor's writeback, done skill-by-skill. Adopting one skill turns this green.",
  },
  "field:champions.abilities.*.template": {
    status: "debt",
    why: "the champion-embedded mirror of abilities.template; adopted at the same moment the first Q/W/E/R skill is re-authored onto a template (the mirror writeback writes both copies).",
  },

  // ── 靈氣 (auras) — the container FELL BACK UNDER MIN_REACH on 2026-07-30 ---
  // It crossed the floor on 2026-07-29 when 66-04 靈壓震撼 (abilities/
  // godie-e00t.r + its champion mirror) joined 70-00 芬多精 (abilities/
  // godie-e010.passive). 66-04 has since been withdrawn from the aura family,
  // and NOT as a balance whim: `A0IC`'s base is `AEim` (Immolation), a TOGGLE,
  // and war3map.j hands the slow aura `A0ID` to the player ONLY while that
  // toggle is up — `SetPlayerAbilityAvailableBJ(false,'A0ID',…)` at spawn
  // (j:48787), `true` on the `immolation` order (j:48915), `false` again the
  // moment buff `B025` drops (j:48941). Authored as a PERMANENT passive it was
  // a free, always-on −65 % enemy attack-speed field, and the R button was
  // simultaneously dead (`isPassiveOnly` → `"passive"`). It is now a real cast;
  // see abilities/godie-e00t.r.json and sim/abilities/inertActives.test.ts.
  //
  // So `passive.ranks[].auras` is back to reach 1 (70-00 芬多精 alone), THE
  // CASCADE RULE hides its optional children again, and the three exemptions
  // that used to sit below — `…auras[].lingerSec`, `…auras[].hooks` and
  // `enum:…auras[].affects=all` — were DELETED rather than re-worded, which is
  // what this census asks for when it stops claiming anything about a key.
  // Their triage is preserved here so the next aura to ship can restore them:
  //   · lingerSec — MEASURED, there is no number to port: `Dur1`/`HeroDur1` is
  //     0 on all 32 stock aura rows AND on both imported auras (`A0GM`,
  //     `A0ID`). WC3's tail is ENGINE behaviour; authoring one would be
  //     inventing content, and if we ever want it, it is uniform across every
  //     aura and belongs in a 後台-tunable default.
  //   · hooks — NOT "nobody needs it": 86 map abilities derive from a stock
  //     aura row and only 1 is now ported. Waiting: three Thorns auras (`ACah`
  //     CP-00 棘刺之光, `AEah` 25-04 無想轉生 7/14/21 %, `A0XK`) and three
  //     Plague auras (`Aap1`/`Aap2`/`Aap3` 汗臭味 / 疫病雲). Neither reflection
  //     nor a periodic tick is expressible as a `StatModifier`. Resolve by
  //     porting 無想轉生 onto an `onDamageTaken` aura hook.
  //   · affects=all — a DECISION, not a migration. No teamless unit can receive
  //     an aura under any value of `affects` (`world.stats.set` is called only
  //     in spawnChampion.ts / auraCarrier.ts), and 0 of the 86 aura-derived map
  //     abilities target friend and enemy together. Either author the first
  //     friend-and-foe aura or DELETE the member together with `AuraAffects`
  //     and the `affects === "all"` early-return in `affectsTarget`.
  //
  // All four were triaged against the SOURCE (`Units\AbilityData.slk` out of
  // the retail MPQs + the map's own w3a) rather than against the schema
  // comments, and they did NOT come out the same way. The evidence, once:
  //
  //   · stock FRIENDLY aura rows in AbilityData.slk list `self` in
  //     `targs1`; the ones that do not are the emplacement regen auras `Aoar`
  //     (Ward) and `Aabr` (Statue) — while `AIgx`, the same aura carried by a
  //     hero as an item, puts `self` back.
  //   · `Dur1` / `HeroDur1` is 0 on ALL 32, and on both imported auras.
  //   · the map derives 86 abilities from those 32 rows; 2 are ported.
  //   · 0 of the 86 target friend AND enemy.
  //
  // `field:abilities.passive.ranks[].auras[].includeSelf` was exempt here as
  // "default-live — both shipped auras want the default". The source says
  // otherwise: 70-00 芬多精 is `A0GM`, base `Aoar`, `targets_allowed` NOT
  // overridden, so it carries no `self` and does not heal 白木卡迪那 itself.
  // The honest resolution was option 1 (AUTHOR THE CONTENT), so
  // `abilities/godie-e010.passive.json` now ships `includeSelf: false` and the
  // entry is deleted. It also took a code fix to become real: `includeSelf` is
  // tested as `target === self` and a 虛擬蝗蟲群 is kept out of the broad phase,
  // so the host used to arrive through the `ally` branch and the field could
  // not move a number — aura.ts now resolves 「self」 through
  // `world.auraCarrier`. Guarded end-to-end by sim/auraIncludeSelf.test.ts.
  "variant:abilities.effects[]#evasion": {
    status: "landing",
    since: "2026-07-30",
    why: "GH#289 lane P5 landed the MECHANISM (sim/effects/evasion.ts + the DECISION-5 ability channel in combat/evasion.ts); the content half is a separate lane and content/ is a single-threaded domain this session. NOT 'nobody needs it' — the source map has named abilities waiting: the timed-dodge shape is 12-00 感應意脈 (+20% 迴避), 74-00 JENOVA (15%), 92-00 憂鬱的眼神 (18%). Note the STAT half is already adopted (13 content files author `stat: evasion` on 3 champion docs, 8 ability docs and the phantom-step augment), so what is unadopted is specifically the TIMED-GRANT effect variant, not the evasion axis. Resolve by porting one of those three onto an `evasion` effect with an explicit durationSec; the 30-day expiry is the reminder, because 'the primitive landed, the content did not' is exactly the S8 this census exists to catch.",
  },
  "variant:abilities.effects[]#summon": {
    status: "landing",
    since: "2026-07-30",
    why: "GH#289 lane P2 landed the MECHANISM (sim/effects/summon.ts + sim/summons.ts: real bodies through the SHARED mobs.spawnUnitBody, the champion stat pipeline via the SummonComp level seam, formation/lifetime/team/cap/owner-death as content fields, and summonSystem at step slot 9d″); the content half is a separate lane and content/ is a single-threaded domain this session. NOT 'nobody needs it', and that is MEASURED not asserted: docs/ability-templates.md classifies 52 map abilities as 「召喚代理」 — the largest single behaviour family in the game — and the TRUE-summon subset among them is named and sourced. 96-04 獨孤九劍 spawns 9 sword spirits 'o02X' with a 10 s timed life (j:44907-44930); 91-002 亡靈大軍 rings 8 ghouls 'u031' at 450u and orders them at the target point (j:53391); 18-04 億年樹 summons 'n010' for 9 s × level (j:28040-28106); 37-02 黑核晶 caps concurrent crystals at 7 and 「超過殺最舊」 (j:44592-44657) — which is literally where `maxAlive` + `onCap: \"replaceOldest\"` come from; 35-00 召喚佩 is a persistent pet (j:42909-42915); 33-01 放山雞 spawns 'n000'. Today every one of those is text-only. Resolve by porting 96-04 or 91-002 onto a `summon` effect (both are `formation: \"ring\"` + `durationSec`, i.e. no new mechanism needed). The mechanism itself is proven end to end by sim/effects/summon.test.ts, which runs a real SimWorld.step() and reads the bodies back off world.transform / world.health / world.team, with recorded mutations on expiry, cap, eviction and owner-death. The 30-day expiry is the reminder, because 'the primitive landed, the content did not' is exactly the S8 this census exists to catch.",
  },
  // ══ 2026-07-31 技能批次:條件系統 + 擊退 + 變身天生技一起落地 ══════════════
  // 這一整段是同一天四條 lane 的產物,所以它們的 zero 有同一個形狀:
  // **機制上線了,而第一批內容只用了每個選項裡的一個**。逐條分開寫的理由是
  // status 不同 —— 有一半是「不寫就是它」(default-live,永遠會是 0),
  // 另一半是「真的還沒有人選」(landing,30 天後要回來看)。

  // ── 觸發條件的比較運算子 ───────────────────────────────────────────────
  // 出貨內容只用到 `<`(59-00 暴走:生命 < 5%)與 `>`(52-00 十二道試煉:
  // 生命 > 1% 才流失)。其餘三個是鑄技工坊下拉選單裡真的選得到的成員。
  // ⚠️ 不是 default-live:`op` 是必填,沒有「不寫就是這個」的預設。
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|0.op=!=": {
    status: "landing",
    since: "2026-07-31",
    why: "比較運算子,鑄技工坊 ConditionEditor 的下拉選單成員之一(apps/editor/src/forge/ConditionEditor.tsx)。出貨的兩張條件卡都是門檻式(`<` / `>`),沒有一張需要相等比較。第一個自然的採用者是「等級剛好 N」或「層數 == 上限」這種整數比較 —— 目前沒有這種卡。若 30 天後仍是 0,誠實的結論是這三個成員該從 zCondition 拿掉,而不是硬編一張卡去餵它。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|0.op=<=": {
    status: "landing",
    since: "2026-07-31",
    why: "同上。`<=` 與已採用的 `<` 在浮點生命百分比上實務差異幾乎為零,所以它會是最後一個被採用的成員 —— 這是預期,不是缺陷。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|0.op===": {
    status: "landing",
    since: "2026-07-31",
    why: "同上。相等比較在整數軸(level / 層數)才有意義,而條件目前唯一被授權的整數軸是 level,還沒有卡用它。",
  },

  // ── 觸發條件的屬性軸 ───────────────────────────────────────────────────
  // 出貨的兩張條件卡都讀 `hp`。下面十個成員是同一個下拉選單的其他選項。
  // 它們共用一條 why:機制是同一條 `evaluateCondition` 的 `stat` 分支,
  // 已經被 hp 證明會動(sim/content/condition.test.ts 讀真的 world.stats)。
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|1.stat=ad": {
    status: "landing",
    since: "2026-07-31",
    why: "條件的屬性軸。`hp` 已採用並由 condition.test.ts 讀真實 world.stats 驗證,所以走訪路徑是活的;這十個成員差在「有沒有一張卡想讀它」。攻擊力門檻的自然客戶是「攻擊力高於 N 時追加」這一類 —— owner 2026-07-30 明說要的「>=< 某個常數或某個數值條件」正是這個軸,所以它是 landing 不是 debt。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|1.stat=agi": {
    status: "landing",
    since: "2026-07-31",
    why: "同 stat=ad。三圍軸(str/agi/int)在 #248 之後才真的活起來(三圍→AD/攻速/AP),條件讀它是下一步而不是這一步。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|1.stat=ap": {
    status: "landing",
    since: "2026-07-31",
    why: "條件的法強軸。`hp` 已採用並由 condition.test.ts 讀真實 world.stats 驗證,所以走訪路徑是活的;差的是「有沒有一張卡想讀它」。法強門檻的自然客戶是法系的「法強超過 N 時改放強化版」—— w3x 那批「智力達 X」的敘述今天全部靠 perRank 表達,而 perRank 是技能等級不是屬性。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|1.stat=armor": {
    status: "landing",
    since: "2026-07-31",
    why: "條件的防禦軸。同一條 `stat` 分支,已由 hp 證明會動。防禦門檻的自然客戶是穿透類:「對防禦高於 N 的目標改走真實傷害」—— 這正是 owner 2026-07-30 講的「>=< 某個常數或某個數值條件」在坦克向上的讀法,所以是 landing 不是 debt。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|1.stat=attackSpeed": {
    status: "landing",
    since: "2026-07-31",
    why: "條件的攻速軸。同一條 `stat` 分支。自然客戶是攻速流的「攻速達上限後把溢出換成傷害」—— 要等 #286(攻速解鎖上限 10.0)落地才有意義,所以它排在那張票後面。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|1.stat=int": {
    status: "landing",
    since: "2026-07-31",
    why: "條件的智力軸。三圍(str/agi/int)在 #248 之後才真的活起來(三圍→AD/攻速/AP),而條件讀三圍是再下一步:今天所有「智力達 X」的敘述都寫在描述文字裡,沒有一支變成可判定的門檻。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|1.stat=level": {
    status: "landing",
    since: "2026-07-31",
    why: "同 stat=ad,而且是這十個裡最可能先被採用的一個:w3x 有一整批「N 級之後才…」的天生技,它們今天全部靠 perRank 表達,那是升技能等級不是升英雄等級 —— 兩者在這個遊戲裡並不同步。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|1.stat=magicResist": {
    status: "landing",
    since: "2026-07-31",
    why: "條件的魔抗軸。同 armor,兩者在 w3x 的敘述裡幾乎總是成對出現(「防禦或魔抗高於 N」),所以它們會同時被採用或同時留在 0。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|1.stat=moveSpeed": {
    status: "landing",
    since: "2026-07-31",
    why: "條件的移速軸。同一條 `stat` 分支。自然客戶是追擊類的「目標移速低於 N 時追加傷害」(配合減速),w3x 有這個家族但今天都只做了減速那一半。",
  },
  "enum:abilities.effects[]#applyBuff.hooks[].condition|0|1|1.stat=str": {
    status: "landing",
    since: "2026-07-31",
    why: "條件的力量軸。同 int:三圍在 #248 之後才活,而條件讀三圍還沒有任何一張卡。力量門檻的自然客戶是「力量高於 N 時擊退距離加倍」這種近戰卡。",
  },

  // ── 不寫就是它(default-live):寫出來與不寫出來產生一模一樣的行為 ──────
  "enum:abilities.effects[]#applyStatus.applyTo=target": {
    status: "default-live",
    why: "sim/effects/applyStatus.ts:20 `e.applyTo === \"self\" ? [ctx.caster] : ctx.targets` —— 缺席就是 target。唯一被寫出來的是 \"self\"(暴走把 berserk 貼在自己身上、moon-combo 的連段視窗),而那是因為它跟預設相反。target 永遠會是 0,除非有人為了可讀性刻意寫滿。",
  },
  "field:abilities.effects[]#knockback.applyTo": {
    status: "default-live",
    why: "缺席就是「每個被打到的人」。寫出來只有一個用途:`self`,也就是後座力(自己被自己的招震退)。四支出貨的擊退全部是正常的推人,所以這一格空著才是對的。",
  },
  "field:abilities.effects[]#knockback.hpBasis": {
    status: "default-live",
    why: "缺席就是 \"max\",也就是 GH#193 的出貨規則(擊退距離對照的是最大生命)。\"current\" 是處決風味的另一種讀法,兩者差一個下拉選單。四支出貨的擊退都要可預測的距離,所以都吃預設。",
  },
  "field:abilities.effects[]#knockback.impactPower": {
    status: "default-live",
    why: "缺席 = 只有 `distance` 那個地板值,不跑 GH#193 的重量法則。它是「這一擊有多重」的額外軸(以傷害為單位但不造成傷害),四支出貨的擊退都是招式自帶固定距離(13-02 牙突 6.0、13-002 7.0、13-03 佈壁 4.5),所以沒有一支需要再按體重換算。",
  },
  "field:abilities.effects[]#knockback.launchHeight": {
    status: "default-live",
    why: "缺席 = 貼地推(不是拋物線)。> 0 才是「擊飛」。四支出貨的擊退都是牙突/佈壁那種水平推,擊飛留給 06-00 猜猜拳「擊飛目標」那一批 —— 它們今天還是純文字(見 variant#knockback 那條被刪掉的 landing 記錄:機制已經被 13-02 採用了,擊飛這個子選項還沒有)。",
  },
  "field:abilities.effects[]#knockback.subtractGap": {
    status: "default-live",
    why: "缺席 = true,也就是 GH#193 的「站越遠推越少」。這是全遊戲共用的擊退規則,owner 定它是為了讓擊退是近戰的工具而不是遠程的放風箏工具;寫 false 等於為某一支破例。四支出貨的擊退都遵守它 —— 描述裡的「6.0 單位 −(你們的距離)」就是這條。",
  },
  "field:abilities.effects[]#knockback.uncontrollable": {
    status: "default-live",
    why: "缺席 = true(擊退期間進 world.knockdown,不能下指令)。寫 false 是「推開但保留控制權」,四支出貨的擊退都不要那個 —— 牙突的價值有一半在那段躺平時間。",
  },
  "enum:abilities.passive.ranks[].whileForm=any": {
    status: "default-live",
    why: "abilityPassives.ts:113 `block.whileForm ?? \"any\"` —— 缺席就是「兩個形態都生效」。被寫出來的只有 \"alternate\"(只有變身後才有的天生技),因為那是跟預設相反的那一個。",
  },

  // ── 真的還沒有人選(landing) ───────────────────────────────────────────
  "enum:abilities.passive.ranks[].whileForm=base": {
    status: "landing",
    since: "2026-07-31",
    why: "「只有本體形態才生效」的天生技。第三個成員裡唯一沒有客戶的一個:出貨的變身天生技都是「變身後才有」(alternate),還沒有一支是「變身後就失去」。w3x 裡這種存在(本體的被動在 Emeu 那半邊沒有被登記),所以這是待補的內容不是多餘的成員。",
  },
  "enum:abilities.effects[]#damage.hpPct.basis=current": {
    status: "landing",
    since: "2026-07-31",
    why: "百分比生命傷害的分母。owner 2026-07-31 對 13-02 牙突明確裁決過「6/9/12% 的分母是目標的**最大**生命」,所以 \"max\" 是出貨值;\"current\" 是處決風味的另一種讀法,schema/effect.ts 的檔頭把它寫成 DECISION POINT 正是為了讓它是一個下拉選單而不是一個 if。第一個自然的採用者是 w3x 那批「對殘血追加」的招式。",
  },
  "enum:abilities.effects[]#knockback.from=pull": {
    status: "landing",
    since: "2026-07-31",
    why: "把人拉過來而不是推開。出貨的四支擊退都是推(caster / facing)。w3x 有明確的客戶:52-00 那一類鉤索與 13-002 之外的抓取投擲(godie-hapm.w 是全遊戲唯一的抓取投擲,它今天走 leap 不走 knockback)。把它改寫成 pull 是一次內容決策,不是機制缺口。",
  },
  "enum:abilities.effects[]#spendMana.applyTo=target": {
    status: "landing",
    since: "2026-07-31",
    why: "燒對方的魔而不是自己的。sim/effects/spendMana.ts 的檔頭明說這個方向是刻意可表達的(「a mana burn on the victim — a different mechanic that this field can also express, deliberately, but only when asked for」)。出貨的五支 spendMana 全部是自己付錢(風王結界的每擊 30 魔、絕。暗殺奧義的燒光全魔)。w3x 的 mana burn 家族還沒有被移植。",
  },

};

let census: Census;
let store: ContentStore;

beforeAll(async () => {
  const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  store = result.store;
  census = censusAdoption(store);
}, 60_000);

/** Days between an ISO date and now, floored. */
function daysSince(iso: string, now: number): number {
  return Math.floor((now - Date.parse(iso)) / 86_400_000);
}

/** Entries whose `landing` grace has run out at `now`. */
function expiredGraces(now: number): string[] {
  return Object.entries(EXEMPTIONS)
    .filter(([, e]) => e.status === "landing")
    .filter(([, e]) => e.since === undefined || daysSince(e.since, now) > GRACE_DAYS)
    .map(([k]) => k);
}

describe("field adoption census (recipe S8: mechanism shipped, content 0)", () => {
  it("prints the census — this is the owner-facing report", () => {
    // Always emitted, pass or fail. The numbers ARE the deliverable: which
    // mechanisms content actually reaches, and how hard.
    // eslint-disable-next-line no-console
    console.log("\n" + formatCensus(census) + "\n");

    const debts = Object.entries(EXEMPTIONS).filter(([, e]) => e.status === "debt");
    if (debts.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        [
          `\n  ${"═".repeat(74)}`,
          `  KNOWN DEAD MECHANISMS — ${debts.length} registered features that never happen in a match.`,
          `  These are ACCEPTED FAILURES, not passing checks. They print every run on purpose.`,
          `  ${"═".repeat(74)}`,
          ...debts.map(([k, e]) => `   • ${k}\n     ${e.why}`),
          "",
        ].join("\n"),
      );
    }
    expect(census.rows.length).toBeGreaterThan(0);
  });

  it("every registered field / Stat / enum member / effect kind is adopted, or exempted", () => {
    const zeroes = unadopted(census);
    const unexplained = zeroes.filter((r) => EXEMPTIONS[r.key] === undefined);

    const message =
      unexplained.length === 0
        ? ""
        : [
            "",
            "S8 — A REGISTERED MECHANISM WITH ZERO CONTENT ADOPTION.",
            "",
            "These keys are offered by the schemas (or by a code vocabulary) and NOT ONE",
            "content document uses them. Nothing will error; the feature simply never",
            "happens in a match. That is exactly the shape docs/_false-completions.md",
            "catalogues as S8, and it is why this test exists.",
            "",
            ...unexplained.map(
              (r) => `  ${r.key}\n      0 of ${r.reach} docs that could have used it`,
            ),
            "",
            "THREE WAYS TO RESOLVE THIS — pick one deliberately:",
            "",
            "  1. AUTHOR THE CONTENT. Usually the right answer. Editing one doc in",
            "     content/ is enough to turn the row green, and that one doc is proof the",
            "     path works end to end.",
            "",
            "  2. IT IS NEW — add it to EXEMPTIONS in this file with",
            `     { status: "landing", since: "<today, ISO>", why: "…" }.`,
            `     That suppresses the failure for ${GRACE_DAYS} days and then fails again,`,
            "     so the migration cannot be forgotten.",
            "",
            "  3. ZERO IS CORRECT AND PERMANENT — add it to EXEMPTIONS with the status",
            `     that says WHY: "default-live" (the behaviour ships from a code default`,
            `     and the field only overrides it), "runtime-authored" (code synthesizes`,
            `     the doc), "schema-impossible" (another rule forbids setting it here),`,
            `     "superseded" (dead field kept for compat), or "debt" (it IS broken,`,
            "     you are recording it rather than fixing it now — debts print as a loud",
            "     banner on every run).",
            "",
            "Do NOT delete the field, the Stat, or the enum member just to make this",
            "pass unless you actually mean to remove the mechanism.",
            "",
          ].join("\n");

    expect(unexplained.map((r) => r.key), message).toEqual([]);
  });

  it("no exemption is STALE — an adopted key must lose its exemption", () => {
    // The self-cleaning half. Without it the list only ever grows, and a list
    // that is always true is a list nobody reads.
    const zeroKeys = new Set(unadopted(census).map((r) => r.key));
    const byKey = new Map(census.rows.map((r) => [r.key, r]));
    const stale = Object.keys(EXEMPTIONS).filter((k) => !zeroKeys.has(k));

    const message = [
      "",
      "STALE EXEMPTION(S) — these keys are no longer at zero, so their entries in",
      "EXEMPTIONS (packages/shared/src/content/fieldAdoption.test.ts) are now lies.",
      "DELETE the listed entries; that is the entire fix.",
      "",
      ...stale.map((k) => {
        const r = byKey.get(k);
        if (r === undefined) {
          return `  ${k}\n      no longer a registered key at all — the schema changed under it`;
        }
        if (r.reach < MIN_REACH) {
          return `  ${k}\n      reach fell to ${r.reach} (< MIN_REACH ${MIN_REACH}); the census no longer claims anything about it`;
        }
        return `  ${k}\n      now adopted by ${r.docs} doc(s), e.g. ${r.examples.join(", ")}`;
      }),
      "",
    ].join("\n");

    expect(stale, message).toEqual([]);
  });

  it("no `landing` grace has expired — a new field cannot stay new forever", () => {
    const expired = expiredGraces(Date.now());
    expect(
      expired,
      `\nThese exemptions were filed as "landing" (brand-new field, adoption imminent)\n` +
        `and are now older than ${GRACE_DAYS} days. Either finish the content migration,\n` +
        `or re-file them with an honest status — "debt" if the migration is not going to\n` +
        `happen soon, which at least keeps them visible in the banner every run.\n` +
        expired.map((k) => `  ${k}`).join("\n") +
        "\n",
    ).toEqual([]);
  });

  it("the grace really does expire (the mechanism, not today's data)", () => {
    // Exercised on synthetic entries so the assertion holds no matter what the
    // EXEMPTIONS table contains — otherwise this logic would be dead code the
    // day the table has no `landing` rows, which is most days.
    const now = Date.parse("2026-07-24T00:00:00Z");
    expect(daysSince("2026-07-24T00:00:00Z", now)).toBe(0);
    expect(daysSince("2026-06-24T00:00:00Z", now)).toBe(30);
    expect(daysSince("2026-06-23T00:00:00Z", now)).toBe(31);
    // …and a `landing` entry with no `since` is expired on sight, so it cannot
    // be used as an unbounded silencer.
    expect(daysSince("2026-06-23T00:00:00Z", now) > GRACE_DAYS).toBe(true);
    expect(daysSince("2026-06-24T00:00:00Z", now) > GRACE_DAYS).toBe(false);
  });

  it("every exemption is well-formed: a status, a real reason, and a date when required", () => {
    const bad: string[] = [];
    for (const [key, e] of Object.entries(EXEMPTIONS)) {
      if (!/^(field|enum|variant|tag):/.test(key)) bad.push(`${key}: not a census key`);
      // A reason short enough to be "n/a" is not a reason. This is the rule
      // that stops the list degrading into a list of keys.
      if (e.why.trim().length < 40) bad.push(`${key}: why is too short to be a reason`);
      if (e.status === "landing" && e.since === undefined) bad.push(`${key}: landing needs since`);
      if (e.since !== undefined && Number.isNaN(Date.parse(e.since))) {
        bad.push(`${key}: since is not a date`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("GUARD THE GUARD: the census measured the whole tree, not three documents", () => {
    // Every assertion above is vacuously true against an empty census. These
    // are the numbers that make a green run mean something. They are floors,
    // not pins, so authoring content never breaks them.
    expect(census.totalDocs).toBeGreaterThan(1400);
    expect(census.rows.length).toBeGreaterThan(250);

    const kinds = new Set(census.rows.map((r) => r.kind));
    expect([...kinds].sort()).toEqual(["enum", "field", "tag", "variant"]);

    // The four things the recipe names must each be genuinely reachable, or a
    // refactor could silently stop censusing one of them and still pass.
    const reachable = census.rows.filter((r) => r.reach >= MIN_REACH);
    expect(reachable.filter((r) => r.kind === "field").length).toBeGreaterThan(80);
    expect(reachable.filter((r) => r.kind === "enum").length).toBeGreaterThan(60);
    expect(reachable.filter((r) => r.kind === "variant").length).toBeGreaterThan(10);
    expect(reachable.filter((r) => r.kind === "tag").length).toBe(
      TAG_VOCABULARIES.reduce((n, v) => n + v.members.length, 0),
    );

    // Stats arrive through zStat as a nativeEnum; if that walk ever breaks,
    // "a Stat nothing references" stops being detectable and this test would
    // pass for the wrong reason. Counted against ALL_STATS rather than a
    // literal, so adding a Stat cannot quietly fall outside the census.
    //
    // ⚠️ THE SEGMENT IS `*`, NOT `stat`, AND THIS GUARD ONCE FAILED SILENTLY
    // BECAUSE OF IT. `zStatModifier` grew `from: zStat.optional()` on
    // 2026-07-31 (ModOp.PercentOf needs to name the stat the percentage is
    // taken OF). `unwrap()` strips the `.optional()`, so `stat` and `from` now
    // resolve to the SAME zStat instance, and the walker's sibling-collapse
    // renames BOTH segments to `*` (fieldAdoption.ts:256). The 16 rows are all
    // still there — only their key changed — but the old `"].stat="` filter
    // matched NOTHING, so `statRows` went empty and every assertion below it
    // became vacuous. That is this guard's own failure mode, caught by itself.
    //
    // Anchored on the zStat SITE plus membership in ALL_STATS, so it survives
    // the next rename: the `.op=` rows under the same prefix are excluded by
    // the membership test (flat/pctAdd/… are not Stats), and the narrower stat
    // enums on the CONDITION path (`condition|0|1|1.stat`, a 10-member subset)
    // are excluded by the prefix.
    const MODIFIER_STAT_SITE = "enum:abilities.effects[]#applyBuff.modifiers[].";
    const isStat = new Set<string>(ALL_STATS);
    const statRows = census.rows.filter(
      (r) => r.key.startsWith(MODIFIER_STAT_SITE) && isStat.has(r.key.split("=").pop() ?? ""),
    );
    expect(statRows.map((r) => r.key.split("=").pop()).sort()).toEqual(
      [...ALL_STATS].sort(),
    );
    // `evasion` is the canary: it was the audit's headline zero, and it landed
    // in content while this file was being written. The row must EXIST; this
    // test deliberately does not assert what its count is.
    expect(statRows.some((r) => r.key.endsWith("=evasion"))).toBe(true);
  });

  it("THE CASCADE RULE: a child of an unadopted container is not an independent finding", () => {
    // hitFeel has ten optional children. If `hitFeel` itself were unset the
    // report would name eleven problems that are one problem. Anything with
    // reach 0 is suppressed, so adopting the parent is what makes the children
    // visible — one finding at a time, outermost first.
    const suppressed = census.rows.filter((r) => r.reach === 0);
    for (const r of suppressed) expect(r.docs).toBe(0);
    // There must actually BE some, or this rule is untested. Today's example
    // is everything under `passive.ranks[].auras`, whose container has zero
    // adoption: the aura's own radius/affects/lingerSec are ONE finding, not
    // four. Adopting the container is what makes its children visible.
    expect(suppressed.length).toBeGreaterThan(0);
    // Suppressed rows appear in neither the report nor the failure set.
    const report = formatCensus(census);
    const zeroKeys = new Set(unadopted(census).map((r) => r.key));
    for (const r of suppressed) {
      expect(report, `${r.key} should be cascade-suppressed`).not.toContain(r.key);
      expect(zeroKeys.has(r.key), `${r.key} must not be a reported failure`).toBe(false);
    }
  });

  it("the census is deterministic — same store, same rows, same order", () => {
    // Key stability is what lets EXEMPTIONS be written down at all. The schema
    // naming walk picks shortest-path names with a lexicographic tiebreak, so a
    // second pass over the same store must reproduce the keys byte for byte.
    // (A Map-iteration-order dependency here would make the exemption list
    // flap between runs, which is worse than having no guard.)
    const again = censusAdoption(store);
    expect(again.rows.map((r) => `${r.key}:${r.docs}:${r.reach}`)).toEqual(
      census.rows.map((r) => `${r.key}:${r.docs}:${r.reach}`),
    );
  });
});
