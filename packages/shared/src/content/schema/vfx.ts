/**
 * vfx@1 — data-driven particle definition. Consumed by a shared
 * `toParticleSystem` Babylon factory (client + editor preview use the SAME
 * factory so preview == ship). Referenced by ability/projectile `vfxKey`
 * (SOFT ref: content may name vfx that aren't authored yet).
 *
 * Task #30 extends vfx@1 with the WC3 MDX particle-emitter feature set —
 * every new field is OPTIONAL so previously-authored docs stay valid:
 * gravity, multi-stop color/size gradients, modulate/alphaKey blends,
 * sprite-sheet flipbooks, stretched (tail) billboards, emit-power ranges,
 * named-bone anchoring and the ambient (lives-with-the-entity) flag.
 *
 * ribbon@1 — WC3 RIBB emitters: a swept trail strip behind a named bone.
 * Ribbon docs live in the SAME `vfx` collection; the collection schema
 * discriminates on the `schema` field (see `zVfxCollectionDoc`).
 */
import { z } from "zod";
import { zId } from "./common";

const zUnit = z.number().min(0).max(1);
/** [r, g, b, a] each 0..1 */
export const zRgba = z.tuple([zUnit, zUnit, zUnit, zUnit]);

export const zEmitter = z.discriminatedUnion("shape", [
  z.object({ shape: z.literal("point") }).strict(),
  z.object({ shape: z.literal("sphere"), radius: z.number().positive() }).strict(),
  z
    .object({
      shape: z.literal("cone"),
      radius: z.number().positive(),
      angleDeg: z.number().min(1).max(180),
    })
    .strict(),
  /**
   * RING —— **貼地向外擴散**的一圈 (#366 第二優先:`shockwaveRing`,273 引用 / 91 支)。
   *
   * ⛔ 這一格**不是**「衝擊波專用」,它是 `sphere` / `cone` 之外缺的第三種發射基底:
   * 粒子生在一個**水平圓**上、朝**水平徑向**射出。同一個形狀就是衝擊波、震地環、
   * 新星(nova)、腳下的塵環 —— 一個 shape 四個家族。
   *
   * ⚠️ 為什麼不能用 `orient` 把 `sphere` 轉成環(這是最容易犯的錯):
   * `sphere` 的出射方向分布是**各向同性**的,而 `orient` 是一個**旋轉** ——
   * 旋轉一個各向同性分布得到的是同一個分布。所以在球型發射器上填 `pitchDeg: 0`
   * 是一條**逐位元等於不存在**的宣稱(第一·五守則),而卡片上會寫著「貼地擴散」。
   * 唯一真的會變的是重力被轉成水平,那讓碎屑往旁邊飄 —— 比沒做還糟。
   */
  z
    .object({
      shape: z.literal("ring"),
      /** 環誕生時的半徑(世界單位)。擴散靠 `speed`,⛔ 不是靠改這個數字 */
      radius: z.number().positive(),
      /** 環的**厚度**(垂直方向)。省略 = 0.08 = 一層貼地的薄環 */
      thickness: z.number().min(0).max(4).optional(),
      /** 0 = 全部生在環緣(真的是一個環);1 = 填滿整個圓盤。省略 = 0 */
      fill: z.number().min(0).max(1).optional(),
      /** 出射方向的垂直抖動 0..1。0 = 完全貼地;省略 = 0.12 */
      spread: z.number().min(0).max(1).optional(),
    })
    .strict(),
]);

/**
 * WC3 filter modes → Babylon particle blend modes:
 * additive → BLENDMODE_ONEONE · alpha → BLENDMODE_STANDARD ·
 * modulate → BLENDMODE_MULTIPLY · alphaKey → BLENDMODE_STANDARD (the texture
 * carries hard 0/1 alpha).
 */
export const zVfxBlendMode = z.enum(["additive", "alpha", "modulate", "alphaKey"]);
export type VfxBlendMode = z.infer<typeof zVfxBlendMode>;

const zStopT = z.number().min(0).max(1);
/** [t 0..1, [r,g,b,a]] — gradient key over particle life */
export const zColorStop = z.tuple([zStopT, zRgba]);
/** [t 0..1, size>=0] — size key over particle life */
export const zSizeStop = z.tuple([zStopT, z.number().min(0)]);

/** WC3 rows×cols flipbook texture (requires `texture` on the doc). */
export const zSpriteSheet = z
  .object({
    rows: z.number().int().min(1),
    cols: z.number().int().min(1),
    /** seconds for one full cell cycle; absent = one cycle per particle life */
    cycleSec: z.number().positive().optional(),
    randomStartCell: z.boolean().optional(),
  })
  .strict();

/**
 * 方位 (#366) —— owner 的四個參數裡唯一一個引擎完全沒有的那個。
 *
 * 大小 → `applyArtParams.scale`、顏色 → `tint`、透明度 → `alpha` 三個都早就落地了；
 * **方位在 `artParams.ts` 只有一個 `facingDeg?: number` 的型別欄位、一個沒有任何
 * production 呼叫者的 `resolveSpatial()`,以及一條測試** —— 也就是七種故障的第 ②
 * 種:算出來了但從來沒有人消費。後果是具體的:`beam` / `bolt` / `dash` / `slash`
 * 這些**有方向的形狀,每一次施法都朝同一個方向噴**,跟誰打誰完全無關。
 *
 * 這一格把方位變成**發射器的一組基底**,而不是某支技能的一個 if:
 *
 * | 欄位 | 意思 | 預設 |
 * |---|---|---|
 * | `yawFrom` | 方位角**從哪裡來**:`world` = 這份文件自己寫的;`aim` = 每次施法算 | `world` |
 * | `yawDeg` | 方位角。`yawFrom:"world"` 時是世界方位角;`aim` 時是**疊在瞄準上的偏移** | 0 |
 * | `pitchDeg` | 仰角。**90 = 直立**(柱狀往上),**0 = 完全橫放** | 90 |
 * | `swirlDegPerSec` | 繞自身軸的**切線角速度**。龍捲風的「旋轉」就是這一格 | 0 |
 *
 * ⭐ 預設值 `yaw 0 / pitch 90 / swirl 0` 是**恆等變換** —— 沒有寫 `orient` 的
 * 633 份出貨文件走的是一位元不差的舊路徑(`orientIsIdentity()` 的快速路徑)。
 *
 * ⭐ 而「**橫放的柱狀砲**」(owner 點名的第二個優先項)在這個形狀下**不是新程式**,
 * 是 `column` 這支既有 primitive 加一格 `pitchDeg: 0`。這正是第〇·五守則要的
 * 兩層:引擎給機制,JSON 給技能。
 */
export const zVfxOrient = z
  .object({
    /**
     * 方位角**從哪裡來** (#377)。省略 = `"world"` = 升級前的行為。
     *
     * ⚠️ 這一格是 #366 落地時**刻意缺的那一半**,而缺它的後果具體到可以量:
     * `yawDeg` 是**世界座標**方位角,所以靜態填一個值的意思是「這一招永遠朝世界
     * 的那個方向噴,不管你瞄哪裡」—— beam(47 支)/ slash(41)/ bolt(11)/
     * dash(6)/ tornado(6)共 129 支有方向的技能因此**每一次施法都朝同一邊**。
     * 填一個靜態值不是把功能做完,是做出一個**會發生但發生錯方向**的效果。
     *
     * · `"world"` —— `yawDeg` 就是世界方位角(沒有寫 `orient` 的 633 份文件走這條)。
     * · `"aim"`   —— 每次施法用 **caster → 目標/落點**的方位角,`yawDeg` 變成
     *                **疊在它上面的偏移**(0 = 正對目標;180 = 朝身後噴的煙塵)。
     *
     * ⭐ 它是**引擎機制**不是某支技能的 if:同一格讓「橫放的柱狀砲」對準敵人、
     * 讓斬擊沿著揮砍方向掃、讓衝刺的塵尾往後拖 —— 三件事一個欄位。
     */
    yawFrom: z.enum(["world", "aim"]).optional(),
    /** 方位角,度。`yawFrom:"world"` = 世界方位角;`"aim"` = 疊在瞄準上的偏移。省略 = 0 */
    yawDeg: z.number().min(-360).max(360).optional(),
    /** 仰角,度。90 = 直立(現況), 0 = 橫放。省略 = 90 */
    pitchDeg: z.number().min(-180).max(180).optional(),
    /**
     * 繞自身軸的切線角速度,度/秒。省略 = 0(不旋轉)。
     * 上界 2880 = 每秒 8 圈;再快在 60fps 下一幀就轉過半圈,只會變成閃爍的雜訊。
     */
    swirlDegPerSec: z.number().min(-2880).max(2880).optional(),
  })
  .strict();
