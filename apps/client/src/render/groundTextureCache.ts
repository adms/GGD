/**
 * groundTextureCache — the ground PNG sets, loaded ONCE per scene and kept.
 *
 * owner 2026-08-22 (GH#536)：「福利連地圖地板全黑了」/「大混戰也是 **似乎是讀取
 * 不夠快 並且沒有提前在商店完成讀取**的緣故」—— 他的診斷是對的，而下面是量到的
 * 完整鏈條，⛔ 不是推測：
 *
 *   ① 地圖**每回合換**（task #145）。`GameApp.applyArena` 先 `disposeArena` 再
 *      `buildArena`，而 `disposeArena` 用的是 `mesh.dispose(false, **true**)`
 *      —— 第二個參數是 `disposeMaterialAndTextures`（babylon 7.54.3
 *      `Meshes/mesh.js:2484`）⇒ **四張地面 PNG 每一回合都被銷毀一次**。
 *   ② 下一回合 `new Texture(url)` 從零開始：抓檔 → 解碼 → 上傳 GPU。
 *   ③ 在那段時間裡 `Texture._isBlocking` 是 **true**（`Textures/texture.js:176`
 *      的預設，我們沒有動過它），於是
 *      `isReadyOrNotBlocking() = !isBlocking || isReady() || loadingError` 是
 *      **false**（`baseTexture.js:481`），
 *      `pbrBaseMaterial.js:846` 因此讓整個材質 not-ready，
 *      ⇒ **地板那片 mesh 整片不畫**。
 *   ④ 於是玩家看到的是 `scene.clearColor` —— 而它是這張場地的 `palette.void`
 *      （`Lighting.ts:83`）：芙莉蓮 `#060a12`、大混戰 `#05060d`。**那就是「全黑」。**
 *
 * 量測（2026-08-22，同一顆 mesh、同一張貼圖、只差一個屬性）：
 *
 *   | `isBlocking` | 第 0 幀 `mesh.isReady()` |
 *   |---|---|
 *   | `true`（出貨） | **false** ⇒ 不畫 ⇒ 黑 |
 *   | `false` | true ⇒ 畫 |
 *
 * ⛔ **而 `isBlocking = false` 是個陷阱，⛔ 不要用它「修」這件事。** 貼圖沒好時
 * babylon 綁的是 `engine.emptyTexture`（`thinEngine.js::_setTexture`），而它是
 * `createRawTexture(new Uint8Array(4), 1, 1, …)` —— **1×1 的 (0,0,0,0)**
 * （`abstractEngine.js:275`）。albedo 是**相乘**的 ⇒ `任何顏色 × 黑 = 黑`。
 * ⇒ 兩條路都通往同一個黑畫面，只是一個「沒畫」一個「畫成黑的」。
 *
 * ⭐ 所以正解是**兩件事**，⛔ 不是一個開關：
 *
 *   **① 貼圖沒好之前不要把它掛上材質。** 材質先用 `GROUND_BASE` 那組平色出場
 *      （那組常數的註解本來就寫著它存在是為了「degrade to the old floor instead
 *      of **a black hole**」—— 作者早就想到了，只是**只套在「抓失敗」，沒套在
 *      「還在抓」**）。好了再掛上去並把 `albedoColor` 換成白 ⇒ 漸進式增強。
 *   **② 貼圖跨回合留著。** 這一份快取。第 2 回合起 `isReady()` 當場就是 true，
 *      連那幾幀平色都不會出現。
 *
 * ---------------------------------------------------------------------------
 * 為什麼是 per-Scene 的 WeakMap
 * ---------------------------------------------------------------------------
 * 跟 `AssetManager` 的快取①**同一個理由**：`Texture` 是綁在 Scene 上的，Scene 一
 * 被 dispose 它就死了。用 `WeakMap<Scene, …>` 表示
 *   · ⛔ 不可能把 A 場景已經 dispose 的貼圖交給 B 場景（那正是 AssetManager 檔頭
 *     警告的那個 bug），
 *   · Scene 走了，這一格自己就被回收，⛔ 不需要任何人記得清。
 *
 * ⚠️ 快取鍵**必須含 uv scale**：`loadGroundTextures` 把
 * `detailUvScale(boundaryRadius)` 寫在 **Texture 物件**上（`uScale`/`vScale`），
 * 所以兩個半徑不同的區不能共用同一顆。出貨的 13 張圖每張的兩個區同半徑，
 * 所以實務上一種 style 就是一格。
 */
import type { Scene } from "@babylonjs/core/scene";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { effectiveQuality } from "./RenderConfig";
import { detailUvScale, groundTextureUrls, type GroundTextureSet } from "./groundMaterials";

/** Anisotropy for the tiling detail maps on desktop (mobile keeps the default). */
export const GROUND_ANISOTROPY_DESKTOP = 8;

/** The four maps a ground style is made of, plus their readiness. */
export interface GroundTextures {
  albedo: Texture;
  normal: Texture;
  orm: Texture;
  macro: Texture;
  /**
   * True once ALL FOUR are decoded and uploaded — i.e. the moment it becomes
   * safe to bind them. ⛔ Binding earlier is the black floor (see the header):
   * babylon substitutes a 1×1 (0,0,0,0) texture and albedo multiplies by it.
   */
  isReady(): boolean;
  /**
   * Resolves the first time {@link isReady} would return true. A texture that
   * ERRORS also resolves it — the caller then simply keeps the flat fallback
   * colour, which is the pre-#80 floor and the correct degrade.
   */
  whenReady(): Promise<void>;
}

