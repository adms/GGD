/**
 * ChampionView — the DEFAULT visual is a PROCEDURAL Minecraft-like voxel
 * figure built from Babylon boxes (head / torso / 2 arms / 2 legs, classic
 * 8:12:4 proportions), team-tinted, animated by deterministically swinging
 * the limb boxes. When a model doc exists for the modelKey, the AssetManager
 * loads its .glb (KayKit rigged character) and swaps it in: a ClipAnimator
 * then drives the real AnimationGroups via the doc's clipMap — the
 * procedural figure remains the instant fallback (client-06). Every champion
 * also gets a team-colored ground ring + blob shadow (KayKit models are not
 * team-tinted; the ring is the team read).
 */
import type { Scene } from "@babylonjs/core/scene";
// SIDE EFFECT, LOAD-BEARING: `mesh.renderOverlay` (the hit-flash channel used by
// applyFlash below) does not exist until this module installs the accessor on
// Mesh.prototype and registers the OutlineRenderer scene component that draws
// the overlay pass. Without it every flash wrote an inert expando and NOTHING
// was ever rendered — verified against the client's exact babylon module set.
import "@babylonjs/core/Rendering/outlineRenderer";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector4 } from "@babylonjs/core/Maths/math.vector";
import type { ModelDoc } from "@ggd/shared/content";
import {
  faceUVQuads,
  motifFaceUVQuads,
  type VoxelSkinRecipe,
} from "@ggd/shared/content/voxelSkin";
import { acquireVoxelSkinTexture, releaseVoxelSkinTexture } from "./voxelSkinTexture";
import { AnimationStateMachine, type AnimState, type AnimPulse } from "../anim/AnimationStateMachine";
import { ClipAnimator } from "../ClipAnimator";
import type { AssetManager } from "../AssetManager";
import {
  facingToYaw,
  nlerpFacing,
  smoothingAlpha,
  TELEPORT_STEP_UNITS,
  type Facing2,
} from "../math/motion";
import { FLASH_ALPHA, FLASH_MS, hitstopShiver } from "../combatFeedback";
import { dissolveFrame } from "../deathDissolve";
import { glbYawOffset } from "./glbFacing";
// GH#392 —— WC3 掛點字串 → glb 關節名。⛔ 純函式(沒有 Babylon),而且它是從
// 337 份出貨 glb 的普查推出來的六種命名慣例的**唯一**解析處。
import { resolveAttachment } from "../vfx/attachment";
import { TARGET_HEIGHT, normalizedModelScale } from "./modelSizing";
import { ENABLED_ONLY, applyHiddenPrimitives } from "./hiddenPrimitives";
import { isStandinBodyGlb } from "@ggd/shared/content/standinScale";
// GH#572 —— 飛行影子的那條曲線只有一個住處（見 `sim/flight.ts`）。
import { flightShadowResponse } from "@ggd/shared/sim/flight";
import {
  attackStrikeFractionFor,
  castFollowThroughMs,
  castStrikeFractionFor,
} from "../anim/castStrike";
import { ARCHETYPE_BY_MODEL_KEY, fallbackAccentFor, type VoxelLook } from "./voxelLook";
import {
  applyVoxelLook,
  releaseVoxelLook,
  voxelLookAppliesToGlb,
  type VoxelLookHandle,
} from "./voxelSkin";
import {
  GROWTH_RING_FADE_MS,
  GROWTH_SCALE_EASE_MS,
  GROWTH_TIER_SCALE,
  type GrowthTier,
} from "./growthTier";

/**
 * Yaw turn rate (per second) for visual rotation smoothing. The rendered model
 * eases toward the authoritative facing instead of snapping. ~14/s ≈ a 70 ms
 * time constant — quick enough to feel responsive, slow enough to read as a
 * turn. Exposed so it can be tuned (or hooked to settings) in one place.
 */
export const YAW_SMOOTH_RATE = 14;

/** Team palette (team 0..3). */
export const TEAM_COLORS: readonly [number, number, number][] = [
  [0.25, 0.45, 0.95], // blue
  [0.92, 0.28, 0.25], // red
  [0.28, 0.8, 0.42], // green
  [0.95, 0.78, 0.22], // gold
];

/**
 * Accent colour of the PROCEDURAL fallback figure.
 *
 * This used to be a two-entry table keyed by modelKey, which could not do the
 * job it looked like it was doing: a modelKey is shared by up to 18 champions
 * and only two of the four stand-ins were even listed, so 42 heroes rendered
 * the same grey. Since #226 the colour is derived from the CHAMPION id through
 * the same seed the baked mesh's palette uses (`voxelLook`), so the fallback
 * and the .glb are the same character in the same colours — a champion does
 * not change appearance the moment its model finishes loading.
 *
 * `championId` is null until the composition root resolves the seat (and for
 * mobs, which have no champion), in which case this returns the neutral grey
 * it always did.
 */
function accentFor(modelKey: string, championId: string | null): [number, number, number] {
  return fallbackAccentFor(championId, ARCHETYPE_BY_MODEL_KEY[modelKey] ?? "mage");
}

const PX = 1.8 / 32; // 32 voxel-pixels tall → 1.8 world units

/** `[u1,v1,u2,v2]` quads → Babylon's `faceUV` array. */
const toFaceUV = (quads: number[][]): Vector4[] =>
  quads.map((q) => new Vector4(q[0] as number, q[1] as number, q[2] as number, q[3] as number));

/**
 * MOTIF GEOMETRY (task #231). Each entry is the boxes one motif adds, in voxel
 * pixels relative to `bodyRoot`: `[w, h, d, x, y, z]`. FRONT is +Z (see
 * `facingToYaw`), so a cape sits at negative Z.
 *
 * Kept to 1–2 small boxes per slot on purpose — the whole reason #226 exists is
 * that the old champions were too heavy, and a silhouette that accumulates
 * accessories stops being a silhouette. `mask` is deliberately absent: it is
 * painted into the face texture and costs no geometry at all.
 */
const MOTIF_GEOMETRY: Readonly<Record<string, readonly (readonly number[])[]>> = Object.freeze({
  // head (head box is 8³ centred at y = 28)
  hood: [[9, 5, 9, 0, 31, 0]],
  horns: [
    [2, 4, 2, -3, 34, 0],
    [2, 4, 2, 3, 34, 0],
  ],
  "beast-ears": [
    [2, 3, 1, -3, 34, 0],
    [2, 3, 1, 3, 34, 0],
  ],
  "brim-hat": [[12, 1, 12, 0, 32.5, 0]],
  crown: [[9, 2, 9, 0, 33, 0]],
  halo: [[8, 1, 8, 0, 37, 0]],
  antenna: [[1, 5, 1, 0, 35, 0]],
  headband: [[9, 2, 9, 0, 30.5, 0]],
  // shoulder (arm pivots sit at y = 24, x = ±6)
  pauldrons: [
    [4, 2, 5, -6, 24.5, 0],
    [4, 2, 5, 6, 24.5, 0],
  ],
  spikes: [
    [2, 4, 2, -5, 26, 0],
    [2, 4, 2, 5, 26, 0],
  ],
  epaulets: [
    [5, 1, 5, -6, 24, 0],
    [5, 1, 5, 6, 24, 0],
  ],
  shawl: [[10, 3, 5, 0, 23, 0]],
  // back (torso is 8w × 12h × 4d centred at y = 18)
  cape: [[8, 12, 1, 0, 18, -2.6]],
  "scarf-tail": [[2, 8, 1, 0, 20, -2.6]],
  tail: [[2, 2, 6, 0, 13, -4]],
  backpack: [[6, 6, 3, 0, 19, -3.6]],
  "wing-stubs": [
    [3, 5, 1, -3, 21, -2.6],
    [3, 5, 1, 3, 21, -2.6],
  ],
});

/** `#rrggbb` → the 0..1 triple a `Color3` wants. */
function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Options bag for the view — additive, so the 4-arg call sites still compile. */
export interface ChampionViewOptions {
  /**
   * The champion's generated voxel skin (task #231). Absent/null keeps the
   * pre-#231 flat team-coloured figure EXACTLY as it was, which is what lets
   * every existing caller and test stay untouched.
   */
  skin?: VoxelSkinRecipe | null;
}

/**
 * HEIGHT-NORMALIZATION target (task #150) — re-exported so the ~12 modules that
 * already import it from here keep working. ⚠️ The DEFINITION moved to
 * `./modelSizing` (GH#368) together with the normalization arithmetic, because
 * the arena was one of FOUR scenes that mount a champion mesh and the only one
 * doing the sum. Read that file's header for why an `if` in StorePreview was
 * the wrong shape of fix.
 */
export { TARGET_HEIGHT };

/**
 * #249 GH#288 — 變身球體掛件,解析成渲染層看得懂的樣子。
 *
 * 和 `@ggd/shared/content` 的 `FormAttachment` 差在 `glbPath`:那邊記的是
 * models/ 的文件 id(`imported.goku3head`),要先過 ContentDb 才變成路徑。
 * 這個轉換發生在合成根(GameApp),因為 render/** 不查內容註冊表。
 */
export interface FormAttachmentSpec {
  /** content 相對路徑,例如 `assets/models/imported/goku3head.glb` */
  readonly glbPath: string;
  /** `"origin"` = 模型原點(w3x 對這兩顆球體記的值);其他值當骨頭名。 */
  readonly bone: string;
  readonly scale: number;
  readonly offsetY: number;
  /**
   * GH#392 —— `true`(省略 = true)= 掛在關節底下,**每幀跟著那根骨頭的世界矩陣走**。
   * `false` = 生成當下取一次骨頭的世界座標,之後留在原地。
   *
   * ⚠️ 這一格不是裝飾:「只做到附著、沒做到跟隨」的畫面**第一幀完全正確**,
   * 角色走一步才看得出球留在原地(失敗形態②)。
   */
  readonly follow?: boolean;
  /**
   * GH#392 —— 要播掛件**自己**的哪一條動畫軌(glb `AnimationGroup` 的名字)。
   * `null`/省略 = 播它全部的軌(出貨的三顆掛件各只有一條 `Stand`)。
   */
  readonly anim?: string | null;
  /** 動畫循環。省略 = true。 */
  readonly animLoop?: boolean;
}

/**
 * One skeleton `instantiateModelsToScene` cloned for THIS view.
 *
 * Structural rather than `import { Skeleton }`: `applyVoxelLook` already reads
 * these through the same duck type (`voxelSkin.SkeletonLike`), and the only
 * other thing this file does with them is free them (#223). Importing the real
 * class would pull Babylon's Bones module in for two property names.
 */
interface InstanceSkeleton {
  bones: { name: string }[];
  dispose?(): void;
}

/**
 * GH#392 —— 掛件自己的動畫軌(`instantiateModelsToScene` 複製出來的
 * `AnimationGroup`)。鴨子型別的理由和 {@link InstanceSkeleton} 一樣:守衛用的
 * stub 不必是真的 Babylon 物件。⚠️ `play` 是 optional **只**為了 stub ——
 * 每一個真的 `AnimationGroup` 都有。
 */
interface AttachmentAnimGroup {
  name: string;
  play?(loop?: boolean): void;
  dispose(): void;
}

/**
 * GH#392 —— 從複製出來的動畫軌裡挑出名字叫 `want` 的那幾條。
 *
 * 先逐字、再字尾 —— 和 `findBoneNode`/`formAttachHost` **同一個慣例**，理由也一樣：
 * Babylon 的 `instantiateModelsToScene` 會把每一條軌重新命名成
 * `<entityId>-form-<原名>`，所以逐字比對永遠 0 命中。
 * ⛔ 一條都對不上就回空陣列 —— **不退回第一條**：猜一條播出來的東西，
 * 和「這份內容填錯了」在畫面上分不出來。
 */
function pickByName(
  groups: readonly AttachmentAnimGroup[],
  want: string,
): AttachmentAnimGroup[] {
  const exact = groups.filter((g) => g.name === want);
  return exact.length > 0 ? exact : groups.filter((g) => g.name.endsWith(want));
}

/**
 * How opaque this mesh actually DRAWS right now — `material.alpha × visibility`.
 *
 * ---------------------------------------------------------------------------
 * GH#226 / GH#227 —— 為什麼閃光必須先問這個
 * ---------------------------------------------------------------------------
 * `renderOverlay` 不是走材質的 shader，它走 Babylon 的 `OutlineRenderer`：
 *
 *     effect.setColor4("color", mesh.overlayColor, mesh.overlayAlpha);
 *
 * —— 顏色和不透明度**完全來自 mesh 上的兩個欄位**，材質的 `alpha` 與 mesh 的
 * `visibility` 一個都不看（只有 `alphaMode: MASK` 的 alpha *test* 會被帶進去）。
 * 所以一個「材質 alpha = 0、畫面上根本看不到」的網格，只要被推進 `flashMeshes`，
 * 一挨打就會變成一片**實心的純色多邊形**。
 *
 * 這正是 owner 看到的兩個 bug，同一個根因：
 *   • GH#226 藤井八雲 (`godie-hpal` → `Hpal.glb` / IllidanEvil)：那顆 glb 帶著
 *     10 個 `baseColorFactor:[0,0,0,0]` 的 WC3 TeamGlow 佔位面，其中兩個是**貼在
 *     腳底的水平方片** —— 2.109×2.109 @ y=0.066 與 1.991×1.991 @ y=0.108。
 *     正規化到 1.8u 之後大約是 2 公尺見方，於是每一次挨魔法傷害就在腳底閃一張
 *     「巨型矩形紅色」。
 *   • GH#227 臭作 (`godie-orkn` → `Orkn.glb` / HeroShadowHunter)：同樣的東西只有
 *     一片，`TeamGlow3` 0.105×0.564×1.759 @ y=0.406 —— 位置就在**武器**上，
 *     於是物理攻擊的白色閃光把它畫成「武器上的白色遮罩」。
 *
 * 普查（`tools`-free，直接讀 glTF：見 championFlashInvisibleMesh.test.ts 的
 * 檔頭）：287 個 glb 裡有 76 個帶著這種面，共 166 片，其中 18 個是英雄身體。
 * 所以這不是兩隻英雄的個案，是整個 mdx→glb 轉檔管線的系統性殘留。
 *
 * ⚠️ 這裡**不刪那些面**：幾何在 `content/`（別條 lane 的領域），而且刪錯就少一塊
 * 身體。渲染層能負責的是「不要在畫不出東西的網格上蓋一層閃光」，而那個判斷讀的
 * 必須是 mesh 現在**真的掛著**的材質 —— `applyModelTint` 會 clone 材質再指回
 * `mesh.material`（見 modelTint.ts 的 MATERIAL OWNERSHIP 段），所以只能在閃光的
 * 那一刻現查，不能在 push 進 `flashMeshes` 的時候先算好。
 */
