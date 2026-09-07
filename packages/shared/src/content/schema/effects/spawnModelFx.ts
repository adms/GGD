import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import {
  MODEL_FX_MAX_DISTANCE,
  MODEL_FX_MAX_INSTANCES,
  MODEL_FX_MAX_CLIP_TIME_SCALE,
  MODEL_FX_MAX_LIFE_SEC,
  MODEL_FX_MAX_SCALE,
  MODEL_FX_MAX_SCALE_AXIS,
  MODEL_FX_MAX_SPEED,
  MODEL_FX_MAX_SPIN_DEG_PER_SEC,
  MODEL_FX_MAX_TOUCH_RADIUS,
  MODEL_FX_MIN_CLIP_TIME_SCALE,
  PULL_MAX_RADIUS,
} from "../../../sim/effects/kindLimits";
import { EFFECT_COMMON_SHAPE, refineDispelShape, zEffectDef } from "./_shared";
import { zRef } from "../common";
import type { ModelFxPathName } from "../../../sim/effects/variants/spawnModelFx";

/** 會隨 `path` 改變「有沒有人讀」的那幾格（其餘：scale／spin／clip／tint／音效／offsetForwardU 每條路徑都讀）。 */
export type ModelFxPathField =
  | "speed"
  | "distance"
  | "count"
  | "spacing"
  | "anchor"
  | "lifeSec"
  | "spreadDeg";

/**
 * ⭐⭐ GH#1057 —— 每一條 `path` **必填哪幾格、讀哪幾格**：refine（下面）與模板展開器
 * （`templates/expand.ts::modelFxFamily`）的**同一個住處**。
 *
 * ── 為什麼它是一張表，⛔ 不是散在 refine 裡的九個 `if` ────────────────────────
 * 2026-09-06 量到 **30 個** enum 分支「表單收得下、`zAbilityDoc` 載入拒收」：模板的
 * `path` 一格換成別的值，展開器照樣把 `count`／`spacing` 發給 `forward`、把
 * `speed`／`distance` 發給沒有那兩格的模板 —— 因為「哪一條路徑讀哪幾格」只住在
 * refine 的 `if` 鏈裡，展開器自己**猜**了第二份。⇒ 兩邊讀同一張表，猜的那一份消失。
 *
 * ── 每一列從哪裡量到（⛔ 不是設計偏好）──────────────────────────────────────
 * `reads` 逐字對 `sim/effects/modelFxPlacement.ts::modelFxInstancesFromFrame`：
 *   count → `spread`（radial/orbit/fan）與 static 的 `stN`；spacing → static 的 `stGap`；
 *   anchor → static 的 `at`；spreadDeg → fan 的 `fanDirections`；distance → `far`
 *   （orbit 是環半徑、toTarget 是上限）；speed → `sim/effects/spawnModelFx.ts` 的
 *   `speed`（static 恆 0）；lifeSec → 每一條路徑的壽命上限。
 * `requires` 逐字對這個檔的 refine：缺了它畫面上會**與另一種寫法一模一樣**的那幾格。
 *
 * ⚠️ 鍵集合由 `ModelFxPathName`（`sim/effects/variants/spawnModelFx.ts`，路徑型別的
 * 唯一住處）**逼滿**：少一列或多一列都是 TS 錯，⛔ 而 Zod enum 從這張表的鍵推導。
 */
export const MODEL_FX_PATH_FIELDS = {
  forward: { requires: ["speed", "distance"], reads: ["speed", "distance", "lifeSec"] },
  toTarget: { requires: ["speed"], reads: ["speed", "distance", "lifeSec"] },
  orbit: {
    requires: ["speed", "distance", "count", "lifeSec"],
    reads: ["speed", "distance", "count", "lifeSec"],
  },
  radial: {
    requires: ["speed", "distance", "count"],
    reads: ["speed", "distance", "count", "lifeSec"],
  },
  fan: {
    requires: ["speed", "distance", "count"],
    reads: ["speed", "distance", "count", "lifeSec", "spreadDeg"],
  },
  static: { requires: ["lifeSec"], reads: ["lifeSec", "count", "spacing", "anchor"] },
} as const satisfies Record<
  ModelFxPathName,
  { requires: readonly ModelFxPathField[]; reads: readonly ModelFxPathField[] }
>;

