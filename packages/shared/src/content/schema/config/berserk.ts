import { z } from "zod";
import { zId } from "../common";

export const zConfigBerserkDoc = z
  .object({
    id: zId,
    schema: z.literal("config.berserk@1"),
    note: z.string().optional(),
    /**
     * 主動暴走可以按下去的**生命比例**（0.15 = 15%）。生命 ≤ 它才放得出來；
     * 高於它 `castAbility` 回 `"hp-too-high"`，**魔力與冷卻一格都不扣**。
     *
     * 兩端都有界（#277）：上界 1 不是平衡政策，是保險絲 —— 打成 15 而不是 0.15
     * 等於「隨時能放」，而夾掉之後畫面上看不出差別。
     */
    castHpPct: z.number().min(0).max(1),
    /**
     * 暴走期間，**這一次**施法的冷卻要乘多少。2 = 變兩倍長（owner 的字面意思，
     * 暴走的代價）。1 = 不影響。
     *
     * 下界 0.1 而不是 0：0 = 每一支技能都沒有冷卻，那不是「冷卻縮短」是
     * 「無限連放」，而一個打錯的 0 看起來跟關掉這個功能一模一樣。
     */
    cooldownMult: z.number().min(0.1).max(10),
    /**
     * 上面兩格套用在誰身上。
     *
     *   berserkGrantors  只有會授予暴走的**主動技**（出貨值 —— 天生技走 hook
     *                    的 condition，不需要這道閘）
     *   off              施法閘不存在、冷卻也不加倍（＝這個功能整個下線，
     *                    但**看得見**它是被關掉的，不是壞掉的）
     */
    trigger: z.enum(["berserkGrantors", "off"]),
  })
  .strict();
