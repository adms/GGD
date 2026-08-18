/**
 * EffectDef + HookDef schemas — mirror `sim/effects/effect.ts` and
 * `sim/stats/modifiers.ts` exactly (compile-time asserted in compat.test.ts).
 * The discriminated union is exported un-lazied too so the editor form walker
 * can render union cards keyed by "kind".
 */
import { z } from "zod";
// AoE 四級距（owner 2026-08-11）。⛔ 不要在這裡重打一份字串陣列。
import { AOE_TIER_NAMES } from "../aoeTiers";
const zAoeTier = z.enum(AOE_TIER_NAMES);
import type { EffectDef } from "../../sim/effects/effect";
import type { AbilityId, ProjectileId, StatusId } from "../../ids";
import { zCastableSlot, zRef, zScaling, zStat, zStatModifier } from "./common";
// `refineApplyBuff` 的 `maxStat.basis:"thisSource"` 規則要問「這條 modifier 是不是
// 一個絕對量」——⛔ 不抄字面值 "flat"，比對出貨的那個 enum。
import { ModOp } from "../../sim/stats/modifiers";
// Lane 1/2（2026-08-08）七個新 kind 的界 —— 一份，schema 與 handler 共用。
import {
  BRANCH_MAX_COUNT,
  BRANCH_MAX_WEIGHT,
  CD_REDUCE_MAX_FLAT_SEC,
  CD_REDUCE_MAX_PCT,
  CONVERT_BUFF_MAX_SEC,
  CONVERT_MAX_RATIO,
  SWAP_CLAMP_MIN_MAX,
  EXTEND_BUFF_MAX_ADD_SEC,
  EXTEND_BUFF_MAX_REMAINING_SEC,
  EXTEND_BUFF_MAX_THRESHOLD_PCT,
  MANA_BARRIER_MAX_DURATION_SEC,
  MANA_BARRIER_MAX_PER_MANA,
  RANDOM_AREA_MAX_COUNT,
  RANDOM_AREA_MAX_INTERVAL_SEC,
  RANDOM_AREA_MAX_SCATTER_RADIUS,
  // Lane 3（2026-08-10）—— 同一張表，⛔ 不抄字面值。
  DASH_ON_END_MAX_EFFECTS,
  DELAYED_MAX_COUNT,
  DELAYED_MAX_DELAY_SEC,
  DELAYED_MAX_INTERVAL_SEC,
  DELAYED_MAX_STEP_DIST,
  EFFECT_CHAIN_MAX_STEPS,
  HOOK_MAX_TRIGGERS,
  PROXY_MAX_CHAIN_DEPTH,
  STAT_CEILING_MAX,
  // [EX∅ 根源]（2026-08-18）—— 同一張表，⛔ 不抄字面值。
  AURA_COUNT_MAX,
  CARRY_MAX_PASSENGERS,
  CARRY_MAX_SEC,
  CONVERT_TEAM_MAX_HELD,
  CONVERT_TEAM_MAX_SEC,
  TYPE_STREAK_MAX_THRESHOLD,
  TYPE_STREAK_MAX_TIMEOUT_SEC,
} from "../../sim/effects/kindLimits";
import {
  SPREAD_MAX_FALLOFF,
  SPREAD_MAX_RADIUS,
  SPREAD_MAX_TARGETS,
  SPREAD_MIN_FALLOFF,
} from "../../sim/effects/spreadLimits";
import {
  KB_MAX_DISTANCE,
  KB_MAX_GETUP_TICKS,
  KB_MAX_IMPACT_POWER,
  KB_MAX_LAUNCH_HEIGHT,
} from "../../sim/effects/knockbackLimits";
// 位移級距（GH#318）。⛔ 不要在這裡重打一份級別字串或速度上界。
// ⚠️ `KB_MAX_SPEED (200)` 已經**不再**是擊退速度的上界：200 u/s 表示一個 tick
//    走 6.7 單位 = 身體半徑的 11 倍，那是一發保證穿牆的擊退。護欄降到
//    `DISPLACEMENT_AUTHORED_SPEED_MAX`，真正的天花板由註冊期的 clamp 推導。
import {
  DISPLACEMENT_AUTHORED_SPEED_MAX,
  DISPLACEMENT_SPEED_MIN,
  DISPLACEMENT_TRAVEL_DISTANCE_MAX,
} from "../displacementTiers";
import { zDisplacementTier } from "./displacementDoc";
import {
  INCOMING_PCT_MAX,
  INCOMING_PCT_MIN,
  REFLECT_MAX_CHAIN_DEPTH,
  REFLECT_MIN_CHAIN_DEPTH,
} from "../../sim/effects/reflectLimits";
import { zEffectCondition } from "./condition";
import {
  CHANCE_PER_ATTR_MAX,
  DAMAGE_REFUND_PCT_MAX,
  DISTANCE_SCALE_DAMAGE_MAX,
  DISTANCE_SCALE_RANGE_MAX,
  DOT_RESOURCE_PCT_POINTS_TOTAL_MAX,
  DOT_RESOURCE_PCT_RATIO_TOTAL_MAX,
  RESOURCE_PCT_POINTS_MAX,
  RESOURCE_PCT_RATIO_MAX,
  RESOURCE_PCT_RATIO_SELF_MAX,
} from "../../sim/effects/dynamicTerms";
// 層數的上界 —— 一份表兩個消費端（標記系統與 `applyStatus.stacks`），⛔ 不抄字面值。
import { MARK_MAX_COUNT } from "../../sim/markLimits";
import { TAUNT_MAX_DURATION_SEC, TAUNT_MAX_TARGETS } from "../../sim/taunt";
import { FLIGHT_MAX_HOVER_HEIGHT } from "../../sim/flight";
import { zPenetrationGrant } from "./mitigationDoc";
import { RANK_SCALAR_MAX_COLUMNS } from "../../sim/perRank";
// 三圍授予的上下界 —— 一份表兩個消費端（道具與其餘三個授權面），⛔ 不抄字面值。
import { ATTR_GRANT_MAX, ATTR_GRANT_MIN } from "../../sim/stats/attributes";

export const zDamageType = z.enum(["physical", "magic", "true"]);

/**
 * ⭐ GH#299 第 2 條（owner：「授權格沒開⋯**請修正**」）—— 把一格既有的**純量**
 * 欄位開放成「逐階可以不一樣」，**而且不動任何一份既有文件**。
 *
 *   · `duration: 3`        每一階都是 3（今天所有內容的寫法，語意逐字不變）
 *   · `duration: [2,3,4,5]` 一階一格，rank-1 起算、超出長度夾在最後一格
 *
 * ⛔ 不開第二個欄位名（`durationPerRank`）：那是同一個量的第二個住處，
 * 而它會在有人只改一邊的那一天靜默地贏。完整推導與讀取器住在
 * `sim/perRank.ts` —— ⛔ 這裡不重複一份。
 *
 * @param inner 那一格原本的純量 schema（含它自己的上下界）——
 *              陣列的每一格**共用同一組界**，所以打錯的數字在哪一階都擋得住。
 */
function zRankScalar<T extends z.ZodTypeAny>(inner: T): z.ZodUnion<[T, z.ZodArray<T>]> {
  return z.union([inner, z.array(inner).min(1).max(RANK_SCALAR_MAX_COLUMNS)]);
}

/**
 * Ceiling on ONE rank column of `damage.hpPct` (a 0..1 ratio of the victim's
 * health). 0.35 is deliberately several times the strongest authored value
 * (揍敵客阿福 W 牙突 tops out at 0.12) — this is a MIS-PARSE guard in the spirit
 * of `damageArea`'s radius caps, not balance policy. The failure it prevents is
 * exact and has shipped before in other clothes (#277): 「12」 typed where
 * 「0.12」 was meant is not a strong ability, it is 1200 % of max health, i.e.
 * every cast one-shots every body it touches. Bounded on BOTH ends because
 * CLAUDE.md says 「欄位要有上界，不是只有下界」.
 */
export const HP_PCT_DAMAGE_MAX = RESOURCE_PCT_RATIO_MAX;

/**
 * ⭐ `applyStatus.duration` 的**兩層**上界（2026-08-09 / GH#299 第 1 條）。
 *
 * 在此之前只有一個數字（20 秒）管所有狀態，而它的理由 ——「一個 30 秒的暈眩在
 * 一場三分鐘的回合裡等於那個人這一場不用玩了」——**只對硬控成立**。於是一個
 * 24 秒的計數視窗（不動控制、不動數值，只是「這段時間內」）也被同一條界擋下來。
 *
 * 所以現在是兩條：
 *   · {@link STATUS_MAX_DURATION_SEC} = 60 —— 一般狀態。仍然是**打錯數字的守衛**
 *     （20 打成 200 照樣擋得下），不是平衡政策。
 *   · {@link HARD_CC_MAX_DURATION_SEC} = 20 —— `stun` / `root` / `feared` /
 *     `silenced` 任何一格為真時。**逐字是舊的那個數字**，一格都沒放寬。
 *
 * ⚠️ 判準是「玩家這段時間還能不能操作」，所以 `moveSpeedMult` 不在硬控那一組
 * （減速仍然打得到、放得出技能），而 `silenced` 在（放不出技能就是被拿走一半的
 * 操作）。⛔ 新增一個「拿走操作」的布林時要一起加進 `HARD_CC_FLAGS`，
 * 否則它會安靜地拿到 60 秒。
 */
export const STATUS_MAX_DURATION_SEC = 60;
/** 硬控（拿走操作）的上界 —— 2026-08-09 之前**所有**狀態共用的那個數字。 */
export const HARD_CC_MAX_DURATION_SEC = 20;
/** 哪幾格算「拿走操作」。⛔ 新增同類布林時一起加，見上。 */
const HARD_CC_FLAGS = ["stun", "root", "feared", "silenced", "disarmed"] as const;

/**
 * `damage.bankedBonus` 的三個上界(owner 2026-07-31 的「係數要是欄位 + 要有一個
 * 傷害上界當保險」)。
 *
 * ⚠️ 這三個數字是**護欄不是平衡值**,跟 `HP_PCT_DAMAGE_MAX` 同一個性質:它們的
 * 工作是讓打錯的數字**載不進來**,而不是替設計師決定強度。出貨的 13-002 用的是
 * coeff 0.20 / max 900,離每一個上界都很遠。
 *
 * MEASURED, not guessed（2026-07-31,揍敵客 godie-efur,用出貨的 combat-env）:
 *   maxMana = (baseStats.maxMana 100 + growth.maxMana 28×(lv−1) + INT×intToMaxMana 15)
 *             × multipliers.maxMana 1.0,  INT = 20 + 2.3×(lv−1)
 *   → lv1 ≈ 400、lv10 ≈ 962、lv15 ≈ 1,275(無法力裝)
 * 出貨的 coeff 0.20 因此換算成 lv10 滿魔約 **+192 點**,對照 maxHealth 倍率 9
 * 下的一條血(150 基礎 → 1,350 起跳)大約是 14%。合理,不是一擊必殺。
 *
 * 出貨卡的 `max` 是 400,對應法力池 2,000 —— 只有重度法力裝才碰得到,所以它
 * 是**保險絲**而不是隱形的平衡上限;下面這個 schema 上界(1200)又比它高三倍,
 * 因為 schema 的工作是擋住打錯的數字,不是替設計師決定強度。
 */
export const BANKED_COEFF_MAX = 1;
/** 單次存款加成的絕對傷害天花板。1200 ≈ 出貨生命倍率 9 下的一條滿血。 */
export const BANKED_BONUS_MAX = 1200;
/** 存款能活多久。跟 `applyBuff.duration` 的量級一致;超過就是設定錯了。 */
export const BANKED_LIFE_MAX_SEC = 60;

/**
 * Ceiling on `cycleBuff.steps`. A rotation is a READABLE thing — the player has
 * to be able to feel 「輪到防禦了」 — and past a handful of steps the ring is
 * indistinguishable from randomness while costing one live ModifierSource per
 * step on every rotating body. 8 matches `CONDITION_MAX_CHILDREN`, the other
 * "how many of these can a human hold in their head" bound in this codebase.
 */
export const CYCLE_BUFF_MAX_STEPS = 8;

/**
 * Ceiling on `HookDef.internalCooldown`, in SECONDS.
 *
 * The field had `.min(0)` and no upper bound at all until 2026-08-01, which is
 * exactly the half-bounded shape CLAUDE.md calls out (「欄位要有上界,不是只有
 * 下界」). What the ceiling catches is one specific, invisible mis-parse:
 * **milliseconds typed into a seconds field**. owner's 2026-08-01 rulings on
 * 炎神弩 godie-i06i and 熾天使之弓 godie-i012 are both 「冷卻1 秒」, and `1000`
 * typed where `1` was meant does not look wrong in a diff — it silently turns a
 * once-per-second proc into a once-per-match one, on a card that still advertises
 * the effect. `sim/effects/hooks.ts` would clamp nothing and report nothing; the
 * item would simply stop doing its job (失敗形態 ②).
 *
 * 300 s, matching `zItemBlockGrant.internalCooldown` in schema/item.ts so the two
 * cooldown fields do not disagree about what counts as a typo. It is a MIS-PARSE
 * guard, NOT balance policy: a combat round is ~3 min, the longest authored value
 * in content/ today is 45 s (godie-e00r.passive), and anything genuinely longer
 * than 300 s is a once-per-match effect that should say so in its own field.
 * The floor stays `.min(0)` — 0 is legal AND meaningful (= no cooldown, which is
 * what every hook authored before this field had).
 */
export const HOOK_INTERNAL_COOLDOWN_MAX_SEC = 300;

export const zHookEvent = z.enum([
  // ⭐ GH#354（owner 2026-08-17）—— 這 13 個與 sim 的 `HookEvent` 逐字對齊，
  // 而「誰在發射」寫在 systems/WorldHookSystem.ts 的那張表上。
  // ⚠️ 只加這裡而沒有那一列 = 下拉裡多一個永遠不會發生的選項（`onLevelUp` 的前科）。
  "onUltimateCast",
  "onUltimateHit",
  "onCrowdControlApplied",
  "onCrowdControlReceived",
  "onHeal",
  "onOverheal",
  "onAllyDamaged",
  "onProjectileExpire",
  "onBoundaryTouch",
  "onDashOrBlink",
  "onLethalDamage",
  "onStatCapReached",
  "onRoundStart",
  "onRoundEnd",
  "onAbilityCast",
  "onAbilityHit",
  "onBasicAttack",
  "onDamageDealt",
  "onDamageTaken",
  "onKill",
  // ⛔ `"onLevelUp"` 在這裡待到 2026-08-05 為止。owner 裁決 A2（泛化 pending-hook
  // 佇列）**不做**，而它從進 enum 的那天起就**零發射點** —— 全 sim 的 `fireHooks`
  // 只發八種事件，它不在裡面。留著它等於在編輯器下拉裡放一個「寫了什麼都不會
  // 發生」的選項，而作者不會知道：schema 收下、後台存得起來、卡片上看得到。
  //
  // 刪掉是安全的：`fieldAdoption` 的普查證明**零份文件**用過它，所以沒有任何
  // 一份既有內容會因此載入失敗。
  //
  // ⚠️ 這只是把**這一個**謊話拿掉，不是把「下拉裡有、引擎沒有」這個**形狀**關掉。
  // 結構性的守衛是 B1（謂詞池統一）的工作：登錄表同時宣告「能不能當觸發」與
  // 「誰在發射」，於是下一個 `onLevelUp` 在加進去的當下就會紅。
  /** 被暈眩的那一刻 — 為什麼是新成員、為什麼纏繞/減速不算,見
   *  sim/stats/modifiers.ts 的 `HookEvent`。 */
  "onStunned",
  /** 週期 — 每 tick 發射,節奏寫在 `internalCooldown`(10 = 每 10 秒)。
   *  43-00 觀音大士「每 10 秒生成一個護盾」、03-00 相轉移裝甲的常駐魔免都是它。
   *  見 sim/stats/modifiers.ts 的 `HookEvent` 與 systems/IntervalHookSystem.ts。 */
  "onInterval",
  /**
   * 反彈成功時（owner 2026-08-05：「onReflect／反彈成功時 這個也要」；
   * 2026-08-08 更名自 `onReflect` 並補上 provenance）。
   *
   * ⛔ 「成功」= **一發 `reflectDepth > 0` 的封包真的落地**。兩層閘：
   * ①`incomingPct` 的四道（沒有觸發封包 / 超過 `maxChainDepth` / 排空預算來不及且
   * `whenTooLate:"drop"` / 反彈量 ≤ 0）；②那一發封包沒有被目標的死亡、無敵免疫
   * 或技能迴避擋掉。任何一道攔下來都**不算**。
   *
   * ⭐ 它**帶得到那一發封包**（`DAMAGE_BEARING_EVENTS` 的第三個成員）——
   * hook 裡的 `damage.incomingPct` 反彈的是**那一發反彈封包**，也就是
   * 20-002「每次造成 7 倍[反彈]傷害」寫得出來的原因。
   * ⚠️ 那一發的 `reflectDepth` 已經是 1，所以要一起寫 `maxChainDepth: 1`，
   * 否則會被鏈深閘擋掉（那正是終止性在做它的事）。
   *
   * 理由與發射點見 `sim/systems/ReflectHookSystem.ts`；持有者是反彈的人
   *（防禦者），hook 的 target 是被反彈到的那個人（攻擊者，與 `onStunned` 同方向），
   * 所以「反彈時自己回血」寫 `target: "self"`。
   */
  "onReflectSuccess",

  // ── 由 `sim/systems/WorldHookSystem.ts` 從事件流轉成 hook 的六個（2026-08-06）──
  //
  // ⚠️ 這六個時刻 sim **每一場都在發**（`world.emit()`，給客戶端畫面用），
  // 而在這一批之前內容側一個都掛不上去 —— 因為 `fireHooks` 的呼叫點沒有一個
  // 讀事件流。缺的從來不是「事件」，是「廣播器」。
  //
  // ⛔ 加第七個的完整成本：`WORLD_HOOKS` 一列 + `HookEvent` 一個成員 +
  // 這裡一個成員 + `fieldAdoption` 一筆豁免。**不用寫新系統。**
  // 語意（誰是持有者、有沒有 target）逐一寫在 `sim/stats/modifiers.ts` 的
  // `HookEvent` 上，不在這裡重複一份 —— 兩份會分岔。

  /** 殭屍王出現（世界廣播）。 */
  "onBossSpawn",
  /** 火圈點燃（世界廣播，只在點燃那一 tick 發一次）。 */
  "onFireRingIgnite",
  /** 守衛塔倒下（世界廣播）。⚠️ 打塔不發 `onKill`，所以這是唯一接得到的路。 */
  "onGuardianDown",
  /** 死亡時。持有者＝死掉的人，target＝兇手（燒死時沒有 target）。 */
  "onDeath",
  /** 復活時。持有者＝被復活的人，不是頂圈圈的隊友。 */
  "onRevive",
  /** 迴避時。⚠️ 持有者＝**閃掉的那個**，target＝攻擊者。 */
  "onEvade",

  // ── 契約層 2026-08-09（GH#300）加的四個，⛔ **發射點由 lane B 接** ────────
  //
  // owner 點名這一族「使用率超高請一定要實作」。契約層先把**名字**定下來，
  // 因為四路平行實作全部要 import 同一個字面量；發射點在 GH#300。
  //
  // ⛔ 在發射點接上之前，這四個是「下拉裡有、引擎不發」——`onLevelUp` 被刪掉的
  // 那個形狀。語意（誰是持有者、有沒有 target、什麼不算）逐一寫在
  // `sim/stats/modifiers.ts` 的 `HookEvent`，**不在這裡重複一份**（兩份會分岔）。
  // ⛔ GH#300 收尾時沒接到的那幾個要**刪掉**，不是留著。

  /** 護盾產生時。持有者＝拿到護盾的人。 */
  "onShieldGained",
  /** 護盾破碎時（護盾池歸零那一格）。⚠️ 與【破盾】那個**動作**不是同一件事。 */
  "onShieldBroken",
  /** 隊友陣亡時。⚠️ 持有者＝**活著的隊友**，方向與 `onDeath` 相反。 */
  "onAllyDeath",
  /** 狀態被掛上的那一刻。⚠️「身上有某狀態時」走的是效果上的 `condition`，不是它。 */
  "onStatusApplied",
]);

/**
 * CROSS-FIELD checks that a `z.discriminatedUnion` member cannot carry itself:
 * `.superRefine` turns an object into `ZodEffects`, and `discriminatedUnion`
 * only accepts `ZodObject`s. So the refinement rides {@link zEffectDef} — the
 * lazy wrapper every document actually validates through (`zHookDef.effects`,
 * `ability@1`, `item@1.passive`, `auras[].hooks`). `zEffectDefUnion` stays a
 * pure discriminated union so the editor's `walkZod` still sees the variant
 * list (apps/editor/src/form/walk.ts) and the three template tests that call
 * `zEffectDefUnion.parse` directly keep working.
 *
 * Today it enforces the two `grantAttribute.store` pairings — see the field.
 */
/**
 * 資源百分比項 —— `damage.resourcePct` 與 `dot.resourcePct` **共用同一份 schema**,
 * mirroring `ResourcePctTerm` in sim/effects/dynamicTerms.ts(那裡有完整推導:
 * 為什麼它不是 `Scaling` 的一部分、`scale` 的兩種讀法差在哪、兩個上界為什麼
 * 不同)。一份 schema 而不是兩份,理由跟 sim 端一樣:四支道具要的是同一個讀數,
 * 抄成兩份保證有一天只修到一邊。
 *
 * 每一格 `perRank` 的上界由 `scale` 決定,所以夾在 `superRefine` 裡而不是
 * `z.number().max(...)` 上 —— 兩種模式的自然量級差 100 倍以上,共用一個上界
 * 對其中一邊必然太鬆(擋不住打錯的數字)。
 */
export const zResourcePctTerm = z
  .object({
    /** 讀誰的條:施法者自己,還是這次事件的對象 */
    subject: z.enum(["self", "target"]),
    resource: z.enum(["health", "mana"]),
    /** 現存 / 最大 / 已損失(= 最大 − 現存) */
    basis: z.enum(["current", "max", "missing"]),
    /** 省略 = "ratio" = 係數 × 絕對量。"points" = 係數 × 百分比本身(0~100) */
    scale: z.enum(["ratio", "points"]).optional(),
    /**
     * `.min(1)`:同 `hpPct` / `incomingPct` 的反空欄位規則 —— 一個空陣列解算成 0,
     * 長得像功能、實際上什麼都不做。
     */
    perRank: z.array(z.number().min(0)).min(1),
  })
  .strict()
  .superRefine((t, ctx) => {
    // ⭐ 上界看**兩件事**：模式(ratio/points)與**主體**。讀自己的條寬,讀對方
    //    的條緊 —— 完整理由在 `dynamicTerms.ts` 的 `RESOURCE_PCT_RATIO_SELF_MAX`。
    const cap =
      (t.scale ?? "ratio") === "points"
        ? RESOURCE_PCT_POINTS_MAX
        : t.subject === "self"
          ? RESOURCE_PCT_RATIO_SELF_MAX
          : RESOURCE_PCT_RATIO_MAX;
    t.perRank.forEach((v, i) => {
      if (v > cap) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["perRank", i],
          message:
            `scale:"${t.scale ?? "ratio"}" 的係數上限是 ${cap}(拿到 ${v})—— ` +
            "這是打錯數字的守衛:ratio 模式寫 5 而不是 0.05 是「對方整條的 500%」, " +
            "points 模式寫 100 而不是 1 是 10,000 點。兩種在 diff 裡都跟正確值長得一樣。",
        });
      }
    });
  });

/**
 * 一份 `dot` 的 `resourcePct` **整段燒完**的總量檢查。
 *
 * ⚠️ 為什麼守衛架在總量而不是單次:一次 `damage` 的百分比是**一下**,而 dot 會
 * 付 `duration/interval` 次。單次 3% 看起來無害,配一個 20 秒 / 每秒的燒傷就是
 * 60% 最大生命。完整推導與數字見 dynamicTerms.ts 的
 * `DOT_RESOURCE_PCT_RATIO_TOTAL_MAX`。
 *
 * ⚠️ 它住在 `refineEffectDef`(掛在 `zEffectDef` 的 lazy 上)而不是 `dot` 那個
 * 物件自己的 `.superRefine`,原因是 zod 的 `discriminatedUnion` 只收
 * `ZodObject`,收不了 `ZodEffects` —— 這跟 `zHookDef` / `zItemHookDef` 為什麼
 * 要拆成 base + refine 是同一個限制。
 */
function refineDotResourceBudget(
  e: Extract<EffectDef, { kind: "dot" }>,
  ctx: z.RefinementCtx,
): void {
  const term = e.resourcePct;
  // ⭐ 45-01 —— `resourcePctPhase` 沒有 `resourcePct` 可以修飾時**整格蒸發**：
  //    載入、編輯器、執行期都不會說一句話，而作者以為他寫了「每 tick 重算」。
  //    ⛔ 這正是 CLAUDE.md 講的「只在遠離現場的地方響的警報不是守衛」——
  //    這一條在**編輯發生的當下**（Zod）就擋。
  if (term === undefined) {
    if (e.resourcePctPhase !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resourcePctPhase"],
        message:
          "填了 resourcePctPhase 卻沒有 resourcePct —— 這一格是**修飾** resourcePct 的，" +
          "單獨存在時完全沒有作用。要嘛補上 resourcePct，要嘛把這一格刪掉。",
      });
    }
    return;
  }
  const payouts =
    Math.max(1, Math.floor(e.durationSec / e.intervalSec)) +
    (e.tickOnApply === true ? 1 : 0);
  const peak = Math.max(...term.perRank);
  const points = (term.scale ?? "ratio") === "points";
  const total = points ? peak * 100 * payouts : peak * payouts;
  const cap = points
    ? DOT_RESOURCE_PCT_POINTS_TOTAL_MAX
    : DOT_RESOURCE_PCT_RATIO_TOTAL_MAX;
  if (total > cap) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["resourcePct", "perRank"],
      message:
        `整段燒完是 ${total}(${peak} × ${payouts} 次付款),上限 ${cap}。` +
        "dot 的百分比守衛架在總量上,因為單次看起來無害的數字乘上付款次數才是玩家吃到的量。",
    });
  }
}

/**
 * `shape` 與幾何欄位的**交叉檢查**（A4b / E1）。
 *
 * ⚠️ 為什麼是**載入時**的解析錯誤而不是執行期的靜默退化：
 * 一份 `{kind:"dispel", shape:"circle"}` 沒寫 radius 的文件，在執行期
 * `radius ?? 0` → `radius <= 0` → **直接 return**。技能放得出來、動畫演完、
 * 什麼都沒發生，而且沒有任何訊息 —— 失敗形態 ②。
 */
function refineDispelShape(
  e: Extract<
    EffectDef,
    {
      kind:
        | "dispel"
        | "shieldBreak"
        | "devour"
        // Lane 1（2026-08-08）：四個新 kind 用同一組幾何欄位，所以用**同一份**
        // 檢查。各寫一份的那一天它們會分岔，而每一份看起來都對。
        | "modifyCooldown"
        | "weightedBranch"
        | "swapResource"
        | "eventValueConversion"
        // Lane 2（2026-08-08）：同一組幾何欄位 → **同一份**檢查。
        // ⛔ `randomArea` 2026-08-10 從這裡**拿掉**了 —— 它根本沒有那四格
        // （理由寫在它自己的 schema 註解上：它解的是**落點**不是受害者）。
        | "manaBarrier"
        | "extendBuff"
        // 契約層（2026-08-09，GH#301-2）：`blink` 用**同一組** shape/radius/
        // side/maxTargets，所以走**同一份**檢查。開第二份的那一天它們會分岔，
        // 而兩份看起來都對。
        | "blink"
        // Lane 3（2026-08-10）：`delayed` / `proxyCast` 用**同一組**幾何欄位，
        // 所以走同一份檢查。⛔ 各寫一份的那一天它們會分岔，而每一份看起來都對。
        | "delayed"
        | "proxyCast"
        // [EX∅ 根源]（2026-08-18）：`carry` / `convertTeam` 用**同一組**幾何
        // 欄位（shape + radius + radiusTier），所以走同一份檢查。
        | "carry"
        | "convertTeam";
    }
  >,
  ctx: z.RefinementCtx,
): void {
  if (e.shape === "circle" && e.radius === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["radius"],
      message:
        'shape:"circle" 一定要有 radius —— 沒有半徑的圓在執行期會直接 return，技能放得出來但什麼都不會發生',
    });
  }
  // 反向：單體卻寫了圓的欄位 = 作者以為自己設定了範圍，而那三格沒有人讀。
  // ⚠️ 透過 index signature 讀，⛔ 不是 `e[k]`：這一族現在包含
  // `convertTeam`，而它**沒有** `side` / `maxTargets`（它的名額軸是 `maxHeld`）。
  // 直接索引一個聯集會讓 TS 要求**每一個**成員都有那三格 —— 而為了讓型別過
  // 就去補兩個沒有人讀的欄位，正是「畫得出來、引擎讀不到」那個失敗形態。
  // 缺席的鍵讀出 `undefined`，也就是「作者沒填」，語意逐字不變。
  const bag = e as unknown as Record<string, unknown>;
  for (const k of ["radius", "side", "maxTargets"] as const) {
    if (e.shape === "single" && bag[k] !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [k],
        message: `shape:"single" 讀不到 ${k} —— 要用範圍請改成 shape:"circle"，否則這一格是一個看起來有設、其實沒有人讀的數字`,
      });
    }
  }
}

/**
 * `weightedBranch` 的**總權重不得為 0**（Lane 1）。
 *
 * ⚠️ 為什麼不能只靠 `weight: z.number().positive()`：那樣就沒有辦法「先關掉
 * 一個分支但不刪掉它」，而那是編輯器裡最常見的一個動作。下界留 0，總和的檢查
 * 就必須是一條**跨欄位**的規則 —— 而它必須在**載入時**跑：一份總權重 0 的
 * 文件在執行期只會 `return`，技能放得出來、動畫演完、什麼都沒發生（失敗形態 ②）。
 */
function refineWeightedBranch(
  e: Extract<EffectDef, { kind: "weightedBranch" }>,
  ctx: z.RefinementCtx,
): void {
  let total = 0;
  for (const b of e.branches) total += b.weight;
  if (total > 0) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["branches"],
    message:
      "所有分支的 weight 加起來是 0 —— 這一發抽不到任何東西，在遊戲裡看起來" +
      "跟技能壞掉一模一樣。至少要有一個分支的 weight 大於 0。",
  });
}

/**
 * `modifyCooldown` 的兩條跨欄位規則（Lane 1）。
 *
 * ① `slot` 與 `abilityId` **至少要有一個** —— 兩個都不填 = 改全部六格，
 *    而「不是全域 cdr」正是這個 kind 存在的理由（owner 明說）。
 * ② `mode:"reduce"` 的 `amount` 是**比例**，所以它的上界是 1 而不是欄位宣告的
 *    120 秒。少了這一條，「50」（作者想寫 50%）會被 handler 靜默夾成 100% ——
 *    同 #277 的形狀：後台收得下、下游才夾掉，而且沒有人被告知。
 */
