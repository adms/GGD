/**
 * THE CAST-TIME FORMULA (LANE A) — one pure function that assigns every
 * ability its `castTimeSec`, derived from data the content already carries.
 *
 * ── the owner's rule, as revised ──────────────────────────────────────────
 *   「castTimeSec … 0.3 - 0.6 s，依技能有多兇殘決定，最兇的封頂 0.9 s」
 * The first draft of the rule was a flat 0.6 s for everything. It shipped, was
 * A/B'd against castTimeSec = 0 in a real 12-bot MatchController, and lost:
 *
 *   - HUMAN ROOT DUTY mean 41.7 % / median 34.7 % of a round spent hard-rooted
 *     (cooldowns are multiplied by combat-env `cooldown` = 0.25, so the median
 *     ability is actually up every 11.25 s and a player casting on cooldown
 *     stands still a third of the match). 25 of 113 champions were >= 50 %.
 *   - SEVEN CHAMPIONS became statues — their post-multiplier cooldowns were
 *     SHORTER than their own cast time, so they could never leave the cast.
 *   - THIRTEEN DASHES rooted before they moved (displacement flat until tick
 *     18). Only 12 of 113 champions own a dash, so the flat rule deleted the
 *     entire "I can dodge" population — the thing the telegraph exists for.
 *   - FIFTEEN abilities wound up longer than the effect they produced lasts.
 *   - Shields and heals became 0.6 s late, changing whether a save is possible.
 *
 * This module is the fix, and it is written as a FORMULA rather than 554
 * hand-authored numbers so the curve stays coherent: every input below is a
 * field that already exists in `ability@1`, nothing is a new taxonomy, and
 * `castTimeCoverage.test.ts` re-derives all 554 values from the real
 * post-registration registry and fails if content and formula disagree.
 *
 * ── shape ─────────────────────────────────────────────────────────────────
 *   1. EXEMPTIONS run first and win outright (see `CastTimeClass`).
 *   2. Otherwise a PUNISH SCORE in [0,1] is built from damage / hard CC / AoE
 *      radius / slot / delivery, and mapped onto the 7-step ladder
 *      0.3 0.4 0.5 0.6 0.7 0.8 0.9.
 *   3. Two CEILINGS then pull the value back down. The cooldown ceiling is the
 *      invariant that makes a statue structurally impossible.
 *
 * ── why 0.1 s steps ───────────────────────────────────────────────────────
 * The sim runs at dt = 1/30 s and `abilitySystem.ts` converts with
 * `Math.round(castTimeSec / world.dt)`. Every multiple of 0.1 in 0.3..0.9 is an
 * exact whole number of ticks (9, 12, 15, 18, 21, 24, 27), so the authored
 * second and the simulated tick agree exactly — no half-tick rounding, and the
 * telegraph the client draws is the telegraph the sim honours. The pre-lane
 * 0.35 s values did NOT have this property (10.5 ticks -> 11 -> 0.367 s).
 */
import type { AbilityDef } from "../sim/content/defs";
import { rankScalarMax } from "../sim/perRank";
import type { EffectDef } from "../sim/effects/effect";

/** Ladder step, seconds. Every step is a whole number of 1/30 s sim ticks. */
export const CAST_STEP = 0.1;
/** Floor for anything that casts at all. 9 ticks. */
export const CAST_FLOOR = 0.3;
/** Cap reserved for the genuinely scary. 27 ticks. */
export const CAST_CAP = 0.9;

/**
 * THE STATUE INVARIANT. Fraction of an ability's OWN post-multiplier cooldown
 * that its cast time may consume. One eighth, and the choice is arithmetic
 * rather than taste:
 *
 *   ct <= cooldown/8  =>  per-ability root duty <= 12.5 %
 *                     =>  a champion with FOUR castable slots, pressing every
 *                         one of them the instant it comes up, can never
 *                         exceed 50 % root duty. BY CONSTRUCTION.
 *
 * The seven statues (godie-e00v, godie-ekee, godie-etyr, godie-u011,
 * godie-u012, sela, thorne) existed because a flat 0.6 s exceeded the whole
 * cooldown of abilities that come up every 0.13 s. Nothing downstream of this
 * ceiling can reproduce that: `ct <= cd/8 < cd` is unconditional.
 */