export type VfxOrient = z.infer<typeof zVfxOrient>;

const zVfxDocBase = z
  .object({
    id: zId,
    schema: z.literal("vfx@1"),
    emitter: zEmitter,
    mode: z.enum(["continuous", "burst"]),
    /** particles/sec (continuous mode) */
    rate: z.number().positive().optional(),
    /** particles per burst (burst mode) */
    burstCount: z.number().int().positive().optional(),
    lifetimeSec: z
      .object({ min: z.number().positive(), max: z.number().positive() })
      .strict(),
    /** particle size over life (2-stop legacy; `sizeStops` overrides) */
    size: z.object({ start: z.number().positive(), end: z.number().min(0) }).strict(),
    /** particle color over life (2-stop legacy; `colorStops` overrides) */
    color: z.object({ start: zRgba, end: zRgba }).strict(),
    blendMode: zVfxBlendMode,
    /** optional texture path relative to content/ (under assets/) */
    texture: z.string().regex(/^assets\//).optional(),
    // ---------------- WC3 extensions (task #30) — ALL optional ----------------
    /** world-units/s^2; negative = downward (WC3 gravity maps to -y) */
    gravityY: z.number().optional(),
    /** up to 4 stops sorted by t; overrides color.start/end when present */
    colorStops: z.array(zColorStop).min(1).max(4).optional(),
    /** up to 4 stops sorted by t; overrides size.start/end when present */
    sizeStops: z.array(zSizeStop).min(1).max(4).optional(),
    /** flipbook cell animation over the doc's texture */
    spriteSheet: zSpriteSheet.optional(),
    /** WC3 tail particles → BILLBOARDMODE_STRETCHED */
    stretched: z.boolean().optional(),
    /** stretch ratio for stretched billboards */
    tailLength: z.number().positive().optional(),
    /** emit power override (WC3 speed ± variation) */
    speed: z.object({ min: z.number().min(0), max: z.number().min(0) }).strict().optional(),
    /** named glb joint node to parent the emitter to */
    anchorBone: z.string().min(1).optional(),
    /** true = lives while the entity lives (ambient channel, not a one-shot) */
    ambient: z.boolean().optional(),
    /** 發射器的方位/旋轉基底 (#366)。省略 = 直立、不旋轉 = 升級前的行為 */
    orient: zVfxOrient.optional(),
  })
  .strict();

type VfxDocShape = z.infer<typeof zVfxDocBase>;

function stopsSorted(stops: readonly (readonly [number, unknown])[]): boolean {
  for (let i = 1; i < stops.length; i++) {
    if (stops[i]![0] <= stops[i - 1]![0]) return false;
  }
  return true;
}

/** Shared sanity refinements (applied by zVfxDoc AND the collection union). */
function vfxRefinements(doc: VfxDocShape, ctx: z.RefinementCtx): void {
  if (doc.mode === "continuous" && doc.rate === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rate"],
      message: 'rate is required when mode is "continuous"',
    });
  }
  if (doc.mode === "burst" && doc.burstCount === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["burstCount"],
      message: 'burstCount is required when mode is "burst"',
    });
  }
  if (doc.lifetimeSec.max < doc.lifetimeSec.min) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lifetimeSec", "max"],
      message: "lifetimeSec.max must be >= lifetimeSec.min",
    });
  }
  if (doc.colorStops && !stopsSorted(doc.colorStops)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["colorStops"],
      message: "colorStops must be sorted by t (strictly ascending)",
    });
  }
  if (doc.sizeStops && !stopsSorted(doc.sizeStops)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sizeStops"],
      message: "sizeStops must be sorted by t (strictly ascending)",
    });
  }
  if (doc.spriteSheet && doc.texture === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["spriteSheet"],
      message: "spriteSheet requires a texture",
    });
  }
  // ⛔ 方位掛在**球型**發射器上是一條逐位元等於不存在的宣稱(第一·五守則)。
  // 證明:`orient` 是一個旋轉 R,而球型發射器的出射方向分布是各向同性的 ——
  // 旋轉一個各向同性分布得到的是同一個分布。唯一還會動的是重力被 R 轉走,
  // 所以「有 swirl(切線速度,不是旋轉)」或「有重力可轉」時它仍然做得到事情。
  // 三者皆無 ⇒ 這份文件說了方位而畫面上什麼都不會變 ⇒ 擋在編輯的當下。
  // ⭐ 要一圈**貼地擴散**的環,用 `emitter.shape: "ring"`,⛔ 不是轉一顆球。
  if (
    doc.orient &&
    doc.emitter.shape === "sphere" &&
    !doc.orient.swirlDegPerSec &&
    !doc.gravityY
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["orient"],
      message:
        'orient on a "sphere" emitter with no swirl and no gravity is a NO-OP (an isotropic direction distribution is rotation-invariant) — use emitter.shape "ring" for a ground-spreading ring, or "cone" for a directed one',
    });
  }
  if (doc.speed && doc.speed.max < doc.speed.min) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["speed", "max"],
      message: "speed.max must be >= speed.min",
    });
  }
}

export const zVfxDoc = zVfxDocBase.superRefine(vfxRefinements);

export type VfxDoc = z.infer<typeof zVfxDoc>;

/**
 * ribbon@1 — WC3 RIBB emitter: a two-sided swept strip trailing a named glb
 * joint (`anchorBone`; falls back to the model root). Vertex alpha fades with
 * sample age; `uvScrollPerSec` scrolls the texture along the strip.
 */
