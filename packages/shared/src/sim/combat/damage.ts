/**
 * Damage queue + resolution. Effects QUEUE damage; this system drains the queue
 * in one ordered pass per tick (mitigation → shields → hp → hooks), so results
 * never depend on effect iteration order.
 */
import type { AbilityId, ChampionId, EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { DamageType, TriggerDamage } from "../effects/effect";
import { DAMAGE_QUEUE_MAX_PASSES } from "../effects/reflectLimits";
import type { StructureComp } from "../systems/GuardianSystem";
import { Stat } from "../stats/statTypes";
import { fireHooks } from "../effects/hooks";
import { recordDamage } from "../stats/matchStats";
import { refusesDamage } from "../effects/invulnerable";
import { rollEvadeAbility } from "./evasion";
import { blockCutFor } from "./block";
import { effectiveLifesteal } from "./critStrike";
import {
  applyDamageConversion,
  impactGateTypeOf,
  resolveDamageConversion,
} from "./damageTypeOverride";
import { cancelLeap } from "../movement/leap";
import { healTarget, restoreMana } from "./restore";
import type { DamageRefund } from "../effects/dynamicTerms";
import { normalize, sub, lenSq, dist } from "../math/vec2";
import { knockbackRaw, afterGap } from "../combatFeel";
import { Abilities, Champions } from "../content/registry";
import { noteAbilityConnect } from "../abilities/abilityRecovery";
import { breakStatusesOnDamage } from "../statusBreak";
import { woundMult } from "../grievousWounds";
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
  /**
   * provenance。**出貨的字彙只有五種**(全樹 9 個 `damageQueue.push` 站點都
   * 列在 `combat/damageTypeOverride.ts` 的 `DamageConversionScope`):
   * `"basic"` · `` `ability:${id}` `` · `` `hook:${srcId}` `` · `"mob"` ·
   * `"guardian"` / `"guardian-heir"`。
   *
   * ⚠️ 一支技能留下的**延燒每一跳也帶著 `ability:<id>`** —— `effects/dot.ts` 把
   * `ctx.origin` 寫進 `DotInstance.origin`,`effects/dotTick.ts` 再原封不動寫進
   * 封包。所以「延燒算不算技能傷害」的答案是**算**(owner 2026-08-01),而且是
   * 靠這條資料流成立的,不是靠任何一個判斷式。
   */
  origin: string;
  /**
   * [型別轉換] **衝擊反應**(擊倒)那道閘要讀的傷害型別,也就是這一發**被最後
   * 一次轉換之前**的型別。ABSENT = 沒有人轉換過它(或最後一個轉換者明講
   * `impactType: "converted"`)= 讀 `type`,也就是這個欄位出現之前的每一發封包
   * —— 加上它是一個嚴格的 no-op。
   *
   * 為什麼需要它:`applyImpact` 的擊倒閘是 `type !== "magic"`,而 惡夢魔王碎片
   * 在那一行**之前**就把 magic 蓋成 true。少了這個欄位,「把技能傷害轉成真傷」
   * 會順便送給持有者的每一發法術一個它本來沒有的擊倒。決策點與預設值寫在
   * `combat/damageTypeOverride.ts` 的 `ConvertedImpactType`。
   *
   * ⚠️⚠️ **這個欄位 2026-08-01 以前叫 `impactType`,而那是一個同名陷阱。**
   * `DamageTypeOverride.impactType`(`content/` 的 schema 欄位、後台看得到的那個)
   * 的值是 `"original" | "converted"` —— 一個**政策**;這一個的值是
   * `"physical" | "magic" | "true"` —— 一個**傷害型別**。兩個曾經在
   * `applyDamageConversion` 的同一行裡並肩出現。改名的是**這一個**(sim 內部、
   * 一寫一讀、不上 wire、不進 content),不是那一個(出貨資料 + 後台卡片)。
   * 完整理由寫在 `combat/damageTypeOverride.ts` 的 `ConvertedImpactType` 檔頭。
   *
   * 只有 `applyDamageConversion` 寫它,只有 `impactGateTypeOf` 讀它。
   */
  impactGateType?: DamageType;
  /**
   * [反彈] 這一發封包**已經是第幾代反彈**。ABSENT = 0 = 一發原始傷害,也就是
   * 這個欄位出現之前的每一發封包 —— 所以加上它是一個嚴格的 no-op。
   *
   * 只有 `damage.incomingPct`(反彈)會寫它,寫的值一律是「觸發我的那一發的深度
   * + 1」。它存在的唯一理由是讓 A→B→A→… 的互相反彈**可證明會停**:
   * 深度嚴格遞增 + 有上界。完整證明在 `effects/damage.ts` 的 handler 上方。
   */
  reflectDepth?: number;
  /**
   * 這一發封包**免除** `combatEnv.damageDealt` 全域傷害倍率。
   *
   * ABSENT / false = 照乘,也就是這個欄位出現之前的每一發封包 —— 加上它是一個
   * 嚴格的 no-op。
   *
   * 唯一會寫它的是 [反彈](`damage.incomingPct`),而且理由是**避免乘兩次**:
   * 反彈的分母(`TriggerDamage` 的三個讀數)是在下面那一行**乘完之後**才取的,
   * 所以反彈封包再走一次同一行,倍率就進去了兩次,反彈比 = `pct × k` 而不是
   * `pct`。k=1 出貨值看不出來,而後台戰鬥系統頁(#28)存在的意義就是動 k。
   *
   * 「要不要乘」是內容的決定,不是這裡的分支:見 `incomingPct.applyGlobalDamageMult`。
   */
  skipGlobalDamageMult?: boolean;
  /**
   * [暴擊吸血] (天堂之劍 godie-i01n 「暴擊時吸血回復100%傷害」) —— 這一發
   * **procced 出來的**吸血比例,在揮擊那一刻由
   * `combat/critStrike.ts::rollCritStrike` 決定。
   *
   * ABSENT = 沒有 proc = 走持有者原本的 `Stat.Lifesteal`,也就是這個欄位出現
   * 之前的每一發封包 —— 所以加上它是一個嚴格的 no-op。
   *
   * ⚠️ `undefined` 和 `0` **必須分得開**:`0` 是一個合法的 proc(一個
   * `lifestealFraction: 0` 的 grant),而把兩者用 `||` 混起來的那一刻,一個沒有
   * proc 的普攻就會把持有者原本的吸血蓋成 0。結合點只有一個
   * (`effectiveLifesteal`),理由寫在 `combat/critStrike.ts` ④。
   */
  critLifesteal?: number;
  /**
   * 「把這一發**實際打出去的量**折回給 `source`」—— 瑪那魔杖 godie-i020
   * 「回復己方 MP 該傷害量」。ABSENT = 不折,也就是這個欄位出現之前的每一發
   * 封包,所以加上它是一個嚴格的 no-op。
   *
   * ⚠️ 它必須在**封包**上而不是在 `effects/damage.ts` 裡算完,而這正是這個
   * 機制唯一會出錯的地方:效果端只知道「打算打多少」,而排空迴圈之後才知道
   * 全域倍率 → 護甲/魔抗 → 格擋 → 護盾 之後真的掉了多少。文案的「該傷害量」
   * 指的是玩家看到的那個浮動數字,也就是後者(見 `DamageRefund.basis`)。
   * 在效果端算會是一個永遠比畫面大的數字 —— 面板與實際不一致(#125 的形態)。
   */
  refund?: DamageRefund;
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
 *
 * ⚠️ **TWO damage types, deliberately.**
 *   · `type`           —— 這一發**現在**是什麼型別。給演出用:`hitImpact` 的
 *                         `dmgType`、`deriveCosmetics` 的火花/閃光。玩家看到
 *                         白色的真傷數字時,火花也該是真傷的火花。
 *   · `impactGateType` —— 這一發**被轉換之前**是什麼型別。只給擊倒那道閘用。
 *
 * 沒有轉換的封包兩者相等(`impactGateTypeOf` 對 ABSENT 回 `type`),所以這個分裂對
 * 全樹每一發不帶 `damageTypeOverride` 的封包是嚴格的 no-op。分裂本身的理由寫在
 * `combat/damageTypeOverride.ts` 的 `ConvertedImpactType`:轉換傷害型別不應該
 * 順便送出一個沒有人設計過的硬控。
 */
function applyImpact(
  world: SimWorld,
  source: EntityId,
  target: EntityId,
  impact: number,
  type: DamageType,
  impactGateType: DamageType,
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
  //
  // ⚠️ 讀的是 `impactGateType`(**轉換前**的型別),不是 `type`。一發被 惡夢魔王
  // 碎片 轉成真傷的法術在畫面上是真傷、在護甲/魔抗上是真傷,但**在這道閘上仍然
  // 是法術** —— 除非那件道具明講 `impactType: "converted"`(那是**道具文件**上
  // 的政策欄位,跟這個參數不是同一個東西,見 `damageTypeOverride.ts` 的同名陷阱)。
  if (!blocked && impact >= KD_MIN_IMPACT && impactGateType !== "magic") {
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
  //
  // ⚠️ 這個預算不再只是一個字面量:`REFLECT_MAX_CHAIN_DEPTH` 的上界是**從它算
  // 出來的**(見 effects/reflectLimits.ts)。改這個數字要一起看那裡的不等式。
  //
  // ⚠️ 而「反彈不會溢到下一個 tick」**不是**靠那個不等式保證的 —— 那個推導假設
  // 鏈從第 0 輪起跳,而 hook 排出來的封包不是。保證來自下面 `pass` 被寫進
  // `TriggerDamage.resolvePass`,由 `effects/damage.ts` 的閘門在執行期擋掉一發
  // 塞不進剩餘輪數的反彈。
  for (let pass = 0; pass < DAMAGE_QUEUE_MAX_PASSES && world.damageQueue.length > 0; pass++) {
    const batch = world.damageQueue.splice(0, world.damageQueue.length);
    for (const pkt of batch) {
      const hp = world.health.get(pkt.target);
      if (!hp || !hp.alive) continue;

      // ---- 傷害型別轉換 · "beforeGates" 相位 (無視防禦 / 真實傷害家族) -------
      // 這一相位的來源在**免疫與閃避之前**就把封包蓋掉,所以那兩道閘看到的是
      // 轉換後的型別 —— 魔法免疫擋不住一發被轉成 true 的法術,預設的迴避也閃
      // 不掉它。**沒有任何出貨內容用這一相位**(三件武器都用預設的
      // "afterGates"),所以這一行在今天是嚴格的 no-op;它存在是因為
      // 「無視防禦」到底該不該連免疫一起無視是 owner 會改的決策,而那個決策
      // 應該長在編輯器的卡片上,不是長在這個檔的一行程式裡。
      // 完整推導見 `combat/damageTypeOverride.ts` 的 `DamageConversionPhase`。
      const preGate = resolveDamageConversion(world, pkt.source, pkt.origin, "beforeGates");
      if (preGate !== undefined) applyDamageConversion(pkt, preGate);

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

      // ---- 傷害型別轉換 · "afterGates" 相位 —— 出貨的那一個 -----------------
      // 霸王破甲槍 / 死之王的長槍 (`scope: "basic"`) 與 惡夢魔王碎片
      // (`scope: "ability"`) 都落在這裡:免疫與閃避已經用**原本的**型別問完了,
      // 接下來 `mitigate()`(護甲/魔抗)與護盾池的型別過濾看到的才是新型別。
      // 那正好就是「無視防禦」這句話字面上要的東西 —— 一點不多。
      //
      // ⚠️ 位置很要緊,而且要緊的是**下面那三行**而不是這一行本身:
      //   · 在 `mitigate()` 之前 → 護甲/魔抗真的被跳過(true 直接 return amount);
      //   · 在護盾池之前 → 一個 `absorbs: "physical"` 的護盾不再吃這一發;
      //   · 在 `world.emit("damage")` 與 `applyImpact()` 之前 → 客戶端的浮動
      //     數字與受擊閃光拿到的是轉換後的型別,不會出現「sim 當成真傷、畫面
      //     畫成物理」的分裂(失敗形態 ②)。
      // 把它移到 `mitigate()` 之後,整族道具就會變成完全無效而測試照樣綠 ——
      // 這正是 `damageTypeOverride.test.ts` 的突變點。
      //
      // ⚠️⚠️ 2026-08-01 更正:上面第三點原本還寫著「**擊倒判定**(`type !== "magic"`)
      // 拿到的也是同一個型別」,而那句話描述的是一個**沒有人選過的行為** ——
      // 惡夢魔王碎片 把 magic 蓋成 true,於是持有者的每一發法術都多了一個它本來
      // 沒有的擊倒。擊倒現在讀 `impactGateTypeOf(pkt)`(預設 = 轉換前的型別),
      // 而「要不要跟著轉換」是 `DamageTypeOverride.impactType` 這個欄位。
      // 浮動數字/閃光仍然讀轉換後的 `pkt.type` —— 那一半是對的,沒有被動到。
      const postGate = resolveDamageConversion(world, pkt.source, pkt.origin, "afterGates");
      if (postGate !== undefined) applyDamageConversion(pkt, postGate);

      // Global combat-env damage factor: applied ONCE per packet, pre-
      // mitigation. Every damage source (basics, abilities, item/augment
      // procs, DoTs) drains through this queue, so this one line is the whole
      // "attack damage output" knob. Packets are consumed exactly once (the
      // batch splice above), so mutating amount here is safe.
      //
      // ⚠️ ONCE PER PACKET, and 「一發反彈」和「觸發它的那一發」是**兩發封包**。
      // 反彈的分母是這一行**之後**的讀數,所以少了 `skipGlobalDamageMult`,
      // 反彈就會被乘第二次(比例變成 `pct × k`)。整段推導寫在 `DamagePacket`
      // 那個欄位上,開關是 `incomingPct.applyGlobalDamageMult`。
      if (pkt.skipGlobalDamageMult !== true) pkt.amount *= world.combatEnv.damageDealt;

      // "impact" = post-mitigation, PRE-shield damage: the blow's raw force,
      // used to scale hitstop/knockback even when a shield eats the hp loss.
      const impact = mitigate(world, pkt);

      // `shieldBefore` / the guard-break basis is the ELIGIBLE total, not the
      // whole pool: an anti-magic barrier still standing must not suppress the
      // 破碎 beat when the pool that actually paid for a PHYSICAL hit empties.
      //
      // ⚠️ HOISTED ABOVE THE 格擋 GATE, and that is load-bearing rather than
      // tidy: 「抵擋致命一擊(超過現存生命的傷害)」 has to know whether this packet
      // would ACTUALLY kill, and a 500-point barrier means a 300-point hit is
      // not a killing blow. Reading it here — before a single point is spent —
      // is what lets `blockCutFor` answer that without a second pass.
      const shieldBefore = eligibleShieldTotal(hp.shields, world.tick, pkt.type);

      // ---- 格擋 (奇門盾甲 · 黃金聖鬥衣 · 晨曦之光 · 殺豬刀) ------------------
      // AFTER `mitigate()`, BEFORE the shield pool. All three positions matter
      // and each is observable — full derivation in `combat/block.ts` ③:
      //   · after mitigate  → 「擋掉一半」 halves what you would REALLY have eaten;
      //   · before shields  → a block does NOT spend your barrier;
      //   · `impact` itself is NOT reduced → `applyImpact` still reacts to how
      //     hard the blow LANDED, exactly as it already does for a hit a shield
      //     ate whole (檔頭:「a fully-blocked heavy hit still block-freezes」).
      //
      // NOT next to `refusesDamage`, and not a `continue`. 無敵 refuses a packet
      // (「the client plays a hit that never happened」); 格擋 STOPS one that
      // arrived — which is byte-for-byte the shield-ate-it-all case the client
      // already draws: `blocked: true` → `combatText` 「guard」 + `hitFeel`'s
      // `sparkKind: "block"` + GameApp's `playContextualVoice(blocker,"block")`.
      // So this needs no new event and no `net/eventFanout.ts` entry.
      //
      // `blockCutFor` keeps its own ZERO GUARANTEE (no eligible source ⇒ it
      // returns before touching `world.rng`), so this line is inert — and every
      // existing replay bit-identical — until an item authors `block`.
      const blockCut = blockCutFor(
        world,
        pkt.target,
        pkt.type,
        impact,
        hp.hp,
        shieldBefore,
      );
      let dmg = impact - blockCut;

      // shields absorb what is LEFT (oldest first, deterministic). Track how
      // much was absorbed + whether the shield pool went from >0 to 0 (a guard
      // break).
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
          // [暴擊吸血] joins HERE, and this is the ONLY place the two lifesteal
          // notions are combined — `combat/critStrike.ts::effectiveLifesteal`
          // owns the replace/add decision (a FIELD, `lifestealMode`). Absent
          // `pkt.critLifesteal` returns `srcStats.final[Stat.Lifesteal]`
          // unchanged, which is byte-for-byte the pre-critStrike line.
          const ls = effectiveLifesteal(
            world,
            pkt.source,
            srcStats.final[Stat.Lifesteal],
            pkt.critLifesteal,
          );
          if (ls > 0) {
            // combatEnv.healing scales the RESTORE (a heal), on top of the
            // lifesteal STAT already scaled by combatEnv.lifesteal. Same clamp
            // + same recordHealing as before; healTarget additionally emits
            // `heal` so lifesteal draws a 補血 number on your own body (#92).
            healTarget(world, {
              source: pkt.source,
              target: pkt.source,
              // 【重創】A6 —— 讀取點②，打在**係數**那一步。
              // ⛔ 這裡是 `lifestealMult` 而不是 `healingTakenMult`：底下那一發
              // `healTarget` 已經會咬 `healingTakenMult`，在這裡再乘一次同一格
              // 會讓帶重創的人吸血變成 0.25 倍而不是 0.5 倍
              //（`grievousWounds.test.ts` 的第四條就是在釘這個）。
              amount:
                dmg *
                ls *
                world.combatEnv.healing *
                woundMult(world, pkt.source, "lifestealMult"),
              origin: "lifesteal",
              score: true,
            });
          }
        }
      }

      // ---- 「回復己方 MP 該傷害量」 (瑪那魔杖 godie-i020) -------------------
      // 位置緊跟著吸血,而且理由一模一樣:兩者都是「攻擊者從**這一發實際打出去
      // 的量**得到的回報」,而那個量到這一行才算得出來。
      //
      // ⚠️ 讀的是 `dmg` / `impact`,**不是** `pkt.amount` —— `pkt.amount` 是
      // 「打算打多少」(已過全域倍率,未過護甲/魔抗/格擋/護盾)。文案講的
      // 「該傷害量」是玩家看到的那個浮動數字,而那個數字就是下面 `emit("damage")`
      // 帶的 `dmg`,也就是預設 basis `"hpLost"`。
      //
      // 三個守衛,每一個都對應一個真的會發生的情況:
      //   · `dmg <= 0` → 整發被護盾/格擋吃掉。`"hpLost"` 下回 0 是**正確**的
      //     (什麼都沒打到),而 `restoreMana` 自己還有 `RESTORE_EPSILON`,
      //     所以連一個 0 的 `manaRestore` 事件都不會發出去。
      //   · 施法者已經死了 → 不回。跟吸血同一條規則(`srcHp.alive`)。
      //   · `resource: "health"` 走 `healTarget` 並吃 `combatEnv.healing`,
      //     跟吸血一致;法力**不**吃那個係數(那是治療旋鈕,不是法力旋鈕 ——
      //     `effects/restore.ts` 已經立過這條規則)。
      const refund = pkt.refund;
      if (refund !== undefined) {
        const gain =
          (refund.basis === "mitigated" ? impact : Math.max(0, dmg)) * refund.pct;
        const srcHp = world.health.get(pkt.source);
        if (gain > 0 && srcHp?.alive) {
          if (refund.resource === "mana") {
            restoreMana(world, {
              source: pkt.source,
              target: pkt.source,
              amount: gain,
              origin: pkt.origin,
            });
          } else {
            healTarget(world, {
              source: pkt.source,
              target: pkt.source,
              amount: gain * world.combatEnv.healing,
              origin: pkt.origin,
              score: true,
            });
          }
        }
      }

      // ---- match scoreboard: attribute this resolved packet ----
      // output = mitigated force pre-shield (credits attacker even if shielded);
      // hpLoss = HP actually removed; blocked = armor/MR mitigation + shield
      // eaten + 格擋. The 格擋 term is what makes the post-match screen able to
      // say what the 50% block was worth — without it a fully-blocked hit is
      // scored as 0 output and 0 blocked, i.e. it never happened (失敗形態 ②).
      const mitigatedByResist = Math.max(0, pkt.amount - impact);
      recordDamage(world, pkt.source, pkt.target, impact, Math.max(0, dmg), mitigatedByResist + shieldAbsorbed + blockCut, pkt.origin);

      // ---- rich damage event (the sim<->client seam, per combat-juice) ----
      // blocked := a shield absorbed part of the hit OR a damage-reduction buff
      //   is active (map to the EXISTING mitigation paths; no new guard system).
      // guardBreak := the target's shield pool broke (>0 -> 0) THIS hit.
      // killingBlow := the hit dropped the target to 0 hp (death lands next
      //   system). dmgType duplicates `type` under the contract's field name;
      //   `type`/`origin` are kept for existing consumers (DeathSystem, tests).
      // `blockCut > 0` joins the SAME flag rather than minting a second one:
      // that flag is the client's whole 「擋下了」 channel (guard text, block
      // spark, softer shake, the defender's block voice line), and 格擋 wants
      // every one of them. A separate flag would be a second thing four client
      // sites must learn — three of which would forget (失敗形態 ③).
      const blocked =
        shieldAbsorbed > 1e-9 || blockCut > 1e-9 || hasDamageReductionBuff(world, pkt.target);
      // ELIGIBLE total on both sides of the comparison: an anti-magic barrier
      // that this physical hit could never spend must not suppress the 破碎
      // beat when the pool that DID pay for it empties.
      const guardBreak =
        shieldBefore > 1e-9 &&
        shieldAbsorbed > 1e-9 &&
        eligibleShieldTotal(hp.shields, world.tick, pkt.type) <= 1e-9;
      const killingBlow = hpBefore > 0 && hp.hp <= 0; // only the packet that crosses 0

      // C4 睡眠（#278）—— 受傷即提早解除標了 `breakOnDamage` 的那幾筆。
      // ⚠️ 位置是刻意的：在 `world.emit("damage")` **之前**，所以客戶端收到那一發
      // 傷害的同一個 tick，被打醒的人已經不是睡著的狀態了 —— 否則畫面上會有一格
      // 「打到了但他還在睡」（同檔 :775 那段註解在講的同一件事）。
      // `dmg` 是護盾吃掉之後**實際扣掉**的數，門檻比的就是它。
      breakStatusesOnDamage(world, pkt.target, dmg);

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
      applyImpact(world, pkt.source, pkt.target, impact, pkt.type, impactGateTypeOf(pkt), blocked, guardBreak, pkt.crit, killingBlow, pkt.origin);

      // THE PACKET ITSELF, handed to the hooks it is about ([反彈], #GGD-legendary).
      //
      // 三個讀數一起帶,而不是在這裡先挑一個:挑哪一個是**內容的決定**
      // (`damage.incomingPct.basis`),而這裡三個都已經算好了,成本是零。
      // 在來源端先選 = 把一個決策點烘進 sim(CLAUDE.md 第一守則)。
      //   raw       = 本來的量(**已經**過了上面那一行的全域倍率,未過護甲/魔抗)
      //   mitigated = `impact`,過了護甲/魔抗、還沒進護盾池
      //   hpLost    = 真的從血條掉下來的那一格
      // `reflectDepth` 是反彈鏈終止性的載體(effects/damage.ts 有完整證明)。
      // `resolvePass` 是「還來不來得及」的載體 —— 見下面那一段。
      const trigger: TriggerDamage = {
        raw: pkt.amount,
        mitigated: impact,
        hpLost: Math.max(0, dmg),
        origin: pkt.origin,
        reflectDepth: pkt.reflectDepth ?? 0,
        // 這一發是在第幾輪落地的。**不是常數 0**:hook 排出來的封包(每一件
        // [On-Hit] 道具)最早也要第 1 輪才解算,而 `reflectLimits.ts` 以前那個
        // 「深度 d 在第 d 輪落地」的推導正是漏了這件事。反彈鏈用它算剩幾輪。
        resolvePass: pass,
        // B2 (2026-08-05) —— 這兩格**本來就在手上**。`pkt` 的第 44、45 個欄位
        // 就是 `type` 與 `crit`，而在這兩行出現之前它們沒有被抄過來,於是
        // 【暴擊時】【這一發是 AP／AD／真傷】四個標籤在編輯器上寫不出來。
        // 成本是零:同一個作用域、同一個物件字面,沒有多讀任何東西。
        type: pkt.type,
        crit: pkt.crit,
      };
      fireHooks(world, pkt.source, "onDamageDealt", pkt.target, undefined, trigger);
      fireHooks(world, pkt.target, "onDamageTaken", pkt.source, undefined, trigger);
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
