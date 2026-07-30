/**
 * Damage queue + resolution. Effects QUEUE damage; this system drains the queue
 * in one ordered pass per tick (mitigation → shields → hp → hooks), so results
 * never depend on effect iteration order.
 */
import type { AbilityId, ChampionId, EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { DamageType } from "../effects/effect";
import type { StructureComp } from "../systems/GuardianSystem";
import { Stat } from "../stats/statTypes";
import { fireHooks } from "../effects/hooks";
import { recordDamage } from "../stats/matchStats";
import { refusesDamage } from "../effects/invulnerable";
import { rollEvadeAbility } from "./evasion";
import { cancelLeap } from "../movement/leap";
import { healTarget } from "./restore";
import { normalize, sub, lenSq, dist } from "../math/vec2";
import { knockbackRaw, afterGap } from "../combatFeel";
import { Abilities, Champions } from "../content/registry";
import { noteAbilityConnect } from "../abilities/abilityRecovery";
import {
  deriveCosmetics,
  mergeCosmetics,
  type HitFeelInput,
  type ImpactCosmetics,
  type ImpactTier,
  type ShakeStyle,
  type SparkKind,
} from "./hitFeel";

export interface DamagePacket {
  source: EntityId;
  target: EntityId;
  amount: number;
  type: DamageType;
  crit: boolean;
  /** provenance: "ability:sela.q" | "basic" | "item:..." | "aug:..." */
  origin: string;
}

// ---------------------------------------------------------------- COMBAT JUICE
// All impact reactions (hitstop / knockback / knockdown) are DETERMINISTIC pure
// functions of the resolved damage — no rng, no trig — so the client's
// prediction shadow world replays them identically. "impact" = the mitigated
// (post-armor/MR, PRE-shield) damage, i.e. how hard the blow landed regardless
// of whether a shield ate it, so a fully-blocked heavy hit still block-freezes.
//
// None of this changes any damage NUMBER or cooldown — balance is untouched.
// Chip damage (small autos, DoT ticks) stays below the thresholds so it never
// freezes/shoves (which would both wreck feel AND desync MOBA cadence).

/** Below this mitigated impact a hit is "chip": no hitstop, no knockback. */
const HITSTOP_MIN_IMPACT = 12;
const HITSTOP_MIN_TICKS = 2;
const HITSTOP_MAX_TICKS = 6; // base cap (~6 ticks) for a plain hit
/** +1 hitstop tick per this much impact (heavier hit = longer freeze). */
const HITSTOP_PER_IMPACT = 55;

// ----------------------------------------------------- UNIFIED IMPACT PROFILE
// ONE hit-weight computed once here in applyImpact and carried on the hitImpact
// event so every downstream (sim + client) channel reads a single source of
// truth instead of each re-classifying "how hard did that land" with its own
// constant. All integer / branch-only maths — no rng, no trig, no wall-clock —
// so the client's prediction shadow world derives the identical profile.

/** Impact tier boundaries (mitigated, pre-shield force). crit overrides both. */
const TIER_MEDIUM_IMPACT = 60;
const TIER_HEAVY_IMPACT = 120;

/** Crit lands a DISTINCTLY longer freeze (the "that one HURT" pause): +2 ticks. */
const HITSTOP_CRIT_BONUS = 2;
/** A guard shatter is the biggest 破碎 beat — floor its freeze to the cap. */
const HITSTOP_COUNTER_CAP = 8; // emphasis cap: crit/guardBreak may exceed the base 6

/** Victim-only hitstun: +1 tick per this much impact on top of the base lock. */
const HITSTUN_PER_IMPACT = 40;
/** Ticks the victim stays action-locked BEYOND the attacker's freeze (frame
 *  advantage — the attacker recovers first, the defender is on the back foot). */
const HITSTUN_ADVANTAGE = 2;
/** Hitstun never roots longer than this (a knockdown handles the heaviest CC). */
const HITSTUN_MAX_TICKS = 12;

// ---- hitFeel OVERRIDE caps (task #133). A champion/ability may author bigger
// gameplay numbers than the auto-scaled default, but never unbounded (a runaway
// freeze would stall the match / desync cadence). Overrides clamp to these.
const HITSTOP_OVERRIDE_MAX = 20;
const HITSTUN_OVERRIDE_MAX = 30;
const KB_OVERRIDE_MAX = 8;

// `ImpactTier` / cosmetic types now live in ./hitFeel (shared with the content
// override layer). Re-exported here so existing `from ".../combat/damage"`
// imports of the contract keep resolving.
export type { ImpactTier, ShakeStyle, SparkKind, HitFeelInput, ImpactCosmetics } from "./hitFeel";

/**
 * The one hit-weight for a landed hit, computed once and carried on `hitImpact`.
 * Every reaction channel (sim hitstop/hitstun/knockback + client shake / spark /
 * blood / ripple / flash / sfx / freeze) reads THIS instead of re-deriving its
 * own "heavy" cut, so light→heavy crosses on the same frame across all of them.
 *
 * The GAMEPLAY fields (tier/hitstop/hitstun/knockback + flags) drive the
 * deterministic sim reaction; the COSMETIC fields (shake/spark/flash/camKick/
 * exFreeze) are hints the client channels consume. Every field has a
 * damage-derived DEFAULT and can be individually OVERRIDDEN by the firing
 * champion basic-attack / ability's optional `hitFeel` (task #133) — see
 * `./hitFeel` for the default curves + merge.
 */
export interface ImpactProfile {
  tier: ImpactTier;
  /** freeze ticks applied to BOTH fighters (crit/guardBreak-emphasised). */
  hitstopTicks: number;
  /** victim-only action-lock ticks (>= hitstopTicks; roots auto + cast). */
  hitstunTicks: number;
  /** unit push direction (victim away from source); {0,0} when none resolved. */
  knockbackDir: { x: number; z: number };
  /** push distance actually applied this hit (0 = no shove). */
  knockbackMag: number;
  isEX: boolean;
  isBlock: boolean;
  isCounter?: boolean;
  // ---- cosmetic hints (client channels; damage-derived default, hitFeel-overridable) ----
  /** camera shake amplitude hint (0..~2). */
  shakeMag: number;
  /** shake character: aimed along the hit vector, or a radial ring. */
  shakeStyle: ShakeStyle;
  /** hit-spark identity the client plays. */
  sparkKind: SparkKind;
  /**
   * AUTHORED-ONLY victim body-flash colour [r,g,b] 0..1 — absent unless the
   * firing champion/ability's `hitFeel` set it. The client owns the default
   * (its palette is contrast-measured against the real model tints), so
   * ABSENCE is the signal "use the damage-type colour". See hitFeel.ts.
   */
  flashColor?: [number, number, number];
  /** AUTHORED-ONLY victim body-flash duration (ms); absent = client tier default. */
  flashMs?: number;
  /** one-shot directional camera kick magnitude. */
  camKick: number;
  /** cosmetic client-side EX freeze ticks (0 = none). */
  exFreeze: number;
}

/** Tier from the mitigated impact + crit + guardBreak (crit is the top tier). */
function deriveTier(impact: number, crit: boolean, guardBreak: boolean): ImpactTier {
  if (crit) return "crit";
  if (guardBreak || impact >= TIER_HEAVY_IMPACT) return "heavy";
  if (impact >= TIER_MEDIUM_IMPACT) return "medium";
  return "light";
}

/**
 * The ability id carried by an `ability:<id>` damage origin (undefined for
 * "basic" / DoTs / item+augment procs / guardian packets). Every ability path
 * stamps this shape — instant cast (abilitySystem), delayed cast
 * (CastResolveSystem) and projectile onHit (which carries the spawning
 * ability's origin verbatim) — so it is the one place origin is parsed.
 */
function abilityIdOfOrigin(origin: string): string | undefined {
  const ix = origin.indexOf("ability:");
  if (ix < 0) return undefined;
  return origin.slice(ix + "ability:".length);
}

/** Authored doc-id suffix of a hero's EX ability (`<hero>.ex`; QWER are .q/.w/.e/.r). */
const EX_ABILITY_SUFFIX = ".ex";

/**
 * Whether this packet is an EX / super hit (task #133) — the flag that arms the
 * omni shake + cosmetic `exFreeze` on the ImpactProfile.
 *
 * Derived from TWO real signals, no new packet field and no content marker:
 *
 *  1. RUNTIME (authoritative): the firing entity's own EX slot holds exactly the
 *     ability this damage came from. `castAbility` puts the EX ability in
 *     `AbilitiesComp.exSlot` (slot "EX" is the only way to fire it), and every
 *     ability damage path stamps `origin = "ability:<abilityId>"`, so comparing
 *     the two identifies an EX hit for instant casts, cast-time casts and
 *     ability projectiles alike (a projectile's `caster` is its owner).
 *  2. CONTENT (fallback): the authored `.ex` doc-id suffix. `champion.exAbility`
 *     is always `<hero>.ex` (content/abilities/*.ex.json), so a hit whose source
 *     entity no longer carries the abilities comp (a summon/proc re-emitting the
 *     ability's origin, a dead caster, content-level tests) still reads as EX.
 *
 * Both are pure reads of fixed world/content state — no rng, no wall-clock.
 */
function originIsEX(world: SimWorld, source: EntityId, origin: string): boolean {
  const abilityId = abilityIdOfOrigin(origin);
  if (abilityId === undefined) return false;
  const ex = world.abilities.get(source)?.exSlot;
  if (ex && ex.abilityId === abilityId) return true;
  return abilityId.endsWith(EX_ABILITY_SUFFIX);
}

/**
 * COUNTER HIT (task #133) — the canonical fighting-game read: the blow landed
 * while the VICTIM was itself committed to an action it could not take back.
 *
 * The sim already models exactly two such commitment windows, both on the
 * victim's `AbilitiesComp`:
 *   · `windup` — an in-progress basic-attack wind-up (the swing's startup, before
 *     its damage point; BasicAttackSystem clears it the moment the hit lands or
 *     the swing is cancelled), and
 *   · `cast`   — an in-progress ability cast time (animation-locked; the caster
 *     is usually rooted for it, see CastResolveSystem).
 *
 * Two map lookups, no allocation, no rng: same inputs → same flag on every
 * replica. Cosmetic only — it selects the `counter` spark identity; it changes
 * no damage number and no freeze/knockback, so replay digests are untouched.
 */
function isCounterHit(world: SimWorld, target: EntityId): boolean {
  const ab = world.abilities.get(target);
  if (!ab) return false;
  return !!ab.windup || !!ab.cast;
}

// ---------------------------------------------------------------- KNOCKBACK
// GH#193 — 擊退是**百分比驅動 + 減距離**的,不再是絕對傷害分級。整條法則
// (含三個後台可調的參數) 住在 sim/combatFeel.ts 的 `knockbackDistance`;這裡只
// 負責量出「這一擊打掉多少血」和「兩人現在差多遠」再把結果交給它。
//
// ⚠️ 三件在這裡最容易被之後的人「優化掉」的事,先寫死:
//   1. 分母是**最大生命**,不是當前生命。用當前生命的話,殘血的人會被一巴掌
//      推到天邊 —— 一個把追擊變成處決的隱形機制,沒有人要求過。
//   2. 減距離讓**遠程打出的擊退天然比近戰小**(遠程隔 8.2 打,raw 要超過 8.2
//      才推得動)。擊退從此是近戰的工具,遠程不能靠推人永久風箏。
//   3. 傷害類型(physical/magic/true)與 blocked **不再**改變擊退距離。舊法有
//      ×0.6/×0.85/×0.35 三個係數,owner 的新規則沒有它們,而把它們偷留下來會讓
//      「傷害百分比 → 擊退身位」這個玩家看得懂的關係說謊。
/** slide speed of the knockback impulse (units/sec). */
const KB_SPEED = 16;

/** Heavy UNBLOCKED physical/true hit at/above this impact knocks the victim down. */
const KD_MIN_IMPACT = 170;
/** prone + getup window (ticks ~= 0.47s @30Hz). */
const KNOCKDOWN_TICKS = 14;

/**
 * Resolve the firing source's optional `hitFeel` override block (task #133) from
 * the damage `origin` + source entity — content is a fixed input, so this stays
 * deterministic. Basic attacks read the source champion's basic-attack hitFeel;
 * ability hits read the firing ability's hitFeel. Anything else (DoTs, item/
 * augment procs, tests) has no override → the damage-derived default applies.
 *
 * The registry defs are typed without `hitFeel` (it is a content-schema field,
 * see content/schema); the loaded doc carries it verbatim, so we read it through
 * a narrow cast rather than widening the sim def types.
 */
function lookupHitFeel(world: SimWorld, source: EntityId, origin: string): HitFeelInput | undefined {
  if (origin === "basic") {
    const champ = world.champion.get(source);
    if (!champ) return undefined;
    const cdef = Champions.tryGet(champ.championId as ChampionId) as
      | { hitFeel?: HitFeelInput }
      | undefined;
    return cdef?.hitFeel;
  }
  const abilityId = abilityIdOfOrigin(origin);
  if (abilityId !== undefined) {
    const adef = Abilities.tryGet(abilityId as AbilityId) as { hitFeel?: HitFeelInput } | undefined;
    return adef?.hitFeel;
  }
  return undefined;
}

/** Raise a freeze counter to `ticks` (never shortens an in-progress freeze). */
function bumpFreeze(map: Map<EntityId, number>, id: EntityId, ticks: number): void {
  const cur = map.get(id) ?? 0;
  if (ticks > cur) map.set(id, ticks);
}

/**
 * Apply the on-impact reactions for one landed hit. Emits `hitImpact` (always,
 * for client shake/particle timing), plus knockback / knockdown / guardBreak as
 * the impact + block state warrant.
 */
function applyImpact(
  world: SimWorld,
  source: EntityId,
  target: EntityId,
  impact: number,
  type: DamageType,
  blocked: boolean,
  guardBreak: boolean,
  crit: boolean,
  killingBlow: boolean,
  origin: string,
): void {
  const tt = world.transform.get(target);
  const st = world.transform.get(source);
  const nav = world.nav.get(target);
  const x = tt?.pos.x ?? 0;
  const z = tt?.pos.z ?? 0;
  const isEX = originIsEX(world, source, origin);

  // ---- hit-feel override (task #133): the firing champion basic-attack /
  // ability may carry an optional `hitFeel` block that overrides individual
  // gameplay + cosmetic fields; unset fields fall back to the damage-derived
  // default computed below. Fixed content input → deterministic.
  const hf = lookupHitFeel(world, source, origin);

  // ---- resolve the shove direction/distance up front so the profile carries
  // the SAME knockback the sim applies (one source of truth for the client too).
  let kbDir = { x: 0, z: 0 };
  let kbMag = 0;
  if (nav && tt && st) {
    // GH#193 damage-derived RAW distance: 打掉幾 % 的最大生命 → 幾個身位。
    // 整條法則(和它的三個後台參數)在 combatFeel.ts。
    const victimMaxHp = world.health.get(target)?.maxHp ?? 0;
    let raw = knockbackRaw(world.combatFeel.knockback, impact, victimMaxHp);
    // 作者的 `hitFeel.knockbackMag` 是這一擊在**距離 0 時**的擊退**下限**,
    // 不是取代 GH#193 那條法則的天花板。
    //
    // ⚠️ 這一行寫成 `raw = 覆寫`(取代)的話,#193 對**每一位英雄的普攻都完全
    // 無效** —— 這是量出來的,不是推論:
    //
    //   · 出貨的 115 位英雄裡 **114 位**的 champion doc 帶著 `hitFeel`,而
    //     `lookupHitFeel(origin === "basic")` 讀的就是它 → 幾乎每一次普攻都
    //     走覆寫那條分支。
    //   · 那 114 個值是 90 個 **0**、19 個 0.25、4 個 0.45、1 個 0.3。
    //   · 近戰的接觸距離下限是 `r + r + 0.1 = 1.3`(spawnChampion 的半徑 0.6)。
    //   · 所以取代語意下的結果永遠是 `max(0, ≤0.45 − ≥1.3) = 0` —— 連一發打掉
    //     受傷單位 **100%** 最大生命的爆擊都推不動一格,而 owner 的規格說那
    //     應該推 10 個身位。
    //
    // 取下限之後,`knockbackMag: 0` 回到它在 #133 裡本來的意思(「這一刀沒有
    // 額外的推力」),而不是「這一刀可以否決整場比賽的全域規則」。碎屑傷害
    // 仍然不推(pct < minPct → raw 0,覆寫 0 也是 0),所以 #45 的近戰普攻率
    // 沒有回退 —— `autoAttackCensus` 的棘輪在這個改動下仍然是綠的。
    //
    // 守衛:`sim/knockbackRoster.test.ts`(**出貨內容**,不是骨架 dummy ——
    // 骨架 dummy 沒有 hitFeel,永遠走不到這條分支)。
    if (hf?.knockbackMag !== undefined) {
      raw = Math.max(raw, Math.min(KB_OVERRIDE_MAX, Math.max(0, hf.knockbackMag)));
    }
    // ⚠️ 減距離套用在**覆寫之後**,也就是作者寫的 `hitFeel.knockbackMag` 一樣要
    // 減。這不是順手為之:出貨內容裡 114/115 位英雄的**普攻**都帶著一個
    // knockbackMag(0/0.25/0.3/0.45),覆寫若跳過這條減法,#193 的新法則對普攻
    // 就完全無效 —— 而普攻正是 #45 抱怨的那件事。所以覆寫值的語意是
    // 「距離 0 時要推多遠」,不是「無論多遠都推這麼遠」。見 combatFeel.afterGap。
    const distance = afterGap(raw, dist(tt.pos, st.pos));
    if (distance > 0) {
      let dir = normalize(sub(tt.pos, st.pos));
      if (lenSq(dir) < 1e-12) {
        // same position (rare): shove opposite the victim's facing, else a fixed axis
        dir = lenSq(tt.facing) > 1e-12 ? { x: -tt.facing.x, z: -tt.facing.z } : { x: 1, z: 0 };
      }
      kbDir = dir;
      kbMag = distance;
    }
  }

  // ---- HITSTOP — freeze BOTH fighters (SF-style), heavier hit = longer freeze,
  // with crit / guard-shatter EMPHASIS so the biggest beats read distinctly.
  // Chip never freezes, but a guard shatter always lands its dramatic hold.
  let hitstopTicks = 0;
  if (impact >= HITSTOP_MIN_IMPACT || guardBreak) {
    hitstopTicks = Math.min(
      HITSTOP_MAX_TICKS,
      Math.max(HITSTOP_MIN_TICKS, HITSTOP_MIN_TICKS + Math.floor(impact / HITSTOP_PER_IMPACT)),
    );
    if (crit) hitstopTicks += HITSTOP_CRIT_BONUS; // crit: distinctly longer hold
    if (guardBreak) hitstopTicks = Math.max(hitstopTicks, HITSTOP_COUNTER_CAP); // shatter: floor to max
    hitstopTicks = Math.min(hitstopTicks, HITSTOP_COUNTER_CAP); // clamp to the emphasis cap
  }
  // explicit hitstop override wins over the impact-derived freeze (can also arm
  // a freeze on an otherwise-chip hit), clamped to the override cap.
  if (hf?.hitstopTicks !== undefined) {
    hitstopTicks = Math.min(HITSTOP_OVERRIDE_MAX, Math.max(0, Math.floor(hf.hitstopTicks)));
  }

  // ---- HITSTUN — a victim-ONLY action-lock that outlasts the shared freeze:
  // the attacker recovers first (frame advantage), the defender is rooted out of
  // auto/cast while they get shoved. Scales with impact, always >= the hitstop.
  let hitstunTicks = 0;
  if (hitstopTicks > 0) {
    hitstunTicks = Math.min(
      HITSTUN_MAX_TICKS,
      hitstopTicks + HITSTUN_ADVANTAGE + Math.floor(impact / HITSTUN_PER_IMPACT),
    );
    // explicit hitstun override wins, but never drops below the shared freeze
    // (the frame-advantage invariant: the victim is locked >= the attacker).
    if (hf?.hitstunTicks !== undefined) {
      hitstunTicks = Math.min(
        HITSTUN_OVERRIDE_MAX,
        Math.max(hitstopTicks, Math.floor(hf.hitstunTicks)),
      );
    }
  }

  const tier = deriveTier(impact, crit, guardBreak);
  // COUNTER: the victim was mid-swing / mid-cast when this landed (see above).
  const isCounter = isCounterHit(world, target);
  // COSMETIC half: damage-derived default (scaled by tier/type/flags), then any
  // explicit hitFeel cosmetic overrides layered on top.
  const cosmetics: ImpactCosmetics = mergeCosmetics(
    deriveCosmetics(tier, type, blocked, isCounter, isEX),
    hf,
  );

  const profile: ImpactProfile = {
    tier,
    hitstopTicks,
    hitstunTicks,
    knockbackDir: kbDir,
    knockbackMag: kbMag,
    isEX,
    isBlock: blocked,
    isCounter,
    ...cosmetics,
  };

  // Client uses hitImpact purely for shake/particle timing (fires for EVERY
  // connected hit, blocked or not — blockstun still reads as impact). The
  // unified `profile` rides along so every channel reads one hit-weight.
  world.emit("hitImpact", {
    x, z, source, target, dmgType: type, amount: impact, blocked, crit, killingBlow, profile,
  });

  // A shield that broke this frame = a bigger "guard shatter" reaction.
  if (guardBreak) world.emit("guardBreak", { target, source, x, z });

  // apply the freeze / action-lock world state derived above.
  if (hitstopTicks > 0) {
    bumpFreeze(world.hitstop, source, hitstopTicks);
    bumpFreeze(world.hitstop, target, hitstopTicks);
    bumpFreeze(world.hitstun, target, hitstunTicks);
  }

  if (kbMag <= 0 || !nav || !tt || !st) return; // too light to shove (or no body)

  // ---- SHOVE ARBITRATION (GH#193 lane P4) --------------------------------
  // ⚠️ RECONSTRUCTED 2026-07-30 — same incident as the shield/evasion blocks;
  // behaviour is pinned by `sim/knockbackVsDamage.test.ts`.
  //
  // `combatResolveSystem` runs at step 8, LONG after an ability wrote its own
  // `nav.override` at step 2b/3. An unconditional assignment here therefore
  // lets a skill's own DAMAGE overwrite the skill's own AUTHORED shove in the
  // same tick — and every shipped knockback ability also deals damage, so the
  // primitive was dead on the shipping path, not merely flaky.
  //
  // The two questions this settles are 後台 FIELDS, not constants — they live
  // on `combatFeel.knockback` (`authoredWins` ships true, `longerDamageWins`
  // ships false; see combatFeel.ts for owner's reasoning on each).
  //   · authoredWins     — does an ability-authored shove survive its own damage?
  //   · longerDamageWins — …unless the damage-driven shove is actually longer?
  const kbRules = world.combatFeel.knockback;
  const authored =
    nav.override?.kind === "knockback" && nav.override.authored === true ? nav.override : undefined;
  const authoredKeeps =
    authored !== undefined &&
    kbRules.authoredWins &&
    !(kbRules.longerDamageWins && kbMag > authored.remaining);
  if (authoredKeeps) {
    // leave the authored trajectory alone — but the knockdown/cosmetics below
    // still apply, so the hit is still felt.
  } else {
    // A body mid-arc OWNS its `world.airborne` entry. Replacing the override
    // without cancelling the leap orphans that entry: it is hashed into the
    // digest forever and the client keeps drawing the body in mid-air
    // (失敗形態 ①). Drop it out of the air through the shipped path first.
    if (nav.override?.kind === "leap") cancelLeap(world, target);
    nav.override = { kind: "knockback", dir: kbDir, speed: KB_SPEED, remaining: kbMag };
  }

  // KNOCKDOWN — heavy UNBLOCKED physical/true blow floors the victim (brief
  // root + getup). Blocked or magic hits shove but don't knock down.
  if (!blocked && impact >= KD_MIN_IMPACT && type !== "magic") {
    bumpFreeze(world.knockdown, target, KNOCKDOWN_TICKS);
    world.emit("knockdown", { target, source, x, z, ticks: KNOCKDOWN_TICKS });
  }
}

/** Sum of a health's currently-active (unexpired, positive) shield amounts. */
function activeShieldTotal(shields: import("../components").Health["shields"], tick: number): number {
  let sum = 0;
  for (const sh of shields) if (sh.expiresAtTick > tick && sh.amount > 0) sum += sh.amount;
  return sum;
}

/**
 * The pools that may pay for THIS packet, in the order they are spent.
 *
 * ⚠️ RECONSTRUCTED 2026-07-30 against `sim/effects/shieldAbsorb.test.ts` after
 * the uncommitted `damage.ts` was destroyed by a bad `git checkout --` (see
 * /private/tmp/invuln-lane/RECOVERY-damage.ts.md). Behaviour is pinned by that
 * suite, not by memory of the original text.
 *
 * ELIGIBILITY (the filter): a pool with no `absorbs`, or `absorbs: "all"`, eats
 * anything; a typed pool eats only its own `DamageType`. `"true"` is its own
 * type, so an AP-only barrier does NOT stop the fire ring (#270).
 *
 * ORDER: `world.shieldRules.absorbOrder`, the 後台 field (shieldRules.ts).
 * Every branch preserves INSERTION order inside its group, so the result is a
 * stable partition — deterministic by construction, with no comparator.
 */
function eligibleShields(
  shields: import("../components").Health["shields"],
  tick: number,
  type: DamageType,
  order: import("../shieldRules").ShieldAbsorbOrder,
): import("../components").Health["shields"] {
  const live = shields.filter((s) => s.expiresAtTick > tick && s.amount > 0);
  const eligible = live.filter((s) => s.absorbs === undefined || s.absorbs === "all" || s.absorbs === type);
  if (order === "insertionOrder") return eligible;
  const narrow = eligible.filter((s) => s.absorbs !== undefined && s.absorbs !== "all");
  const broad = eligible.filter((s) => s.absorbs === undefined || s.absorbs === "all");
  return order === "specificFirst" ? [...narrow, ...broad] : [...broad, ...narrow];
}

/** Sum of the pools that could pay for this packet (the guard-break basis). */
function eligibleShieldTotal(
  shields: import("../components").Health["shields"],
  tick: number,
  type: DamageType,
): number {
  let sum = 0;
  for (const s of shields) {
    if (s.expiresAtTick <= tick || s.amount <= 0) continue;
    if (s.absorbs === undefined || s.absorbs === "all" || s.absorbs === type) sum += s.amount;
  }
  return sum;
}

/** Whether an active damage-reduction/guard BUFF is on the target (see modifiers). */
function hasDamageReductionBuff(world: SimWorld, target: EntityId): boolean {
  const sc = world.stats.get(target);
  if (!sc) return false;
  for (const src of sc.sources) {
    if (!src.damageReduction) continue;
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
    return true;
  }
  return false;
}

/**
 * STRUCTURE mitigation (task #89 §5.1/§5.3). A guardian is deliberately NOT a
 * champion: it carries transform + health + `StructureComp` and NO `StatsComp`,
 * so the champion path above (which reads `stats.final[Armor|MagicResist]`)
 * finds nothing and used to hand it FULL damage "exactly like the flower".
 * Its own armor / magicResist live on the marker, applied through the identical
 * 100/(100+resist) curve, followed by the per-packet cap.
 *
 * `maxHitPctMaxHp` clamps ONE packet, POST-mitigation and UNCONDITIONALLY —
 * `true` damage bypasses armour/MR as always but is still capped (§7.3 case 11),
 * because the cap exists to convert the objective from a burst check into a DPS
 * check (1/0.15 = 6.67 → a guardian survives a minimum of 7 packets, i.e. seven
 * moments at which the last hit can be stolen). The clamped value is what hits
 * HP, what `recordDamage` scores and what `applyImpact` reacts to.
 *
 * Reached ONLY when the target carries a `StructureComp`; a champion never does,
 * so champion-vs-champion mitigation is byte-identical to before.
 */
function mitigateStructure(
  world: SimWorld,
  pkt: DamagePacket,
  sc: StructureComp,
): number {
  let dmg = pkt.amount;
  if (pkt.type !== "true") {
    const resist = pkt.type === "physical" ? sc.armor : sc.magicResist;
    dmg *= 100 / (100 + Math.max(0, resist));
  }
  const hp = world.health.get(pkt.target);
  if (hp && sc.maxHitPctMaxHp > 0) {
    const cap = hp.maxHp * sc.maxHitPctMaxHp;
    if (dmg > cap) dmg = cap;
  }
  return dmg;
}

function mitigate(world: SimWorld, pkt: DamagePacket): number {
  // structures answer to their OWN armor/MR + per-packet cap (never a StatsComp)
  const structure = world.structure.get(pkt.target);
  if (structure) return mitigateStructure(world, pkt, structure);
  if (pkt.type === "true") return pkt.amount;
  const targetStats = world.stats.get(pkt.target);
  const resist = targetStats
    ? pkt.type === "physical"
      ? targetStats.final[Stat.Armor]
      : targetStats.final[Stat.MagicResist]
    : 0;
  // classic LoL mitigation: 100/(100+resist)
  return pkt.amount * (100 / (100 + Math.max(0, resist)));
}

export function combatResolveSystem(world: SimWorld): void {
  // Hooks fired during resolution may queue MORE damage; drain in bounded
  // passes so chains resolve deterministically without infinite loops.
  for (let pass = 0; pass < 4 && world.damageQueue.length > 0; pass++) {
    const batch = world.damageQueue.splice(0, world.damageQueue.length);
    for (const pkt of batch) {
      const hp = world.health.get(pkt.target);
      if (!hp || !hp.alive) continue;

      // ---- 無敵 / 免疫 (GH#289 lane P3) --------------------------------------
      // BEFORE the combat-env multiplier, so `damageBlocked` on the scoreboard
      // is the packet as it was AUTHORED, not the post-multiplier number.
      //
      // `continue`, NOT `pkt.amount = 0`: a refused packet must not walk the
      // shield pool and must not emit `damage`, or the client plays a hit that
      // never happened (floating number, impact vfx, guard-break reaction).
      //
      // Two things still have to happen even though the packet is dropped:
      //   · the scoreboard scores it as BLOCKED, so the post-match screen can
      //     show what the immunity was worth (失敗形態 ②);
      //   · an `immune` event goes out, or the player sees literally nothing.
      if (refusesDamage(world, pkt.target, pkt.type)) {
        recordDamage(world, pkt.source, pkt.target, 0, 0, pkt.amount, pkt.origin);
        world.emit("immune", {
          target: pkt.target,
          source: pkt.source,
          amount: pkt.amount,
          dmgType: pkt.type,
          origin: pkt.origin,
        });
        continue;
      }

      // ---- 閃避 · ABILITY channel (GH#289 lane P5) --------------------------
      // ⚠️ RECONSTRUCTED 2026-07-30 — same incident as the shield block above.
      //
      // BASIC attacks roll at their landing site in BasicAttackSystem (so a
      // dodged auto is invisible to the whole on-hit proc chain); this queue is
      // the only seam an ABILITY packet can be intercepted at. `combat/
      // evasion.ts`'s header documents exactly that asymmetry.
      //
      // AFTER the immunity check on purpose: an invulnerable target must not
      // spend an rng draw, or the two mechanics would perturb each other's
      // replay. `continue` drops the packet WHOLE — a dodged ability spends no
      // shield. `rollEvadeAbility` keeps its own ZERO GUARANTEE (p <= 0 returns
      // before touching the rng), so this line is inert until content opts in.
      if (
        pkt.origin !== "basic" &&
        rollEvadeAbility(world, pkt.source, pkt.target, pkt.type === "true")
      ) {
        continue;
      }

      // Global combat-env damage factor: applied ONCE per packet, pre-
      // mitigation. Every damage source (basics, abilities, item/augment
      // procs, DoTs) drains through this queue, so this one line is the whole
      // "attack damage output" knob. Packets are consumed exactly once (the
      // batch splice above), so mutating amount here is safe.
      pkt.amount *= world.combatEnv.damageDealt;

      // "impact" = post-mitigation, PRE-shield damage: the blow's raw force,
      // used to scale hitstop/knockback even when a shield eats the hp loss.
      const impact = mitigate(world, pkt);
      let dmg = impact;

      // shields absorb first (oldest first, deterministic). Track how much was
      // absorbed + whether the shield pool went from >0 to 0 (a guard break).
      // `shieldBefore` / the guard-break basis is the ELIGIBLE total, not the
      // whole pool: an anti-magic barrier still standing must not suppress the
      // 破碎 beat when the pool that actually paid for a PHYSICAL hit empties.
      const shieldBefore = eligibleShieldTotal(hp.shields, world.tick, pkt.type);
      for (const sh of eligibleShields(hp.shields, world.tick, pkt.type, world.shieldRules.absorbOrder)) {
        const absorbed = Math.min(sh.amount, dmg);
        sh.amount -= absorbed;
        dmg -= absorbed;
        if (dmg <= 0) break;
      }
      hp.shields = hp.shields.filter((s) => s.amount > 0 && s.expiresAtTick > world.tick);
      const shieldAbsorbed = shieldBefore - eligibleShieldTotal(hp.shields, world.tick, pkt.type);

      const hpBefore = hp.hp;
      if (dmg > 0) hp.hp -= dmg;

      // lifesteal on basic attacks
      if (pkt.origin === "basic" && dmg > 0) {
        const srcStats = world.stats.get(pkt.source);
        const srcHp = world.health.get(pkt.source);
        if (srcStats && srcHp && srcHp.alive) {
          const ls = srcStats.final[Stat.Lifesteal];
          if (ls > 0) {
            // combatEnv.healing scales the RESTORE (a heal), on top of the
            // lifesteal STAT already scaled by combatEnv.lifesteal. Same clamp
            // + same recordHealing as before; healTarget additionally emits
            // `heal` so lifesteal draws a 補血 number on your own body (#92).
            healTarget(world, {
              source: pkt.source,
              target: pkt.source,
              amount: dmg * ls * world.combatEnv.healing,
              origin: "lifesteal",
              score: true,
            });
          }
        }
      }

      // ---- match scoreboard: attribute this resolved packet ----
      // output = mitigated force pre-shield (credits attacker even if shielded);
      // hpLoss = HP actually removed; blocked = armor/MR mitigation + shield eaten.
      const mitigatedByResist = Math.max(0, pkt.amount - impact);
      recordDamage(world, pkt.source, pkt.target, impact, Math.max(0, dmg), mitigatedByResist + shieldAbsorbed, pkt.origin);

      // ---- rich damage event (the sim<->client seam, per combat-juice) ----
      // blocked := a shield absorbed part of the hit OR a damage-reduction buff
      //   is active (map to the EXISTING mitigation paths; no new guard system).
      // guardBreak := the target's shield pool broke (>0 -> 0) THIS hit.
      // killingBlow := the hit dropped the target to 0 hp (death lands next
      //   system). dmgType duplicates `type` under the contract's field name;
      //   `type`/`origin` are kept for existing consumers (DeathSystem, tests).
      const blocked = shieldAbsorbed > 1e-9 || hasDamageReductionBuff(world, pkt.target);
      // ELIGIBLE total on both sides of the comparison: an anti-magic barrier
      // that this physical hit could never spend must not suppress the 破碎
      // beat when the pool that DID pay for it empties.
      const guardBreak =
        shieldBefore > 1e-9 &&
        shieldAbsorbed > 1e-9 &&
        eligibleShieldTotal(hp.shields, world.tick, pkt.type) <= 1e-9;
      const killingBlow = hpBefore > 0 && hp.hp <= 0; // only the packet that crosses 0
      const tt = world.transform.get(pkt.target);

      world.emit("damage", {
        x: tt?.pos.x ?? 0,
        z: tt?.pos.z ?? 0,
        source: pkt.source,
        target: pkt.target,
        amount: dmg,
        type: pkt.type,
        dmgType: pkt.type,
        blocked,
        crit: pkt.crit,
        killingBlow,
        origin: pkt.origin,
      });

      // THE HIT-CANCEL (LANE D): this ability CONNECTED, so the caster's
      // post-resolve recovery is cancelled on the very tick the damage lands
      // and they may act immediately — that is the whole combo rule. A whiff
      // never reaches here, so a whiff eats the full recovery.
      // Placed before applyImpact only so the free-to-act state is settled
      // before the impact reactions read the world; neither depends on the other.
      noteAbilityConnect(world, pkt.source, pkt.target, pkt.origin);

      // on-impact reactions (hitstop/knockback/knockdown/guardBreak/hitImpact)
      applyImpact(world, pkt.source, pkt.target, impact, pkt.type, blocked, guardBreak, pkt.crit, killingBlow, pkt.origin);

      fireHooks(world, pkt.source, "onDamageDealt", pkt.target);
      fireHooks(world, pkt.target, "onDamageTaken", pkt.source);
    }
  }
}

/** Queue a shield on a target. */
export function addShield(
  world: SimWorld,
  target: EntityId,
  amount: number,
  durationSecs: number,
  sourceId: string,
  /**
   * 護盾類型過濾 (GH#289 lane P6). ABSENT and the explicit `"all"` are the SAME
   * pool — both eat every damage type, which is the pre-filter behaviour — so
   * the two spellings are normalised here rather than at every read site.
   */
  absorbs?: import("../components").ShieldAbsorb,
): void {
  const hp = world.health.get(target);
  if (!hp) return;
  hp.shields.push({
    amount,
    expiresAtTick: world.tick + Math.round(durationSecs / world.dt),
    sourceId,
    ...(absorbs !== undefined && absorbs !== "all" ? { absorbs } : {}),
  });
}