export const zRibbonDoc = z
  .object({
    id: zId,
    schema: z.literal("ribbon@1"),
    /** optional texture path relative to content/ (under assets/) */
    texture: z.string().regex(/^assets\//).optional(),
    /** strip extent above the anchor path (world units) */
    widthAbove: z.number().min(0),
    /** strip extent below the anchor path (world units) */
    widthBelow: z.number().min(0),
    /** seconds a trail sample lives before fading out entirely */
    lifespanSec: z.number().positive(),
    color: zRgba,
    /** texture u-offset scroll speed (cycles/sec, signed) */
    uvScrollPerSec: z.number().optional(),
    blendMode: zVfxBlendMode,
    /** named glb joint node to trail behind */
    anchorBone: z.string().min(1).optional(),
  })
  .strict();

export type RibbonDoc = z.infer<typeof zRibbonDoc>;

/**
 * attachment@1 —— **穿在骨頭上的一個模型**（GH#392）。WC3 的 `Asph` 球體技能
 * （`Art - Target Attachment Point` + `atac`）在 GGD 這一邊的樣子。
 *
 * owner 2026-08-19：
 * > 「悟空超級賽亞人3還會**球體附著跟隨雙手上播放動畫** 看起來很威猛」
 *
 * 那句話裡有**三個不同的能力**，很容易只做到第一個就以為做完了：
 *
 * | | 能力 | 這份文件的哪一格 | GH#392 之前 |
 * |---|---|---|---|
 * | a | **附著到骨頭**（手／頭／武器／胸） | `points[]` | ✅ 三處都有（`W3xEmitterRig` / `AmbientVfx` / `ChampionView.setFormAttachment`） |
 * | b | **跟隨**（每幀跟著骨頭的世界矩陣） | `follow` | ✅ 有（掛上去就是 parent，parent 就是跟隨） |
 * | c | **掛件自己播動畫** | `anim` / `animLoop` | ⛔ **沒有** |
 *
 * ⚠️ (c) 的缺法是最安靜的一種：`ChampionView.setFormAttachment` 一直有把
 * `instantiateModelsToScene` 複製出來的 `animationGroups` 收進一個欄位 ——
 * **只為了 dispose 它們**，從來沒有人 `play()`。而出貨的三顆掛件
 * （`goku3head.glb` / `awing.glb` / `war3mapimported-poweraura.glb`）
 * 各有**一條**叫 `Stand` 的動畫軌，所以悟空的超三頭一直是**定格**的。
 * 沒有任何守衛會紅，因為每一個零件都是對的（第一·五守則的形狀）。
 *
 * ⛔ **這不是 #73 / #255 那件事。** 那兩張處理的是**烘進 glb 的幾何**；
 * 這一份是**執行期附著** —— 兩者的判準相反：一個共用 modelKey 的變身對
 * （悟空兩態都是 `imported.goku`）**只能**走執行期，烘進去基本型就會長出超三的頭。
 *
 * 綁定住在 `config.ambient-vfx@1.bindings`（既有的那張表，⛔ 不是第二張）：
 * 鍵可以是 **modelKey**（這具身體永遠戴著）或 **championId**（形態感知 ——
 * 悟空兩態共用 modelKey，所以只有 championId 分得出超三）。
 */
export const zAttachmentDoc = z
  .object({
    id: zId,
    schema: z.literal("attachment@1"),
    /** 這一格是怎麼來的（w3x 事實 or 美術決定），寫給下一個人看 */
    note: z.string().max(400).optional(),
    /** `models/` 的文件 id，例：`imported.goku3head`。硬參照（打錯 = 內容驗證紅） */
    modelKey: zId,
    /**
     * WC3 掛點字串，**逐字**（`"right,hand"` / `"chest"` / `"origin"`）。
     * ⚠️ `"right,hand"` 是**一個**掛點寫成兩個逗號 token，⛔ 不是兩個掛點 ——
     * 解析在 `apps/client/src/render/vfx/attachment.ts`（它從 337 份 glb 的普查
     * 推出六種命名慣例的正規化比對）。
     *
     * ⭐ 陣列 = WC3 的 `atac`：**每一格掛一份拷貝**。owner 說的「雙手」就是
     * `["left,hand", "right,hand"]` —— 兩份拷貝，⛔ 不是一支寫死的雙手程式。
     */
    points: z.array(z.string().min(1).max(32)).min(1).max(4),
    /**
     * `true`（省略 = true）= **每幀跟著那根骨頭走**（掛在關節底下）。
     * `false` = 生成當下取一次骨頭的**世界座標**就停在那裡（施法殘留在原地的殼）。
     *
     * ⚠️ 這一格存在是因為 (a) 與 (b) 是**兩件事**：只做 (a) 而沒有 (b)，
     * 球會卡在角色生成時手的位置，角色一走就留在原地 —— 而畫面上第一幀
     * 看起來完全正確。
     */
    follow: z.boolean().optional(),
    /**
     * 要播掛件自己的哪一條動畫軌（glb `AnimationGroup` 的名字，例 `"Stand"`）。
     * **省略 = 播它全部的動畫軌**（出貨的三顆掛件各只有一條 `Stand`，
     * 這也是 WC3 對一個附著模型做的事）。名字對不上 = 一條都不播（⛔ 不猜）。
     */
    anim: z.string().min(1).max(64).optional(),
    /** 動畫要不要循環。省略 = true（附著物的 `Stand` 是常駐的） */
    animLoop: z.boolean().optional(),
    /**
     * 掛件在**掛點的 local frame**（= 本體 glb 的原生座標系）裡的縮放。
     * 省略 = 1。⚠️ 兩份 glb 常常是用不同的轉檔倍率烘出來的，所以 1 未必是對的
     * ——悟空的超三頭是 0.3221 = 0.008946 / 0.027778。
     */
    scale: z.number().min(0.01).max(10).optional(),
    /** 沿 Y 的微調，單位是掛點 local frame。省略 = 0 = 用 mdx 自己烘的高度。 */
    offsetY: z.number().min(-5).max(5).optional(),
  })
  .strict();

export type AttachmentDoc = z.infer<typeof zAttachmentDoc>;

/**
 * The `vfx` collection accepts particle docs, ribbon docs AND worn-model
 * attachments (discriminated on `schema`). The union carries the same vfx@1
 * sanity refinements.
 */
export const zVfxCollectionDoc = z
  .discriminatedUnion("schema", [zVfxDocBase, zRibbonDoc, zAttachmentDoc])
  .superRefine((doc, ctx) => {
    if (doc.schema === "vfx@1") vfxRefinements(doc, ctx);
  });

export type AnyVfxDoc = z.infer<typeof zVfxCollectionDoc>;

// ---------------------------------------------------------------------------
// config.vfx-families@1 — the 21 w3x art families, live-tunable
// ---------------------------------------------------------------------------

/**
 * `content/config/vfx-families.json` — the console's knobs for the w3x art
 * family layer (`apps/client/src/render/vfx/w3xArtFamilies.ts`).
 *
 * WHY IT IS CONFIG AND NOT CONSTANTS (第一守則). 33 Blizzard stock models
 * collapse into 21 parameterised prototypes, and every one of them is a
 * judgement call the owner has the right to overturn without a rebuild: how big
 * a WC3 `usca` of 5.0 should read on a much closer camera, whether 消散 should
 * be violet or grey, whether the whole evidence layer should be switched off
 * and every ability fall back to the name-classified `fx.prim.*` baseline.
 * Every one of those is a field here.
 *
 * SHAPE, and what each part overrides:
 *   · top level      — master switch + the WC3→doc scale compression
 *   · `families`     — per-family prototype defaults (shape/colour/size/α/time/height)
 *   · `abilities`    — per-CALL-SITE overrides, keyed by GGD ability doc id.
 *                      This is where 「同一顆 WarStompCaster，這一支放大、那一支
 *                      轉紅」 lives, and it is what the map's own numbers are
 *                      loaded into by `w3xFamilyArt.ts`.
 *
 * EVERY numeric field is bounded on BOTH sides. `validateField` in the console
 * only checked `min` until 2026-07-29, so an un-capped field lets 50 be typed
 * as 500, pass the form, and be silently clamped (or rejected) downstream —
 * the #277/#279 shape. A tint is 0..255 per channel because that is the unit
 * `war3map.w3u` stores (`uclr/uclg/uclb`); the renderer divides by 255.
 *
 * ABSENT ≠ ZERO. An omitted per-ability field means "the map did not state
 * one, use the family default" — never "0". The console must write `undefined`
 * (drop the key), not a zero, when the operator clears a box.
 */
// ---------------------------------------------------------------------------
// 一次性特效的粒子壽命上限 —— 出貨預設 + 上下界
// ---------------------------------------------------------------------------

/**
 * 出貨的一次性(one-shot)粒子壽命天花板,秒。**後台可調**
 * (`config.vfx-families@1.oneShotMaxLifeSec`)。
 *
 * 這條夾子存在的理由沒有變:匯入的 228 份 WC3 文件壽命跑 1–6 秒,直接照播會讓
 * 每一次施法在畫面上留一團化不開的霧。0.6 是出貨值,所以「不設這一格」= 升級
 * 前一位元不差。
 *
 * 它變成欄位的理由是 owner 要的時間軸:「先蓄力光柱 → 再爆炸 → 再留一圈餘燼」。
 * 餘燼那一層需要活得比 0.6 秒久,而在這之前**沒有任何後台旋鈕碰得到它** ——
 * 層寫 `timeScale: 4` 拿到的仍然是 0.6 秒(往下變短完全生效,往上飽和)。
 */
export const DEFAULT_ONE_SHOT_MAX_LIFE_SEC = 0.6;

/**
 * 下界。手機出貨是 30 fps(#274),0.1 秒 = **3 張畫面** —— 再低於這條線,一次
 * 命中在手機上就等於沒有畫過,而操作者只會看到「特效不見了」。
 */
export const MIN_ONE_SHOT_MAX_LIFE_SEC = 0.1;

/**
 * 上界 = 3 秒,也就是「畫面開始變成霧」的那條線。**這是算出來的,不是挑的**,
 * 而且它上面每一個輸入都是這個 repo 裡真的存在的常數:
 *
 *   一次施法最多的粒子 = `DEFAULT_MAX_ABILITY_VFX_LAYERS`(5 層)
 *                        × `MAX_FRONT_LOAD_BURST`(80 顆/層) = 400 顆
 *   同時在打的施法     = 12 位英雄 ÷ 每 2 秒放一招 = 6 次/秒 ← **這一項是估計值**
 *   同時活著的粒子     = 400 × 6 × L
 *   `SCREEN_PARTICLE_BUDGET` = 8,000 → L ≤ 8000 / 2400 = 3.33 秒
 *
 * 取 3.0(留一成餘裕)。也就是說:把這一格開到頂,一場 12 人的混戰會把整個畫面
 * 的粒子預算吃掉約九成 —— 那正是「霧」的定義,而不是一個抽象的安全值。
 * 「每 2 秒一招」是估計的節奏,其餘三個數字都是常數;
 * `apps/client/src/vfx/oneShotLife.test.ts` 拿真的常數把這個推導釘住,誰動了
 * 畫面預算而沒有回來重算,那條會紅。
 */
export const MAX_ONE_SHOT_MAX_LIFE_SEC = 3;

/**
 * 後台的值 → 真正生效的天花板。`undefined`(沒設過)= 出貨預設,**不是 0**。
 * 界外的值夾回範圍內:一份手改壞的 durable overlay 不可以讓粒子壽命變成 0
 * (= 什麼都看不見)或 60 秒(= 整場都是霧)。
 */
export function clampOneShotMaxLifeSec(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return DEFAULT_ONE_SHOT_MAX_LIFE_SEC;
  return Math.min(MAX_ONE_SHOT_MAX_LIFE_SEC, Math.max(MIN_ONE_SHOT_MAX_LIFE_SEC, v));
}

// ---------------------------------------------------------------------------
// 施法特效播在離地多高 —— owner #251「衝擊波特效沒有真實套用」
// ---------------------------------------------------------------------------

/**
 * 施法高度從哪裡來。**這是一個決策點,所以它是一個欄位**(第一守則)。
 *
 * 量到的事實(2026-08-01,跑真的 `VfxSystem.handleEvent` + 從 Babylon 讀回
 * emitter 世界座標,不是讀註解):91 支 `shockwaveRing` 技能一共畫出 105 個
 * `ParticleSystem`,emitter Y 的直方圖是**單獨一格 `{1.0: 105}`**,而
 * `content/config/vfx-families.json` 對這個家族寫的是 `heightY: 0.15`
 * ——「貼地的環」被畫在胸口高度。整張家族表 258 列裡有 216 列的設定高度不是 1.0。
 *
 * 也就是說:後台那一格「家族基準高度」算得出來、存得進去、**從來沒有送到播放端**
 * (第②號故障)。`apps/admin/src/vfxForge.ts` 的 `DEAD_FAMILY_KNOBS` 白紙黑字
 * 列著它。
 *
 * 三個值,不是兩個,因為「接上去」其實混了兩件事:
 *   · `"flat"`   — 升級前的行為:每一支技能都播在 `SHIPPED_CAST_HEIGHT_Y`。
 *                  這是**回退鍵**:接上去之後畫面不對,後台改一格就回得去,
 *                  不用重出 client 映像。
 *   · `"ground"` — 出貨值。**只讓想往下的家族往下**(設定高度低於平面高度時
 *                  才採用),想往上的維持平面。衝擊波環 0.15、地面塵土 0.1、
 *                  火柱/復活光/光柱 0.1、龍捲 0.4 因此貼回地板,而雷擊(3.2)、
 *                  流星(3.5)、印記這些**往上**的不動。
 *                  選它當預設的理由:owner 點名的是衝擊波,而往下這一半
 *                  **在構圖上不可能出事** —— 特效只會更靠近地板,不會飛出畫面
 *                  上緣;往上那一半是 owner 還沒看過的視覺變更。
 *   · `"family"` — 每一個家族都用自己的高度,包含往上的那些。
 */
export const CAST_HEIGHT_SOURCES = ["flat", "ground", "family"] as const;
export type CastHeightSource = (typeof CAST_HEIGHT_SOURCES)[number];

/** 出貨值 —— 見上面 `"ground"` 那一段為什麼是它而不是 `"flat"` / `"family"`。 */
export const DEFAULT_CAST_HEIGHT_SOURCE: CastHeightSource = "ground";

/** 後台的值 → 真正生效的模式。沒設過 / 不認得 = 出貨值,**不是關掉**。 */
export function resolveCastHeightSource(v: string | undefined): CastHeightSource {
  return (CAST_HEIGHT_SOURCES as readonly string[]).includes(v ?? "")
    ? (v as CastHeightSource)
    : DEFAULT_CAST_HEIGHT_SOURCE;
}

// ---------------------------------------------------------------------------
// 飛行中的投射物 —— owner #251「投射物特效沒有真實套用」
// ---------------------------------------------------------------------------

/**
 * 飛行彈道要不要真的套用那份 vfx 文件。
 *
 * 量到的事實(2026-08-01,對真的 `ProjectileView` 餵兩份文件再從 Babylon 讀回
 * `ParticleSystem`):把文件的 `count` 40→200、`size` →9、`lifetime` →3–4 秒、
 * `speed` →40–60、`blend` →alpha、`gravityY` →99 **全部改掉**之後,
 * capacity / emitRate / min|maxLifeTime / min|maxEmitPower / blendMode /
 * gravity / sizeStops **一格都沒有動** —— 那些數字全部是 `ProjectileView` 裡的
 * 常數。文件唯一到得了畫面的是**顏色與貼圖**。
 *
 * 這一格就是那個開關。`false` = 升級前的固定彗星(回退鍵)。
 */
export const DEFAULT_PROJECTILE_ART_FROM_DOC = true;

/**
 * 彈道的體積要跟著它自己的 `hitRadius` 多少。
 *
 * 出貨的 18 份 `projectile@1` 文件裡 `hitRadius` 有三檔:平砍 0.4、單發彈 0.5、
 * **貫穿波 0.9**;而畫面上三種一樣大。這一格把「打得到多寬」變成看得見的東西
 * (和 #136「顯示值 == 實際值」同一條原則)。
 *
 * 0 = 全部一樣大(升級前的畫面);1 = 完全跟著半徑走。
 * 公式:`1 + (hitRadius / 0.5 - 1) × gain`,再夾到 [0.5, 2.5]。
 */
export const DEFAULT_PROJECTILE_RADIUS_GAIN = 1;
export const MIN_PROJECTILE_RADIUS_GAIN = 0;
/**
 * 上界 3。**擋的是「內容側把 `hitRadius` 寫大」被畫面放大三次**:一支
 * `hitRadius: 2` 的技能在 gain 3 之下會拿到 1+(4−1)×3 = 10 倍,整顆彈道比英雄
 * 還高。3 是「還看得出是一顆飛行物」的上緣;真的要更誇張請改文件的 `size`,
 * 那條路有自己的上下界。
 */
export const MAX_PROJECTILE_RADIUS_GAIN = 3;

/** gain 1 對應「不放大也不縮小」的那個半徑 —— 出貨 18 份文件裡的眾數。 */
export const PROJECTILE_REFERENCE_HIT_RADIUS = 0.5;
/** 算出來的體積倍率夾在這區間:再小看不見,再大擋住畫面。 */
export const MIN_PROJECTILE_SIZE_MULT = 0.5;
export const MAX_PROJECTILE_SIZE_MULT = 2.5;

/**
 * 彈道飛在離地多高(世界單位)。1.0 ≈ 胸口 —— 和施法高度一樣,這個數字以前是
 * `ProjectileView` 裡一個沒有人挑過的 `FLY_HEIGHT = 1.0`。
 *
 * 下界 0.2:再低就埋進地板(第①號故障)。
 * 上界 4:一位 ~1.7 單位高的英雄頭頂再上去兩個身高 —— 再高就飛出構圖,
 * 玩家看不到子彈從哪來。
 */
export const DEFAULT_PROJECTILE_FLY_HEIGHT_Y = 1;
export const MIN_PROJECTILE_FLY_HEIGHT_Y = 0.2;
export const MAX_PROJECTILE_FLY_HEIGHT_Y = 4;

function clampTo(v: number | undefined, lo: number, hi: number, fallback: number): number {
  if (v === undefined || !Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, v));
}