function refineModifyCooldown(
  e: Extract<EffectDef, { kind: "modifyCooldown" }>,
  ctx: z.RefinementCtx,
): void {
  // ⚠️ 規則①的理由是「兩個都不填 = 改全部六格 = 全域 CDR」，而那句話對
  // `target:"hookInternalCooldown"` **不成立** —— 那條路根本不碰技能槽位，
  // 它指名的是一條觸發器（`hookKey`）。⛔ 留著不放寬，S3 解鎖的技能就寫不出
  // 文件，而錯誤訊息會叫作者去填一個會被 handler 忽略的欄位（比沒有訊息更糟）。
  // `target` 省略 = `"abilitySlot"` = 規則①照舊生效 = 今天每一份文件走的那條路。
  if (
    (e.target ?? "abilitySlot") === "abilitySlot" &&
    e.slot === undefined &&
    e.abilityId === undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["slot"],
      message:
        "要指名**哪一支**技能：填 slot（哪一格）或 abilityId（哪一支）。" +
        "兩個都不填等於改全部六格，而那是全域冷卻縮減（已經有一條屬性在做）。",
    });
  }
  // ⭐ S3 —— `hookScope:"allSources"` 不指名 `hookKey`，就是「重置身上**每一條**
  // 觸發器」。那不是任何人會故意寫的東西，而它在畫面上跟一個超強的被動分不出來。
  if (e.hookScope === "allSources" && e.hookKey === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["hookKey"],
      message:
        'hookScope:"allSources" 一定要有 hookKey —— 不指名的話它會重置這個身體上' +
        "**每一條**觸發器（含別件裝備、別張增益卡的），而畫面上看不出來。",
    });
  }
  // ⭐ ⑤（2026-08-10）—— `target:"hookInternalCooldown"` 一定要**明寫** `hookScope`。
  //
  // 為什麼：`hookScope:"originSource"` 的實作（`effects/modifyCooldown.ts`）只認得
  // `origin` 是 `hook:…` 的呼叫。從**施放**跑出來的同一個效果（`origin` 是
  // `ability:…`）在那裡是一個**靜默的 no-op** —— 技能放得出來、動畫演完、那條
  // 觸發器一格都沒動，而畫面上跟「這招就設計成這樣」分不出來（失敗形態②）。
  //
  // ⛔ schema **測不出**「這個效果會不會從施放路徑跑」：同一支 `zEffectDef` 同時
  // 是 hook 的 `effects` 與技能的 `effects`，而 refine 只看得到節點本身。所以擋得住
  // 的是**真正的那個缺陷**：作者沒有選過就吃到預設值。明寫 `originSource` 的人，
  // 欄位說明會告訴他那句「只有掛在觸發器底下才有作用」。
  //
  // ⚠️ 出貨 0 份 `modifyCooldown`，而 `target:"hookInternalCooldown"` 這條路是
  // S3 才開的，所以這一條擋不到任何既有文件。
  if (e.target === "hookInternalCooldown" && e.hookScope === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["hookScope"],
      message:
        "改觸發器冷卻一定要明寫 hookScope：originSource（只碰**這一發效果自己所屬**" +
        "的那份被動／道具 —— ⚠️ 它只有在這個效果**掛在一條觸發器底下**時才有作用，" +
        "從技能施放跑出來時什麼都不會發生）或 allSources（＋hookKey）。",
    });
  }
  // ⭐ S3 —— `hookKey` 只在改觸發器冷卻時有意義。少了這一條它就是一格填得下、
  // 永遠不被讀的欄位（失敗形態②），而且作者會以為自己縮短的是那條觸發器。
  if (e.hookKey !== undefined && e.target !== "hookInternalCooldown") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["hookKey"],
      message:
        'hookKey 只在 target:"hookInternalCooldown" 下有意義 —— 你現在改的是技能槽位的冷卻。',
    });
  }
  if (e.mode === "reset") return;
  if (e.amount === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["amount"],
      message: `mode:"${e.mode}" 一定要有 amount —— 省略它等於這個效果什麼都不做`,
    });
    return;
  }
  if (e.mode === "reduce" && Math.abs(e.amount) > CD_REDUCE_MAX_PCT) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["amount"],
      message:
        `mode:"reduce" 的 amount 是**比例**（0.5 = 縮短 50%），上限 ${CD_REDUCE_MAX_PCT}。` +
        "想按秒縮短請改 mode:\"reduceFlat\"。",
    });
  }
}

/**
 * `extendBuff` 的**門檻二選一**（Lane 2）。
 *
 * ⚠️ 為什麼要在載入時擋：兩格都不填的話，handler 算出 `threshold = 0` → 早退，
 * 於是這個效果**掛得上、永遠不做事**（失敗形態 ②：卡上寫著「延長 2 秒」，
 * 遊戲裡從來不延長，而且沒有任何訊息）。兩格都填則是「作者以為自己設了兩種
 * 條件」，而實際上只有百分比那一格被讀 —— 一個沉默的謊。
 */
function refineExtendBuff(
  e: Extract<EffectDef, { kind: "extendBuff" }>,
  ctx: z.RefinementCtx,
): void {
  const pct = e.perDamagePctOfMaxHealth !== undefined;
  const flat = e.perDamageFlat !== undefined;
  if (pct === flat) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["perDamagePctOfMaxHealth"],
      message: pct
        ? "perDamagePctOfMaxHealth 與 perDamageFlat **只能填一個** —— 兩個都填時只有百分比那一格會被讀到，另一格是一個看起來有設、沒有人讀的數字"
        : "要填一個門檻：perDamagePctOfMaxHealth（52-01 的「自身最大生命 5%」）或 perDamageFlat。兩個都不填 = 這個效果掛得上但永遠不延長任何東西",
    });
  }
}

/**
 * ⭐ `applyBuff` 的兩條跨欄位規則（Lane 3，2026-08-10）。
 *
 * ① **`permanent` 與 `duration` 互斥且必填其一。**
 *    ⛔ 刻意**不**讓「省略 duration」自己等於永久：那會讓一個打字漏填變成一份
 *    靜默的永久增益，而那正是這個 repo 反覆踩到的那一類。兩格都省略在這一格
 *    出現之前就是 `invalid_type@duration Required`，所以行為逐字不變。
 * ② **`exclusiveOnExisting` 需要 `exclusiveGroup`** —— 沒有組就沒有「已經有的
 *    那一份」可以比對，這一格永遠不會被讀到。與 `shield.onExisting` 需要
 *    `stackKey` 是同一條規矩、同一個訊息形狀。
 */
function refineApplyBuff(
  e: Extract<EffectDef, { kind: "applyBuff" }>,
  ctx: z.RefinementCtx,
): void {
  const perm = e.permanent === true;
  if (perm && e.duration !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["duration"],
      message:
        "永久與持續秒數只能填一格 —— 兩個都填時只有其中一個會被讀到，另一個是一個" +
        "看起來有設、沒有人讀的數字。",
    });
  }
  if (!perm && e.duration === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["duration"],
      message: "請填持續秒數，或勾選「永久」。⛔ 省略秒數本身**不等於**永久。",
    });
  }
  if (perm) {
    e.perRank?.forEach((r, i) => {
      if (r.duration === undefined) return;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["perRank", i, "duration"],
        message: "永久增益的逐階欄位不可以帶持續秒數 —— 那一格永遠不會被讀到。",
      });
    });
  }
  // ⭐ GH#354 / G3 —— 「永久有多久」需要先是永久。
  // 與 `exclusiveOnExisting` 需要 `exclusiveGroup`、`shield.onExisting` 需要
  // `stackKey` 是同一條規矩、同一個訊息形狀：一格永遠不會被讀到的設定，
  // 在編輯器裡看起來跟生效的一模一樣。
  if (!perm && e.permanentScope !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["permanentScope"],
      message:
        "「永久有多久」只有在勾了「永久」時才會被讀到 —— 有持續秒數的增益本來就會" +
        "自己到期，這一格是一個看起來有設、沒有人讀的選項。",
    });
  }
  // ⭐ S4b —— 「只算這份增益自己」需要一個 key 才認得出「這份」。
  // 與 `shield.onExisting` 需要 `stackKey`、`grantAttribute.maxSourceTotal` 需要
  // `store:"source"`、`exclusiveOnExisting` 需要 `exclusiveGroup` 是同一條規矩、
  // 同一個訊息形狀。
  if (e.maxStat?.basis === "thisSource" && e.stackKey === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxStat", "basis"],
      message:
        "「只算這份增益自己」需要 stackKey —— 沒有 key 的話每一次施放都是一份全新的" +
        "來源，這個上限永遠不會咬到，而增益照樣一份一份疊上去。",
    });
  }
  // ⭐ S4b（2026-08-10）——「只算這份增益自己」配**純百分比**的加成 ⇒ 天花板恆為 0。
  //
  // `applyBuff.sourceStatAmount` 折的是 `flat × (1 + pctAdd) × pctMult`，也就是說
  // **沒有任何 `flat` 的那一條屬性算出來永遠是 0**（百分比疊出來的絕對量取決於底值，
  // 而底值正是 `basis:"final"` 讀的那個東西 —— 那一段推導寫在 `applyBuff.ts` 的
  // `sourceStatAmount` 檔頭）。於是 `now >= cap.value` 的左邊永遠是 0：
  //   · `value > 0` → 上限**永遠咬不到**，增益一層一層無限疊；
  //   · `value = 0` → 反過來**第一層就被拒**，整支技能安靜地不生效。
  // 兩種都是「作者設了上限、遊戲裡看不出來」（失敗形態②），所以擋在載入時。
  //
  // ⚠️ 讀的是 handler **真的會讀到**的那幾份清單：`perRank` 有填的時候 handler 走
  // `perRank[rank-1].modifiers`，`e.modifiers` 那一份就沒有人讀。
  if (e.maxStat?.basis === "thisSource") {
    const lists =
      e.perRank !== undefined && e.perRank.length > 0
        ? e.perRank.map((r) => r.modifiers)
        : [e.modifiers];
    const stat = e.maxStat.stat;
    const reachable = lists.some((ms) =>
      ms.some((m) => m.stat === stat && m.op === ModOp.Flat),
    );
    if (!reachable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxStat", "basis"],
        message:
          `「只算這份增益自己」是用這份來源的 ${stat} **絕對量**去比的，而這份增益的 ` +
          `modifiers 裡沒有任何一條是「${stat} + 固定值」——` +
          "純百分比的加成算出來永遠是 0，所以這個上限要嘛永遠咬不到、要嘛第一層就把" +
          "整發擋掉，兩種在遊戲裡都看不出來。請改成 basis:final（比角色面板上的最終值），" +
          `或替 ${stat} 補一條固定值加成。`,
      });
    }
  }
  if (e.exclusiveOnExisting !== undefined && e.exclusiveGroup === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["exclusiveOnExisting"],
      message:
        "exclusiveOnExisting 需要 exclusiveGroup —— 沒有互斥組就沒有「已經有的那一份」" +
        "可以比對，這一格永遠不會被讀到，而增益照樣一份一份疊上去。",
    });
  }
}

/**
 * ⭐ `devour.onDevourPer` 需要 `onDevour`（Lane 3）—— 沒有後續就沒有「跑幾次」
 * 可言。同 `refineApplyBuff` ② 的形狀。
 */
function refineDevour(
  e: Extract<EffectDef, { kind: "devour" }>,
  ctx: z.RefinementCtx,
): void {
  refineDispelShape(e, ctx);
  if (e.onDevourPer !== undefined && e.onDevour === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["onDevourPer"],
      message: "onDevourPer 需要 onDevour —— 沒有後續效果就沒有「跑幾次」可言。",
    });
  }
}

/**
 * ⭐ 45-00 —— `incomingPct.negateOriginal` 與 `basis:"hpLost"` **不可以並存**。
 *
 * 免傷之後這一發的「實際掉血」恆為 0，所以反彈量會**永遠是 0**，而編輯器上看起來
 * 完全正常（失敗形態②的教科書案例：欄位都在、數字永遠是 0）。寫成載入期錯誤才會
 * 在**編輯發生的當下**跟作者說。
 */
function refineNegateOriginal(
  e: Extract<EffectDef, { kind: "damage" }>,
  ctx: z.RefinementCtx,
): void {
  if (e.incomingPct?.negateOriginal !== true) return;
  if (e.incomingPct.basis === "hpLost") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["incomingPct", "basis"],
      message:
        '免傷之後「實際掉血」恆為 0，所以 basis:"hpLost" 的反彈量會永遠是 0 —— ' +
        '而卡片上看起來完全正常。請改用 "raw" 或 "mitigated"。',
    });
  }
}

/**
 * ⭐ `proxyCast` 的跨欄位規則（Lane 3）。
 *
 * ① `slot` 與 `abilityId` **恰好填一個**。⛔ 不給預設：兩個都不填沒有一個誠實的
 *    答案，而「挑一個當預設」會讓一份打錯字的文件安靜地代放錯技能。
 * ② `rankMode:"fixed"` 一定要有 `fixedRank`，反之填了 `fixedRank` 卻不是 fixed
 *    模式 = 一格永遠不被讀的設定。
 */
function refineProxyCast(
  e: Extract<EffectDef, { kind: "proxyCast" }>,
  ctx: z.RefinementCtx,
): void {
  refineDispelShape(e, ctx);
  const named = (e.slot !== undefined ? 1 : 0) + (e.abilityId !== undefined ? 1 : 0);
  if (named !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["abilityId"],
      message:
        "要指名代放**哪一支**：填 slot（我自己的哪一格）或 abilityId（哪一支技能），" +
        "而且**恰好一個**。兩個都不填沒有誠實的答案；兩個都填時只有一個會被讀到。",
    });
  }
  // ⭐ S5 ③ —— 要**付代價**就必須指名 `slot`。
  // 這是一個**資料完整性**問題，不是設計偏好（所以它是一條 refine，不是一格欄位）：
  // `abilityId` 指的可能是一支施法者根本沒有的技能 —— 沒有魔力可扣、也沒有按鈕
  // 可以轉冷卻。⛔ 不在 handler 裡靜默降級成 `"none"`：靜默降級正是失敗形態②
  //（作者勾了「扣魔」、遊戲裡免費放，而畫面上一模一樣）。
  if ((e.payCosts ?? "none") !== "none" && e.slot === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["payCosts"],
      message:
        "要付代價就必須指名 slot（我自己的哪一格）—— abilityId 指的可能是一支施法者" +
        "根本沒有的技能，沒有魔力可扣、也沒有按鈕可以轉冷卻。",
    });
  }
  if (e.rankMode === "fixed" && e.fixedRank === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fixedRank"],
      message: 'rankMode:"fixed" 一定要有 fixedRank —— 否則不知道要用第幾階施放',
    });
  }
  if (e.rankMode !== "fixed" && e.fixedRank !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fixedRank"],
      message: 'fixedRank 只有 rankMode:"fixed" 讀得到 —— 這一格永遠不會被讀到',
    });
  }
}

/**
 * 位移級距（GH#318）與**既有的**擊飛四檔 `launchDistance` 互斥。
 *
 * 兩者都在回答「這一下把人推多遠」，但走的是兩套互相看不見的路：
 *   · `distanceTier` —— **註冊期**查表，寫進 `distance`，照常跑 gap 減法與 `impactPower`；
 *   · `launchDistance` —— **執行期**解析（`toEdge` 要讀當下的火圈半徑），而且
 *     `sim/effects/knockback.ts` 在那條路上**整段跳過** gap 減法與 `impactPower`。
 * 兩格同時填，編輯器會顯示級距那個數字，場上跑的是另一個 —— 那正是
 * `aoeTiers.ts` 自己警告過的「兩份查表」，而且沒有任何東西會紅。
 */
function refineKnockbackTier(e: EffectDef, ctx: z.RefinementCtx): void {
  const kb = e as { distanceTier?: unknown; launchDistance?: unknown };
  if (kb.distanceTier !== undefined && kb.launchDistance !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["distanceTier"],
      message:
        "distanceTier 與 launchDistance 只能填一個 —— 兩者都在決定推多遠，" +
        "但擊飛四檔是執行期解析而且跳過 gap 減法與 impactPower，" +
        "同時填會讓編輯器顯示的距離與場上跑的距離永遠對不起來",
    });
  }
}

function refineEffectDef(e: EffectDef, ctx: z.RefinementCtx): void {
  if (e.kind === "damage") return refineNegateOriginal(e, ctx);
  if (e.kind === "applyBuff") return refineApplyBuff(e, ctx);
  if (e.kind === "devour") return refineDevour(e, ctx);
  // Lane 3（2026-08-10）：`delayed` / `proxyCast` 走同一份 `shape` 檢查。
  if (e.kind === "delayed") return refineDispelShape(e, ctx);
  if (e.kind === "proxyCast") return refineProxyCast(e, ctx);
  if (e.kind === "applyStatus") return refineHardCcDuration(e, ctx);
  if (e.kind === "shield") {
    // `onExisting` 沒有 `stackKey` 就沒有東西可以比對 —— 一格看起來有設、
    // 實際上永遠不會被讀到的欄位（失敗形態②）。與 `grantAttribute` 的
    // `maxSourceTotal` 需要 `store:"source"` 是同一條規矩、同一個訊息形狀。
    if (e.onExisting !== undefined && e.stackKey === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["onExisting"],
        message:
          'onExisting 需要 stackKey —— 沒有 key 就沒有「已經有的那一片」可以比對, ' +
          "這一格永遠不會被讀到, 而護盾照樣一片一片疊上去",
      });
    }
    return;
  }
  if (e.kind === "dot") return refineDotResourceBudget(e, ctx);
  // Lane 2：共用的 `shape` 檢查 + `extendBuff` 自己的跨欄位規則。
  // ⛔ `randomArea` 不在這裡：它沒有 `shape`（2026-08-10 拿掉了那四格孤兒欄位）。
  if (e.kind === "manaBarrier" || e.kind === "extendBuff") {
    refineDispelShape(e, ctx);
    if (e.kind === "extendBuff") refineExtendBuff(e, ctx);
    return;
  }
  // Lane 1：先跑共用的 `shape` 檢查，再跑各自的跨欄位規則。
  if (
    e.kind === "modifyCooldown" ||
    e.kind === "weightedBranch" ||
    e.kind === "swapResource" ||
    e.kind === "eventValueConversion"
  ) {
    refineDispelShape(e, ctx);
    if (e.kind === "weightedBranch") refineWeightedBranch(e, ctx);
    if (e.kind === "modifyCooldown") refineModifyCooldown(e, ctx);
    return;
  }
  // 【淨化】/【破盾】/【瞬移】共用同一組形狀檢查 —— 兩份會分岔，一份不會。
  // ⚠️ `devour` 已經在上面走 `refineDevour`（它多一條 `onDevourPer` 的規則）。
  if (
    e.kind === "dispel" ||
    e.kind === "shieldBreak" ||
    e.kind === "blink" ||
    // [EX∅ 根源]：同一組幾何欄位 → 同一份檢查。少了這兩行，一份
    // `{kind:"carry", shape:"circle"}` 沒寫 radius 的文件會在執行期
    // `radius ?? 0` → 直接 return：動畫演完、什麼都沒發生（失敗形態②）。
    e.kind === "carry" ||
    e.kind === "convertTeam"
  )
    return refineDispelShape(e, ctx);
  if (e.kind === "knockback") return refineKnockbackTier(e, ctx);
  if (e.kind !== "grantAttribute") return;
  if (e.store !== "source") {
    if (e.maxSourceTotal !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxSourceTotal"],
        message:
          'maxSourceTotal 只有 store:"source" 讀得到 —— 沒有 store 的話這個上限' +
          "永遠不會被檢查, 是一個看起來有設、其實無限疊的欄位",
      });
    }
    return;
  }
  // 「到期收回」與「記在來源上」是兩套互相看不見的帳: `attrGrantExpirySystem`
  // 只反轉 `ChampionComp.attrBonus`, 所以一筆 timed 的 source 存款永遠不會被收回。
  // 要限時, 把這個 hook 掛在一個帶 `expiresAtTick` 的 buff source 上。
  if (e.durationSec !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["durationSec"],
      message:
        'store:"source" 不能配 durationSec —— 到期收回只認得 attrBonus, ' +
        "記在來源上的存款不會被收回(要限時就把 hook 掛在有期限的 buff 上)",
    });
  }
}

/**
 * 格擋 —— mirrors `BlockGrant` in `sim/combat/block.ts`, which is where the
 * mechanism, the WC3 evidence and every one of these six axes is argued out.
 *
 * ⚠️ 它住在**這一支**而不是 `schema/item.ts`,理由跟 {@link zVisionGrant} /
 * {@link zFlightGrant} 住在這裡一模一樣:授予它的**不只有道具**。
 * `zAbilityPassiveRank` 也要用同一份(20-00 銀色甲胄「30%機率格擋 100% 魔法傷害」
 * 是 Saber 的天生技,79-002 虛化是卍解狀態下的物理格擋),而 `schema/item.ts`
 * import 這一支 —— 反過來 import 會closed 一個真的模組循環,兩份定義則會 drift。
 * `zItemBlockGrant` 就是這一個常數的別名,不是第二份。
 *
 * 一組軸、三種讀法(道具那三支的實際值列在 `schema/item.ts` 的 `zItemBlockGrant`):
 *   平擋   `{damageTypes:["physical","magic"], chance:0.5, fraction:1}`
 *   限型別 `{damageTypes:["magic"],            chance:0.3, fraction:1}`
 *   保命   `{…, lethalOnly:true, internalCooldown:1}`
 *
 * ⚠️ 上下界不是裝飾,每一個都擋一種真的會發生的誤植:
 *   · `chance` / `fraction` 上界 **1** —— 文案寫的是「30%」「50%」,而一個把
 *     百分比直接抄進來的 `0.3 → 30` 在沒有上界時就是**永遠觸發**(`chance`)或
 *     **把傷害變成治療**(`fraction > 1` ⇒ `impact - cut < 0`)。上界 1 讓這種
 *     誤植在**載入時**就紅,而不是在某一場比賽裡變成一個無敵的玩家。
 *   · `chance` / `fraction` 下界 **>0**(`.positive()`)—— `0` 是一個合法但
 *     **會說謊**的值:卡片上寫著 [格擋],骰子照抽、擋格語音照喊,傷害一點沒少。
 *   · `damageTypes` 必填且 `.min(1)` —— 「真實傷害無法阻擋」必須是這個陣列的
 *     內容,不是程式裡的一行 `if`;而空陣列是一個永遠不會觸發的格擋。
 *   · `internalCooldown` 上界 **300 秒** —— owner 對道具選的是 1 秒,w3x 原作
 *     那兩支是 Cool 45 / Cool 100,所以 300 是「這是誤植不是設計」的那條線,
 *     不是平衡政策。下界 0 是合法且有意義的(= 沒有冷卻),所以是 `.min(0)`。
 */
export const zBlockGrant = z
  .object({
    damageTypes: z
      .array(zDamageType)
      .min(1)
      .describe(
        "這個格擋擋得住哪些傷害型別。想表達「真實傷害無法阻擋」就**不要**把 true 列進來 —— " +
          "擋不擋真傷是這個欄位的內容,不是寫死的規則。",
      ),
    chance: z
      .number()
      .positive()
      .max(1)
      .describe("觸發機率,0~1(0.5 = 50%)。每一發合格的傷害各抽一次,抽中才擋。"),
    fraction: z
      .number()
      .positive()
      .max(1)
      .describe(
        "抽中時擋掉這一發的幾成,0~1(1 = 整包擋掉)。擋掉的部分不會進護盾池,也不會扣血;" +
          "沒擋掉的部分照常走護盾與血條。",
      ),
    lethalOnly: z
      .boolean()
      .optional()
      .describe(
        "只擋「會殺死我」的那一發(抵擋致命一擊)。留空 = 每一發合格的傷害都可能被擋。",
      ),
    lethalBasis: z
      .enum(["hp", "hpAndShields"])
      .optional()
      .describe(
        "致死怎麼算:hpAndShields(預設)= 血 + 這一發吃得到的護盾,也就是「這一發真的會殺死我嗎」;" +
          "hp = 只看血條(文案的字面讀法)。只有 lethalOnly 打開時才有意義。",
      ),
    internalCooldown: z
      .number()
      .min(0)
      .max(300)
      .optional()
      .describe(
        "內部冷卻(秒):這個來源擋中一次之後,要隔多久才能再擋一次。留空 / 0 = 沒有冷卻," +
          "每一發合格的傷害都各抽一次。抽輸不會進冷卻,只有真的擋中才會。",
      ),
  })
  .strict();

/**
 * 型別連擊免疫（史萊姆裝「連續受到 2 次同型別傷害後免疫該型別」）——
 * mirrors `TypeStreakImmunityGrant` in `sim/combat/typeStreakImmunity.ts`。
 *
 * ⚠️ 它住在**這一支**而不是 `schema/item.ts`，理由與 {@link zBlockGrant} 逐字
 * 相同：授予它的不只有道具（`SOURCE_GRANT_SHAPE` 展開它，所以天生技 rank /
 * 三選一增益卡 / `applyBuff` 的限時來源同時拿得到）。`zItemTypeStreakImmunity`
 * 是這一個常數的**別名**，⛔ 不是第二份。
 *
 * ⚠️ 每一個上下界都擋一種真的會發生的誤植：
 *   · `damageTypes` **必填**且 `.min(1)` —— 沿用 `zBlockGrant.damageTypes` 的
 *     判例：「真傷算不算連擊」是這個陣列的**內容**，不是程式裡的一行 `if`。
 *     一個預設值會把這張卡唯一講清楚的事變成要去翻別的檔案的問題。
 *   · `threshold` 上界 {@link TYPE_STREAK_MAX_THRESHOLD} —— 見那裡。
 *   · `streakTimeoutSec` —— **安全閥**。免疫本身沒有到期 tick，面對一波純物理
 *     的殭屍就是無限免疫，而 `zInvulnerable.durationSec` 已經寫過
 *     「an unbounded immunity is an unwinnable round」。缺席 = 永不逾時，
 *     出貨要不要填數字是 owner 的平衡決定。
 */
export const zTypeStreakImmunityGrant = z
  .object({
    damageTypes: z
      .array(zDamageType)
      .min(1)
      .max(3)
      .describe(
        "哪幾種傷害會被計進連擊、並在達標後被免疫。想表達「真實傷害不列入」就**不要**把 true 列進來 —— " +
          "算不算真傷是這個欄位的內容,不是寫死的規則。",
      ),
    threshold: z
      .number()
      .int()
      .min(1)
      .max(TYPE_STREAK_MAX_THRESHOLD)
      .describe("連續受到幾發**同一型別**的傷害之後開始免疫該型別。卡片上的「連續 2 次」= 2。"),
    resetMode: z
      .enum(["restart", "zero"])
      .optional()
      .describe(
        "來了**不同型別**的一發時,那一發自己算不算新連擊的第 1 發:" +
          "restart(預設,內文的自然讀法)= 算,連擊立刻變成「新型別 ×1」;" +
          "zero = 不算,連擊歸零,要下一發才開始數。",
      ),
    streakTimeoutSec: z
      .number()
      .positive()
      .max(TYPE_STREAK_MAX_TIMEOUT_SEC)
      .optional()
      .describe(
        "連擊多久沒被續上就歸零(秒)。留空 = 永不逾時 —— 面對一波純物理的殭屍那就是無限免疫,所以這一格是安全閥。",
      ),
  })
  .strict();

/**
 * 暴擊來源 —— mirrors `CritStrikeGrant` in `sim/combat/critStrike.ts`, which is
 * where the mechanism and every one of these five axes is argued out.
 *
 * ⭐ **這一格就是 owner #299 第 2 條要的那根軸。** 他說暴擊「分 % 幾倍傷害,
 * 不是純暴擊數字累加,反而像是多個獨立技能判斷」——「合成規則」那一半
 * 2026-08-09 已經做完了(`sim/critRules.ts` 的 `stackMode: "multiply"`,
 * 每一條各抽各的骰、倍率相乘);剩下的那一半是**作者要寫得出「一條自己的機率
 * + 自己的倍率」的來源**,而那就是這個物件。
 * ⛔ 它不是 `Stat.CritChance` / `Stat.CritDamage` 兩條屬性的第三種寫法:
 * 那兩條是**聚合**的,加下去之後這位英雄的每一次暴擊都變成那個倍率,
 * 「6% 的那一次是 10 倍」在結構上寫不出來(`critStrike.ts` 檔頭 ①)。
 *
 * ⚠️ 它住在**這一支**而不是 `schema/item.ts`,理由與 {@link zBlockGrant}
 * 一模一樣:授予它的不只有道具。`zItemCritStrike` 是這一個常數的**別名**,
 * 不是第二份 —— 兩份會 drift,而 drift 的那一天兩邊的測試各自只看自己那一半。
 *
 * ⚠️ 上下界不是裝飾,每一個都擋一種真的會發生的誤植:
 *   · `chance` 上界 **1** —— 文案寫的是「6%」,一個把百分比直接抄進來的
 *     `0.06 → 6` 在沒有上界時就是**每一發都 10 倍而且回滿血**。
 *   · `chance` 下界 `.positive()` —— `0` 是一個合法但**會說謊**的值:
 *     卡片上寫著 [暴擊],骰子照抽,什麼都不會發生。
 *     `lifestealFraction: 0` 反而是合法且有意義的(只給倍率、不給吸血),
 *     所以那一格的下界是 0 不是正數。
 *   · `damageMult` 下界 **1** —— 小於 1 的「暴擊」比普通攻擊還弱,
 *     那不是平衡選擇,那是把 10 打成 0.1。
 *   · `damageMult` 上界 **50** —— 出貨最強是 10(天堂之劍)。50 是
 *     「這是誤植不是設計」的那條線,不是平衡政策。
 */
export const zCritStrikeGrant = z
  .object({
    chance: z
      .number()
      .positive()
      .max(1)
      .describe("觸發機率,0~1(0.06 = 6%)。每一次普攻(近戰揮擊/遠程射出)各抽一次。"),
    damageMult: z
      .number()
      .min(1)
      .max(50)
      .describe(
        "抽中時**這一條**貢獻的倍率(10 = 10倍),不是加在暴擊傷害屬性上的增量。" +
          "和英雄自己的暴擊傷害、以及其他抽中的暴擊來源**相乘**(owner 2026-08-09," +
          "後台『暴擊規則』的 stackMode 可改),總倍率再夾在該頁的上限。",
      ),
    lifestealFraction: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "抽中時吸回**真的從血條掉下來的量**的幾成,0~1(1 = 100%)。" +
          "打在護盾上被吃掉的部分不算,和一般吸血同一個基數。",
      ),
    empowers: z
      .enum(["ownProcOnly", "everyCrit"])
      .optional()
      .describe(
        "倍率與吸血套用在哪些暴擊上:ownProcOnly(預設)= 只有這個來源自己抽中的那一發;" +
          "everyCrit = 這一發只要是暴擊就算(包含英雄自己暴擊率骰出來的)。" +
          "預設選較弱的那一個 —— 一個已經堆滿暴擊率的英雄不會因為撿到它就整場 10 倍。",
      ),
    lifestealMode: z
      .enum(["replace", "add"])
      .optional()
      .describe(
        "這一發的吸血怎麼結合持有者原本的吸血:replace(預設)= 直接用上面那個比例;" +
          "add = 加在原本的吸血上面。預設 replace 是較弱的那一個。",
      ),
  })
  .strict();

/**
 * ⭐ **一個來源可以攜帶的「非屬性」授予** —— 一份,不是四份(第零守則⑨)。
 *
 * `ModifierSource` 上有一族東西不是 `Stat` 上的數字:格擋與暴擊來源。
 * 兩者的共同性質是 `sim` 端**完全不看 `kind`** —— `combat/block.ts::blockCutFor`
 * 與 `combat/critStrike.ts::rankedGrants` 都只走 `StatsComp.sources`。
 * 所以「哪一種來源授予得起」從來不是引擎的限制,而是**授權格**的限制:
 * schema 上有沒有這一格 + 建構那個 source 的地方有沒有轉發。
 *
 * ⛔ 所以它是一個**展開的常數**,不是抄四次:
 * `applyBuff`(限時授予 / 主動技能)、`zAbilityPassiveRank`(天生技與被動)、
 * `zAugmentDef`(三選一增益卡)、`zItemDef`(道具)全部展開同一份。
 * 下一個「騎在來源上的授予」加在這裡一格,四個授權面自動全部拿到。
 *
 * ⚠️ 道具那一面歷史上先落地,所以 `schema/item.ts` 仍然逐格寫(它還帶著
 * `zItemBlockGrant` / `zItemCritStrike` 兩個別名給既有守衛用),但**指向的是
 * 同一個 ZodObject 實例** —— 不是第二份定義。
 *
 * ⚠️ 轉發那一半在 `sim/stats/sourceGrants.ts::sourceGrants()`,同樣是一份。
 */
