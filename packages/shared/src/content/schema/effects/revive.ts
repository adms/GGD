import { z } from "zod";
import {
  EFFECT_COMMON_SHAPE,
} from "./_shared";

export const zRevive =
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
  .strict();