export const CD_CEILING_FRACTION = 0.125;

/**
 * The punish score at which an ability is treated as maximally scary and gets
 * the 0.9 s cap. NOT the theoretical maximum of the score (0.93): 0.75 is
 * "the entire offensive payload maxed out" — top-decile damage (0.35) + a hard
 * stun (0.20) + a full-size AoE (0.15) = 0.70 — plus a modest slot/delivery
 * weight. An ability has to be all three of big, stunning and wide to approach
 * it, which is exactly the population the owner reserved 0.9 s for.
 */
export const SCORE_AT_CAP = 0.75;

/**
 * combat-env `cooldown`. The cast-time ceiling has to be computed against the
 * cooldown the match ACTUALLY uses, not the authored seconds: content/config/
 * combat-env.json ships 0.2, so an authored 8 s cooldown fires every 1.6 s.
 * Callers pass the live value; this is the shipped default.
 *
 * CANARY: this MUST equal content/config/combat-env.json `multipliers.cooldown`.
 * castTimeCoverage.test asserts it; when the owner retunes the cooldown mult,
 * re-run `scripts/deriveCastTimes.ts --write` and update this in the same commit.
 */
export const SHIPPED_COOLDOWN_MULT = 0.2;

/** Why an ability got the cast time it got — reported, tested, and auditable. */
export type CastTimeClass =
  /** `passive` set + `effects` empty: `activateAbility` returns before the cast branch. */
  | "passive-only"
  /** Any `dash` effect. Repositioning is the counterplay; it gets the floor. */
  | "mobility"
  /** heal / shield / restore payload and no damage. A late save is not a save. */
  | "defensive"
  /** Cooldown ceiling fell below the floor: a spam button, kept instant. */
  | "rapid-fire"
  /** Scored normally by the punish curve. */
  | "scored";

export interface CastTimeResult {
  /** undefined = the ability must carry NO castTimeSec field (instant / unreachable). */
  readonly castTimeSec: number | undefined;
  readonly cls: CastTimeClass;
  /** Punish score in [0,1] before laddering (0 for exempt classes). */
  readonly score: number;
  /** Ladder value before the ceilings clipped it. */
  readonly rawLadder: number;
  /** ct <= CD_CEILING_FRACTION * cooldown * mult. Infinity when cooldown is 0. */
  readonly cooldownCeiling: number;
  /** ct <= max(FLOOR, effectDuration) for any ability that applies a timed effect. */
  readonly durationCeiling: number;
  /** Human-readable inputs, for the report. */
  readonly features: CastTimeFeatures;
}

export interface CastTimeFeatures {
  readonly damage: number;
  readonly heal: number;
  readonly shield: number;
  readonly hardCc: boolean;
  readonly root: boolean;
  readonly slow: boolean;
  readonly radius: number;
  readonly dash: boolean;
  readonly restore: boolean;
  /** longest timed effect the ability applies (status / buff / shield), 0 if none */
  readonly effectDuration: number;
  /** longest CROWD-CONTROL duration specifically (stun / root / slow), 0 if none */
  readonly ccDuration: number;
  /** true when the ONLY payload is that timed effect — no damage, heal, shield, dash */
  readonly payloadIsDuration: boolean;
  readonly minCooldown: number;
}

function walk(effects: readonly EffectDef[], fn: (e: EffectDef) => void): void {
  for (const e of effects) {
    fn(e);
    if (e.kind === "spawnProjectile") walk(e.onHit, fn);
    // task #247: a leap's payload lives in `onLand`, so the punish score has to
    // descend into it — otherwise a leap-strike reads as an ability with NO
    // damage and no CC and collapses onto the 0.3 floor, which is the opposite
    // of what 蒼月潮's 43-tick slam deserves.
    if (e.kind === "leap" && e.onLand) walk(e.onLand, fn);
  }
}

function scalingMax(s: { flat?: number; perRank?: readonly number[] }): number {
  let v = s.flat ?? 0;
  if (s.perRank?.length) v = Math.max(v, ...s.perRank);
  return v;
}

