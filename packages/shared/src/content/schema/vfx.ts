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
    /**
     * ⭐ GH#702 —— 「**這一份文件就是血**」。玩家的 `config.gore@1.style`
     * 靠它認得出誰該被關掉。
     *
     * ⛔ **⛔ 不是一張血花 id 名單**：名單沒有寫入端 ⇒ 下一份血花文件永遠不會
     * 被加進去，而那時它已經是一句過期的散文。值住**文件自己身上**
     * （第〇·四守則：同一份知識只有一個住處）。
     *
     * ⚠️ **只標「純粹的血」** —— 那種拿掉之後這一下仍然讀得出來的裝飾層
     * （命中噴血、地上的血漬）。一支技能**自己的美術**（血魔法的 nova／
     * 吸血斬的 slash）⛔ 不要標：標上去等於「玩家選無血 ⇒ 那支技能整個看不見」，
     * 那是**可讀性**的損失，⛔ 不是 gore 分級（分級是另一件事，⛔ 不在這一格）。
     *
     * 省略 = false = 這道閘不管它（升級前的行為，一位元不差）。
     */
    gore: z.boolean().optional(),
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
     * 省略 = 1。⚠️ 兩份 glb 常常是用不同的轉檔倍率烘出來的，所以 1 未必是對的。
     *
     * ⭐ 它是**兩個 `scale_factor` 的比值**，算法與出處寫在
     * `content/attachmentScale.ts`（`attachScaleFor()`）：悟空的超三頭是
     * **0.4161 = 0.01156 / 0.02778** —— 兩個數字都逐字取自
     * `tools/w3x-import/out/GoDieEX22s/models_report.json`（`goku.mdx` 走英雄身高
     * 規則、`Goku3head.mdx` 走 1/36 道具規則）。
     *
     * ⛔ 這一行在 2026-08-20 之前寫的是「0.3221 = 0.008946 / 0.027778」，
     * 而 **`0.008946` 在整個 repo 裡不存在** —— 一段事後合理化（第三守則）。
     * 出貨值因此是忠實尺寸的 77%；owner 2026-08-20：「**照原著 改成忠實值**」。
     * 守衛：`content/attachmentScale.test.ts`（真的讀那兩份 JSON 對數字，⛔ 不掃註解）。
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
 * ⚡ 施法電弧（`config.vfx-families@1.castArcs`）的出貨預設。
 * ⛔⛔ **2026-08-23 改成 `false`** —— owner 當天回報「又變得 lag 了，這次更糟**第一回合就開始** lag」，
 * 而伺服器實測完全沒事（sim tick p99 **2.8ms** / 預算 33.3ms、**shedEvents 0**、主機 load **0.24**）
 * ⇒ 那是**客戶端**的成本。⭐ 這一族**爆散型每次施法生 5–8 條弧帶**，而低冷卻的
 * `nova`（例：58-01 十萬伏特）在第一回合就會不停施放。
 * owner 逐字：「**請你預設關閉**」。
 * ⇒ ⭐ 想看電弧就在後台鑄技工坊把它轉開（`content/` 是 live bind-mount，存檔就生效）。
 */
export const DEFAULT_CAST_ARCS = false;

/**
 * ⚡ 同時在場的電弧帶上限（`config.vfx-families@1.maxConcurrentArcs`，GH#781）
 * 的出貨預設。32 ＝ 改動前 `ArcBoltFx.MAX_ARC_STRIPS` 的字面值 ——
 * 這一格從「寫死」變「後台可調」的那一天，畫面逐位元組不變。
 */
export const DEFAULT_MAX_CONCURRENT_ARCS = 32;

/** 衝擊波環的亮度倍率出貨值（GH#617，owner「太亮太搶眼」）。1 = 回到 2026-08-23 之前。 */
export const DEFAULT_IMPACT_RING_ALPHA = 0.35;
/** 同上,大小倍率。 */
export const DEFAULT_IMPACT_RING_RADIUS = 1;
/** 衝擊波環的壽命倍率出貨值（GH#617,owner「散開速度感要夠快⋯太慢存活時間也太長」)。 */
export const DEFAULT_IMPACT_RING_LIFE = 0.55;
/** 淡出指數出貨值（owner「半透明淡出更快衰減」）。 */
export const DEFAULT_IMPACT_RING_FADE_POW = 3;
/** ⛔ 硬天花板（秒）—— owner 逐字「0.8秒內」。 */
export const DEFAULT_IMPACT_RING_MAX_LIFE_SEC = 0.8;
/** 極大比極小快幾倍（owner「五級距越大速度越快」）。 */
export const DEFAULT_IMPACT_RING_TIER_SPEED = 1.8;

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

