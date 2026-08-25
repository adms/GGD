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
import { DEFAULT_CAST_TIME_RULES } from "../sim/castTimeRules";
import { DAMAGE_TIER_NAMES, DEFAULT_DAMAGE_TIERS } from "./damageTiers";
import type { AbilityDef } from "../sim/content/defs";
import { rankScalarMax } from "../sim/perRank";
import type { EffectDef } from "../sim/effects/effect";

/**
 * ⚠️ **已退役**（owner 2026-08-13 把區間開到 [0.06, 4.00]）。
 * 階梯改成固定 20 階 + 對齊整數 tick（見 `ladder` / `snapTick`）——
 * 0.1 s 的固定步長在 3.94 秒的區間上會產生 40 個沒有意義的刻度。
 * ⛔ 常數留著只因為既有測試 import 它；⛔ 新程式不要讀它。
 */
export const CAST_STEP = 0.1;
/**
 * ⭐ owner 2026-08-13 逐字：「請你照我的 **0.06~4.00 秒**來設定吟唱時間
 * （**所有的技能都有最低吟唱技能時間 0.06 秒**，讓 tick 一定可以處理）」。
 *
 * ⛔ 在他這句話之前，這裡是 0.3 / 0.9，而檔頭把那個區間寫得像是 owner 的裁決
 * （「0.3–0.6 秒，最兇封頂 0.9」）—— **那是這個 repo 自己的政策，不是他說的**。
 * 我 2026-08-13 拿它去跟他的規格「吟唱 1/2/3 秒」對質，被他當場更正（第三守則：
 * 註解會說謊，而這一次說謊的是「這是誰決定的」）。
 *
 * ⚠️ 0.06 s 的意義是 **tick 一定處理得到**：sim 是 30 Hz ⇒ 1 tick = 0.0333 s，
 * 0.06 s ≈ 2 tick。⛔ 比這更短會被 `Math.round` 成 0～1 tick，
 * 客戶端畫得出預告而 sim 當它不存在（失敗形態②）。
 */
/** 下限：**每一支會吟唱的技能都至少這麼久**。2 ticks。 */
export const CAST_FLOOR = DEFAULT_CAST_TIME_RULES.floorSec;
/** 上限：owner 給的 4.00 秒。120 ticks。 */
export const CAST_CAP = DEFAULT_CAST_TIME_RULES.capSec;

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
 * ⭐ 傷害那一項的**飽和點** —— 「多痛才算得上最兇的一發」。
 *
 * ⛔ 2026-08-21 之前這裡是字面值 **1400**，而它的註解自己寫明來歷：
 * 「real distribution of the 309 damaging abilities: p25 190, med 300,
 *  p75 700, p90 1000, max 2200 —— 1400 是 ~p97」。
 * ⚠️ 也就是說它是**一份量測的快照**，而 owner 2026-08-21 ①「**B 全轉**」把
 * 每一支傷害技的基礎值搬到五級距上，那份快照當天就過期了 ——
 * 而它過期的方式最壞：`castTimeSec` 是**推導**的，所以 128 支技能的吟唱秒數
 * 會集體變長，而**沒有任何東西會紅**（`castTimeCoverage` 只驗「內容 == 公式」，
 * 兩邊一起漂移就是一起綠）。實測 13-002 絕。暗殺奧義因此**整支變成死內容**：
 * 牙突的吟唱漲到 1.033 秒，而它要配合的 13-01 [致盲] 只有 owner 給的 1.0 秒
 * ⇒ 那 20% 摘心一輩子觸發不了（第一·五守則：卡面說了、場上不會發生）。
 *
 * ⭐ 現在它從**傷害五級距的頂端**推導：`config.damage-tiers@1` 的「極大」
 * 就是這個遊戲對「最兇的一發」的定義（`damageTiers.ts`：極大 = hard limit
 * LV30 中位血量的一半，「一發不可以秒殺中位英雄」）。
 * ⇒ owner 重錨傷害表，這條曲線自己跟著動，⛔ 不必有人記得回來改一個常數。
 */