/** 後台的值 → 生效值。界外夾回範圍內(一份手改壞的 overlay 不能讓彈道消失)。 */
export function clampProjectileRadiusGain(v: number | undefined): number {
  return clampTo(v, MIN_PROJECTILE_RADIUS_GAIN, MAX_PROJECTILE_RADIUS_GAIN, DEFAULT_PROJECTILE_RADIUS_GAIN);
}
export function clampProjectileFlyHeightY(v: number | undefined): number {
  return clampTo(
    v,
    MIN_PROJECTILE_FLY_HEIGHT_Y,
    MAX_PROJECTILE_FLY_HEIGHT_Y,
    DEFAULT_PROJECTILE_FLY_HEIGHT_Y,
  );
}

// ---------------------------------------------------------------------------
// 有方向的形狀的**家族仰角預設** (GH#379) —— 126 支「解鎖了但不會轉」的那一格
// ---------------------------------------------------------------------------

/**
 * ⭐ **直立 = 恆等**。`orient` 的角度約定裡 `pitchDeg: 90` 是「軸朝 +Y」,
 * 而繞 +Y 轉一個朝 +Y 的軸得到的還是它自己 —— 所以**對直立的發射器,yaw 是恆等
 * 變換**。GH#377 把 `yawFrom: "aim"` 接上去之後 129 支有方向的技能理論上都能瞄準,
 * 而真的會轉的只有 3 支,原因就是這一行:其餘 126 支的 `pitchDeg` 還是 90。
 */
export const UPRIGHT_PITCH_DEG = 90;

/**
 * 引擎裡**有方向**的五個 primitive 形狀。⛔ 不是「全部 13 個」——
 * `nova`/`explosion`/`shockwave`/`pulse`/`swarm`/`summon` 是各向同性或貼地的,
 * 轉它們不會有任何視覺差別(球型發射器的方向分布旋轉不變,見 `zEmitter.ring`
 * 那一段),`column`/`fall` 的「往哪邊長」是靠重力而不是瞄準。
 */
