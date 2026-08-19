import { z } from "zod";
import type { AbilityId } from "../../../ids";
import type { EffectDef } from "../../../sim/effects/effect";
import { CD_REDUCE_MAX_FLAT_SEC, CD_REDUCE_MAX_PCT } from "../../../sim/effects/kindLimits";
import { zCastableSlot, zRef } from "../common";
import {
  EFFECT_COMMON_SHAPE,
  refineDispelShape,
  zAoeTier,
  zEffectDef,
} from "./_shared";

/**
 * `modifyCooldown` 的兩條跨欄位規則（Lane 1）。
 *
 * ① `slot` 與 `abilityId` **至少要有一個** —— 兩個都不填 = 改全部六格，
 *    而「不是全域 cdr」正是這個 kind 存在的理由（owner 明說）。
 * ② `mode:"reduce"` 的 `amount` 是**比例**，所以它的上界是 1 而不是欄位宣告的
 *    120 秒。少了這一條，「50」（作者想寫 50%）會被 handler 靜默夾成 100% ——
 *    同 #277 的形狀：後台收得下、下游才夾掉，而且沒有人被告知。
 */
function refineModifyCooldown(
  e: Extract<EffectDef, { kind: "modifyCooldown" }>,
  ctx: z.RefinementCtx,
): void {
  // ⚠️ 規則①的理由是「兩個都不填 = 改全部六格 = 全域 CDR」，而那句話對
  // `target:"hookInternalCooldown"` **不成立** —— 那條路根本不碰技能槽位，
  // 它指名的是一條觸發器（`hookKey`）。⛔ 留著不放寬，S3 解鎖的技能就寫不出
  // 文件，而錯誤訊息會叫作者去填一個會被 handler 忽略的欄位（比沒有訊息更糟）。
  // `target` 省略 = `"abilitySlot"` = 規則①照舊生效 = 今天每一份文件走的那條路。
  if (
    (e.target ?? "abilitySlot") === "abilitySlot" &&
    e.slot === undefined &&
    e.abilityId === undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["slot"],
      message:
        "要指名**哪一支**技能：填 slot（哪一格）或 abilityId（哪一支）。" +
        "兩個都不填等於改全部六格，而那是全域冷卻縮減（已經有一條屬性在做）。",
    });
  }
  // ⭐ S3 —— `hookScope:"allSources"` 不指名 `hookKey`，就是「重置身上**每一條**
  // 觸發器」。那不是任何人會故意寫的東西，而它在畫面上跟一個超強的被動分不出來。
  if (e.hookScope === "allSources" && e.hookKey === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["hookKey"],
      message:
        'hookScope:"allSources" 一定要有 hookKey —— 不指名的話它會重置這個身體上' +
        "**每一條**觸發器（含別件裝備、別張增益卡的），而畫面上看不出來。",
    });
  }
  // ⭐ ⑤（2026-08-10）—— `target:"hookInternalCooldown"` 一定要**明寫** `hookScope`。
  //
  // 為什麼：`hookScope:"originSource"` 的實作（`effects/modifyCooldown.ts`）只認得
  // `origin` 是 `hook:…` 的呼叫。從**施放**跑出來的同一個效果（`origin` 是
  // `ability:…`）在那裡是一個**靜默的 no-op** —— 技能放得出來、動畫演完、那條
  // 觸發器一格都沒動，而畫面上跟「這招就設計成這樣」分不出來（失敗形態②）。
  //
  // ⛔ schema **測不出**「這個效果會不會從施放路徑跑」：同一支 `zEffectDef` 同時
  // 是 hook 的 `effects` 與技能的 `effects`，而 refine 只看得到節點本身。所以擋得住
  // 的是**真正的那個缺陷**：作者沒有選過就吃到預設值。明寫 `originSource` 的人，
  // 欄位說明會告訴他那句「只有掛在觸發器底下才有作用」。
  //
  // ⚠️ 出貨 0 份 `modifyCooldown`，而 `target:"hookInternalCooldown"` 這條路是
  // S3 才開的，所以這一條擋不到任何既有文件。
  if (e.target === "hookInternalCooldown" && e.hookScope === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["hookScope"],
      message:
        "改觸發器冷卻一定要明寫 hookScope：originSource（只碰**這一發效果自己所屬**" +
        "的那份被動／道具 —— ⚠️ 它只有在這個效果**掛在一條觸發器底下**時才有作用，" +
        "從技能施放跑出來時什麼都不會發生）或 allSources（＋hookKey）。",
    });
  }
  // ⭐ S3 —— `hookKey` 只在改觸發器冷卻時有意義。少了這一條它就是一格填得下、
  // 永遠不被讀的欄位（失敗形態②），而且作者會以為自己縮短的是那條觸發器。
  if (e.hookKey !== undefined && e.target !== "hookInternalCooldown") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["hookKey"],
      message:
        'hookKey 只在 target:"hookInternalCooldown" 下有意義 —— 你現在改的是技能槽位的冷卻。',
    });
  }
  if (e.mode === "reset") return;
  if (e.amount === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["amount"],
      message: `mode:"${e.mode}" 一定要有 amount —— 省略它等於這個效果什麼都不做`,
    });
    return;
  }
  if (e.mode === "reduce" && Math.abs(e.amount) > CD_REDUCE_MAX_PCT) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["amount"],
      message:
        `mode:"reduce" 的 amount 是**比例**（0.5 = 縮短 50%），上限 ${CD_REDUCE_MAX_PCT}。` +
        "想按秒縮短請改 mode:\"reduceFlat\"。",
    });
  }
}

