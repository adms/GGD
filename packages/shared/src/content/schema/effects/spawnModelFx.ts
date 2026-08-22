import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import {
  MODEL_FX_MAX_DISTANCE,
  MODEL_FX_MAX_INSTANCES,
  MODEL_FX_MAX_LIFE_SEC,
  MODEL_FX_MAX_SCALE,
  MODEL_FX_MAX_SPEED,
  MODEL_FX_MAX_SPIN_DEG_PER_SEC,
  MODEL_FX_MAX_TOUCH_RADIUS,
  PULL_MAX_RADIUS,
} from "../../../sim/effects/kindLimits";
import { EFFECT_COMMON_SHAPE, refineDispelShape, zEffectDef } from "./_shared";

/**
 * ⭐【移動中的模型特效】`spawnModelFx`（#551）—— 原作的 **locust dummy 單位**：
 * 一具沿路徑硬推的 3D 模型，穿透式碰撞。
 *
 * 上下界一律讀 `sim/effects/kindLimits.ts`，⛔ 這裡不抄字面值。
 * 「它為什麼不是 `spawnVfx` 也不是 `spawnProjectile`」與「等分角度為什麼沒有
 * 三角函式」寫在 `sim/effects/spawnModelFx.ts` 的檔頭 —— ⛔ 這裡不重複一份。
 */
export const zSpawnModelFx = z
  .object({
    kind: z.literal("spawnModelFx"),
    ...EFFECT_COMMON_SHAPE,
    /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
    shape: z.enum(["single", "circle"]),
    radius: z.number().positive().max(PULL_MAX_RADIUS).optional(),
    side: z.enum(["enemies", "allies"]).optional(),
    maxTargets: z.number().int().positive().max(24).optional(),
    modelKey: z
      .string()
      .min(1)
      .describe("模型 id（`content/models`）。這是一具有骨架的模型，⛔ 不是粒子貼圖。"),
    path: z
      .enum(["forward", "toTarget", "orbit", "radial"])
      .describe(
        "路徑：forward（沿面向直線）／toTarget（朝目標直線）／radial（count 個等分向外發散）／orbit（count 個在半徑 distance 的環上繞）。",
      ),
    speed: z.number().positive().max(MODEL_FX_MAX_SPEED).describe("世界單位／秒。"),
    distance: z
      .number()
      .positive()
      .max(MODEL_FX_MAX_DISTANCE)
      .optional()
      .describe(
        "走多遠。⚠️ path:\"orbit\" 時它是**環半徑**（繞著施法者跑的那個圈多大），⛔ 不是走多遠。",
      ),
    count: z
      .number()
      .int()
      .positive()
      .max(MODEL_FX_MAX_INSTANCES)
      .optional()
      .describe("radial／orbit 幾個實例等分。⛔ 直線路徑讀不到它。"),
    spinDegPerSec: z
      .number()
      .min(-MODEL_FX_MAX_SPIN_DEG_PER_SEC)
      .max(MODEL_FX_MAX_SPIN_DEG_PER_SEC)
      .optional()
      .describe("⭐「翻滾」：模型繞自己的軸轉，度／秒（負值 = 反向）。純視覺。"),
    scale: z.number().positive().max(MODEL_FX_MAX_SCALE).optional(),
    lifeSec: z
      .number()
      .positive()
      .max(MODEL_FX_MAX_LIFE_SEC)
      .optional()
      .describe("活多久。orbit 必填（那是它唯一的終止條件）；與 distance 都給時取先到的那一個。"),
    onArrive: z
      .array(zEffectDef)
      .min(1)
      .optional()
      .describe("抵達／壽命到 → 在落點跑這一串（落點爆炸）。「炸多大」由巢狀的 damageArea 自己解。"),
    onTouch: z
      .array(zEffectDef)
      .min(1)
      .optional()
      .describe("路徑上碰到人。⚠️ 它把這一次施放變成逐段取樣的班表。"),
    touchRadius: z.number().positive().max(MODEL_FX_MAX_TOUCH_RADIUS).optional(),
    touchSide: z.enum(["enemies", "allies"]).optional(),
    touchOncePerTarget: z
      .boolean()
      .optional()
      .describe("同一個人只被同一具模型碰一次。省略 = true。"),
  })
  .strict();

/**
 * 這一支的跨欄位檢查。⛔ 掛在 `index.ts` 的派發表上（理由同其他 kind）。
 *
 * ⚠️ 每一條都是同一個形狀：**一格填了但沒有人讀**（或**沒填而下游會靜默退化**）。
 * 兩者在畫面上都跟正確的一模一樣（失敗形態②），所以擋在載入時。
 */
export const refine = (
  e: Extract<EffectDef, { kind: "spawnModelFx" }>,
  ctx: z.RefinementCtx,
): void => {
  refineDispelShape(e, ctx);

  const spread = e.path === "radial" || e.path === "orbit";
  if (spread && e.count === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["count"],
      message: `path:"${e.path}" 一定要有 count —— 缺了它整組等分退化成 1 具，而那看起來就跟 path:"forward" 一模一樣`,
    });
  }
  if (!spread && e.count !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["count"],
      message: '只有 path:"radial" / "orbit" 讀得到 count —— 直線路徑永遠只有一具模型',
    });
  }
  if (e.path === "orbit" && e.lifeSec === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lifeSec"],
      message: 'path:"orbit" 一定要有 lifeSec —— 繞圈沒有終點，缺了它這一具模型當場就消失',
    });
  }
  if (e.distance === undefined && e.path !== "toTarget") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["distance"],
      message: `path:"${e.path}" 一定要有 distance（orbit 時是環半徑）—— 缺了它模型走 0 格，技能放得出來但什麼都不會發生`,
    });
  }
  if (e.onTouch !== undefined && e.touchRadius === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["touchRadius"],
      message: "有 onTouch 就一定要有 touchRadius —— 半徑 0 的碰觸永遠碰不到任何人",
    });
  }
  for (const k of ["touchRadius", "touchSide", "touchOncePerTarget"] as const) {
    if (e.onTouch === undefined && e[k] !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [k],
        message: `沒有 onTouch 就沒有人讀 ${k} —— 這一格現在是一個看起來有設、其實沒有人讀的數字`,
      });
    }
  }
};