export const DIRECTIONAL_PRIMITIVES = ["beam", "slash", "bolt", "dash", "tornado"] as const;
export type DirectionalPrimitive = (typeof DIRECTIONAL_PRIMITIVES)[number];

/**
 * 每個有方向的家族**躺成什麼角度**(度)。90 = 直立、0 = 完全橫放。
 *
 * ⚠️ 這五個數字**不是品味**,是從各自 primitive 的錐角 + 施法高度推出來的
 * (`apps/client/src/render/vfx/primitives.ts` 是那些錐角的出處,施法高度是
 * `SHIPPED_CAST_HEIGHT_Y = 1.0` ≈ 胸口):
 *
 * | 家族 | 錐角 | 出貨仰角 | 為什麼 |
 * |---|---:|---:|---|
 * | `beam`    |  9° | **0** | 一道朝目標射出的光束/砲擊。半錐角 4.5°,從胸口打出去要 ~12 單位才觸地 —— 比粒子活得到的距離遠得多 |
 * | `bolt`    |  6° | **0** | 一顆飛出去的彈丸,同上,更窄 |
 * | `dash`    | 22° | **0** | 位移的殘影沿著移動線拖,本來就是水平的 |
 * | `slash`   | 92° | **30** | 斬擊是一道**寬**的新月。半錐角 46°,填 0 的話下緣朝下 46°,從胸口出去約 1 單位就插進地板,而粒子中位飛行距離約 1.8 單位 ⇒ **半個刀光被地板吃掉**。抬到 30° 讓下緣落在 −16°(觸地約 3.5 單位,超出壽命),整道新月留在畫面上 |
 * | `tornado` | 34° | **90** | 龍捲風本來就直立,而且它的 `gravityY` 是 **+4.2**(柱子往上長)—— 放倒它等於把「往上長」轉成「往旁邊飄」 |
 *
 * ⭐ **`yawFrom: "aim"` 不是第二格欄位,是從這一格推出來的**:仰角 ≠ 90 ⇒ 瞄準;
 * = 90 ⇒ 不瞄準(因為那是恆等變換)。兩格獨立的話就可以組出
 * 「宣告了瞄準但畫面上永遠不動」的空宣稱(第一·五守則),而**推導出來的東西
 * 沒有那個狀態可以進入**。
 */
export const DEFAULT_FAMILY_PITCH_DEG: Readonly<Record<DirectionalPrimitive, number>> = {
  beam: 0,
  slash: 30,
  bolt: 0,
  dash: 0,
  tornado: UPRIGHT_PITCH_DEG,
};

/**
 * 家族仰角預設的**總開關**,出貨 `true`(第〇·六守則:優先權大的更新預設啟動)。
 *
 * `false` = 每一個有方向的家族都回到 `pitchDeg: 90` = **GH#366/#377 落地之前的
 * 行為**(每次施法都朝同一邊噴)。它存在是為了一鍵 rollback,⛔ 不是為了觀望。
 */
export const DEFAULT_FAMILY_PITCH_DEFAULTS_ENABLED = true;

/** 一個家族的生效仰角:後台的值(界外夾回)→ 出貨預設。 */
export function familyPitchDeg(
  family: DirectionalPrimitive,
  override: number | undefined,
): number {
  return clampTo(override, -180, 180, DEFAULT_FAMILY_PITCH_DEG[family]);
}

/**
 * `hitRadius` → 畫面上的體積倍率。純函式,沒有 Babylon,所以模擬器/後台/測試
 * 三邊看到的是同一條公式。
 */
export function projectileSizeMultiplier(hitRadius: number | undefined, gain: number): number {
  const r = hitRadius !== undefined && Number.isFinite(hitRadius) && hitRadius > 0
    ? hitRadius
    : PROJECTILE_REFERENCE_HIT_RADIUS;
  const raw = 1 + (r / PROJECTILE_REFERENCE_HIT_RADIUS - 1) * clampProjectileRadiusGain(gain);
  return Math.min(MAX_PROJECTILE_SIZE_MULT, Math.max(MIN_PROJECTILE_SIZE_MULT, raw));
}

export const zW3xFamilyId = z.enum([
  "shockwaveRing",
  "blink",
  "burst",
  "dissipate",
  "missile",
  "boltStrike",
  "tornado",
  "groundDust",
  "flamePillar",
  "mirrorImage",
  "resurrect",
  "mark",
  "lightColumn",
  "portal",
  "breath",
  "levelUp",
  "cloud",
  "shine",
  "blood",
  "starfall",
  "uncategorised",
]);
export type W3xFamilyId = z.infer<typeof zW3xFamilyId>;

/** The 13 silhouettes `render/vfx/primitives.ts` ships. */
export const zVfxPrimitiveKind = z.enum([
  "nova",
  "explosion",
  "shockwave",
  "tornado",
  "beam",
  "bolt",
  "dash",
  "swarm",
  "summon",
  "slash",
  "pulse",
  "column",
  "fall",
]);

/** The 13 colours `render/vfx/elements.ts` ships. */
export const zVfxElement = z.enum([
  "fire",
  "ice",
  "lightning",
  "wind",
  "earth",
  "holy",
  "void",
  "physical",
  "nature",
  "arcane",
  "blood",
  "ki",
  "sound",
]);

/** WC3 vertex colour, 0..255 per channel (`uclr`/`uclg`/`uclb` units). */
export const zW3xTint255 = z.tuple([
  z.number().int().min(0).max(255),
  z.number().int().min(0).max(255),
  z.number().int().min(0).max(255),
]);

/* ──────────────────────────────────────────────────────────────────────────
 * 特效自帶的音效（GH#390）
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * WC3 把特效與音效綁在一起：mdx 的事件軌（`SNDx`）在**四個時機**上掛音 ——
 * 發射 · 命中 · 循環 · 消散。這四個名字就是那四條軌，⛔ 不是我們發明的分類。
 *
 * ⚠️ ⛔ 不要跟 `zVfxElement` 裡的 `"sound"` 搞混 —— **那是元素名**（音波系技能
 * 的顏色，跟 lightning / wind / holy 並列），不是音訊欄位。GH#390 的檔頭專門
 * 記了這個誤讀，因為 `fx.prim.sound.nova` 這種檔名長得像「已經有了」。
 */
export const VFX_SOUND_CUES = ["launch", "impact", "loop", "dissipate"] as const;
export type VfxSoundCue = (typeof VFX_SOUND_CUES)[number];

/** 四個時機 → 它在 family / ability 兩張表上的欄位名。 */
export const VFX_SOUND_CUE_FIELD: Readonly<Record<VfxSoundCue, string>> = {
  launch: "soundLaunch",
  impact: "soundImpact",
  loop: "soundLoop",
  dissipate: "soundDissipate",
};

/**
 * 一格音效填的是 **`config.audio-map@1.sfx` 的 key**（例：`wc3.axemissilelaunch1`、
 * `impact`、`chime_burst`），⛔ 不是檔名也不是 URL。
 *
 * ⭐ 這是刻意的，而且是這一條**唯一**沒有繞過玩家設定的寫法：音量 / 冷卻 /
 * 同時發聲數全部住在 audio-map 那一份，播放走 `AudioSystem.playSfx` ⇒ 總音量、
 * SFX 開關（#14）與空間化（#253）自動全部適用。⛔ 開一條新的載入路徑就會繞過它們。
 */
export const zVfxSoundKey = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "必須是 audio-map 的 sfx key（英數 . _ -）");

/**
 * 四個時機的欄位，**定義一次、用在兩個地方**（第零守則⑨：K 個模板 + 一張表）：
 * `families[]` 是 21 個原型的預設，`abilities[]` 是 258 支的逐支覆寫。
 *
 * 全部 optional，理由與這份 doc 上其餘的 optional 欄位一模一樣：已經存過的
 * durable overlay 沒有這些 key，設成必填會讓那些 overlay 整份 `safeParse` 失敗
 * → `extractFamiliesDoc` 回 null → **整個家族層一起消失**（不只是音效）。
 */
const vfxSoundCueShape = {
  /** 發射／施放的那一刻（WC3 的 `…Launch`／`…Caster` 那一族） */
  soundLaunch: zVfxSoundKey.optional(),
  /** 命中／落地的那一刻（`…Hit`／`…Target` 那一族） */
  soundImpact: zVfxSoundKey.optional(),
  /** 持續期間每 `soundLoopMs` 重播一次的循環音（`…Loop`／`…Birth` 那一族） */
  soundLoop: zVfxSoundKey.optional(),
  /** 效果結束／消散的那一刻（`…Death`／`…Dissipate` 那一族） */
  soundDissipate: zVfxSoundKey.optional(),
} as const;

