import { z } from "zod";
import type { StatusId } from "../../../ids";
import { DAMAGE_REFUND_PCT_MAX, DISTANCE_SCALE_DAMAGE_MAX, DISTANCE_SCALE_RANGE_MAX } from "../../../sim/effects/dynamicTerms";
import type { EffectDef } from "../../../sim/effects/effect";
import { INCOMING_PCT_MAX, INCOMING_PCT_MIN, REFLECT_MAX_CHAIN_DEPTH, REFLECT_MIN_CHAIN_DEPTH } from "../../../sim/effects/reflectLimits";
import { zRef, zScaling } from "../common";
import {
  BANKED_BONUS_MAX,
  BANKED_COEFF_MAX,
  EFFECT_COMMON_SHAPE,
  HP_PCT_DAMAGE_MAX,
  zApplyToSelfOrTarget,
  zDamageType,
  zResourcePctTerm,
} from "./_shared";

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

export const zDamage =
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
     * 它與 `hpPct` 不重複:`hpPct` 只讀受害者的生命、只有比例讀法、上界 0.35。
     *
     * ⚠️ 2026-08-19 訂正（CLAUDE.md 第三守則）：這一行原本寫著 `hpPct`
     * 「**已經出貨在 揍敵客 W 牙突 上,原封不動**」—— 而那份文件裡**一格
     * `hpPct` 都沒有**。實測（走 `content/{abilities,items,augments,champions}`
     * 的效果樹、依 `kind` 分類）：`damage.hpPct` 有 **6** 個用戶，
     * **全部是道具**，`content/abilities` 是 **0**；另外 4 筆同名的 `hpPct`
     * 是 `revive.hpPct`，跟這一格無關。
     *
     * 揍敵客 W（13-02 牙突）的「目標[最大生命] 6/8/10/12%」在 GH#459 走的是
     * **`resourcePct`**（`{subject:"target", resource:"health", basis:"max"}`），
     * 理由寫在 `tools/skill-remake/batch1.py::_split_res_pct` 的檔頭：
     * `hpPct` 只長在 `damage` 一個 kind 上，而這一族的受害者常常是
     * `damageArea` / `damageLine`，所以技能側統一走 `resourcePct`。
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
  .strict();

export const refine = refineNegateOriginal;
