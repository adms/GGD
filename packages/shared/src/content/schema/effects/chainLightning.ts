import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import { CHAIN_MAX_DECAY, CHAIN_MAX_JUMPS, CHAIN_MAX_JUMP_INTERVAL_SEC, CHAIN_MAX_RADIUS, CHAIN_MAX_SOURCES, CHAIN_MAX_TOTAL_JUMPS, CHAIN_MIN_DECAY, DEFAULT_CHAIN_JUMP_INTERVAL_SEC } from "../../../sim/effects/kindLimits";
import { zScaling } from "../common";
import {
  EFFECT_COMMON_SHAPE,
  refineDispelShape,
  zAoeTier,
  zDamageType,
  zOnHitTargets,
  zOnHitTargetsMode,
  zRunOnEmptyHit,
} from "./_shared";

export const zChainLightning =
/**
 * chainLightning（GH#451）—— 「範圍內的**每一個**單位各觸發一次連鎖閃電」。
 *
 * ⛔ 這是**一個機制**，不是兩支技能：`shape:"single"` 是一條鏈（原作那顆單獨的
 * 鏈鎖閃電），`shape:"circle"` 是圈內每個人各一條（86-04 打雷絕招 / 65-04 天譴
 * 那兩段 JASS）。為什麼組不出來（三個理由）與原作對照寫在
 * `sim/effects/effect.ts` 的同名 union 成員上，⛔ 不在這裡重複一份。
 *
 * 界全部來自 `sim/effects/kindLimits.ts`（同一張表兩個消費端），
 * 每一格都是**誤打守衛**不是平衡政策 —— 平衡值住在技能文件裡。
 */
z
  .object({
    kind: z.literal("chainLightning"),
    ...EFFECT_COMMON_SHAPE,
    /** ⭐ E1 硬約束：新 kind 一律帶 `shape` —— 而且它在這裡是真的機制開關。 */
    shape: z.enum(["single", "circle"]).describe(
      "single＝只有這次的目標起一條連鎖；circle＝起始圈內**每一個**敵人各起一條" +
        "（「聚集越多敵人威力越強」就是這個）。",
    ),
    radius: z
      .number()
      .positive()
      .max(CHAIN_MAX_RADIUS)
      .optional()
      .describe("shape:\"circle\" 的起始圈半徑（GGD 單位）。圈內每個敵人各起一條連鎖。"),
    radiusTier: zAoeTier.optional(),
    centre: z
      .enum(["caster", "point", "target"])
      .optional()
      .describe(
        "起始圈以誰為圓心。省略＝caster（原作兩段 JASS 都是施法者位置）；" +
          "point＝落點；target＝這次指定的目標。",
      ),
    maxSources: z
      .number()
      .int()
      .min(1)
      .max(CHAIN_MAX_SOURCES)
      .optional()
      .describe("最多幾個人各起一條連鎖（由近到遠）。留空＝上限本身。"),
    amount: zScaling,
    damageType: zDamageType.optional().describe(
      "傷害型別：吃護甲(physical)、吃魔抗(magic)、什麼都不吃(true)。" +
        "**省略 = 後台「傷害規則」頁的預設**（出貨 magic）。",
    ),
    jumps: z
      .number()
      .int()
      .min(1)
      .max(CHAIN_MAX_JUMPS)
      .describe(
        "一條連鎖總共打到幾個人（**含起點**）。原作 A04H 是 16（說明寫「傳遞16次」）。",
      ),
    jumpRange: z
      .number()
      .positive()
      .max(CHAIN_MAX_RADIUS)
      .describe("每一跳能跳多遠（GGD 單位）。跳不到人時這一條連鎖就結束。"),
    decay: z
      .number()
      .min(CHAIN_MIN_DECAY)
      .max(CHAIN_MAX_DECAY)
      .describe(
        "每跳的**傷害倍率** 0..1：0.8 = 每跳剩八成，1 = 完全不遞減。" +
          "⛔ 必填 —— 這個效果的身分就是「逐個傷害遞減」，一個猜出來的預設會讓" +
          "卡面上的「遞減」變成一句沒有發生的話。",
      ),
    jumpIntervalSec: z
      .number()
      .min(0)
      .max(CHAIN_MAX_JUMP_INTERVAL_SEC)
      .optional()
      .describe(
        "⭐ 兩發閃電之間的**秒數** —— 動畫與傷害都跟著它走，⛔ 不是整條鏈在同一" +
          `瞬間結算。留空＝${DEFAULT_CHAIN_JUMP_INTERVAL_SEC} 秒（≈30Hz 的 2 tick）；` +
          "**0 = 明寫要瞬發**（整條鏈在施放的那一 tick 跑完）。" +
          "⚠️ 它同時是效能設計：逐跳把 O(來源數×跳數) 的尖峰攤到很多個 tick 上。",
      ),
    revisit: z
      .boolean()
      .optional()
      .describe(
        "同一個目標能不能在**同一條**連鎖裡被跳到第二次。留空＝不能。" +
          "⚠️ 不同連鎖打到同一個人一律允許（那正是「越多單位越痛」）。" +
          "⛔ 下一跳是從射程內的候選裡**隨機**抽的，不是取最近的那一個。",
      ),
    maxTotalJumps: z
      .number()
      .int()
      .min(1)
      .max(CHAIN_MAX_TOTAL_JUMPS)
      .optional()
      .describe(
        "這一次施放的**總跳數上限**（保險絲）。留空＝上限本身。" +
          "⚠️ 這一格擋的是 O(來源數×跳數)：60 隻殭屍的場上，20 條 × 24 跳 = 480 筆" +
          "傷害全部落在同一個 tick。",
      ),
    canCrit: z.boolean().optional(),
    /** ⭐ G1 ② —— 與 `damageArea` 同名同語意（同一個 `runOnHitChain`）。 */
    onHitTargets: zOnHitTargets,
    runOnEmptyHit: zRunOnEmptyHit,
    onHitTargetsMode: zOnHitTargetsMode,
  })
  .strict();

/**
 * ⭐ 這一支的跨欄位檢查 —— 分片前它是 `refineEffectDef` 裡的一條 `if`。
 * ⛔ 掛在 `index.ts` 的派發表上，⛔ 不是掛在下面那個 `z.object` 上：
 *    `.superRefine` 會把 `ZodObject` 變成 `ZodEffects`，而
 *    `z.discriminatedUnion` 只收 `ZodObject`（zod 的型別約束，⛔ 不是風格）。
 */
export const refine = (
  e: Extract<EffectDef, { kind: "chainLightning" }>,
  ctx: z.RefinementCtx,
): void => {
  refineDispelShape(e, ctx);
};
