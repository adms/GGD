import { z } from "zod";
import { zId } from "../common";

/**
 * config.body-scale@1 — 身體放大倍數 → 攻擊距離 (GH#252).
 *
 * 每一格的語意、以及「為什麼出貨值是這一個」寫在
 * `packages/shared/src/sim/bodyScale.ts`。
 *
 * ⚠️ **這份文件的出貨值會改變平衡**,和 `config.shield@1` 相反:在它出現之前
 * 射程完全不看體型,所以出貨曲線不是「維持原狀」而是 owner 要的新行為。要退回
 * 舊行為把 `enabled` 關掉。
 *
 * ⚠️ **缺文件 = `DEFAULT_BODY_SCALE_RULES`(出貨值)**,不是空表 —— 空表在
 * TypeScript 底下會讓曲線讀成 `undefined`,而 `undefined[0].rangeMult` 一路
 * 乘進 `Stat.AttackRange` 就是全場沒有人打得到人。
 *
 * ⚠️ **兩端夾住,不外推。** 小於第一個斷點取第一列,大於最後一個取最後一列。
 * 這是一個決定不是省事:外推要猜一條沒有人審過的斜率,而一隻 `sizeMult` 8 的
 * 殭屍王會照那條斜率一路長到一個 owner 從來沒看過的射程。要涵蓋更大的體型,
 * **加一列**(那是一個看得見的決定),不要改成外推(那是一個看不見的決定)。
 */
export const zConfigBodyScaleDoc = z
  .object({
    id: zId,
    schema: z.literal("config.body-scale@1"),
    note: z.string().optional(),
    /** 總開關。false = 攻擊距離完全不看體型(= 這個功能出現之前的行為)。 */
    enabled: z.boolean().describe(
      "@zh 體型連動射程\n" +
      "@note 關掉＝攻擊距離完全不看體型，和這一頁出現之前一模一樣。把下面整張表的倍率都填 1 也是同一個結果，兩個都留著是因為「暫時關掉」和「調成不連動」在操作上是兩件事：關掉之後再打開，你調過的曲線還在。",
    ),
    /**
     * **決策點**:體型 → 普攻射程倍率的斷點表,中間線性內插、兩端夾住。
     *
     * owner 2026-08-01:「**通常不會是等比倍率**,例如 2x body, 1.2x 攻擊距離;
     * 3x body 1.3x攻擊距離」——「遞減」不是一個係數表達得出來的東西(單一係數
     * 只畫得出一條直線),所以這裡放的是表不是數。
     *
     * 上界:8 個斷點是可讀性上限(要捲動的表看不出它是不是遞減的);體型 10 是
     * 小怪波 `boss.sizeMult` 的出貨值(貼錯格擋在這裡);倍率 3 擋的是「把百分比
     * 當倍率填」(120 → 120 倍射程,那位英雄會從畫面外開打)。
     */
    attackRangeCurve: z
      .array(
        z
          .object({
            /** 身體放大倍數(英雄卡的 `bodyScale`,1 = 一般體型)。 */
            bodyScale: z.number().min(0.1).max(10),
            /** 這個體型對應的普攻射程倍率(1 = 照卡面)。 */
            rangeMult: z.number().min(0.1).max(3),
          })
          .strict(),
      )
      .min(2)
      .max(8)
      // 嚴格遞增:重複的 `bodyScale` 會讓內插除以 0(→ Infinity 射程),而順序
      // 錯掉的表在畫面上看起來完全正常,只有內插結果是亂的。
      .refine(
        (pts) => pts.every((p, i) => i === 0 || p.bodyScale > pts[i - 1]!.bodyScale),
        { message: "attackRangeCurve 必須依 bodyScale 由小到大排列,而且不可以有重複的體型" },
      ),
  })
  .strict();

/** ConfigDoc keeps naming the canonical match config (existing consumers). */
export type ConfigBodyScaleDoc = z.infer<typeof zConfigBodyScaleDoc>;
