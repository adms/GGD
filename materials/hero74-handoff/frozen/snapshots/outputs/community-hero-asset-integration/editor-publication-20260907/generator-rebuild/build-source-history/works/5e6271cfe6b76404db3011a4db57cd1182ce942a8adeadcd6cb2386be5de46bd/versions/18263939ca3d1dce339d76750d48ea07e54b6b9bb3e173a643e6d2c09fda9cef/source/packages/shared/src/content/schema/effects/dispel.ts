import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import {
  EFFECT_COMMON_SHAPE,
  refineDispelShape,
  zAoeTier,
} from "./_shared";

export const zDispel =
/**
 * 【淨化】/【驅散】(A4b, #278) —— mirrors the `dispel` member of `EffectDef`
 * in sim/effects/effect.ts。行為在 `sim/effects/dispel.ts`。
 */
z
  .object({
    kind: z.literal("dispel"),
    ...EFFECT_COMMON_SHAPE,
    /**
     * ⭐ **E1 硬約束（owner 核准）：新 kind 一律帶 `shape`。**
     *
     * ⚠️ `line` / `cone` 刻意不在 enum 裡 —— 今天沒有文件需要它們，而一個
     * schema 收得下、引擎沒實作的值，正是同一批裡剛被刪掉的 `onLevelUp`。
     */
    shape: z.enum(["single", "circle"]),
    /**
     * `shape:"circle"` **必填**（由 `refineDispelShape` 在載入時擋）。
     * 吃 `combatEnv.abilityRange`。上界 40 ≈ 競技場直徑：再大就是「全場」，
     * 而那該用 `target:"allies"` 的全隊語意寫，不是一個假裝有半徑的圓。
     */
    radius: z.number().positive().max(40).optional(),
    /** ⭐ AoE 級別（owner 2026-08-11「原則上不寫範圍數字」）。填了它就不要填
     *  `radius` —— 註冊時由 `config.aoe-tiers@1` 翻成半徑，兩者都填則**級別贏**。
     *  唯一的查表處：`content/aoeTiers.ts` 的 `resolveRadiusTier`。 */
    radiusTier: zAoeTier.optional(),
    /** `shape:"circle"` 清友軍（預設）還是清敵人。 */
    side: z.enum(["allies", "enemies"]).optional(),
    /** 圓內人數上限。省略 = 全部。上界 24 = 一場的總人數。 */
    maxTargets: z.number().int().positive().max(24).optional(),
    /**
     * 清哪幾池。省略 = `config.dispel@1` 的四個 `defaultPool*`。
     *
     * ⚠️ `buffs` 打開 = 拔得掉道具被動／增益卡／靈氣投影，而它**後面還有兩道閘**，
     * 兩道都要作者主動打開，否則勾了這一格一筆都不會掉：
     *   ① `applyBuff.dispellable: true` —— 出貨的 `buffDefaultDispellable` 是
     *      **false**，所以沒標的來源一律拔不走（GH#295 之前**連這一格都不存在**，
     *      於是這一池是一個死開關：兩道閘相乘為零）；
     *   ② `applyBuff.polarity` 要對得上這裡的 `polarity` —— 沒填極性的來源，
     *      任何有方向的淨化都拔不到（「不知道」不當成「是」）。
     *
     * ⚠️ `shields` 在 `polarity: "debuff"`（本 kind 的預設）下**整池跳過**，而那是
     * 刻意的不是缺陷：護盾沒有極性也沒有 `dispellable`，一發「解掉自己身上的減益」
     * 不該順手吃掉自己的護盾。要打盾就寫 `polarity: "any"` / `"buff"`，或者用
     * 專門的 `shieldBreak` kind（它不受 `dispelRules.enabled` 這個止血閥影響）。
     */
    pools: z
      .object({
        status: z.boolean().optional(),
        shields: z.boolean().optional(),
        dot: z.boolean().optional(),
        buffs: z.boolean().optional(),
      })
      .strict()
      .optional(),
    /** 只清這一種極性。省略 = `"debuff"`（淨化的字面意思）。 */
    polarity: z.enum(["buff", "debuff", "any"]).optional(),
    /**
     * 每一池最多拔幾層。省略 = 後台的 `maxCountCap`；
     * **寫了也夾不過它**（一句話管到底，見 `sim/dispelRules.ts`）。
     *
     * ⭐ 想寫「解除**全部**負面狀態」的卡，正解是**整格省略** ——
     * 那就是「跟著後台的全域上限走」，而出貨的全域上限是 **50**
     * （owner 2026-08-18 定案）。⛔ 填一個大數字**不是**同一件事：它會凍結在
     * 文件裡，owner 哪天調那一格，省略的自動跟上、填死的不會。
     * ⚠️ 這一批量到 7 份文件寫了 50 而當時上限是 3 —— 它們全部被靜默夾掉，
     * 卡面卻印著「全部」。那是這一格最容易出的錯，⛔ 不要再寫數字。
     *
     * ⚠️ 這裡的 `.max` 是 `DISPEL_MAX_COUNT_BOUNDS` 的**上界**（60，GH#360），
     * ⛔ 不是出貨值（50）—— 它擋的是「文件寫了一個連後台都調不到的數字」。
     * 三個住處分歧的守衛：`sim/dispelRules.test.ts`。
     */
    count: z.number().int().positive().max(60).optional(),
    /** 拔不完時先拔哪一邊。省略 = 後台的 `defaultOrder`。 */
    order: z.enum(["newest", "oldest"]).optional(),
  })
  .strict();

/**
 * ⭐ 這一支的跨欄位檢查 —— 分片前它是 `refineEffectDef` 裡的一條 `if`。
 * ⛔ 掛在 `index.ts` 的派發表上，⛔ 不是掛在下面那個 `z.object` 上：
 *    `.superRefine` 會把 `ZodObject` 變成 `ZodEffects`，而
 *    `z.discriminatedUnion` 只收 `ZodObject`（zod 的型別約束，⛔ 不是風格）。
 */
export const refine = (
  e: Extract<EffectDef, { kind: "dispel" }>,
  ctx: z.RefinementCtx,
): void => {
  refineDispelShape(e, ctx);
};