/** 循環音兩次之間的間隔（毫秒）。 */
export const DEFAULT_VFX_SOUND_LOOP_MS = 900;
export const MIN_VFX_SOUND_LOOP_MS = 200;
export const MAX_VFX_SOUND_LOOP_MS = 20000;

/**
 * 一發循環音最長活多久（毫秒）—— **回收的硬上界**。
 *
 * ⚠️ #259 的教訓：不回收的循環 = 越打越鈍，而且回合切換後還會有殘留聲音。
 * 所以循環不是「播到有人叫停」，它有一個從開始那一刻就算好的絕對到期時間。
 */
export const DEFAULT_VFX_SOUND_LOOP_MAX_MS = 8000;

/** 音量倍率：疊在 audio-map 那一格 `gain` 上面，1 = 不動。 */
export const DEFAULT_VFX_SOUND_GAIN = 1;
export const MIN_VFX_SOUND_GAIN = 0;
export const MAX_VFX_SOUND_GAIN = 2;

/**
 * 音訊層的總開關。**預設 on**（第〇·六守則：優先權大的更新後都是預設啟動；
 * 開關存在是為了回頭，不是為了觀望）。
 */
export const DEFAULT_VFX_SOUND_ENABLED = true;

export const zVfxFamilyTuning = z
  .object({
    /** false = this family stops overriding; its abilities keep `fx.prim.*` */
    enabled: z.boolean(),
    /** the silhouette this family renders as */
    primitive: zVfxPrimitiveKind,
    /** the colour used when the ability has neither an element nor a w3x tint */
    element: zVfxElement,
    /** family base size multiplier (1 = the primitive's own size) */
    scale: z.number().min(0.1).max(6),
    /** family base opacity */
    alpha: z.number().min(0.05).max(1),
    /** >1 = longer/slower, <1 = snappier */
    timeScale: z.number().min(0.2).max(4),
    /** world-y the effect plays at (0.1 = on the floor, 3.5 = overhead) */
    heightY: z.number().min(0).max(8),
    // ── 特效自帶的音效（GH#390）——— 這個原型的四個時機各自播哪一個 sfx key ──
    ...vfxSoundCueShape,
    /** 這個家族的音量倍率，疊在 audio-map 的 `gain` 上面（1 = 不動） */
    soundGain: z.number().min(0).max(2).optional(),
    /** 循環音兩次之間隔多久，毫秒（省略 = `DEFAULT_VFX_SOUND_LOOP_MS`） */
    soundLoopMs: z.number().int().min(200).max(20000).optional(),
    /** 循環音最長活多久，毫秒 —— 回收的硬上界（省略 = `DEFAULT_VFX_SOUND_LOOP_MAX_MS`） */
    soundLoopMaxMs: z.number().int().min(200).max(60000).optional(),
  })
  .strict();
export type VfxFamilyTuning = z.infer<typeof zVfxFamilyTuning>;

export const zVfxAbilityFamilyBinding = z
  .object({
    /** which prototype this ability plays (omit = keep the shipped binding) */
    family: zW3xFamilyId.optional(),
    /** false = this ONE ability falls back to its `fx.prim.*` classification */
    enabled: z.boolean().optional(),
    /** the map's own `usca`/`SetUnitScalePercent` for this call site */
    w3xScale: z.number().min(0.05).max(20).optional(),
    /** the map's own vertex tint for this call site, 0..255 */
    tint: zW3xTint255.optional(),
    /** the map's own `SetUnitFlyHeight`, WC3 units (128 units = 1 world unit) */
    flyHeight: z.number().min(-2000).max(2000).optional(),
    /** direct opacity override, after the family default */
    alpha: z.number().min(0.05).max(1).optional(),
    /** direct lifetime stretch override, after the family default */
    timeScale: z.number().min(0.2).max(4).optional(),
    /**
     * 方位角 (#366) —— 這一招朝哪個方向噴,度,0 = +X。
     *
     * 它是 owner 點名的「方位」,也是四個參數裡唯一一個在這之前**完全不存在**的。
     * 走的是 `zVfxOrient.yawDeg` 那條路(`artParams` 把它折進 `doc.orient`),
     * 所以它和 `alpha`/`timeScale` 一樣會進 doc、一樣會換 pool key,⛔ 不是
     * 另開一條平行的空間參數管線 —— `flyHeight` 當年就是因為走了平行管線,
     * 在 `familyRow()` 一行之內蒸發掉。
     */
    facingDeg: z.number().min(-360).max(360).optional(),
    /**
     * 仰角 (#366),度。**90 = 直立**(現況),**0 = 完全橫放**。
     * owner 點名的「**橫放的柱狀砲**」就是 `column` primitive + 這一格填 0 ——
     * ⛔ 不是一支新技能的新程式。
     */
    pitchDeg: z.number().min(-180).max(180).optional(),
    /** WC3 attachment string, verbatim ("chest", "origin", "right,hand") */
    anchor: z.string().min(1).max(32).optional(),
    // ── 特效自帶的音效（GH#390）—— **這一支**技能的四個時機各自播哪一個 sfx key。
    // ⭐ 逐格覆寫家族原型的那一格：填了 `soundImpact` 只換命中音，其餘三格仍然走
    // 家族。⛔ 不是「填一格就整組換掉」—— WC3 的原作音效多半只有一兩個時機是特別
    // 的（例：迴旋斬有自己的發射音，命中音跟家族一樣）。
    // ⚠️ 這一段刻意是行註解而不是 TSDoc：`gen_spec.tsdocFields` 會把一段 TSDoc 綁到
    // 它後面第一個「欄位名:」上，而 spread 不是欄位 —— 寫成 TSDoc 的話這整段會被掛到
    // `soundGain` 頭上（實測過，產出的文件上真的長成那樣）。
    ...vfxSoundCueShape,
    /** 這一支的音量倍率，疊在家族與 audio-map 的 `gain` 上面（1 = 不動） */
    soundGain: z.number().min(0).max(2).optional(),
  })
  .strict();
export type VfxAbilityFamilyBinding = z.infer<typeof zVfxAbilityFamilyBinding>;

