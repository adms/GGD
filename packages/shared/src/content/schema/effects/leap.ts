import { z } from "zod";
import { zDisplacementTier } from "../displacementDoc";
import {
  EFFECT_COMMON_SHAPE,
  zAoeTier,
  zEffectDef,
} from "./_shared";

export const zLeap =
/**
 * leap (task #247) — mirrors the `leap` member of `EffectDef`. Ported from
 * the map's own parabola (see sim/movement/leap.ts); `apexHeight`/`landRadius`
 * arrive here in GGD units, converted from the JASS wc3 values by `toLen`
 * inside the template expander, so there is no second conversion constant.
 */
z
  .object({
    kind: z.literal("leap"),
    ...EFFECT_COMMON_SHAPE,
    applyTo: z.enum(["self", "target"]).optional(),
    mode: z.enum(["toPoint", "inPlace"]),
    apexHeight: z.number().min(0),
    durationSec: z.number().positive(),
    throwDistance: z.number().min(0).optional(),
    /**
     * ⭐ GH#1260 B3 —— 拋投距離的級別（第〇·四守則：值在載入時從共用表解析）。
     * 註冊時由 `config.displacement-tiers@1` 翻成 `throwDistance`：被拋的是**目標**走 push 梯、
     * 自己飛走 travel 梯（`displacementFieldsOf`）。兩格都填 → **級別贏**。
     */
    distanceTier: zDisplacementTier
      .optional()
      .describe("拋投距離級別（極小…極大）。填了就不用填 throwDistance —— 由後台「位移級距」頁統一給。"),
    /** yank the flyer to the caster before the throw (j:51755-51767) */
    dragToCaster: z.boolean().optional(),
    landRadius: z.number().min(0).optional(),
    /**
     * ⭐ GH#1260 B3 —— 落地爆炸半徑的級別。註冊時由 `config.aoe-tiers@1` 翻成 **`landRadius`**
     * （`aoeTiers.ts::radiusFieldOf`），⛔ 不是 `radius`。兩格都填 → **級別贏**。
     */
    radiusTier: zAoeTier.optional(),
    onLand: z.array(z.lazy(() => zEffectDef)).optional(),
  })
  .strict();
