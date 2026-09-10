import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import {
  PULL_MAX_RADIUS,
  SCREEN_SHAKE_MAX_AMPLITUDE,
  SCREEN_SHAKE_MAX_SEC,
} from "../../../sim/effects/kindLimits";
import { EFFECT_COMMON_SHAPE, refineDispelShape, refineCueGeometry } from "./_shared";

/**
 * ⭐【螢幕震動】`screenShake`（#543）—— 與 `screenFlash` 是**同一個決策的兩半**
 * （owner：「畫面閃爍及震動」），所以 `applyTo` 是同一格語意、同一支解析器。
 */
export const zScreenShake = z
  .object({
    kind: z.literal("screenShake"),
    ...EFFECT_COMMON_SHAPE,
    /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。`applyTo:"victim"` 時它決定名單。 */
    shape: z.enum(["single", "circle"]),
    radius: z.number().positive().max(PULL_MAX_RADIUS).optional(),
    side: z.enum(["enemies", "allies"]).optional(),
    maxTargets: z.number().int().positive().max(24).optional(),
    amplitude: z
      .number()
      .positive()
      .max(SCREEN_SHAKE_MAX_AMPLITUDE)
      .describe(
        "⭐ 0..1 的**正規化**強度，⛔ 不是像素：真正的位移量 = 這個數字 × config.screen-cues@1 的上限。",
      ),
    durationSec: z.number().positive().max(SCREEN_SHAKE_MAX_SEC),
    applyTo: z
      .enum(["self", "victim", "nearby", "all"])
      .describe(
        '⭐ `nearby` ＝ 以圓心為心 `radius` 內的**每一個人**（敵我都算）—— ' +
          "JASS `ForGroup(GetUnitsInRangeOfLocAll(R), CameraSetEQNoiseForPlayer)`；" +
          "war3map.j 的 40 次鏡頭噪動裡 **38 次是這個形狀**，⛔ 不是全場。",
      )
      .optional(),
  })
  .strict();

export const refine = (
  e: Extract<EffectDef, { kind: "screenShake" }>,
  ctx: z.RefinementCtx,
): void => {
  refineDispelShape(e, ctx);
  refineCueGeometry(e, ctx);
};