function drawnOpacityOf(mesh: AbstractMesh): number {
  const mat = mesh.material as { alpha?: number } | null;
  const matAlpha = typeof mat?.alpha === "number" ? mat.alpha : 1;
  const vis = typeof mesh.visibility === "number" ? mesh.visibility : 1;
  return Math.max(0, Math.min(1, matAlpha)) * Math.max(0, Math.min(1, vis));
}

export class ChampionView {
  readonly root: TransformNode;
  readonly anim = new AnimationStateMachine();

  private readonly bodyRoot: TransformNode;
  private readonly head: Mesh;
  private readonly torso: Mesh;
  private readonly armL: TransformNode;
  private readonly armR: TransformNode;
  private readonly legL: TransformNode;
  private readonly legR: TransformNode;
  private readonly proceduralParts: Mesh[] = [];
  /** meshes tinted by the hit flash (procedural parts + any loaded .glb meshes). */
  private readonly flashMeshes: AbstractMesh[] = [];
  /**
   * Materials THIS VIEW CREATED — the only ones `dispose()` may destroy. A .glb
   * mesh's material belongs to the AssetManager's container cache, not to us.
   */
  private readonly ownedMaterials: StandardMaterial[] = [];
  private readonly teamRing: Mesh;
  private readonly blobShadow: Mesh;
  /**
   * GH#647 —— force-off latch for the blob shadow(普通殭屍不畫影子省效能)。
   * true 時每一個會把影子打開的 writer 都變成 no-op;false 時影子交還給
   * 既有 writer(死亡/隱形/飛行),下一幀 `update()` 自己會把它畫回來。
   */
  private shadowSuppressed = false;
  /** The generated voxel skin this figure was built with (task #231), if any. */
  private readonly skin: VoxelSkinRecipe | null = null;
  /** championId whose cached atlas this view holds a reference to (or null). */
  private atlasChampionId: string | null = null;

  private clipAnimator: ClipAnimator | null = null;
  private glbRoot: TransformNode | null = null;
  /**
   * #249 GH#288 —— 變身球體掛件(悟空的超三頭)。
   *
   * ⚠️ 為什麼是執行期掛,不是烘進 glb:`godie-ogrh` 與 `godie-o00x` 共用
   * `imported.goku`,而 `Gokuhead.mdx` 已經在 #267 被烘進去了。再烘一顆
   * `Goku3head.mdx` 進同一個檔 ⇒ **基本型悟空也會長出超三的頭**。
   *
   * 生命週期綁在這個 view 上,而不是綁在某個 map:變身時
   * `EntityViewRegistry` 會整個丟掉 view 重建(見那邊的 IDENTITY 註解),
   * 所以「變回本體 = 掛件消失」是靠 `dispose()`,不需要任何解除邏輯。
   */
  private formAttachRoot: TransformNode | null = null;
  /**
   * GH#392 —— **每一份**掛件的根(`points[]` 一格一份;owner 的「雙手」= 兩份)。
   *
   * ⚠️ `formAttachRoot` 只記第一份,而它有既有的讀者(冪等閂)。這一張清單才是
   * 釋放用的:`follow: false` 的那一份 **parent 是 null**,所以
   * `this.root.dispose()` 一輩子碰不到它 —— 少了這一行就是每次變身漏一棵樹。
   */
  private formAttachParts: TransformNode[] = [];
  /** 掛件複製出來的 AnimationGroup —— 它們不是節點,`root.dispose()` 碰不到。 */
  private formAttachGroups: { dispose(): void }[] = [];
  /**
   * 掛件複製出來的 Skeleton —— 和 AnimationGroup 同一個道理,**不是節點**。
   * 見 `glbSkeletons` 的註解:`root.dispose()` 一個都不會碰到。
   */
  private formAttachSkeletons: InstanceSkeleton[] = [];
  /** 一次性閂:掛件的非同步載入只發起一次(和 `upgradeStarted` 同樣的道理)。 */
  private formAttachStarted = false;
  /** procedural-fallback materials this view repaints from the champion's seed. */
  private skinMat!: StandardMaterial;
  private accentMat!: StandardMaterial;
  /** per-champion blocky look (#226), or null until the seat resolves. */
  private voxelLook: VoxelLook | null = null;
  /**
   * The cloned material + generated palette texture `applyVoxelLook` created.
   * Tracked SEPARATELY from `ownedMaterials` because those are the procedural
   * figure's StandardMaterials; this one is a clone of the .glb's shared PBR
   * material and must be freed without ever touching the shared original.
   */
  private voxelHandle: VoxelLookHandle | null = null;
  /**
   * glbPath of the ADOPTED .glb, or null while the procedural figure stands in.
   *
   * GH#31 —— 這不等於 `modelKey`。替身英雄的 modelKey 一直是那四個共用替身之一
   * (那正是 blizzardOverlay 認出他們的方式),但真正載進來的可能是他自己的
   * Warcraft III 模型。體素調色盤只對「生成的方塊人」成立,所以判斷必須看
   * 實際載入的 glb,不能看 modelKey。
   */
  private adoptedGlbPath: string | null = null;
  /** 🧹 GH#819 —— 回合間盤點要問「這一具真的穿著哪份 glb」（null＝還是替身）。 */
  get adoptedGlb(): string | null {
    return this.adoptedGlbPath;
  }
  /**
   * Skeletons of THIS instance (from `instantiateModelsToScene`) — read by the
   * #226 look, and OWNED by this view.
   *
   * ⚠️ #223 —— A CLONED SKELETON IS NOT A NODE. `instantiateModelsToScene`
   * registers one clone per instantiation in `scene.skeletons`, and
   * `root.dispose()` walks NODES only, so it never touches them — exactly the
   * hazard `ClipAnimator.dispose` documents for AnimationGroups. Before #223
   * nothing freed them, and a Babylon `Skeleton` is not a bookkeeping struct:
   * it owns a bone-matrix texture on the GPU (`_transformMatrixTexture`) that
   * dies with it and only with it.
   *
   * WHY #249 TURNED A SLOW LEAK INTO A FAST ONE. Before the 變身 rebuild a
   * ChampionView was built ONCE per entity id, so one orphan skeleton per
   * despawn. Since #249 the registry THROWS THE WHOLE VIEW AWAY on every form
   * change (see EntityViewRegistry's 變身 BODY SWAP comment), so 拳四郎
   * toggling in and out of 北斗之鼠 mints a fresh orphan every 8 seconds.
   * Measured on a real swap loop: `scene.skeletons` 1 → 2 → 8 across 8 body
   * builds, and `registry.dispose()` left every one of them behind.
   */
  private glbSkeletons: InstanceSkeleton[] = [];
  /** The render scale actually applied to the adopted .glb — the height-normalized
   *  factor × the per-champion relative multiplier (task #150; #77 declared scale). */
  private declaredScaleValue: number | null = null;
  /**
   * TASK #77 —— 「回退到替身時該多大」,寫在 `bodyRoot` 上。
   *
   * `declaredScaleValue` 只在真的採用了一具 .glb 之後才存在。程序生成的體素
   * 身體是**另一條路**,而且是三條回退路徑的共同終點:overlay 沒開 / manifest
   * 沒有這一位 / `preferVoxelBody`(後台可切)。在此之前這條路上**完全沒有人
   * 讀 relativeScale** —— `tryUpgradeToGlb` 在 preferVoxelBody 那一行就 return
   * 了,`applyGrowthScale` 只寫 `bodyRoot.scaling.setAll(growthFactor)`。於是
   * 30-002 變態紳士(地圖 usca 3.00)的整個 3× 變身梗在體素身體上是 1.0,
   * 而且所有測試全綠(失敗形態 ②:算出來了但從沒送到畫面上)。
   *
   * 值來自 `standinRelativeScaleOf`,不是 `relativeScale` —— 替身正規化之後
   * 「整個輪廓就是身體」,所以要的是地圖的 usca,不是 WC3 模型的身高比。
   */
  private standinScaleValue = 1;
  /**
   * TASK #247 airborne state.
   *
   * `groundOffsetY` is the model's foot offset in the ALREADY-SCALED frame —
   * the `position.y = -min.y` shift `tryUpgradeToGlb` computes — kept so that
   * `applyAirborne` can rewrite `glbRoot.position.y` every frame (fly height +
   * offset) without re-measuring the bounding box.
   *
   * (#247 also shipped a `scaleMul` here, fed by the wire's `sc` percent. The
   * sim never wrote anything but 1, so the whole lane was removed as dead — see
   * protocol/schema.ts. Nothing in this file scales `glbRoot` any more, which is
   * what keeps #150's normalised size untouchable by an ability.)
   */
  private groundOffsetY = 0;
  /** interpolated fly height in GGD units (0 = grounded). */
  private leapY = 0;
  /** ENTITY_FLAG.AIRBORNE this frame — true on the takeoff/landing ticks too. */
  private airborne = false;
  private upgradeStarted = false;
  private walkPhase = 0;
  private lastPose = { x: 0, z: 0 };
  private deathT = 0;
  /** hit flash (white physical/true, red magic) — brief emissive-style overlay. */
  private flashUntilMs = 0;
  private flashRgb: [number, number, number] = [1, 1, 1];
  /** per-flash overlay strength (0..1) — tier-driven, defaults to FLASH_ALPHA. */
  private flashAlpha = FLASH_ALPHA;
  private flashActive = false;
  /** hitstop: freeze this model's animation until this time (sim-synced). */
  private hitstopUntilMs = 0;
  /** follow-through span of the in-flight cast (set by `beginCast`). */
  private castTailMs = 0;
  /** true while the body is offset by the hitstop micro-shiver (needs a reset). */
  private shiverActive = false;
  private disposed = false;
  /**
   * CORPSE DISSOLVE (playtest directive #220). `deathAtMs` is armed by the sim's
   * `death` EVENT (via `noteDeath`), never by `alive === false` — the flag is
   * also false in champ-select, through the whole intermission, for a bye/parked
   * seat and during settlement, and dissolving those bodies would delete every
   * champion on screen outside combat. Null = this body never died (so it never
   * dissolves, whatever its alive flag says).
   */
  private deathAtMs: number | null = null;
  /** true while a claimable revive circle exists for this body's seat (#84/#196). */
  private reviveProtected = false;
  /** true once the dissolve has written rise/visibility (so a reset is owed). */
  private dissolveDirty = false;
  /** true once the body is fully gone; cleared on the revive/respawn edge. */
  private vanishedFlag = false;

  // ---- 隱形 (owner 2026-07-30 「選小的就好」) ----
  /**
   * Opacity this body should draw at because of 隱形, 0..1. **1 = not hidden**,
   * which is every body in every match with no stealth hero.
   *
   * WHY A SEPARATE FIELD AND NOT A DIRECT `visibility` WRITE: the #220 corpse
   * dissolve is ALSO a `visibility` writer, and it early-outs during the
   * lie-down phase without writing at all. Two independent writers to one
   * channel is exactly how a body ends up permanently at whichever value ran
   * last. So stealth records its wish here and {@link applyStealth} — which runs
   * only for LIVING bodies, after the dissolve has had its say — is the single
   * place that touches the meshes.
   */
  private stealthAlpha = 1;
  /** the value actually written to the meshes (idempotence + reset bookkeeping). */
  private stealthApplied = 1;
  /** smoothed facing state (unit vectors); yaw eases cur→target every frame */
  private curFacing: Facing2 = { x: 0, z: 1 };
  private targetFacing: Facing2 = { x: 0, z: 1 };
  private facingInit = false;

  // ---- #268 「自己角色更顯眼」 ----
  /** true while this body is the LOCAL player's champion (registry-driven). */
  private selfMarkerOn = false;
  /** Lazily built the first time this view is told it is the local champion. */
  private selfRing: Mesh | null = null;
  private selfCaret: Mesh | null = null;

  // ---- #244 GROWTH TIER (黑泥吞噬) ----
  /** Tier the SERVER says this body is at (0/1/2), from two EntityState flag bits. */
  private growthTier: GrowthTier = 0;
  /** Tier the scale has actually been written for — the idempotence guard. */
  private growthApplied: GrowthTier = 0;
  /** A tier that arrived before the .glb landed, replayed at the end of the adopt. */
  private growthPending = false;
  /** Lazily built on the tier-2 edge; a persistent spreading black-mud ring. */
  private mudRing: Mesh | null = null;
  private mudRingMat: StandardMaterial | null = null;
  /** ms at which the current tier became active (drives the ease + the fade). */
  private growthSinceMs = 0;
  /** the scale factor currently written to the body (the eased value). */
  private growthFactor = 1;
  /** factor the running ease started from (so a mid-ease change never snaps). */
  private growthEaseFrom = 1;
  /** true once a factor has actually been written (first write is unconditional). */
  private growthFactorWritten = false;