export const zConfigVfxFamiliesDoc = z
  .object({
    id: zId,
    schema: z.literal("config.vfx-families@1"),
    /** master switch: false = the whole evidence layer is off, `fx.prim.*` only */
    enabled: z.boolean(),
    /**
     * How hard a WC3 scale is compressed into doc space: `1 + (usca - 1) * gain`,
     * then clamped to [scaleMin, scaleMax]. gain 0 = ignore the map's scales
     * entirely; gain 1 = take them literally (a 10.0 call fills the screen).
     */
    scaleGain: z.number().min(0).max(1),
    scaleMin: z.number().min(0.1).max(4),
    scaleMax: z.number().min(0.2).max(8),
    /**
     * 一支技能的 `vfxLayers` 最多播幾層 (#205 / #230)。
     *
     * OPTIONAL 是刻意的,不是漏掉的:這個 doc 已經有存過的 durable overlay,
     * 把欄位設成必填會讓那些舊 overlay 整份 `safeParse` 失敗 →
     * `extractFamiliesDoc` 回 null → **整個家族層一起消失**。省略 =
     * `DEFAULT_MAX_ABILITY_VFX_LAYERS`(見 `./abilityVfx.ts`,那裡也寫了它是
     * 怎麼從畫面 system 預算推出來的)。
     *
     * 上界 6 = `ABILITY_VFX_LAYER_HARD_CAP`;寫在這裡是因為 Zod 的 max 要一個
     * 字面值,`abilityLayers.test.ts` 對兩者做等式斷言,漂開就紅。
     */
    maxAbilityVfxLayers: z.number().int().min(1).max(6).optional(),
    /**
     * 一次性特效的粒子壽命上限,秒 —— 「餘燼還能留多久」那一格。
     *
     * OPTIONAL 的理由和上面那一格一模一樣(已經存過的 durable overlay 沒有這個
     * key,設成必填會讓那些 overlay 整份 `safeParse` 失敗 → 整個家族層消失)。
     * 省略 = `DEFAULT_ONE_SHOT_MAX_LIFE_SEC`(0.6),也就是升級前的行為。
     *
     * 上下界 0.1 / 3 是 `MIN_/MAX_ONE_SHOT_MAX_LIFE_SEC`;Zod 的 min/max 要字面
     * 值,所以這裡是抄的,而 `vfxForge.test.ts` 對兩者做 safeParse 四點驗證、
     * `oneShotLife.test.ts` 對常數做等式斷言,漂開就紅。
     */
    oneShotMaxLifeSec: z.number().min(0.1).max(3).optional(),
    /**
     * 施法特效的高度從哪裡來 —— owner #251「衝擊波特效沒有真實套用」。
     * 值的語意與「為什麼出貨是 `ground`」寫在 `CAST_HEIGHT_SOURCES` 上面。
     *
     * OPTIONAL 的理由和上面兩格一樣:已經存過的 durable overlay 沒有這個 key,
     * 設成必填會讓那些 overlay 整份 `safeParse` 失敗 → `extractFamiliesDoc`
     * 回 null → **整個家族層一起消失**。省略 = `DEFAULT_CAST_HEIGHT_SOURCE`。
     */
    castHeightSource: z.enum(CAST_HEIGHT_SOURCES).optional(),
    /**
     * 飛行中的投射物要不要真的套用它自己那份 vfx 文件(大小/壽命/密度/混色)。
     * 省略 = `DEFAULT_PROJECTILE_ART_FROM_DOC`(true)。false = 升級前的固定彗星。
     */
    projectileArtFromDoc: z.boolean().optional(),
    /**
     * 彈道體積跟 `hitRadius` 走多少(0 = 全部一樣大 = 升級前;1 = 完全跟著走)。
     * 上下界 0/3 是 `MIN_/MAX_PROJECTILE_RADIUS_GAIN`;Zod 的 min/max 要字面值,
     * 所以這裡是抄的,`vfxForge.test.ts` 對兩者做 safeParse 四點驗證。
     */
    projectileRadiusGain: z.number().min(0).max(3).optional(),
    /** 彈道飛在離地多高。上下界 0.2/4 是 `MIN_/MAX_PROJECTILE_FLY_HEIGHT_Y`。 */
    projectileFlyHeightY: z.number().min(0.2).max(4).optional(),
    /**
     * GH#379 —— 有方向的五個形狀要不要套用**家族仰角預設**(見
     * `DEFAULT_FAMILY_PITCH_DEG`)。省略 = `DEFAULT_FAMILY_PITCH_DEFAULTS_ENABLED`
     * (true)。false = 全部回到直立 = GH#366/#377 落地之前的行為(一鍵 rollback)。
     *
     * OPTIONAL 的理由和上面四格一模一樣:已經存過的 durable overlay 沒有這個 key,
     * 設成必填會讓那些 overlay 整份 `safeParse` 失敗 → `extractFamiliesDoc` 回 null
     * → **整個家族層一起消失**。
     */
    familyPitchDefaults: z.boolean().optional(),
    /**
     * 五個有方向的家族各自的仰角(度)。90 = 直立、0 = 完全橫放。
     * 省略 = `DEFAULT_FAMILY_PITCH_DEG` 的那一格。上下界 −180/180 與
     * `zVfxOrient.pitchDeg` 同一條線(Zod 的 min/max 要字面值,所以這裡是抄的)。
     *
     * ⚠️ 填 90 的意思是「這個家族不瞄準」——**瞄準是從仰角推出來的**,
     * ⛔ 不是另一格可以獨立打勾的東西(見 `DEFAULT_FAMILY_PITCH_DEG` 的 ⭐)。
     */
    beamPitchDeg: z.number().min(-180).max(180).optional(),
    slashPitchDeg: z.number().min(-180).max(180).optional(),
    boltPitchDeg: z.number().min(-180).max(180).optional(),
    dashPitchDeg: z.number().min(-180).max(180).optional(),
    tornadoPitchDeg: z.number().min(-180).max(180).optional(),
    /**
     * GH#390 —— 特效自帶音效的**總開關**。省略 = `DEFAULT_VFX_SOUND_ENABLED`（true）。
     * false = 一發都不播 = 這一版落地之前的行為（一鍵 rollback）。
     *
     * OPTIONAL 的理由和上面那幾格一模一樣：已經存過的 durable overlay 沒有這個 key，
     * 設成必填會讓那些 overlay 整份 `safeParse` 失敗 → 整個家族層一起消失。
     */
    soundEnabled: z.boolean().optional(),
    families: z.record(zW3xFamilyId, zVfxFamilyTuning),
    abilities: z.record(z.string().min(1), zVfxAbilityFamilyBinding),
  })
  .strict();
export type ConfigVfxFamiliesDoc = z.infer<typeof zConfigVfxFamiliesDoc>;

/**
 * `scaleMin > scaleMax` is the one cross-field mistake the per-field bounds
 * cannot catch. It is NOT a schema error on purpose: `zConfigDoc` is a
 * `discriminatedUnion`, which only accepts plain `ZodObject` members, so a
 * `superRefine` here would break the whole config collection's parse. The
 * renderer therefore treats the pair as an unordered interval
 * (`resolveScaleMapping` in `render/vfx/familyTuning.ts` sorts them), which
 * degrades to "the operator typed them backwards" instead of "no VFX config
 * loads at all".
 *
 * ⚠️ CORRECTED 2026-07-30 (稽核 / CLAUDE.md 第三守則). This comment used to end
 * with 「`familyTuning.test.ts` pins that behaviour」. **THERE IS NO SUCH FILE.**
 * The nearest neighbour, `apps/client/src/render/vfx/familyTuningDegrade.test.ts`,
 * never mentions `scaleMin`/`scaleMax` and never imports `resolveScaleMapping`.
 * As of this line the swap-tolerance is UNGUARDED, and this helper itself has
 * ZERO callers — deleting both would turn nothing red (失敗形態 ③). Do not read
 * the paragraph above as a verified contract; it is a description of intent.
 * Anyone wiring the admin form to this helper owes it a real behaviour test
 * (feed scaleMin > scaleMax through `resolveScaleMapping`, assert min/max come
 * back sorted).
 */
export function vfxFamiliesScaleOrdered(doc: ConfigVfxFamiliesDoc): boolean {
  return doc.scaleMax >= doc.scaleMin;
}

/* ──────────────────────────────────────────────────────────────────────────
 * 特效音效的**解析**（GH#390）—— 純函式，client / editor / 測試共用同一支
 * ────────────────────────────────────────────────────────────────────────── */

/** 一發解出來的特效音：要播哪一個 audio-map key，以及疊了多少音量。 */
export interface ResolvedVfxSound {
  readonly key: string;
  /** family × ability 兩層 `soundGain` 相乘的結果（1 = 不動） */
  readonly gain: number;
}

/**
 * 一支技能的某一個時機該播什麼。
 *
 * ⭐ **兩層，逐格**：`abilities[id].soundX` 覆寫 `families[fam].soundX`，
 * 一格一格各自決定 —— 這就是「K 個模板 + 一張表」在音效上的樣子。
 * ⛔ 不是「ability 那一列有東西就整組換掉」。
 *
 * 回 null 的三種情況（全部都是「安靜」而不是「播錯的」）：
 *   ① 總開關關掉；② 這一格兩層都沒填；③ 這支技能不在家族表上。
 *
 * ⚠️ 它**不知道** audio-map 有沒有這個 key —— 那是 `vfxSoundKeysAreReal` 那條
 * 閘的工作（第一·五守則：卡片上不可以有說了但不會發生的字）。
 */
export function resolveVfxSound(
  doc: ConfigVfxFamiliesDoc | null | undefined,
  familyId: string | undefined,
  abilityId: string | undefined,
  cue: VfxSoundCue,
): ResolvedVfxSound | null {
  if (!doc) return null;
  if ((doc.soundEnabled ?? DEFAULT_VFX_SOUND_ENABLED) === false) return null;
  const field = VFX_SOUND_CUE_FIELD[cue] as keyof VfxFamilyTuning;
  const fam = familyId ? doc.families[familyId as W3xFamilyId] : undefined;
  const ab = abilityId ? doc.abilities[abilityId] : undefined;
  // 家族被關掉 = 這一族整個不覆寫,音效跟著一起不播(⛔ 不可以只留聲音沒有畫面)。
  if (fam && fam.enabled === false) return null;
  if (ab && ab.enabled === false) return null;
  const key =
    (ab?.[field as keyof VfxAbilityFamilyBinding] as string | undefined) ??
    (fam?.[field] as string | undefined);
  if (!key) return null;
  const gain =
    (fam?.soundGain ?? DEFAULT_VFX_SOUND_GAIN) * (ab?.soundGain ?? DEFAULT_VFX_SOUND_GAIN);
  return { key, gain };
}

/** 這個家族的循環音間隔（毫秒）。 */
export function vfxSoundLoopMs(doc: ConfigVfxFamiliesDoc | null | undefined, familyId: string | undefined): number {
  const fam = doc && familyId ? doc.families[familyId as W3xFamilyId] : undefined;
  return fam?.soundLoopMs ?? DEFAULT_VFX_SOUND_LOOP_MS;
}