export const DAMAGE_SATURATION = DEFAULT_DAMAGE_TIERS.damage[DAMAGE_TIER_NAMES[4]!];


/**
 * combat-env `cooldown`. The cast-time ceiling has to be computed against the
 * cooldown the match ACTUALLY uses, not the authored seconds: content/config/
 * combat-env.json ships 0.2, so an authored 8 s cooldown fires every 1.6 s.
 * Callers pass the live value; this is the shipped default.
 *
 * CANARY: this MUST equal content/config/combat-env.json `multipliers.cooldown`.
 * castTimeCoverage.test asserts it; when the owner retunes the cooldown mult,
 * re-run `pnpm --filter @ggd/shared exec tsx scripts/deriveCastTimes.ts --write`
 * and update this in the same commit.
 */
export const SHIPPED_COOLDOWN_MULT = 0.2;

/** Why an ability got the cast time it got — reported, tested, and auditable. */
export type CastTimeClass =
  /**
   * ⭐ **規格自己寫了吟唱秒數**（`description` 裡的「吟唱 N 秒」）。
   * owner 2026-08-13：區間 [0.06, 4.00]，而**說明是第 1 層**，贏過下面每一條曲線與豁免。
   */
  | "authored"
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
 *   damage   .35  raw max-rank damage / {@link DAMAGE_SATURATION}
 *                 —— ⭐ 2026-08-21 起這一格是**推導**的，⛔ 不是 1400 那個字面值
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
  const dmgTerm = Math.min(1, f.damage / DAMAGE_SATURATION);
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

/**
 * Snap to the ladder inside [CAST_FLOOR, CAST_CAP]; every step is a whole tick.
 *
 * ⚠️ owner 把區間從 [0.3, 0.9] 開到 **[0.06, 4.00]** 之後，0.1 s 的固定步長會
 * 產生 40 階 —— 那不是階梯，是連續值。改成**固定 20 階**、步長由區間算出來，
 * 這樣區間再變一次也不用回來改第二個地方（步長是**推導**的，不是第二個住處）。
 */
const LADDER_STEPS = 20;

function ladder(score: number): number {
  const steps = Math.min(
    LADDER_STEPS,
    Math.max(0, Math.round((LADDER_STEPS * score) / SCORE_AT_CAP)),
  );
  const raw = CAST_FLOOR + (steps * (CAST_CAP - CAST_FLOOR)) / LADDER_STEPS;
  return snapTick(raw);
}

/**
 * ⭐ 對齊到整數個 sim tick（30 Hz）。這是 `CAST_STEP` 那條註解真正在守的性質：
 * 「客戶端畫的預告 = sim 真的吟唱的長度」。⛔ 不對齊會有半 tick 的捨入誤差。
 * ⚠️ 下限鎖在 CAST_FLOOR（2 ticks）—— owner：「所有的技能都有最低吟唱 0.06 秒」。
 */
