import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import {
  COMBO_MAX_FINISHER_DELAY_SEC,
  COMBO_MAX_INTERVAL_SEC,
  COMBO_MAX_STEP_SEC,
  COMBO_MAX_STRIKES,
} from "../../../sim/effects/kindLimits";
import { EFFECT_COMMON_SHAPE, refineDispelShape, zEffectDef } from "./_shared";

/**
 * ⭐【連段】`comboStrikes`（#541）—— 「連斬七次，每一次斬擊皆造成極大傷害」。
 *
 * 上下界一律讀 `sim/effects/kindLimits.ts`，⛔ 這裡不抄字面值。
 * 機制、與 `dot` / `delayed` 的差別、以及「排不出班表就擲錯」的理由，
 * 完整寫在 `sim/effects/comboStrikes.ts` 的檔頭 —— ⛔ 這裡不重複一份。
 */
export const zComboStrikes = z
  .object({
    kind: z.literal("comboStrikes"),
    ...EFFECT_COMMON_SHAPE,
    /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
    shape: z.enum(["single", "circle"]),
    radius: z.number().positive().max(40).optional(),
    side: z.enum(["allies", "enemies"]).optional(),
    maxTargets: z.number().int().positive().max(24).optional(),
    /**
     * ⭐ 節奏表的 key（`config.combo-strikes@1`）。**在載入時**由
     * `sim/effects/comboFamilies.ts::resolveComboFamilies` 翻成 `steps`/`strikes`
     * （第〇·四守則：值在載入時從共用表解析，⛔ 不烘進每一份文件）。
     */
    family: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe(
        "連段家族（節奏表 config.combo-strikes@1 的 key）。填了它就不用填段數與間隔 —— " +
          "幾段、每段隔多久、收尾等多久全部從那張表載入時解析。",
      ),
    /** 幾段。⚠️ 上界與 `delayed.count` **同值**（同一個排程器，見 kindLimits）。 */
    strikes: z.number().int().positive().max(COMBO_MAX_STRIKES).optional(),
    /** 等間隔秒數（配 `strikes`）。與 `steps` 互斥。 */
    intervalSec: z.number().positive().max(COMBO_MAX_INTERVAL_SEC).optional(),
    /**
     * ⭐ **不等間隔**：每一段離施法那一刻的秒數偏移。與 `intervalSec` 互斥。
     * JASS 的連段多半是這一種（前三刀快、停頓、最後一刀重）。
     */
    steps: z
      .array(z.number().min(0).max(COMBO_MAX_STEP_SEC))
      .min(1)
      .max(COMBO_MAX_STRIKES)
      .optional()
      .describe("每一段離施法那一刻的秒數（不等間隔用這格）。"),
    /** 每一段各跑一次的東西。`.min(1)` 同 `delayed`：什麼都不做 = 看起來壞掉。 */
    perStrike: z.array(z.lazy(() => zEffectDef)).min(1),
    /** 收尾（「…最後施展約束與勝利之劍」）。⭐ 可省 = 純連段。 */
    finisher: z
      .array(z.lazy(() => zEffectDef))
      .min(1)
      .optional()
      .describe("最後一發額外跑的效果（「連續七次斬擊…最後施展約束與勝利之劍」）。留空＝純連段。"),
    /** 收尾在最後一段之後**再等**幾秒。省略／0 = 與最後一段同一個 tick。 */
    finisherDelaySec: z.number().min(0).max(COMBO_MAX_FINISHER_DELAY_SEC).optional(),
    targetMode: z
      .enum(["frozen", "reresolve"])
      .optional()
      .describe(
        "目標怎麼決定：frozen（預設，施放那一刻鎖定，追著他劈）或 reresolve（每一段重新以落點解目標）。",
      ),
    dropDeadTargets: z.boolean().optional(),
    stopOnCasterDeath: z.boolean().optional(),
  })
  .strict();

/**
 * 這一支的跨欄位檢查。⛔ 掛在 `index.ts` 的派發表上（`.superRefine` 會把
 * `ZodObject` 變成 `ZodEffects`，而 `z.discriminatedUnion` 只收 `ZodObject`）。
 */
export const refine = (
  e: Extract<EffectDef, { kind: "comboStrikes" }>,
  ctx: z.RefinementCtx,
): void => {
  refineDispelShape(e, ctx);

  // ⛔ 排不出班表的節點在**載入時**擋掉，⛔ 不是等到比賽中 handler 擲錯。
  if (e.family === undefined && e.steps === undefined && e.strikes === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["family"],
      message:
        "連段至少要有一個節奏來源：family（推薦 —— 節奏住 config.combo-strikes@1）、" +
        "steps（不等間隔）或 strikes（等間隔）。三個都沒有的話這一段一刀都不會劈。",
    });
  }
  // 兩份查表就是「編輯器顯示一種節奏、場上跑另一種」（同 knockback 的
  // distanceTier ⊕ launchDistance）。
  if (e.steps !== undefined && e.intervalSec !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["intervalSec"],
      message: "steps 與 intervalSec 只能填一個 —— 兩者都在決定節奏，同時填時 steps 贏，intervalSec 是一格沒有人讀的數字",
    });
  }
  if (e.steps !== undefined && e.strikes !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["strikes"],
      message: "steps 已經決定了段數（陣列長度），⛔ 不要再填 strikes —— 兩格打架時 steps 贏",
    });
  }
  if (e.finisherDelaySec !== undefined && e.finisher === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["finisherDelaySec"],
      message: "沒有 finisher 的話這一格沒有人讀 —— 要收尾請填 finisher（第一·五守則：卡片上不可以有說了但不會發生的字）",
    });
  }
};
