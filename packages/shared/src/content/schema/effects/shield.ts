import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import { zScaling } from "../common";
import {
  EFFECT_COMMON_SHAPE,
} from "./_shared";

export const zShield =
z
  .object({
    kind: z.literal("shield"),
    ...EFFECT_COMMON_SHAPE,
    amount: zScaling,
    duration: z.number().min(0),
    /**
     * 護盾吸收哪一種傷害 (owner 2026-07-30: 「護盾的確有分吸收所有傷害跟吸收
     * AP 傷害 only」). ABSENT = "all" = 現行行為, 所以既有文件一份都沒有改變
     * 意思;"magic" 就是 owner 說的「只吸 AP 傷害」。
     *
     * 過濾在 combat/damage.ts 的**減傷之後**發生 (跟一直以來同一步), 所以
     * 「650 點護盾」的意思仍然是「擋掉 650 點玩家實際會吃到的傷害」。
     * 不吃這一型的池子對這一發**完全透明**: 不吸收, 也不被消耗。
     * 同一個單位身上有兩種池子時, **先花窄的再花全類型的** —— 理由寫在
     * combat/damage.ts 的 `absorbOrder`。
     */
    absorbs: z.enum(["all", "physical", "magic", "true"]).optional(),
    /**
     * ⭐ GH#299（S1）—— 「[護盾]不會疊加」寫得出來了。
     *
     * 同一個 `stackKey` 的護盾視為**同一片**；缺席 = 每次都是新的一片
     *（2026-08-09 之前的行為，既有內容逐字不變）。合併規則見 `onExisting`。
     * ⛔ 兩格要一起填 —— 只填 `onExisting` 會被拒（見 `refineShieldStack`）。
     */
    stackKey: z.string().min(1).max(48).optional(),
    /**
     * 身上已經有同 key 的一片時怎麼辦。`stackKey` 有填而這格沒填 = `"replace"`。
     *   · `replace`    整片換新（量與到期都用新的）—— 「不會疊加」的字面意思
     *   · `keepLarger` 留量大的那一片，到期取較晚的
     *   · `stack`      量相加，到期取較晚的
     */
    onExisting: z.enum(["replace", "keepLarger", "stack"]).optional(),
  })
  .strict();

/**
 * ⭐ 分片前這一段住在 `refineEffectDef` 的 `if (e.kind === "shield")` 裡（逐字搬過來）。
 *
 * `onExisting` 沒有 `stackKey` 就沒有東西可以比對 —— 一格看起來有設、
 * 實際上永遠不會被讀到的欄位（失敗形態②）。與 `grantAttribute` 的
 * `maxSourceTotal` 需要 `store:"source"` 是同一條規矩、同一個訊息形狀。
 */
export const refine = (
  e: Extract<EffectDef, { kind: "shield" }>,
  ctx: z.RefinementCtx,
): void => {
  if (e.onExisting !== undefined && e.stackKey === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["onExisting"],
      message:
        'onExisting 需要 stackKey —— 沒有 key 就沒有「已經有的那一片」可以比對, ' +
        "這一格永遠不會被讀到, 而護盾照樣一片一片疊上去",
    });
  }
};