/** Pull every formula input out of an ability def. Pure; no registry access. */
export function castTimeFeatures(def: AbilityDef): CastTimeFeatures {
  let damage = 0;
  let heal = 0;
  let shield = 0;
  let effectDuration = 0;
  let ccDuration = 0;
  let hardCc = false;
  let root = false;
  let slow = false;
  let dash = false;
  let restore = false;
  walk(def.effects, (e) => {
    switch (e.kind) {
      case "damage":
        damage += scalingMax(e.amount);
        break;
      // 持續傷害 IS DAMAGE (GH#250). `dot` landed after this formula was
      // written (GH#289 lane P1) and was never added here, so an ability that
      // delivers its payload as a burn read as `damage: 0` and collapsed down
      // the ladder — the exact failure the module's own docstring warns about
      // for `leap.onLand`, one primitive later. Counted as the WHOLE burn
      // (payouts × per-payout), because that is what the victim loses and the
      // `damage` term is normalised against total max-rank damage.
      //
      // PAYOUT COUNT mirrors `sim/effects/dotTick.ts` exactly: the deadline is
      // INCLUSIVE and `tickOnApply` is off by default, so payouts land at
      // 1·interval … N·interval with N = floor(duration/interval); the
      // `tickOnApply` form adds the cast-tick payout on top.
      case "dot": {
        const payouts =
          Math.floor(e.durationSec / e.intervalSec + 1e-9) + (e.tickOnApply === true ? 1 : 0);
        damage += scalingMax(e.amountPerTick) * Math.max(1, payouts);
        // A burn is a timed effect like any other, so it feeds CEILING B too.
        effectDuration = Math.max(effectDuration, e.durationSec);
        break;
      }
      case "heal":
        heal += scalingMax(e.amount);
        break;
      case "shield":
        shield += scalingMax(e.amount);
        effectDuration = Math.max(effectDuration, e.duration);
        break;
      case "applyStatus": {
        // ⭐ G2 —— 這三格逐階可以是陣列，而這支**不知道階數**（它在推導一支技能
        // 的前搖）。所以取 `rankScalarMax`：問的是「這一支最強會是多少」，
        // 而 rank 1 是最弱的一階（見 `sim/perRank.ts::rankScalarMax`）。
        const dur = rankScalarMax(e.duration) ?? 0;
        const msm = rankScalarMax(e.moveSpeedMult);
        effectDuration = Math.max(effectDuration, dur);
        if (e.stun || e.root || (msm !== undefined && msm < 1)) {
          ccDuration = Math.max(ccDuration, dur);
        }
        if (e.stun) hardCc = true;
        if (e.root) root = true;
        if (msm !== undefined && msm < 1) slow = true;
        break;
      }
      case "applyBuff": {
        // ⭐ S4a：`duration` 之後是選填（與 `permanent` 互斥）。一份永久增益對
        // 「這一招的效果持續多久」這個問題沒有有限的答案，所以它貢獻 0 ——
        // 與這個欄位出現之前每一份文件（一律有 duration）逐字相同。
        let d = e.duration ?? 0;
        if (e.perRank?.length) d = Math.max(d, ...e.perRank.map((p) => p.duration ?? 0));
        effectDuration = Math.max(effectDuration, d);
        break;
      }
      case "dash":
        dash = true;
        break;
      case "restore":
        restore = true;
        break;
      default:
        break;
    }
  });
  return {
    damage,
    heal,
    shield,
    hardCc,
    root,
    slow,
    radius: def.radius ?? 0,
    dash,
    restore,
    effectDuration,
    ccDuration,
    payloadIsDuration:
      effectDuration > 0 && damage === 0 && heal === 0 && shield === 0 && !dash && !restore,
    minCooldown: def.cooldown.length ? Math.min(...def.cooldown) : 0,
  };
}