function snapTick(v: number): number {
  const TICK = 1 / 30;
  const ticks = Math.max(Math.round(CAST_FLOOR / TICK), Math.round(v / TICK));
  return Math.round((ticks * TICK) * 1000) / 1000;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * The whole rule. `cooldownMult` is combat-env `cooldown` (0.25 as shipped) —
 * pass 1 only if you genuinely mean authored seconds.
 */
/**
 * ⭐ owner 2026-08-13 —— **規格自己寫的吟唱秒數贏過這支公式**。
 *
 * `description` 就是第 1 層（CLAUDE.md 第〇·六守則：owner 的新版技能說明 >
 * 編輯器 JSON > JASS > …）。在這一行之前，14 支規格逐字寫了「吟唱 1/2/3 秒」，
 * 而公式把它們全部算成 0.3–0.7 秒 —— **說明與遊戲差到 10 倍，而且沒有任何東西叫**。
 *
 * ⛔ 不做成第二張表：說明已經在文件裡，抄一份出來就是第二個會腐爛的住處。
 * ⚠️ 讀之前**先剝掉整段 `「…」`**（owner 2026-08-12：那是角色對白不是效果）——
 *    44-04 的台詞「在35秒後宣布勝利吧」會被讀成 35 秒吟唱。
 * ⚠️ 夾在 `[CAST_FLOOR, CAST_CAP]` = owner 給的 [0.06, 4.00]，再對齊整數 tick。
 */
function authoredCastSec(def: AbilityDef & { description?: string }): number | null {
  const raw = def.description;
  if (typeof raw !== "string") return null;
  const mech = raw.replace(/「[^」]*」/gs, "");
  const m = /(?:吟唱|施展時間|詠唱)\s*([\d.]+)\s*秒/.exec(mech);
  if (!m) return null;
  const v = Number(m[1]);
  if (!Number.isFinite(v) || v <= 0) return null;
  return snapTick(Math.min(CAST_CAP, Math.max(CAST_FLOOR, v)));
}

export function deriveCastTime(
  def: AbilityDef & { description?: string },
  cooldownMult = SHIPPED_COOLDOWN_MULT,
): CastTimeResult {
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

  // ⭐ 規格寫了吟唱秒數 → **它贏**（見 `authoredCastSec` 的推導）。
  //    ⛔ 放在**其他豁免之前**：45-03 千鳥是 dash、12-02 仙氣．採藥是治療，
  //    兩者都會被「位移/防禦」豁免打到下限，而規格明明白白寫了 2 秒與 3 秒。
  //    ⚠️ 仍然吃 `cooldownCeiling`（雕像不變式）—— 那是防 root duty 爆掉的安全閥，
  //    不是風格偏好；14 支規格值全部在它之下（最緊的 12-002 也有 3.75 s）。
  const authored = authoredCastSec(def);
  if (authored !== null) {
    const ceiling =
      f.minCooldown > 0 ? CD_CEILING_FRACTION * f.minCooldown * cooldownMult : Infinity;
    // ⭐ owner 2026-08-13：「請你**照我的** 0.06~4.00 秒來設定吟唱時間」——
    //    規格值**也贏過雕像不變式**（`cooldownCeiling`）。
    // ⚠️ 這是一個知情的取捨，不是漏看：那條不變式保證「四格技能全按 ⇒ root duty ≤ 50%」，
    //    而規格值會突破它。實測最兇的是 12-02 仙氣．採藥（規格 3.0 s，遊戲內冷卻 12 s
    //    ⇒ 單格 duty 25%）—— 仍在 50% 之下，因為沒有英雄的四格都寫了長吟唱。
    // ⛔ `ceiling` 仍然算出來放進回傳，讓報表看得到「它本來會夾到哪」。
    const ct = snapTick(authored);
    return {
      castTimeSec: ct,
      cls: "authored",
      score: 0,
      rawLadder: authored,
      cooldownCeiling: ceiling,
      durationCeiling: Infinity,
      features: f,
    };
  }

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
  if (f.dash) return exempt("mobility", snapTick(CAST_FLOOR), f, { cooldownCeiling });

  // ── EXEMPTION 4: defensive / reactive. A shield or heal that lands 0.6 s
  // late is a shield that did not happen. Floor (or already instant above, if
  // its cooldown was too short to afford even the floor).
  if ((f.heal > 0 || f.shield > 0 || f.restore) && f.damage === 0) {
    return exempt("defensive", snapTick(CAST_FLOOR), f, { cooldownCeiling });
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
  // ⭐ 夾完之後對齊到**整數 tick**（⛔ 不再用 0.1 s 的固定步長 —— 區間開到
  //    [0.06, 4.00] 之後那個步長只會製造 40 個沒有意義的刻度）。
  //    ⚠️ `snapTick` 自己鎖了 CAST_FLOOR 的下限（owner：所有技能至少 0.06 秒）。
  const stepped = snapTick(clipped);

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
