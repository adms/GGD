import { z } from "zod";
import {
  EFFECT_COMMON_SHAPE,
} from "./_shared";

export const zGrantGold =
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
  .strict();