// ---------------------------------------------------------------------------
// 🎚️ 粒子密度上限（GH#838，owner 2026-08-28）
// ---------------------------------------------------------------------------
//
// owner 逐字：「所有特效粒子特效密度要受到上限值管制，後台可設定，這次的特效
// 編輯器裡設定共同遵守上限值，這個上限值也會卡入實際遊戲前端執行的**單個特效
// 上限值**」
//
// ⭐ 兩格，因為「密度」有兩個軸，而只夾一個治不了另一個：
//   · `maxParticlesPerSystem` —— **一個** ParticleSystem 的容量上限（瞬間顆數）
//   · `maxRatePerSystem`      —— 持續型每秒噴幾顆（時間軸上的密度）
//
// ⭐ 咬在哪：`particleFactory.capacityFor()`（**每一個** ParticleSystem 的容量都
// 從那一支出來 —— 出貨路徑、audition、預設族、編輯器共用同一支）。⛔ 不在
// 呼叫端各夾一次：那會變成 N 個住處，而漏掉的那一個就是下一次的爆量來源。
//
// ⚠️ 上界 20000 不是「建議值」是**護欄**：一份把 burstCount 寫成 999999 的文件
// 今天會讓瀏覽器直接配一個百萬顆的 buffer。下界 16 是「還畫得出東西」的底。

export const DEFAULT_MAX_PARTICLES_PER_SYSTEM = 1200;
export const MIN_MAX_PARTICLES_PER_SYSTEM = 16;
export const MAX_MAX_PARTICLES_PER_SYSTEM = 20000;

export const DEFAULT_MAX_RATE_PER_SYSTEM = 600;
export const MIN_MAX_RATE_PER_SYSTEM = 4;
export const MAX_MAX_RATE_PER_SYSTEM = 5000;

/** 後台的「單個特效顆數上限」（缺席／界外 ⇒ 出貨預設／夾回範圍）。 */
export function clampMaxParticlesPerSystem(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return DEFAULT_MAX_PARTICLES_PER_SYSTEM;
  return Math.min(MAX_MAX_PARTICLES_PER_SYSTEM, Math.max(MIN_MAX_PARTICLES_PER_SYSTEM, Math.floor(v)));
}

/** 後台的「單個特效每秒噴幾顆上限」。 */
export function clampMaxRatePerSystem(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return DEFAULT_MAX_RATE_PER_SYSTEM;
  return Math.min(MAX_MAX_RATE_PER_SYSTEM, Math.max(MIN_MAX_RATE_PER_SYSTEM, Math.floor(v)));
}

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

// ---------------------------------------------------------------------------
// 有方向的形狀的**家族錐角**(GH#456) —— 「扇形張多寬」那一格
// ---------------------------------------------------------------------------

/**
 * 每個有方向的家族的發射錐**張多寬**(度,全角)。
 *
 * ⚠️ 這是 `slashPitchDeg`(**傾斜**)之外的**另一件事**:仰角決定刀光躺成什麼角度,
 * 錐角決定那道扇形本身多寬。owner 2026-08-18 講的「slash 全家族的張角」把兩者
 * 混在一起問,是因為**只有前者是後台欄位** —— 後者在 2026-08-19 之前寫死在
 * `apps/client/src/render/vfx/primitives.ts` 的 `SHAPES` 裡,操作者一格都改不到。
 *
 * ⭐ 這五個數字**就是** `primitives.ts` 出貨的那五個(`slash` 92 / `beam` 9 /
 * `bolt` 6 / `dash` 22 / `tornado` 34)—— 那支檔案現在**從這裡讀**,所以出貨的
 * `content/vfx/fx.prim.*.json` 一位元都沒變,⛔ 也不會有第二個住處慢慢漂掉。
 *
 * ⛔ `column` 的 8° 不在這張表裡:它不在 `DIRECTIONAL_PRIMITIVES` 內,做一格
 * 永遠不會被套用的欄位就是第一·五守則點名的空宣稱。
 */
export const DEFAULT_FAMILY_EMITTER_ANGLE_DEG: Readonly<Record<DirectionalPrimitive, number>> = {
  beam: 9,
  slash: 92,
  bolt: 6,
  dash: 22,
  tornado: 34,
};

