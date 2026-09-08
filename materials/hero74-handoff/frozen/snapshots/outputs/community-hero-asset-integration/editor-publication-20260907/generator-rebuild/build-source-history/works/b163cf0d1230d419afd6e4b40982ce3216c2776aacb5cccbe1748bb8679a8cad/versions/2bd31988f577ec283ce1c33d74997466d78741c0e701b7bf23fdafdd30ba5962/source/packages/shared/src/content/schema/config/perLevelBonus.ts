import { z } from "zod";
import { zId } from "../common";
// 英雄屬性正規化（owner 2026-08-12）—— 同一條規矩：數字與語意定在
// content/statNormalization.ts，schema 只是把它搬上 Zod。
import { PER_LEVEL_BONUS_MAX, PER_LEVEL_BONUS_MIN } from "../../../sim/baseBonus";

/**
 * config.per-level-bonus@1 — **每級加成**（`config/per-level-bonus.json`）。
 *
 * owner 2026-08-13：「我追加一個設定，**英雄每等級都會 +1 AP**，
 * 這個參數一樣可在後台設定」。
 *
 * ⚠️ 為什麼不塞進 `config.base-bonus@1`：那一份每格是**一個數**（一次性加數），
 * 這一份每格是**一對**（數量 + 給誰）。兩種語意共用一張表，操作者沒有線索分辨
 * 他填的 1 是「+1」還是「每級 +1」—— 和 stat-caps 當初分家的理由逐字相同。
 *
 * 語意見 `sim/baseBonus.ts` 的 `PerLevelBonus`。缺文件 = 出貨預設（法強每級 +1，
 * 給每一位），缺鍵 = 那條屬性沒有每級加成。
 */
export const zPerLevelBonusEntry = z
  .object({
    /** 每一級加多少。⚠️ 上界 100 是保險絲：99 級時那就是 +9,800。 */
    amount: z.number().finite().min(PER_LEVEL_BONUS_MIN).max(PER_LEVEL_BONUS_MAX),
    /**
     * 給誰。⭐ `nonPrimary` 存在的理由：扁平加成會**壓平定位差距**
     * （實測 +1 AP/級讓法師/坦克的 AP 比從 1.74 掉到 1.48），
     * 想補償非法師又不想壓平法師時就用它。
     */
    appliesTo: z.enum(["all", "primary", "nonPrimary"]),
  })
  .strict();

export const zConfigPerLevelBonusDoc = z
  .object({
    id: zId,
    schema: z.literal("config.per-level-bonus@1"),
    note: z.string().optional(),
    /** stat key → { amount, appliesTo }。缺鍵 = 那條沒有每級加成。 */
    perLevel: z.record(z.string(), zPerLevelBonusEntry),
  })
  .strict();
