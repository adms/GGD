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
import { zRef } from "../common";

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
    /**
     * ⭐【特效模板】—— 一份 `ability-templates` 文件的 id（出貨的那一份是
     * `tpl-beam-roll`「橫放光束砲」）。填了它，**這個節點沒填的每一格演出幾何**
     * （`modelKey` / `path` / `speed` / `distance` / `spinDegPerSec` / `scale` /
     * `touchRadius` / `touchSide`）在**載入時**從那份模板的 `params[*].default`
     * 補上（`content/modelFxPreset.ts`）。
     *
     * ⚠️ 這一格存在的理由是 CLAUDE.md 第〇·四守則：在它之前，「一道翻滾的橫躺
     * 光柱長什麼樣」只能**逐支手寫**十來格數字，而 2026-08-23 出貨樹上正好有
     * 五份幾乎一模一樣的節點（第零守則⑨的反面標記）。⇒ 值住共用表、文件只寫
     * 名字，⛔ 不烘進每一支技能。
     *
     * ⚠️ 它**只補演出幾何**，⛔ 不補傷害：模板有 `touchDamageTier`／`damageType`
     * 兩格，但把它們自動展開成 `onTouch` 等於替每一支引用它的技能加一份沒有人
     * 裁決過的傷害（第一守則：出貨數值的每一次改動要引用得到 owner 的一句原話）。
     * 要沿路掃傷害的技能自己寫 `onTouch`。
     */
    preset: zRef("ability-templates")
      .optional()
      .describe(
        "特效模板的文件 id（`content/ability-templates`）。沒填的演出幾何在載入時從它的 params 預設值補上。",
      ),
    modelKey: z
      .string()
      .min(1)
      .optional()
      .describe(
        "模型 id（`content/models`）。這是一具有骨架的模型，⛔ 不是粒子貼圖。有 `preset` 時可省略（從模板補）。",
      ),
    path: z
      .enum(["forward", "toTarget", "orbit", "radial"])
      .optional()
      .describe(
        "路徑：forward（沿面向直線）／toTarget（朝目標直線）／radial（count 個等分向外發散）／orbit（count 個在半徑 distance 的環上繞）。有 `preset` 時可省略（從模板補）。",
      ),
    speed: z
      .number()
      .positive()
      .max(MODEL_FX_MAX_SPEED)
      .optional()
      .describe("世界單位／秒。有 `preset` 時可省略（從模板補）。"),
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

  // ⭐【特效模板】—— 沒有 `preset` 的節點，三格身分欄位仍然是**必填**。
  //
  // ⚠️ 這一段是 `preset` 的代價，而且它必須在這裡付：三格在 Zod 上放寬成 optional
  // 是為了讓「只寫模板名」的稀疏文件過得了載入時的嚴格驗證，⛔ 但那不表示
  // 「什麼都不寫」可以過 —— 一個既沒有 preset 又沒有 modelKey 的節點會一路走到
  // sim，然後生出一具**沒有模型的模型特效**：技能放得出來、傷害照打、畫面上什麼
  // 都沒有（七種失敗形態②）。所以缺席在**編輯發生的當下**就喊。
  if (e.preset === undefined) {
    for (const k of ["modelKey", "path", "speed"] as const) {
      if (e[k] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [k],
          message: `沒有 preset 就一定要有 ${k} —— 這三格只有在引用特效模板（例：preset:"tpl-beam-roll"）時才可以省略，由模板的 params 預設值補上`,
        });
      }
    }
  }

  // ⚠️ 下面每一條跨欄位檢查都以**這個節點自己寫下的值**為準。帶 `preset` 的節點
  //    有一半的格子要等 `resolveModelFxPreset()` 才補上，所以那些條件在這裡
  //    ⛔ 不判 —— 判了會把「模板會補」誤報成「作者漏填」。
  const fromPreset = e.preset !== undefined;
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
  if (!fromPreset && e.distance === undefined && e.path !== "toTarget") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["distance"],
      message: `path:"${e.path}" 一定要有 distance（orbit 時是環半徑）—— 缺了它模型走 0 格，技能放得出來但什麼都不會發生`,
    });
  }
  if (!fromPreset && e.onTouch !== undefined && e.touchRadius === undefined) {
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