/** 這個家族的循環音**到期上界**（毫秒）—— 回收用，見 `DEFAULT_VFX_SOUND_LOOP_MAX_MS`。 */
export function vfxSoundLoopMaxMs(doc: ConfigVfxFamiliesDoc | null | undefined, familyId: string | undefined): number {
  const fam = doc && familyId ? doc.families[familyId as W3xFamilyId] : undefined;
  return fam?.soundLoopMaxMs ?? DEFAULT_VFX_SOUND_LOOP_MAX_MS;
}

/**
 * 這份家族設定裡出現過的每一個 sfx key（去重、排序）。
 *
 * ⭐ 守衛用它去問 audio-map「這些 key 你認得嗎」——`content:build` 綠、schema 綠、
 * 後台存得起來，而遊戲裡什麼都不響，正是第一·五守則點名的那種失敗。
 */
export function vfxSoundKeysUsed(doc: ConfigVfxFamiliesDoc | null | undefined): string[] {
  if (!doc) return [];
  const out = new Set<string>();
  const take = (row: unknown): void => {
    if (!row || typeof row !== "object") return;
    const r = row as Record<string, unknown>;
    for (const f of Object.values(VFX_SOUND_CUE_FIELD)) {
      const v = r[f];
      if (typeof v === "string" && v) out.add(v);
    }
  };
  for (const k of Object.keys(doc.families).sort()) take(doc.families[k as W3xFamilyId]);
  for (const k of Object.keys(doc.abilities).sort()) take(doc.abilities[k]);
  return [...out].sort();
}

// ---------------------------------------------------------------------------
// config.vfx-ability-art@1 — 逐技能的特效綁定（GH#384）
// ---------------------------------------------------------------------------

/**
 * `content/config/vfx-ability-art.json` —— **哪一支技能畫哪一組特效**。
 *
 * ⚠️ 這一份補的不是一個新欄位，是**整份資料的住址**。GH#384 量到的：617 筆
 * 「技能 id → 特效參數」住在 `apps/client/src/render/vfx/` 的三張 TypeScript
 * 常數表裡（`bindings.ts` 的 325 筆分類、`w3xFamilyArt.ts` 的 258 筆證據、
 * `w3xAbilityArt.ts` 的 34 筆晉升）。那是**內容**，而它的後果是量得到的：
 *
 *   · 改一支技能的特效 = 一次完整部署（client 是 build 時烘進映像的），
 *     而 `content/` 是 live bind-mount —— 一格後台欄位存檔就生效
 *   · ⛔ **外部編輯器看不到它們，而且不會知道自己漏了** —— 第〇·五守則點名的
 *     那條對外契約紅線（`unsupported` 至少會被拒絕，這個連拒絕都沒有）
 *
 * ⭐ **三張表收斂成一個形狀**（第零守則⑨：N 個同型 = K 個模板 + 一張表）。
 * 三者問的是同一個問題的三個層級，所以它們是同一列的三格，⛔ 不是三份文件：
 *
 *   | 格 | 誰在用 | 是什麼 |
 *   |---|---|---|
 *   | `prim` | 每一支（基準線） | 名字分類出來的**元素 + 形狀**，`fx.prim.*` 的來源 |
 *   | `family` | 258 支 | 原作**證明**的家族原型 + 那個呼叫點自己的數值 |
 *   | `promoted` | 34 支 | 原作藝術真的出貨成 emitter 文件的那些，指名 doc |
 *
 * ⛔ **這一份與 `config.vfx-families@1.abilities` 不是同一層，兩者都要在。**
 * 這一份是**證據**（原作真的怎麼畫），那一份是**後台覆寫**（owner 想怎麼改）。
 * `familyTuning.resolveFamilyArt` 的優先序沒有變：覆寫 > 證據 > 家族預設。
 * 合成一份的話，操作者清空一格就再也回不到原作的值。
 */
const zVfxArtProvenance = z.enum([
  "w3a-override",
  "jass-literal",
  "jass-spawn",
  "w3h-override",
  "stock-inherited",
]);

/** 名字分類出來的基準線 —— 元素給顏色、形狀給輪廓、尺寸給大小。 */
export const zVfxPrimBinding = z
  .object({
    /** 顏色 */
    element: zVfxElement,
    /** 輪廓 */
    primitive: zVfxPrimitiveKind,
    /**
     * 尺寸覆寫。**省略 = 讓槽位決定**（R／EX 讀大、其餘中等）——
     * ⛔ 不是「中等」。槽位規則是引擎的機制（`bindings.ts::sizeForSlot`），
     * 這一格只在作者要推翻它時才寫。
     */
    size: z.enum(["sm", "md", "lg"]).optional(),
  })
  .strict();
export type VfxPrimBinding = z.infer<typeof zVfxPrimBinding>;

/**
 * 原作**證明**的家族原型 + 這個呼叫點自己的數值。
 *
 * ⚠️ ABSENT ≠ 1.0。`scale` / `tint` / `flyHeight` 缺席的意思是「原作沒有為這個
 * 呼叫點寫過一個值」，⛔ 不是「原作寫了 1.0」—— 前者走家族預設，後者會把家族
 * 預設乘掉。`paramSource` 就是為了讓這個區別看得見才存在的。
 */
export const zVfxFamilyBinding = z
  .object({
    family: zW3xFamilyId,
    /** 證據指名的暴雪內建模型 stem（`warstompcaster`／`blinktarget`…） */
    model: z.string().min(1).max(64),
    /** 證據掛在哪一顆原作 rawcode 上（只收 CONFIRMED 的連結） */
    w3aId: z.string().regex(/^[A-Za-z0-9]{4}$/),
    provenance: zVfxArtProvenance,
    /** 走的是哪一條通道：w3a 藝術欄位、buff 記錄，或一支 JASS 呼叫 */
    via: z.string().min(1).max(64),
    /** WC3 掛點字串，逐字（`chest`／`origin`／`right,hand`） */
    anchor: z.string().min(1).max(32).optional(),
    /** 原作對**這個呼叫點**寫的縮放（`usca`／`SetUnitScalePercent`） */
    scale: z.number().min(0.05).max(20).optional(),
    /** 原作對這個呼叫點寫的頂點染色，0..255 */
    tint: zW3xTint255.optional(),
    /** 原作對這個呼叫點寫的飛行高度，WC3 單位 */
    flyHeight: z.number().min(-2000).max(2000).optional(),
    /**
     * 上面三個數字是**從哪裡讀到的**。`ref` = 這個呼叫點自己寫的；
     * `model` = 這個模型在全部 3682 筆引用裡只有唯一一個值，所以不歧義。
     * ⛔ 有一個以上候選值的一律缺席，**不平均**。
     */
    paramSource: z.enum(["ref", "model"]).optional(),
  })
  .strict();
export type VfxFamilyBinding = z.infer<typeof zVfxFamilyBinding>;

/** 原作藝術真的出貨成 emitter 文件的那些 —— 直接指名 doc id。 */
export const zVfxPromotedBinding = z
  .object({
    /** 原作模型 stem，例 `frostnova` */
    family: z.string().min(1).max(64),
    w3aId: z.string().regex(/^[A-Za-z0-9]{4}$/),
    /** 晉升只收作者自己設的來源，⛔ 從不收暴雪內建繼承 */
    provenance: z.enum(["w3a-override", "w3h-override", "jass-literal"]),
    via: z.string().min(1).max(64),
    /** 主 emitter —— 這一支技能的 `vfxKey` 就是它 */
    primary: z.string().min(1).max(96),
    /** 家族剩下的 emitter，跟著主的一起放 */
    extra: z.array(z.string().min(1).max(96)).max(32),
  })
  .strict();
export type VfxPromotedBinding = z.infer<typeof zVfxPromotedBinding>;

const zVfxAbilityArtRow = z
  .object({
    prim: zVfxPrimBinding.optional(),
    family: zVfxFamilyBinding.optional(),
    promoted: zVfxPromotedBinding.optional(),
  })
  .strict();
export type VfxAbilityArtRow = z.infer<typeof zVfxAbilityArtRow>;

export const zConfigVfxAbilityArtDoc = z
  .object({
    id: zId,
    schema: z.literal("config.vfx-ability-art@1"),
    /**
     * 技能文件 id → 這一支的三層綁定。
     *
     * ⚠️ 一列三格全空是沒有意義的，所以至少要有一格；空的那一列會讓這支技能
     * **完全沒有特效**，而那正是這份文件要消滅的那種安靜失敗。
     */
    bindings: z.record(zVfxAbilityArtRow.refine((r) => !!(r.prim ?? r.family ?? r.promoted), "一列至少要有 prim / family / promoted 其中一格")),
  })
  .strict();
export type ConfigVfxAbilityArtDoc = z.infer<typeof zConfigVfxAbilityArtDoc>;
