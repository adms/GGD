import { z } from "zod";
import { DOT_RESOURCE_PCT_POINTS_TOTAL_MAX, DOT_RESOURCE_PCT_RATIO_TOTAL_MAX } from "../../../sim/effects/dynamicTerms";
import type { EffectDef } from "../../../sim/effects/effect";
import { zScaling } from "../common";
import {
  EFFECT_COMMON_SHAPE,
  zApplyToSelfOrTarget,
  zDamageType,
  zEffectDef,
  zResourcePctTerm,
} from "./_shared";

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

export const zDot =

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
  .strict();

export const refine = refineDotResourceBudget;