/**
 * PUNISH SCORE in [0,1]. Weights sum to 1. Every term is normalised against
 * the observed distribution of the real 545 castable abilities, so the curve
 * describes THIS game's content and not a generic MOBA.
 *
 *   damage   .35  raw max-rank damage / 1400 (real distribution of the 309
 *                 damaging abilities: p25 190, med 300, p75 700, p90 1000,
 *                 max 2200 — 1400 is ~p97, so only true nukes saturate)
 *   hard CC  .20  stun 1.0 / root 0.6 / slow 0.25 — being unable to walk out is
 *                 what makes an ability punishing, so it is the second input
 *   AoE      .15  radius / 8 (real radii: median 5.88, max 9.72) — area beats
 *                 single target
 *   slot     .20  EX .9 > R .55 > W/E .12 > Q .08  (the xx-01..04 / xx-002
 *                 convention: EX is the once-a-match button)
 *   delivery .10  ground .5 / skillshot .3 / targeted .1 / self 0 — a ground
 *                 stamp is the one the victim can physically walk out of
 *
 * There is deliberately NO constant offset: a self-buff that damages nobody
 * scores 0 and lands on the 0.3 floor. That, plus SCORE_AT_CAP, is what puts
 * the MEDIAN at the 0.4 the owner asked for.
 */
export function punishScore(def: AbilityDef, f: CastTimeFeatures): number {
  const dmgTerm = Math.min(1, f.damage / 1400);
  // CC WEIGHTED BY HOW LONG IT ACTUALLY LASTS. A 0.1 s "stun" is a hit flinch,
  // not crowd control, and must not buy the same 0.20 of score as a 2 s lockup —
  // that is precisely how godie-e015.e (125 dmg + a 0.1 s stun) earned a 0.6 s
  // wind-up six times longer than the effect it produced. Full weight at >= 1 s.
  const ccKind = f.hardCc ? 1 : f.root ? 0.6 : f.slow ? 0.25 : 0;
  const ccTerm = ccKind * Math.min(1, f.ccDuration / 1);
  const aoeTerm = Math.min(1, f.radius / 8);
  const slotTerm =
    def.slot === "EX" ? 0.9 : def.slot === "R" ? 0.55 : def.slot === "Q" ? 0.08 : 0.12;
  const deliveryTerm =
    def.castType === "ground"
      ? 0.5
      : def.castType === "skillshot"
        ? 0.3
        : def.castType === "targeted"
          ? 0.1
          : 0;
  const s = 0.35 * dmgTerm + 0.2 * ccTerm + 0.15 * aoeTerm + 0.2 * slotTerm + 0.1 * deliveryTerm;
  return Math.min(1, Math.max(0, s));
}

