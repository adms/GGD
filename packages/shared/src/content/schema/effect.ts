/**
 * EffectDef + HookDef schemas — mirror `sim/effects/effect.ts` and
 * `sim/stats/modifiers.ts` exactly (compile-time asserted in compat.test.ts).
 * The discriminated union is exported un-lazied too so the editor form walker
 * can render union cards keyed by "kind".
 */
import { z } from "zod";
import type { EffectDef } from "../../sim/effects/effect";
import type { AbilityId, ProjectileId, StatusId } from "../../ids";
import { zCastableSlot, zRef, zScaling, zStat, zStatModifier } from "./common";
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
  KB_MAX_SPEED,
} from "../../sim/effects/knockbackLimits";
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
} from "../../sim/effects/dynamicTerms";
// 層數的上界 —— 一份表兩個消費端（標記系統與 `applyStatus.stacks`），⛔ 不抄字面值。
import { MARK_MAX_COUNT } from "../../sim/markLimits";
import { TAUNT_MAX_DURATION_SEC, TAUNT_MAX_TARGETS } from "../../sim/taunt";
import { FLIGHT_MAX_HOVER_HEIGHT } from "../../sim/flight";

export const zDamageType = z.enum(["physical", "magic", "true"]);

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
export const HP_PCT_DAMAGE_MAX = 0.35;

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
    const cap =
      (t.scale ?? "ratio") === "points"
        ? RESOURCE_PCT_POINTS_MAX
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
  if (term === undefined) return;
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
        | "randomArea"
        | "manaBarrier"
        | "extendBuff"
        // 契約層（2026-08-09，GH#301-2）：`blink` 用**同一組** shape/radius/
        // side/maxTargets，所以走**同一份**檢查。開第二份的那一天它們會分岔，
        // 而兩份看起來都對。
        | "blink";
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
  for (const k of ["radius", "side", "maxTargets"] as const) {
    if (e.shape === "single" && e[k] !== undefined) {
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
  if (e.slot === undefined && e.abilityId === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["slot"],
      message:
        "要指名**哪一支**技能：填 slot（哪一格）或 abilityId（哪一支）。" +
        "兩個都不填等於改全部六格，而那是全域冷卻縮減（已經有一條屬性在做）。",
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

function refineEffectDef(e: EffectDef, ctx: z.RefinementCtx): void {
  if (e.kind === "dot") return refineDotResourceBudget(e, ctx);
  // Lane 2：共用的 `shape` 檢查 + `extendBuff` 自己的跨欄位規則。
  if (e.kind === "randomArea" || e.kind === "manaBarrier" || e.kind === "extendBuff") {
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
  if (e.kind === "dispel" || e.kind === "shieldBreak" || e.kind === "blink")
    return refineDispelShape(e, ctx);
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
export const SOURCE_GRANT_SHAPE = {
  block: zBlockGrant.optional(),
  critStrike: zCritStrikeGrant.optional(),
} as const;

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

export const zEffectDefUnion = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("damage"),
      ...EFFECT_COMMON_SHAPE,
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
  z.object({ kind: z.literal("heal"), ...EFFECT_COMMON_SHAPE, amount: zScaling }).strict(),
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
       * · 上界 20 秒。出貨最長的是 10 秒(59-00 暴走 `godie-e00r.passive`),所以
       *   20 給了一倍的空間;它擋的是**小數點打錯一位**:0.3 打成 3 沒有任何界擋
       *   得住(那是一個合法的設計值),但 0.3 打成 30、3 打成 30、20 打成 200
       *   都會在 `pnpm content:build` 當場被擋下並指名檔案與欄位。一個 30 秒的
       *   暈眩在一場三分鐘的回合裡等於「那個人這一場不用玩了」。
       */
      duration: z.number().min(0.034).max(20),
      /** "self" puts it on the CASTER (combo windows); default "target" */
      applyTo: z.enum(["self", "target"]).optional(),
      moveSpeedMult: z.number().positive().optional(),
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
      missChance: z.number().min(0).max(1).optional(),
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
      duration: z.number().min(0),
      /** rank-indexed override (index rank-1, clamped) — WC3 buff columns are per level */
      perRank: z
        .array(
          z
            .object({
              modifiers: z.array(zStatModifier),
              duration: z.number().min(0),
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
      /** 0..1 of the TARGET's max health (WC3 SetUnitLifePercentBJ) */
      healthPct: z.number().min(0).max(1).optional(),
      /** 0..1 of the TARGET's max mana (WC3 SetUnitManaPercentBJ) */
      manaPct: z.number().min(0).max(1).optional(),
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
      speed: z.number().positive(),
      maxDistance: z.number().positive(),
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
      /** w3a `ahdu` at the cast rank; ABSENT = never times out (the toggles) */
      durationSec: z.number().positive().optional(),
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
      speed: z.number().positive().max(KB_MAX_SPEED),
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
      /** 一次最多拉幾個人 (由近到遠)。省略 = TAUNT_MAX_TARGETS */
      maxTargets: z.number().int().min(1).max(TAUNT_MAX_TARGETS).optional(),
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
       */
      count: z.number().int().positive().max(50).optional(),
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

  /** 【隨機落點排程】(13-04 龍星群 · 70-04 千年練成)。⭐ draw 預算 = 2×count。 */
  z
    .object({
      kind: z.literal("randomArea"),
      ...EFFECT_COMMON_SHAPE,
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
      shape: z.enum(["single", "circle"]),
      radius: z.number().positive().max(40).optional(),
      side: z.enum(["allies", "enemies"]).optional(),
      maxTargets: z.number().int().positive().max(24).optional(),
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

  /** 【魔力屏障】(44-00 機警)。⛔ 不是受傷後補護盾。 */
  z
    .object({
      kind: z.literal("manaBarrier"),
      ...EFFECT_COMMON_SHAPE,
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
      shape: z.enum(["single", "circle"]),
      radius: z.number().positive().max(40).optional(),
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
      durationSec: z.number().positive().max(MANA_BARRIER_MAX_DURATION_SEC),
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

/** 這棵條件樹裡有沒有任何一顆「每次評估都要付錢」的葉子。 */
function hasBudgetedLeaf(cond: unknown): boolean {
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
  })
  .strict();

/** `zHookDefBase` + 「只有帶傷害的事件談得上『那一發』」的載入時檢查。 */
export const zHookDef = zHookDefBase.superRefine(refineHookDamageContext);

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
  })
  .strict()
  .refine((a) => (a.modifiers?.length ?? 0) + (a.hooks?.length ?? 0) > 0, {
    message: "aura must carry at least one modifier or hook",
  });

/**
 * 隱形 / 真視 grant on a passive rank — mirrors `VisionGrant` in sim/stealth.ts.
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

/** One rank of `ability@1.passive` — mirrors `AbilityPassiveRank`. */
export const zAbilityPassiveRank = z
  .object({
    modifiers: z.array(zStatModifier).optional(),
    hooks: z.array(zHookDef).optional(),
    auras: z.array(zAuraDef).optional(),
    vision: zVisionGrant.optional(),
    flight: zFlightGrant.optional(),
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