/** 一個家族的生效錐角:後台的值(界外夾回)→ 出貨預設。上下界同 `zEmitter.cone`。 */
export function familyEmitterAngleDeg(
  family: DirectionalPrimitive,
  override: number | undefined,
): number {
  return clampTo(override, 1, 180, DEFAULT_FAMILY_EMITTER_ANGLE_DEG[family]);
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

/* ──────────────────────────────────────────────────────────────────────────
 * 地面痕跡（GH#439）
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * 一次施法在地上留下的痕跡**種類**。
 *
 * ⚠️ 量到的缺口（2026-08-19）：`VfxSystem` 每一顆 `abilityCast` 都會蓋一張
 * decal，而 `castScorchSpec()` 對**每一支技能**回同一張焦痕 ——
 * 91 支地面衝擊波和其餘 570 支蓋的是逐位元組相同的印子。「地面震裂」因此
 * 在畫面上不存在，而且⛔ 沒有任何一格後台可以改到它（第一守則）。
 *
 * ⭐ 這是一份**機制清單**，⛔ 不是一格自由填的貼圖路徑：路徑自由填 = 打錯字
 * 的那一格會靜靜地載不到圖，而畫面上看起來只是「這一招沒有痕跡」
 * （第一·五守則的形狀）。引擎認得幾種就只有幾種，每一種都對應到一張
 * **repo 裡真的存在**的貼圖（`apps/client/src/render/vfx/groundDecal.test.ts` 逐張讀 disk）。
 *
 *   · `scorch` —— 焦痕（出貨預設，火／魔法／爆炸）
 *   · `crack`  —— 地面震裂（原作 WarStomp 那一族：衝擊波、跺地、落石）
 *   · `dirt`   —— 揚起的土（衝鋒、落地、位移）
 *   · `none`   —— 這一族不留痕跡
 */
export const VFX_GROUND_DECALS = ["scorch", "crack", "dirt", "none"] as const;
export type VfxGroundDecal = (typeof VFX_GROUND_DECALS)[number];

/** 沒有填的家族走這個 —— 也就是 GH#439 落地之前**每一支技能**的行為。 */
export const DEFAULT_VFX_GROUND_DECAL: VfxGroundDecal = "scorch";

/** 認得就回它，不認得（舊 overlay／打錯字）就回出貨預設。⛔ 不丟例外。 */
export function resolveVfxGroundDecal(v: string | undefined): VfxGroundDecal {
  return (VFX_GROUND_DECALS as readonly string[]).includes(v ?? "")
    ? (v as VfxGroundDecal)
    : DEFAULT_VFX_GROUND_DECAL;
}

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
    /**
     * GH#439 —— 這個家族在地上留下哪一種痕跡（省略 = `DEFAULT_VFX_GROUND_DECAL`）。
     *
     * ⭐ 它在**家族原型**上，所以填一次 21 個原型就覆蓋 258 支技能
     * （第零守則⑨：K 個模板 + 一張表）。⛔ 這不是「替衝擊波寫一個 if」——
     * 引擎只認得 `VFX_GROUND_DECALS` 這幾種痕跡，哪個家族用哪一種是**資料**。
     *
     * OPTIONAL 的理由和上面那幾格一模一樣：已經存過的 durable overlay 沒有這個
     * key，設成必填會讓那些 overlay 整份 `safeParse` 失敗 → 整個家族層一起消失。
     */
    groundDecal: z.enum(VFX_GROUND_DECALS).optional(),

    /**
     * ⭐⭐ GH#761 —— **這一族宣告哪幾顆原作模型**（模型 stem，⛔ 不是路徑）。
     *
     * ── 這一格為什麼是整張票的核心 ─────────────────────────────────────────
     * 「一次施法有幾個發射器」的答案是
     *   `family.models × p00..p{窗寬-1}` ⇒ `fx.w3x.stock.<model>.p<NN>`
     * （`w3xAbilityArt.stockEmitterIds()`，⭐ 那是一條**規則**⛔ 不是逐支的表）。
     *
     * ⚠️ 而在這一格出現以前，`models` 是這張表**唯一**還鎖在 TS 常數裡的欄位：
     * 其餘 10 格（enabled / primitive / element / scale / alpha / timeScale /
     * heightY / 音效 / groundDecal）**全部**已經在這份 config 裡可調，
     * ⛔ 只有「到底播哪幾顆」不行 ⇒ 後台特效編輯器與普查看不到它，
     * 而那正是 GH#761 逐字說的「該由內容表達的資料被寫死在渲染層」。
     *
     * ⭐ 為什麼**不**把 id 烘進 421 份 ability 文件（票的 AC① 字面）：
     * 那會是第〇·四守則的第二個住處 —— N 支技能 × 每次美術改動 = 一次完整的
     * 重新產生鏈。⭐ 規則本身沒有錯，錯的是**規則的輸入不可編輯**。
     * ⇒ 讓輸入變成內容，⛔ 不是把輸出攤平。
     *
     * ── ABSENT 的語意 ──────────────────────────────────────────────────────
     * 省略 ⇒ 用 `W3X_ART_FAMILIES[family].models`（出貨原型）＝ **今天的行為**，
     * 逐位元不變。⚠️ 空陣列 `[]` 與省略**不同**：`[]` 是「這一族不要任何原作
     * emitter」，⭐ 那是一個可以被表達的決定（止血閥）。
     */
    models: z.array(z.string().min(1)).max(12).optional(),
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
     * ⚡ GH#571 —— **施法電弧**（`fx.prim.<element>.<shape>` 這條家族規則）。
     *
     * owner 2026-08-22（逐字，[優先]）：「一堆閃電特效 如**皮卡丘 飛鼠先生
     * 雷神之槌** 等雷電特效 **都沒有真的出現**」。⛔ 根因不是「沒有演算法」
     * （`ArcBoltFx` 早就做完了），是**只有 2 支**技能走得到它，而帶
     * `fx.prim.lightning.*` 的有 **28 支**。
     *
     * ⭐ 這一格是那條家族規則的**總開關**：轉成 `false` ⇒ 逐位元組回到
     * 2026-08-23 之前（28 支回到只有粒子）。⛔ 它**不是**品質階梯的一環 ——
     * 品質降級走 `AdaptiveQuality`，這一格是**要不要有這個機制**。
     *
     * ⚠️ 為什麼是 OPTIONAL：與上面五格逐字同一個理由 —— 線上**已經存過**的
     * 耐久覆蓋層沒有這個 key，設成必填會讓那些 overlay 整份 `safeParse` 失敗
     * ⇒ `extractFamiliesDoc` 回 null ⇒ **整個家族層一起消失**。
     *
     * 省略 = `DEFAULT_CAST_ARCS`（true，＝我挑的那一邊；第〇·六守則：
     * 優先權大的更新預設啟動）。
     */
    castArcs: z.boolean().optional(),

    /**
     * ⚡ GH#781 —— **同時在場的電弧帶上限**（`ArcBoltFx` 池子的 cap）。
     *
     * owner 2026-08-27（逐字）：「閃電演算法太過耗效能 請深入分析原因
     * 特別是場上有飛鼠先生、拳四郎、皮卡丘都在的時候」。
     * ⭐ 量到的（`docs/_reports/lightning-perf_temp_20260827.md`）：一發 65-04
     * 天譴 = 320 跳 → **960 條弧帶**擠進 32 格池子 ⇒ 每一格都是「畫了就被搶」，
     * 而**畫面上永遠只有 cap 條** —— 這一格就是那個 cap。
     *
     * 32 = 出貨值（＝改動前寫死的 `MAX_ARC_STRIPS`，逐位元組同一個畫面）。
     * 調低 = 團戰時電弧變稀但每一條活滿自己的壽命；調高 = 更密、GPU 加法混合
     * overdraw 線性上升。下界 4 = 一次 strike（主幹＋2 岔）要放得下還剩一格；
     * 上界 128 = 出貨的 4 倍，再上去是 128 顆 mesh＋材質逐幀在動。
     *
     * ⚠️ OPTIONAL 的理由與上面各格逐字相同（舊 overlay 沒有這個 key）。
     */
    maxConcurrentArcs: z.number().int().min(4).max(128).optional(),

    /**
     * ⛔⛔ **衝擊波環的亮度與大小倍率**（GH#617）—— owner 2026-08-23 逐字：
     * 「地上常出現**一堆亮藍色往外擴散的圈圈特效**⋯**我感覺是硬加的 太亮太搶眼不好看**」
     *
     * ⭐ 他兩件都說對了（查證過）：它是一顆 `CreateTorus`，⛔ **不是** `vfx@1` 文件、
     * ⛔ 不在任何 w3x 綁定表 ⇒ **結構上不可能有原作對應**；而它
     * `disableLighting = true` ＋ emissive ⇒ ⛔ 不吃場景光，在哪都一樣刺眼。
     * ⚠️ 而它**每一次魔法傷害各一發** ⇒ 一場團戰就是「一堆」。
     *
     * ⭐ 出貨 `0.35` / `0.7`（≈ 原本的三分之一亮、七成大）。**轉回 `1` 逐位元組
     * 回到 2026-08-23 之前** —— ⛔ 這一格是為了「回頭」，不是為了觀望。
     * ⚠️ OPTIONAL 的理由與同一份文件的其他格逐字相同：線上存過的耐久覆蓋層
     * 沒有這個 key，必填會讓整份 `safeParse` 失敗 ⇒ 整個家族層一起消失。
     */
    impactRingAlpha: z.number().min(0).max(1).optional(),
    impactRingRadius: z.number().min(0.1).max(3).optional(),

    /**
     * ⛔ **衝擊波環的壽命倍率**（GH#617 第二則）—— owner 2026-08-23 逐字：
     *
     * > 「ImpactComposer 的 ShockwaveRing **散開速度感要夠快**，這樣才會有**力量感**，
     * >  目前**太慢存活時間也太長**」
     *
     * ⭐ 這一格與上面兩格**方向相反**，所以刻意分開：
     * 亮度要**降**（太搶眼），⛔ 但半徑**不可以降** —— 環的擴散速度是
     * `endRadius / lifeMs`，縮半徑等於**再慢一次**，⛔ 正好殺掉他要的力量感。
     * ⇒ 出貨 `impactRingRadius = 1`（不動），⭐ 力量感全部由這一格出：
     * `0.45` ⇒ heavy 240ms→108ms、擴散 7.1→15.7 u/s（**2.22× 快**）。
     */
    impactRingLife: z.number().min(0.1).max(2).optional(),

    /**
     * **淡出曲線的指數** —— owner 2026-08-23：「**半透明淡出更快衰減**」。
     * `alpha × (1−t)^n`。2 = 2026-08-23 之前；3 = 出貨（前半段就掉掉七成八）。
     */
    impactRingFadePow: z.number().min(1).max(6).optional(),
    /**
     * ⛔ **硬天花板（秒）** —— owner 2026-08-23 逐字括號：「（**0.8秒內**，
     * 根據傷害五級距越大速度越快）」。⭐ 它夾的是**三格相乘之後**的結果，
     * ⛔ 不是任何一格自己的上界 —— 後台把壽命倍率拉到 2 也不會超過這裡。
     */
    impactRingMaxLifeSec: z.number().min(0.05).max(3).optional(),
    /**
     * ⭐ **極大級距比極小快幾倍** —— owner 2026-08-23：「根據**傷害五級距越大速度越快**」。
     * 五格線性內插（極小 1× → 極大 這一格）。1 = 五格一樣快（2026-08-23 之前）。
     * ⚠️ 分級用 shared 的 `damageTierIndexOf`，門檻只有一個住處
     *（`config.damage-tiers`）⇒ owner 跑 `pnpm anchors:build` 之後自動跟上。
     */
    impactRingTierSpeed: z.number().min(1).max(4).optional(),
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
     * GH#456 —— 五個有方向的家族各自的**錐角**(度,全角):扇形張多寬。
     * 省略 = `DEFAULT_FAMILY_EMITTER_ANGLE_DEG` 的那一格。上下界 1/180 與
     * `zEmitter` 的 cone 同一條線(Zod 的 min/max 要字面值,所以這裡是抄的)。
     *
     * ⚠️ 和上面五格**不是同一件事**:仰角 = 刀光躺成什麼角度,錐角 = 扇形多寬。
     * 這五格在 2026-08-19 之前寫死在 `primitives.ts`,後台一格都改不到。
     */
    beamAngleDeg: z.number().min(1).max(180).optional(),
    slashAngleDeg: z.number().min(1).max(180).optional(),
    boltAngleDeg: z.number().min(1).max(180).optional(),
    dashAngleDeg: z.number().min(1).max(180).optional(),
    tornadoAngleDeg: z.number().min(1).max(180).optional(),
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

/**
 * ⭐ **owner 的設計覆寫**（GH#431）—— 第〇·六守則的**第 1 層**，寫成一格。
 *
 * ⚠️ 這一格補的洞是**結構性的**，⛔ 不是「少一個欄位」：`family` 那一格整條鏈
 * （`MODEL_USAGE.json` → `deriveW3xFamilyArt` → 反捏造守衛）的設計前提是
 * **「原作說什麼就是什麼」**，所以它**沒有預留 owner 的設計決定要住哪**。量到的
 * 後果就是 owner 2026-08-19 點名的那一支：
 *
 *   「立起來的光柱也有其他技能會用到 **例如飛鼠天譴**」
 *
 * 飛鼠天譴（`godie-udea.r`，65-04 天譴）的證據是 `shockwaveRing` ——
 * 玩家看到的是**貼地衝擊環**。而三個可寫的點沒有一個承載得了這個決定：
 * 改 `family` 那一格會被反捏造守衛紅、改 `config.vfx-families@1.abilities[]`
 * 會被產生器洗掉、改 `prim` 那一格是**死改動**（family 贏 prim）。
 *
 * ⭐ 所以覆寫是**同一列的第四格**，⛔ 不是改寫證據那一格：
 * 被取代的原作值**原封留在隔壁的 `family` 格**（測試可以跟著設計走，
 * 知識不可以無聲消失），反捏造守衛因此**一格都不必放寬**。
 * 逐支的清單另存在 `docs/legacy/_w3x-fidelity-superseded.md`。
 *
 * 優先序（`familyTuning.resolveFamilyArt` 逐欄套用）：
 * **後台 live 覆寫 > 這一格 > 證據 > 家族預設**。後台仍然贏，因為那也是 owner，
 * 只是他當下的手；這一格是**出貨預設**，⛔ 這正是 GH#431 說後台 overlay 補不了的那半。
 */
export const zVfxOwnerBinding = z
  .object({
    /** 改用哪一個家族原型（天譴：`shockwaveRing` → `lightColumn`） */
    family: zW3xFamilyId.optional(),
    /** 覆寫縮放，與證據的 `scale` 同一個 w3x 空間 */
    scale: z.number().min(0.05).max(20).optional(),
    /** 覆寫染色，0..255 */
    tint: zW3xTint255.optional(),
    /** 覆寫飛行高度，WC3 單位 */
    flyHeight: z.number().min(-2000).max(2000).optional(),
    /** 覆寫掛點字串（`chest`／`origin`／`right,hand`） */
    anchor: z.string().min(1).max(32).optional(),
    /**
     * **為什麼**要推翻原作 —— owner 的原話或裁決日期。⛔ 必填。
     *
     * ⚠️ 它不是註解：一格沒有理由的覆寫，半年後沒有人分得出是設計還是手滑，
     * 於是它會被「修回原作」。第〇·六守則要的是**知道自己在推翻第 5 層**。
     */
    why: z.string().min(8).max(400),
  })
  .strict()
  .refine(
    (r) => !!(r.family ?? r.scale ?? r.tint ?? r.flyHeight ?? r.anchor),
    "⛔ 只寫 `why` 的覆寫逐位元等於不存在（第一·五守則）—— 至少要覆寫 family／scale／tint／flyHeight／anchor 其中一格",
  );
export type VfxOwnerBinding = z.infer<typeof zVfxOwnerBinding>;

const zVfxAbilityArtRow = z
  .object({
    prim: zVfxPrimBinding.optional(),
    family: zVfxFamilyBinding.optional(),
    /** GH#431 —— owner 的設計覆寫，蓋在 `family` 那一格上面（證據原封保留） */
    owner: zVfxOwnerBinding.optional(),
    promoted: zVfxPromotedBinding.optional(),
  })
  .strict();
export type VfxAbilityArtRow = z.infer<typeof zVfxAbilityArtRow>;

export const zConfigVfxAbilityArtDoc = z
  .object({
    id: zId,
    schema: z.literal("config.vfx-ability-art@1"),
    /**
     * 技能文件 id → 這一支的四層綁定。
     *
     * ⚠️ 一列四格全空是沒有意義的，所以至少要有一格；空的那一列會讓這支技能
     * **完全沒有特效**，而那正是這份文件要消滅的那種安靜失敗。
     */
    bindings: z.record(
      zVfxAbilityArtRow.refine(
        (r) => !!(r.prim ?? r.family ?? r.owner ?? r.promoted),
        "一列至少要有 prim / family / owner / promoted 其中一格",
      ),
    ),
  })
  .strict();
export type ConfigVfxAbilityArtDoc = z.infer<typeof zConfigVfxAbilityArtDoc>;
