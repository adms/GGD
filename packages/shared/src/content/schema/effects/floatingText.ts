import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import {
  FLOATING_TEXT_MAX_LEN,
  FLOATING_TEXT_MAX_RISE,
  FLOATING_TEXT_MAX_SEC,
  FLOATING_TEXT_MAX_SIZE_SCALE,
  PULL_MAX_RADIUS,
} from "../../../sim/effects/kindLimits";
import {
  FLOATING_TEXT_MAX_DRIFT,
  FLOATING_TEXT_MAX_DRIFT_DEG,
} from "../../../sim/effects/floatingText";
import { EFFECT_COMMON_SHAPE, refineDispelShape, refineCueGeometry, zRgb } from "./_shared";

/**
 * ⭐【特效文字】`floatingText`（#549）—— 原作 `CreateTextTagUnitBJ`
 * （例：克勞德每一刀冒 `1Hit`…`7Hit`，`war3map.j:33856`）。
 *
 * ⭐ `text` 支援佔位符 `{{i}}` = **這一次執行是序列裡的第幾段**，所以
 * 「1Hit…7Hit」是 `comboStrikes.perStrike` 裡的**一個**節點寫 `"{{i}}Hit"`，
 * ⛔ 不是七個各寫死一個數字的節點（第〇·四守則）。
 */
export const zFloatingText = z
  .object({
    kind: z.literal("floatingText"),
    ...EFFECT_COMMON_SHAPE,
    /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。`applyTo:"victim"` 時它決定名單。 */
    shape: z.enum(["single", "circle"]),
    radius: z.number().positive().max(PULL_MAX_RADIUS).optional(),
    side: z.enum(["enemies", "allies"]).optional(),
    maxTargets: z.number().int().positive().max(24).optional(),
    text: z
      .string()
      .min(1)
      .max(FLOATING_TEXT_MAX_LEN)
      .describe("要冒的字。⭐ 支援 {{i}}（第幾段）—— 連段的「1Hit…7Hit」寫成一個節點。"),
    colorRgb: zRgb.optional(),
    /**
     * ⭐⭐ **M7（GH#965）—— 浮動文字的飛出方向**（度，0 = 正上方，順時針）。
     *
     * ⭐ 原作那一族「傷害數字往受擊方向噴」靠的就是這一格；
     * ⛔ 而今天每一個浮動文字都**直直往上飄** ⇒ 五個人同時被打，
     * 五串數字**疊在同一條垂直線上**（玩家一個都讀不到）。
     *
     * 省略 ＝ 往上（＝ 逐位元組同這一格出現之前）。
     */
    velocityAngle: z
      .number()
      .min(0)
      .max(360)
      .optional()
      .describe(
        "數字往哪個方向飛出（度，0 = 正上方，順時針）。" +
          "⭐ 同一瞬間多個目標時，給不同角度才讀得到；留空 = 全部往上疊在一起。",
      ),
    sizeScale: z.number().positive().max(FLOATING_TEXT_MAX_SIZE_SCALE).optional(),
    riseSpeed: z.number().min(0).max(FLOATING_TEXT_MAX_RISE).optional(),
    /**
     * ⭐ GH#853 —— **地面平面**的飄移速度（GGD 世界單位/秒），原作
     * `SetTextTagVelocityBJ(tag, speed, angle)` 的第一個參數。
     *
     * ⚠️ 缺席 ⇒ 不飄 ⇒ 逐位元組同以前。⛔ 它**不是** `riseSpeed` 的別名：
     * `riseSpeed` 走垂直軸、這一格走地面平面（`sim/effects/floatingText.ts` ②）。
     * ⚠️ ⛔ 不要把 JASS 的 `64` 直接填進來 —— 單位不同（`TextTagSpeed2Velocity`）；
     * 要翻的是**速度比例**（原作用過 8…350）與**角度關係**。
     */
    driftSpeed: z.number().min(0).max(FLOATING_TEXT_MAX_DRIFT).optional(),
    /**
     * 飄移角度（度，`0°=+x`、`90°=+z`、逆時針）—— BJ 的第二個參數。
     * `driftFrom:"casterFacing"` 時它是**相對面向**的偏移（原作全部是裸的
     * `GetUnitFacing(u)` ⇒ 那一族翻過來就是 0）。
     */
    driftAngleDeg: z
      .number()
      .min(-FLOATING_TEXT_MAX_DRIFT_DEG)
      .max(FLOATING_TEXT_MAX_DRIFT_DEG)
      .optional(),
    /**
     * ⭐ 每一段再多轉幾度 —— 出處是超究武神霸斬 `war3map.j:33850`
     * 的 `set udg_superAngle = udg_superAngle + 270.00`（每一刀轉一次）。
     * 段號與 `{{i}}` 同一格（`EffectContext.sequenceIndex`）：
     * `實際角度 = driftAngleDeg + driftAngleStepDeg × (段號 − 1)`。
     */
    driftAngleStepDeg: z
      .number()
      .min(-FLOATING_TEXT_MAX_DRIFT_DEG)
      .max(FLOATING_TEXT_MAX_DRIFT_DEG)
      .optional(),
    /**
     * 角度**相對誰**量 —— 原作那 120 次呼叫量到的角度來源。
     *   · `world`（預設）＝ 字面度數，94/120（全部是 `90`）
     *   · `casterFacing` ＝ `GetUnitFacing(<unit>)`，18/120
     * ⛔ 還沒有 `random`（`GetRandomDirectionDeg()`，6/120）—— 它擋住 0 支招牌技，
     *    理由寫在 `sim/effects/floatingText.ts` ③。
     */
    driftFrom: z.enum(["world", "casterFacing"]).optional(),
    durationSec: z.number().positive().max(FLOATING_TEXT_MAX_SEC).optional(),
    applyTo: z
      .enum(["self", "victim"])
      .optional()
      .describe("字冒在誰頭上。⛔ 沒有 all —— 字要有一個身體當錨。"),
  })
  .strict();

export const refine = (
  e: Extract<EffectDef, { kind: "floatingText" }>,
  ctx: z.RefinementCtx,
): void => {
  refineDispelShape(e, ctx);
  refineCueGeometry(e, ctx);
  // ⭐ 第一·五守則：一格「說了但不會發生」的欄位比缺席更糟 —— 三個角度欄位
  //    在沒有 `driftSpeed`（或 0）時**逐位元等於不存在**，而卡面/編輯器上它們
  //    看起來完全生效。⇒ 在載入時就擋下來，⛔ 不是讓它靜默地什麼都不做。
  if (e.driftSpeed === undefined || e.driftSpeed <= 0) {
    for (const k of ["driftAngleDeg", "driftAngleStepDeg", "driftFrom"] as const) {
      if (e[k] === undefined) continue;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [k],
        message:
          `\`${k}\` 沒有 \`driftSpeed\` 就不會發生任何事（速度 0 的方向 ＝ 沒有方向）。` +
          "⇒ 補上 `driftSpeed`，或把這一格拿掉。",
      });
    }
  }
};
