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
};
