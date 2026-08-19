import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import { BRANCH_MAX_COUNT, BRANCH_MAX_WEIGHT } from "../../../sim/effects/kindLimits";
import {
  EFFECT_COMMON_SHAPE,
  refineDispelShape,
  zAoeTier,
  zEffectDef,
} from "./_shared";

/**
 * `weightedBranch` 的**總權重不得為 0**（Lane 1）。
 *
 * ⚠️ 為什麼不能只靠 `weight: z.number().positive()`：那樣就沒有辦法「先關掉
 * 一個分支但不刪掉它」，而那是編輯器裡最常見的一個動作。下界留 0，總和的檢查
 * 就必須是一條**跨欄位**的規則 —— 而它必須在**載入時**跑：一份總權重 0 的
 * 文件在執行期只會 `return`，技能放得出來、動畫演完、什麼都沒發生（失敗形態 ②）。
 */
function refineWeightedBranch(
  e: Extract<EffectDef, { kind: "weightedBranch" }>,
  ctx: z.RefinementCtx,
): void {
  let total = 0;
  for (const b of e.branches) total += b.weight;
  if (total > 0) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["branches"],
    message:
      "所有分支的 weight 加起來是 0 —— 這一發抽不到任何東西，在遊戲裡看起來" +
      "跟技能壞掉一模一樣。至少要有一個分支的 weight 大於 0。",
  });
}

export const zWeightedBranch =

/** 【加權分支】(89-002 俄羅斯輪盤)。⭐ 一次施放只 draw 一次。 */
z
  .object({
    kind: z.literal("weightedBranch"),
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
    /**
     * ⚠️ 下界是 **0**（允許「先關掉一個分支」），所以**總和為 0**要靠
     * `refineWeightedBranch` 在載入時擋 —— 一份總權重 0 的文件在執行期
     * 是「技能放得出來、什麼都不會發生」，正是失敗形態 ②。
     */
    branches: z
      .array(
        z
          .object({
            weight: z.number().min(0).max(BRANCH_MAX_WEIGHT),
            effects: z.array(zEffectDef).min(1),
          })
          .strict(),
      )
      .min(1)
      .max(BRANCH_MAX_COUNT),
  })
  .strict();

/**
 * ⭐ 這一支的跨欄位檢查 —— 分片前它是 `refineEffectDef` 裡的一條 `if`。
 * ⛔ 掛在 `index.ts` 的派發表上，⛔ 不是掛在下面那個 `z.object` 上：
 *    `.superRefine` 會把 `ZodObject` 變成 `ZodEffects`，而
 *    `z.discriminatedUnion` 只收 `ZodObject`（zod 的型別約束，⛔ 不是風格）。
 */
export const refine = (
  e: Extract<EffectDef, { kind: "weightedBranch" }>,
  ctx: z.RefinementCtx,
): void => {
  // ⚠️ 順序照分片前逐字：先共用的 `shape` 檢查，再這一支自己的規則。
  //    反過來寫測不出來 —— 只有錯誤**訊息的順序**會變。
  refineDispelShape(e, ctx);
  refineWeightedBranch(e, ctx);
};
