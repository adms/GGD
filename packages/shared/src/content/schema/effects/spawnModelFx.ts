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
      .enum(["forward", "toTarget", "orbit", "radial", "static"])
      .optional()
      .describe(
        "路徑：forward（沿面向直線）／toTarget（朝目標直線）／radial（count 個等分向外發散）／orbit（count 個在半徑 distance 的環上繞）／static（⭐ 定點擺一具播動畫，活 lifeSec，不位移）。有 `preset` 時可省略（從模板補）。",
      ),
    /**
     * ⭐【定點 3D 模型】`path:"static"` 的錨點（#649 類④）。
     *
     * 原作 266 具 dummy 有 **238 具站著不動**（89%）—— `CreateUnit` →
     * `AddSpecialEffect` → `UnitApplyTimedLife`，⛔ 一次 `SetUnitPosition`
     * 都沒有。它們分成兩族，正好是這一格的兩個值：
     * `hero-attached-aura`（87 具）→ `self`；`world-point`（151 具）→ `point`。
     * ⛔ 不新開 effect kind —— 那會讓「一具 3D 模型的演出」有兩個住處（第〇·五）。
     */
    anchor: z
      .enum(["self", "point", "target"])
      .optional()
      .describe(
        'path:"static" 的錨點：self＝施法者腳下／point＝施放的地板點／target＝目標腳下（解不到就退化 point→self）。省略 = self。⛔ 只有 static 讀得到。',
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
      .describe(
        "活多久。orbit／static 必填（那是它們唯一的終止條件）；與 distance 都給時取先到的那一個。",
      ),
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
    /**
     * ⭐ GH#605 —— 這一族的**聲音**（owner 2026-08-23：「也別忘了動地剁，
     * 跟相關的音效要播出來」）。
     *
     * ⚠️ 在它之前 `spawnModelFx` 的 payload 裡**一個聲音鍵都沒有**，所以三個新
     * 模板家族（三條黑龍／衝擊波／動地剁）＋ 四支橫放光束砲**整族**畫面有、
     * 完全無聲 —— 而 `performanceEventsHaveConsumers.test.ts` 是綠的，因為
     * `modelFxSpawn` **確實**有消費端（畫模型那一半）。「它應該也要發出聲音」
     * 從來不是任何斷言的反面（第一·五守則的形狀）。
     *
     * ⭐ **補一格解決整族**，⛔ 不是逐支接線（第〇·五守則）。
     *
     * 值是**音效表（`content/config/audio-map.json`）的 key**，⛔ 不是檔名，
     * 也⛔ 不是 zRef（audio map 是客戶端設定，不是內容集合 —— 與
     * `ability@1.sfxKey` 逐字同一個規矩）。播放走既有管線，所以總音量／SFX 開關／
     * SfxGate 的冷卻與同時發聲數／空間音場政策表／#568 的層數上限**全部自動適用**。
     */
    soundKey: z
      .string()
      .min(1)
      .optional()
      .describe(
        "施放那一刻播哪一個音效（**音效表 audio-map 的 key**，不是檔名）。留白 = 這個時機不出聲。",
      ),
    /**
     * ⭐ **落點**那一發（動地剁是落點有聲、飛行段沒有）。
     *
     * ⛔ **刻意沒有 `touchSoundKey`**，而這是一個決定不是遺漏：`onTouch` 是一串
     * 逐段取樣的班表（每具最多 `MODEL_FX_MAX_TOUCH_SAMPLES` 發 ×
     * 最多 {@link MODEL_FX_MAX_INSTANCES} 具），一支技能一次施放就會排出**幾百發**
     * ——那不是音效是音爆。而「打到人的那一聲」已經有住處：傷害事件走特效家族的
     * **特效命中**那一層（`audio/vfxSound.ts`）。
     */
    arriveSoundKey: z
      .string()
      .min(1)
      .optional()
      .describe(
        "模型抵達／壽命到的那一刻在**落點**播哪一個音效（audio-map 的 key）。一次施放**一發**，⛔ 不是每一具各一發。",
      ),
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
      // ⭐ `static` 不位移 ⇒ `speed` 在這個分支**不是**身分欄位（下面反過來禁填它）。
      if (k === "speed" && e.path === "static") continue;
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
  // ⭐【定點 3D 模型】#649：`static` 沒有「走完」可言 ⇒ `lifeSec` 是唯一的終止
  // 條件（必填）；`speed`／`distance` 在這個分支**沒有人讀** ⇒ 禁填（一格看起來
  // 有設、其實沒有人讀的數字，正是這張 refine 表整篇在擋的形狀）。
  if (e.path === "static") {
    if (e.lifeSec === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lifeSec"],
        message: 'path:"static" 一定要有 lifeSec —— 定點模型沒有「走完」可言，缺了它這一具當場就消失',
      });
    }
    for (const k of ["speed", "distance"] as const) {
      if (e[k] !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [k],
          message: `path:"static" 沒有人讀 ${k} —— 定點模型不位移，這一格是一個看起來有設、其實沒有人讀的數字`,
        });
      }
    }
  }
  if (e.anchor !== undefined && e.path !== "static") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["anchor"],
      message: '只有 path:"static" 讀得到 anchor —— 移動路徑的起點永遠是施法者',
    });
  }
  if (!fromPreset && e.distance === undefined && e.path !== "toTarget" && e.path !== "static") {
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
