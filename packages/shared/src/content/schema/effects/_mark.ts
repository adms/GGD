/** Shared lethal-mark leaf; no import of the parent effect union. */
import { z } from "zod";
import { MARK_LETHAL_RESTORE_MODES, MARK_MAX_COUNT } from "../../../sim/markLimits";
import { SPREAD_MAX_RADIUS } from "../../../sim/effects/spreadLimits";
import { zDamageType, zEffectDef } from "./_shared";
import { HOOK_INTERNAL_COOLDOWN_MAX_SEC } from "./_hook";

/**
 * 「這個標記是一張免死牌」。缺席 = 純計數標記（風王結界 / 縮地），
 * 在傷害管線上完全不存在。逐欄語意見 `sim/combat/lethalSave.ts` 檔頭③。
 */
export const zMarkLethalRule = z
  .object({
    maxSavesPerRound: z.number().int().min(1).max(MARK_MAX_COUNT).optional()
      .describe("同一目標同名標記每回合最多救援次數；重施或不同施法者不重置。"),
    /** 一次免死消耗幾層。 */
    consume: z.number().int().min(1).max(MARK_MAX_COUNT),
    /**
     * 免死的**血量地板**，最大生命的幾成（0 < x ≤ 1）。
     *
     * ⚠️ 它預設是「這一發最多把你扣到這裡」，**不是**「救完回到這裡」——
     * 兩者只在血量**已經低於**它的時候不同，而那一半由 `restoreMode` 決定。
     * 想要卡片上的「免死，並留在 20% 生命」請一起填 `restoreMode: "restore"`。
     *
     * 不能是 0：那等於「救活成 0 血」，下一格 deathSystem 照樣把人判死，
     * 於是一層標記被燒掉而玩家什麼都沒拿到（失敗形態②）。
     */
    surviveHpPct: z.number().gt(0).max(1),
    /**
     * ⭐ GH#306 —— `surviveHpPct` 的兩種語意，省略 = `"clamp"` = 今天的行為。
     *
     *   · `"clamp"`   夾住這一發：血低於地板時這一發被擋掉，但**一格血都不補**；
     *   · `"restore"` 保證血量：救完血量 **= 地板**，與挨打前的血量無關
     *     （owner：「是到生命 0 以下，再回到 20%，不是停在 20%」）。
     *
     * 出貨預設刻意是 `"clamp"`，所以既有的每一份文件語意逐字不變（十二道試煉
     * 的地板是 1%，它的回血來自緊接著的 `restore` 效果，不是地板）。
     */
    restoreMode: z.enum(MARK_LETHAL_RESTORE_MODES).optional(),
    /**
     * 對哪些傷害型別生效。**必填、明列**。
     *
     * 「真傷能不能被免死」= 這個陣列裡有沒有 `"true"`，**不是程式裡的一個分支**。
     * `.min(1)`：空陣列會讓這張免死牌永遠不觸發，而文件看起來設定完整。
     */
    damageTypes: z.array(zDamageType).min(1),
    /**
     * 內部冷卻（秒）。⚠️ 不要填 0：一次 AoE 在同一 tick 打出多發封包是常態
     * （`damageArea` 就是），0 會讓十二層在一次爆炸裡全部蒸發。
     */
    internalCooldown: z.number().min(0).max(HOOK_INTERNAL_COOLDOWN_MAX_SEC),
    /** 救活的同一刻落在**自己**身上的效果（無敵 / 回復）。 */
    selfEffects: z.array(zEffectDef),
    /** 救活的同一刻落在**周圍敵人**身上的效果（擊退 / 暈眩）。 */
    aoeEffects: z.array(zEffectDef),
    /**
     * `aoeEffects` 的半徑（GGD 單位）。**0 = 不做 AoE**（sim 端直接跳過）。
     * 上界沿用其他作者面半徑的同一個天花板，理由也一樣：擋 mis-parse，
     * 不是平衡政策。
     */
    aoeRadius: z.number().min(0).max(SPREAD_MAX_RADIUS),
  })
  .strict()
  .superRefine((r, ctx) => {
    // 寫了效果卻沒有半徑 = 那批效果永遠不會跑（`lethalSave.ts:162` 的
    // `aoeRadius > 0` 閘）。技能看起來設定好了，場上什麼都不會發生。
    if (r.aoeEffects.length > 0 && r.aoeRadius <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["aoeRadius"],
        message: "有 aoeEffects 就一定要有 aoeRadius > 0 —— 否則那批效果永遠不會被執行",
      });
    }
  });