  constructor(
    scene: Scene,
    readonly entityId: number,
    readonly modelKey: string,
    teamId: number,
    opts: ChampionViewOptions = {},
  ) {
    this.root = new TransformNode(`champ-${entityId}`, scene);
    this.bodyRoot = new TransformNode(`champ-${entityId}-body`, scene);
    this.bodyRoot.parent = this.root;

    const team = TEAM_COLORS[((teamId % 4) + 4) % 4]!;
    const skin = opts.skin ?? null;
    this.skin = skin;
    // #231 wins when a generated skin is present (its palette IS the champion's
    // look); otherwise #226's `accentFor` — the two-entry `ACCENTS` table it
    // replaced no longer exists, and it gives all 44 stand-in champions their
    // own colour instead of one shared grey.
    const accent = skin ? hexRgb(skin.palette.accent) : accentFor(modelKey, null);

    const mat = (name: string, rgb: [number, number, number]): StandardMaterial => {
      const m = new StandardMaterial(`champ-${entityId}-${name}`, scene);
      m.diffuseColor = new Color3(rgb[0], rgb[1], rgb[2]);
      m.specularColor = new Color3(0.05, 0.05, 0.05);
      this.ownedMaterials.push(m);
      return m;
    };
    // THE PAINTED ATLAS (#231). With a skin, `champ-<id>-skin` carries the
    // 64×64 texture and a WHITE diffuse, so Standard shading resolves to
    // `texture × diffuseColor` — which is exactly the slot the #49 vertex tint
    // multiplies into, so tint composes over the painted surface uniformly and
    // modelTint.ts needs no change at all. Without a skin the material keeps
    // its pre-#231 flat flesh colour.
    const skinMat = mat("skin", skin ? [1, 1, 1] : [0.87, 0.72, 0.58]);
    const atlas = skin ? acquireVoxelSkinTexture(scene, skin) : null;
    if (atlas) {
      skinMat.diffuseTexture = atlas;
      this.atlasChampionId = skin ? skin.championId : null;
    } else if (skin) {
      // texture upload refused (exotic engine): fall back to a flat outfit
      // colour rather than rendering a white figure.
      skinMat.diffuseColor = new Color3(...hexRgb(skin.palette.outfitPrimary));
    }
    const teamMat = mat("team", team);
    const accentMat = mat("accent", accent);
    // kept so `setVoxelLook` can repaint the fallback once the composition root
    // resolves this entity's championId (it is not known at construction).
    this.skinMat = skinMat;
    this.accentMat = accentMat;

    const box = (
      name: string,
      w: number,
      h: number,
      d: number,
      m: StandardMaterial,
      parent: TransformNode,
      y: number,
      extra?: { x?: number; z?: number; faceUV?: Vector4[] },
    ): Mesh => {
      const b = MeshBuilder.CreateBox(
        `champ-${entityId}-${name}`,
        {
          width: w * PX,
          height: h * PX,
          depth: d * PX,
          ...(extra?.faceUV ? { faceUV: extra.faceUV, wrap: true } : {}),
        },
        scene,
      );
      b.material = m;
      b.parent = parent;
      b.position.set((extra?.x ?? 0) * PX, y * PX, (extra?.z ?? 0) * PX);
      b.isPickable = false;
      this.proceduralParts.push(b);
      this.flashMeshes.push(b); // procedural parts flash by default
      return b;
    };

    // UV quads for each part, or undefined when this champion has no skin (the
    // box then keeps Babylon's default whole-texture UVs on a flat material).
    const uv = (part: "head" | "torso" | "armL" | "armR" | "legs"): Vector4[] | undefined =>
      skin ? toFaceUV(faceUVQuads(part)) : undefined;

    // Minecraft proportions (voxel px): legs 12, torso 12, head 8 → 32 tall.
    // WITH a skin the torso and legs wear the painted atlas; WITHOUT one they
    // stay flat team colour, which is the pre-#231 team read.
    const bodyMat = skin ? skinMat : teamMat;
    this.torso = box("torso", 8, 12, 4, bodyMat, this.bodyRoot, 18, { faceUV: uv("torso") });
    this.head = box("head", 8, 8, 8, skinMat, this.bodyRoot, 28, { faceUV: uv("head") });

    // limbs pivot at their attachment point (shoulder/hip)
    const limb = (
      name: string,
      m: StandardMaterial,
      px: number,
      pivotY: number,
      faceUV?: Vector4[],
    ): TransformNode => {
      const pivot = new TransformNode(`champ-${entityId}-${name}-pivot`, scene);
      pivot.parent = this.bodyRoot;
      pivot.position.set(px * PX, pivotY * PX, 0);
      box(name, 4, 12, 4, m, pivot as TransformNode, -6, { faceUV });
      return pivot;
    };
    const limbMat = skin ? skinMat : accentMat;
    const legMat = skin ? skinMat : teamMat;
    this.armL = limb("armL", limbMat, -6, 24, uv("armL"));
    this.armR = limb("armR", limbMat, 6, 24, uv("armR"));
    this.legL = limb("legL", legMat, -2, 12, uv("legs"));
    this.legR = limb("legR", legMat, 2, 12, uv("legs"));

    if (skin) {
      // ---- TEAM BAND (#231 team composition) ----------------------------
      // The skin repaints the torso and both legs, which used to BE the team
      // read. It is replaced by a dedicated chest band in the flat team colour
      // plus the emissive ring below — and `-teamband` is in
      // modelTint.UNTINTED_MESH_SUFFIXES so a dark #49 tint cannot crush the
      // stripe to unreadable, the same protection the ring already has.
      // The material keeps the name `champ-<id>-team`; only what it paints moved.
      box("teamband", 8.6, 3, 4.6, teamMat, this.bodyRoot, 21);

      // ---- MOTIFS (≤6 boxes, budget-enforced by the generator) -----------
      // Created through `box()` on purpose: that is what puts them in BOTH
      // `proceduralParts` (so they hide when a glb is adopted) AND
      // `flashMeshes` (so #64's hit flash paints them).
      const motifSlots: [string, number][] = [
        [skin.motifs.head, 0],
        [skin.motifs.shoulder, 1],
        [skin.motifs.back, 2],
      ];
      for (const [motif, cell] of motifSlots) {
        const boxes = MOTIF_GEOMETRY[motif];
        if (!boxes) continue; // "none", or a texture-only motif such as `mask`
        const faceUV = atlas ? toFaceUV(motifFaceUVQuads(cell)) : undefined;
        boxes.forEach((b, i) => {
          box(
            `motif-${motif}-${i}`,
            b[0] as number,
            b[1] as number,
            b[2] as number,
            skinMat,
            this.bodyRoot,
            b[4] as number,
            { x: b[3] as number, z: b[5] as number, faceUV },
          );
        });
      }
    }

    // ---- team identity ring + blob shadow (independent of model source) ----
    const ringMat = new StandardMaterial(`champ-${entityId}-ring`, scene);
    ringMat.emissiveColor = new Color3(team[0], team[1], team[2]);
    ringMat.disableLighting = true;
    ringMat.alpha = 0.85;
    this.ownedMaterials.push(ringMat);
    this.teamRing = MeshBuilder.CreateTorus(
      `champ-${entityId}-teamring`,
      // #247: the literal moved to `TEAM_RING_DIAMETER` so `setGroundRingDiameter`
      // and this call site cannot disagree about what 1× means.
      { diameter: ChampionView.TEAM_RING_DIAMETER, thickness: 0.07, tessellation: 40 },
      scene,
    );
    this.teamRing.material = ringMat;
    this.teamRing.parent = this.root;
    this.teamRing.position.y = 0.04;
    this.teamRing.isPickable = false;

    const shadowMat = new StandardMaterial(`champ-${entityId}-blob`, scene);
    shadowMat.diffuseColor = new Color3(0, 0, 0);
    shadowMat.emissiveColor = new Color3(0, 0, 0);
    shadowMat.specularColor = new Color3(0, 0, 0);
    shadowMat.alpha = 0.38;
    this.ownedMaterials.push(shadowMat);
    this.blobShadow = MeshBuilder.CreateDisc(
      `champ-${entityId}-shadow`,
      { radius: 0.52, tessellation: 24 },
      scene,
    );
    this.blobShadow.material = shadowMat;
    this.blobShadow.parent = this.root;
    this.blobShadow.rotation.x = Math.PI / 2;
    this.blobShadow.position.y = 0.03;
    this.blobShadow.isPickable = false;
  }

  /**
   * Adopt this champion's per-champion blocky look (#226).
   *
   * Called by `EntityViewRegistry` as soon as the composition root can resolve
   * the entity → championId hop, which is NOT at construction time (render/**
   * is walled off from the seat table, client-08). Idempotent and cheap: the
   * first non-null look wins and later calls are ignored, so it is safe to call
   * every frame while the seat is still resolving.
   *
   * Applying it repaints the PROCEDURAL fallback immediately; the .glb half is
   * applied in `tryUpgradeToGlb` once the mesh actually lands (and this may run
   * either before or after that, so both sides check).
   */
  setVoxelLook(look: VoxelLook | null | undefined): void {
    if (!look || this.voxelLook || this.disposed) return;
    this.voxelLook = look;
    const [sr, sg, sb] = look.palette[0];
    this.skinMat.diffuseColor.set(sr, sg, sb);
    const [ar, ag, ab] = look.palette[3];
    this.accentMat.diffuseColor.set(ar, ag, ab);
    // the .glb may already be adopted (look arrived late) — paint it now
    this.applyVoxelLookToGlb();
  }

  /**
   * Paint + reshape the adopted .glb from the champion's look. Runs BEFORE
   * `applyModelTint` (#49) in every ordering: the registry only tints once
   * `view.hasGlb` is true, and `hasGlb` is set at the very end of the adopt
   * path, after this. That order matters — the tint MULTIPLIES `albedoColor`,
   * which this leaves white, so tint × palette composes as documented.
   *
   * GH#31 —— 只有「生成的方塊人」才會被上色。`voxelLookAppliesToGlb` 擋掉的是
   * 暴雪原始模型:它自己帶著 albedoTexture,調色盤蓋上去等於把 Warcraft III
   * 的貼圖丟掉、再用一組完全對不上的 UV 去採 8 個色塊。#49 的 tint 也會因此
   * 變成「乘在調色盤上」而不是「乘在原始貼圖上」—— 海克力斯的黑紅就此消失。
   */
  private applyVoxelLookToGlb(): void {
    if (!this.voxelLook || !this.glbRoot || this.voxelHandle) return;
    if (!voxelLookAppliesToGlb(this.adoptedGlbPath)) return;
    this.voxelHandle = applyVoxelLook(
      this.glbRoot.getChildMeshes(false),
      // THIS INSTANCE's skeletons, captured from `instantiateModelsToScene` —
      // never `scene.skeletons`, which holds every other champion's too.
      this.glbSkeletons,
      this.voxelLook,
      this.root.getScene(),
      `champ-${this.entityId}-voxel`,
    );
  }

  /** The tier the SIZE is currently written for (test/diagnostics seam). */
  get appliedGrowthTier(): GrowthTier {
    return this.growthApplied;
  }

  /**
   * The diameter the team ring is currently drawn at, in GGD units — the number
   * a test must read to know whether 「圈圈變大了」 really happened. Derived from
   * the mesh's LIVE scaling, not from a remembered input, so an assertion cannot
   * pass while the torus stayed the size it was built at (失敗形態 ⑦: asserting
   * the property instead of the behaviour).
   */
  get groundRingDiameter(): number {
    return ChampionView.TEAM_RING_DIAMETER * this.teamRing.scaling.x;
  }

  /**
   * The team ring's live scaling vector (test/diagnostics seam). Exists so a
   * guard can assert the Y AXIS IS UNTOUCHED — the whole difference between a
   * wide ground ring and a tall doughnut, which `groundRingDiameter` alone
   * cannot see.
   */
  get teamRingScaling(): { x: number; y: number; z: number } {
    const s = this.teamRing.scaling;
    return { x: s.x, y: s.y, z: s.z };
  }

  /** The diameter `CreateTorus` builds the team ring at — the 1× reference. */
  static readonly TEAM_RING_DIAMETER = 1.25;

  /**
   * #247 —— resize the ground ring (owner 2026-08-01 「殭屍王底下圈圈會比較大，
   * 但不影響無碰撞」). `null` restores the built-in champion diameter.
   *
   * SCALED ON X/Z ONLY. The torus lies in the XZ plane, so leaving Y at 1 keeps
   * the tube's VERTICAL thickness constant — a 10× ring stays a ring lying on
   * the floor instead of becoming a 10×-tall doughnut standing around the king's
   * knees. `setAll` here would be the bug this comment exists to prevent.
   *
   * ⚠️ NOT `root`, and NOT `blobShadow`. `root` carries the body; scaling it
   * would resize the king. The shadow is `setGrowthTier`'s (#244) and having two
   * writers on one node is how a mud-tier swell silently reverts a ring change.
   * NOTHING here touches a collision radius — the client has none to touch.
   */
  /**
   * GH#647 —— 普通殭屍的腳下影子壓掉(owner:「普通殭屍不必畫血條跟陰影
   * 節省效能」)。誰該壓由 `views/mobShadow.mobShadowSuppressedFor` 決定,
   * registry 每次 sync 都寫(這裡 early-return,所以每幀成本是一個布林比較)。
   * 解除壓制時不在這裡打開 —— `update()` 的既有 writer(死亡/隱形判斷)下一幀
   * 會把它接回去,這樣「該不該亮」永遠只有一組 writer,不會打架。
   */
  setShadowSuppressed(off: boolean): void {
    if (this.disposed || off === this.shadowSuppressed) return;
    this.shadowSuppressed = off;
    if (off) this.blobShadow.setEnabled(false);
  }

