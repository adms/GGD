import { z } from "zod";
import { RANDOM_AREA_MAX_COUNT, RANDOM_AREA_MAX_INTERVAL_SEC, RANDOM_AREA_MAX_SCATTER_RADIUS } from "../../../sim/effects/kindLimits";
import {
  EFFECT_COMMON_SHAPE,
  zEffectDef,
} from "./_shared";

export const zRandomArea =

/**
 * ── Lane 2（2026-08-08）三個新 kind ────────────────────────────────────
 * 與 Lane 1 同一個形狀；上下界一律從 `sim/effects/kindLimits.ts` 讀，
 * ⛔ 不在這裡抄字面值。
 */

/**
 * 【隨機落點排程】(13-04 龍星群 · 70-04 千年練成)。⭐ draw 預算 = 2×count。
 *
 * ⛔ **這個 kind 沒有 `shape` / `radius` / `side` / `maxTargets`**（2026-08-10
 * 拿掉，遷移成本 0：`content/` 當時有 **0 份** randomArea）。理由是可以從
 * handler 讀出來的，不是風格偏好：
 *
 *   `randomArea` 解的是**落點**，不是**受害者**。它 `push` 一個 wave，到期時用
 *   `targets: []` + `point: hit.pos` 跑 `wave.effects` —— 「打到誰」是**巢狀的**
 *   `damageArea` 自己拿 `ctx.point` 當圓心解出來的。所以 `sim/effects/randomArea.ts`
 *   **一格都不讀**那四格：它們是同一件事的第二個住處，作者填了完全沒有效果，
 *   而畫面上跟「這招就設計成這樣」分不出來。
 *
 * ⭐ 它的作用範圍由 {@link scatterRadius}（落點散佈半徑）+ `who`（以誰為圓心）
 * 講清楚 —— 那正是 E1 要的東西，只是不叫 `shape`。⛔ 反過來把 `shapeTargets`
 * 接上去是在做 `delayed` 已經做的事（「施放那一刻凍住的名單」），
 * 兩個 kind 的差別就是那一句話。
 */
z
  .object({
    kind: z.literal("randomArea"),
    ...EFFECT_COMMON_SHAPE,
    who: z.enum(["self", "target"]).optional(),
    /** 逐階發數（70-04 = `[4,6,8]`、13-04 = `[10]`）。 */
    count: z
      .array(z.number().int().positive().max(RANDOM_AREA_MAX_COUNT))
      .min(1)
      .max(5),
    intervalSec: z.number().positive().max(RANDOM_AREA_MAX_INTERVAL_SEC),
    scatterRadius: z.number().positive().max(RANDOM_AREA_MAX_SCATTER_RADIUS),
    firstAtCast: z.boolean().optional(),
    stopOnCasterDeath: z.boolean().optional(),
    /**
     * 每一發落地跑的東西。`.min(1)` 是刻意的：一波什麼都不做的流星在遊戲裡
     * 跟「技能壞掉」一模一樣（失敗形態 ②）。
     */
    effects: z.array(zEffectDef).min(1),
  })
  .strict();
