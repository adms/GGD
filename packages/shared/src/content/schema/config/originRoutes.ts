import { z } from "zod";
import { zId } from "../common";
import { ORIGINS } from "../../statNormalization";

/**
 * config.origin-routes@1 —— 出身 × 路線的**文案**（`config/origin-routes.json`）。
 *
 * ⛔ **一個數字都不進入戰鬥計算。** owner 2026-08-12：「我沒有要你作新機制，
 * 我只是要作為**調整英雄初始與成長屬性的定位參考**，並且可以更新在**英雄選角說明**」。
 * 真正驅動數值的是 `config.stat-normalization@1` 的十格出身表。
 *
 * ⚠️ 為什麼要獨立成一份文件：它是**純文案**（10 個出身 × 一句話 + 32 條路線 × 三句），
 * 而 stat-normalization 那一份每一格都是會進算式的數字。兩種東西混在一起，
 * 操作者沒有線索分辨他改的那一格會不會動到平衡。
 */
export const zOriginRoute = z
  .object({
    name: z.string().min(1).max(12),
    summary: z.string().min(1).max(120),
    gain: z.string().min(1).max(60),
    // ⚠️ 允許空字串但**不建議**：一條只加不減的不是路線，是被動。
    lose: z.string().max(60),
  })
  .strict();

const zOriginInfo = z
  .object({
    rule: z.string().min(1).max(60),
    tagline: z.string().min(1).max(120),
    // owner 2026-08-12：「個別**至少 2~4** 種路線」。
    routes: z.array(zOriginRoute).min(2).max(4),
  })
  .strict();

export const zConfigOriginRoutesDoc = z
  .object({
    id: zId,
    schema: z.literal("config.origin-routes@1"),
    note: z.string().optional(),
    /** 十個出身，⛔ 一個都不能少（`.strict()` 也擋掉多打的）。 */
    origins: z
      .object(Object.fromEntries(ORIGINS.map((o) => [o, zOriginInfo])) as Record<string, typeof zOriginInfo>)
      .strict(),
  })
  .strict();