/**
 * 三圍 (力/敏/智) 授予 —— 定義**搬到這裡**（2026-08-09，GH#299 第 6 條的第二批）。
 *
 * ⚠️ 它以前住在 `schema/item.ts` 叫 `zItemAttributes`，搬家的理由與 `zBlockGrant`
 * 2026-08-08 那一次逐字相同：授予它的不只有道具。`item → effect` 是單向 import，
 * 所以要讓 `SOURCE_GRANT_SHAPE` 展開得到它，定義就必須住在這一側；item.ts 留一個
 * 別名（既有守衛用 `zItemAttributes.shape` 數欄位）。
 *
 * 每一格都 optional 而整體 `.refine` 拒絕 `{}`：一個空的授予區塊看起來有 author 過
 * 卻一毛不付，正是這一族要關的洞。上下界的推導（下界 0 是因為大負敏會經由那唯一
 * 一條乘法推導把攻速靜默歸零；上界 500 是打錯數量級的守衛，不是平衡意見）住在
 * `sim/stats/attributes.ts`，⛔ 這裡只引用常數。
 *
 * ⚠️ NOT `.int()` —— 能力屬性強化三選一每張付 0.1–2.0（#260），小數三圍在一場
 * 比賽裡本來就是常態。
 */
export const zAttrGrant = z
  .object({
    str: z.number().min(ATTR_GRANT_MIN).max(ATTR_GRANT_MAX).optional(),
    agi: z.number().min(ATTR_GRANT_MIN).max(ATTR_GRANT_MAX).optional(),
    int: z.number().min(ATTR_GRANT_MIN).max(ATTR_GRANT_MAX).optional(),
  })
  .strict()
  .refine((a) => a.str !== undefined || a.agi !== undefined || a.int !== undefined, {
    message: "attributes must grant at least one of str/agi/int",
  });

/**
 * 傷害型別轉換（無視防禦 / 真實傷害家族）—— 同樣從 `schema/item.ts` 搬過來，
 * 同樣的理由。四個欄位各自的完整推導留在 `schema/item.ts` 的別名註解與
 * `sim/combat/damageTypeOverride.ts` 檔頭，⛔ 不在這裡抄第二份。
 */
export const zDamageTypeOverrideGrant = z
  .object({
    scope: z
      .enum(["basic", "ability", "all"])
      .describe(
        "換哪些傷害:basic = 普通攻擊(近戰與遠程投射物都算)、" +
          "ability = 技能,含技能留下的延燒/中毒每一跳、" +
          "all = 這個來源的持有者打出去的每一發(額外含道具觸發、小怪與守衛塔封包)。",
      ),
    becomes: zDamageType.describe(
      "換成什麼型別。true = 真實傷害(完全跳過護甲與魔抗,而且只有不指定型別的護盾吃得到)。",
    ),
    applyAt: z
      .enum(["afterGates", "beforeGates"])
      .optional()
      .describe(
        "什麼時候換。afterGates(預設)= 無敵/免疫與閃避先用原本的型別判定,轉換只影響護甲魔抗與護盾;" +
          "beforeGates = 連免疫與閃避也用新型別判定(例:被轉成真傷的法術,魔法免疫就擋不住了)。",
      ),
    impactType: z
      .enum(["original", "converted"])
      .optional()
      .describe(
        "換完之後,擊倒判定讀哪一個型別。original(預設)= 讀轉換前的型別 —— " +
          "被轉成真傷的法術跳過魔抗,但不會因此多出一個它本來沒有的擊倒;" +
          "converted = 讀轉換後的型別,也就是「轉真傷順便附贈擊倒」。",
      ),
  })
  .strict();

/**
 * 飛行 (無視碰撞) grant on a passive rank — mirrors `FlightGrant` in
 * sim/flight.ts.
 *
 * ⚠️ `stayInsideBoundary` DEFAULTS TO TRUE and that default is the whole safety
 * story: without it 「無視碰撞」 walks 莉娜因巴斯 off the 24-unit arena disc, and
 * every zone-scoped mechanic (duel resolution, teamAliveInZone, the minimap)
 * then reasons about a champion who is nowhere. Turning it off is a deliberate
 * authoring act, not a default anybody falls into.
 *
 * `hoverHeight` is presentation only (it rides the existing `EntityState.h`
 * channel) and is bounded on BOTH ends: a champion floating 40 units up is off
 * the top of a fixed-pitch camera, i.e. invisible, which reads as the model
 * failing to load rather than as a feature.
 */
export const zFlightGrant = z
  .object({
    hoverHeight: z.number().min(0).max(FLIGHT_MAX_HOVER_HEIGHT).optional(),
    ignoreUnits: z.boolean().optional(),
    ignoreObstacles: z.boolean().optional(),
    stayInsideBoundary: z.boolean().optional(),
  })
  .strict();

/**
 * 隱形 / 真視 grant — mirrors `VisionGrant` in sim/stealth.ts.
 *
 * ⚠️ 這一份**定義的位置**是承重的：它被 {@link SOURCE_GRANT_SHAPE} 展開，而那是
 * 一個模組載入當下就求值的 `const`。定義留在檔案下半部時，展開那一行會撞上
 * `zVisionGrant` 的 TDZ 而讓整個 `schema/index.ts` 在 import 時當場 TypeError
 * （與 `zAuraDef` 那一段檔頭記錄的是同一族陷阱）。⛔ 不要把它搬回去。
 *
 * BOTH numbers are PORTED, not invented, and both have an upper bound because a
 * missing ceiling is how a mis-parse ships (#277):
 *
 *   · `stealthFadeDelaySec` — the w3x `Dur`/`HeroDur` column of WC3 Permanent
 *     Invisibility (`Apiv`), which for that ability is the FADE TIME. 27-00
 *     永久性的隱形術 ships 4.0, matching its own prose 「在4秒內不做任何攻擊或
 *     施法動作」. Cap 60 s: anything longer is a hero who never goes invisible
 *     inside a 3-minute round, i.e. a typo that would read as the feature being
 *     broken. 0 is legal and means "hidden the instant you stop acting".
 *   · `trueSightRadius` — sim units, so the w3x `cast_range` divided by the
 *     usual 54.5 (`Atru` 16-00 通靈能力: 500 → 9.17). Cap 40, the same
 *     mis-parse guard `zAuraDef.radius` uses and for the same reason: the whole
 *     zone is `boundaryRadius: 24`, so >40 is almost certainly a raw WC3 number
 *     that leaked through unconverted.
 */
export const zVisionGrant = z
  .object({
    stealthFadeDelaySec: z.number().min(0).max(60).optional(),
    trueSightRadius: z.number().positive().max(40).optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.stealthFadeDelaySec !== undefined || v.trueSightRadius !== undefined,
    {
      message:
        "vision grant must carry at least one of stealthFadeDelaySec / trueSightRadius",
    },
  );

/**
 * 【死亡遺留】—— 「帶著這份來源的人在場時，同區有英雄陣亡就在屍體原地留下一個
 * 持久的光環物件」。71-00 暗夜契約的**暗夜旗**是出貨的那一支。
 *
 * ⭐ 2026-08-19（CLAUDE.md 第〇·五守則）—— 這一格是**把一份專屬程式收編成資料**。
 * 在它之前，這整套機制住在 `sim/nightPact.ts`，參數住在
 * `config.arena-rules@1.nightPact`，而那個區塊的第一格是
 * `abilityIds: ["godie-u00k.passive"]` —— 引擎被一支技能的 id 綁死，
 * 於是 71-00 的 `passive.ranks[0].modifiers` 是**空的**，
 * castability 普查每一次跑都量出一格 ❌（而那個 ❌ 說的是實話）。
 *
 * ⛔ 每一格的上下界都是 MIS-PARSE 護欄，不是平衡意見：
 *   · `radius` ≤ 40 —— 與 `zAuraDef.radius` 同一條（決鬥區的 `boundaryRadius`
 *     是 24，超過 40 的一律是沒換算的 WC3 原始數字）。
 *   · `maxPerZone` ≤ 64 —— 一場 12 人的團滅留不下 65 個遺留物；更大的數字
 *     是打錯數量級，而它的代價是每 tick 的 O(遺留物 × 英雄) 迴圈。
 *   · `modifiers` `.min(1)` —— 一個什麼都不給的遺留物看起來 author 過卻一毛不付，
 *     正是第一·五守則要關的那族洞。
 */
export const zDeathWardGrant = z
  .object({
    radius: z
      .number()
      .positive()
      .max(40)
      .describe("遺留物光環的半徑（GGD 單位）。站進這個圈才吃得到下面的加成。"),
    maxPerZone: z
      .number()
      .int()
      .min(1)
      .max(64)
      .describe("同一座競技場裡同時最多幾個遺留物。滿了之後再有人陣亡就不再留下新的。"),
    beneficiary: z
      .enum(["owner", "team"])
      .describe(
        "誰吃得到這一圈：owner = 只有帶著這支技能／這件道具的人自己；team = 他整隊。" +
          "⚠️ 這不是隊伍光環（那要用 auras），它問的是「誰帶著這份來源」。",
      ),
    stacking: z
      .enum(["max", "add"])
      .describe(
        "多個遺留物重疊時：max = 只算一份（站在三個圈裡和站在一個圈裡一樣）；" +
          "add = 每一個都算（三個圈就是三倍）。一場團滅會留下很多個，所以這是真的平衡決定。",
      ),
    modelKey: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe("遺留物在畫面上用哪一份模型。留空 = 暗夜旗（prop.night-flag）。"),
    modifiers: z
      .array(zStatModifier)
      .min(1)
      .describe(
        "站在圈內的受益者吃到的加成。⚠️ 與這一階自己的 modifiers 是**兩件事**：" +
          "那一份是持有者常駐，這一份是站進圈裡才有。",
      ),
  })
  .strict();

export const SOURCE_GRANT_SHAPE = {
  block: zBlockGrant.optional(),
  /**
   * ⭐ 2026-08-19 —— 第九格，見 {@link zDeathWardGrant}。
   * 讀它的是 `sim/deathWard.ts`，而它走 `StatsComp.sources` 且不問 `kind`，
   * 所以天生技 rank / 切換技開著的期間 / 道具 / 增益卡 / `applyBuff` 的限時來源
   * 五個授權面同時拿得到，⛔ 不需要第二次接線。
   */
  deathWard: zDeathWardGrant.optional(),
  critStrike: zCritStrikeGrant.optional(),
  /**
   * ⭐ 2026-08-18（GH#373）—— **限時**隱形 / 真視。**又是同一個授權格**，
   * 而且是這一族裡引擎最早就準備好的那一格：`sim/stealth.ts::syncVisionGrants`
   * 從 2026-07-30 起每 tick 掃 `StatsComp.sources` 找 `src.vision`、**不問
   * `kind`**，而且**已經在跳過過期的 source**（`expiresAtTick <= world.tick`
   * 那一行）。所以「隱身 20 秒」到期由那份 buff 自己收掉，⛔ 不需要第二支掃描器。
   *
   * 擋住它的一直只有 schema：`vision` 在此之前只掛得到**道具**（永久佩戴）與
   * **天生技 rank**（rank>0 之後永久），於是 53-00 空間穿梭「持續 20 秒」與
   * 30-00 攝影機「可以看到隱形部隊」在引擎裡沒有形狀 —— 兩支的整棵效果樹因此
   * 只剩一個 `spawnVfx`（GH#373，第一·五守則的形狀）。
   */
  vision: zVisionGrant.optional(),
  /**
   * ⭐ 2026-08-09 —— G7 的第三、第四格。**引擎從第一天就不看 `kind`**（真的跑過
   * 模擬：把 `attributes` 掛在 `kind:"buff"/"augment"/"passive"` 的來源上，
   * `stats/attrSources.ts::sourceAttrGrants` 照樣把 24 力加成 54；把
   * `damageTypeOverride` 掛在同樣三種上，`combat/damageTypeOverride.ts::
   * resolveDamageConversion` 照樣回 `"true"`）。擋住「這支大招期間三圍 +30」
   * 「這張卡讓你的普攻變真傷」的**只有**這兩格 schema 與轉發。
   */
  attributes: zAttrGrant.optional(),
  damageTypeOverride: zDamageTypeOverrideGrant.optional(),
  /**
   * ⭐ 2026-08-09 —— S11（GH#299）的第一半，**又是同一個授權格**。
   *
   * `ModifierSource.flight` 早就存在，而 `sim/flight.ts::flightSystem` 每 tick
   * 掃 `StatsComp.sources` 找它、**不問 `kind`**（那份檔頭自己寫著「NOTHING else
   * reads it」）。擋住「限時飛行」的只有 schema：`flight` 在此之前只掛得到
   * `ability@1.passive.ranks[].flight`，而被動一旦到 rank>0 就是**永久**的 ——
   * 於是 77-03 的「翅膀 6 秒」只能靠 `whileForm` 閘去繞，結果 rank 4 的加速活
   * 15 秒、翅膀只有 6 秒，兩個本來該同時結束。
   *
   * 開在這裡（而不是 `applyBuff` 自己一格）的好處是它一次落在**四個授權面**上：
   * 道具、天生技 rank、增益卡、`applyBuff` —— 而一份限時的 `applyBuff` source
   * 到期時 `flight` 跟著整個 source 一起消失，⛔ 不需要第二支到期掃描器。
   */
  flight: zFlightGrant.optional(),
  /**
   * ⭐ 2026-08-12 —— [穿透]（LoL 四段的段③④）。**又是同一個授權格**：
   * `sim/combat/penetration.ts::resolvePenetration` 走 `StatsComp.sources` 而
   * **不問 `kind`**，所以「這張三選一卡讓你的普攻穿 30% 護甲」「這支大招期間
   * 無視魔抗 8 秒」擋住它的只有這一格 schema 與 `sourceGrants()` 的轉發。
   *
   * ⚠️ 定義住在 `schema/mitigationDoc.ts` 而不是這裡，因為它的上下界要從
   * `sim/combat/penetration.ts` import（⛔ 不抄字面值）。
   */
  penetration: zPenetrationGrant.optional(),
  /**
   * ⭐ 2026-08-18 —— [型別連擊免疫]（史萊姆裝）。**又是同一個授權格**：
   * `combat/typeStreakImmunity.ts` 走 `StatsComp.sources` 而**不問 `kind`**，
   * 所以「這張三選一卡讓你連吃兩發物理後免疫物理」「這支大招期間對魔法連擊
   * 免疫」擋住它的只有這一格 schema 與 `sourceGrants()` 的轉發。
   * ⛔ 少了後者 = schema 畫得出來、引擎永遠讀不到（失敗形態②）。
   */
  typeStreakImmunity: zTypeStreakImmunityGrant.optional(),
} as const;

/**
 * ⭐ 硬控的那一條較嚴的上界（見 {@link HARD_CC_MAX_DURATION_SEC}）。
 *
 * 住在 `refineEffectDef` 而不是 `duration` 自己的 `.max()`，有兩個各自獨立的
 * 理由，兩個都是硬的：
 *   ① 它是一個**跨欄位**規則 —— 同一個 24 秒在計數視窗上合法、在暈眩上不合法，
 *      而 `z.number()` 看不到隔壁那格布林。
 *   ② `zEffectDefUnion` 是 `z.discriminatedUnion`，它的成員**必須是 ZodObject**；
 *      在那一格掛 `.superRefine` 會讓它變成 `ZodEffects` 而整個聯集建不起來。
 *      ⛔ 這不是風格問題，是 zod 的型別約束（試過，`pnpm typecheck` 直接紅）。
 */
function refineHardCcDuration(
  e: Extract<EffectDef, { kind: "applyStatus" }>,
  ctx: z.RefinementCtx,
): void {
  const flags = HARD_CC_FLAGS.filter((f) => e[f] === true);
  if (flags.length === 0) return;
  const cols = typeof e.duration === "number" ? [e.duration] : e.duration;
  cols.forEach((v, i) => {
    if (v <= HARD_CC_MAX_DURATION_SEC) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: typeof e.duration === "number" ? ["duration"] : ["duration", i],
      message:
        `硬控（${flags.join("/")}）最長 ${HARD_CC_MAX_DURATION_SEC} 秒，拿到 ${v}。` +
        "一場回合三分鐘，再長等於「那個人這一場不用玩了」。" +
        `不拿走操作的狀態（計數視窗、減速、減益數值）可以到 ${STATUS_MAX_DURATION_SEC} 秒。`,
    });
  });
}

/** Recursive knot: spawnProjectile.onHit is EffectDef[] again. */
export const zEffectDef: z.ZodType<EffectDef, z.ZodTypeDef, unknown> = z.lazy(
  () => zEffectDefUnion.superRefine(refineEffectDef),
) as unknown as z.ZodType<EffectDef, z.ZodTypeDef, unknown>;

/**
 * ⭐ 每一個 effect kind **共有**的欄位 —— `sim/effects/effect.ts` 的
 * {@link EffectCommon} 在 Zod 這一側的鏡子。
 *
 * ⛔ **一份，不是 34 份。** 每個聯集成員都 `...EFFECT_COMMON_SHAPE,` 展開它；
 * 下一個共有欄位加在這裡一格，34 個成員自動全部拿到（第零守則⑨）。
 * ⚠️ 不做成 `zEffectDefUnion.options.map(o => o.extend(...))` 是因為
 * `z.discriminatedUnion` 需要一個**元組**型別，`.map` 回來的陣列要靠 `as` 騙進去，
 * 而那一個 `as` 會讓整個聯集的推導型別退化 —— 展開一個常數形狀是 zod 的慣用法，
 * 而且型別完全精確、零 cast。
 */
const EFFECT_COMMON_SHAPE = {
  /**
   * 這一段效果要不要發生。與 **hook 上的 `condition` 是同一個型別、同一個求值器、
   * 同一組葉子**（`zEffectCondition`）—— ⛔ 不是第二套條件系統。
   *
   * 語意（逐一判斷 / 空目標退化成整段閘 / 一個都沒通過就不呼叫 handler）完整寫在
   * `sim/effects/effect.ts` 的 `EffectCommon.condition`，**不在這裡重複一份**。
   * 省略 = 無條件執行（今天所有內容的行為）。
   */
  condition: zEffectCondition
    .optional()
    .describe(
      "觸發條件：只有條件成立的目標才吃到這一段效果（省略＝所有目標都吃到）。" +
        "與觸發器上的條件用同一組判斷式；「對身上有〔恐懼〕的敵人追加傷害」是**逐一**" +
        "判斷的，範圍技裡沒有恐懼的人不會被算進去。沒有目標的效果（自我增益／落點特效）" +
        "則是整段成立或整段不發生。",
    ),
} as const;

/**
 * ⭐ G11（GH#299）—— 「這一段落在誰身上」。
 *
 * `applyStatus` / `spendMana` / `leap` / `invulnerable` / `knockback` /
 * `blink` / `evasion` / `cycleBuff` 早就有這一格，而 `damage` / `dot` /
 * `heal` / `restore` **沒有**，於是「施法者付自己的血」被 `.strict()` 拒收，
 * 89-002 只好靠 `randomArea{who:"self"}` → `weightedBranch{side:"allies",
 * maxTargets:1}` **兩層包裝**繞過去。
 *
 * ⛔ **沒有**提進 {@link EFFECT_COMMON_SHAPE}（原本的計畫），因為那會把這一格
 * 開在全部 34 個 kind 上，包括 handler 根本不讀它的那些 —— 作者填了、什麼都
 * 不會發生，那是失敗形態②的鏡像（「JSON 有那一格但引擎不看」），跟這一批要修的
 * 「引擎會做但 JSON 沒那一格」一樣糟。所以是**開一格、接一條線**，逐 kind 加。
 */
const zApplyToSelfOrTarget = z
  .enum(["self", "target"])
  .optional()
  .describe("落在誰身上：target（預設，這次解出來的每個目標）或 self（施法者自己）。");

/**
 * ⭐ G1（2026-08-10）—— 範圍技的**圈內逐一過濾**那一族，四個共用常數。
 *
 * ⛔ **沒有**提進 {@link EFFECT_COMMON_SHAPE}，理由與 {@link zApplyToSelfOrTarget}
 * 逐字相同：那會把四格開在全部 36 個 kind 上，包括 handler 根本不讀它們的那些 ——
 * 作者填了、什麼都不會發生（失敗形態②的鏡像）。所以是**開一格、接一條線**，
 * 逐 kind 加：今天只有 `damageArea` 與 `damageLine`。
 *
 * ⛔ 也**不**給 `damageArea` / `damageLine` 加 `shape`：它們有自己的幾何
 *（`radius` / `length`+`width`），而 E1「新 kind 一律帶 shape」只約束**新** kind。
 * 加了會變成兩份互相打架的範圍定義。
 */
const zVictimCondition = zEffectCondition.optional().describe(
  "圈內逐一過濾：只有通過這個條件的敵人才吃到這一段（「範圍內只打帶〔恐懼〕的敵人」）。" +
    "留空＝圈內每個人都吃到。⚠️ 它與上面那格「觸發條件」不是同一件事：" +
    "觸發條件讀的是上游交下來的目標、決定「這一段跑不跑」；這一格讀的是這個圓／" +
    "這條線自己解出來的人、決定「圈內誰挨打」。兩者用同一組判斷式。",
);

const zMaxTargetsCounts = z
  .enum(["qualified", "candidates"])
  .optional()
  .describe(
    "「最多幾人」數的是誰：qualified（預設）＝通過上面那個過濾的前 N 個" +
      "（卡面「最多 5 名帶〔恐懼〕的敵人」）；candidates＝先取最近的 N 個再過濾" +
      "（「最近 5 人裡帶〔恐懼〕的」）。沒填過濾條件時這一格沒有作用。",
  );

const zOnHitTargets = z
  .array(z.lazy(() => zEffectDef))
  .min(1)
  .max(EFFECT_CHAIN_MAX_STEPS)
  .optional()
  .describe(
    "命中之後接著跑的一段，而且**它收到的目標是這個圓／這條線真的打到的那群人**" +
      "（不是上游交下來的）。「打到的每個人都中毒」「濺射到的人再被擊退」寫的就是這裡。",
  );

const zRunOnEmptyHit = z
  .boolean()
  .optional()
  .describe(
    "一個人都沒打到時，要不要照樣跑上面那一段。留空＝不跑（＝沒有這一格之前的行為）。" +
      "打開它才寫得出「打空了也留下一個落地特效」。",
  );

/**
 * ⭐ G1 ② —— 下一段怎麼收那群人：整群一次，還是一個一個分開跑。
 *
 * 省略 = `"batch"`，也就是 {@link zOnHitTargets} 的檔頭**已經公告過**的語意
 * （「把這一圈真的打到的那群人當成 ctx.targets 交給這一段」）。⛔ 所以它不是一個
 * 新語意，只是把那句話裡本來就藏著的第二個選項拿出來當欄位（第一守則：決策點）。
 *
 * ⚠️ 為什麼一定要有 `perTarget`：下游若是 `damageArea` / `damageLine` 這種**自己解
 * 幾何**的 kind，它們只讀 `ctx.targets[0]` 當圓心 —— batch 模式下 5 個受害者只會炸
 * 出**一個**圈，而畫面上跟壞掉一模一樣（失敗形態②）。
 *
 * ⚠️ 預算誠實記一筆：`perTarget` 讓下游的 rng draw 隨受害者數線性成長。受害者清單
 * 本身已經是全序決定性的，所以決定性不破，但那是一筆看得見的成本。
 *
 * 上下界由 enum 本身封閉，無數值界。
 */
const zOnHitTargetsMode = z
  .enum(["batch", "perTarget"])
  .optional()
  .describe(
    "下一段收到的是**整群人一次**（batch，預設）還是**一個一個分開跑**（perTarget）。" +
      "要寫「每個被打到的人腳下再炸一圈」必須選 perTarget —— 圓形／直線那類效果只認" +
      "第一個目標當圓心，整群一次交下去只會炸出一個圈。",
  );