  setGroundRingDiameter(diameter: number | null): void {
    if (this.disposed) return;
    const d = diameter === null || !Number.isFinite(diameter) || diameter <= 0
      ? ChampionView.TEAM_RING_DIAMETER
      : diameter;
    const f = d / ChampionView.TEAM_RING_DIAMETER;
    if (Math.abs(f - this.teamRing.scaling.x) < 1e-4) return;
    this.teamRing.scaling.x = f;
    this.teamRing.scaling.z = f;
  }

  /** True once the tier-2 black-mud foot ring exists (test/diagnostics seam). */
  get hasMudRing(): boolean {
    return this.mudRing !== null;
  }

  /**
   * GROWTH TIER (task #244) — the SIZE half of 黑泥吞噬. Called by the registry
   * every sync from two `EntityState.flags` bits; idempotent and early-returns
   * when the tier has not moved, so the per-frame cost is one integer compare.
   *
   * WHAT IT SCALES, AND WHAT IT DELIBERATELY DOES NOT.
   *   • `bodyRoot` (the procedural figure) and `glbRoot` (the adopted mesh) —
   *     the champion's ART, which is the whole point.
   *   • `blobShadow` — a bigger thing casts a bigger shadow, and from a fixed
   *     camera the shadow is most of what sells the size read.
   *   • NOT `root`: the shadow and the team ring hang off it. And NOT
   *     `teamRing`, ever. That torus is a UI affordance that must be the same
   *     size on every champion or team identity stops being legible — #231
   *     already flags team colour as the highest-risk surface of this work.
   *
   * THE GROUND SHIFT IS THE EASY THING TO GET WRONG. `tryUpgradeToGlb` sets
   * `glbRoot.position.y = -min.y` measured in the OLD scaled frame. Scaling to
   * 1.25× without re-measuring sinks a quarter of the body through the floor,
   * so the shift is recomputed here every time the scale changes.
   *
   * #150 is NOT re-opened: that contract is about the DECLARED per-champion size
   * baked at load time. This is a live combat-state modifier — the same category
   * as a size buff — and it composes ON TOP of the normalization (always off the
   * STORED `declaredScaleValue`, never off the current scaling, or the multiply
   * would compound every call).
   */
  setGrowthTier(tier: GrowthTier, nowMs = 0): void {
    if (this.disposed) return;
    if (tier === this.growthApplied && !this.growthPending) return;
    if (tier !== this.growthTier) {
      this.growthTier = tier;
      // ease FROM whatever factor is on screen right now, so a tier change
      // mid-ease continues smoothly instead of snapping back to the old base
      this.growthEaseFrom = this.growthFactor;
      this.growthSinceMs = nowMs;
    }
    this.growthApplied = tier;
    this.growthPending = false;
    if (tier >= 2) this.ensureMudRing();
    else this.mudRing?.setEnabled(false);
    // write the first frame immediately so a tier that arrives with nowMs=0
    // (tests, a fresh view) is visible without waiting for an update tick
    this.applyGrowthScale(nowMs);
  }

  /** Ease the body/shadow to the current tier's factor and re-seat the glb. */
  private applyGrowthScale(nowMs: number): void {
    const target = GROWTH_TIER_SCALE[this.growthTier] ?? 1;
    const t =
      GROWTH_SCALE_EASE_MS <= 0
        ? 1
        : Math.min(1, Math.max(0, (nowMs - this.growthSinceMs) / GROWTH_SCALE_EASE_MS));
    // ease-out cubic — fast at the start so the swell reads as a lurch
    const e = 1 - (1 - t) * (1 - t) * (1 - t);
    const f = this.growthEaseFrom + (target - this.growthEaseFrom) * e;
    if (Math.abs(f - this.growthFactor) < 1e-4 && this.growthFactorWritten) return;
    this.growthFactor = f;
    this.growthFactorWritten = true;
    // #77: the procedural figure carries the champion's STAND-IN size, exactly
    // as the adopted glb below carries `declaredScaleValue`. Scaling from
    // `bodyRoot`'s origin keeps the feet on y=0 (every box is placed at a
    // positive voxel-px offset from it), which is why no re-ground is needed
    // here while `glbRoot` does need one.
    this.bodyRoot.scaling.setAll(this.standinScaleValue * f);
    this.blobShadow.scaling.setAll(f);
    if (this.glbRoot) {
      if (this.declaredScaleValue === null) {
        this.growthPending = true; // adopt mid-flight; replay when it finishes
      } else {
        this.glbRoot.scaling.setAll(this.declaredScaleValue * f);
        this.reground();
      }
    } else if (!this.upgradeStarted) {
      this.growthPending = true; // no glb yet — replay after it lands
    }
  }

  /** Re-seat the adopted glb on y=0 after its scale changed (see setGrowthTier). */
  private reground(): void {
    const g = this.glbRoot;
    if (!g) return;
    g.computeWorldMatrix(true);
    const { min } = g.getHierarchyBoundingVectors(true);
    if (Number.isFinite(min.y)) g.position.y = -min.y;
  }

