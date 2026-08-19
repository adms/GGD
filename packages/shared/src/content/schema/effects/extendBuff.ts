import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import { EXTEND_BUFF_MAX_ADD_SEC, EXTEND_BUFF_MAX_REMAINING_SEC, EXTEND_BUFF_MAX_THRESHOLD_PCT } from "../../../sim/effects/kindLimits";
import {
  EFFECT_COMMON_SHAPE,
  refineDispelShape,
  zAoeTier,
} from "./_shared";

/**
 * `extendBuff` 的**門檻二選一**（Lane 2）。
 *
 * ⚠️ 為什麼要在載入時擋：兩格都不填的話，handler 算出 `threshold = 0` → 早退，
 * 於是這個效果**掛得上、永遠不做事**（失敗形態 ②：卡上寫著「延長 2 秒」，
 * 遊戲裡從來不延長，而且沒有任何訊息）。兩格都填則是「作者以為自己設了兩種
 * 條件」，而實際上只有百分比那一格被讀 —— 一個沉默的謊。
 */
function refineExtendBuff(
  e: Extract<EffectDef, { kind: "extendBuff" }>,
  ctx: z.RefinementCtx,
): void {
  const pct = e.perDamagePctOfMaxHealth !== undefined;
  const flat = e.perDamageFlat !== undefined;
  if (pct === flat) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["perDamagePctOfMaxHealth"],
      message: pct
        ? "perDamagePctOfMaxHealth 與 perDamageFlat **只能填一個** —— 兩個都填時只有百分比那一格會被讀到，另一格是一個看起來有設、沒有人讀的數字"
        : "要填一個門檻：perDamagePctOfMaxHealth（52-01 的「自身最大生命 5%」）或 perDamageFlat。兩個都不填 = 這個效果掛得上但永遠不延長任何東西",
    });
  }
}

export const zExtendBuff =

/** 【受傷延長增益】(52-01 狂戰士之怒)。⭐ `maxRemainingSec` 必填（正回饋）。 */
z
  .object({
    kind: z.literal("extendBuff"),
    ...EFFECT_COMMON_SHAPE,
    /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
    shape: z.enum(["single", "circle"]),
    radius: z.number().positive().max(40).optional(),
    /** ⭐ AoE 級別（owner 2026-08-11「原則上不寫範圍數字」）。填了它就不要填
     *  `radius` —— 註冊時由 `config.aoe-tiers@1` 翻成半徑，兩者都填則**級別贏**。
     *  唯一的查表處：`content/aoeTiers.ts` 的 `resolveRadiusTier`。 */
    radiusTier: zAoeTier.optional(),
    side: z.enum(["allies", "enemies"]).optional(),
    maxTargets: z.number().int().positive().max(24).optional(),
    who: z.enum(["self", "target"]).optional(),
    /** 要延長的那個 buff 的 `applyBuff.stackKey`。 */
    stackKey: z.string().min(1).max(64),
    addSec: z.number().positive().max(EXTEND_BUFF_MAX_ADD_SEC),
    perDamagePctOfMaxHealth: z
      .number()
      .positive()
      .max(EXTEND_BUFF_MAX_THRESHOLD_PCT)
      .optional(),
    perDamageFlat: z.number().positive().max(100000).optional(),
    basis: z.enum(["raw", "mitigated", "hpLost"]).optional(),
    /**
     * ⭐ **必填**，不是選填的保險：這條機制是正回饋（挨越多、越久），
     * 沒有上界會變成永久，而症狀是「這個回合打不完」—— 一個不會讓任何測試
     * 變紅的故障。理由完整寫在 `sim/effects/extendBuff.ts` 檔頭③。
     */
    maxRemainingSec: z.number().positive().max(EXTEND_BUFF_MAX_REMAINING_SEC),
  })
  .strict();

/**
 * ⭐ 這一支的跨欄位檢查 —— 分片前它是 `refineEffectDef` 裡的一條 `if`。
 * ⛔ 掛在 `index.ts` 的派發表上，⛔ 不是掛在下面那個 `z.object` 上：
 *    `.superRefine` 會把 `ZodObject` 變成 `ZodEffects`，而
 *    `z.discriminatedUnion` 只收 `ZodObject`（zod 的型別約束，⛔ 不是風格）。
 */
export const refine = (
  e: Extract<EffectDef, { kind: "extendBuff" }>,
  ctx: z.RefinementCtx,
): void => {
  // ⚠️ 順序照分片前逐字：先共用的 `shape` 檢查，再這一支自己的規則。
  //    反過來寫測不出來 —— 只有錯誤**訊息的順序**會變。
  refineDispelShape(e, ctx);
  refineExtendBuff(e, ctx);
};