export const zEffectDefUnion = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("damage"),
      ...EFFECT_COMMON_SHAPE,
      /** ⭐ G11（GH#299）—— 「施法者付自己的血」。見 {@link zApplyToSelfOrTarget}。 */
      applyTo: zApplyToSelfOrTarget,
      damageType: zDamageType.optional().describe(
        "傷害型別：吃護甲(physical)、吃魔抗(magic)、什麼都不吃(true)。" +
          "**省略 = 後台「傷害規則」頁的預設**（出貨 magic —— owner 2026-08-05" +
          "「技能傷害預設都改成 AP 傷害」）。⚠️ 它與**係數來源**是兩件事：" +
          "型別決定吃什麼減免，`amount` 的 Scaling(ap/ad/str/agi/int) 決定數字多大。",
      ),
      amount: zScaling,
      canCrit: z.boolean().optional(),
      /** combo-window bonus, added only while the CASTER holds `statusId` (j:34189) */
      comboBonus: z
        .object({
          statusId: zRef<StatusId>("status-effects", { soft: true }),
          amount: zScaling,
        })
        .strict()
        .optional(),
      /**
       * 百分比生命傷害 — a slice of the VICTIM's health. See the `hpPct` member
       * of `sim/effects/effect.ts` for why it cannot be a `ratios` entry
       * (`Scaling` reads the CASTER's stats) and why `basis` is a field.
       *
       * BOTH ENDS BOUNDED (CLAUDE.md 「欄位要有上界」): each rank column is a
       * 0..`HP_PCT_DAMAGE_MAX` RATIO, so 「12」 typed for 12 % fails to load
       * instead of one-shotting the arena. `.min(1)` on the array is the same
       * anti-vacuum rule `zEffectCondition`'s groups carry — an empty column
       * list resolves to 0 and would read as a feature that silently does
       * nothing.
       */
      hpPct: z
        .object({
          basis: z.enum(["max", "current"]),
          perRank: z.array(z.number().min(0).max(HP_PCT_DAMAGE_MAX)).min(1),
        })
        .strict()
        .optional(),
      /**
       * 存款加成 —— mirrors the `bankedBonus` member of `sim/effects/effect.ts`.
       * 額外傷害 = `min(標記帶的數字 × coeff, max)`,標記由 `spendMana.bankAs`
       * 開出。這是 owner 2026-07-31「揍敵客 EX 效果隨消耗 MP 放大 => 現存 MP 的
       * 20% 傷害」唯一能誠實表達的形狀(見那一段的 sim 註解:傷害落地時法力
       * 已經是 0)。
       *
       * BOTH ENDS BOUNDED, 而且**兩個上界的理由不同**:
       *   `coeff` ≤ `BANKED_COEFF_MAX` —— 係數本身是設計旋鈕,owner 明說要是欄位;
       *   `max`   ≤ `BANKED_BONUS_MAX` —— 這是**保險絲**。法力池會隨等級與裝備
       *   長大(揍敵客基礎 500,滿裝可以到四位數),一個沒有天花板的線性項在
       *   後期就是一擊必殺。少了它,這個機制的失敗形態不是「數字不好看」而是
       *   「回合在第一次暗步就結束」。
       */
      bankedBonus: z
        .object({
          statusId: zRef<StatusId>("status-effects", { soft: true }),
          coeff: z.number().positive().max(BANKED_COEFF_MAX),
          max: z.number().positive().max(BANKED_BONUS_MAX),
        })
        .strict()
        .optional(),
      /**
       * [反彈] —— mirrors the `incomingPct` member of `sim/effects/effect.ts`,
       * 也就是「反彈剛剛打中我的那一發的 N%」。反射之盾 (godie-i03m) 的
       * 「反彈普通攻擊傷害 200%」在這個欄位之前**寫不出來**:`zScaling` 只讀
       * CASTER 的屬性表,而 200% 的分母是一發封包。
       *
       * BOTH ENDS BOUNDED,兩個上界的理由不同,而且都不是平衡政策:
       *   `perRank[]`      ≤ `INCOMING_PCT_MAX` (=5) —— **打錯數字的守衛**。
       *                    「200」打進該寫「2.00」的格子 = 20,000% 反彈,任何人
       *                    普攻你一下就當場暴斃,而在 diff 裡跟正確值長得一樣。
       *   `maxChainDepth`  ≤ `REFLECT_MAX_CHAIN_DEPTH` (=2) —— **終止性的一半**。
       *                    ⚠️ 2026-08-01 更正:它是「鏈從第 0 輪起跳」時的
       *                    必要條件,**不是**「反彈一定在同一個 tick 落地」的
       *                    充分條件 —— hook 排出來的封包(每一件 [On-Hit])
       *                    最早第 1 輪才落地。那一半改由執行期閘門保證,見
       *                    `whenTooLate` 與 sim/effects/reflectLimits.ts。
       *
       * 另外兩個欄位都是**決策點**,所以是欄位而不是寫死的分支:
       *   `applyGlobalDamageMult` 預設 false —— 反彈**不**再吃一次
       *                    `combatEnv.damageDealt`。三個讀數已經在倍率之後了,
       *                    再乘一次反彈比就變成 `pct × k`(2026-08-01 的缺陷)。
       *                    false 讓 owner 的「反彈 200%」在任何 k 下字面為真。
       *   `whenTooLate`    預設 "drop" —— 一發塞不進這個 tick 剩餘排空輪數的
       *                    反彈不排進佇列。"spill" = 舊行為(晚一 tick 落地)。
       *
       * `.min(1)` on the array: 同 `hpPct`,一個空欄位會解算成 0,長得像功能、
       * 實際上什麼都不做。
       */
      incomingPct: z
        .object({
          /** 拿哪一個讀數當基數。省略 = `"mitigated"`(護甲/魔抗之後、護盾之前) */
          basis: z.enum(["raw", "mitigated", "hpLost"]).optional(),
          perRank: z
            .array(z.number().min(INCOMING_PCT_MIN).max(INCOMING_PCT_MAX))
            .min(1),
          /** 反彈可以再被反彈幾層。省略 = 0 = 反彈本身不可被反彈 */
          maxChainDepth: z
            .number()
            .int()
            .min(REFLECT_MIN_CHAIN_DEPTH)
            .max(REFLECT_MAX_CHAIN_DEPTH)
            .optional(),
          /**
           * 反彈封包要不要再吃一次全域傷害倍率 `combatEnv.damageDealt`。
           * 省略 = false = 不吃 = 反彈比剛好等於 `perRank`(文案字面為真)。
           */
          applyGlobalDamageMult: z.boolean().optional(),
          /**
           * 這個 tick 的排空輪數已經不夠讓反彈落地時怎麼辦。
           * 省略 = `"drop"`(不發) / `"spill"`(排進佇列,下一個 tick 才落地)。
           */
          whenTooLate: z.enum(["drop", "spill"]).optional(),
          /**
           * ⭐ 45-00 —— 反彈的同時**這一發不扣我的血**。
           * 省略 = **false** = 只把傷害打回去（＝今天的行為，也是出貨唯一用
           * `incomingPct` 的反射之盾 `godie-i03m` 寫的那個語意）。
           * ⚠️ owner 說的「反彈預設都是免傷」是**那一類技能的設計預設**，不是引擎
           * 的相容性預設 —— 引擎預設改成 true 會靜默把一件已上架的道具變成免傷神裝。
           */
          negateOriginal: z
            .boolean()
            .optional()
            .describe(
              "反彈的同時免除這一發傷害（自己不掉血）。留空＝照樣掉血，只是把傷害打回去。" +
                "⚠️ 打開它之後這一發的「已損失生命」是 0，所以反彈量不可以用「實際掉血」當基數。",
            ),
        })
        .strict()
        .optional(),
      /**
       * 資源百分比項 —— 「誰的哪一條血/魔的多少」。虛哭神去 godie-i007
       * 「自身已損失的生命百分比數值(0~100)」與 瑪那魔杖 godie-i020
       * 「敵方現存 MP 5% 傷害」都走這一個欄位。形狀、兩種 `scale` 讀法與上界
       * 見 {@link zResourcePctTerm} 與 sim/effects/dynamicTerms.ts。
       *
       * 它與 `hpPct` 不重複:`hpPct` 只讀受害者的生命、只有比例讀法、上界 0.35,
       * 已經出貨在 揍敵客 W 牙突 上,原封不動。
       */
      resourcePct: zResourcePctTerm.optional(),
      /**
       * 距離加成項 —— 炎神弩 godie-i06i 「攻擊額外造成 10-1000 傷害,敵我距離
       * 越遠傷害越高 (0~10)」。線性內插,`near` 在距離 0、`far` 在 `atRange` 之外。
       *
       * BOTH ENDS BOUNDED,而三個上界的理由不同:
       *   `atRange` ≤ `DISTANCE_SCALE_RANGE_MAX`(40) —— 跟 `zAuraDef.radius`
       *     同一個數字同一個理由:整個場地 `boundaryRadius` 是 24,超過 40 比較
       *     可能是一個沒換算的 WC3 原始值(500 ≈ 這裡的 9.17)漏進來。
       *   `near`/`far` ≤ `DISTANCE_SCALE_DAMAGE_MAX`(3000) —— ⚠️ 出貨的炎神弩
       *     `far` 就是 **1000**(owner 文案寫死的),已經接近一條血。這個上界的
       *     工作不是壓制它(壓制它等於竄改文案),是擋住多打一個零。
       *
       * ⚠️ **方向是資料**:`near > far` 就是「越近越痛」,一樣寫得出來。
       */
      distanceScale: z
        .object({
          atRange: z.number().positive().max(DISTANCE_SCALE_RANGE_MAX),
          near: z.number().min(0).max(DISTANCE_SCALE_DAMAGE_MAX),
          far: z.number().min(0).max(DISTANCE_SCALE_DAMAGE_MAX),
        })
        .strict()
        .optional(),
      /**
       * 把這一發**實際打出去的量**折回給施法者 —— 瑪那魔杖 godie-i020
       * 「回復己方 MP 該傷害量」。付款發生在 `combat/damage.ts` 的排空迴圈
       * (`DamagePacket.refund`),因為只有那裡知道減免之後真的掉了多少。
       *
       * `basis` 省略 = `"hpLost"` = 玩家看到的那個浮動數字,所以「該傷害量」
       * 在畫面上字面為真。`pct` 上界 `DAMAGE_REFUND_PCT_MAX`(2):出貨值是 1.0
       * (文案的字面值),上界留一格設計空間,同時擋住把 1 打成 100。
       */
      refund: z
        .object({
          resource: z.enum(["health", "mana"]),
          basis: z.enum(["hpLost", "mitigated"]).optional(),
          pct: z.number().positive().max(DAMAGE_REFUND_PCT_MAX),
        })
        .strict()
        .optional(),
    })
    .strict(),
  /**
   * damageArea (#210 近戰擴散) — mirrors the `damageArea` member of `EffectDef`.
   *
   * 三個旋鈕都有**上界**, 不是只有下界: CLAUDE.md 明說「欄位要有上界」, 而這裡
   * 的失敗形態很具體 —— w3x 的長度單位大約是 GGD 的 54.5 倍, 所以任何一個從
   * 原始資料直接貼過來的 `Area` 欄位 (200/300/450) 都會變成一個蓋滿整個決鬥區
   * 的圓。上界把那種貼上變成「檔案進不來」而不是「上線後某件武器一發清場」。
   * 數字與理由見 sim/effects/spreadLimits.ts —— 那裡是唯一的一份, 這裡只是
   * 把它接到 Zod 上, 兩邊不可能漂移。
   */
  z
    .object({
      kind: z.literal("damageArea"),
      ...EFFECT_COMMON_SHAPE,
      damageType: zDamageType.optional().describe(
        "傷害型別：吃護甲(physical)、吃魔抗(magic)、什麼都不吃(true)。" +
          "**省略 = 後台「傷害規則」頁的預設**（出貨 magic —— owner 2026-08-05" +
          "「技能傷害預設都改成 AP 傷害」）。⚠️ 它與**係數來源**是兩件事：" +
          "型別決定吃什麼減免，`amount` 的 Scaling(ap/ad/str/agi/int) 決定數字多大。",
      ),
      amount: zScaling,
      /** GGD 單位。不經過 combatEnv.abilityRange — 見 sim/effects/effect.ts。 */
      radius: z.number().positive().max(SPREAD_MAX_RADIUS),
      radiusTier: zAoeTier.optional(),
      /** 邊緣倍率: 1 = 不衰減 (預設), 0 = 邊緣歸零 */
      falloff: z
        .number()
        .min(SPREAD_MIN_FALLOFF)
        .max(SPREAD_MAX_FALLOFF)
        .optional(),
      /** 一次最多濺到幾個人 (不含震央) */
      maxTargets: z.number().int().min(1).max(SPREAD_MAX_TARGETS).optional(),
      canCrit: z.boolean().optional(),
      /** 震央本人要不要再吃一次 (預設 false — 他已經吃過觸發這一擊了) */
      includeOrigin: z.boolean().optional(),
      /** ⭐ G1 —— 圈內逐一過濾 + 「最多幾人」數誰。見 {@link zVictimCondition}。 */
      victimCondition: zVictimCondition,
      maxTargetsCounts: zMaxTargetsCounts,
      /** ⭐ G1 ② —— effect.target-set-chain@1。見 {@link zOnHitTargets}。 */
      onHitTargets: zOnHitTargets,
      runOnEmptyHit: zRunOnEmptyHit,
      onHitTargetsMode: zOnHitTargetsMode,
      /**
       * ⭐ S2（GH#299）—— 與 `damage.resourcePct` **完全同一份 schema、同一個
       * 讀取器**（`sim/effects/dynamicTerms.ts::resourcePctAmount`）。
       * 在此之前只有 `damage` / `dot` 有這一格，於是「對範圍內敵人造成
       * （現存魔力 + AP）×7」的**魔力那一項**被 `.strict()` 拒收，只剩 AP×7 ——
       * 而那份文件看起來完全正常（失敗形態②）。
       */
      resourcePct: zResourcePctTerm.optional(),
    })
    .strict(),
  /**
   * damageLine (18-00 薔薇荊棘之刃) — mirrors the `damageLine` member of
   * `EffectDef`. Both lengths share `damageArea`'s radius ceiling and for the
   * identical reason: the failure being guarded is a raw un-converted w3x
   * `Area` column (200/300/450), which at ~54.5 units per GGD unit would be a
   * lash longer than the entire 24-unit duel zone.
   */
  z
    .object({
      kind: z.literal("damageLine"),
      ...EFFECT_COMMON_SHAPE,
      damageType: zDamageType.optional().describe(
        "傷害型別：吃護甲(physical)、吃魔抗(magic)、什麼都不吃(true)。" +
          "**省略 = 後台「傷害規則」頁的預設**（出貨 magic —— owner 2026-08-05" +
          "「技能傷害預設都改成 AP 傷害」）。⚠️ 它與**係數來源**是兩件事：" +
          "型別決定吃什麼減免，`amount` 的 Scaling(ap/ad/str/agi/int) 決定數字多大。",
      ),
      amount: zScaling,
      /** GGD 單位, 往前的長度。3 個身位 = 3 × 體寬 1.2 = 3.6 */
      length: z.number().positive().max(SPREAD_MAX_RADIUS),
      /** GGD 單位, 鞭子的**寬度** (不是半徑)。一個身位 = 1.2 */
      width: z.number().positive().max(SPREAD_MAX_RADIUS),
      /** 指向: 穿過這次事件的受害者 (預設) 或身體的面向 */
      aim: z.enum(["facing", "target"]).optional(),
      /** 從施法者自己身上出發 (預設 true =「面前」) 還是從受害者身上延伸 */
      fromCaster: z.boolean().optional(),
      maxTargets: z.number().int().min(1).max(SPREAD_MAX_TARGETS).optional(),
      canCrit: z.boolean().optional(),
      /** 觸發這一次的那個人要不要再吃一次 (預設 false —— 他已經吃過普攻了) */
      includeOrigin: z.boolean().optional(),
      /**
       * ⭐ G1 —— 與 `damageArea` **同名同語意**（同一組常數）。
       * ⛔ 兩個 kind 在這一族上是同一個機制的兩個形狀；欄位名一旦分岔，編輯器上
       * 長得一樣的兩格就會是兩件事。
       */
      victimCondition: zVictimCondition,
      maxTargetsCounts: zMaxTargetsCounts,
      onHitTargets: zOnHitTargets,
      runOnEmptyHit: zRunOnEmptyHit,
      /** ⭐ G1 ② —— 見 `damageArea.onHitTargetsMode`。⛔ 同名同語意，不是第二件事。 */
      onHitTargetsMode: zOnHitTargetsMode,
      /** ⭐ S2（GH#299）—— 見 `damageArea.resourcePct`，同一份 schema 同一個讀取器。 */
      resourcePct: zResourcePctTerm.optional(),
    })
    .strict(),
  /**
   * grantAttribute (07-00 獸化心靈) — mirrors the `grantAttribute` member of
   * `EffectDef`.
   *
   * BOTH counters are bounded ON TOP as well as below (CLAUDE.md
   * 「欄位要有上界」). `everyNth` at 1000 is not a slow passive, it is a passive
   * that never fires in a 3-minute round — indistinguishable in play from the
   * feature being broken, which is precisely the class of typo #277 is about.
   * `maxAttribute` is capped where `CONDITION_ABSOLUTE_MAX` caps an attribute
   * comparison, so 「敏捷 < 120」 written as a condition and 「敏捷上限 120」
   * written here cannot disagree about what an attribute may be.
   */
  z
    .object({
      kind: z.literal("grantAttribute"),
      ...EFFECT_COMMON_SHAPE,
      attr: z.enum(["str", "agi", "int"]),
      /**
       * "flat" (預設) = 加 `amount` 點; "pctOfCurrent" = 加「現有屬性 × amount」,
       * 所以 1.0 就是 owner 說的「×2」。這是一個決策點, 不是實作細節 ——
       * 定值在 1 級大得離譜、在 9 級形同沒有。
       */
      mode: z.enum(["flat", "pctOfCurrent"]).optional(),
      /**
       * 每次**發放**的量 (不是每次觸發)。上界 100 對 flat 是「一次加 100 點三圍
       * 一定是打錯」; 對 pctOfCurrent 它是 100 倍, 同樣是 MIS-PARSE 護欄而不是
       * 平衡政策 —— 想要 ×2 就寫 1。
       */
      amount: z.number().positive().max(100),
      /**
       * 缺省 = **永久**(獸化心靈)。有值 = 到期自動收回(龍紋記憶 3 秒)。
       *
       * ⚠️ 下界 0.067 秒不是隨便挑的: `world.tick + Math.round(duration/dt)`
       * 在 dt=1/30 之下, 0.034 秒以下會變成 0 或 1 tick —— **兩個都是空包彈**。
       * 讓它變成存檔錯誤, 而不是一個上線後沒人看得出來為什麼沒作用的欄位。
       */
      durationSec: z.number().min(0.067).max(300).optional(),
      /** 每 N 次觸發才發一次。缺省/1 = 每次。獸化心靈 = 8 */
      everyNth: z.number().int().min(1).max(1000).optional(),
      /** 該屬性 (含成長與本場加成) 到這個值就不再發。獸化心靈 = 120 */
      maxAttribute: z.number().min(0).max(10000).optional(),
      /**
       * `maxAttribute` 量的是**哪一種**三圍 —— 決策點做成欄位 (第一守則),
       * 而且這個軸是**原始地圖自己就有的**, 不是這裡發明的:
       * `GetHeroStatBJ(stat, unit, includeBonuses)` 的第三個參數。
       * 傷害公式一律 `…,true)`(含裝備), 而獸化心靈的隱藏上限寫的是
       * `GetHeroStatBJ(1,GetKillingUnit(),false)`(**不**含裝備)。
       *
       *   · `"base"`(缺省)= 天生 + 成長 + 三選一 + 先前的 grantAttribute。
       *     這是獸化心靈 JASS 量的東西, 也是**保守**的那一個: 帶一把
       *     朗基努斯之槍(敏捷+12)不會偷偷把蒼月潮的天生技提早關掉, 而且與
       *     「道具還不能給三圍」的年代逐位元相同。
       *   · `"total"` = 含裝備, 給未來那種上限本來就該讀「總敏捷」的卡。
       */
      maxAttributeBasis: z.enum(["base", "total"]).optional(),
      /**
       * 點數存到哪裡 —— 決策點做成欄位, 而差別就是「賣掉之後還在不在」。
       *
       *   · `"champion"`(缺省, 與這個欄位出現之前的每一份文件逐位元相同)=
       *     `ChampionComp.attrBonus`, WC3 `ModifyHeroStat`。永久, 而且與造成它
       *     的東西無關 —— 蒼月潮 07-00 獸化心靈是自己打出來的, 那就是他的。
       *   · `"source"` = 記在**觸發這一次的那個來源**身上
       *     (`ModifierSource.attrEarned`)。甘豆腐之袍 godie-i03f「每殺死一名英雄
       *     可以額外獲得 10點智慧，上限 160」—— 道具疊出來的層數屬於道具, 賣掉
       *     袍子 160 點智慧就跟著走。
       *
       * ⚠️ `"source"` 只能掛在 **hook** 上(道具被動 / 靈氣投射的 hook / 增益),
       * 因為記帳的地方就是那個 source。掛在技能自己的 effects 上沒有來源可記,
       * 這時候**拒絕發放**(而不是偷偷改記進 `attrBonus` —— 那會是一個名字寫著
       * 「賣掉就沒」、行為卻是「永久帶著走」的欄位)。
       */
      store: z.enum(["champion", "source"]).optional(),
      /**
       * `store: "source"` 專用 —— **這一個來源自己一共發過多少**的上限, 逐屬性。
       * 甘豆腐之袍的「上限 160」= 16 層 × 10 點。
       *
       * ⚠️ 它**不是** `maxAttribute`。`maxAttribute` 封的是英雄那條三圍的
       * **絕對值**(獸化心靈的「敏捷 < 120」, 含等級成長), 所以掛在一件智慧裝上
       * 會在高等級法師身上直接把第一層就擋掉 —— 一張什麼都不做的卡。這一條只數
       * 這件裝備自己發出去的量。
       *
       * 上界 10000 與 `maxAttribute` 同一個數字, 理由也同一個: 它是 MIS-PARSE
       * 護欄(160 打成 16000), 不是平衡政策。下界 0 之外還有 `.positive()` 的
       * 意義: 0 是一件「疊層」卡片寫著、但第一層就被夾成 0 的裝備 —— 正是這一批
       * 要消滅的「描述承諾了、資料沒有付」。
       */
      maxSourceTotal: z.number().positive().max(10000).optional(),
    })
    .strict(),
  /**
   * revive (天生牙 godie-i031「[復活] 殺死任一個敵方英雄單位，將復活我方所有英雄」)
   * —— mirrors the `revive` member of `EffectDef`.
   *
   * 「我方所有英雄」**不在這裡** —— 那是 hook 的 `target: "allies"` 作用域。這個
   * effect 只回答「站起來的時候是什麼狀態、要不要花額度、可不可以救敵人」。
   * 站起來這件事本身共用 `sim/revive.ts::reviveChampionAt`, 也就是復活圈
   * (#84/#206) 完成時走的同一個函式 —— 不是第二套復活。
   *
   * ⚠️ 兩個比例的上界 **1** 是 MIS-PARSE 護欄, 不是平衡意見: 文案想寫「50%」的人
   * 很容易填 50, 而沒有上界的 50 是「滿血滿魔復活全隊」。下界 0 合法(至少會給
   * 1 點 HP, 見 `reviveChampionAt`), 因為「只留一口氣的復活」是一個真的設計。
   */
  z
    .object({
      kind: z.literal("revive"),
      ...EFFECT_COMMON_SHAPE,
      hpPct: z.number().min(0).max(1).optional(),
      manaPct: z.number().min(0).max(1).optional(),
      side: z.enum(["ally", "any"]).optional(),
      teamCharge: z.enum(["ignore", "requireAndSpend"]).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("heal"),
      ...EFFECT_COMMON_SHAPE,
      amount: zScaling,
      /** ⭐ G11（GH#299）—— 回自己。省略 = target = 今天的行為。 */
      applyTo: zApplyToSelfOrTarget,
    })
    .strict(),
  z
    .object({
      kind: z.literal("shield"),
      ...EFFECT_COMMON_SHAPE,
      amount: zScaling,
      duration: z.number().min(0),
      /**
       * 護盾吸收哪一種傷害 (owner 2026-07-30: 「護盾的確有分吸收所有傷害跟吸收
       * AP 傷害 only」). ABSENT = "all" = 現行行為, 所以既有文件一份都沒有改變
       * 意思;"magic" 就是 owner 說的「只吸 AP 傷害」。
       *
       * 過濾在 combat/damage.ts 的**減傷之後**發生 (跟一直以來同一步), 所以
       * 「650 點護盾」的意思仍然是「擋掉 650 點玩家實際會吃到的傷害」。
       * 不吃這一型的池子對這一發**完全透明**: 不吸收, 也不被消耗。
       * 同一個單位身上有兩種池子時, **先花窄的再花全類型的** —— 理由寫在
       * combat/damage.ts 的 `absorbOrder`。
       */
      absorbs: z.enum(["all", "physical", "magic", "true"]).optional(),
      /**
       * ⭐ GH#299（S1）—— 「[護盾]不會疊加」寫得出來了。
       *
       * 同一個 `stackKey` 的護盾視為**同一片**；缺席 = 每次都是新的一片
       *（2026-08-09 之前的行為，既有內容逐字不變）。合併規則見 `onExisting`。
       * ⛔ 兩格要一起填 —— 只填 `onExisting` 會被拒（見 `refineShieldStack`）。
       */
      stackKey: z.string().min(1).max(48).optional(),
      /**
       * 身上已經有同 key 的一片時怎麼辦。`stackKey` 有填而這格沒填 = `"replace"`。
       *   · `replace`    整片換新（量與到期都用新的）—— 「不會疊加」的字面意思
       *   · `keepLarger` 留量大的那一片，到期取較晚的
       *   · `stack`      量相加，到期取較晚的
       */
      onExisting: z.enum(["replace", "keepLarger", "stack"]).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("applyStatus"),
      ...EFFECT_COMMON_SHAPE,
      statusId: zRef<StatusId>("status-effects", { soft: true }),
      /**
       * ⭐ 層數的**增減**（owner 2026-08-09 / GH#301-5「狀態除了有無也會是數字
       * 層數」＋ GH#304「疊層可能會隨觸發／隨時間 增加**或減少**」）。
       *
       * 省略 = 1 = 今天的行為（「身上有這個狀態」）。⛔ 不是 0 —— 0 層等於沒有，
       * 而一份沒寫這一格的舊文件的意思是「有」。**0 本身被拒絕**：一個什麼都不
       * 做的效果掛在卡片上是失敗形態②。
       *
       * ⭐ **負數 = 減層**（GH#304 軸①②）。這一格是這一批唯一需要的新詞彙：
       *   · 軸①【隨觸發】把這個效果掛在任何一個 `HookEvent` 上
       *     （`onBasicAttack` +1、`onDamageTaken` -1、`onKill` +2…）；
       *   · 軸②【隨時間】掛在 `onInterval` 上，節奏用 `HookDef.internalCooldown`
       *     表達（`internalCooldown: 3` 就是「每 3 秒」）。
       * ⛔ 兩條軸都**沒有**新的引擎機制，這是刻意的：`IntervalHookSystem` 決策 1
       * 已經拒絕過「第二個冷卻概念」，而 `sim/marks.ts` 檔頭⑤說明了為什麼在
       * `MarkSpec` 上開一格 `decayEverySec` 會多出一支沒有人呼叫的掃描器。
       *
       * ⚠️ 減層**不會**憑空建立一筆狀態（身上沒有 = 什麼都不做），也**不會**
       * 把到期時間往後推 —— 見 `refresh`。
       *
       * 界共用 `sim/markLimits.ts` 的 `MARK_MAX_COUNT`（±999，擋「12 打成 120」
       * 那種多一個零），⛔ 不抄字面值：那已經是這個 repo 對「一個計數器最多幾層」
       * 的答案，抄第二份就是第四個住處。
       */
      stacks: z
        .number()
        .int()
        .min(-MARK_MAX_COUNT)
        .max(MARK_MAX_COUNT)
        .refine((n) => n !== 0, {
          message: "stacks 不可以是 0 —— 一個不動任何層數的效果在卡片上看得到、在遊戲裡什麼都不會發生",
        })
        .optional(),
      /**
       * 重複施加時**要不要把到期時間往後推**。省略 = `"extend"` = 這一格出現
       * 之前的行為（`Math.max(舊到期, 新到期)`）。
       *
       * ⭐ 它是 GH#304 軸②的必要條件，不是選配：一個掛在 `onInterval` 上、
       * 每 3 秒 +1 層的計數器如果每次都續期，那筆狀態就**永遠不會到期** ——
       * 「20 秒內疊到 5 層」會變成「永久 5 層」，而畫面上完全看不出差別
       *（失敗形態②）。`"keep"` 讓層數與窗口變成兩件獨立的事。
       *
       * ⚠️ 減層（`stacks < 0`）**一律**當作 `"keep"`，不管這一格填什麼：
       * 「扣一層」不是「重新施加」，而一個會延長減益的減益是沒有人要的東西。
       */
      refresh: z.enum(["extend", "keep"]).optional(),
      /**
       * 這個狀態掛多久(秒)。**兩端都有界**(CLAUDE.md「欄位要有上界」/ #277) ——
       * 這一格在 2026-08-01 之前只有 `.min(0)`,也就是完全沒有上界,而 owner 當天
       * 剛好給了殺豬刀一個 0.3 秒的控場,所以它是最需要護欄的那一格。
       *
       * · 下界 0.034 = 30 Hz 的一個 tick。`applyStatus` 算的是
       *   `world.tick + Math.round(duration / world.dt)`,所以任何小於半 tick 的
       *   數字會 round 成 **0 tick** —— 狀態掛上去的同一瞬間就過期,玩家永遠拿不到
       *   (失敗形態 ②)。這不是理論:出貨最短的一格正是 0.034(血染八月
       *   `godie-i06o` 的 fang-stun),下界因此貼著它而不是憑空挑的。
       * · 上界分兩層（⭐ 2026-08-09 / GH#299 第 1 條改的）：
       *   **硬控** ≤ {@link HARD_CC_MAX_DURATION_SEC}（20 秒，逐字是舊的那個數字），
       *   其餘 ≤ {@link STATUS_MAX_DURATION_SEC}（60 秒）。
       *
       *   ⛔ 在此之前**一個數字管兩件事**，而「一個 30 秒的暈眩等於那個人這一場
       *   不用玩了」這句話**只對硬控成立** —— 它被套在每一種狀態上，於是一個
       *   24 秒的**計數視窗**（不動控制、不動數值，只是「這段時間內」）也被擋下來，
       *   而那正是 GH#299 量到的 7 支之一。放寬與收緊在這一次是同一件事：
       *   一般上界抬到 60，硬控那一格的護欄一格都沒動（見下面的 `superRefine`）。
       *
       *   它擋的仍然是**小數點打錯一位**：0.3 打成 3 沒有任何界擋得住（那是一個
       *   合法的設計值），但 0.3 打成 30 的**暈眩**、20 打成 200 的任何狀態，
       *   都會在 `pnpm content:build` 當場被擋下並指名檔案與欄位。
       *
       * ⭐ 逐階（GH#299 第 2 條）：填陣列 = 一階一格。見 {@link zRankScalar}。
       */
      duration: zRankScalar(z.number().min(0.034).max(STATUS_MAX_DURATION_SEC)),
      /** "self" puts it on the CASTER (combo windows); default "target" */
      applyTo: z.enum(["self", "target"]).optional(),
      /**
       * 移速倍率。1 = 不動，0.5 = 減速一半。
       *
       * ⭐ 2026-08-09（GH#299 第 1 條）：下界從 `.positive()`（> 0）改成 **0**。
       * `0 = 完全不能動`，而在此之前它**寫不出來** —— 唯一的替代品是 `root: true`，
       * 但那兩件事在引擎裡不一樣：`root` 是一筆**硬控**（吃免控、進 `ccAppliedTicks`
       * 戰績、被【淨化】的規則管），而「速度歸零」是一個純數值減益（例如「泥沼」
       * 這種可以被位移技掙脫的東西）。把它們折成同一格會讓免控對其中一個有效、
       * 對另一個無效，而畫面上看不出來。
       *
       * ⚠️ 上界仍然刻意沒有：加速也走這一格（`1.3` 的加速與 `0.7` 的減速在結構上
       * 長得一模一樣，見 `sim/components.ts`），而加速的天花板由 `Stat.MoveSpeed`
       * 的 `STAT_CLAMPS`／`config.stat-caps@1` 管，不是這裡。
       *
       * ⭐ 逐階（GH#299 第 2 條）：填陣列 = 一階一格。
       */
      moveSpeedMult: zRankScalar(z.number().min(0)).optional(),
      root: z.boolean().optional(),
      stun: z.boolean().optional(),
      /**
       * 失手率 (WC3 `Acrs` 詛咒) — 0..1, the chance a BASIC ATTACK made BY the
       * unit carrying this status misses. Bounded on BOTH ends (CLAUDE.md
       * 「欄位要有上界」): a ratio typed as 33 instead of 0.33 would otherwise
       * mean "every swing, forever" and read in-game as the champion being
       * unable to attack at all.
       *
       * Shipped user: 66-00 恐懼 (godie-e00t) at 0.33 — Blizzard's own
       * `Acrs.DataA1`, which the map's `A0IF` does not override.
       */
      missChance: zRankScalar(z.number().min(0).max(1)).optional(),
      /**
       * 暴走 —— 「不可控制並自動尋敵」(59-00 初號機). While this status is live
       * the SEAT's own orders are dropped on the floor and the body auto-seeks:
       * see `sim/berserk.ts` for the whole model and for why it is a status
       * flag beside `root`/`stun` rather than a fourth CC or a new stat.
       *
       * ⚠️ NOT a CC and deliberately so: it is a **self-buff with a downside**,
       * and `refusesControl` therefore does NOT block it. A 魔法免疫 buff must
       * not make your own berserk refuse to land on you.
       */
      berserk: z.boolean().optional(),
      /**
       * 恐懼 —— 「嚇到轉頭就跑」。`berserk` 的**鏡像**：一樣丟掉座位的指令，
       * 但身體自己**遠離**此刻最近的敵人，而且**不攻擊**。
       * 整個模型與三個決策點寫在 `sim/fear.ts`。
       *
       * 出貨用戶（owner 2026-08-08 文案）：89-002 俄羅斯輪盤 2 秒 ·
       * 52-02 蹂躪編年史 3 秒 · 52-002 射殺百頭 3 秒；52-04 巨神一擊**讀**它。
       *
       * ⚠️ 它**是** CC，與 `berserk` 相反 —— 敵人施加的純減益，所以
       * `refusesControl`（免控）會拒絕它並發 `immuneControl`。
       *
       * ⚠️ 它只管**腳**，不管手上的技能。要做成「連技能都放不出來」的恐懼，
       * 配 `silenced: true` 一起寫（與 C2 混亂 `{berserk, targetsAllies}` 同一個
       * 先例）—— 「不能施法」在這個引擎裡只有 `silenced` 一個住處，多開第二個
       * 布林就等於讓免控對其中一個有效、對另一個無效而沒有人會發現。
       */
      feared: z.boolean().optional(),
      /**
       * C4 睡眠（#278）—— 受傷即提早解除**這一筆**。
       * ⛔ 只拔標了它的那一筆；身上的其他 status 一格不動。
       */
      /** 【沉默】C1（#278）。不能施放技能,但**可以走、可以普攻** —— 與暈眩不同。 */
      silenced: z.boolean().optional(),
      /**
       * ⭐【繳械】S8（92-01「無法移動與攻擊」的攻擊那一半）。
       * ⛔ 它**不是** `missChance` 的包裝：實測 `missChance:1` 的人照樣揮刀
       *（動畫、音效、破隱、攻擊冷卻全部照跑），只是傷害 0。「揮空刀」與
       * 「揮不出來」在畫面與聽覺上是兩件事。
       * ⚠️ 它在 {@link HARD_CC_FLAGS} 裡，所以吃較嚴的硬控秒數上界。
       */
      disarmed: z
        .boolean()
        .optional()
        .describe(
          "【繳械】打不出普通攻擊（連前搖都開不了）。⛔ 不擋技能 —— 要連技能一起封請同時勾【沉默】。" +
            "要做「打得到人但會失手」請改用失手率，那是另一件事。",
        ),
      /**
       * 【混亂】C2（#278）。⚠️ **要配 `berserk: true` 一起寫**：
       * `berserk` 負責「丟掉玩家的指令 + 自動尋敵」，這一格只多開「不分敵我」。
       * 單獨填它等於什麼都不會發生（人還是聽玩家的）。
       */
      targetsAllies: z.boolean().optional(),
      breakOnDamage: z.boolean().optional(),
      /**
       * 打醒門檻：這一發實際扣掉的傷害要 ≥ 它。省略 = 0 = 任何傷害都醒。
       * 上界 5000 ≈ 一個滿裝英雄的血量：再高就等於「打不醒」，
       * 而那應該用 `breakOnDamage: false` 表達，不是一個假裝有門檻的數字。
       */
      breakOnDamageMin: z.number().min(0).max(5000).optional(),
      /**
       * 【重創】A6（#278）。三格**獨立**，各自 0–1（0 = 完全禁掉，1 = 不打折）。
       * ⛔ 上界是 1：重創**只會**變弱不會變強。要做「治療加成」是另一個機制
       *（走 modifier），把它塞進同一格會讓一張卡同時是重創與增益。
       */
      healingTakenMult: z.number().min(0).max(1).optional(),
      lifestealMult: z.number().min(0).max(1).optional(),
      regenMult: z.number().min(0).max(1).optional(),
      /**
       * A4（#278 / GH#295）—— 這一筆狀態**可不可以被【淨化】拔掉**。
       *
       * 三值語意是刻意的：`true` / `false` / **省略**。省略 = 讀後台
       * `config.dispel@1` 的 `statusDefaultDispellable`（出貨 **true**）——
       * 「作者明講不可驅散」與「作者沒想過這件事」是兩種不同的狀態，而後者的
       * 答案應該是一個操作者調得到的全域預設，不是寫死在文件裡。
       *
       * ⚠️ 回合重置與復活**不看這一格**（`clearForFreshBody` 傳
       * `requireDispellable: false`）—— 那不是淨化，是重置：一個標了不可驅散的
       * 減速也不可以跨過墳墓活下來。
       */
      dispellable: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("applyBuff"),
      ...EFFECT_COMMON_SHAPE,
      modifiers: z.array(zStatModifier),
      /**
       * 持續秒數。⭐ S4a 之後是**選填**，與 {@link permanent} **互斥且必填其一**
       *（`refineApplyBuff` 兩個方向都關死）。
       * ⛔ 「省略 duration」本身**不等於**永久：那會讓一個打字漏填變成一份靜默的
       * 永久增益。既有 240 份文件全部帶數字，所以放寬對它們是嚴格的 no-op。
       */
      duration: z.number().min(0).optional(),
      /**
       * ⭐ S4a —— **永久**（80-00 / 92-03「永久 +1 AP」）。
       *
       * 引擎層從第一天就做得到（`ModifierSource.expiresAtTick` 缺席 = 永久），
       * 缺的一直是這一格 —— 於是出貨已經有四份文件用 `duration: 99999` 假裝永久。
       * 預設語意是**整場**；⭐ GH#354 / G3 之後可以用 {@link permanentScope}
       * 改成「只到這一回合結束」。
       */
      permanent: z
        .boolean()
        .optional()
        .describe("永久生效（不會到期）。勾了就不要填持續秒數，兩者只能填一格。"),
      /**
       * ⭐ GH#354 / G3 —— 這份**永久**增益的永久到哪裡為止。
       *
       * 省略 = `"match"` = 整場 = 今天（既有的每一份 `permanent` 逐位元不變）。
       *
       * owner 2026-08-17 的 20 件 [EX解放] 裡有 5 件寫著「本回合內」而**沒有秒數**
       *（#52 王者之財 · #55 噬魂 · #62 破界 · #63 重力劍 · #68 終焉）。在這一格之前
       * 那一族只能二選一：填一個猜的秒數（回合長度是相位機決定的 ——
       * `combatMaxTicksForRound` 決賽 180 秒而平時 100 秒，火圈提前收場更是常態，
       * 所以猜長了跨進下一回合、猜短了在回合中途無聲消失），或填 `permanent` 讓它
       * **整場**留著（＝ 一件本來只有一回合的寶具變成滾雪球）。
       *
       * ⛔ 這一格**不是**「幫你算一個到期秒數」—— 引擎端記的是一個旗標，
       * 拆除點是 host 的回合開始（`sim/clearPools.ts::clearRoundScoped`）。
       * 把事件寫成數字正是上面那兩種失敗的來源。
       */
      permanentScope: z
        .enum(["match", "round"])
        .optional()
        .describe(
          "「永久」有多久：match（預設，整場都在）或 round（只到這一回合結束，" +
            "下一回合開打前會被拿掉）。⛔ 只有勾了「永久」才填得了。",
        ),
      /**
       * ⭐ G10 —— 這份增益**同時是一個具名標記**（52-01 的〔狂怒〕、破甲、破魔）。
       *
       * 省略 = 不是任何標記 = 今天。⭐ 它把「標記」與「數值」變成同一個物件，所以
       * 兩本帳不可能再腐爛：延長改的就是這一份來源的到期 tick（實測缺陷：buff 延長
       * 到 573 而 status 停在 361，於是讀〔狂怒〕的那個閘在玩家還在狂怒中就關了）。
       * ⛔ 因此**不需要**再開一格 `extendBuff.statusId` —— 那是替同一個問題做第二套機制。
       */
      statusId: zRef<StatusId>("status-effects", { soft: true })
        .optional()
        .describe(
          "讓這份增益同時掛上一個具名狀態（讓別的技能問得到「他身上有沒有〔狂怒〕」）。" +
            "⭐ 它與數值是**同一份**來源：延長／淨化／到期會一起發生，不會出現" +
            "「圖示還在但條件已經讀不到」。",
        ),
      /** ⭐ S9b —— 落在誰身上。省略 = target（＝今天）。見 {@link zApplyToSelfOrTarget}。 */
      applyTo: zApplyToSelfOrTarget,
      /**
       * ⭐ G5（state.exclusive-group@1）—— 這份增益屬於哪一個**互斥組**。
       *
       * 省略 = 不互斥 = 今天（實測：三份形態 buff 同時掛著，乘區逐位元等於 1.4³）。
       * ⚠️ `stackKey` **不是**這題的答案：實測同 key 的第二發會把 modifiers
       * **整組丟掉**，只把層數加一。
       */
      exclusiveGroup: z
        .string()
        .min(1)
        .max(48)
        .optional()
        .describe(
          "互斥組名：身上同一組只會有一份（15-02/03/04 那種「永遠只有一種戰型」）。" +
            "⛔ 它只管屬性狀態，不換 3D 模型 —— 換身體仍然是變身那條路。",
        ),
      /**
       * ⭐ G5 —— 同組已經有一份時怎麼辦。省略 = `"replace"`（抄
       * `shield.onExisting` 的預設）。⚠️ 沒有 `exclusiveGroup` 卻填了它 =
       * PARSE ERROR（同一條規矩、同一個訊息形狀）。
       */
      exclusiveOnExisting: z
        .enum(["replace", "reject"])
        .optional()
        .describe(
          "同一個互斥組已經有一份時：replace（預設，新的接手）或 reject（新的不生效）。",
        ),
      /**
       * ⭐ S4b —— 這條加成加到某個**絕對值**就停（80-00「上限到 10」那一族）。
       *
       * 整格省略 = 沒有絕對上限 = 今天（實測：同一個 stackKey 疊 21 次 +1 攻擊距離，
       * 11 一路長到 32，沒有任何東西攔它）。
       *
       * ⛔ 為什麼既有的四個都不是答案：
       *   · `maxStacks` 數的是**層數**，而層數→屬性的換算依賴基礎值，逐英雄不同；
       *   · `ModOp.CapRaise` 只把 `effectiveCap` **抬高**（是 max 不是 min，語意相反）；
       *   · `grantAttribute.maxAttribute` 只走 attributes 那條路、只給三圍；
       *   · `STAT_CLAMPS` / `config.stat-caps@1` 是**全域**天花板，不是「這一份增益的」。
       *
       * ⭐ `basis` 是第一守則的決策點：「上限到 10」有兩種都合理的讀法。
       *   · `final`（預設）—— 讀玩家面板上那個最終值（#125「顯示的就是拿到的」）。
       *   · `thisSource` —— 只管這一份 `stackKey` 來源自己貢獻了多少
       *     （「這個 buff 最多加 +10」）。一個基礎攻擊距離已經 11 的英雄在 `final`
       *     讀法下永遠疊不上第一層 —— 對某些卡是對的，對某些卡是荒謬的。
       * ⛔ 不做第三個值：同義詞是最貴的技術債。
       *
       * ⚠️ 語意是**只 refuse、不回收也不夾取**（逐字沿用
       * `grantAttribute.maxAttribute` 的既有先例），所以最後一層可能小幅越線。
       * ⚠️ `basis:"final"` 讀的是 clamp **之後**的值，所以 value 高過 `STAT_CLAMPS` /
       * `config.stat-caps@1` 上界的設定永遠不會咬到 —— 不是缺陷，是兩個天花板取低。
       */
      maxStat: z
        .object({
          stat: zStat,
          /** 兩端都有界；上界是打錯數字的護欄，見 `kindLimits.STAT_CEILING_MAX`。 */
          value: z.number().min(0).max(STAT_CEILING_MAX),
          basis: z.enum(["final", "thisSource"]).optional(),
        })
        .strict()
        .optional()
        .describe(
          "這條加成加到某個絕對值就停（「攻擊距離上限 10」）。basis 決定那個數字" +
            "比的是誰：final（預設＝角色面板上的最終值）或 thisSource（只算這一份" +
            "增益自己疊出來的量，需要 stackKey）。⚠️ 它只**拒絕**再疊，不會把已經" +
            "疊上去的收回來，所以最後一層可能小幅越線。",
        ),
      /** rank-indexed override (index rank-1, clamped) — WC3 buff columns are per level */
      perRank: z
        .array(
          z
            .object({
              modifiers: z.array(zStatModifier),
              /** ⭐ S4a：`permanent` 時整份不填秒數，所以這一格也要是選填。 */
              duration: z.number().min(0).optional(),
            })
            .strict(),
        )
        .min(1)
        .optional(),
      /**
       * #244 — STACK instead of attaching a fresh source per application. All
       * applications carrying the same key share one source `buff:stack:<key>`
       * whose `stacks` counter the stat pipeline already multiplies by.
       */
      stackKey: z.string().min(1).optional(),
      /** #244 — hard ceiling on the stack count (absent = unbounded) */
      maxStacks: z.number().int().min(1).optional(),
      /** #244 — this stack drives the client's growth-tier flags (see snapshot) */
      stackVisual: z.boolean().optional(),
      /**
       * TEMPORARY PROCS granted by this buff. `z.lazy` because `zHookDef` is
       * declared below this union and a hook's `effects` are `zEffectDef` — the
       * same knot `spawnProjectile.onHit` already ties.
       *
       * See the `hooks` member of `sim/effects/effect.ts`: the source-level
       * field has always existed, this is the first way to attach one with a
       * DEADLINE. Expiry is the buff's own `expiresAtTick`, so a proc granted
       * here cannot outlive the buff that granted it.
       */
      hooks: z.array(z.lazy(() => zHookDef)).optional(),
      /**
       * A4（#278 / GH#295）—— 這一份增益**可不可以被【淨化】拔掉**。
       *
       * 省略 = 讀後台 `config.dispel@1` 的 `buffDefaultDispellable`，而出貨值是
       * **false**（「沒有人預期自己買的裝備效果可以被敵人剝掉 —— 打開它是一個
       * 設計決定，不是一個預設值」）。所以在出貨設定下，**只有明確填 `true` 的
       * 來源拔得走**：這一格就是那個「打開它」的動作。
       *
       * ⚠️ GH#295 之前這一格**不存在**，於是 `dispel.pools.buffs` 是一個死開關：
       * 兩道閘相乘為零（預設 false × 沒有任何 authoring 欄位能標 true）。
       */
      dispellable: z.boolean().optional(),
      /**
       * A4（#278 / GH#295）—— 這一份來源是**增益還是減益**（`dispel.polarity`
       * 的過濾讀它）。
       *
       * ⛔ 不可以事後推導：一個來源可以同時帶 `{ms,+0.3}` 與 `{armor,-0.5}`，
       * 任何「看修飾詞猜極性」的啟發式都會在某一張卡上錯，而且從編輯器修不掉。
       *
       * ⚠️ 省略 = 沒有極性，而**有方向的淨化拔不到沒有極性的來源**
       *（`clearPools.polarityPasses`：「不知道」不當成「是」）。也就是說要讓一發
       * 「淨化敵方增益」（`polarity: "buff"`）拔得到它，`dispellable: true` 與
       * `polarity: "buff"` **兩格都要填**。
       */
      polarity: z.enum(["buff", "debuff"]).optional(),
      /**
       * ⭐ **限時授予格擋 / 暴擊來源**（owner #299 第 2 · 6 條）。
       *
       * 在這一格之前，`block` 只掛得到道具與天生技被動、`critStrike` 只掛得到
       * 道具 —— 所以「接下來 5 秒內格擋」與「這支大招期間 20% 機率 3 倍暴擊」
       * **完全沒有形狀**，而那正是 owner 說「授權格要放寬」的那一格。
       *
       * ⭐ 它同時也是**主動技能**那一格的答案：Q/W/E/R/EX 的效果清單裡不需要
       * 一個 `kind: "block"`，因為「暫時獲得格擋」本來就是一份增益。
       * ⛔ 開一個新的 effect kind 才是錯的形狀 —— 那會變成第二套格擋。
       *
       * 到期由這份增益自己的 `expiresAtTick` 管：`blockCutFor` 與
       * `rankedGrants` 都已經在跳過過期的 source，所以這裡**沒有第二個時鐘**。
       * ⚠️ 內部冷卻的記帳（`blockLastFired`）住在 source 實例上，而每一次施放
       * 都是一份新的 source，所以掛在這裡的 `internalCooldown` 讀作
       * 「這一次施放最多擋幾次」——與 `hooks` 那一格的 `internalCooldown`
       * 逐字相同的語意，不是全域冷卻。
       */
      ...SOURCE_GRANT_SHAPE,
    })
    .strict(),
  /**
   * cycleBuff — 輪替增益. See the `cycleBuff` member of `sim/effects/effect.ts`
   * for the model and `sim/effects/cycleBuff.ts` for why the rotation index is
   * DERIVED from absolute expiry ticks rather than kept in a counter.
   *
   * Both ends bounded, as always: `.min(2)` because a one-step "rotation" is
   * just `applyBuff` wearing a costume and authoring it here would hide a plain
   * buff behind a mechanic nobody would think to look at, and
   * `.max(CYCLE_BUFF_MAX_STEPS)` because every step is a live ModifierSource on
   * a rotating body.
   */
  z
    .object({
      kind: z.literal("cycleBuff"),
      ...EFFECT_COMMON_SHAPE,
      /** namespace for the step source ids — two rings on one body must differ */
      cycleKey: z.string().min(1).max(48),
      applyTo: z.enum(["self", "target"]).optional(),
      steps: z
        .array(
          z
            .object({
              modifiers: z.array(zStatModifier).min(1),
              /**
               * ⚠️ FLOOR IS 0.067 s, NOT 0. `applyStatus`/`applyBuff` convert with
               * `Math.round(duration / dt)` at dt = 1/30, so anything at or under
               * 0.034 s rounds to 0 or 1 tick — both of which are blanks the
               * author cannot tell apart from a working buff. 0.067 s is the
               * shortest window the sim can actually deliver, the same floor
               * `tpl-teleport.travelSec` documents.
               */
              duration: z.number().min(0.067).max(60),
            })
            .strict(),
        )
        .min(2)
        .max(CYCLE_BUFF_MAX_STEPS),
    })
    .strict(),
  z
    .object({
      kind: z.literal("restore"),
      ...EFFECT_COMMON_SHAPE,
      /** 0..1 of the TARGET's max health (WC3 SetUnitLifePercentBJ). ⭐ 逐階可填陣列。 */
      healthPct: zRankScalar(z.number().min(0).max(1)).optional(),
      /** 0..1 of the TARGET's max mana (WC3 SetUnitManaPercentBJ). ⭐ 逐階可填陣列。 */
      manaPct: zRankScalar(z.number().min(0).max(1)).optional(),
      /**
       * ⭐ G11（GH#299）—— 回誰身上。省略 = `"target"` = 今天的行為。
       * 「回自己」在此之前只能靠 `randomArea{who:"self"}` 包一層繞過去。
       */
      applyTo: z.enum(["self", "target"]).optional(),
    })
    .strict(),
  /**
   * spendMana (20-01 風王結界 的法球扣魔) — mirrors the `spendMana` member of
   * `EffectDef`. See sim/effects/spendMana.ts for why it is not `manaCost` and
   * why it carries no threshold of its own.
   *
   * 上下界, not just a floor: `pctMaxMana` is a RATIO like `chance` and
   * `Stat.Lifesteal`, so 30 typed instead of 0.30 has to be a FORM ERROR rather
   * than an effect that empties the pool 30× over (#277 的形態).
   */
  z
    .object({
      kind: z.literal("spendMana"),
      ...EFFECT_COMMON_SHAPE,
      amount: zScaling,
      pctMaxMana: z.number().min(0).max(1).optional(),
      /**
       * 付款人**現存**法力的一個比例,加在 `amount` 與 `pctMaxMana` 之上 ——
       * 熾天使之弓 godie-i012「每次削去敵方英雄現存 MP 3%」(owner 2026-08-01 裁定
       * 5%→3%)。ABSENT = 0。
       * 為什麼是第二個欄位而不是給 `pctMaxMana` 加一個 `basis`:名字寫著 Max
       * 的欄位不可以有時候是 current(見 sim/effects/effect.ts 的說明)。
       */
      pctCurrentMana: z.number().min(0).max(1).optional(),
      applyTo: z.enum(["self", "target"]).optional(),
      /**
       * 存下這一次**實際扣掉的**法力,給稍後的 `damage.bankedBonus` 讀。
       * ABSENT = 不存。`durationSec` 應該等於那張卡的效果視窗(絕。暗殺奧義是
       * 5 秒),上界跟 `applyBuff.duration` 同級 —— 一筆存款活得比視窗久,
       * 就會讓下一次不相干的攻擊莫名其妙變痛。
       */
      bankAs: z
        .object({
          statusId: zRef<StatusId>("status-effects", { soft: true }),
          durationSec: z.number().positive().max(BANKED_LIFE_MAX_SEC),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("dash"),
      ...EFFECT_COMMON_SHAPE,
      mode: z.enum(["forward", "toPoint"]),
      /**
       * u/s。⚠️ 這個上界是 **MIS-PARSE 護欄**（w3x 的 1000 貼進來），⛔ 不是安全上限 ——
       * 真正的天花板是註冊期推導的 `maxSpeed`（`content/displacementTiers.ts`），
       * 因為穿牆門檻吃的是 config 裡的身體半徑，不可能是一個靜態的 Zod 數字。
       * 填高於天花板的值不會壞，只是會被夾掉（GH#318）。
       */
      speed: z
        .number()
        .min(DISPLACEMENT_SPEED_MIN)
        .max(DISPLACEMENT_AUTHORED_SPEED_MAX)
        .describe("衝刺速度（GGD 單位/秒）。⚠️ 上線時會被安全上限夾住；收招時間 = 距離 ÷ 速度。"),
      /**
       * ⚠️ **固定發射長度，不是施法距離。** `mode:"toPoint"` 只用點算**方向**，
       * `remaining` 一律是這一格（`sim/systems/MovementSystem.ts` 的 `startDash`）——
       * 點在腳邊也照樣衝滿。上界 24 = 決鬥區半徑，理由見 `displacementTiers.ts`。
       */
      maxDistance: z
        .number()
        .positive()
        .max(DISPLACEMENT_TRAVEL_DISTANCE_MAX)
        .describe(
          "衝刺的**固定發射長度**（GGD 單位）——⚠️ 不是施法距離：指定地點只決定方向，距離永遠是這一格。",
        ),
      /**
       * ⭐ 位移級別（GH#318）。填了它就不要填 `speed` / `maxDistance` ——
       * 註冊時由 `config.displacement-tiers@1` 的 **travel** 梯翻成兩個數字，
       * 兩者都填則**級別贏**（同 `radiusTier`：讓手寫值蓋過級別 = 這個機制對那支
       * 技能靜默不存在）。唯一的查表處：`content/displacementTiers.ts`。
       */
      distanceTier: zDisplacementTier
        .optional()
        .describe(
          "位移級別（小/中/大/極大）。填了就不用填速度與距離 —— 兩個數字由後台「位移級距」頁統一給。",
        ),
      /**
       * ⭐ S7 —— **衝刺結束那一刻**才跑的一段（52-04「向前衝刺 400 距離後揮出」）。
       * 省略 = 沒有回呼 = 今天，一個 tick 都不差（出貨 29 份帶 dash 的文件全部缺席）。
       *
       * ⚠️ 沒有它的話那一刀是從**起點**揮的：實測 `[dash, damageArea]` 寫在同一個
       * `effects[]` 裡，受害者掉血與「完全不放那個 AoE」**逐字相同**（43.47），
       * 而同一個 AoE 從終點放是 199.83。原因是順序：effect 在 slot 2b/3 跑完，
       * 位移在 slot 5 才發生。
       *
       * `z.lazy` 的理由與 `leap.onLand` 逐字相同（遞迴結）。
       */
      onEnd: z
        .array(z.lazy(() => zEffectDef))
        .min(1)
        .max(DASH_ON_END_MAX_EFFECTS)
        .optional()
        .describe(
          "衝刺**結束之後**才跑的效果（「衝刺後揮出」）。留空＝只有位移。" +
            "⚠️ 寫在這裡的範圍傷害圓心是**終點**；寫在外面的效果圓心是起點。",
        ),
      /**
       * ⭐ S7 —— 被牆擋下來的衝刺算不算「衝完」。省略 = `"always"`。
       * ⚠️ 這是一個真的岔路：位移系統今天把「撞牆停下」與「跑完距離」合成**同一個**
       * 結束條件。預設選 always，因為卡面說「衝刺後揮出」，而一刀被場景取消是玩家
       * 看不見的失敗。
       */
      onEndOn: z
        .enum(["always", "completed"])
        .optional()
        .describe(
          "被地形擋下來的衝刺算不算衝完：always（預設，照樣揮出）或 completed（只有跑完距離才揮）。",
        ),
      /** ⭐ S7 —— 衝刺途中死掉還要不要揮。省略 = false（同 randomArea 的同名欄位）。 */
      onEndWhenDead: z
        .boolean()
        .optional()
        .describe("衝刺途中陣亡還要不要跑結束效果。留空＝不跑。"),
    })
    .strict(),
  /**
   * leap (task #247) — mirrors the `leap` member of `EffectDef`. Ported from
   * the map's own parabola (see sim/movement/leap.ts); `apexHeight`/`landRadius`
   * arrive here in GGD units, converted from the JASS wc3 values by `toLen`
   * inside the template expander, so there is no second conversion constant.
   */
  z
    .object({
      kind: z.literal("leap"),
      ...EFFECT_COMMON_SHAPE,
      applyTo: z.enum(["self", "target"]).optional(),
      mode: z.enum(["toPoint", "inPlace"]),
      apexHeight: z.number().min(0),
      durationSec: z.number().positive(),
      throwDistance: z.number().min(0).optional(),
      /** yank the flyer to the caster before the throw (j:51755-51767) */
      dragToCaster: z.boolean().optional(),
      landRadius: z.number().min(0).optional(),
      onLand: z.array(z.lazy(() => zEffectDef)).optional(),
    })
    .strict(),
  /**
   * ⭐ blink — **真瞬移**（owner 2026-08-09 / GH#301-2），mirrors the `blink`
   * member of `EffectDef`。為什麼它不是 `leap` 的一個選項、`templates/expand.ts`
   * 那句「deliberately was not added」為什麼被推翻、三個 `to` 值各對應哪幾支
   * JASS 技能 —— 全部寫在 `sim/effects/effect.ts`，⛔ 不在這裡重複一份。
   */
  z
    .object({
      kind: z.literal("blink"),
      ...EFFECT_COMMON_SHAPE,
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`（守衛 `newKindShape.test.ts`）。 */
      shape: z.enum(["single", "circle"]).describe(
        "誰被瞬移：single＝一個身體（施法者或這次的目標）；circle＝半徑內的一群（集結隊友）。",
      ),
      /**
       * `shape:"circle"` 的半徑，GGD 單位。上界 40 與 `extendBuff` 的圓一致
       *（決鬥區半徑 24，40 蓋得住任何合理的集結範圍而擋得住漏換算的 wc3 數字）。
       */
      radius: z.number().positive().max(40).optional(),
      /** ⭐ AoE 級別（owner 2026-08-11「原則上不寫範圍數字」）。填了它就不要填
       *  `radius` —— 註冊時由 `config.aoe-tiers@1` 翻成半徑，兩者都填則**級別贏**。
       *  唯一的查表處：`content/aoeTiers.ts` 的 `resolveRadiusTier`。 */
      radiusTier: zAoeTier.optional(),
      side: z.enum(["allies", "enemies"]).optional(),
      maxTargets: z.number().int().positive().max(24).optional(),
      to: z
        .enum(["point", "targetUnit", "caster"])
        .describe("目的地：指定的地點 / 目標身上 / 集結到施法者身邊。"),
      applyTo: z.enum(["self", "target"]).optional(),
      /**
       * 落在目的地前面多少單位（27-04 飛燕閃在 JASS 裡落在目標前 150 wc3 ≈
       * 2.75 GGD）。省略 = 0 = 正好落在目的地。
       * 上界 20 與 `KB_MAX_DISTANCE` 同一個理由：大於任何真實值、小於決鬥區半徑
       * 的兩倍，所以「150」直接貼進來（沒換算）會被擋在門外。
       */
      stopShortUnits: z.number().min(0).max(20).optional(),
      /** 抵達之後**同一個 tick**執行的效果。⛔ 這裡沒有 `arriveRadius`，理由見 sim 端。 */
      onArrive: z.array(z.lazy(() => zEffectDef)).optional(),
    })
    .strict(),
  /**
   * championForm (task #249) — mirrors the `championForm` member of
   * `EffectDef`. There is deliberately NO champion-id field to validate: the
   * counterpart body is read from the champion doc's own
   * `transform.counterpartId` (already a hard `zRef<ChampionId>("champions")`
   * in schema/champion.ts), so the reference is checked exactly once, where the
   * w3x actually declares it, and an ability doc cannot name a body that its
   * hero has no link to.
   */
  z
    .object({
      kind: z.literal("championForm"),
      ...EFFECT_COMMON_SHAPE,
      /** "alternate"/"base" force a direction; "toggle" is the w3x 風王結界/紮根 form */
      to: z.enum(["alternate", "base", "toggle"]),
      /**
       * w3a `ahdu` at the cast rank; ABSENT = never times out (the toggles).
       *
       * ⭐ G2（GH#299）—— 逐階可以是陣列。w3a 的 `ahdu` 本來就是**一階一格**，
       * 而在此之前這裡只收一個數字，於是 77-03 出現「rank 4 的加速活 15 秒、
       * 翅膀只有 6 秒」這種兩半各走各的。
       */
      durationSec: zRankScalar(z.number().positive()).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("spawnProjectile"),
      ...EFFECT_COMMON_SHAPE,
      projectileId: zRef<ProjectileId>("projectiles"),
      onHit: z.array(z.lazy(() => zEffectDef)),
    })
    .strict(),
  z
    .object({
      kind: z.literal("spawnVfx"),
      ...EFFECT_COMMON_SHAPE,
      /** vfx@1 doc id (SOFT ref — the doc may be imported/authored later). */
      vfxId: zRef("vfx", { soft: true }),
      /** where the one-shot plays: caster (default), first target, or the cast point. */
      at: z.enum(["self", "target", "point"]).optional(),
      /** seconds a continuous doc keeps emitting (client hint; optional). */
      durationSec: z.number().min(0).optional(),
    })
    .strict(),

  /* ═════════════════════════════════════════════════════════════════════════
   * RESERVED KINDS (GH#289) — mirrors the reserved block of `EffectDef`.
   *
   * They are in the schema BEFORE their handlers exist on purpose: the editor
   * card, the content docs and the ref-checking all come from here, so a lane
   * can author its documents while it builds. The safety net is on the other
   * side — `sim/effects/<kind>.ts` throws a named error, so a document that
   * reaches a live match without its handler fails LOUDLY instead of doing
   * nothing (CLAUDE.md 失敗形態 ②).
   *
   * ⚠️ EVERY numeric field carries an UPPER bound as well as a lower one
   * (CLAUDE.md: 「欄位要有上界，不是只有下界」). The failure these prevent is the
   * same one damageArea's caps above prevent — a raw WC3 number pasted in
   * (durations in the hundreds, distances in the thousands) has to make the
   * FILE fail to load, not make one ability lock a match down after release.
   * ═════════════════════════════════════════════════════════════════════════ */
  z
    .object({
      kind: z.literal("dot"),
      ...EFFECT_COMMON_SHAPE,
      /** ⭐ G11（GH#299）—— 一段燒在**自己**身上的持續傷害（獻祭型）。 */
      applyTo: zApplyToSelfOrTarget,
      damageType: zDamageType.optional().describe(
        "傷害型別：吃護甲(physical)、吃魔抗(magic)、什麼都不吃(true)。" +
          "**省略 = 後台「傷害規則」頁的預設**（出貨 magic —— owner 2026-08-05" +
          "「技能傷害預設都改成 AP 傷害」）。⚠️ 它與**係數來源**是兩件事：" +
          "型別決定吃什麼減免，`amount` 的 Scaling(ap/ad/str/agi/int) 決定數字多大。",
      ),
      /** damage per PAYOUT, not per second */
      amountPerTick: zScaling,
      /**
       * 資源百分比項,加在**每一次付款**上 —— 熾天使之弓 godie-i012 的
       * 「每秒燃燒 3% 最大生命,持續 2 秒」。與 `damage.resourcePct` **同一份**
       * schema(見 {@link zResourcePctTerm}),per-target 解算並在 apply 當下
       * 凍進 `DotInstance.amountPerTick`。
       *
       * ⚠️ 除了每一格的 `scale` 上界之外,還有一道**整段燒完的總量**檢查
       * (`refineDotResourceBudget`)—— 一次 `damage` 的百分比是一下,dot 的
       * 是 `duration/interval` 下,守衛必須架在乘完之後。
       */
      resourcePct: zResourcePctTerm.optional(),
      /**
       * ⭐ 45-01【火遁-豪火龍之術】—— `resourcePct` **什麼時候**解算。
       *
       * owner 規格：「使其**每秒受到當下[現存生命] 1% 的傷害**，持續 3 秒。」
       * 「當下」是這一格存在的全部理由：三跳要各自看**那一跳當下**的血。
       *
       * | 值 | 語意 | 誰用 |
       * |---|---|---|
       * | `"onApply"`（省略 = 這個） | 施加的那一刻算一次、折進實例凍住 | 熾天使之弓「每秒 3% **最大**生命」等既有每一支 |
       * | `"onTick"` | **每一次付款**才用當下的條重算 | 45-01「當下現存生命 1%」 |
       *
       * ⛔ 預設**不動**：改預設會靜默改變既有內容的行為，而沒有一支要求過。
       *
       * ⚠️ owner 2026-08-13 指出「Berserker 不就有類似效果」—— 對，
       * `config.regen@1` 的 `healthDrainPctOfMax` 就是每 tick 重算的百分比扣血。
       * 但那一條是**最大**生命／**自己身上**／英雄卡靜態／**不算傷害**
       * （不吃傷害倍率、不被護盾吸、不噴數字、扣不死人）。45-01 要的是敵人身上、
       * 三秒、**現存**生命、而且是**傷害**（要算擊殺歸屬）。⇒ 缺的從來不是「扣血」，
       * 是「每 tick 重算」這一格，而它現在住在共用的 dot 管線裡。
       */
      resourcePctPhase: z.enum(["onApply", "onTick"]).optional(),
      /** seconds between payouts — one sim tick (1/30 s) is the floor */
      intervalSec: z
        .number()
        .min(1 / 30)
        .max(60),
      /** total seconds; the 60 s ceiling is the longest shipped combat round */
      durationSec: z.number().positive().max(60),
      /**
       * re-apply the same origin FROM THE SAME CASTER: extend the deadline
       * (default), run a second independent instance, or add a stack. See the
       * `dot` member of `sim/effects/effect.ts` for why each exists and which
       * one is the default.
       */
      stacking: z.enum(["refresh", "independent", "stack"]).optional(),
      /**
       * `"stack"` ceiling. Bounded on BOTH sides (CLAUDE.md 「欄位要有上界」):
       * the ceiling has to be finite or a 0.5 s re-cast turns into an unbounded
       * payout by the end of a round, and `DOT_MAX_STACKS` mirrors this number.
       */
      maxStacks: z.number().int().min(1).max(99).optional(),
      /** also pay on the cast tick (default false = wait one interval) */
      tickOnApply: z.boolean().optional(),
      /** does the burn outlive its caster? absent = "continue" (WC3's reading) */
      onCasterDeath: z.enum(["continue", "stop"]).optional(),
      /**
       * A4（#278 / GH#295）—— 這一筆延燒**可不可以被【淨化】拔掉**。
       * 省略 = 讀後台 `config.dispel@1` 的 `dotDefaultDispellable`（出貨 **true**，
       * 燃燒/中毒本來就該解得掉）。填 `false` = 這一筆解不掉。
       *
       * ⚠️ 它單獨一格而不是跟 status 共用一個預設，因為 `world.dot` 在 A4 之前
       * 完全沒有任何移除路徑 —— 把它打開是一次真的能力增加，值得有自己的閥。
       */
      dispellable: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("summon"),
      ...EFFECT_COMMON_SHAPE,
      /**
       * WHOSE BODY. `"self"` clones the CASTER's own champion (57-03 複製鏡,
       * 27-002 霧隱分身之術), so those docs need not name their own hero twice.
       * ABSENT = `"champion"`, i.e. `championId` below.
       */
      body: z.enum(["champion", "self"]).optional(),
      /**
       * SOFT ref: a summon's body is a champion doc, but an ability may be
       * authored before the body exists. Tighten to a hard ref once every
       * summoned unit ships. An unknown id summons NOTHING and emits
       * `summonFailed` (effects/summon.ts) — never a throw inside a tick.
       */
      championId: zRef("champions", { soft: true }),
      /** bodies per cast. The ceiling is an anti-typo guard, not balance. */
      count: z.number().int().min(1).max(20),
      /** seconds before despawn; ABSENT = permanent (WC3's 0-duration form) */
      durationSec: z.number().positive().max(600).optional(),
      level: z.number().int().min(1).max(30).optional(),
      /* ── 決策點 (owner 2026-07-30 「尤其是決策點」) ────────────────────────
       * Every enum below is a place the 52 「召喚代理」 in
       * docs/ability-templates.md disagree with each other, so none of them can
       * be a branch chosen in code. See the `summon` member of
       * sim/effects/effect.ts for the per-field evidence. */
      /** 歸屬: the summoner's team (default) or the hostile MONSTER sentinel */
      team: z.enum(["owner", "neutral"]).optional(),
      /** anchor for the formation: caster (default) / first target / cast point */
      at: z.enum(["self", "target", "point"]).optional(),
      /** 固定陣型 or 隨機散佈 — `"scatter"` draws from the world's SEEDED rng */
      formation: z.enum(["ring", "line", "scatter"]).optional(),
      /**
       * ring radius / line spacing / scatter radius, GGD units. UPPER-BOUNDED
       * (CLAUDE.md 「欄位要有上界，不是只有下界」): a duel zone is ~24 units
       * across, so a raw un-converted WC3 offset (400/450) pasted in here would
       * scatter the whole summon outside the arena and every body would be
       * silently clamped onto the rim.
       */
      spread: z.number().positive().max(12).optional(),
      /** 上限: most bodies alive at once in this cap group; ABSENT = DEFAULT_SUMMON_CAP (8) */
      maxAlive: z.number().int().min(0).max(20).optional(),
      /** what the cap counts: per caster PER ability (default) or per caster */
      capScope: z.enum(["caster", "casterAbility"]).optional(),
      /** at the cap: drop the new body (default) or evict the oldest (37-02 黑核晶) */
      onCap: z.enum(["skip", "replaceOldest"]).optional(),
      /** summoner dies → despawn (default) or fight on to the deadline */
      onOwnerDeath: z.enum(["despawn", "persist"]).optional(),
      /** ×the source champion's own maxHealth (1 = the hero's own sheet) */
      hpMult: z.number().positive().max(10).optional(),
      /** ×the source champion's own attack damage */
      damageMult: z.number().positive().max(10).optional(),
      /**
       * Who is paid for the summon's kills. ABSENT/`"none"` = nobody, which is
       * what the sim does today by construction.
       *
       * ⚠️ `"owner"` is ACCEPTED BY THE SCHEMA AND REFUSED BY THE HANDLER — it
       * needs a killer-rewrite seam in systems/DeathSystem.ts. Kept in the enum
       * (rather than dropped) so the value the editor will eventually offer has
       * one spelling, and so the refusal is a LOUD error naming the missing
       * seam instead of a Zod message about an unknown string.
       */
      killCredit: z.enum(["none", "owner"]).optional(),
      /* ── 誰打得到它 —— 決策點。預設值與理由: sim/summonRules.ts ───────────
       * A summon is deliberately neither a `champion` nor a `mob`, and BOTH of
       * the sim's automatic target pickers used to be allow-lists over exactly
       * those two stores — so nothing in the game could acquire a summon. These
       * six are what turned that from a hard-coded fact into an authored one. */
      /**
       * 敵方**自動**索敵看不看得見它。ABSENT = true = WC3 (an ordinary unit).
       * `false` hides it from auto-acquisition ONLY — it stays in the collision
       * broad-phase, so ability AoE and skillshots still hit it. This is not
       * invulnerability and must not be authored as if it were.
       */
      autoTargetable: z.boolean().optional(),
      /**
       * 索敵優先級。ABSENT = `"summon"`, its own tier between hero and zombie.
       * `"champion"` makes it soak attacks like a hero (57-03 複製鏡, 27-002
       * 霧隱分身之術 — decoys whose whole job is to be shot at); `"mob"` drops
       * it below every hero so it never pulls autos off the real fight.
       */
      targetPriority: z.enum(["champion", "summon", "mob"]).optional(),
      /** #215 殭屍會不會改去咬它。ABSENT = true = WC3 (creeps fight summons). */
      mobTargetable: z.boolean().optional(),
      /** 玩家能不能手動點名它。ABSENT = true = WC3 (right-clickable). */
      manualTargetable: z.boolean().optional(),
      /**
       * 縮圈的火燒不燒它。ABSENT = true —— owner 2026-07-30 的 保底:「所有場上
       * 玩家、bot、各種殭屍都會百分比真實傷害燒死」。Author `false` only for a
       * body that is scenery rather than a combatant (37-03 災難之牆).
       */
      burnsInFireRing: z.boolean().optional(),
      /**
       * 打死它付給擊殺者的金幣。ABSENT = 0 = 今天的行為 = WC3 (a summoned unit
       * is not a gold-bearing unit, which is what stops 召喚 spam being a gold
       * farm). UPPER-BOUNDED (CLAUDE.md 「欄位要有上界」): the shipped kill
       * bounty for a whole enemy CHAMPION is far below 1,000, so anything past
       * that is a typo, and a typo here prints gold every cast.
       */
      bountyGold: z.number().min(0).max(1000).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("invulnerable"),
      ...EFFECT_COMMON_SHAPE,
      /** seconds. Capped hard: an unbounded immunity is an unwinnable round. */
      durationSec: z.number().positive().max(30),
      applyTo: z.enum(["self", "target"]).optional(),
      /**
       * 傷害免疫的範圍。ABSENT = "all" = WC3 的 `Avul`。`"none"` 是**純免控**
       * (07-01 臨、兵、鬥「可抵擋對方負性魔法」),`"magic"` 是魔法免疫
       * (47-04 天翔龍閃 / 97-04 火產靈神 / 99-04)。
       */
      blocksDamage: z.enum(["all", "none", "physical", "magic"]).optional(),
      /** 真實傷害(火圈 #270)。ABSENT = 跟著 `blocksDamage === "all"` */
      blocksTrueDamage: z.boolean().optional(),
      /**
       * 免控(stun / root / 減速)。**ABSENT = false**,刻意與免傷分開 —— 見
       * sim/effects/invulnerable.ts 檔頭 ②。
       */
      blocksControl: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("knockback"),
      ...EFFECT_COMMON_SHAPE,
      /**
       * GGD units **AT GAP 0** — the FLOOR, not a fixed length: the GH#193 gap
       * subtraction still runs on top (see sim/effects/knockback.ts). Bounds
       * live in `sim/effects/knockbackLimits.ts`, the same one-table-two-
       * consumers shape `spreadLimits` uses, so schema and sim cannot drift.
       */
      distance: z.number().positive().max(KB_MAX_DISTANCE),
      /**
       * u/s。上界從 `KB_MAX_SPEED (200)` 降到位移護欄 —— 200 u/s 是一個 tick 走
       * 6.7 單位 = 身體半徑的 11 倍，一發保證穿牆的擊退（GH#318）。
       * ⚠️ 這仍然只是護欄；真正的天花板是註冊期推導的 `maxSpeed`。
       */
      speed: z.number().min(DISPLACEMENT_SPEED_MIN).max(DISPLACEMENT_AUTHORED_SPEED_MAX),
      /**
       * ⭐ 位移級別（GH#318）—— **push** 那條梯。與 `launchDistance` **互斥**
       * （`refineEffectDef` 擋）：那四檔走的是完全不同的一套（執行期解析、跳過 gap
       * 減法與 `impactPower`），兩份查表就是「編輯器顯示 4.5、場上打 6.0」。
       */
      distanceTier: zDisplacementTier
        .optional()
        .describe(
          "擊退級別（小/中/大/極大）。填了就不用填距離與速度。⛔ 不可以和「擊飛落點」同時填。",
        ),
      /** away from the caster (default), along the caster's facing, or a PULL */
      from: z.enum(["caster", "facing", "pull"]).optional(),
      /** each resolved target (default) or the caster (a recoil) */
      applyTo: z.enum(["target", "self"]).optional(),
      /**
       * 「這一擊的重量」in DAMAGE units, run through GH#193's own law against
       * the victim's health. Deals no damage. ABSENT = the flat floor only.
       */
      impactPower: z.number().positive().max(KB_MAX_IMPACT_POWER).optional(),
      /** percentage of MAX health (default, the shipped rule) or CURRENT health */
      hpBasis: z.enum(["max", "current"]).optional(),
      /** subtract the caster↔victim gap (GH#193). ABSENT = true. */
      subtractGap: z.boolean().optional(),
      /** 擊飛: apex height in GGD units; > 0 turns the shove into a parabola */
      launchHeight: z.number().min(0).max(KB_MAX_LAUNCH_HEIGHT).optional(),
      /**
       * ⭐ 擊飛的**落點**，四檔（owner 2026-08-09 / GH#301-1）。
       * 省略 = 今天的行為（＝ `"default"`，由 `distance` / `impactPower` / 距離
       * 減法推算）。⛔ 不是自由數字 —— 那是 owner 明講的簡化。
       * 完整推導與「四檔的實際距離必須住在 `config.combat-feel@1`、不可以是
       * 引擎裡的常數」寫在 `sim/effects/effect.ts` 的 `knockback.launchDistance`。
       */
      launchDistance: z
        .enum(["short", "default", "long", "toEdge"])
        .optional()
        .describe(
          "擊飛落點：一小段 / 預設（系統推算，＝省略時的行為）/ 一大段 / 到底部（推到決鬥區邊緣）。" +
            "四檔的實際距離在後台「戰鬥手感」頁調，這裡只選檔位。",
        ),
      /** 期間不可控制 (world.knockdown). ABSENT = true. */
      uncontrollable: z.boolean().optional(),
      /** extra 不可控制 ticks after landing (the 爬起來 window) */
      getupTicks: z.number().int().min(0).max(KB_MAX_GETUP_TICKS).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("evasion"),
      ...EFFECT_COMMON_SHAPE,
      /**
       * 0..1 BEFORE the ceiling. Both dodge channels are capped at
       * `effectiveCap(statCaps, Stat.Evasion)` — shipping 0.8, editable on the
       * 後台「屬性上限」page. Authoring 1 here does NOT buy invulnerability.
       * (It did until 2026-07-30 on the ability channel; see combat/evasion.ts.)
       */
      chance: z.number().min(0).max(1),
      durationSec: z.number().positive().max(60),
      applyTo: z.enum(["self", "target"]).optional(),
      /**
       * DECISION POINT — dodge ABILITY damage too? Default false = WC3
       * `Evasion` fidelity (basic attacks only), today's shipping behaviour.
       */
      dodgesAbilities: z.boolean().optional(),
      /**
       * DECISION POINT — dodge `type: "true"` damage too? Default false, so
       * the arena fire-ring burn (#270) stays undodgeable unless opted in.
       */
      dodgesTrueDamage: z.boolean().optional(),
    })
    .strict(),
  /**
   * taunt — 嘲弄 (鍊金術之盾 godie-i06q). Mirrors the `taunt` member of
   * `EffectDef`. The mechanic, the state model and every operator-facing
   * decision field live in `sim/taunt.ts`; this is only the authoring surface.
   *
   * BOTH ENDS BOUNDED, and the two ceilings guard DIFFERENT mis-parses:
   *   · `durationSec` ≤ TAUNT_MAX_DURATION_SEC — 0.5 typed as 50 is a taunt
   *     that outlives the round, i.e. one shield owning every enemy's targeting
   *     for the whole fight. The FLOOR is 0.034 s for the reason
   *     `grantAttribute.durationSec` has one: `Math.round(sec/dt)` at 30 Hz is
   *     0 ticks below that — a blank that reads exactly like a broken feature.
   *   · `radius` ≤ SPREAD_MAX_RADIUS — the SAME ceiling every other authored
   *     circle carries, and for the same reason: a w3x `Area` column pasted
   *     straight in (200/300/450) is ~54.5× too large and would taunt the whole
   *     duel zone. Reusing that constant rather than inventing a taunt-specific
   *     one is deliberate — two ceilings for 「一個圓有多大」 would drift.
   */
  z
    .object({
      kind: z.literal("taunt"),
      ...EFFECT_COMMON_SHAPE,
      /** 持續幾秒 (乘上後台的 `tauntRules.durationMult` 之後換算成絕對 tick) */
      durationSec: z.number().min(0.034).max(TAUNT_MAX_DURATION_SEC),
      /**
       * 範圍 (GGD 單位), 圓心是**施法者自己**。省略 = 單體, 掛在這個效果自己
       * 解析出來的目標上。走 `combatEnv.abilityRange`, 和其它每一個 AoE 一樣。
       */
      radius: z.number().positive().max(SPREAD_MAX_RADIUS).optional(),
      radiusTier: zAoeTier.optional(),
      /** 一次最多拉幾個人 (由近到遠)。省略 = TAUNT_MAX_TARGETS */
      maxTargets: z.number().int().min(1).max(TAUNT_MAX_TARGETS).optional(),
      /**
       * ⭐ [反向嘲諷]（戰鬥力探測器）—— 這個圓**拉誰**。
       *
       * 省略 = `enemies` = 今天那一行 `enemiesInCircle`（`sim/effects/taunt.ts`），
       * 所以出貨的鍊金術之盾（`content/items/godie-i06q.json`）**逐位元不變**。
       */
      side: z.enum(["allies", "enemies"]).optional(),
      /**
       * ⭐ 被拉的人**被迫打誰**。省略 = `caster`（施法者自己），也就是
       * `applyTaunt(world, s, ctx.caster, …)` 今天寫死的那一格。
       *
       * ⛔ 不可以和 {@link side} 合成一格（「拉隊友去打敵人」與「拉敵人來打我」
       * 是兩根獨立的軸），⛔ 也不可以叫 `applyTo` —— `zApplyToSelfOrTarget`
       * 已經把 `applyTo` 定義成「效果落在誰身上」。
       */
      forcedTarget: z.enum(["caster", "target"]).optional(),
      /**
       * 附近的中立單位（殭屍）也一起拉。省略 = `false`。
       *
       * ⚠️ **只在 `side:"allies"` 有作用**：`enemies` 那一側本來就含
       * `MONSTER_TEAM`（`sim/mobs.ts` 的 255），所以這一格對它是嚴格的 no-op。
       * ⛔ 不要把它實作成雙向 —— 那會改掉出貨行為（鍊金術之盾不再拉殭屍，
       * 而那是它在 PvE 唯一的價值）。
       */
      includeNeutrals: z.boolean().optional(),
    })
    .strict(),
  /**
   * grantGold — 發放金幣. Mirrors the `grantGold` member of `EffectDef`.
   * 「黃金數量為敵方等級」 is `perTargetLevel: 1`.
   *
   * BOTH ENDS BOUNDED, and both ceilings are MIS-PARSE guards rather than
   * balance policy — the whole shipped economy is ~7,600 gold per match
   * (sim/economy/progression.ts), so:
   *   · `flat` ≤ 5000 — a single proc paying two thirds of a match's income is
   *     a typo, not a design.
   *   · `perTargetLevel` ≤ 100 — at the level cap (99) that is already 9,900,
   *     i.e. more than the entire economy from one hit. 「等級」 means 1.
   */
  z
    .object({
      kind: z.literal("grantGold"),
      ...EFFECT_COMMON_SHAPE,
      /** 固定金額。省略 = 0（純按等級發放是合法的） */
      flat: z.number().min(0).max(5000).optional(),
      /** 每一級發多少金。「黃金數量為敵方等級」= 1。沒有目標時這一項是 0 */
      perTargetLevel: z.number().min(0).max(100).optional(),
      /**
       * **決策點**:小怪(殭屍)的「等級」從哪裡來。省略 = `"wave"`(波次等級,
       * 也就是那隻殭屍的血量/回血曲線本來就用的那個數字)。`"fallback"` =
       * 小怪沒有等級,值 `fallbackLevel`。
       *
       * ⚠️ 出貨是 `"wave"` 而不是舊行為的 0,因為 0 是一個缺陷不是一個設計:
       * 鍊金術之盾的「黃金數量為敵方等級」對全場每一隻殭屍付 0 金,而卡片上
       * 寫著另一回事(失敗形態 ②)。
       */
      mobLevelSource: z.enum(["wave", "fallback"]).optional(),
      /**
       * 完全沒有等級可讀的身體算幾級。省略 = 0。上界 99 = 英雄等級上限
       * (誤植守衛:填 990 等於一發付 990 金,那是整場經濟的八分之一)。
       */
      fallbackLevel: z.number().int().min(0).max(99).optional(),
      /** 誰收錢：施法者（預設）或每一個解析出來的目標 */
      to: z.enum(["self", "target"]).optional(),
    })
    .strict(),
  /**
   * 【淨化】/【驅散】(A4b, #278) —— mirrors the `dispel` member of `EffectDef`
   * in sim/effects/effect.ts。行為在 `sim/effects/dispel.ts`。
   */
  z
    .object({
      kind: z.literal("dispel"),
      ...EFFECT_COMMON_SHAPE,
      /**
       * ⭐ **E1 硬約束（owner 核准）：新 kind 一律帶 `shape`。**
       *
       * ⚠️ `line` / `cone` 刻意不在 enum 裡 —— 今天沒有文件需要它們，而一個
       * schema 收得下、引擎沒實作的值，正是同一批裡剛被刪掉的 `onLevelUp`。
       */
      shape: z.enum(["single", "circle"]),
      /**
       * `shape:"circle"` **必填**（由 `refineDispelShape` 在載入時擋）。
       * 吃 `combatEnv.abilityRange`。上界 40 ≈ 競技場直徑：再大就是「全場」，
       * 而那該用 `target:"allies"` 的全隊語意寫，不是一個假裝有半徑的圓。
       */
      radius: z.number().positive().max(40).optional(),
      /** ⭐ AoE 級別（owner 2026-08-11「原則上不寫範圍數字」）。填了它就不要填
       *  `radius` —— 註冊時由 `config.aoe-tiers@1` 翻成半徑，兩者都填則**級別贏**。
       *  唯一的查表處：`content/aoeTiers.ts` 的 `resolveRadiusTier`。 */
      radiusTier: zAoeTier.optional(),
      /** `shape:"circle"` 清友軍（預設）還是清敵人。 */
      side: z.enum(["allies", "enemies"]).optional(),
      /** 圓內人數上限。省略 = 全部。上界 24 = 一場的總人數。 */
      maxTargets: z.number().int().positive().max(24).optional(),
      /**
       * 清哪幾池。省略 = `config.dispel@1` 的四個 `defaultPool*`。
       *
       * ⚠️ `buffs` 打開 = 拔得掉道具被動／增益卡／靈氣投影，而它**後面還有兩道閘**，
       * 兩道都要作者主動打開，否則勾了這一格一筆都不會掉：
       *   ① `applyBuff.dispellable: true` —— 出貨的 `buffDefaultDispellable` 是
       *      **false**，所以沒標的來源一律拔不走（GH#295 之前**連這一格都不存在**，
       *      於是這一池是一個死開關：兩道閘相乘為零）；
       *   ② `applyBuff.polarity` 要對得上這裡的 `polarity` —— 沒填極性的來源，
       *      任何有方向的淨化都拔不到（「不知道」不當成「是」）。
       *
       * ⚠️ `shields` 在 `polarity: "debuff"`（本 kind 的預設）下**整池跳過**，而那是
       * 刻意的不是缺陷：護盾沒有極性也沒有 `dispellable`，一發「解掉自己身上的減益」
       * 不該順手吃掉自己的護盾。要打盾就寫 `polarity: "any"` / `"buff"`，或者用
       * 專門的 `shieldBreak` kind（它不受 `dispelRules.enabled` 這個止血閥影響）。
       */
      pools: z
        .object({
          status: z.boolean().optional(),
          shields: z.boolean().optional(),
          dot: z.boolean().optional(),
          buffs: z.boolean().optional(),
        })
        .strict()
        .optional(),
      /** 只清這一種極性。省略 = `"debuff"`（淨化的字面意思）。 */
      polarity: z.enum(["buff", "debuff", "any"]).optional(),
      /**
       * 每一池最多拔幾層。省略 = 後台的 `maxCountCap`；
       * **寫了也夾不過它**（一句話管到底，見 `sim/dispelRules.ts`）。
       *
       * ⭐ 想寫「解除**全部**負面狀態」的卡，正解是**整格省略** ——
       * 那就是「跟著後台的全域上限走」，而出貨的全域上限是 **50**
       * （owner 2026-08-18 定案）。⛔ 填一個大數字**不是**同一件事：它會凍結在
       * 文件裡，owner 哪天調那一格，省略的自動跟上、填死的不會。
       * ⚠️ 這一批量到 7 份文件寫了 50 而當時上限是 3 —— 它們全部被靜默夾掉，
       * 卡面卻印著「全部」。那是這一格最容易出的錯，⛔ 不要再寫數字。
       *
       * ⚠️ 這裡的 `.max` 是 `DISPEL_MAX_COUNT_BOUNDS` 的**上界**（60，GH#360），
       * ⛔ 不是出貨值（50）—— 它擋的是「文件寫了一個連後台都調不到的數字」。
       * 三個住處分歧的守衛：`sim/dispelRules.test.ts`。
       */
      count: z.number().int().positive().max(60).optional(),
      /** 拔不完時先拔哪一邊。省略 = 後台的 `defaultOrder`。 */
      order: z.enum(["newest", "oldest"]).optional(),
    })
    .strict(),

  /**
   * 【破盾】`shieldBreak`（D1，#278）。只打掉 `HealthComp.shields`。
   *
   * ⚠️ 它與 `dispel` 分開的理由是**止血閥**：`dispelRules.enabled = false`
   * 不該順手廢掉一件破盾道具。完整理由見 `sim/effects/shieldBreak.ts` 檔頭。
   * 行為在那一支；`shape` 的解析與 dispel 共用 `sim/effects/shapeTargets.ts`。
   */
  z
    .object({
      kind: z.literal("shieldBreak"),
      ...EFFECT_COMMON_SHAPE,
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
      shape: z.enum(["single", "circle"]),
      /** `shape:"circle"` **必填**（載入時擋）。吃 `combatEnv.abilityRange`。 */
      radius: z.number().positive().max(40).optional(),
      /** ⭐ AoE 級別（owner 2026-08-11「原則上不寫範圍數字」）。填了它就不要填
       *  `radius` —— 註冊時由 `config.aoe-tiers@1` 翻成半徑，兩者都填則**級別贏**。
       *  唯一的查表處：`content/aoeTiers.ts` 的 `resolveRadiusTier`。 */
      radiusTier: zAoeTier.optional(),
      /** 破盾的預設是**打敵人**（與淨化相反）。 */
      side: z.enum(["allies", "enemies"]).optional(),
      /** 圓內人數上限。省略 = 全部。上界 24 = 一場的總人數。 */
      maxTargets: z.number().int().positive().max(24).optional(),
      /**
       * 最多打掉幾層盾。省略 = 整池。
       * ⚠️ 上界 20：一個人身上同時掛 20 片盾已經是異常，再大就是打錯字。
       */
      count: z.number().int().positive().max(20).optional(),
      /** 打不完時先打哪一邊。省略 = `"newest"`。 */
      order: z.enum(["newest", "oldest"]).optional(),
    })
    .strict(),

  /**
   * 【吞噬】—— 處決 + 等值回復（owner 2026-08-05，初號機 EX）。
   * 行為在 `sim/effects/devour.ts`；`shape` 與 dispel/shieldBreak 共用 `shapeTargets`。
   */
  z
    .object({
      kind: z.literal("devour"),
      ...EFFECT_COMMON_SHAPE,
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
      shape: z.enum(["single", "circle"]),
      radius: z.number().positive().max(40).optional(),
      /** ⭐ AoE 級別（owner 2026-08-11「原則上不寫範圍數字」）。填了它就不要填
       *  `radius` —— 註冊時由 `config.aoe-tiers@1` 翻成半徑，兩者都填則**級別贏**。
       *  唯一的查表處：`content/aoeTiers.ts` 的 `resolveRadiusTier`。 */
      radiusTier: zAoeTier.optional(),
      side: z.enum(["allies", "enemies"]).optional(),
      maxTargets: z.number().int().positive().max(24).optional(),
      /**
       * 逐階處決線（`hp <= maxHp ×` 這一格）。owner 的 3/5/7/9% 就是
       * `[0.03, 0.05, 0.07, 0.09]`。
       * ⛔ 上界 0.5：一條「剩一半就吞得掉」的處決線已經不是處決而是一發必殺技，
       * 而那應該用 `damage` 寫（看得到數字、吃得到護甲）。
       */
      thresholdPctOfMax: z.array(z.number().positive().max(0.5)).min(1).max(5),
      /** 回復「吞下去的生命」的幾成。省略 = 1。上界 2 = 最多回兩倍。 */
      healPct: z.number().min(0).max(2).optional(),
      /** 吞得掉誰。省略 = `"champion"`。 */
      victim: z.enum(["champion", "any"]).optional(),
      /** 致死量含不含護盾。省略 = true（否則「即死」會被護盾靜默擋掉）。 */
      throughShields: z.boolean().optional(),
      /**
       * ⭐ S9a —— **真的吞掉之後**才跑的那一段（92-03「每吞噬一名 +1 AP，永久」）。
       * 省略 = 沒有後續 = 今天（`content/` 裡 devour 文件數 = 0）。
       *
       * ⛔ 「用 onKill 代替」不成立：`onKill` 的三個發射點都沒有 abilitySlot、沒有
       * incoming，所以「吞噬殺掉的」與「普攻殺掉的」在觸發器端分不出來。
       * `.min(1)` 同 `all`/`any` 的反空陣列規則；`.max(6)` 與 `leap.onLand` 對齊。
       *
       * ⚠️ 觸發時刻是「處決線通過、致死量已排出去」那一刻，**不是**「屍體確認了」。
       * 一個帶【免死】的目標會被吞噬打到卻活下來，而這一段已經跑過。
       */
      onDevour: z
        .array(z.lazy(() => zEffectDef))
        .min(1)
        .max(6)
        .optional()
        .describe(
          "真的吞掉之後才跑的效果（「每吞噬一名敵人永久 +1 AP」）。⚠️ 它在「致死傷害送出去」" +
            "那一刻就跑，所以帶免死的目標可能活下來而這一段已經發生。",
        ),
      /**
       * ⭐ S9a —— 一次吞掉多人時 {@link onDevour} 跑幾次。
       * 省略 = `"victim"`。⚠️ 對 `shape:"single"`（出貨唯一形狀）兩者完全等價，
       * 也就是預設值不替任何人做決定。
       */
      onDevourPer: z
        .enum(["victim", "cast"])
        .optional()
        .describe(
          "後續效果跑幾次：victim（預設，每吞掉一個人各跑一次）或 cast（只要有人被吞掉就跑一次）。",
        ),
    })
    .strict(),

  /**
   * ── Lane 1（2026-08-08）四個新 kind ────────────────────────────────────
   * 四個是同一個形狀的四個實例；上下界一律從 `sim/effects/kindLimits.ts` 讀，
   * ⛔ 不在這裡抄字面值（那會是一個沒有守衛的第二住處）。
   */

  /** 【縮短特定技能冷卻】(#284) —— 鏡像 `EffectDef` 的同名成員。 */
  z
    .object({
      kind: z.literal("modifyCooldown"),
      ...EFFECT_COMMON_SHAPE,
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
      shape: z.enum(["single", "circle"]),
      radius: z.number().positive().max(40).optional(),
      /** ⭐ AoE 級別（owner 2026-08-11「原則上不寫範圍數字」）。填了它就不要填
       *  `radius` —— 註冊時由 `config.aoe-tiers@1` 翻成半徑，兩者都填則**級別贏**。
       *  唯一的查表處：`content/aoeTiers.ts` 的 `resolveRadiusTier`。 */
      radiusTier: zAoeTier.optional(),
      side: z.enum(["allies", "enemies"]).optional(),
      maxTargets: z.number().int().positive().max(24).optional(),
      who: z.enum(["self", "target"]).optional(),
      slot: zCastableSlot.optional(),
      abilityId: zRef<AbilityId>("abilities", { soft: true }).optional(),
      mode: z.enum(["reduce", "reduceFlat", "reset"]),
      /**
       * 兩端都有界（CLAUDE.md「欄位要有上界」）。單位隨 `mode`：
       * `reduce` 是比例、`reduceFlat` 是秒。負值 = 延長。
       * ⚠️ 這裡收的是兩個 mode 的**聯集**上界，`refineModifyCooldown` 再按
       * mode 收緊 —— 否則 `reduce` 寫 120 會被當成 12000% 靜默夾掉。
       */
      amount: z
        .number()
        .min(-CD_REDUCE_MAX_FLAT_SEC)
        .max(CD_REDUCE_MAX_FLAT_SEC)
        .optional(),
      basis: z.enum(["remaining", "base"]).optional(),
      /**
       * ⭐ S3 —— 這一發改的是**哪一種**冷卻。
       * 省略 = `"abilitySlot"` = 這個 kind 今天的全部行為（三份既有文件都不填）。
       *
       * `"hookInternalCooldown"` 解鎖的是 60-002 絕光斬那一族：一支 passive-only
       * 的技能永遠不會被 cast，所以它的技能冷卻**恆為 0**，而
       * `if (inst.cooldownRemainingTicks <= 0) continue;` 在第一道就跳過它 ——
       * 「120 秒一次」與「反彈成功立即重置」於是二選一。
       *
       * ⛔ 為什麼不「自動偵測」：那會讓一支寫錯 `abilityId` 的文件安靜地去重置某條
       * 觸發器，而作者以為自己在縮短技能冷卻。
       */
      target: z
        .enum(["abilitySlot", "hookInternalCooldown"])
        .optional()
        .describe(
          "改哪一種冷卻：abilitySlot（預設，技能按鈕的冷卻）或 hookInternalCooldown" +
            "（一條觸發器的內部冷卻 —— 被動技唯一有冷卻的那一格）。",
        ),
      /**
       * ⭐ S3 —— `target: "hookInternalCooldown"` 時指名哪一條觸發器（比對
       * `HookDef.key`）。省略 = 那份來源上的**每一條**。
       * ⚠️ `target` 不是 hook 時填了它 = PARSE ERROR（`refineModifyCooldown`）。
       */
      hookKey: z
        .string()
        .min(1)
        .max(64)
        .optional()
        .describe(
          "只重置／縮短這一條觸發器（填它的名字）。留空＝那個被動上的每一條。",
        ),
      /**
       * ⭐ S3 —— 這一發碰得到**誰的**觸發器。這是這個機制唯一真正的「A 還是 B」，
       * 所以它是一格欄位而不是註解裡的一段辯護（第一守則：決策點）。
       *
       * ⚠️ 2026-08-10（⑤）：`target:"hookInternalCooldown"` 下它**必填**，不再有
       * 預設值。理由是 `originSource` 從**施放**路徑跑出來時是一個靜默的 no-op，
       * 而「沒選過就吃到預設值」正是那個缺陷唯一真的會發生的形狀
       * （`refineModifyCooldown` 擋；schema 測不出執行路徑，所以擋的是預設值）。
       *
       * · `originSource` —— 只動這一發效果**自己所屬**的那一份來源。
       *   60-002 絕光斬要的就是它：「反彈成功 → 重置**我自己**那條 120 秒的觸發器」，
       *   兩條 hook 住在同一份被動來源上。
       * · `allSources` —— 「這張卡重置你身上**所有**叫這個名字的觸發器」。
       *   ⚠️ 它必須指名 `hookKey`（`refineModifyCooldown` 擋）。
       *
       * 預設選 `originSource` 因為它**嚴格較窄**：一份打錯 `hookKey` 的文件在它之下
       * 什麼都不會發生，在 `allSources` 之下會安靜地重置**別件裝備**的 proc。
       *
       * ⚠️ 這條路今天整條不存在（出貨 0 份 `modifyCooldown`），所以「等於今天的
       * 行為」在這裡的正確讀法是**最保守的那一個**：只碰自己那一份。
       */
      hookScope: z
        .enum(["originSource", "allSources"])
        .optional()
        .describe(
          "碰得到誰的觸發器：originSource（只有這一發效果自己所屬的那份被動／道具" +
            " —— ⚠️ 它只有在這個效果**掛在一條觸發器底下**時才有作用，從技能施放" +
            "跑出來時它一格都不會動）或 allSources（這個身體上每一份叫得出同一個" +
            " hookKey 的來源）。allSources 一定要填 hookKey，否則就是「重置身上每" +
            "一條觸發器」。⚠️ 改觸發器冷卻時這一格**必填**（沒有預設值可以吃）。",
        ),
    })
    .strict(),

  /** 【加權分支】(89-002 俄羅斯輪盤)。⭐ 一次施放只 draw 一次。 */
  z
    .object({
      kind: z.literal("weightedBranch"),
      ...EFFECT_COMMON_SHAPE,
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
      shape: z.enum(["single", "circle"]),
      radius: z.number().positive().max(40).optional(),
      /** ⭐ AoE 級別（owner 2026-08-11「原則上不寫範圍數字」）。填了它就不要填
       *  `radius` —— 註冊時由 `config.aoe-tiers@1` 翻成半徑，兩者都填則**級別贏**。
       *  唯一的查表處：`content/aoeTiers.ts` 的 `resolveRadiusTier`。 */
      radiusTier: zAoeTier.optional(),
      side: z.enum(["allies", "enemies"]).optional(),
      maxTargets: z.number().int().positive().max(24).optional(),
      /**
       * ⚠️ 下界是 **0**（允許「先關掉一個分支」），所以**總和為 0**要靠
       * `refineWeightedBranch` 在載入時擋 —— 一份總權重 0 的文件在執行期
       * 是「技能放得出來、什麼都不會發生」，正是失敗形態 ②。
       */
      branches: z
        .array(
          z
            .object({
              weight: z.number().min(0).max(BRANCH_MAX_WEIGHT),
              effects: z.array(zEffectDef).min(1),
            })
            .strict(),
        )
        .min(1)
        .max(BRANCH_MAX_COUNT),
    })
    .strict(),

  /** 【交換資源】(44-002 交換筆記本)。三個決策點都是欄位。 */
  z
    .object({
      kind: z.literal("swapResource"),
      ...EFFECT_COMMON_SHAPE,
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
      shape: z.enum(["single", "circle"]),
      radius: z.number().positive().max(40).optional(),
      /** ⭐ AoE 級別（owner 2026-08-11「原則上不寫範圍數字」）。填了它就不要填
       *  `radius` —— 註冊時由 `config.aoe-tiers@1` 翻成半徑，兩者都填則**級別贏**。
       *  唯一的查表處：`content/aoeTiers.ts` 的 `resolveRadiusTier`。 */
      radiusTier: zAoeTier.optional(),
      side: z.enum(["allies", "enemies"]).optional(),
      maxTargets: z.number().int().positive().max(24).optional(),
      /** 決策點①。省略 = `"health"`。 */
      resource: z.enum(["health", "mana"]).optional(),
      /** 決策點②。省略 = 1（§16.16：交換不殺人）。0 = 允許交換到 0。 */
      clampMin: z.number().min(0).max(SWAP_CLAMP_MIN_MAX).optional(),
      /** 決策點③。省略 = `"abort"`（§16.16 的「目標失效則全招失敗」）。 */
      onInvalidTarget: z.enum(["abort", "skip"]).optional(),
    })
    .strict(),

  /** 【事件數值轉換】(15-002 太陰道 · 59-01 吞噬)。⚠️ `basis` 待 freeze。 */
  z
    .object({
      kind: z.literal("eventValueConversion"),
      ...EFFECT_COMMON_SHAPE,
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
      shape: z.enum(["single", "circle"]),
      radius: z.number().positive().max(40).optional(),
      /** ⭐ AoE 級別（owner 2026-08-11「原則上不寫範圍數字」）。填了它就不要填
       *  `radius` —— 註冊時由 `config.aoe-tiers@1` 翻成半徑，兩者都填則**級別贏**。
       *  唯一的查表處：`content/aoeTiers.ts` 的 `resolveRadiusTier`。 */
      radiusTier: zAoeTier.optional(),
      side: z.enum(["allies", "enemies"]).optional(),
      maxTargets: z.number().int().positive().max(24).optional(),
      source: z.enum(["incomingDamage", "targetCurrentHealth"]).optional(),
      /**
       * ⚠️ **計畫 §16.12 未 freeze**，所以三個讀數是一格欄位、不是我挑一個。
       * 省略 = `"mitigated"`，與 `damage.incomingPct.basis` 的預設同一句話。
       */
      basis: z.enum(["raw", "mitigated", "hpLost"]).optional(),
      ratio: z.number().min(-CONVERT_MAX_RATIO).max(CONVERT_MAX_RATIO),
      to: z.enum(["mana", "health"]).optional(),
      who: z.enum(["self", "target"]).optional(),
      /** 「以及**短暫**加成至 AP」。`ratio` 省略時沿用外層的。 */
      buff: z
        .object({
          stat: zStat,
          durationSec: z.number().positive().max(CONVERT_BUFF_MAX_SEC),
          ratio: z.number().min(-CONVERT_MAX_RATIO).max(CONVERT_MAX_RATIO).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),

  /**
   * ── Lane 2（2026-08-08）三個新 kind ────────────────────────────────────
   * 與 Lane 1 同一個形狀；上下界一律從 `sim/effects/kindLimits.ts` 讀，
   * ⛔ 不在這裡抄字面值。
   */

  /**
   * 【隨機落點排程】(13-04 龍星群 · 70-04 千年練成)。⭐ draw 預算 = 2×count。
   *
   * ⛔ **這個 kind 沒有 `shape` / `radius` / `side` / `maxTargets`**（2026-08-10
   * 拿掉，遷移成本 0：`content/` 當時有 **0 份** randomArea）。理由是可以從
   * handler 讀出來的，不是風格偏好：
   *
   *   `randomArea` 解的是**落點**，不是**受害者**。它 `push` 一個 wave，到期時用
   *   `targets: []` + `point: hit.pos` 跑 `wave.effects` —— 「打到誰」是**巢狀的**
   *   `damageArea` 自己拿 `ctx.point` 當圓心解出來的。所以 `sim/effects/randomArea.ts`
   *   **一格都不讀**那四格：它們是同一件事的第二個住處，作者填了完全沒有效果，
   *   而畫面上跟「這招就設計成這樣」分不出來。
   *
   * ⭐ 它的作用範圍由 {@link scatterRadius}（落點散佈半徑）+ `who`（以誰為圓心）
   * 講清楚 —— 那正是 E1 要的東西，只是不叫 `shape`。⛔ 反過來把 `shapeTargets`
   * 接上去是在做 `delayed` 已經做的事（「施放那一刻凍住的名單」），
   * 兩個 kind 的差別就是那一句話。
   */
  z
    .object({
      kind: z.literal("randomArea"),
      ...EFFECT_COMMON_SHAPE,
      who: z.enum(["self", "target"]).optional(),
      /** 逐階發數（70-04 = `[4,6,8]`、13-04 = `[10]`）。 */
      count: z
        .array(z.number().int().positive().max(RANDOM_AREA_MAX_COUNT))
        .min(1)
        .max(5),
      intervalSec: z.number().positive().max(RANDOM_AREA_MAX_INTERVAL_SEC),
      scatterRadius: z.number().positive().max(RANDOM_AREA_MAX_SCATTER_RADIUS),
      firstAtCast: z.boolean().optional(),
      stopOnCasterDeath: z.boolean().optional(),
      /**
       * 每一發落地跑的東西。`.min(1)` 是刻意的：一波什麼都不做的流星在遊戲裡
       * 跟「技能壞掉」一模一樣（失敗形態 ②）。
       */
      effects: z.array(zEffectDef).min(1),
    })
    .strict(),

  /**
   * ── Lane 3（2026-08-10）兩個新 kind ──────────────────────────────────────
   * 上下界一律從 `sim/effects/kindLimits.ts` 讀，⛔ 不在這裡抄字面值。
   */

  /**
   * ⭐ G12【延遲序列】(20-002 連續七次斬擊 · 52-002 連續 100 下)。
   *
   * ⭐ 它與 `randomArea` 的差別只有一句話，而那句話就是它存在的理由：
   * `randomArea` 到期時用**圓心重解**（目標走開就打空），`delayed` 到期時用
   * **施放那一刻凍住的名單**。今天寫「連續七次斬擊」只能寫成同一 tick 七發傷害 ——
   * 畫面上那不是連擊。
   * ⭐ 這個 kind **完全不碰 rng**（沒有落點要抽）。
   */
  z
    .object({
      kind: z.literal("delayed"),
      ...EFFECT_COMMON_SHAPE,
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
      shape: z.enum(["single", "circle"]),
      radius: z.number().positive().max(40).optional(),
      /** ⭐ AoE 級別（owner 2026-08-11「原則上不寫範圍數字」）。填了它就不要填
       *  `radius` —— 註冊時由 `config.aoe-tiers@1` 翻成半徑，兩者都填則**級別贏**。
       *  唯一的查表處：`content/aoeTiers.ts` 的 `resolveRadiusTier`。 */
      radiusTier: zAoeTier.optional(),
      side: z.enum(["allies", "enemies"]).optional(),
      maxTargets: z.number().int().positive().max(24).optional(),
      /** 第一發等多久（秒）。 */
      delaySec: z.number().positive().max(DELAYED_MAX_DELAY_SEC),
      /** 總共幾發。省略 = 1（＝退化成純延遲）。 */
      count: z.number().int().positive().max(DELAYED_MAX_COUNT).optional(),
      /**
       * 兩發之間隔幾秒（`count > 1` 才有意義）。執行期夾成**至少 1 tick** ——
       * 0.001 秒與 0.033 秒在 30Hz 下是同一件事，而算出 0 tick 間隔的排程會把整波
       * 塞進同一個 tick。
       */
      intervalSec: z.number().positive().max(DELAYED_MAX_INTERVAL_SEC).optional(),
      /** 每一發跑的東西。`.min(1)` 同 `randomArea`：什麼都不做 = 看起來壞掉。 */
      effects: z.array(z.lazy(() => zEffectDef)).min(1),
      /**
       * **最後一發**額外跑的東西。省略 = 最後一發與其餘完全相同
       *（⛔ **不是**「最後一發不跑」）。20-002 的「最後再給予…」住在這裡。
       */
      finalEffects: z
        .array(z.lazy(() => zEffectDef))
        .min(1)
        .optional()
        .describe("只有最後一下才追加的效果（「最後一擊附加擊退＋恐懼」）。"),
      targetMode: z
        .enum(["frozen", "reresolve"])
        .optional()
        .describe(
          "目標怎麼決定：frozen（預設，施放那一刻就鎖定，追著他打）或 " +
            "reresolve（每一發到期時重新以落點解目標，走開就打空）。",
        ),
      /**
       * ⭐【沿向量分段推進】(GH#393，owner 2026-08-19「JASS 應該有安排位置移動
       * 播放的多次特效搭配傷害」)。填了它，這一串就沿著一條線往前走：第 i 發的
       * 落點 = 錨點 + 方向 × (startDist + i × stepDist)。
       * 配 `targetMode: "reresolve"` + `shape: "circle"` = 每一段各結算一次。
       * 缺席 = 原地連擊（嚴格 no-op）。上下界一律讀 `sim/effects/kindLimits.ts`。
       */
      advance: z
        .object({
          stepDist: z
            .number()
            .positive()
            .max(DELAYED_MAX_STEP_DIST)
            .describe("每一發往前推幾格（GGD 單位，⛔ 不是 WC3 單位）。"),
          startDist: z
            .number()
            .min(0)
            .max(DELAYED_MAX_STEP_DIST)
            .optional()
            .describe("第一發離施法者多遠。留空＝0，第一發就在腳下。"),
          dir: z
            .enum(["facing", "target"])
            .optional()
            .describe(
              "這條線往哪指：target（預設，從施法者穿過觸發者）或 facing（身體當下面向）。" +
                "方向在施放那一刻凍住，之後轉身不會把線掰彎。",
            ),
        })
        .strict()
        .optional(),
      hitOncePerTarget: z
        .boolean()
        .optional()
        .describe(
          "同一個人整串只吃一次（一條掃過去的線，卡片寫的是一次的傷害）。留空＝每一段都吃。",
        ),
      dropDeadTargets: z
        .boolean()
        .optional()
        .describe("鎖定的目標死了就跳過他。留空＝跳過（不繼續鞭屍）。"),
      stopOnCasterDeath: z.boolean().optional(),
    })
    .strict(),

  /**
   * ⭐ S5【代放】(80-04 赤兔咆哮「攻擊時有 20% 使出弒鬼神」)。
   *
   * ⚠️ `content/templates/expand.ts` 的 `"proxy-cast"` 是一個**模板家族名**，
   * 不是這個 kind（它自己的檔頭寫著「這裡不召喚任何東西」）。
   * ⛔ 終止性由 `EffectContext.proxyDepth` 嚴格遞增 + {@link PROXY_MAX_CHAIN_DEPTH}
   * 保證，形狀與 `damage.incomingPct` 的 `reflectDepth` 逐字相同。
   */
  z
    .object({
      kind: z.literal("proxyCast"),
      ...EFFECT_COMMON_SHAPE,
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
      shape: z.enum(["single", "circle"]),
      radius: z.number().positive().max(40).optional(),
      /** ⭐ AoE 級別（owner 2026-08-11「原則上不寫範圍數字」）。填了它就不要填
       *  `radius` —— 註冊時由 `config.aoe-tiers@1` 翻成半徑，兩者都填則**級別贏**。
       *  唯一的查表處：`content/aoeTiers.ts` 的 `resolveRadiusTier`。 */
      radiusTier: zAoeTier.optional(),
      side: z.enum(["allies", "enemies"]).optional(),
      maxTargets: z.number().int().positive().max(24).optional(),
      /** 代放**我自己的哪一格**。與 `abilityId` **恰好填一個**（superRefine 擋）。 */
      slot: zCastableSlot.optional(),
      /**
       * 代放**哪一支具名技能**。**軟參照**：代放的目標可能是一支還沒上架的技能，
       * 硬參照會讓白名單一縮就整份內容載入失敗（2026-08-02 事故的形狀）。
       */
      abilityId: zRef<AbilityId>("abilities", { soft: true }).optional(),
      payCosts: z
        .enum(["none", "mana", "manaAndCooldown"])
        .optional()
        .describe(
          "代放要不要付代價：none（預設，不扣魔也不轉冷卻）／mana（扣魔）／" +
            "manaAndCooldown（扣魔並讓那一格進冷卻）。⚠️ 一個每次普攻都可能觸發的" +
            "代放若會轉冷卻，那支大招就會自己把自己鎖住。",
        ),
      respectCooldown: z
        .boolean()
        .optional()
        .describe("代放要不要看那一格按鈕的冷卻。留空＝不看（冷卻中照樣代放）。"),
      requireLearned: z
        .boolean()
        .optional()
        .describe("沒點那一招時什麼都不發生。留空＝要求已學會。"),
      rankMode: z
        .enum(["casterRank", "fixed"])
        .optional()
        .describe("用哪一階施放：casterRank（預設，玩家點的等級）或 fixed。"),
      fixedRank: z.number().int().min(1).max(5).optional(),
      targetMode: z
        .enum(["inherit", "reresolve"])
        .optional()
        .describe("目標從哪來：inherit（預設，沿用觸發這次的那個目標）或 reresolve。"),
      /** 代放鏈最多再往下幾層。省略 = 0（被代放的技能自己的代放直接被擋）。 */
      maxDepth: z.number().int().min(0).max(PROXY_MAX_CHAIN_DEPTH).optional(),
      /**
       * ⭐ 第一守則（2026-08-10）—— `payCosts:"none"` 要不要發
       * `onAbilityCast` / `onAbilityHit`。省略 = `false` = **今天的行為**。
       *
       * 在這一格出現之前，「不發」是寫死在 handler 裡的一個沒有欄位的選擇：
       * `"none"` 那條路直接 `runEffects`，繞過 `castAbility`，所以那兩個事件從來
       * 不發。⛔ 而那正是「這裡選 A 還是 B」——「代放算不算一次施法」是**設計偏好**，
       * 不是引擎事實：80-04 的赤兔咆哮不該再觸發一輪「施法時」被動（會遞迴），
       * 但一支「大絕結束後自動再放一次 Q」的卡片會希望它算數。
       *
       * ⚠️ `"mana"` / `"manaAndCooldown"` 走 `castAbility`，那兩個事件**本來就會發**，
       * 所以這一格對它們沒有作用（handler 只在 `"none"` 那條路讀它）。
       */
      emitCastEvents: z
        .boolean()
        .optional()
        .describe(
          "不付代價的代放要不要算成一次「施法」（發出施法/命中事件，讓「施法時」" +
            "那一類被動吃得到）。留空＝不發（今天的行為）。⚠️ 打開它之前先看" +
            "「最多再往下幾層」：一支被代放的技能若自己掛著「施法時代放」的被動，" +
            "這一格就是那條鏈的入口；終止靠的是深度上限，不是靠這一格關著。",
        ),
    })
    .strict(),

  /** 【魔力屏障】(44-00 機警)。⛔ 不是受傷後補護盾。 */
  z
    .object({
      kind: z.literal("manaBarrier"),
      ...EFFECT_COMMON_SHAPE,
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
      shape: z.enum(["single", "circle"]),
      radius: z.number().positive().max(40).optional(),
      /** ⭐ AoE 級別（owner 2026-08-11「原則上不寫範圍數字」）。填了它就不要填
       *  `radius` —— 註冊時由 `config.aoe-tiers@1` 翻成半徑，兩者都填則**級別贏**。
       *  唯一的查表處：`content/aoeTiers.ts` 的 `resolveRadiusTier`。 */
      radiusTier: zAoeTier.optional(),
      side: z.enum(["allies", "enemies"]).optional(),
      maxTargets: z.number().int().positive().max(24).optional(),
      who: z.enum(["self", "target"]).optional(),
      perMana: z.number().positive().max(MANA_BARRIER_MAX_PER_MANA),
      /**
       * **必填、明列**（同 `zItemBlockGrant.damageTypes`）：「可抵擋**全部**傷害」
       * 是這個陣列的內容，不是程式裡的一行 `if`。`.min(1)` —— 空陣列 = 沒有屏障，
       * 而那是一份「掛得上、不會擋」的文件。
       */
      damageTypes: z.array(zDamageType).min(1).max(3),
      minManaReserve: z.number().min(0).max(10000).optional(),
      /**
       * **選填**（GH#307，owner 2026-08-09：「這個技能是常駐沒錯，這個也是參數之一，
       * 也可以設定秒數，但**共同的強制停止都是魔力耗盡**」）：
       * 省略 = **常駐**到魔力耗盡；填數字 = 到期或魔力耗盡，先到先停。
       * ⛔ 在此之前它是必填，所以「常駐」寫不出來 —— 作者只能填一個猜的秒數。
       */
      durationSec: z.number().positive().max(MANA_BARRIER_MAX_DURATION_SEC).optional(),
    })
    .strict(),

  /** 【受傷延長增益】(52-01 狂戰士之怒)。⭐ `maxRemainingSec` 必填（正回饋）。 */
  z
    .object({
      kind: z.literal("extendBuff"),
      ...EFFECT_COMMON_SHAPE,
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
      shape: z.enum(["single", "circle"]),
      radius: z.number().positive().max(40).optional(),
      /** ⭐ AoE 級別（owner 2026-08-11「原則上不寫範圍數字」）。填了它就不要填
       *  `radius` —— 註冊時由 `config.aoe-tiers@1` 翻成半徑，兩者都填則**級別贏**。
       *  唯一的查表處：`content/aoeTiers.ts` 的 `resolveRadiusTier`。 */
      radiusTier: zAoeTier.optional(),
      side: z.enum(["allies", "enemies"]).optional(),
      maxTargets: z.number().int().positive().max(24).optional(),
      who: z.enum(["self", "target"]).optional(),
      /** 要延長的那個 buff 的 `applyBuff.stackKey`。 */
      stackKey: z.string().min(1).max(64),
      addSec: z.number().positive().max(EXTEND_BUFF_MAX_ADD_SEC),
      perDamagePctOfMaxHealth: z
        .number()
        .positive()
        .max(EXTEND_BUFF_MAX_THRESHOLD_PCT)
        .optional(),
      perDamageFlat: z.number().positive().max(100000).optional(),
      basis: z.enum(["raw", "mitigated", "hpLost"]).optional(),
      /**
       * ⭐ **必填**，不是選填的保險：這條機制是正回饋（挨越多、越久），
       * 沒有上界會變成永久，而症狀是「這個回合打不完」—— 一個不會讓任何測試
       * 變紅的故障。理由完整寫在 `sim/effects/extendBuff.ts` 檔頭③。
       */
      maxRemainingSec: z.number().positive().max(EXTEND_BUFF_MAX_REMAINING_SEC),
    })
    .strict(),
  /**
   * carry — 【背負】(禰豆子的木箱)。把一名隊友收進箱子:身體跟著載具走、
   * 期間**不可被選取**,到期放下。mirrors the `carry` member of `EffectDef`。
   *
   * ⛔ 「不可選取」**不是**無敵:四根軸逐字沿用 `sim/stealth.ts::StealthRules`
   * 已經命名的那四根,⛔ 不發明第二套詞彙。`abilityAoe` 預設 **false** ——
   * 一發打在腳下的 AoE 照樣打得到箱子裡的人。
   */
  z
    .object({
      kind: z.literal("carry"),
      ...EFFECT_COMMON_SHAPE,
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
      shape: z.enum(["single", "circle"]),
      radius: z.number().positive().max(40).optional(),
      radiusTier: zAoeTier.optional(),
      /** 誰躲得進箱子。省略 = `allies`。 */
      side: z.enum(["allies", "enemies"]).optional(),
      /** 一次背幾個。省略 = 1。 */
      maxTargets: z.number().int().min(1).max(CARRY_MAX_PASSENGERS).optional(),
      /**
       * 背多久（秒）。**必填**：一個沒有期限的背負 = 一名英雄整回合退出戰鬥
       * 而且不可選取，而那在畫面上跟「這個人卡住了」一模一樣。
       */
      durationSec: z.number().min(0.1).max(CARRY_MAX_SEC),
      /**
       * 「不可選取」的四根軸。省略整格 = `{autoAcquire:true, mobAggro:true,
       * manualTarget:true, abilityAoe:false}`。
       */
      untargetable: z
        .object({
          autoAcquire: z.boolean().optional(),
          mobAggro: z.boolean().optional(),
          manualTarget: z.boolean().optional(),
          abilityAoe: z.boolean().optional(),
        })
        .strict()
        .optional(),
      /**
       * 「只有生命低於 15% 的隊友躲得進來」這一類的**逐一過濾**。
       *
       * ⛔ 只能寫在這裡：`onInterval` 的 hook 不帶 target，hook 層的
       * `subject:"target"` 葉子一律讀 FALSE。
       */
      victimCondition: zVictimCondition,
      /** 交給**真的上車的那群人**的效果（回血、冷卻鎖）。⛔ 不是新機制。 */
      onHitTargets: z.array(zEffectDef).optional(),
      /** 載具死了乘客怎麼辦。省略 = `release`（放下、恢復可選取）。 */
      onCarrierDeath: z.enum(["release", "drop"]).optional(),
    })
    .strict(),
  /**
   * convertTeam — 【陣營轉換】(大師球)。把一隻單位**暫時**借到自己這一隊。
   * mirrors the `convertTeam` member of `EffectDef`。
   *
   * ⛔ 這一版**沒有** `toTeam`（`"neutral"` 那個成員）與 `killCredit`：
   * flag 只編 0..3，多一個成員就是「下拉裡有、引擎不發」；而
   * `summon.killCredit:"owner"` 至今被 handler 拒絕，⛔ 不要一個只有單一
   * 合法成員的 enum。
   */
  z
    .object({
      kind: z.literal("convertTeam"),
      ...EFFECT_COMMON_SHAPE,
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
      shape: z.enum(["single", "circle"]),
      radius: z.number().positive().max(40).optional(),
      radiusTier: zAoeTier.optional(),
      /** 什麼時候歸位。省略 = `death`（打死才還）。 */
      until: z.enum(["death", "duration", "roundEnd"]).optional(),
      /** 借多久（秒）。只有 `until:"duration"` 讀得到它。 */
      durationSec: z.number().positive().max(CONVERT_TEAM_MAX_SEC).optional(),
      /** 同時能控幾隻。省略 = 2。 */
      maxHeld: z.number().int().min(1).max(CONVERT_TEAM_MAX_HELD).optional(),
      /** 同一個受害者一回合能不能被重捕。省略 = `true`（不能）。 */
      oncePerRoundPerVictim: z.boolean().optional(),
      /**
       * ⚠️ **勝負語意的開關**（拿給 owner 的那一格）。
       *
       * `MatchController.teamAliveCount` 讀 `seat.teamId`（捕獲不動它），而
       * `sim/revive.ts::teamAliveInZone` 讀 `world.team`（捕獲會動）——
       * 被我方捕獲的**敵方英雄**，在勝負判定上算不算還替敵隊活著。
       *
       * ⭐ **省略 = `false`** —— owner 2026-08-18 逐字：「物理意義上，我們比較像是**複製一個敵方隊友短暫在這一回合加入我方**，所以**實質上這個單位就是我方單位**，就算他造成任何傷害或者戰績都是算在我方而非那個敵方單位上」
       *
       * ⚠️ 這**推翻**了盤點時的建議（維持 `true`＝仍替敵隊活著）。第〇·六守則：
       * 高層級（owner 的新裁決）贏，而且**預設啟動**；`true` 留著是為了一鍵回頭，
       * ⛔ 不替它寫第二條測試。
       */
      countsForOriginalTeam: z.boolean().optional(),
    })
    .strict(),
]);

/**
 * 帶著一發傷害封包的事件 —— 也就是 `EffectContext.incoming` 唯一會被填的那幾個。
 * 是 `combatResolveSystem` 裡那幾個帶 `trigger` 的 `fireHooks` 的**唯一**真實來源
 * 鏡像（`onDamageDealt` / `onDamageTaken` 是直接發，`onReflectSuccess` 走
 * `pendingReflectHooks` → `ReflectHookSystem`，但帶的是同一個 `trigger` 物件）。
 */
const DAMAGE_BEARING_EVENTS: readonly string[] = [
  "onDamageTaken",
  "onDamageDealt",
  // 2026-08-08 —— 第三個。`onReflectSuccess` 是在**反彈封包落地的那一格**發的
  //（`combat/damage.ts` 排空迴圈裡，`trigger` 就是那一發封包本身），所以它跟
  // 上面兩個一樣帶得到 `EffectContext.incoming`。
  // ⛔ 少了這一列，20-002「[反彈]成功時…每次造成 7 倍[反彈]傷害」會在**載入時**
  // 被這個 refine 拒絕 —— 引擎做得到、schema 不收，也就是最貴的那種假的缺口。
  "onReflectSuccess",
];

/**
 * 把「只有帶傷害的事件才談得上『那一發』」變成一個**載入時的解析錯誤**,
 * 而不是一句註解。
 *
 * 它擋的是失敗形態 ②(做了但玩家拿不到)的一個非常安靜的變體:把
 * `damageSource: "basic"` 或 `damage.incomingPct` 掛在 `onKill` / `onBasicAttack`
 * / `onInterval` 上。schema 收得下、後台存得起來、卡片上看得到,而 sim 永遠
 * 不會給那些事件一發封包 —— 於是那條 hook **一次都不會觸發**,或者反彈永遠是 0,
 * 沒有任何錯誤訊息。
 *
 * ⚠️ 只看 `effects` 的**第一層**。巢狀 payload(`spawnProjectile.onHit`、
 * `applyBuff.hooks[]`、`leap.onLand`)不在這裡檢查,因為那些 payload 在**另一個**
 * 時間點執行,那時 `ctx.incoming` 本來就已經沒有了 —— 那是一個不同的、更難的問
 * 題,而一個假裝檢查了的淺掃比誠實地只掃一層更糟。sim 那一側的
 * `damage.incomingPct` 對沒有 `incoming` 的情況是**整條不執行**,所以巢狀誤用的
 * 後果是「什麼都不做」,不是「付一半」。
 */
/**
 * 每一次評估都**要付一次代價**的條件葉子 —— `onInterval` 漏填
 * `internalCooldown` 時,這些是把「每秒 30 次」從一句註解變成一個問題的那些。
 *
 * ⚠️ **這張表是 refine 的全部**,所以加葉子的人要順手看一眼這裡。今天只有
 * 一個成員:
 *
 *   · `"chance"` —— 每一次評估**抽一次 `world.rng`**。掛在沒有 ICD 的
 *     `onInterval` 上就是每 tick 一抽 × 每個持有者,而抽籤是**亂數流**上的
 *     動作:一份這樣的文件不只是慢,它會讓那一場的 seed 以 30Hz 前進,
 *     任何人事後想從錄影推理都要先扣掉它。
 *
 * 批 10 的空間葉子(`enemyChampionWithinRange`:沒有敵人在範圍內時 ICD 閘
 * **不會**擋,因為 `hookLastFired` 只在成功發射後才寫,所以條件會每 tick 做
 * 一次網格查詢)加進這張表就自動被擋 —— 那正是決策點 1-5 選 A 的理由,
 * 而這張表就是它落地的地方。
 */
const INTERVAL_BUDGET_CONDITION_KINDS: readonly string[] = ["chance"];

/**
 * 這棵條件樹裡有沒有任何一顆「每次評估都要付錢」的葉子。
 *
 * ⭐ EXPORTED（2026-08-10）—— `schema/ability.ts` 的 `zAbilityAugmentTarget`
 * 用同一支函式擋掉「強化的前提含機率葉」。兩處問的是**同一個**問題（這棵樹每次
 * 求值會不會抽 `world.rng`），所以共用一份；抄第二份的那一天，加新葉子的人只會
 * 想到更新其中一邊。
 */
export function hasBudgetedLeaf(cond: unknown): boolean {
  if (!cond || typeof cond !== "object") return false;
  const c = cond as Record<string, unknown>;
  if (typeof c.kind === "string")
    return INTERVAL_BUDGET_CONDITION_KINDS.includes(c.kind);
  for (const key of ["all", "any"] as const) {
    const arr = c[key];
    if (Array.isArray(arr) && arr.some(hasBudgetedLeaf)) return true;
  }
  return hasBudgetedLeaf(c.not);
}

export function refineHookDamageContext(
  hook: {
    on: string;
    damageSource?: string | undefined;
    damageType?: string | undefined;
    damageCrit?: string | undefined;
    critSource?: string | undefined;
    reflectedDamageSource?: string | undefined;
    reflectedDamageType?: string | undefined;
    perTarget?: boolean | undefined;
    chance?: number | undefined;
    chanceFrom?: { min: number; max: number } | undefined;
    internalCooldown?: number | undefined;
    condition?: unknown;
    effects: readonly { kind: string; incomingPct?: unknown }[];
  },
  ctx: z.RefinementCtx,
): void {
  // ── `onInterval` 的節奏 (批 1, 決策點 1-5) ────────────────────────────────
  //
  // owner 的 TSV 把節奏寫成 `interval: 0.5`。引擎的欄位叫 `internalCooldown`,
  // 而 `zHookDefBase` 是 `.strict()`,所以 `interval` 這個 key 本身進不來 ——
  // 問題不在拼錯,在**漏填**:`onInterval` 沒有 `internalCooldown` = 每一 tick
  // 都發 = 30 次/秒,而那在畫面上跟「每 0.5 秒一次」長得一模一樣,只是更燙。
  //
  // ⚠️ 為什麼不是「一律要求 `internalCooldown`」:03-00 相轉移裝甲的常駐魔免
  // **就是**要每 tick 發,出貨的 7 條 `onInterval` 也全部有 ICD。所以這條只擋
  // 「每次評估都要付錢的條件 + 沒有節奏」這個組合 —— 見
  // {@link INTERVAL_BUDGET_CONDITION_KINDS}。
  //
  // CLAUDE.md 的 fail-loud 條款:錯誤要在**編輯發生的當下**響(載入這份文件
  // 就爆,訊息由 `SchemaValidationError` 冠上 collection + 文件 id),
  // 不是等到某條剛好跑到它的測試。
  if (
    hook.on === "onInterval" &&
    !hook.internalCooldown &&
    hasBudgetedLeaf(hook.condition)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["internalCooldown"],
      message:
        "onInterval + 需要每次評估付出代價的條件(" +
        `${INTERVAL_BUDGET_CONDITION_KINDS.join(" / ")})卻沒有 internalCooldown ——` +
        " 這條 hook 會**每一 tick**(30 次/秒)評估一次條件並抽一次亂數。" +
        "節奏就寫在 internalCooldown(0.5 = 每 0.5 秒),那個欄位本來就存在;" +
        "owner TSV 上的 `interval` 指的就是它,不是第二個欄位。",
    });
  }
  // ── 機率的兩個欄位:互斥,而且區間不可以顛倒 ──────────────────────────────
  // 這一段**在 DAMAGE_BEARING_EVENTS 的 early-return 之前**,因為機率跟事件
  // 帶不帶封包無關 —— 放在後面的話,`onDamageTaken` 上的一份壞文件會安靜地
  // 通過(而 [反彈] 那一族全都掛在那兩個事件上)。
  if (hook.chance !== undefined && hook.chanceFrom !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["chanceFrom"],
      message:
        "chance 與 chanceFrom 不能同時出現 —— 「相乘還是取代」這個問題沒有正確答案, " +
        "而任何一種選法都會在某一張卡上讀起來像 bug。要活的門檻就只留 chanceFrom。",
    });
  }
  if (
    hook.chanceFrom !== undefined &&
    hook.chanceFrom.min > hook.chanceFrom.max
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["chanceFrom", "min"],
      message:
        `min ${hook.chanceFrom.min} > max ${hook.chanceFrom.max} —— 顛倒的區間會讓 clamp ` +
        "永遠回傳 min,也就是一件「機率性」道具安靜地卡在一個固定值上。",
    });
  }
  // ── S10：`reflected*` 只有 `onReflectSuccess` 帶得到原封包 ──────────────────
  // ⚠️ 它**不能**併進下面那個 for 迴圈：那個迴圈的條件是「不是帶傷害的事件」，
  // 而這兩格更窄 —— `onDamageTaken` / `onDamageDealt` 也帶不到「被反彈掉的原封包」。
  // ⛔ 少了它就是失敗形態②：schema 收得下、後台存得起來、卡片上寫著「反彈技能傷害
  // 時」，而 sim 永遠不會給那個事件一份原封包。
  // 這一段在 early-return **之前**，理由與上面機率那一段逐字相同。
  for (const [key, val] of [
    ["reflectedDamageSource", hook.reflectedDamageSource],
    ["reflectedDamageType", hook.reflectedDamageType],
  ] as const) {
    if (val === undefined || val === "any") continue;
    if (hook.on === "onReflectSuccess") continue;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [key],
      message:
        `「${val}」問的是**被反彈掉的那一發原封包**長什麼樣,只有 onReflectSuccess ` +
        `帶得到它。掛在 ${hook.on} 上這條 hook 一次都不會觸發。`,
    });
  }
  // ── S6：`perTarget` 需要一個「對象」。`onInterval` 發射時沒有 ───────────────
  if (hook.perTarget === true && hook.on === "onInterval") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["perTarget"],
      message:
        "perTarget 問的是「對每個敵人各算一次」,而 onInterval 發射時沒有對象 —— " +
        "這一格在那裡退化成一份共用額度,也就是一個看起來有設、實際上沒作用的設定。",
    });
  }
  // ── 45-00：免傷只有**被打的那一側**問得到 ─────────────────────────────────
  //
  // ⚠️ 這一段在 2026-08-10 換過一次，換掉的理由要留著（第三守則）：
  // 它**本來**禁的是「帶 `negateOriginal` 的 hook 不可以有 chance / chanceFrom /
  // internalCooldown」，支撐是「扣血那一半與反彈那一半會各問一次，兩次可以分岔」。
  // 而落地的實作把兩者併成**同一次詢問**（帶免傷的 `onDamageTaken` hook 只在扣血前
  // 的預掃描裡執行一次，含 ICD 與擲骰；`fireHooks` 一律跳過它們）——
  // 一個判定點就**不可能**分岔，所以那個禁令的支撐消失了。
  //
  // ⛔ 而它擋住的正是 owner 親自裁決的 45-00 寫輪眼（「有 **20% 機率**反彈魔法傷害」）：
  // 照裁決寫下去會是 PARSE ERROR。留著它 = 一格會拒絕正確內容的閘。
  //
  // 換上的這一條擋的是真的問不出答案的情況：免傷是「這一發不扣**我**的血」，
  // 只有被打的那一側帶得到「即將扣掉的那一發」。掛在 `onDamageDealt`（攻擊者視角）
  // 或任何別的事件上，那條 hook 一次都不會被預掃描看到 —— 而畫面上跟「這張卡就是
  // 沒生效」一模一樣（失敗形態②）。
  const negates = hook.effects.some(
    (e) =>
      e.kind === "damage" &&
      (e.incomingPct as { negateOriginal?: boolean } | undefined)?.negateOriginal === true,
  );
  if (negates && hook.on !== "onDamageTaken") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["on"],
      message:
        "免傷是「這一發不扣我的血」，只有被打的那一側問得到 —— onDamageTaken 是唯一" +
        `帶得到「即將扣掉的那一發」的事件。掛在 ${hook.on} 上這條 hook 的免傷一次都` +
        "不會生效。",
    });
  }
  if (DAMAGE_BEARING_EVENTS.includes(hook.on)) return;
  if (hook.damageSource !== undefined && hook.damageSource !== "any") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["damageSource"],
      message:
        `「${hook.damageSource}」是對觸發傷害的過濾,只有 ${DAMAGE_BEARING_EVENTS.join(" / ")} ` +
        `帶得到那一發封包。掛在 ${hook.on} 上這條 hook 一次都不會觸發。`,
    });
  }
  // B2 (2026-08-05) —— 新的兩格走**同一道閘**,不是第二套規則。
  // 它們與 `damageSource` 是同一族(都在問「觸發這一次的那一發封包長什麼樣」),
  // 所以「只有帶傷害的事件談得上『那一發』」對它們逐字成立。
  //
  // ⚠️ 這一段存在的理由就是失敗形態 ②:一條 `damageCrit: "crit"` 掛在
  // `onInterval` 上,schema 收得下、後台存得起來、卡片上寫著「暴擊時」,
  // 而 sim 永遠不會給那個事件一發封包 —— 它一次都不會觸發,沒有任何錯誤訊息。
  for (const [key, val] of [
    ["damageType", hook.damageType],
    ["damageCrit", hook.damageCrit],
    // ⭐ G8（2026-08-10）—— 走**同一道閘**，不是第二套規則：它與上面兩格是同一族
    // （都在問「觸發這一次的那一發封包長什麼樣」）。
    ["critSource", hook.critSource],
  ] as const) {
    if (val === undefined || val === "any") continue;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [key],
      message:
        `「${val}」是對觸發傷害的過濾,只有 ${DAMAGE_BEARING_EVENTS.join(" / ")} ` +
        `帶得到那一發封包。掛在 ${hook.on} 上這條 hook 一次都不會觸發。`,
    });
  }
  hook.effects.forEach((e, i) => {
    if (e.kind === "damage" && e.incomingPct !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effects", i, "incomingPct"],
        message:
          `[反彈] incomingPct 反彈的是「觸發這個 hook 的那一發傷害」,只有 ` +
          `${DAMAGE_BEARING_EVENTS.join(" / ")} 帶得到它。掛在 ${hook.on} 上永遠反彈 0。`,
      });
    }
  });
}

/**
 * `.strict()` OBJECT 版本,給 `schema/item.ts` 的 `.extend()` 用。
 *
 * 分成兩個名字的原因很實際:`zHookDef` 加了 `superRefine` 之後是 `ZodEffects`,
 * 而 `ZodEffects` 沒有 `.extend()`。`zAuraDef` / `zItemAuraDef` 已經踩過同一個
 * 坑(那邊用的是 `.innerType()`)。item.ts 會把同一個 refine 再套一次,兩邊共用
 * `refineHookDamageContext` 這一個函式,所以規則不可能只在一邊生效。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ 寫卡片的人最常打錯的四個字 —— **它們都不是缺的功能,是拼寫**
 * ════════════════════════════════════════════════════════════════════════════
 * 稜彩增益卡的規格 TSV 用的是一套人話字彙,而其中四個字在引擎裡**已經有對應的
 * 欄位**。照 TSV 字面新增欄位的唯一產出是**同義詞**,而同義詞是最貴的一種技術
 * 債:兩個都填得起來、誰贏要靠註解解釋,而註解會過期(CLAUDE.md 第三守則)。
 *
 *   TSV 寫的            引擎已出貨的                        住在哪裡
 *   ──────────────────  ──────────────────────────────────  ─────────────────
 *   op: "conversion"    op: "percentOf" + from/fromResource  ModOp.PercentOf
 *                                                            (sim/stats/modifiers.ts)
 *   op: "set"           op: "override"                       ModOp.Override
 *   conditions: [ … ]   condition: { all: [ … ] }            本檔 `condition`
 *   interval: 0.5       internalCooldown: 0.5                本檔 `internalCooldown`
 *
 * 前三個由 `.strict()` 自動擋(未知的 key → 解析錯誤,而 `SchemaValidationError`
 * 會冠上 collection 與文件 id)。第四個擋得到「漏填」但擋不到「拼錯」,所以它
 * 另有一段 refine —— 見 `refineHookDamageContext` 的 `onInterval` 那一段。
 */
export const zHookDefBase = z
  .object({
    on: zHookEvent,
    /**
     * ⭐ S3 —— 這條觸發器在它所屬的那份被動／道具裡的**穩定名字**，讓
     * `modifyCooldown{target:"hookInternalCooldown"}` 指得到它。
     * 省略 = 沒有名字 = 沒有任何效果指得到它（也就是今天）。
     * ⭐ 形狀抄 `zAuraDef.key`。⛔ **不可以用陣列索引定址** —— `hooks[2]` 在作者
     * 插入一條新觸發器的那一刻就指到別人身上，而畫面上完全看不出來。
     */
    key: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe("這條觸發器的名字（讓「重置這條觸發器的冷卻」指得到它）。同一份被動裡不要重複。"),
    /** restrict to one slot; "PASSIVE" is the level-1 天生技 (zCastableSlot). */
    abilitySlot: zCastableSlot.optional(),
    effects: z.array(zEffectDef),
    /**
     * 內部冷卻(**秒**):這條 hook 真的發動過一次之後,要隔多久才能再發動。
     * 留空 / 0 = 沒有冷卻(每一次事件都算)。抽輸 / 條件不成立**不燒冷卻**
     * (sim/effects/hooks.ts 的順序註解)。道具來源還會再乘後台 combat-env 的
     * `itemCooldown`。上界見 {@link HOOK_INTERNAL_COOLDOWN_MAX_SEC}。
     */
    internalCooldown: z
      .number()
      .min(0)
      .max(HOOK_INTERNAL_COOLDOWN_MAX_SEC)
      .optional(),
    /** proc probability 0..1 on the seeded rng (absent = always) */
    chance: z.number().min(0).max(1).optional(),
    /**
     * 機率 = 一項三圍 × 係數,夾在 `[min, max]` —— 朗基努斯之槍 godie-i018
     * 「(總敏捷)% 機率」。mirrors `HookDef.chanceFrom` in sim/stats/modifiers.ts,
     * where the determinism argument (抽的次數與位置完全沒變,動的只有門檻)
     * and the 「為什麼 `chance` 不夠」 derivation live.
     *
     * `coeff` 上界 `CHANCE_PER_ATTR_MAX` 是**打錯數字的守衛**:寫 1 而不是
     * 0.01 等於「一點敏捷 = 100%」,而 clamp 會幫它藏起來 —— 一個永遠觸發的
     * 「機率性」道具在 diff 裡跟正確的長得一樣。
     *
     * `min`/`max` 兩端都是欄位:「(總敏捷)%」在後期無界(120 敏 = 120%),
     * 而要不要真的讓它變成必定觸發是 owner 的決定。`min <= max` 由
     * {@link refineHookDamageContext} 檢查(一個上下顛倒的區間會讓 clamp 回傳
     * `min`,也就是一個安靜地永遠不觸發的道具)。
     *
     * ⚠️ 2026-08-01 更正:這一段原本寫「在下面的 `refineHookChance` 檢查」,
     * 而**全樹沒有任何一個叫 `refineHookChance` 的東西**(第三守則)。那個檢查
     * 從一開始就住在 `refineHookDamageContext` 的最前面 —— 而且是刻意放在
     * `DAMAGE_BEARING_EVENTS` 的 early-return **之前**,那個順序本身有註解在守。
     * 名字指錯的註解比沒有註解更貴:它會讓下一個人去找一個不存在的函式,
     * 然後以為這條規則沒被實作。
     *
     * ⚠️ **沒有常數項**:門檻是 `clamp(三圍 × coeff, min, max)`,不是
     * `flat + 三圍 × coeff`。w3x 那一族 `(5 + 敏捷/15)%` 的技能因此**寫不進來**
     * (拿 `min` 當常數會得到 `max(0.05, agi×coeff)`,在 75 敏以下與文案差最多
     * 5 個百分點)。要移植那一族就是加一個 flat 欄位,不是在文件裡寫近似值 ——
     * 見 `content/fieldAdoption.test.ts` 對這個 key 的豁免。
     */
    chanceFrom: z
      .object({
        attr: z.enum(["str", "agi", "int"]),
        basis: z.enum(["base", "total"]).optional(),
        coeff: z.number().min(0).max(CHANCE_PER_ATTR_MAX),
        min: z.number().min(0).max(1),
        max: z.number().min(0).max(1),
      })
      .strict()
      .optional(),
    /**
     * 觸發條件 — the general 「什麼時候才觸發」 gate (owner 2026-07-30). Absent =
     * always, so every hook authored before this field is untouched.
     *
     * ⚠️ AUTHORED HERE, ON `zHookDef` ITSELF, AND NOT ON A PER-COLLECTION EXTEND
     * THE WAY `requires` IS. The two fields answer different questions and
     * therefore belong at different levels: `requires` is 「這位英雄配不配得上這
     * 張卡」, which only has meaning for a thing a champion EQUIPS, so item.ts
     * extends `zHookDef` to add it. A condition is 「這一下算不算數」, which is
     * meaningful for every hook carrier there is — ability passives, 天生技,
     * champion passives, augments, auras and items — and 獸矛 (an ability),
     * 僵屍王 A022 (an ability) and the 「X% 機率造成 Y」 item family all need it
     * at once. Putting it on the base is what stops this from becoming three
     * near-identical fields with three near-identical editors.
     */
    condition: zEffectCondition.optional(),
    /**
     * 效果打在誰身上:事件的那個實體(預設)、hook 的持有者("self"), 或**全隊**
     * ("allies")。
     *
     * `"allies"` 是 天生牙 godie-i031 的「我方所有英雄」/「我們全部英雄」——
     * 成員是「同隊、有 ChampionComp 的每一位, 含自己, **含死掉的**, 依實體 id 排序」,
     * 完整的理由與每一條的取捨寫在 sim/stats/modifiers.ts 的 `HookDef.target`。
     * 死人也在名單裡是 `revive` 的全部意義, 而對只作用在活人的 kind 是零成本:
     * `healTarget` / `restoreMana` 對屍體回 0。
     */
    target: z.enum(["self", "event", "allies"]).optional(),
    /**
     * #244 — WHAT the event's entity must be for the hook to fire. Absent =
     * "any" (every pre-#244 hook). Lets one `onKill` doc pay differently for a
     * 部隊 kill and a 英雄 kill.
     */
    victim: z
      .enum([
        "champion",
        "mob",
        "any",
        "enemyChampion",
        "allyChampion",
        "enemy",
      ])
      .optional(),
    /**
     * {@link zHookDefBase.shape.internalCooldown} 的**作用域**(批 1,
     * 決策點 1-4)。`"source"`(省略 = 這一個)= 一份冷卻不分槽位,也就是這個
     * 欄位出現之前每一份文件的行為;`"perAbilitySlot"` = Q/W/E/R/EX/PASSIVE
     * 各記各的(末日預言的 `perAbilityCooldown`)。
     *
     * ⚠️ **只在 `onAbilityCast` / `onAbilityHit` 上真的分得開** —— 其餘事件
     * 發射時沒有槽位,`"perAbilitySlot"` 在那裡退化成一份全域冷卻。完整的
     * 理由與「為什麼是槽位不是技能 id」寫在 `sim/stats/modifiers.ts` 的
     * `HookDef.internalCooldownScope`。
     */
    internalCooldownScope: z.enum(["source", "perAbilitySlot"]).optional(),
    /**
     * [反彈] 觸發這個 hook 的那一發傷害**是不是普通攻擊** —— mirrors
     * `HookDef.damageSource` in sim/stats/modifiers.ts, where the naming
     * (`"nonBasic"` 而不是 `"ability"`)與「無封包 = 不通過」的不對稱都有交代。
     *
     * owner 給反射之盾寫的是「反彈**普通攻擊**傷害 200%」;在這之前
     * `onDamageTaken` 分不出普攻、技能與 DoT,那件道具只能被實作成「反彈所有
     * 傷害」—— 一件強得多的、不同的道具。
     */
    damageSource: z
      .enum(["any", "basic", "nonBasic", "ability", "other"])
      .optional(),
    /**
     * B2 —— 觸發這個 hook 的那一發傷害**是什麼型別**。mirrors
     * `HookDef.damageType` in sim/stats/modifiers.ts。
     *
     * 讀的是**最後一次型別轉換之後**的型別,所以一發被轉成魔法的物理傷害在這裡
     * 是 `"magic"` —— 與護甲／魔抗吃到的那一個相同。
     *
     * 省略 = 不過濾(每一份既有文件逐位元不變)。
     */
    damageType: z.enum(["any", "physical", "magic", "true"]).optional(),
    /**
     * B2 —— 觸發這個 hook 的那一發傷害**是不是暴擊**。mirrors
     * `HookDef.damageCrit` in sim/stats/modifiers.ts。
     *
     * ⚠️ 三值而不是 boolean:`false` 與「沒填」在後台表單上分不開,而
     * 「不過濾」與「只在非暴擊時」是兩件完全不同的事。
     */
    damageCrit: z.enum(["any", "crit", "nonCrit"]).optional(),
    /**
     * ⭐ G8 —— 觸發這個 hook 的那一發暴擊**是不是這一份來源自己那條暴擊來源**
     * 造成的（89-01「**這一招**想起頭槌的那一下把敵人震昏」，不是「這位英雄任何
     * 一次暴擊都震昏」）。
     *
     * 省略 = `"any"` = 不過濾 = {@link zHookDefBase.shape.damageCrit} 今天的行為。
     * ⭐ hook 與暴擊來源本來就住在**同一份** source 上，所以「我自己那一條」是一個
     * **關係**不是一個字串 —— ⛔ 不做「填一個 source id」（那會多一個會腐爛的 join key）。
     */
    critSource: z
      .enum(["any", "thisSource"])
      .optional()
      .describe(
        "只在**這個被動自己的暴擊**觸發時才算：any（預設，任何來源的暴擊都算）或 " +
          "thisSource（只有這份被動自己那條暴擊來源打出來的才算）。",
      ),
    /**
     * ⭐ S10 —— 被**反彈掉的那一發原封包**是不是普通攻擊（60-04「若成功反彈敵方
     * **技能** AP 傷害」）。字彙與 {@link zHookDefBase.shape.damageSource} 完全相同，
     * 因為問的是完全相同的問題，只是主詞換成原封包。
     * ⚠️ 只有 `onReflectSuccess` 帶得到原封包（`refineHookDamageContext` 擋）。
     * 省略 = 不過濾 = 今天（每一條 `onReflectSuccess` 都是無條件觸發）。
     */
    reflectedDamageSource: z
      .enum(["any", "basic", "nonBasic", "ability", "other"])
      .optional()
      .describe(
        "只在被反彈掉的**原本那一發**是某種來源時才算（「反彈到的是技能傷害」）。留空＝不過濾。",
      ),
    /** ⭐ S10 —— 被反彈掉的原封包**是什麼型別**（60-04 的「AP」那一半）。 */
    reflectedDamageType: z
      .enum(["any", "physical", "magic", "true"])
      .optional()
      .describe(
        "只在被反彈掉的**原本那一發**是某種傷害型別時才算（「反彈到的是 AP 傷害」）。留空＝不過濾。",
      ),
    /**
     * ⭐ S6 —— 這條觸發器**總共**能發動幾次（15-04「**下一次**普攻」）。
     * 省略 = **無限次** = 這個欄位出現之前每一條 hook 的行為。
     * ⛔ 不要用「掛一個 duration 極短的增益」假裝一次性：那是**時間**界不是**次數**界，
     * 攻速一高就會吃到兩次，而畫面上跟正確的一模一樣。
     */
    maxTriggers: z
      .number()
      .int()
      .positive()
      .max(HOOK_MAX_TRIGGERS)
      .optional()
      .describe("這條觸發器總共只能發動幾次（「下一次普攻附加雷擊」＝ 1）。留空＝無限次。"),
    /**
     * ⭐ S6 —— 額度什麼時候被扣掉。今天只有 `"fire"`（真的發動的那一刻）。
     * ⚠️ 這一格刻意先存在：它把「這裡有二選一」寫進契約，而 `"hit"`（下游真的打到
     * 人才算）上線那天只是加一個 enum 成員、不是改語意。
     * ⛔ 不先開 `"hit"` —— schema 開了 handler 沒接正是失敗形態②。
     */
    consumeOn: z
      .enum(["fire"])
      .optional()
      .describe("什麼時候扣掉一次額度：fire（預設，觸發器發動的那一刻）。"),
    onConsumed: z
      .enum(["stop", "detachSource"])
      .optional()
      .describe(
        "額度用完之後：stop（預設，觸發器不再發動，但增益與屬性留著）或 " +
          "detachSource（整份來源卸下，圖示跟著消失）。",
      ),
    perTarget: z
      .boolean()
      .optional()
      .describe(
        "額度是每個敵人各一份還是全部共用。留空＝共用一份（「一次性」最直觀的意思）。" +
          "⚠️ 只有帶對象的事件談得上「每個敵人」。",
      ),
  })
  .strict();

/** `zHookDefBase` + 「只有帶傷害的事件談得上『那一發』」的載入時檢查。 */
export const zHookDef = zHookDefBase.superRefine(refineHookDamageContext);

/**
 * ⭐ G4 —— **拿不到技能階級的載體**上，多欄 `perRank` 是一格謊。
 *
 * `fireHooks` 給 hook payload 的 `rank` 來自那一份 `ModifierSource` 的
 * `grantRank`；而**道具 / 增益卡 / 道具靈氣**三種載體結構上沒有階級可言
 * （`economy/itemSource.ts` 與 `economy/draft.ts` 建來源時都沒有 rank 可帶）。
 * 所以掛在它們身上的 payload 永遠只讀得到 `perRank` 的**第 1 欄**。
 *
 * ⛔ **不可以寫成執行期 fallback**：靜默付第 1 欄正是這個缺陷的本體 ——
 * 作者填了三欄、看到的永遠是第一欄，而畫面上跟「這支技能就是這麼弱」一模一樣
 * （失敗形態②）。CLAUDE.md 的 fail-open 條款要求「選擇退回安全值的同時，
 * 要有一個會回非零、或畫面上擋不掉的東西說出來」—— 載入期拒絕就是那個東西，
 * 而且 `SchemaValidationError` 會冠上 collection + 文件 id，**響在編輯發生的
 * 當下**而不是下游某條剛好跑到它的測試。
 *
 * ⚠️ 只填 1 欄（或不填）不會被擋：那是「不分階」，逐份既有文件不變。實測全樹
 * 113 條 hook 一條都不會被它擋下來（帶多欄 `perRank` 的 hook effect：0 條）。
 */
export function refineUnrankedHookPerRank(
  hook: { effects: readonly unknown[] },
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<object>();
  const hit = (node: unknown): boolean => {
    if (node === null || typeof node !== "object") return false;
    if (seen.has(node as object)) return false;
    seen.add(node as object);
    if (Array.isArray(node)) return node.some(hit);
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "perRank" && Array.isArray(v) && v.length > 1) return true;
      if (hit(v)) return true;
    }
    return false;
  };
  if (!hook.effects.some(hit)) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["effects"],
    message:
      "這條觸發器掛在**拿不到技能階級**的載體上（道具／增益卡／道具靈氣），" +
      "它的 payload 只會永遠讀第 1 欄。要分階就把它掛到 ability.passive.ranks[] " +
      "或 applyBuff 上；只想要一個固定值就把 perRank 收成一欄。",
  });
}

/**
 * 靈氣的**人數縮放** —— mirrors `AuraCountScale` in `sim/aura/aura.ts`。
 *
 * ⚠️ 它是一個 plain `.strict()` ZodObject，⛔ **刻意不掛 `.superRefine`**：
 * `schema/item.ts` 的 `zItemAuraDef` 走 `zAuraDef.innerType().extend()`，
 * 而 `.innerType()` 會**靜默丟掉** `zAuraDef` 上的 refine。跨欄位規則
 *（min ≤ max）因此寫在 `zAuraDef` 的 refine 鏈上，並且在 item.ts **再寫一次**
 * —— 兩處都有，才不會出現「道具版的圈沒有被檢查」這個安靜的洞。
 */
export const zAuraCountScale = z
  .object({
    /**
     * **數誰**。⛔ 不給預設，也 ⛔ 不與 `zAuraDef.affects`（這圈打誰）共用：
     * 「打敵人、但強度看我方人數」是一個完全合法的設計，共用一格就寫不出來。
     */
    count: z.enum(["ally", "enemy", "all"]),
    /**
     * 數人的半徑。省略 = **同這圈的半徑**（＝直接沿用 auraSystem 已經跑完的
     * 那一次 `queryOverlap`，零額外成本）。
     */
    radius: z.number().positive().max(40).optional(),
    /**
     * 持有者算不算一個人頭。省略 = `false`。
     *
     * ⚠️ 與 `zAuraDef.includeSelf`（持有者**吃不吃得到**這圈）是**兩件事**，
     * ⛔ 不可共用一格。
     */
    includeSelf: z.boolean().optional(),
    /** 人數低於它 ⇒ 這一圈整份不掛（「離開範圍則失去該增幅」）。省略 = 1。 */
    min: z.number().int().min(1).max(AURA_COUNT_MAX).optional(),
    /**
     * ⭐ **承重、必填**：`stacks` 是**線性**乘數
     *（`stats/statPipeline.ts` 的 `pctMult *= 1 + m.value * stacks`），
     * 所以一條 `pctMult -0.5` 配 stacks 2 就是把對方那條屬性歸零。
     * 一個沒有上界的人數縮放不是平衡問題，是一個回合結束不了的問題。
     */
    max: z.number().int().min(1).max(AURA_COUNT_MAX),
  })
  .strict();

/**
 * One AURA (靈氣) projected by a passive — mirrors `AuraDef` in
 * sim/aura/aura.ts. The 「範圍 R 內的敵人/隊友」 half of the WC3 aura family;
 * `modifiers` above only ever reach the unit carrying the passive.
 */
export const zAuraDef = z
  .object({
    /** stable name, unique within the passive; defaults to the array index */
    key: z.string().min(1).optional(),
    /**
     * BASE radius in sim units, BEFORE the combat-env `abilityRange` factor
     * (#136). The w3x `Area` column converts at the usual rate — 靈壓's 500 WC3
     * units is 9.17 here. The ceiling is a MIS-PARSE guard in the spirit of
     * `ITEM_MODIFIER_LIMITS`, not balance policy: the whole skeleton zone is
     * `boundaryRadius: 24`, so anything past 40 is a map-wide aura and is far
     * more likely to be a raw un-converted WC3 number that leaked through.
     */
    radius: z.number().positive().max(40),
    affects: z.enum(["enemy", "ally", "all"]),
    /**
     * Default: true for ally/all, false for enemy — MEASURED off the retail
     * MPQs (war3 + War3x + War3Patch merged, `Units\AbilityData.slk`), so
     * "WC3 auras buff the caster" is the right default for FRIENDLY auras.
     *
     * ⚠️ An earlier version of this comment said 「25 of the 32 stock aura rows
     * list `self`; the exceptions are exactly Aoar and Aabr」. The second half
     * was false as written: `Aap1`–`Aap4` and `Aasl` also lack `self` — but
     * they are ENEMY auras (`ground,enemy,…`) where `self` is meaningless.
     * Among FRIENDLY auras the exceptions really are the two below. The 25/32
     * count is dropped rather than restated: it was never re-measured.
     *
     * The exceptions are what this field is for. `Aoar` "Aura - Regeneration
     * (Ward)" and `Aabr` "(Statue)" omit `self` (`…,friend,neutral`) while
     * `AIgx`, the same aura on a hero's item, keeps it. 70-00 芬多精 (`A0GM`)
     * inherits `Aoar` and does not override `targets_allowed`, so it heals
     * 白木卡迪那's allies and NOT 白木 — `abilities/godie-e010.passive.json`
     * writes `false` for exactly that.
     */
    includeSelf: z.boolean().optional(),
    modifiers: z.array(zStatModifier).optional(),
    hooks: z.array(zHookDef).optional(),
    /**
     * WC3 aura-buff tail: seconds it lingers after leaving. Default 0.
     *
     * There is NO number to port. `Dur`/`HeroDur` is 0 on all 32 stock aura
     * rows and on both imported auras (`A0GM`, `A0ID`) — WC3's tail is engine
     * behaviour, not ability data — so an authored value here is a design
     * choice (or the anti-flicker knob), never a fidelity restoration.
     */
    lingerSec: z.number().min(0).max(10).optional(),
    /**
     * ⭐ [靈氣人數縮放]（討伐叉「周圍每有一名隊友就更強」）——
     * 這一圈的強度隨**範圍內的人數**變化。
     *
     * ⛔ 掛在**圈**上，不掛在 `zStatModifier` 上：後者會同時開放給四個沒有
     * 「範圍」概念的授權面（道具本體 / 天生技 rank / 增益卡 / applyBuff），
     * 而那四個地方填了它什麼都不會發生（失敗形態②）。
     */
    scaleByNearby: zAuraCountScale.optional(),
  })
  .strict()
  // ⚠️ **一層 refine，⛔ 不是兩層**：`schema/item.ts` 的 `zItemAuraDef` 走
  // `zAuraDef.innerType().extend()`，而 `.innerType()` 只剝**一層** ZodEffects
  // —— 鏈成兩個 `.refine` 的那一刻 `.innerType()` 回的是另一個 ZodEffects，
  // 而 `ZodEffects` 沒有 `.extend`，於是整個 `schema/index.ts` 在 import 時
  // **當場 TypeError**（實測，2026-08-18）。兩條規則因此合在同一個 refine 裡。
  .superRefine((a, ctx) => {
    if ((a.modifiers?.length ?? 0) + (a.hooks?.length ?? 0) === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "aura must carry at least one modifier or hook",
      });
    }
    if (a.scaleByNearby !== undefined && (a.scaleByNearby.min ?? 1) > a.scaleByNearby.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scaleByNearby", "min"],
        message: "scaleByNearby.min 不可以大於 max —— 那是一個永遠掛不上去的靈氣",
      });
    }
  });



/** One rank of `ability@1.passive` — mirrors `AbilityPassiveRank`. */
export const zAbilityPassiveRank = z
  .object({
    modifiers: z.array(zStatModifier).optional(),
    hooks: z.array(zHookDef).optional(),
    auras: z.array(zAuraDef).optional(),
    // ⭐ 2026-08-09：`flight`、⭐ 2026-08-18（GH#373）：`vision` —— 兩者都改由
    // {@link SOURCE_GRANT_SHAPE} 展開（見那裡的說明），所以這裡**不再**單獨列
    // 一格 —— 兩處同名會被後展開的那份靜默蓋掉（`tsc` 的 TS2783 會叫）。
    /**
     * 格擋 this rank grants — see {@link zBlockGrant} and `sim/combat/block.ts`.
     *
     * A FIFTH payload kind, and it is here for the same reason `vision` and
     * `flight` became the third and fourth: 「擋不擋得下這一發」 is not a number
     * on a stat table (型別過濾 + `lethalOnly` disappear the moment you sum it
     * into a `Stat`) and it is not projected onto anybody else.
     *
     * ⭐ 它是**同一個** `ModifierSource.block` 欄位,不是第二套機制 ——
     * `sim/combat/block.ts::blockCutFor` 走 `StatsComp.sources` 而**不看
     * `kind`**,所以一支技能授予的格擋跟一件裝備授予的格擋在鏈式獨立判定、
     * 型別過濾、致死判定與內部冷卻上逐條相同。這一格的整條接線就是
     * `abilities/abilityPassives.ts::rankBlock` 把它轉發到 source 上。
     *
     * 出貨用它的兩支都是招牌被動:20-00 銀色甲胄(Saber 天生技,
     * 「30%機率格擋 100% 魔法傷害」)與 79-002 虛化(卍解狀態下的物理格擋,
     * 配 `whileForm: "alternate"`)。
     *
     * ⭐ 2026-08-09:它與 `critStrike` 一起改由 {@link SOURCE_GRANT_SHAPE} 展開
     * (⛔ 一份,不是四份)。**`block` 這一格一個字都沒變** —— 同一個
     * `zBlockGrant` 實例、同一個鍵名;變的只是它現在跟另外三個授權面共用一份
     * 定義,所以下一個「騎在來源上的授予」不會又出現四份。
     * 而 `critStrike` 是**新的**:owner #299 第 2 條的「一條自己的機率 + 自己的
     * 倍率」在此之前只有道具寫得出來,配 `whileForm` 就寫得出
     * 「只有變身之後才有的暴擊」。
     */
    ...SOURCE_GRANT_SHAPE,
    /**
     * 形態閘 — WHICH BODY this rank's payload is attached to (task #249 變身).
     * ABSENT = `"any"` = attached in both bodies, which is every passive
     * authored before this field existed, so arming it changes nothing until a
     * doc opts in.
     *
     * The hole it fills is stated verbatim in sim/auraCarrier.ts:「There is
     * today NO seam that can make a modifier or an aura exist only while in
     * form X」. 20-01 風王結界 is exactly that card — a TOGGLE whose entire
     * payload is an on-attack orb that must be OFF in the base body — and it
     * could not be authored at all before this.
     *
     * Which form is a DECISION POINT and therefore a dropdown, not a branch
     * picked in code (CLAUDE.md 第一守則): 「只在變身時」 (`alternate`) is
     * 風王結界 / 龍魔人, 「只在本體」 (`base`) is the shape a 變身後失去的天賦
     * needs, and 「都算」 (`any`) is the default.
     *
     * See sim/abilities/abilityPassives.ts for the evaluation and
     * sim/systems/ChampionFormSystem.ts for the re-sync that makes it live.
     */
    whileForm: z.enum(["any", "base", "alternate"]).optional(),
  })
  .strict();

/** `ability@1.passive` — mirrors `AbilityPassive` in sim/content/defs.ts. */
export const zAbilityPassive = z
  .object({
    name: z.string().min(1).optional(),
    ranks: z.array(zAbilityPassiveRank).min(1),
  })
  .strict();
