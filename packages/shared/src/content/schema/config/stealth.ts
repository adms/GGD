import { z } from "zod";
import { zId } from "../common";

/**
 * config.stealth@1 — 隱形規則 (隱形原語 lane D).
 *
 * 每一格的語意、以及「為什麼出貨值是這一個」寫在 `packages/shared/src/sim/
 * stealth.ts`。四個「擋不擋」與三個「破不破」全部是 WC3 原作行為,所以這份文件
 * 出現本身不改變任何一場比賽 —— 它只是把已經寫在程式裡的那些決定變成可以改的。
 *
 * ⚠️ **缺文件 = `DEFAULT_STEALTH_RULES`(出貨值)**,不是空表。空表在 TypeScript
 * 底下會讓四個 `blocks*` 全部讀成 `undefined`(falsy),也就是隱形只剩畫面、
 * 完全不影響索敵 —— 而畫面上看起來一切正常。
 *
 * 為什麼是自己一份文件而不是塞進 `config.combat-feel@1`:combat-feel 是**手感**
 * (擊退距離、打就站定、面向鎖),隱形是**可見性規則**,兩者一起調的機會是零;
 * 而且 combat-feel 那一頁的欄位是從 Zod 推導的,同一個理由(見 shield 那段)。
 */
export const zConfigStealthDoc = z
  .object({
    id: zId,
    schema: z.literal("config.stealth@1"),
    note: z.string().optional(),
    /** 隱形是否讓敵人的**自動索敵**看不到你(WC3: 是) */
    blocksAutoAcquire: z.boolean(),
    /** 隱形是否讓**殭屍/小怪的 aggro** 看不到你(WC3: 是) */
    blocksMobAggro: z.boolean(),
    /** 隱形是否讓敵方玩家**點不到你**(WC3: 是) */
    blocksManualTarget: z.boolean(),
    /**
     * 隱形是否讓**技能 AoE 打不到你**。
     * WC3 出貨值是 **false** —— 暴風雪照樣燒得到隱形單位。true 會把永久隱形
     * 變成「穿過整場戰鬥毫髮無傷」,那是另一種設計而不是原作。
     */
    blocksAbilityAoe: z.boolean(),
    /** 普攻是否破隱(WC3: 是) */
    breaksOnBasicAttack: z.boolean(),
    /** 施法是否破隱(WC3: 是) */
    breaksOnCast: z.boolean(),
    /** **被打**是否破隱(WC3: 否) */
    breaksOnDamaged: z.boolean(),
    /**
     * 全域淡出延遲倍率。1 = 照技能文件寫的秒數(27-00 永久性的隱形術 = 4.0 s,
     * 直接來自 w3x `Dur` 欄)。上界 10 是誤植守衛(#277 的形狀):打成 40 等於
     * 那位英雄整場再也不會隱形,而畫面上看起來就是「功能壞了」。
     */
    fadeDelayMult: z.number().min(0).max(10),
    /** 己方看到的隱形隊友不透明度。**不要設 0** —— 你會看不到自己的角色。 */
    allyAlpha: z.number().min(0).max(1),
    /** 敵方(沒有真視)看到的不透明度。0 = 完全消失;>0 = 半透明鬼影。 */
    enemyAlpha: z.number().min(0).max(1),
    /** 隱形時對敵方隱藏血條(WC3: 是 —— 看不到單位自然看不到血條) */
    hideEnemyHealthBar: z.boolean(),
  })
  .strict();
export type ConfigStealthDoc = z.infer<typeof zConfigStealthDoc>;
