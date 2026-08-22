import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import { KB_MAX_GETUP_TICKS } from "../../../sim/effects/knockbackLimits";
import {
  PULL_MAX_ANCHORS,
  PULL_MAX_ANCHOR_RADIUS,
  PULL_MAX_RADIUS,
  PULL_MAX_SPEED,
  PULL_MAX_TRAVEL,
} from "../../../sim/effects/kindLimits";
import { DISPLACEMENT_SPEED_MIN } from "../../displacementTiers";
import { EFFECT_COMMON_SHAPE, refineDispelShape } from "./_shared";

/**
 * ⭐【吸引】`pull`（#147）—— 把一組身體**搬到一個點**。
 *
 * 上下界一律讀 `sim/effects/kindLimits.ts`，⛔ 這裡不抄字面值。
 * 「它為什麼不是 `knockback` 的 `from:"pull"`」與「錨點環為什麼沒有三角函式」
 * 寫在 `sim/effects/pull.ts` 的檔頭 —— ⛔ 這裡不重複一份。
 */
export const zPull = z
  .object({
    kind: z.literal("pull"),
    ...EFFECT_COMMON_SHAPE,
    /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
    shape: z.enum(["single", "circle"]),
    radius: z.number().positive().max(PULL_MAX_RADIUS).optional(),
    side: z.enum(["allies", "enemies"]).optional(),
    maxTargets: z.number().int().positive().max(24).optional(),
    destination: z
      .enum(["caster", "point", "anchorRing"])
      .optional()
      .describe(
        "搬到哪：caster（預設，施法者腳下）／point（這一次的落點）／anchorRing（等分錨點環，一人一個點）。",
      ),
    anchorCount: z.number().int().positive().max(PULL_MAX_ANCHORS).optional(),
    anchorRadius: z.number().positive().max(PULL_MAX_ANCHOR_RADIUS).optional(),
    speed: z.number().min(DISPLACEMENT_SPEED_MIN).max(PULL_MAX_SPEED),
    stopDistance: z.number().min(0).max(PULL_MAX_TRAVEL).optional(),
    uncontrollable: z.boolean().optional(),
    getupTicks: z.number().int().min(0).max(KB_MAX_GETUP_TICKS).optional(),
  })
  .strict();

/**
 * 這一支的跨欄位檢查。⛔ 掛在 `index.ts` 的派發表上（理由同其他 kind）。
 */
export const refine = (
  e: Extract<EffectDef, { kind: "pull" }>,
  ctx: z.RefinementCtx,
): void => {
  refineDispelShape(e, ctx);

  // 錨點環的兩格只有在選了那個 destination 時才有人讀 —— 反過來也一樣。
  const ring = e.destination === "anchorRing";
  if (ring && e.anchorCount === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["anchorCount"],
      message:
        'destination:"anchorRing" 一定要有 anchorCount —— 缺了它整環退化成一個點，' +
        "而那看起來就跟 destination:\"caster\" 一模一樣（失敗形態②）",
    });
  }
  if (ring && e.anchorRadius === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["anchorRadius"],
      message: 'destination:"anchorRing" 一定要有 anchorRadius —— 半徑 0 的環就是一個點',
    });
  }
  for (const k of ["anchorCount", "anchorRadius"] as const) {
    if (!ring && e[k] !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [k],
        message: `只有 destination:"anchorRing" 讀得到 ${k} —— 這一格現在是一個看起來有設、其實沒有人讀的數字`,
      });
    }
  }
};