interface Entry extends GroundTextures {
  readonly key: string;
}

/** scene → (style@uvScale) → the four textures. See the header for the lifetime. */
const perScene = new WeakMap<Scene, Map<string, Entry>>();

function cacheFor(scene: Scene): Map<string, Entry> {
  let m = perScene.get(scene);
  if (!m) {
    m = new Map();
    perScene.set(scene, m);
  }
  return m;
}

/**
 * Load one map, and hand back a promise that settles when it is decoded and
 * uploaded — or when it FAILS.
 *
 * `gammaSpace` is the whole reason this helper exists — see groundMaterials.ts
 * note 1: only the albedo is colour; normal/orm/macro carry DATA and babylon
 * gamma-decodes anything left at the default `true`.
 *
 * ⚠️ Readiness comes from the CONSTRUCTOR's `onLoad`/`onError` (args 6 and 7 of
 * `new Texture(url, scene, noMipmap, invertY, samplingMode, onLoad, onError)`),
 * ⛔ not from `onLoadObservable` alone: a 404 never fires that observable, and a
 * promise that only ever resolves on success would leave the floor stuck on its
 * flat colour forever with nothing anywhere saying why.
 */
function dataTexture(
  url: string,
  scene: Scene,
  gammaSpace: boolean,
  wrap: boolean,
): { tex: Texture; settled: Promise<void> } {
  let done: () => void = () => {};
  const settled = new Promise<void>((res) => {
    done = res;
  });
  const tex = new Texture(
    url,
    scene,
    false,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
    () => done(),
    () => done(),
  );
  tex.gammaSpace = gammaSpace;
  const mode = wrap ? Texture.WRAP_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE;
  tex.wrapU = mode;
  tex.wrapV = mode;
  return { tex, settled };
}

function build(scene: Scene, set: GroundTextureSet, key: string, scale: number): Entry {
  const urls = groundTextureUrls(set);
  const a = dataTexture(urls.albedo, scene, true, true);
  const n = dataTexture(urls.normal, scene, false, true);
  const o = dataTexture(urls.orm, scene, false, true);
  // The detail maps repeat once per TILE_WORLD_SIZE world units. Both the floor
  // (planar UVs over the bounding square) and the rim (arc-length UVs divided
  // by the same 2R) are authored so this ONE scale is correct for both — which
  // is what lets them share these texture objects.
  const aniso =
    effectiveQuality() === "mobile" ? a.tex.anisotropicFilteringLevel : GROUND_ANISOTROPY_DESKTOP;
  for (const t of [a.tex, n.tex, o.tex]) {
    t.uScale = scale;
    t.vScale = scale;
    t.anisotropicFilteringLevel = aniso;
  }
  // The macro layer is the anti-repetition half of phase 1: stretched over the
  // zone EXACTLY ONCE (uScale = vScale = 1) and clamped, never tiled.
  const m = dataTexture(urls.macro, scene, false, false);

  const all = [a, n, o, m];
  const settled = Promise.all(all.map((x) => x.settled)).then(() => undefined);

  return {
    key,
    albedo: a.tex,
    normal: n.tex,
    orm: o.tex,
    macro: m.tex,
    isReady: () => all.every((x) => x.tex.isReady()),
    whenReady: () => settled,
  };
}

/**
 * The four textures for a style at a zone radius — from the cache when this
 * scene has already loaded them, otherwise started now and kept.
 *
 * ⭐ 這是**唯一**的入口：`ArenaGround` 不再自己 `new Texture`，所以
 * 「換一張圖 = 重抓一次 2.9 MB」那條路已經沒有了。
 */
export function acquireGroundTextures(
  scene: Scene,
  set: GroundTextureSet,
  boundaryRadius: number,
): GroundTextures {
  const scale = detailUvScale(boundaryRadius);
  const key = `${set}@${scale.toFixed(4)}`;
  const cache = cacheFor(scene);
  let entry = cache.get(key);
  if (!entry) {
    entry = build(scene, set, key, scale);
    cache.set(key, entry);
  }
  return entry;
}

/**
 * ⭐ THE SHOP-PHASE WARM (owner:「**沒有提前在商店完成讀取**」).
 *
 * Pull every style the match can rotate into, at the radius it will be used at,
 * while the player is in the market and nothing is time-critical. Round 2+ then
 * finds `isReady()` already true and swaps the map with **zero** fetch, zero
 * decode and zero upload — which is the difference between a flat-coloured
 * floor for a few frames and no transition at all.
 *
 * Idempotent: a second call is a map lookup per style.
 */
export function warmGroundTextures(
  scene: Scene,
  sets: readonly GroundTextureSet[],
  boundaryRadius: number,
): void {
  for (const set of sets) acquireGroundTextures(scene, set, boundaryRadius);
}

/** Which (style@scale) keys this scene currently holds. Diagnostics + guards. */
export function cachedGroundKeys(scene: Scene): string[] {
  return [...cacheFor(scene).keys()].sort();
}
