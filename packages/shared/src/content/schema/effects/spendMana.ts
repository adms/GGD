import { z } from "zod";
import type { StatusId } from "../../../ids";
import { zRef, zScaling } from "../common";
import {
  BANKED_LIFE_MAX_SEC,
  EFFECT_COMMON_SHAPE,
} from "./_shared";

export const zSpendMana =
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
  .strict();
