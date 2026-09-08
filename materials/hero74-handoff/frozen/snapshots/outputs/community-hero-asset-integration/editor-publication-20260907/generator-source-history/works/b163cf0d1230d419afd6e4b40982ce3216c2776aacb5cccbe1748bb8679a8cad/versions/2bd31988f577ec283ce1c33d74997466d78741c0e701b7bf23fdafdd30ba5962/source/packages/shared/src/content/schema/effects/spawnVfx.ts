import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import { zRef } from "../common";
import {
  EFFECT_COMMON_SHAPE,
} from "./_shared";

export const zSpawnVfx =
z
  .object({
    kind: z.literal("spawnVfx"),
    ...EFFECT_COMMON_SHAPE,
    /** vfx@1 doc id (SOFT ref — the doc may be imported/authored later). */
    vfxId: zRef("vfx", { soft: true }),
    /**
     * where the one-shot plays: caster (default), first target, the cast
     * point — or a named bone on the CASTER's model (`at:"bone"` + `attach`).
     *
     * ⭐ GH#649/#565 —— 原作 285 次 timed 掛件（`AddSpecialEffectTarget`）的
     * 形狀：一次性特效掛在**施法者模型的骨頭**（chest/hand/weapon/…）上。
     * 骨頭是客戶端的概念，sim 只把 `attach` 字串原樣送過線；
     * 解析（含 WC3 fallback 鏈與「替身無骨 → 退回胸口」）全在 `VfxSystem`。
     */
    at: z.enum(["self", "target", "point", "bone"]).optional(),
    /**
     * ⭐ GH#809 —— 骨頭掛在**哪一個單位**的模型上。
     *
     * ⚠️ 在這一格出現之前，`at:"bone"` 的錨定單位**恆為施法者**
     * （`spawnVfx.ts` 的註解逐字寫著「與 `self` 同路」）—— 於是原作那一族
     * 「掛在**受擊者**身上」的呼叫**表達不出來**。量到的母體（2026-08-30 重跑
     * `tools/w3x-import/out/GoDieEX22s-src/raw/*.j`，括號＋引號配對切參數）：
     * `AddSpecialEffectTargetUnitBJ` **317 次**，第二個參數
     * `GetEnumUnit()` **83** ＋ `GetSpellTargetUnit()` **9** ＝ **92 次**
     * 明確錨在受擊者身上（其餘以 `GetTriggerUnit()` 96 次為大宗，
     * 施法觸發器裡是施法者、傷害觸發器裡是受擊者 ⇒ ⛔ 不併進上面那個數）。
     *
     * 省略 ＝ `"caster"` ＝ 逐位元組同這一格出現之前（票的 rollback 條件）。
     *
     * ⭐ `"victim"` 解析成 `ctx.targets[0]`（與 `at:"target"`、`delayed.who`
     * 同一份詞彙、同一個解析）。⛔ 這裡**不**自己再解一次圓：原作那 83 次是
     * `ForGroup` 的迴圈體，而 GGD 的「每個被打到的人各跑一次」已經有機制 ——
     * `damageArea.onHitTargetsMode:"perTarget"`。在這裡多寫一份扇出就是同一個
     * 決定的第二個住處（第〇·四守則）。
     */
    boneOn: z
      .enum(["caster", "victim"])
      .optional()
      .describe(
        "骨頭掛在誰身上：caster（預設，施法者自己）或 victim（這次解出來的第一個目標）。" +
          "「血從**被打的人**胸口噴出來」要選 victim —— 留空的話特效會掛在施法者身上。" +
          '只在 at:"bone" 時生效。',
      ),
    /**
     * WC3 掛點字串（`chest` / `hand,right` / `weapon` / …），
     * ⭐ 只有 `at:"bone"` 讀它（跨欄位檢查在 {@link refine}）。
     * 解析走 `attachment.ts` 的正規化＋fallback 鏈，所以 19 種原始寫法
     * （`handright` / `hand,right` / 尾空白）都收得下。
     */
    attach: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe("骨頭掛點（WC3 attach 字串，如 chest / hand,right / weapon）。只在 at:\"bone\" 時生效。"),
    /** seconds a continuous doc keeps emitting (client hint; optional). */
    durationSec: z.number().min(0).optional(),
  })
  .strict();

/**
 * 跨欄位：`at:"bone"` ⇔ `attach` **成對出現**。
 * ⛔ 沒有這條，`attach` 單獨出現時就是一格「說了但不會發生」的欄位
 * （第一·五守則），而 `at:"bone"` 缺 `attach` 則是一次靜默的什麼都不畫。
 */
export const refine = (
  e: Extract<EffectDef, { kind: "spawnVfx" }>,
  ctx: z.RefinementCtx,
): void => {
  if (e.at === "bone" && e.attach === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["attach"],
      message: 'spawnVfx: at:"bone" 需要 attach（骨頭掛點字串，如 chest / weapon）',
    });
  }
  if (e.attach !== undefined && e.at !== "bone") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["at"],
      message: 'spawnVfx: attach 只在 at:"bone" 時生效 —— 補 at:"bone" 或拿掉 attach',
    });
  }
  // ⭐ GH#809 —— `boneOn` 落單就是一格「說了但不會發生」的欄位（第一·五守則）：
  // 作者選了 victim、卡面/編輯器印出來、而 `at` 不是 bone ⇒ 引擎根本不讀它。
  if (e.boneOn !== undefined && e.at !== "bone") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["at"],
      message: 'spawnVfx: boneOn 只在 at:"bone" 時生效 —— 補 at:"bone" 或拿掉 boneOn',
    });
  }
};