export const zModifyCooldown =

/**
 * ── Lane 1（2026-08-08）四個新 kind ────────────────────────────────────
 * 四個是同一個形狀的四個實例；上下界一律從 `sim/effects/kindLimits.ts` 讀，
 * ⛔ 不在這裡抄字面值（那會是一個沒有守衛的第二住處）。
 */

/** 【縮短特定技能冷卻】(#284) —— 鏡像 `EffectDef` 的同名成員。 */
z
  .object({
    kind: z.literal("modifyCooldown"),
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
    slot: zCastableSlot.optional(),
    abilityId: zRef<AbilityId>("abilities", { soft: true }).optional(),
    mode: z.enum(["reduce", "reduceFlat", "reset"]),
    /**
     * 兩端都有界（CLAUDE.md「欄位要有上界」）。單位隨 `mode`：
     * `reduce` 是比例、`reduceFlat` 是秒。負值 = 延長。
     * ⚠️ 這裡收的是兩個 mode 的**聯集**上界，`refineModifyCooldown` 再按
     * mode 收緊 —— 否則 `reduce` 寫 120 會被當成 12000% 靜默夾掉。
     */
    amount: z
      .number()
      .min(-CD_REDUCE_MAX_FLAT_SEC)
      .max(CD_REDUCE_MAX_FLAT_SEC)
      .optional(),
    basis: z.enum(["remaining", "base"]).optional(),
    /**
     * ⭐ S3 —— 這一發改的是**哪一種**冷卻。
     * 省略 = `"abilitySlot"` = 這個 kind 今天的全部行為（三份既有文件都不填）。
     *
     * `"hookInternalCooldown"` 解鎖的是 60-002 絕光斬那一族：一支 passive-only
     * 的技能永遠不會被 cast，所以它的技能冷卻**恆為 0**，而
     * `if (inst.cooldownRemainingTicks <= 0) continue;` 在第一道就跳過它 ——
     * 「120 秒一次」與「反彈成功立即重置」於是二選一。
     *
     * ⛔ 為什麼不「自動偵測」：那會讓一支寫錯 `abilityId` 的文件安靜地去重置某條
     * 觸發器，而作者以為自己在縮短技能冷卻。
     */
    target: z
      .enum(["abilitySlot", "hookInternalCooldown"])
      .optional()
      .describe(
        "改哪一種冷卻：abilitySlot（預設，技能按鈕的冷卻）或 hookInternalCooldown" +
          "（一條觸發器的內部冷卻 —— 被動技唯一有冷卻的那一格）。",
      ),
    /**
     * ⭐ S3 —— `target: "hookInternalCooldown"` 時指名哪一條觸發器（比對
     * `HookDef.key`）。省略 = 那份來源上的**每一條**。
     * ⚠️ `target` 不是 hook 時填了它 = PARSE ERROR（`refineModifyCooldown`）。
     */
    hookKey: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe(
        "只重置／縮短這一條觸發器（填它的名字）。留空＝那個被動上的每一條。",
      ),
    /**
     * ⭐ S3 —— 這一發碰得到**誰的**觸發器。這是這個機制唯一真正的「A 還是 B」，
     * 所以它是一格欄位而不是註解裡的一段辯護（第一守則：決策點）。
     *
     * ⚠️ 2026-08-10（⑤）：`target:"hookInternalCooldown"` 下它**必填**，不再有
     * 預設值。理由是 `originSource` 從**施放**路徑跑出來時是一個靜默的 no-op，
     * 而「沒選過就吃到預設值」正是那個缺陷唯一真的會發生的形狀
     * （`refineModifyCooldown` 擋；schema 測不出執行路徑，所以擋的是預設值）。
     *
     * · `originSource` —— 只動這一發效果**自己所屬**的那一份來源。
     *   60-002 絕光斬要的就是它：「反彈成功 → 重置**我自己**那條 120 秒的觸發器」，
     *   兩條 hook 住在同一份被動來源上。
     * · `allSources` —— 「這張卡重置你身上**所有**叫這個名字的觸發器」。
     *   ⚠️ 它必須指名 `hookKey`（`refineModifyCooldown` 擋）。
     *
     * 預設選 `originSource` 因為它**嚴格較窄**：一份打錯 `hookKey` 的文件在它之下
     * 什麼都不會發生，在 `allSources` 之下會安靜地重置**別件裝備**的 proc。
     *
     * ⚠️ 這條路今天整條不存在（出貨 0 份 `modifyCooldown`），所以「等於今天的
     * 行為」在這裡的正確讀法是**最保守的那一個**：只碰自己那一份。
     */
    hookScope: z
      .enum(["originSource", "allSources"])
      .optional()
      .describe(
        "碰得到誰的觸發器：originSource（只有這一發效果自己所屬的那份被動／道具" +
          " —— ⚠️ 它只有在這個效果**掛在一條觸發器底下**時才有作用，從技能施放" +
          "跑出來時它一格都不會動）或 allSources（這個身體上每一份叫得出同一個" +
          " hookKey 的來源）。allSources 一定要填 hookKey，否則就是「重置身上每" +
          "一條觸發器」。⚠️ 改觸發器冷卻時這一格**必填**（沒有預設值可以吃）。",
      ),
  })
  .strict();

/**
 * ⭐ 這一支的跨欄位檢查 —— 分片前它是 `refineEffectDef` 裡的一條 `if`。
 * ⛔ 掛在 `index.ts` 的派發表上，⛔ 不是掛在下面那個 `z.object` 上：
 *    `.superRefine` 會把 `ZodObject` 變成 `ZodEffects`，而
 *    `z.discriminatedUnion` 只收 `ZodObject`（zod 的型別約束，⛔ 不是風格）。
 */
export const refine = (
  e: Extract<EffectDef, { kind: "modifyCooldown" }>,
  ctx: z.RefinementCtx,
): void => {
  // ⚠️ 順序照分片前逐字：先共用的 `shape` 檢查，再這一支自己的規則。
  //    反過來寫測不出來 —— 只有錯誤**訊息的順序**會變。
  refineDispelShape(e, ctx);
  refineModifyCooldown(e, ctx);
};
