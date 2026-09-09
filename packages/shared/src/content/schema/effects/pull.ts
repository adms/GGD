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
import { EFFECT_COMMON_SHAPE, refineDispelShape, zAoeTier } from "./_shared";

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
    /**
     * ⭐ 半徑級別（第〇·四守則：值在載入時從共用表解析）。
     *
     * ⛔⛔ 2026-09-10 抓到（GH#1165）：`pull` 有 `radius` 卻**沒有**這一格，
     * ⭐ 而 `blink` / `carry` / `chainLightning` / `damageArea` / `delayed` /
     * `taunt` / `dispel` 全都有 —— ⇒ ⛔ 它是這張表上**唯一漏掉的一格**。
     *
     * ⚠️ ⭐ 而它是被**正規化器**撞出來的，⛔ 不是有人讀出來的：
     * `apply_tiers.py` 對「有 radius 的節點」一律補 `radiusTier` ⇒ 兩支新技能
     * （`b2-kisaragi.q` / `b2-shadow.q`）當場被 `.strict()` 擋在 `content:build`。
     * ⇒ ⭐ 正規化器是對的（`pull.radius` 就是一個半徑），⛔ 漏的是這一行。
     *
     * ⭐ 解析走全專案唯一那一處（`aoeTiers.ts::resolveRadiusTier`，
     * 它是**逐節點遞迴**的 ⇒ 不必為 `pull` 加任何解析程式碼）。
     * 兩格都填 → **級別贏**（與其他每一個 kind 同一條規則）。
     */
    radiusTier: zAoeTier.optional(),
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