/** Snap to the 0.1 s ladder inside [floor, cap]; every step is a whole tick. */
function ladder(score: number): number {
  const maxSteps = Math.round((CAST_CAP - CAST_FLOOR) / CAST_STEP); // 6
  const steps = Math.min(maxSteps, Math.max(0, Math.round((maxSteps * score) / SCORE_AT_CAP)));
  return round1(CAST_FLOOR + steps * CAST_STEP);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * The whole rule. `cooldownMult` is combat-env `cooldown` (0.25 as shipped) —
 * pass 1 only if you genuinely mean authored seconds.
 */
export function deriveCastTime(def: AbilityDef, cooldownMult = SHIPPED_COOLDOWN_MULT): CastTimeResult {
  const f = castTimeFeatures(def);

  // ── EXEMPTION 1: passive-only. `isPassiveOnly` is duplicated here as a plain
  // predicate so this module stays free of sim imports beyond the type. A
  // castTimeSec on one of these is unreachable in the sim (activateAbility
  // returns "passive" first) AND a lie in the codex, so the field must be
  // ABSENT, not 0.
  //
  // ⚠️ 2026-08-08 擴充：**「純被動」有第二種形狀**。一支只安裝【具名標記】的
  // 天生技（52-00 十二道試煉）沒有靜態 `passive` 屬性區塊 —— 它的加成是
  // 「每失去一層才長出來」的（`MarkSpec.perStackLost`），所以舊條件把它判成
  // 一支主動技並要求 0.3 秒吟唱，而那個吟唱在 sim 裡永遠跑不到
  // （`activateAbility` 仍然先回 "passive"）—— 一個只存在於 codex 上的謊。
  //
  // ⛔ 反過來「補一個空的 `passive.ranks[].modifiers: []` 去滿足舊條件」是錯的：
  // 那正是 #224（天生技空 modifier）修掉的形狀。認得新形狀才是修法。
  if ((def.passive !== undefined || (def.marks?.length ?? 0) > 0) && def.effects.length === 0) {
    return exempt("passive-only", undefined, f);
  }

  const cooldownCeiling =
    f.minCooldown > 0 ? CD_CEILING_FRACTION * f.minCooldown * cooldownMult : Infinity;

  // ── EXEMPTION 2: rapid-fire. The ability's own real cooldown cannot afford
  // even the floor. Cast time here is incoherent by construction — it is what
  // turned 7 champions into statues. Kept instant. This MUST precede the
  // mobility/defensive floors below: forcing the 0.3 s floor onto an ability
  // whose post-multiplier cooldown is under 0.3 s makes it a statue (cast time
  // ≥ cooldown), which the STATUE INVARIANT forbids. At cooldownMult 0.2 a few
  // low-cooldown saves land here and are correctly instant, not floored.
  if (cooldownCeiling < CAST_FLOOR) {
    return exempt("rapid-fire", undefined, f, { cooldownCeiling });
  }

  // ── EXEMPTION 3: mobility. Any dash effect. An escape that announces itself
  // is not an escape; the measured failure was displacement flat until tick 18.
  // Gets the FLOOR rather than 0 so the cast pillar still fires (the owner's
  // visual requirement is that every cast is telegraphed) at 9 ticks.
  // NOTE (task #247): a `leap` is deliberately NOT exempted here, even though it
  // is also displacement. The exemption exists because "an escape that announces
  // itself is not an escape" — but a leap-strike is an ENGAGE, not an escape,
  // and the JASS telegraphs it hard on purpose (A0G3 sets the caster's animation
  // time scale to 40 % and plays "attack slam" before the arc even starts,
  // j:34209-34210). It stays on the punish curve, where its landing damage and
  // AoE put it.
  if (f.dash) return exempt("mobility", CAST_FLOOR, f, { cooldownCeiling });

  // ── EXEMPTION 4: defensive / reactive. A shield or heal that lands 0.6 s
  // late is a shield that did not happen. Floor (or already instant above, if
  // its cooldown was too short to afford even the floor).
  if ((f.heal > 0 || f.shield > 0 || f.restore) && f.damage === 0) {
    return exempt("defensive", CAST_FLOOR, f, { cooldownCeiling });
  }

  const score = punishScore(def, f);
  const rawLadder = ladder(score);

  // ── CEILING A: the ability's own cooldown. THE statue invariant.
  // ── CEILING B: the ability's own effect duration. "Standing still longer
  //    than the thing you produced lasts is self-evidently wrong" — the owner,
  //    naming godie-e015.e (0.6 s wind-up / 0.1 s effect), godie-e00j.q
  //    (0.6/0.3), godie-u00n.q (0.6/0.3) and sela.r Firestorm (0.8/0.75).
  //    Applies to ANY timed effect, floored at CAST_FLOOR so a 0.1 s flinch
  //    cannot delete the telegraph entirely. Non-binding for the overwhelming
  //    majority: the median timed effect in the real content lasts 6 s.
  //
  //    Known asymmetry, accepted knowingly: a pure-damage ability has no timed
  //    effect and so is never clipped, which means bolting a 0.2 s stun onto a
  //    nuke can SHORTEN its wind-up. `ccTerm` is already weighted by CC
  //    duration so a short stun barely raises the score in the first place, and
  //    the owner's complaint is measured while this smell is hypothetical.
  const durationCeiling = f.effectDuration > 0 ? Math.max(CAST_FLOOR, f.effectDuration) : Infinity;

  const clipped = Math.min(rawLadder, cooldownCeiling, durationCeiling);
  // snap DOWN to the ladder after clipping, never below the floor
  const stepped = Math.max(
    CAST_FLOOR,
    round1(CAST_FLOOR + Math.floor((clipped - CAST_FLOOR) / CAST_STEP + 1e-9) * CAST_STEP),
  );

  return {
    castTimeSec: stepped,
    cls: "scored",
    score,
    rawLadder,
    cooldownCeiling,
    durationCeiling,
    features: f,
  };
}

function exempt(
  cls: CastTimeClass,
  castTimeSec: number | undefined,
  features: CastTimeFeatures,
  extra?: { cooldownCeiling?: number },
): CastTimeResult {
  return {
    castTimeSec,
    cls,
    score: 0,
    rawLadder: 0,
    cooldownCeiling: extra?.cooldownCeiling ?? Infinity,
    durationCeiling: Infinity,
    features,
  };
}