/** 路徑名的 tuple —— ⭐ 從上面那張表的鍵推導，⛔ 不再手抄一份給 `z.enum`。 */
export const MODEL_FX_PATHS = Object.keys(MODEL_FX_PATH_FIELDS) as [
  ModelFxPathName,
  ...ModelFxPathName[],
];

/**
 * ⭐⭐ GH#1080 —— `spawnModelFx.anchor` 值域的**唯一住處**（第〇·四守則，同 {@link MODEL_FX_PATHS}）。
 *
 * 在此之前它有三份手抄（這裡的 `z.enum([...])`、`sim/effects/variants/spawnModelFx.ts` 的
 * union、`sim/effects/modelFxPlacement.ts` 的 union），由 `spawnModelFxBone.test.ts` 用
 * **字串掃描**釘在一起（第二守則失敗形態⑥）。⇒ 現在 Zod enum 從這一份推導；
 * 兩個 sim 型別以 {@link ModelFxAnchor} 為準（型別相等由 `spawnModelFxBone.test.ts` 在 `tsc` 上逼）；
 * `templates/expand.ts::modelFxAnchorsFor` 讀 Zod 的 `options`（＝這一份）。
 *
 * 每一個值的語意住在下面 `anchor` 那一格的說明，⛔ 這裡不重複一份。
 */
export const MODEL_FX_ANCHORS = ["self", "point", "target", "bone"] as const;
export type ModelFxAnchor = (typeof MODEL_FX_ANCHORS)[number];

/** `path` 讀不讀這一格。⚠️ path 缺席時回 true（那份文件已經被「一定要有 path」擋住，⛔ 不疊報）。 */
export function modelFxPathReads(path: ModelFxPathName | undefined, f: ModelFxPathField): boolean {
  return path === undefined || (MODEL_FX_PATH_FIELDS[path].reads as readonly string[]).includes(f);
}

