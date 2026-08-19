import { z } from "zod";
import { SPREAD_MAX_RADIUS, SPREAD_MAX_TARGETS } from "../../../sim/effects/spreadLimits";
import { zScaling } from "../common";
import {
  EFFECT_COMMON_SHAPE,
  zDamageType,
  zMaxTargetsCounts,
  zOnHitTargets,
  zOnHitTargetsMode,
  zResourcePctTerm,
  zRunOnEmptyHit,
  zVictimCondition,
} from "./_shared";

export const zDamageLine =
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
  .strict();