  /**
   * The tier-2 BLACK-MUD FOOT RING. Built lazily on the edge (a champion who
   * never reaches 50 stacks never pays for it) and kept for the rest of the
   * match, because the stack is permanent — this is not a transient cue.
   *
   * Modelled on the two ground discs this view already owns (`blobShadow`) and
   * on ReviveCircleView, the closest existing precedent for a persistent
   * animated ground ring: an unlit alpha-blended disc, `isPickable = false`, and
   * its material in `ownedMaterials` so `dispose()` frees it. Sits at y=0.02 —
   * above the blob shadow (0.03 is the shadow; the ring goes just under it at
   * 0.02 so the shadow still reads) and below the team ring (0.04), which must
   * stay the topmost ground mark.
   */
  private ensureMudRing(): void {
    if (this.mudRing || this.disposed) return;
    const scene = this.root.getScene();
    const mat = new StandardMaterial(`champ-${this.entityId}-mudring-mat`, scene);
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.emissiveColor = new Color3(0.07, 0.05, 0.09);
    mat.specularColor = new Color3(0, 0, 0);
    mat.disableLighting = true;
    mat.alpha = 0; // faded in by `update`
    this.ownedMaterials.push(mat);
    this.mudRingMat = mat;
    const ring = MeshBuilder.CreateDisc(
      `champ-${this.entityId}-mudring`,
      { radius: 0.95, tessellation: 40 },
      scene,
    );
    ring.material = mat;
    ring.parent = this.root;
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    ring.isPickable = false;
    this.mudRing = ring;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * #268 — 「玩家自己角色可否更顯眼」 (owner, 2026-07-28)
   *
   * WHAT WAS ACTUALLY MISSING. In the 3D scene the local player's champion was
   * marked in exactly one way: `WorldAnchorLayer` renders its NAME in bold.
   * The `teamRing` under the feet is the same torus, in the same colour, on all
   * three members of your team — that is TEAM identity, not YOU. The minimap
   * has a real self marker (`hud/minimapMath.isSelfMarker`), so the player
   * could find themselves on a 116px map and not in the arena. That is the
   * defect: not "the highlight is too subtle", but "there is no self highlight".
   *
   * WHY A RING PLUS A CARET, and not a colour change. Recolouring the body
   * would collide with three things that already own champion colour — the #49
   * w3x vertex tint, the #226/#231 voxel palette, and the #85 death-spectator
   * desaturation — and with team identity, which #231 flags as the highest-risk
   * surface in the project. A ring + a floating caret ADD a mark instead of
   * repainting one, so nothing about the champion's own look changes.
   *
   * FAILURE SHAPE ① (「畫在畫面外或地板下」) IS THE REAL RISK HERE, and both
   * pieces are placed against it:
   *   • the ring sits at y = 0.06 — ABOVE the team ring (0.04), the blob shadow
   *     (0.03) and the mud ring (0.02), so it is never z-fought into the floor;
   *   • the caret floats at TARGET_HEIGHT + margin, i.e. above the normalised
   *     champion height (#150), so it clears the head of every champion rather
   *     than a specific one's.
   * Both are asserted numerically in render/selfMarker.test.ts.
   * ═══════════════════════════════════════════════════════════════════════ */

  /** Ground ring radius. Wider than teamRing's 1.25 diameter so it reads as a halo. */
  static readonly SELF_RING_DIAMETER = 1.9;
  /** Height of the ring above the floor — above every other ground mark. */
  static readonly SELF_RING_Y = 0.06;
  /** Resting height of the caret: clear of the #150 normalised champion height. */
  static readonly SELF_CARET_Y = TARGET_HEIGHT + 0.55;
  /** Peak-to-peak bob, world units. */
  static readonly SELF_CARET_BOB = 0.16;
  /** Bob period (ms). Slow enough to read as "hovering", not as a glitch. */
  static readonly SELF_CARET_PERIOD_MS = 1400;

  /** True once the self marker exists (test/diagnostics seam). */
  get hasSelfMarker(): boolean {
    return this.selfRing !== null;
  }

  /** Is this body currently flagged as the local player's? */
  get isSelfMarked(): boolean {
    return this.selfMarkerOn;
  }

  /**
   * Flag/unflag this body as the LOCAL player's champion. Called every sync by
   * `EntityViewRegistry`, so it early-returns on no change; the meshes are
   * built lazily on the first `true`, which means the 11 other champions in a
   * match never allocate them at all.
   */
  setSelfMarker(on: boolean): void {
    if (this.disposed || on === this.selfMarkerOn) return;
    this.selfMarkerOn = on;
    if (on) this.ensureSelfMarker();
    this.selfRing?.setEnabled(on);
    this.selfCaret?.setEnabled(on);
  }

  /** Build the halo ring + the floating caret. Idempotent. */
  private ensureSelfMarker(): void {
    if (this.selfRing || this.disposed) return;
    const scene = this.root.getScene();
    const mat = new StandardMaterial(`champ-${this.entityId}-selfmark-mat`, scene);
    // Deliberately NOT the team colour: this mark answers 「哪個是我」, and a
    // team-coloured halo is exactly the question it fails to answer.
    mat.emissiveColor = new Color3(1, 0.92, 0.45);
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.disableLighting = true;
    mat.alpha = 0.9;
    this.ownedMaterials.push(mat);

    const ring = MeshBuilder.CreateTorus(
      `champ-${this.entityId}-selfring`,
      { diameter: ChampionView.SELF_RING_DIAMETER, thickness: 0.11, tessellation: 44 },
      scene,
    );
    ring.material = mat;
    ring.parent = this.root;
    ring.position.y = ChampionView.SELF_RING_Y;
    ring.isPickable = false;
    this.selfRing = ring;

    // A downward-pointing cone — the arcade 「你在這」 caret. Parented to `root`
    // (never `bodyRoot`) so the #244 growth scale, the death sink and the idle
    // bob cannot drag it, exactly like the team ring and the blob shadow.
    const caret = MeshBuilder.CreateCylinder(
      `champ-${this.entityId}-selfcaret`,
      { diameterTop: 0.42, diameterBottom: 0, height: 0.42, tessellation: 4 },
      scene,
    );
    caret.material = mat;
    caret.parent = this.root;
    caret.position.y = ChampionView.SELF_CARET_Y;
    caret.isPickable = false;
    this.selfCaret = caret;
  }

  /**
   * Per-frame self-marker animation: a slow bob + a slow spin, and the DEAD
   * gate. Driven off the same `nowMs` the rest of this view uses, so there is
   * no second clock.
   *
   * A corpse keeps no marker — 「哪個是我」 is answered by the #85 death wash and
   * the 觀戰中 banner at that point, and a caret hovering over a body that is
   * about to dissolve (#220) would outlive the body itself.
   */
  private updateSelfMarker(state: AnimState | AnimPulse, nowMs: number): void {
    const ring = this.selfRing;
    const caret = this.selfCaret;
    if (!ring || !caret) return;
    const show = this.selfMarkerOn && state !== "death";
    ring.setEnabled(show);
    caret.setEnabled(show);
    if (!show) return;
    const phase = (nowMs % ChampionView.SELF_CARET_PERIOD_MS) / ChampionView.SELF_CARET_PERIOD_MS;
    caret.position.y =
      ChampionView.SELF_CARET_Y + Math.sin(phase * Math.PI * 2) * (ChampionView.SELF_CARET_BOB / 2);
    caret.rotation.y = phase * Math.PI * 2;
  }

  /**
   * Per-frame growth animation: the 0.35 s scale ease and the ring's fade +
   * slow pulse. Driven off the `nowMs` the registry already threads into
   * `update`, so there is no new clock and nothing to keep in sync.
   */
  private updateGrowth(nowMs: number): void {
    this.applyGrowthScale(nowMs);
    const ring = this.mudRing;
    if (!ring || !this.mudRingMat) return;
    if (this.growthTier < 2) {
      this.mudRingMat.alpha = 0;
      return;
    }
    const since = Math.max(0, nowMs - this.growthSinceMs);
    const fade = Math.min(1, since / GROWTH_RING_FADE_MS);
    // slow 2.2 s breathe so it reads as spreading mud, not a static decal
    const pulse = 1 + 0.05 * Math.sin((since / 2200) * Math.PI * 2);
    this.mudRingMat.alpha = 0.55 * fade;
    ring.scaling.x = pulse;
    ring.scaling.y = pulse;
  }

  /**
   * Imperative transform write — never routed through React/Zustand. Position
   * is applied immediately; the authoritative facing is only recorded as the
   * TARGET here (the yaw eases toward it in `update`), except on the very first
   * pose where there is no prior orientation to preserve, so we snap once.
   */
  setPose(x: number, z: number, fx: number, fz: number, h = 0, airborne = false): void {
    // TASK #247: height is recorded here and APPLIED in `update`, which is where
    // the dissolve/bob/idle writers also live so all of them compose on the
    // correct nodes instead of fighting over `root`.
    this.leapY = h;
    this.airborne = airborne;
    const dx = x - this.lastPose.x;
    const dz = z - this.lastPose.z;
    const step = Math.sqrt(dx * dx + dz * dz);
    // The limb swing is driven by DISTANCE TRAVELLED, so a relocation (spawn,
    // respawn, blink) would spin the walk cycle through a random phase in one
    // frame. A step this large is never locomotion (the fastest dash covers
    // ~1 u per 30 Hz tick), so treat it as a teleport and hold the phase.
    // A leaping champion covers ~0.33 u/tick planar — under TELEPORT_STEP_UNITS
    // — so without the airborne gate it would RUN THROUGH THE AIR with its legs
    // cycling. Hold the phase for the whole flight (#247).
    if (step < TELEPORT_STEP_UNITS && !airborne) this.walkPhase += step * 4.2;
    this.lastPose = { x, z };
    this.root.position.x = x;
    this.root.position.z = z;
    if (fx * fx + fz * fz > 1e-9) {
      this.targetFacing.x = fx;
      this.targetFacing.z = fz;
      if (!this.facingInit) {
        this.facingInit = true;
        this.curFacing = nlerpFacing(this.curFacing, this.targetFacing, 1); // snap on spawn
        this.root.rotation.y = facingToYaw(this.curFacing.x, this.curFacing.z);
      }
    }
  }

  /**
   * Ease the rendered yaw toward the authoritative facing. Runs every frame
   * regardless of the model source (procedural or .glb), so the fix applies to
   * every champion. nlerp on the 2D facing vector → bounded step → never snaps.
   */
  private stepFacing(dtMs: number): void {
    if (!this.facingInit) return;
    this.curFacing = nlerpFacing(this.curFacing, this.targetFacing, smoothingAlpha(YAW_SMOOTH_RATE, dtMs));
    this.root.rotation.y = facingToYaw(this.curFacing.x, this.curFacing.z);
  }

  /**
   * Event-driven animation pulse (attack/cast/hurt) from MSG.EVENT fanout.
   * `windowMs` holds the state for a real event-derived duration (cast time /
   * attack wind-up); `clipWindowMs` stretches/squeezes the one-shot clip to
   * that span; `restartClip: false` extends the state without re-firing the
   * clip (basicAttack landing mid-wind-up must not restart the swing).
   */
  pulse(
    kind: AnimPulse,
    nowMs: number,
    opts?: { windowMs?: number; clipWindowMs?: number; restartClip?: boolean },
  ): void {
    this.anim.trigger(kind, nowMs, opts?.windowMs);
    if (this.clipAnimator) {
      const clipWin = opts?.clipWindowMs ?? opts?.windowMs;
      if (clipWin !== undefined || opts?.restartClip !== false) {
        // a restarting pulse (re)defines its window; a non-restarting extend
        // (basicAttack mid-wind-up) leaves the wind-up's window in place
        this.clipAnimator.setPulseWindow(kind, clipWin !== undefined ? clipWin / 1000 : undefined);
      }
      if (opts?.restartClip !== false) this.clipAnimator.restart(kind);
    }
  }

  /**
   * The fraction of this model's cast clip that has played at the release
   * frame — the strike fraction the whole cast alignment is built on. Per-model
   * (see anim/castStrike), so a rig whose clip throws early/late can be tuned
   * without touching content/** or the sim.
   */
  get castStrikeFraction(): number {
    return castStrikeFractionFor(this.modelKey);
  }

  /**
   * The same number for the BASIC-ATTACK swing — the fraction of the attack
   * clip that has played at the CONTACT frame (GH#40, anim/castStrike).
   */
  get attackStrikeFraction(): number {
    return attackStrikeFractionFor(this.modelKey);
  }

  /**
   * ATTACK WIND-UP — the swing's half of the same honesty fix (GH#40).
   *
   * `windupMs` is the sim's authoritative wind-up: `attackWindup` fires now and
   * `BasicAttackSystem` deals the damage exactly that long afterwards. Until
   * this existed the swing merely got a WIDER pulse window (`windup / 0.5`) and
   * `pulseSpeedRatio` stretched the clip to fill it — which the [0.5x, 3x] rate
   * clamp then silently broke for every rig outside that band, leaving the
   * contact frame off the damage tick. Now the clip is PLANNED the way a cast
   * is, so the contact frame lands on the tick and the recovery plays after it.
   *
   * That alignment is also what hitstop is judged against: `setHitstop` freezes
   * whatever frame is up, so a mis-aligned swing freezes on a blade that is
   * still travelling (or already back at the hip).
   */
  beginAttack(windupMs: number, nowMs: number): void {
    const f = this.attackStrikeFraction;
    const startup = Math.max(1, windupMs);
    this.anim.trigger("attack", nowMs, startup + castFollowThroughMs(startup, f));
    if (this.clipAnimator) {
      this.clipAnimator.setPulseAlignment("attack", {
        startupSec: startup / 1000,
        strikeFraction: f,
      });
      this.clipAnimator.restart("attack");
    }
  }

  /**
   * CAST WIND-UP — the honest version (task: "stop the body lying").
   *
   * `startupMs` is the sim's authoritative wind-up: `castBegin` fires now and
   * `CastResolveSystem` runs the effects exactly that long afterwards. The clip
   * is planned so its RELEASE FRAME lands on that damage tick, with the
   * anticipation before it and the follow-through after — the same treatment
   * `attackWindup` already gives basic attacks. The state window is the whole
   * span (startup + tail), not just the startup, so the follow-through has
   * somewhere to play.
   *
   * The old call spanned the clip across `startupMs` itself, which threw the
   * move ~(1 - f) × startup EARLY — 240 ms on a 0.6 s cast at f = 0.6.
   */
  beginCast(startupMs: number, nowMs: number): void {
    const f = this.castStrikeFraction;
    const startup = Math.max(1, startupMs);
    this.castTailMs = castFollowThroughMs(startup, f);
    this.anim.trigger("cast", nowMs, startup + this.castTailMs);
    if (this.clipAnimator) {
      this.clipAnimator.setPulseAlignment("cast", {
        startupSec: startup / 1000,
        strikeFraction: f,
      });
      this.clipAnimator.restart("cast");
    }
  }

  triggerHurt(nowMs: number): void {
    this.pulse("hurt", nowMs);
  }

  /**
   * ⭐⭐ **擋下來了**（Codex 阻塞清單 P0-2）—— 防禦者播 `guard`。
   *
   * ⛔ **不是 `hurt`**：Codex 逐字「不得將 `hurt` 當成唯一格擋動作」，
   * 而它也不誠實 —— 一次成功的格擋**沒有被打穿**。
   *
   * ⚠️ 素材是硬牆：264 顆出貨 glb 裡 `guard` 是 **0 位元組** ⇒ 它必然走
   * `ClipAnimator` 的模糊比對（`defend`/`block`/`guard`/`shield`/`parry`，
   * 其中 `attack defend` 有 **21 顆**），⭐ 找不到就退回 idle 並**警告一次**。
   * ⛔ 退回 idle **不是**「什麼都沒發生」——身體仍在動，⭐ 而 hitstop 與
   * 火花仍然照播（那兩條不歸這裡）。
   */
  triggerGuard(nowMs: number): void {
    this.pulse("guard", nowMs);
  }

  /**
   * ⭐⭐ **閃過去了**（P0-2）—— 防禦者播 `dodge`。
   *
   * ⛔ 同樣**不是 `hurt`**：閃過去的人**沒有被打到**，播受擊是一句謊。
   * ⭐ 而 MISS 的浮動文字**不受影響**（它走 `frameBus`，另一條路）——
   * Codex 逐字要求「保留 MISS 回饋」。
   */
  triggerDodge(nowMs: number): void {
    this.pulse("dodge", nowMs);
  }

  /**
   * Bigger reaction for an unblocked heavy hit → KNOCKDOWN: hold the hurt flinch
   * for a longer window (the sim roots the victim prone for a short getup).
   */
  triggerKnockdown(nowMs: number): void {
    this.pulse("hurt", nowMs, { windowMs: 550, clipWindowMs: 550 });
  }

  /**
   * HIT FLASH — briefly tint the struck model via a per-mesh render overlay
   * (never mutates shared .glb materials, so one champion's flash can't bleed
   * onto another sharing the material). Duration + strength are tier-driven by
   * combatFeedback's plan; both default to the medium-hit values (FLASH_MS /
   * FLASH_ALPHA) for direct callers.
   *
   * ⚠️ This doc used to say 「white physical/true, red magic」. That was false in
   * BOTH halves and had been since task #60: `flashColorFor` returned RED for
   * physical/true and MAGENTA for magic — white was the colour that pass
   * measured OUT (a white ALPHA_COMBINE overlay cannot darken a pale model, so
   * it is a no-op on exactly the rigs that need it). The colour is now the
   * damage school's, from `render/damagePalette` — this view NEVER picks one.
   */
  flash(
    rgb: [number, number, number],
    nowMs: number,
    durMs: number = FLASH_MS,
    alpha: number = FLASH_ALPHA,
  ): void {
    this.flashRgb = rgb;
    this.flashAlpha = alpha;
    this.flashUntilMs = Math.max(this.flashUntilMs, nowMs + durMs);
  }

  /**
   * HITSTOP — freeze this model's animation until `nowMs + ms`, syncing the
   * struck model to the sim's deterministic hitstop tick-freeze so the hit reads
   * as impact. Only the animation clip freezes; the imperative position write
   * keeps flowing, so knockback still slides.
   */
  setHitstop(ms: number, nowMs: number): void {
    if (!(ms > 0)) return;
    const prevEnd = this.hitstopUntilMs;
    this.hitstopUntilMs = Math.max(prevEnd, nowMs + ms);
    // A mid-cast hit freezes the CLIP (ClipAnimator.setFrozen) and the sim
    // freezes the cast wind-up with it (CastResolveSystem skips a tick while
    // world.hitstop > 0). The pulse WINDOW is wall-clock, though, so without
    // this it would expire while the frozen clip still has frames to play and
    // the body would snap to idle before the move came out. Grow it by exactly
    // the freeze the model actually gained.
    const gained = this.hitstopUntilMs - Math.max(prevEnd, nowMs);
    if (gained > 0) this.anim.extendPulse("cast", gained);
  }

  /**
   * The sim RESOLVED the cast (castEnd) — the damage has landed on this exact
   * frame. Do NOT cut the clip here: the release frame is playing right now and
   * the follow-through is what sells it. Re-anchor the tail on the real event
   * instead of the predicted one, because hitstop/hitstun legitimately push
   * `castEnd` past `castTimeSec`. The tail is movement-interruptible (the sim
   * has already dropped the cast root).
   */
  releaseCast(nowMs: number): void {
    this.anim.release("cast", nowMs, this.castTailMs);
    this.castTailMs = 0;
  }

  /** The cast was BROKEN (castInterrupt: stun/knockdown/death) — cut the pose. */
  endCast(): void {
    this.castTailMs = 0;
    this.anim.cancel("cast");
  }

  /**
   * The sim says this champion just DIED (`death` event) — start the #220
   * corpse clock. Idempotent within one death: a duplicated/replayed event must
   * not restart the 3 s lie-down. Re-arming after a revive is what the
   * `alive` edge in `updateDissolve` clears the state for.
   */
  noteDeath(nowMs: number): void {
    if (this.deathAtMs === null) this.deathAtMs = nowMs;
  }

  /**
   * REVIVE EXEMPTION (#220): while a claimable revive circle exists for this
   * body's seat, the corpse must NOT dissolve — the circle is the anchor a
   * teammate channels on (#84/#206) and #196 gave it no expiry, so the body has
   * to stay put as the thing being rescued. Pushed in every frame by the
   * registry (never latched), because the `death` event and the snapshot patch
   * that adds the circle can land in either order.
   */
  setReviveProtected(protectedNow: boolean): void {
    this.reviveProtected = protectedNow;
  }

  /** True once the corpse has fully risen and faded out (#220). */
  get vanished(): boolean {
    return this.vanishedFlag;
  }

  /**
   * 隱形: how opaque this body should draw, 0..1 (1 = not hidden).
   *
   * Pushed in every sync by the registry from `stealthVisualFor`, never latched:
   * the flag arrives on the snapshot and can flip on any tick (the hero attacks
   * → 破隱 → 4 s later he fades again), and a latched value would strand a body
   * invisible after the round ended.
   */
  setStealthAlpha(alpha: number): void {
    this.stealthAlpha = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  }

  /** The opacity 隱形 has actually written to the meshes (guards read this). */
  get stealthOpacity(): number {
    return this.stealthApplied;
  }

  /**
   * Write {@link stealthAlpha} onto the real meshes.
   *
   * Called ONLY for a living body, and only after `updateDissolve` returned
   * false — so it can own `visibility` outright for that frame without racing
   * the corpse fade. A dead body is never hidden anyway (`sim/stealth.isHidden`
   * returns false for a corpse), and `resetDissolve` restores `visibility = 1`
   * on the revive edge, after which the next frame re-applies this.
   *
   * Idempotent: the common case (alpha 1, already 1) touches nothing.
   */
  private applyStealth(dead: boolean): void {
    // A CORPSE IS NEVER HIDDEN. The sim agrees (`stealth.isHidden` returns false
    // for a dead body), but the renderer must not DEPEND on that: measured, a
    // body that faded to 0 and then died stayed at 0 through the whole 3-second
    // lie-down, because `updateDissolve` early-outs during "lying" WITHOUT
    // writing `visibility` — so the revive circle sat over a body nobody could
    // see. Forcing 1 here hands the channel back to the dissolve, which is its
    // rightful owner from the death tick on.
    const want = dead ? 1 : this.stealthAlpha;
    if (this.stealthApplied === want) return;
    for (const m of this.flashMeshes) m.visibility = want;
    this.stealthApplied = want;
  }

  /** Milliseconds since the arming `death` event, or null if this body never died. */
  deathElapsedMs(nowMs: number): number | null {
    return this.deathAtMs === null ? null : nowMs - this.deathAtMs;
  }

  /**
   * CORPSE DISSOLVE (#220) — lie 3 s, then rise + fade + vanish. Returns true
   * once the body is gone, so `update` can skip the rest of the frame's work.
   *
   * The clock is ABSOLUTE (`nowMs - deathAtMs`), never dt-accumulated: the
   * draw-distance cull skips `update` entirely for far champions, so an
   * accumulated clock would freeze while culled.
   *
   * While a revive is still claimable the death timestamp is RE-ANCHORED to now
   * instead of the phase being latched — that both holds the body at the
   * lie-down stage for as long as the circle burns AND self-heals a body that
   * had already started rising when protection (re)appeared, since
   * `dissolveFrame(0)` restores full opacity and zero rise.
   */
  private updateDissolve(state: AnimState | AnimPulse, nowMs: number): boolean {
    if (state !== "death") {
      // alive again (revive completed / next round spawned this seat) — the same
      // edge #85 disarms on. Undo everything the dissolve wrote.
      if (this.deathAtMs !== null || this.dissolveDirty) this.resetDissolve();
      return false;
    }
    // dead but never armed by a `death` event: a parked/bye/champ-select seat.
    // It lies there exactly as it did before #220 — it did not die.
    if (this.deathAtMs === null) return false;
    // gone and staying gone (a circle cannot spawn for a corpse after the death
    // tick, so protection can never reappear) — cheapest possible frame.
    if (this.vanishedFlag && !this.reviveProtected) return true;
    if (this.reviveProtected) this.deathAtMs = nowMs; // hold at the lie-down stage
    const f = dissolveFrame(nowMs - this.deathAtMs);
    if (f.phase === "lying" && !this.dissolveDirty && !this.vanishedFlag) return false; // free
    this.root.position.y = f.riseY;
    for (const m of this.flashMeshes) m.visibility = f.visibility;
    this.dissolveDirty = f.phase !== "lying";
    if (f.phase === "vanished") {
      if (!this.vanishedFlag) this.setBodyVisible(false, nowMs);
      return true;
    }
    if (this.vanishedFlag) this.setBodyVisible(true, nowMs); // protection reappeared
    return false;
  }

  /** Enable/disable the body nodes + clips at the vanish (and on the way back). */
  private setBodyVisible(visible: boolean, nowMs: number): void {
    this.vanishedFlag = !visible;
    // Toggle the BODY nodes, never `root`: the registry's draw-distance cull owns
    // `root.setEnabled` and would re-enable a vanished corpse the moment it came
    // back into range. The ring/shadow are already off for the dead (see below);
    // re-enabling them here is harmless because the death branch re-hides them.
    this.bodyRoot.setEnabled(visible);
    this.glbRoot?.setEnabled(visible);
    if (!visible) {
      this.teamRing.setEnabled(false);
      this.blobShadow.setEnabled(false);
      // #244: the mud ring is a ground mark of a LIVING body — a corpse must not
      // leave one behind. Re-enabled by `resetDissolve` with the other two.
      this.mudRing?.setEnabled(false);
      // #268: likewise the self marker — a caret hovering over a body that has
      // already ascended (#220) would outlive the body itself.
      this.selfRing?.setEnabled(false);
      this.selfCaret?.setEnabled(false);
      // An AnimationGroup is NOT a node: a hidden body whose death clip is still
      // "playing" keeps costing per-frame work in scene.animationGroups. Stop
      // them all; `play()` restarts cleanly if this body is ever revived.
      this.clipAnimator?.stopAll();
      // drop the hit-flash overlay on the way out (nothing left to flash)
      this.flashUntilMs = 0;
      this.applyFlash(nowMs);
    }
  }

  /** Undo every write the dissolve made — the body is alive/rendered again. */
  private resetDissolve(): void {
    this.deathAtMs = null;
    this.root.position.y = 0;
    if (this.dissolveDirty) {
      for (const m of this.flashMeshes) m.visibility = 1;
      this.dissolveDirty = false;
      // …which just clobbered whatever 隱形 had written. Invalidate the
      // idempotence guard so the next frame re-applies it instead of believing
      // the meshes still carry `stealthApplied`.
      this.stealthApplied = -1;
    }
    if (this.vanishedFlag) {
      this.setBodyVisible(true, 0);
      this.teamRing.setEnabled(true);
      this.blobShadow.setEnabled(!this.shadowSuppressed);
      if (this.growthTier >= 2) this.mudRing?.setEnabled(true);
    }
  }

  /** Advance the visual animation for this frame. */
  /**
   * ⭐⭐ 2026-09-02（P0-2）—— `state` 的型別是 **`AnimState | AnimPulse`**：
   * 狀態機在脈衝期間直接回**脈衝名**，而 `guard`/`dodge` 不在 6 格 `AnimState` 裡
   * （它們走 `ClipAnimator` 的 `PresentationClip` 軸 ⇒ ⛔ 不進 `clipMap`，
   * ⇒ ⛔ 零個 model doc 要改）。
   */
  update(state: AnimState | AnimPulse, nowMs: number, dtMs: number, speedUnitsPerSec = 0): void {
    this.stepFacing(dtMs); // yaw smoothing — model-source independent
    // #244: the growth ease + the tier-2 mud ring, before the dissolve early-out
    // (a corpse's ring is switched off by setBodyVisible, not by skipping this).
    this.updateGrowth(nowMs);
    // #268: the local player's halo + caret. BEFORE the dissolve early-out on
    // purpose — a corpse must have its marker switched OFF, and the early-out
    // would skip the frame that does it.
    this.updateSelfMarker(state, nowMs);
    // #220: 3 s on the ground, then rise + fade. Once vanished there is nothing
    // left to animate, so the rest of the frame is skipped entirely.
    // 隱形 (owner 2026-07-30). BEFORE `updateDissolve`, and passed `dead`, so
    // the two writers of `mesh.visibility` have an unambiguous priority: while
    // the body lives stealth owns the channel; from the death tick the dissolve
    // does, and this call has already handed it back at full opacity.
    this.applyStealth(state === "death");
    if (this.updateDissolve(state, nowMs)) return;
    this.applyAirborne(); // #247 fly height + temporary scale (see below)
    const frozen = nowMs < this.hitstopUntilMs; // hitstop window
    this.applyHitstopShiver(nowMs, frozen); // 破碎 buzz on the frozen body
    if (this.clipAnimator?.hasClips) {
      this.clipAnimator.setFrozen(frozen); // freeze/unfreeze the clip
      if (!frozen) {
        this.clipAnimator.setLocomotionSpeed(speedUnitsPerSec); // foot-slide fix
        this.clipAnimator.play(state);
        // release a HELD clip start (a cast clip too short to fill its window
        // waits on its opening frame so the strike still lands on the tick).
        // Inside the !frozen branch on purpose: hitstop must pause the hold.
        this.clipAnimator.advance(dtMs);
      }
      // keep the team ring readable but dim it for the dead
      const dead = state === "death";
      // 隱形: the team ring and the ground shadow are POSITION TELLS — a floating
      // team-coloured ring under an otherwise-invisible body defeats the whole
      // mechanic. Folded into the EXISTING owner of these two nodes rather than
      // written a second time in `applyStealth`, so each node keeps exactly one
      // writer (the alternative loses: this line runs later in the frame and
      // would silently undo it).
      const shown = !dead && this.stealthAlpha > 0;
      this.teamRing.setEnabled(shown);
      this.blobShadow.setEnabled(shown && !this.shadowSuppressed);
      this.applyFlash(nowMs);
      return;
    }
    // ---- procedural voxel animation ----
    if (frozen) {
      // hitstop: hold the current limb pose, only keep the flash alive
      this.applyFlash(nowMs);
      return;
    }
    const dt = Math.min(dtMs, 100) / 1000;
    const swing = Math.sin(this.walkPhase);

    let armL = 0;
    let armR = 0;
    let leg = 0;
    let bob = 0;
    if (state === "run") {
      armL = swing * 0.8;
      armR = -swing * 0.8;
      leg = swing * 0.75;
      bob = Math.abs(Math.cos(this.walkPhase)) * 0.05;
    } else if (state === "attack") {
      armR = -2.0; // raised strike
      armL = 0.3;
    } else if (state === "cast") {
      armL = -1.6; // both arms forward/up
      armR = -1.6;
    } else if (state === "hurt") {
      armL = 0.5;
      armR = 0.5;
    } else if (state === "idle") {
      const idleSway = Math.sin(nowMs / 600) * 0.06;
      armL = idleSway;
      armR = -idleSway;
    }

    if (state === "death") {
      this.deathT = Math.min(1, this.deathT + dt * 2.5);
    } else {
      this.deathT = Math.max(0, this.deathT - dt * 5);
    }
    // fall backward + sink slightly
    this.bodyRoot.rotation.x = -this.deathT * (Math.PI / 2);
    this.bodyRoot.position.y = -this.deathT * 0.35;
    const ringShown = this.deathT < 0.5 && this.stealthAlpha > 0;
    this.teamRing.setEnabled(ringShown);
    this.blobShadow.setEnabled(ringShown && !this.shadowSuppressed);

    const k = 1 - Math.pow(0.5, dtMs / 40); // limb smoothing
    this.armL.rotation.x += (armL - this.armL.rotation.x) * k;
    this.armR.rotation.x += (armR - this.armR.rotation.x) * k;
    this.legL.rotation.x += (leg - this.legL.rotation.x) * k;
    this.legR.rotation.x += (-leg - this.legR.rotation.x) * k;
    // Writers of bodyRoot.position.y, in order: the death sink (above), this
    // bob, and #247's leapY. They COMPOSE additively and all three belong on
    // bodyRoot — never on `root`, which also parents the team ring and the blob
    // shadow (see applyAirborne).
    this.bodyRoot.position.y = this.bodyRoot.position.y + bob + this.leapY;

    this.applyFlash(nowMs);
  }

  /**
   * TASK #247 — apply the interpolated fly height.
   *
   * NOT ON `root`. `root` parents four things: bodyRoot, glbRoot, the TEAM RING
   * and the BLOB SHADOW. Writing height there would fly the ring and the shadow
   * into the air with the body, destroying the one cue that tells a player where
   * a leaper is going to land. So the height goes on the BODY nodes only, and
   * the shadow instead shrinks and fades with altitude — the classic, and free,
   * jump-readability cue.
   *
   * No conflict with the #220 dissolve (which writes `root.position.y`) or with
   * the idle bob (which writes `bodyRoot.position.y`): different nodes /
   * additive composition, both documented at their own sites.
   *
   * SCALE IS NOT TOUCHED HERE. #247 shipped a `scaleMul` composed on top of
   * #150's normalised `glbRoot.scaling`, but the sim only ever sent 1, so the
   * lane was removed (see protocol/schema.ts). `glbRoot.scaling` is now written
   * exactly once, at adoption — plus #244's growth factor, which is the ONLY
   * other writer and owns the size for the whole match.
   *
   * THE GROUND OFFSET STILL HAS TO FOLLOW #244's GROWTH (integration batch A).
   * `groundOffsetY` is `-min.y` measured in the ADOPTION-scale frame, and this
   * method rewrites `glbRoot.position.y` every frame — so on a grown champion it
   * would overwrite the re-ground `applyGrowthScale` just did and sink a quarter
   * of the body through the floor. `min.y` scales linearly with `glbRoot.scaling`
   * (the scale is about glbRoot's own origin), so multiplying the stored offset
   * by `growthFactor` reproduces the re-measured value exactly, and is identity
   * at tier 0. The shadow multiplies growth by the altitude shrink for the same
   * reason — a big champion mid-leap casts a big shadow that shrinks with height.
   */
  private applyAirborne(): void {
    if (this.glbRoot) {
      this.glbRoot.position.y = this.leapY + this.groundOffsetY * this.growthFactor;
    }
    // Ground cues stay ON THE GROUND; the shadow reads the altitude instead.
    //
    // ⭐ GH#572 —— 飛行（04-00 翔封界 那一族）走**自己的**影子曲線。
    // owner 2026-08-23:「飛行視覺可以調 3d model 高度與影子變化」。
    // 判準是 `h > 0 && !airborne`:飛行刻意**不點** ENTITY_FLAG.AIRBORNE
    // （`sim/flight.ts` 的 ② —— 在飛的人要保留跑步動畫），所以「有高度、
    // 但不是彈道」正好等於「在飛」。⇒ 跳躍(#247)那條路逐位元不變，
    // `growthTier.test.ts` 的 `1 + h × 0.15` 照樣成立。
    //
    // ⛔ 兩條曲線的數字都**不寫在這裡**：飛行那條在 `sim/flight.ts` 一個住處
    // （見那裡「為什麼是常數而不是 config」），跳躍那條是 #247 的出貨值。
    const h = Math.max(0, this.leapY);
    const flying = h > 0 && !this.airborne;
    const resp = flying ? flightShadowResponse(h) : null;
    const shrink = resp ? resp.scale : 1 / (1 + h * 0.15);
    this.blobShadow.scaling.setAll(this.growthFactor * shrink);
    const shadowMat = this.blobShadow.material as { alpha?: number } | null;
    if (shadowMat) shadowMat.alpha = resp ? resp.alpha : 0.38 * shrink;
  }

  /**
   * HITSTOP MICRO-JITTER (audit strong-P2 / 破碎 buzz): while the body is frozen
   * on contact, offset it by a tiny high-frequency shiver (~1–2px) so the freeze
   * BUZZES with impact energy instead of reading as a dead pause. Client-only and
   * cosmetic — it moves `bodyRoot` (the visual body), never the `root` world
   * transform (position/ring/shadow keep flowing, so knockback still slides), and
   * it snaps to zero the instant the freeze lifts (收尾精準, no settle tail).
   * Edge-guarded: costs nothing outside the hitstop window.
   */
  private applyHitstopShiver(nowMs: number, frozen: boolean): void {
    if (!frozen) {
      if (this.shiverActive) {
        this.bodyRoot.position.x = 0;
        this.bodyRoot.position.z = 0;
        this.shiverActive = false;
      }
      return;
    }
    // phase off the entity id so attacker + victim don't buzz in lock-step
    const s = hitstopShiver(nowMs, this.hitstopUntilMs, this.entityId * 0.7);
    this.bodyRoot.position.x = s.x;
    this.bodyRoot.position.z = s.z;
    this.shiverActive = true;
  }

  /**
   * Drive the hit-flash render overlay. Edge-guarded: writes every frame while
   * lit (colour is stable + cheap), clears once on the trailing edge, and does
   * nothing while idle — no per-frame cost outside the ~80 ms flash window.
   */
  private applyFlash(nowMs: number): void {
    const on = nowMs < this.flashUntilMs;
    if (!on && !this.flashActive) return;
    for (const m of this.flashMeshes) {
      // GH#226/#227 —— 閃光的不透明度必須乘上「這塊網格現在真的畫得出多少」。
      // 見 `drawnOpacityOf`:overlay pass 不看材質 alpha,所以一片 alpha=0 的
      // WC3 TeamGlow 佔位面會被畫成實心色塊(八雲腳底的紅方塊、臭作武器上的
      // 白遮罩)。乘完等於 0 的就整個不開 overlay。
      const a = on ? this.flashAlpha * drawnOpacityOf(m) : 0;
      m.renderOverlay = a > 0;
      if (a > 0) {
        m.overlayColor.copyFromFloats(this.flashRgb[0], this.flashRgb[1], this.flashRgb[2]);
        m.overlayAlpha = a;
      }
    }
    this.flashActive = on;
  }

  get hasGlb(): boolean {
    return this.glbRoot !== null;
  }

  /**
   * The live clip animator, or null while the champion is still on its
   * procedural stand-in. READ-ONLY DIAGNOSTICS: the /frame-data audition page
   * uses it to read back the plan a real `beginCast` produced on a real .glb,
   * so the page proves the RENDERER's timing rather than re-deriving it.
   * Nothing in the game should drive animation through this — go through
   * `pulse`/`beginCast`/`update`.
   */
  get animator(): ClipAnimator | null {
    return this.clipAnimator;
  }

  /**
   * The render scale actually applied to the adopted .glb, or null while the
   * champion is still on its procedural stand-in. As of task #150 this is the
   * HEIGHT-NORMALIZED factor (TARGET_HEIGHT ÷ the glb's native height) times the
   * per-champion `relativeScale` multiplier — NOT the model doc's raw `scale`
   * (which is now only a fallback for a degenerate glb). It never silently
   * substitutes a generic default (task #77): the procedural voxel figure stands
   * in only when there is genuinely no renderable model.
   */
  get declaredScale(): number | null {
    return this.declaredScaleValue;
  }

  get upgradeAttempted(): boolean {
    return this.upgradeStarted;
  }

  /**
   * Swap in the model doc's .glb (async). Idempotent — safe to call every
   * frame until a doc is available; only the first call with a doc loads.
   *
   * `relativeScale` (task #150, default 1.0) is the per-champion INTENTIONAL size
   * multiplier applied on top of height-normalization: 1.0 renders at the common
   * TARGET_HEIGHT, <1 deliberately smaller (lore-small creatures/mascots), >1
   * bigger (giants/mecha). It comes from content/models/_standin-overrides.json
   * via EntityViewRegistry.modelOverrideFor and is the ONLY size-exception knob —
   * the doc's raw `scale` no longer sets the on-screen size.
   *
   * `standinRelativeScale` (task #77) is the SAME knob for the other body: the
   * generated box-man the champion falls back to when its own model is not
   * there. It is a separate number because `relativeScale` stopped being valid
   * for that body at GH#31 — see `packages/shared/src/content/standinScale.ts`
   * for the derivation and why 6.795 on a stand-in is a 12.2u champion.
   * Defaults to `relativeScale`, i.e. the pre-#77 behaviour, so a caller that
   * has only one number keeps exactly what it had.
   */
  tryUpgradeToGlb(
    assets: AssetManager,
    doc: ModelDoc | null,
    relativeScale = 1,
    standinRelativeScale = relativeScale,
  ): void {
    // #77 — recorded on EVERY call, including the ones that return early below.
    // The registry calls this each frame until `upgradeAttempted` latches, and
    // the FIRST calls arrive with `doc === null` (ContentDb has not settled);
    // deferring the write to the adopt branch would leave the procedural figure
    // un-sized for exactly the champions that never adopt anything.
    const standin = standinRelativeScale > 0 ? standinRelativeScale : 1;
    if (standin !== this.standinScaleValue) {
      this.standinScaleValue = standin;
      // write it now: `applyGrowthScale` early-returns while the growth factor
      // has not moved, so waiting for the next tier change would never happen.
      this.growthFactorWritten = false;
      this.applyGrowthScale(this.growthSinceMs + GROWTH_SCALE_EASE_MS);
    }
    // TASK #231 — a champion whose recipe says `preferVoxelBody` has NO art of
    // its own: its modelKey points at one of the four shared stand-in meshes,
    // which is precisely the "44 heroes wearing 4 faces" problem. Adopting that
    // glb would hide the generated skin behind somebody else's body, so the
    // upgrade is declined outright and the champion keeps its own voxel figure.
    // Latch `upgradeStarted` so the registry stops asking every frame. When
    // #226 deletes the KayKit glbs this branch becomes a no-op rather than a
    // behaviour change.
    if (this.skin?.preferVoxelBody) {
      this.upgradeStarted = true;
      return;
    }
    if (!doc || this.upgradeStarted || this.disposed) return;
    this.upgradeStarted = true;
    void assets
      .load(doc.glbPath)
      .then((container) => {
        if (!container || this.disposed || this.glbRoot) return;
        const inst = container.instantiateModelsToScene((n) => `${this.entityId}-${n}`, false, {
          doNotInstantiate: true,
        });
        const glbRoot = new TransformNode(`champ-${this.entityId}-glb`, this.root.getScene());
        glbRoot.parent = this.root;
        // Measure at the NATIVE scale first (task #150): normalization needs the
        // glb's own height before any scaling is applied.
        glbRoot.scaling.setAll(1);
        // facing convention lives in one place (glbFacing); imported .glbs
        // need a different offset than native/KayKit ones. Yaw is about Y, so it
        // does not affect the vertical bounding measure below.
        glbRoot.rotation.y = glbYawOffset(doc);
        for (const node of inst.rootNodes) node.parent = glbRoot;
        const glbMeshes = glbRoot.getChildMeshes(false);
        // EMPTY-GLB → KEEP THE PROCEDURAL FALLBACK (task #69). A few imported
        // "models" are geometry-less WC3 dummies — e.g. `imported.collision`, a
        // 0-mesh bone-only unit whose only clip is a static "Stand". No champion
        // points at one any more (#77 moved godie-u011 「死亡老二 - 克勞薩先生」,
        // the last holdout, off `imported.collision` — a WC3 collision dummy is
        // a SPEC for an invisible unit, not a body, and it left the only
        // champion in the roster with nothing to render). The guard stays as
        // the defence for any future doc that resolves to an empty glb:
        // adopting one hid the voxel figure AND installed a ClipAnimator whose
        // "attack" resolved to "Stand" — an INVISIBLE champion. Discard
        // the empty instance and let the procedural figure (which DOES animate
        // attack/hurt/run) stand in. `upgradeStarted` stays true, so no retry.
        if (glbMeshes.length === 0) {
          inst.dispose(); // frees the cloned nodes + skeletons + animation groups
          glbRoot.dispose(false, false);
          return;
        }
        // 屍體/血泥幾何 —— `model@1.hiddenPrimitives`(owner 2026-08-02
        // 「初號機跟拳四郎一樣 3d model 連著屍體一起」)。WC3 的 `gutz*` 血泥
        // geoset 靠 GEOA/KGAO 的 alpha 動畫平常藏著,而 #59 已經確認 mdx→glb
        // 把 geoset 可見度動畫整個丟掉 —— 於是它變成永遠畫得出來的一片圖元。
        // 這裡不重寫 glb(那棵樹是 gitignore 的執行期資產,改一次要重抽+重推
        // 84MB),而是照文件宣告把那幾片關掉。
        //
        // ⚠️ 被藏起來的那幾片**不推進 `flashMeshes`**,所以這裡讀的是
        // `applyHiddenPrimitives` 回傳的「還畫得出來」那一份。受擊閃光走 Babylon 的
        // OutlineRenderer,顏色與不透明度只讀 mesh 上的 `overlayColor`/`overlayAlpha`,
        // 材質的 alpha 與 mesh 的 visibility 一個都不看(見 `drawnOpacityOf` 的檔內
        // 註解 / GH#226 GH#227)。一片被 `setEnabled(false)` 的網格如果留在
        // flashMeshes 裡,`applyDeathFade`/`applyVanish` 那幾條會直接寫
        // `m.visibility`,把它變成「可見度 1 但 enabled=false」的曖昧狀態,而 #220
        // 的復活路徑會把整棵樹 setEnabled(true) —— 屍體就回來了。
        for (const mesh of glbMeshes) mesh.isPickable = false;
        for (const mesh of applyHiddenPrimitives(glbMeshes, doc.hiddenPrimitives)) {
          this.flashMeshes.push(mesh); // .glb meshes flash via per-mesh overlay
        }
        // HEIGHT-NORMALIZE (task #150): scale the glb so its full silhouette
        // stands ≈ TARGET_HEIGHT tall, then apply the champion's relative
        // multiplier — REPLACING the old raw-doc.scale-as-absolute so every
        // champion reads a consistent size regardless of its native mesh height.
        // A degenerate/geometry-less glb (native height unmeasurable) falls back
        // to the doc's declared scale rather than a nonsense normalization factor.
        //
        // ⚠️ `ENABLED_ONLY` 是 hiddenPrimitives 的一半功能,不是順手優化。
        // `getHierarchyBoundingVectors` **不看 `isEnabled`**(Babylon 只跳過
        // 沒有 boundingInfo / 0 頂點的節點),所以少了這個 predicate,被藏起來
        // 的血泥仍然參與身高正規化與下面那行 `position.y = -min.y` 的落地。
        // 實測 `Hblm.glb`(賈修)的血泥最低點 y=-0.063,身體最低點 y=0.025 ——
        // 藏了卻不排除,結果是整隻英雄被墊高 0.088u 浮在空中(失敗形態 ①)。
        glbRoot.computeWorldMatrix(true);
        const native = glbRoot.getHierarchyBoundingVectors(true, ENABLED_ONLY);
        const nativeH = native.max.y - native.min.y;
        // #77 —— 「這具網格是誰」決定用哪個倍率,而不是「這個英雄是誰」。
        // 替身英雄的 modelKey 永遠是那四個共用替身之一,但實際載進來的可能是
        // 他自己的 Warcraft III 模型(GH#31),也可能是 overlay 缺席時退回來的
        // 方塊人。兩者正規化到同一個 1.8u,可是「1.8u 之後要再乘多少」完全
        // 不同 —— 方塊人的輪廓就是身體(乘 usca),WC3 模型不是(乘身高比 ×
        // usca)。判斷讀的是真的送進 assets.load() 的那條路徑。
        const rel = isStandinBodyGlb(doc.glbPath) ? standin : relativeScale > 0 ? relativeScale : 1;
        // GH#368 —— the arithmetic moved to `./modelSizing` so 商店/英靈殿/選人/
        // 補給站 compute the SAME number instead of four hand-copies of it.
        const finalScale = normalizedModelScale(nativeH, doc.scale, rel);
        glbRoot.scaling.setAll(finalScale);
        // GROUND (task #61 "flying"/"sinking" fix): lift the model so its lowest
        // vertex sits on the arena floor (y=0). Imported rigs bake their feet at
        // an arbitrary local Y — `imported.ma` floats 0.72u above the origin,
        // `imported.picacugy`/`gumdam` dip ~0.6u below it (half-buried). This is
        // the SAME per-model root shift StorePreview (#129) and the intermission
        // mount (#111 int-32) apply, ported to the in-arena view so every
        // champion stands ON the ground, not above or sunk into it. Runs after
        // the FINAL scaling so the shift is in the rendered (scaled) frame.
        glbRoot.computeWorldMatrix(true);
        const { min } = glbRoot.getHierarchyBoundingVectors(true, ENABLED_ONLY);
        if (Number.isFinite(min.y)) glbRoot.position.y = -min.y;
        // #247: remember the ground offset, because `applyAirborne` REWRITES
        // `glbRoot.position.y` every frame (fly height + offset) and would
        // otherwise clobber the shift measured on the line above. Kept in the
        // scaled frame — `glbRoot.scaling` is written exactly once, right here,
        // and nothing may change it afterwards (that is what keeps #150).
        this.groundOffsetY = Number.isFinite(min.y) ? -min.y : 0;
        this.glbRoot = glbRoot;
        this.glbSkeletons = inst.skeletons as unknown as InstanceSkeleton[];
        // GH#31: remember WHICH glb landed. Must be written BEFORE
        // `applyVoxelLookToGlb` below, which reads it to decide whether the
        // #226 palette may touch this mesh at all.
        this.adoptedGlbPath = doc.glbPath;
        // #226 per-champion palette/proportions/props. MUST run before the
        // registry's applyModelTint, which it does: the registry gates on
        // `view.hasGlb`, and `hasGlb` reads `glbRoot`, set one line above —
        // but the tint only happens on the NEXT sync, after this returns.
        this.applyVoxelLookToGlb();
        this.declaredScaleValue = finalScale; // the render scale actually applied
        // #244: a growth tier that arrived while this load was in flight has
        // nothing to scale yet. Replay it now that `declaredScaleValue` exists —
        // strictly AFTER the assignment above, because `applyGrowthScale`
        // multiplies off the STORED value.
        if (this.growthPending || this.growthTier !== 0) {
          this.growthPending = false;
          this.growthFactorWritten = false; // force the write
          this.applyGrowthScale(this.growthSinceMs + GROWTH_SCALE_EASE_MS);
        }
        this.clipAnimator = new ClipAnimator(inst.animationGroups, doc.clipMap);
        // hide the procedural fallback
        for (const p of this.proceduralParts) p.setEnabled(false);
        // #220: the load can resolve AFTER this body already dissolved (a death
        // early in a match, on a cold asset cache). Adopt the corpse's current
        // dissolve state instead of popping a fully opaque model back on screen.
        if (this.vanishedFlag) {
          glbRoot.setEnabled(false);
          this.clipAnimator.stopAll();
        }
      })
      .catch((err) => {
        /* keep the procedural figure */
        console.warn(`[ChampionView] glb upgrade failed for ${this.modelKey}:`, err);
      });
  }

  /**
   * 掛上球體掛件(#249 GH#288;**N 份 + 跟隨 + 播動畫** = GH#392)。冪等。
   *
   * 執行順序上它必須排在 `.glb` 落地之後:掛點是本體 glb 的原生座標系,本體還沒
   * 到就沒有東西可以掛。所以清單為空或 `glbRoot` 還沒有時**不點閂**,
   * registry 下一幀會再問一次 —— 這和 `tryUpgradeToGlb` 對 `doc === null`
   * 的處理是同一個模式(「還不行」≠「不要」)。
   *
   * ---------------------------------------------------------------------------
   * GH#392 —— 這裡是 owner 那句話的三個能力真的落地的地方
   * ---------------------------------------------------------------------------
   * 「悟空超級賽亞人3還會**球體附著跟隨雙手上播放動畫**」拆開是三件事:
   *
   *   (a) 附著 —— `formAttachHost(spec.bone)` 解出關節。**本來就有**。
   *   (b) 跟隨 —— `attachRoot.parent = host`。parent 就是每幀跟著世界矩陣走,
   *       所以 (b) 也**本來就有** …… 只要 `follow` 沒被關掉。
   *   (c) 播動畫 —— ⛔ **本來沒有**。這個方法一直把 `inst.animationGroups`
   *       收進 `formAttachGroups`,而那個欄位**唯一的讀者是 `dispose()`**。
   *       出貨的三顆掛件(`goku3head` / `awing` / `war3mapimported-poweraura`)
   *       各有一條叫 `Stand` 的軌,所以悟空的超三頭從 #249 上架起就是**定格**的。
   *       沒有任何守衛會紅 —— 每一個零件都是對的(第一·五守則的形狀)。
   *
   * ⚠️ `follow: false` 走的是**世界座標快照**:掛件不 parent 到關節,而是留在
   * 生成當下那個位置。⛔ 不可以用「parent 到 glbRoot」代替 —— 那還是會跟著
   * 角色走,只是不跟著手走,而畫面上兩者在原地不動時一模一樣。
   *
   * @param specs 空陣列 = 這具身體沒有掛件(或後台把掛件關掉了) → 什麼都不做。
   */
  setFormAttachment(
    assets: AssetManager,
    specs: FormAttachmentSpec | readonly FormAttachmentSpec[] | null,
  ): void {
    if (this.disposed || this.formAttachStarted) return;
    const list = specs === null ? [] : Array.isArray(specs) ? specs : [specs as FormAttachmentSpec];
    if (list.length === 0 || !this.glbRoot) return; // 「還不行」——不點閂,下一幀再來
    this.formAttachStarted = true;
    for (const spec of list) this.attachOnePart(assets, spec, this.glbRoot);
  }

  /** 一份掛件。`setFormAttachment` 對清單裡的每一格呼叫一次。 */
  private attachOnePart(
    assets: AssetManager,
    spec: FormAttachmentSpec,
    bodyRoot: TransformNode,
  ): void {
    void assets
      .load(spec.glbPath)
      .then((container) => {
        if (!container || this.disposed) return;
        const inst = container.instantiateModelsToScene(
          (n) => `${this.entityId}-form-${n}`,
          false,
          { doNotInstantiate: true },
        );
        const host = this.formAttachHost(spec.bone) ?? bodyRoot;
        const attachRoot = new TransformNode(
          `champ-${this.entityId}-formpart`,
          this.root.getScene(),
        );
        // (b) 跟隨。`follow !== false` 是預設 —— 省略這一格的既有內容一位元不變。
        if (spec.follow === false) {
          // 世界座標快照:掛件從此和角色無關(施法留在原地的殼)。
          attachRoot.parent = null;
          host.computeWorldMatrix(true);
          attachRoot.position.copyFrom(host.getAbsolutePosition());
        } else {
          attachRoot.parent = host;
        }
        for (const node of inst.rootNodes) node.parent = attachRoot;
        const meshes = attachRoot.getChildMeshes(false);
        if (meshes.length === 0) {
          // 幾何是空的(WC3 dummy)—— 丟掉,別在場景裡留一個看不見的節點。
          // 和 `tryUpgradeToGlb` 的 EMPTY-GLB 分支同一個判斷。
          inst.dispose();
          attachRoot.dispose(false, false);
          return;
        }
        for (const mesh of meshes) {
          mesh.isPickable = false;
          // 掛件跟本體一起閃(#3 受擊白光),否則變身態被打的時候頭是不會反應的。
          this.flashMeshes.push(mesh);
        }
        attachRoot.scaling.setAll(spec.scale > 0 ? spec.scale : 1);
        attachRoot.position.y += spec.offsetY;
        this.formAttachRoot ??= attachRoot;
        this.formAttachParts.push(attachRoot);
        // (c) 播動畫 —— ⭐ **這三行就是 GH#392 補上的那一半**。
        //     `anim` 指名一條軌;省略 = 全部(WC3 對附著模型做的事)。
        //     ⛔ 名字對不上就一條都不播 —— 不猜一條給它。
        const groups = inst.animationGroups as unknown as AttachmentAnimGroup[];
        // ⚠️ `instantiateModelsToScene` 把軌名**前綴**成 `<entityId>-form-Stand`
        // （和節點名同一個慣例），所以逐字比對 `"Stand"` 一條都不會中 ——
        // 那會是「填了 anim、畫面上沒動、沒有任何錯誤」的失敗形態②。
        const wanted = spec.anim
          ? pickByName(groups, spec.anim)
          : groups;
        for (const g of wanted) g.play?.(spec.animLoop !== false);
        this.formAttachGroups.push(...(groups as unknown as { dispose(): void }[]));
        // #223 —— 掛件也會複製一具 Skeleton 進 `scene.skeletons`(悟空的超三頭
        // 是有骨架的),和上面的 AnimationGroup 一樣不會被 `root.dispose()` 收掉。
        this.formAttachSkeletons.push(...(inst.skeletons as unknown as InstanceSkeleton[]));
        // 本體已經死透了才載完 —— 跟著隱藏,不要憑空冒出一顆頭。
        if (this.vanishedFlag) attachRoot.setEnabled(false);
      })
      .catch((err) => {
        console.warn(`[ChampionView] form attachment failed (${spec.glbPath}):`, err);
      });
  }

  /**
   * 掛點解析:`"origin"`(w3x 對 A0MI/A0MJ 記的值)→ 模型原點(回傳 null,
   * 呼叫端用 `glbRoot`);其他值當骨頭名稱找對應的 TransformNode。
   *
   * 找不到就回 null 而不是丟例外 —— 一個打錯的骨頭名字應該讓頭掛在原點,
   * 不應該讓整場比賽的渲染迴圈爆掉。
   */
  private formAttachHost(bone: string): TransformNode | null {
    if (!bone || bone === "origin" || !this.glbRoot) return null;
    const nodes: TransformNode[] = [this.glbRoot];
    for (const node of this.glbRoot.getDescendants(false)) {
      const n = node as TransformNode;
      if (typeof n.name === "string") nodes.push(n);
    }
    // ⭐ GH#392 —— **WC3 掛點字串**先過那支普查推出來的解析器,再退回字尾比對。
    // `"right,hand"` 是**一個**掛點寫成兩個逗號 token,直接拿去做 `endsWith`
    // 一個節點都不會中,於是掛件靜靜掉回模型原點(失敗形態②)。
    // `resolveAttachment` 認得六種命名慣例(`Hand Right Ref` / `hand.r` /
    // `Bone_Hand_R` / `handright` …),而且**它就是 WC3 自己的退回規則**:
    // 找不到就給 origin,那不是防禦性程式,是原作行為。
    const resolved = resolveAttachment(bone, nodes.map((n) => n.name));
    if (resolved.node !== null) {
      const hit = nodes.find((n) => n.name === resolved.node);
      // `origin` 解到本體根 = 「沒有骨頭」,交給呼叫端的 `?? bodyRoot`。
      if (hit && hit !== this.glbRoot) return hit;
    }
    const want = bone.toLowerCase();
    for (const n of nodes) {
      if (n !== this.glbRoot && n.name.toLowerCase().endsWith(want)) return n;
    }
    return null;
  }

  /**
   * MATERIAL OWNERSHIP — why this does NOT pass `disposeMaterialAndTextures`.
   * `tryUpgradeToGlb` instantiates with `cloneMaterials: false`, so every .glb
   * child mesh points straight at the AssetContainer's material — the object
   * `AssetManager` CACHES per glb path and hands to every other champion on
   * that model and to every future spawn. Babylon's `dispose(_, true)` runs
   * `material.dispose(false, true)` on EVERY child mesh (note: forceDisposeTextures),
   * so the first champion to despawn would strip the shared material and its
   * textures out from under everyone still using it. We therefore let materials
   * outlive the view and dispose only the ones we created ourselves.
   */
  dispose(): void {
    this.disposed = true;
    // ANIMATION GROUPS are not nodes: `instantiateModelsToScene` clones the
    // container's groups into `scene.animationGroups` (a list Babylon walks
    // every frame) and `root.dispose()` below never touches them. Free them
    // FIRST, while their targets are still alive.
    this.clipAnimator?.dispose();
    this.clipAnimator = null;
    // #249 GH#288: the form part's cloned AnimationGroups are not nodes either
    // (same reason as the ClipAnimator above). Freed here; the NODES go with
    // `root.dispose()` below because the part is parented under it — which is
    // exactly why 「變回本體 = 掛件消失」 needs no detach path at all.
    for (const g of this.formAttachGroups) g.dispose();
    this.formAttachGroups = [];
    // #223 —— SKELETONS ARE NOT NODES EITHER, and this is the half #249 made
    // expensive: the registry rebuilds the whole view on every 變身, so every
    // transform used to strand one more cloned Skeleton (plus its bone-matrix
    // GPU texture) in `scene.skeletons`. Freed HERE, before `root.dispose()`
    // below, for the same reason the ClipAnimator is: while their targets are
    // still alive. `dispose` is optional on the duck type only so the tests'
    // stub skeletons stay cheap — every real Babylon Skeleton has one.
    for (const s of this.glbSkeletons) s.dispose?.();
    this.glbSkeletons = [];
    for (const s of this.formAttachSkeletons) s.dispose?.();
    this.formAttachSkeletons = [];
    // GH#392 —— `follow: false` 的掛件 **parent 是 null**,所以下面那行
    // `this.root.dispose()` 走不到它。⛔ 少了這個迴圈 = 每一次變身/死亡漏一棵樹,
    // 而畫面上看不出來(它就停在那裡,看起來像場景的一部分)。跟隨的那幾份重複
    // dispose 是安全的(Babylon 的 dispose 冪等)。
    for (const p of this.formAttachParts) p.dispose(false, false);
    this.formAttachParts = [];
    this.formAttachRoot = null;
    const scene = this.root.getScene();
    this.root.dispose(false, false);
    // The generated atlas is CACHE-OWNED and refcounted per championId (six
    // champions on the same hero share one 16 KB texture), so it is released,
    // never force-disposed — `dispose(false, true)` below would otherwise tear
    // it out from under every other view still rendering that champion. Release
    // FIRST, so the material we are about to dispose no longer points at a
    // texture the cache might legitimately keep alive.
    if (this.atlasChampionId) {
      releaseVoxelSkinTexture(scene, this.atlasChampionId);
      for (const m of this.ownedMaterials) m.diffuseTexture = null;
      this.atlasChampionId = null;
    }
    for (const m of this.ownedMaterials) m.dispose(false, true);
    this.ownedMaterials.length = 0;
    // The #226 palette clone + its generated RawTexture are view-owned too, but
    // are freed through their own path: `releaseVoxelLook` disposes the CLONE
    // without `forceDisposeTextures`, so the shared source material and its
    // textures — which belong to the AssetManager's container cache — survive.
    releaseVoxelLook(this.voxelHandle);
    this.voxelHandle = null;
  }
}