/** `path` 必不必填這一格。path 缺席時回 false（沒有路徑就沒有「必填」可言）。 */
export function modelFxPathRequires(
  path: ModelFxPathName | undefined,
  f: ModelFxPathField,
): boolean {
  return path !== undefined && (MODEL_FX_PATH_FIELDS[path].requires as readonly string[]).includes(f);
}

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
      .enum(MODEL_FX_PATHS)
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
      .enum(MODEL_FX_ANCHORS)
      .optional()
      .describe(
        'path:"static" 的錨點：self＝施法者腳下／point＝施放的地板點／target＝目標腳下（解不到就退化 point→self）／⭐ bone＝掛在某個模型的骨頭上（GH#761 AC②，要配 attach＋boneOn）。省略 = self。⛔ 只有 static 讀得到。',
      ),
    /**
     * ⭐⭐ GH#761 AC② —— **掛在骨頭上的模型**（原作的 `attachedModels`）。
     *
     * ── ⛔ 在此之前 ────────────────────────────────────────────────────────
     * `spawnModelFx` 表達得出「生幾具、多大、走什麼路徑」，
     * ⛔ **而表達不出「掛在誰的哪一根骨頭上」** —— `anchor` 只有腳下三選一。
     * ⇒ ⭐ 原作那一族「劍掛在手上、光環掛在胸口」的模型特效**寫不出來**，
     * ⛔ 而它只能靠 `attachment@1` 的**常駐**綁定去逼近（⇒ 它一直亮著）。
     *
     * ── ⭐ 詞彙**逐字照抄 `spawnVfx`**，⛔ 不發明第二套 ────────────────────
     * `at:"bone"` / `attach` / `boneOn` 那一組在 GH#809 就定案了。
     * ⛔ 兩套骨頭詞彙 ＝ 編輯器要問兩次「掛哪裡」，而它們遲早會分岔。
     */
    attach: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe(
        '骨頭掛點（WC3 attach 字串，如 chest / hand,right / weapon）。⛔ 只在 anchor:"bone" 時生效。',
      ),
    boneOn: z
      .enum(["caster", "victim"])
      .optional()
      .describe(
        '骨頭掛在誰身上：caster（預設）或 victim（這次解出來的第一個目標）。⛔ 只在 anchor:"bone" 時生效。⚠️ 與 spawnVfx 的同名欄位**同一個語意** —— GH#809 量到原作 316 次呼叫裡施法者 124 : 受擊者 124。',
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
      .describe(
        "radial／orbit 幾個實例等分；⭐ static 時＝沿開火方向**等距擺幾具**（#673-④，原作一次擺出整條線）。⛔ forward／toTarget 讀不到它。",
      ),
    /**
     * ⭐【沿線 N 具】`path:"static"` 的間距（#673-④／GH#688 Phase 4）。
     *
     * 原作的光束/火柱不是一具，是**一條線**：`A03S`（09-04 龜派氣功）的 h006 火柱
     * `loop i=1..6 × 200`、`A05J`（08-03）的 e003 `i=1..10 × 150` —— 每具之間隔一個
     * 固定步長。這一格就是那個步長（世界單位；200 wc3u ÷ 100 ＝ 2.0）。
     * 第 k 具在錨點沿開火方向的 spacing×k 處（第 0 具在錨點上）。
     */
    spacing: z
      .number()
      .positive()
      .max(MODEL_FX_MAX_DISTANCE)
      .optional()
      .describe(
        'path:"static" 且 count≥2 時，相鄰兩具的間距（世界單位）。⛔ 其他路徑讀不到它（radial/orbit 的距離住 distance）。',
      ),
    /**
     * ⭐⭐【弧上起點的間距】`path:"fan"` 時**相鄰兩具的起點**在弧上相隔幾度。
     *
     * ⚠️⚠️ ⭐ **它排的是「起點」，⛔ 不是「方向」** —— 三具的行進方向**全部平行**
     * 於施法者面向。逐行出處（2026-09-04 讀 war3map.j）：
     *   `j:44062` 中央 `PolarProjectionBJ(casterLoc, 160, facing)`
     *   `j:44068` 右側 `PolarProjectionBJ(casterLoc, 200, 45 + facing)`
     *   `j:44069` 左側 `PolarProjectionBJ(casterLoc, 200, −45 + facing)`
     *   `j:44070` `CreateNUnitsAtLoc(1,'h02F',…, point2, **GetUnitFacing(施法者)**)`
     * ⇒ ⭐ `±45` 是**生成點的方位角**，而三具的 facing 是**同一個**。
     * ⛔ 做成「方向扇」會得到朝三方散開的東西 —— 那是近似，⛔ 不是翻譯。
     *
     * ⚠️ 它是**相鄰兩具之間**，⛔ 不是總張角 ⇒ `count:3, spreadDeg:45`
     * 逐字翻成起點在 `facing−45 · facing · facing+45` 的弧上。
     * ⭐ 弧**半徑**用既有的 `offsetForwardU`（原作那兩個 160/200 就是它）。
     *
     * ⚠️ 總張角 `(count−1) × spreadDeg` 夾在 180°：⛔ 超過就**壓縮間距**，
     * ⛔ 不是丟掉幾臂（少一條龍是玩家看得見的，扇窄一點不是）。
     *
     * ⭐ 解析度是 **0.5°**（`sim/effects/fanRotation.ts` 的常數表）——
     * 刻意不是整度：`count:2, spreadDeg:45` 的兩臂要落在 **±22.5°**，
     * ⛔ 而整度表會湊成一個不對稱的扇。
     *
     * ⛔ 缺席 ⇒ 0 ⇒ N 具**全部重疊在面向上**（＝一個看起來只有一具的扇）。
     */
    spreadDeg: z
      .number()
      .min(0)
      .max(180)
      .optional()
      .describe(
        'path:"fan" 時相鄰兩具**起點**在弧上相隔幾度（0…180，解析度 0.5°）。⭐ 排的是起點，⛔ 不是方向 —— 三具行進方向全部平行於面向（原作 A09I：j:44068/44069 的 ±45 是生成點方位角，j:44070 的 facing 是同一個）。弧半徑用 offsetForwardU。⛔ 其他路徑讀不到它。',
      ),
    offsetForwardU: z
      .number()
      .min(-MODEL_FX_MAX_DISTANCE)
      .max(MODEL_FX_MAX_DISTANCE)
      .optional()
      .describe(
        "⭐【槍口偏移】沿**開火方向**把整組實例往前推幾個世界單位（JASS 的 " +
          "`PolarProjectionBJ(loc, d, facing)`；09-04 龜派的三個東西都在槍口 +150wc3u≈2.75u，" +
          "⛔ 不在腳下）。負值＝往後。缺席 ⇒ 0 ⇒ 逐位元同以前。",
      ),
    spinDegPerSec: z
      .number()
      .min(-MODEL_FX_MAX_SPIN_DEG_PER_SEC)
      .max(MODEL_FX_MAX_SPIN_DEG_PER_SEC)
      .optional()
      .describe("⭐「翻滾」：模型繞自己的軸轉，度／秒（負值 = 反向）。純視覺。"),
    /**
     * ⭐【播 .glb 自己的動畫剪輯】要播哪一條（GH#689）。
     * **缺席 ⇒ ⛔ 一條都不播 ＝ 今天的行為，逐位元不變。**
     *
     * ── 為什麼這一格存在 ──────────────────────────────────────────────────
     * `modelFxRig` 在 2026-08-25 之前**全檔 0 個 Animation** —— 這條通道唯一的
     * 動作是 `spinDegPerSec`（繞軸自轉）。而原作的 dummy 有一大半的視覺**住在
     * 剪輯裡**：火柱不播 `stand` 就沒有火焰翻騰、`FragDriller` 不播 `death`
     * 就沒有爆殼。census 量到 **14 個 `SetUnitAnimation` 呼叫點／12 具可見
     * dummy**，⇒ 那一半在 GGD 這一側從第一天起就不存在（失敗形態②：模型畫出
     * 來了、位置也對，只是它是一具定格的雕像）。
     *
     * ── ⭐ 名字怎麼解（⛔ 不開第二份對照表）─────────────────────────────────
     * 先當成 `model@1.clipMap` 的**邏輯狀態名**（`idle`/`run`/`attack`/`cast`/
     * `hurt`/`death`）查一次 —— 那張表已經是「這一份 .glb 把 X 叫做什麼」的
     * **唯一住處**（第〇·四守則），所以 `clip:"death"` 在 `flamestrike1`
     * 解成 `death`、在 `darkraor` 解成 `Death`，⛔ 技能不必知道大小寫。
     * 查不到才當成**軌名逐字**（WC3 的 `birth` 這種不在六格裡的一次性序列）。
     * 比對走「完全相同 → 字尾」兩段（實例化會把軌名前綴成
     * `modelfx-<serial>-<軌名>`），⛔ 名字對不上就一條都不播 —— 不猜一條給它
     * （與 `attachment@1.anim` 逐字同一條規矩）。
     */
    clip: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe(
        "要播這份 .glb 的哪一條動畫剪輯：先查 `model@1.clipMap` 的邏輯狀態名（idle／death…），查不到才當軌名逐字。留白 = 不播任何剪輯（今天的行為）。",
      ),
    /**
     * ⭐【凍播】剪輯的播放速率倍率（GH#689）。**缺席 ⇒ 1 ＝ 原速。**
     *
     * 原作是 `SetUnitTimeScalePercent`（百分比）—— 招牌用法是 h008 FragDriller
     * 的 **15%** ＋ 立即 `KillUnit`＝一顆慢動作展開的爆殼（悟空 Excalibur／
     * ExcaliburMAX／Turtle Power 三支的外層都是它）。⇒ 這裡是倍率：15% ⇒ `0.15`。
     *
     * ⚠️ ⛔ **沒有 clip 就沒有人讀它**（refine 在載入時擋）—— 一格看起來有設、
     * 其實沒有人讀的數字，正是這張 refine 表整篇在擋的形狀。
     */
    clipTimeScale: z
      .number()
      .min(MODEL_FX_MIN_CLIP_TIME_SCALE)
      .max(MODEL_FX_MAX_CLIP_TIME_SCALE)
      .optional()
      .describe(
        "剪輯的播放速率倍率（原作 SetUnitTimeScalePercent ÷ 100；h008 的凍播＝0.15）。省略 = 1 = 原速。⛔ 只有填了 clip 才讀得到。",
      ),
    scale: z.number().positive().max(MODEL_FX_MAX_SCALE).optional(),
    /**
     * ⭐【非等向縮放】沿三個**行進座標系**的軸再乘一次（GH#702）。
     * **缺席 ⇒ [1,1,1] ＝ 今天的行為，逐位元不變。**
     *
     * 三格逐字是 `[橫向, 上, 沿行進軸]` —— ⛔ ⛔ **不是模型自己的座標系**：
     * `modelFxRig` 把它乘在 `root` 上，而 `root` 底下的 `axis` 已經照
     * `model@1.fxLongAxis` 把模型的長軸轉到 `+Z`（＝行進軸）。所以第三格永遠是
     * 「這道光束多長」，⛔ 不會因為換一份 `.glb` 而改變意思。
     *
     * ── ⛔ 它**不是**從 JASS 量到的（誠實紀錄，GH#702）───────────────────────
     * WC3 的 `SetUnitScale(u,x,y,z)` 只讀第一個參數；而這一族在 `war3map.j` 裡
     * 三個參數**逐字相同**（j:31908 · j:32326 · j:32328 · j:47758）⇒ 原作等向。
     * ⭐ 它存在是因為一個**量到的缺口**：`convert_stock_model.py` 只轉 geoset，
     * 這一族的 `.mdx` 每一份都帶被 skip 掉的 `PRE2`（粒子）—— 原作那條又長又窄的
     * 光帶住在粒子裡。GGD 只拿到核心，`revivehuman.glb` 是 10.751 × 16.757 ×
     * 10.751（**1.56 : 1**）⇒ 等向放大它只會得到一顆愈來愈大的方塊。
     * ⇒ owner 2026-08-23「這四個經典總是要看到**橫放的光束砲**吧」在幾何這一側
     * 需要這一格才做得到。⭐ **一鍵 rollback ＝ 把節點上的 `scaleAxis` 拿掉。**
     */
    scaleAxis: z
      .tuple([
        z.number().positive().max(MODEL_FX_MAX_SCALE_AXIS),
        z.number().positive().max(MODEL_FX_MAX_SCALE_AXIS),
        z.number().positive().max(MODEL_FX_MAX_SCALE_AXIS),
      ])
      .optional()
      .describe(
        "非等向縮放，乘在 scale 之上：[橫向, 上, 沿行進軸]（第三格＝光束長度）。缺席 = [1,1,1] = 等向。",
      ),
    /**
     * ⭐【這一次施放的顏色】節點級頂點著色（線性 RGB 各 0…1）。缺席 ⇒ 用
     * `model@1.fxTint`；兩邊都缺 ⇒ ⛔ 不著色。
     *
     * ── 為什麼它與 `model@1.fxTint` **並存**而不是二選一（GH#693）───────────
     * 兩格回答的是**兩個不同的問題**，而原作也把它們存在兩個地方：
     * | | 原作 | GGD | 語意 |
     * |---|---|---|---|
     * | 模型級 | w3u `uclr/uclg/uclb`（**單位型別**的欄位） | `model@1.fxTint` | 「這一具 dummy 天生是紅的」 |
     * | 節點級 | `SetUnitVertexColor`（**runtime 呼叫**，57 個呼叫點） | 這一格 | 「這一次施放把它染成紅的」 |
     *
     * ⚠️ 在它之前只有模型級那一半，於是「同一份 glb 兩種顏色」只能**另開一份
     * `model@1` 文件**（`w3x.stock.revivehuman` vs `…-red`）。那對**恆定**異色是
     * 對的設計（顏色是模型的性質），⛔ 但對**模板**是錯的：一個 `tpl-locust-*`
     * 家族的 tint 是**逐支技能**填的參數（census 量到 133/236 非白，而且每一具
     * 都不同），⛔ 不是家族共有的值 —— 沒有這一格，模板就只剩「挑一份已經染好色
     * 的模型」，而那正是第〇·四守則說的第二個住處（每多一個顏色多一份文件）。
     *
     * ⭐ 節點贏過模型：`tint` 有值時**整格取代** `fxTint`（⛔ 不是相乘）——
     * 相乘會讓「把一具紅 dummy 染成藍」得到黑，而原作的 `SetUnitVertexColor`
     * 是覆寫語意。
     */
    tint: z
      .tuple([z.number().gte(0).lte(1), z.number().gte(0).lte(1), z.number().gte(0).lte(1)])
      .optional()
      .describe(
        "這一次施放的頂點著色（線性 RGB 各 0…1）。缺席 = 用 `model@1.fxTint`；兩邊都缺 = 不著色。",
      ),
    /**
     * ⭐【這一次施放的透明度】0…1（1＝不透明）。缺席 ⇒ 用 `model@1.fxAlpha`；
     * 兩邊都缺 ⇒ 1 ＝ 今天的行為。
     *
     * ⚠️ 原作的 alpha **只存在 runtime**（w3u `ucua` 全檔 0 次，57 個
     * `SetUnitVertexColorBJ` 呼叫點的第 4 參數）—— 所以「per-cast」才是它的原生
     * 住處，`model@1.fxAlpha` 那一格反而是為「恆定半透明的幻影族」補的近似。
     * 換算：`alpha = (100 − 透明度%) ÷ 100`。
     */
    alpha: z
      .number()
      .gte(0)
      .lte(1)
      .optional()
      .describe(
        "這一次施放的透明度（0…1，1=不透明）。缺席 = 用 `model@1.fxAlpha`；兩邊都缺 = 不透明。",
      ),
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
  // ⭐ GH#1057 —— 「這條路徑讀不讀／要不要這一格」一律問 `MODEL_FX_PATH_FIELDS`，
  //    ⛔ 這個函式裡不再有第二份 path 清單（展開器讀的是同一張表）。
  const reads = (f: ModelFxPathField) => modelFxPathReads(e.path, f);
  const requires = (f: ModelFxPathField) => modelFxPathRequires(e.path, f);
  if (e.preset === undefined) {
    for (const k of ["modelKey", "path", "speed"] as const) {
      // ⭐ `static` 不位移 ⇒ `speed` 在這個分支**不是**身分欄位（下面反過來禁填它）。
      if (k === "speed" && e.path !== undefined && !requires("speed")) continue;
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
  // ⭐ GH#916 —— `fan` 與 radial/orbit 同族：它們都是「一次生 N 具」，⛔ 差別只在方向怎麼來。
  //    （表上 radial/orbit/fan 三列的 `requires` 都有 count；⛔ 這裡不再寫 `||` 鏈 ——
  //    那條鏈會逐項收窄 46 成員的 union 而報 TS2367，GH#916 就是這樣踩到的。）
  if (requires("count") && e.count === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["count"],
      message: `path:"${e.path}" 一定要有 count —— 缺了它整組等分退化成 1 具，而那看起來就跟 path:"forward" 一模一樣`,
    });
  }
  // ⭐ #673-④：`static` 也讀 count（沿線 N 具）。⚠️ 帶 `preset` 的節點 path 可能
  //    要等模板才補上（例：只寫 `count` 覆寫模板預設）⇒ 這一條對它們不判。
  if (!fromPreset && e.count !== undefined && !reads("count")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["count"],
      message:
        '只有 path:"radial" / "orbit" / "fan" / "static" 讀得到 count —— forward/toTarget 永遠只有一具模型',
    });
  }
  // ⭐【沿線 N 具】spacing 只有 static+count≥2 讀得到；反過來 static 擺了 N 具卻
  //    沒有間距 ⇒ sim 會退化成 1 具（防第三條路），所以缺席在載入時就喊。
  if (!fromPreset && e.spacing !== undefined && (!reads("spacing") || (e.count ?? 1) < 2)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["spacing"],
      message:
        '只有 path:"static" 且 count≥2 讀得到 spacing —— 這一格現在是一個看起來有設、其實沒有人讀的數字',
    });
  }
  if (!fromPreset && e.path === "static" && (e.count ?? 1) >= 2 && e.spacing === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["spacing"],
      message:
        'path:"static" 擺 N 具一定要有 spacing —— 缺了它整條線退化成 1 具，而那看起來就跟沒寫 count 一模一樣',
    });
  }
  // ⭐ orbit（繞圈沒有終點）與 static（#649：沒有「走完」可言）的唯一終止條件都是
  //    `lifeSec` ⇒ 表上兩列的 `requires` 都有它。
  if (requires("lifeSec") && e.lifeSec === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lifeSec"],
      message: `path:"${e.path}" 一定要有 lifeSec —— ${
        e.path === "orbit" ? "繞圈沒有終點" : "定點模型沒有「走完」可言"
      }，缺了它這一具模型當場就消失`,
    });
  }
  // ⭐【定點 3D 模型】#649：`speed`／`distance` 在 static **沒有人讀** ⇒ 禁填（一格看
  //    起來有設、其實沒有人讀的數字，正是這張 refine 表整篇在擋的形狀）。
  for (const k of ["speed", "distance"] as const) {
    if (e[k] !== undefined && !reads(k)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [k],
        message: `path:"${e.path}" 沒有人讀 ${k} —— 定點模型不位移，這一格是一個看起來有設、其實沒有人讀的數字`,
      });
    }
  }
  // ⭐ GH#1057 —— `spreadDeg` 只有 fan 的 `fanDirections` 讀（表上唯一有它的一列）。
  //    ⚠️ 出貨內容 2026-09-06 量到 0 個非 fan 節點帶它 ⇒ 這一條加進來逐位元不改變任何
  //    已上線的文件；帶 `preset` 的節點 path 要等模板才補上 ⇒ 同其他條目 ⛔ 不判。
  if (!fromPreset && e.spreadDeg !== undefined && !reads("spreadDeg")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["spreadDeg"],
      message: '只有 path:"fan" 讀得到 spreadDeg —— 這一格現在是一個看起來有設、其實沒有人讀的數字',
    });
  }
  // ⭐【凍播】GH#689 —— `clipTimeScale` 是**剪輯的**速率，沒有剪輯就沒有人讀它。
  // ⚠️ 帶 `preset` 的節點 `clip` 可能要等模板才補上（只覆寫速率是合法的寫法）
  //    ⇒ 這一條對它們 ⛔ 不判（同這張表其他 `fromPreset` 的條目）。
  if (!fromPreset && e.clipTimeScale !== undefined && e.clip === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["clipTimeScale"],
      message:
        "沒有 clip 就沒有人讀 clipTimeScale —— 這一格現在是一個看起來有設、其實沒有人讀的數字（凍播要先指名一條剪輯）",
    });
  }
  // ⚠️ GH#698 —— 帶 `preset` 的節點 `path` 要等 `resolveModelFxPreset()` 才補上
  //    （`tpl-locust-strike` 的預設就是 `static`，而只覆寫落點是**最常見**的寫法：
  //    13 個 o00E 節點裡有 7 個只寫了 `anchor`）。⇒ 這一條對它們 ⛔ 不判，
  //    否則會把「模板會補」誤報成「作者填了一格沒有人讀的欄位」——
  //    與這張 refine 表其他 `fromPreset` 的條目逐字同一個理由。
  if (!fromPreset && e.anchor !== undefined && !reads("anchor")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["anchor"],
      message: '只有 path:"static" 讀得到 anchor —— 移動路徑的起點永遠是施法者',
    });
  }
  // ⭐⭐ GH#1063 —— `anchor:"bone"` ⇔ `attach` **成對出現**（逐字同 `spawnVfx` 的 GH#809）。
  //    在此之前 `anchor` 的說明寫著「要配 attach＋boneOn」，⛔ 而沒有任何一條 refine 擋：
  //    `tpl-beam-roll` 的表單開了 bone、展開出來沒有 attach、載入照過 ⇒ 掛在哪裡沒有人
  //    保證（第一·五守則：說了但不一定發生）。
  //    ⚠️ `attach`／`boneOn` ⛔ 不在 `modelFxPreset` 的任何一張欄位表上 ⇒ 帶 preset 的節點
  //    這兩格也只會是節點自己寫的 ⇒ 第一條**不看** fromPreset。反方向（attach 落單）在
  //    節點自己寫了非 bone 的 anchor 時一定是死的；anchor 缺席而有 preset ⇒ 模板可能會補
  //    ⇒ 同這張表其他條目 ⛔ 不判（出貨 2026-09-06 量到 0 個節點帶 bone/attach/boneOn）。
  if (e.anchor === "bone" && e.attach === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["attach"],
      message:
        'anchor:"bone" 一定要有 attach（骨頭掛點字串，如 chest / hand,right / weapon）—— 缺了它「掛在骨頭上」只是一句說明，畫面上掛在哪裡沒有人保證',
    });
  }
  const anchorSettled = e.anchor !== undefined || !fromPreset;
  for (const k of ["attach", "boneOn"] as const) {
    if (anchorSettled && e.anchor !== "bone" && e[k] !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [k],
        message: `${k} 只在 anchor:"bone" 時生效 —— 補 anchor:"bone" 或拿掉 ${k}（這一格現在是一個看起來有設、其實沒有人讀的欄位）`,
      });
    }
  }
  if (!fromPreset && e.distance === undefined && requires("distance")) {
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
