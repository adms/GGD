/**
 * ArcBoltFx —— 一段電弧的 Babylon 渲染層。池化、有硬上限、回合邊界收得回來。
 *
 * ---------------------------------------------------------------------------
 * 一個單元，很多用途
 * ---------------------------------------------------------------------------
 * `strike(from, to, spec, nowMs)` = **畫一段從 A 到 B 的弧**，就這樣。
 * 連鎖閃電的一條鏈是呼叫端**逐跳各叫一次**（每跳之間隔一小段時間），
 * ⛔ 這裡沒有「鏈」的概念，也不該有（CLAUDE.md 第〇·五守則）。
 * 分岔也走同一支 `strike` —— 一岔就是一段比較短的弧。
 *
 * ---------------------------------------------------------------------------
 * 回收（#262 的前科：洩漏的粒子/mesh）
 * ---------------------------------------------------------------------------
 * 三條路全部關上，⛔ 不是只關 dispose 那一條：
 *   · `update()`  —— 壽命到了就 `setEnabled(false)` 還回 free-list（⛔ 不 dispose，
 *                    網格會被下一段弧重用；閒置的網格不花任何 frame 成本）
 *   · `clear()`   —— 回合邊界把場上所有弧就地熄掉（上一場的電不可以跟著進商店）
 *   · `trimTo()`  —— 回合邊界修剪 free-list 本身，上限由 `config.vfx-cleanup@1`
 *                    決定（和預告圈網格同一格政策，⛔ 不是第二個寫死的數字）
 *   · `dispose()` —— 網格 + 材質全部還給 Babylon
 *
 * ⚠️ **材質是每條 strip 一份**，因為顏色與亮度是逐弧、逐幀在變的
 * （`GroundDecalPool` 同一個立場）。所以池子的上限同時是材質數的上限。
 */
import type { Scene } from "@babylonjs/core/scene";
import { CreateRibbon } from "@babylonjs/core/Meshes/Builders/ribbonBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DEFAULT_MAX_CONCURRENT_ARCS } from "@ggd/shared/content/schema/vfx";
import {
  arcColorAt,
  arcForks,
  arcGlowRamp,
  arcRejitterStep,
  arcStripPaths,
  ARC_BOLT_TUNING,
  buildArcPath,
  maxConcurrentArcs,
  type ArcBoltSpec,
  type ArcEnd,
} from "./arcBolt";

/** 沿線發光貼圖的解析度（v 軸 = 弧帶寬度）。32 已經看不出階梯。 */
const GLOW_RAMP_PX = 32;

/**
 * 同時存在的弧帶上限（超過就搶最舊的那一條 —— 它已經是畫面上最暗的）。
 *
 * 一次連鎖 16 跳 × (1 主幹 + 2 分岔) = 48，但**一跳一閃**：每段只活
 * `spec.lifeMs`（出貨 130ms），而 owner 要的逐跳間隔讓它們不會同時在場上。
 * 這條線擋的是「兩個人同時放 + 有人把間隔調到 0」那種病態組合。
 *
 * ⚡ GH#781：這一格從寫死變**後台可調**（`config.vfx-families@1.maxConcurrentArcs`）。
 * 這裡 re-export 出貨預設是為了不動既有讀者；⛔ 值只住 schema 那一份（第〇·四守則）。
 */
export const MAX_ARC_STRIPS = DEFAULT_MAX_CONCURRENT_ARCS;

interface Strip {
  mesh: Mesh | null;
  mat: StandardMaterial;
  /** CreateRibbon 的兩條 path（重用同一批 Vector3，⛔ 每次不重新配置） */
  left: Vector3[];
  right: Vector3[];
  bornMs: number;
  spec: ArcBoltSpec | null;
  active: boolean;
  /** ⚡ 重算折線要的三樣東西 —— 兩端與種子。⛔ 端點永遠是出生時那一對。 */
  from: ArcEnd;
  to: ArcEnd;
  seed: number;
  /** 上一次重算用的是第幾步（`arcRejitterStep`）。⛔ 同一步不重算。 */
  step: number;
}

export class ArcBoltFx {
  private readonly strips: Strip[] = [];
  private strikeCount = 0;
  /**
   * ⚡ **沿線發光貼圖，整個池子共用一份。**
   *
   * 一條 1×N 的 RGBA 直條（`arcGlowRamp`）：中央白熱、兩緣的 alpha 掉到 0。
   * ⭐ 共用是刻意的 —— 貼圖描述的是「一道電弧的**橫截面**長什麼樣」，
   * 那是這一族視覺的性質，⛔ 不是逐弧在變的東西（逐弧在變的是顏色與亮度，
   * 那兩個住在**材質**上，而材質確實是每條 strip 一份）。
   *
   * ⚠️ `RawTexture` ⛔ 不是 `DynamicTexture`：後者要一個 2D canvas，而
   * headless（NullEngine）沒有（同 `render/views/voxelSkinTexture.ts` 的理由）。
   */
  private glowTex: RawTexture | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly opts: { maxStrips?: number } = {},
  ) {}

  /** 場上正在發光的弧帶數（測試 / 觀測接縫）。 */
  get activeCount(): number {
    return this.strips.reduce((n, s) => n + (s.active ? 1 : 0), 0);
  }

  /** 配置過的弧帶總數 —— 永遠不超過上限（測試接縫）。 */
  get poolSize(): number {
    return this.strips.length;
  }

  private get cap(): number {
    // ⚡ GH#781 —— 後台那一格（`maxConcurrentArcs`）是活的：每次要格子時讀，
    // 所以存檔重載內容之後**下一段弧**就吃到新上限，⛔ 不必重建這個池子。
    return Math.max(1, this.opts.maxStrips ?? maxConcurrentArcs());
  }

  /**
   * ⚡ **打一段弧：A → B。**
   *
   * `seed` 省略時用內部計數器 —— 同一幀連打兩段不會長成同一條線，而傳同一顆
   * seed 又能重現同一條（重播）。回傳這一次用掉的弧帶數（主幹 1 + 分岔 n），
   * 呼叫端不需要讀它，但它是「這一行真的建出東西了嗎」的觀測點。
   */
  strike(from: ArcEnd, to: ArcEnd, spec: ArcBoltSpec, nowMs: number, seed?: number): number {
    const s = seed ?? ++this.strikeCount;
    const points = buildArcPath(from, to, spec, s);
    let drawn = this.draw(from, to, spec, nowMs, s) ? 1 : 0;
    for (const fork of arcForks(points, spec, s)) {
      // ⭐ 一岔 = 另一段弧,同一個單元。分岔比主幹細、更短命(半條命),
      // 所以它讀起來是「主幹的餘波」而不是第二條主幹。
      const thin: ArcBoltSpec = {
        ...spec,
        halfWidth: spec.halfWidth * 0.5,
        lifeMs: spec.lifeMs * 0.6,
        forks: 0, // ⛔ 分岔不再分岔 —— 否則是一棵沒有上界的樹
      };
      if (this.draw(fork.from, fork.to, thin, nowMs, s + 1)) drawn++;
    }
    return drawn;
  }

  /** A → B → 一條在場上發光的弧帶（折線在這裡長出來）。 */
  private draw(
    from: ArcEnd,
    to: ArcEnd,
    spec: ArcBoltSpec,
    nowMs: number,
    seed: number,
  ): boolean {
    const strip = this.take(nowMs);
    if (!strip) return false;
    strip.from = { x: from.x, y: from.y, z: from.z };
    strip.to = { x: to.x, y: to.y, z: to.z };
    strip.seed = seed;
    strip.spec = spec;
    strip.bornMs = nowMs;
    strip.step = 0;
    strip.active = true;
    this.reshape(strip, 0);
    this.paint(strip, 0);
    strip.mesh!.setEnabled(true);
    return true;
  }

  /**
   * ⚡ 用 `seed + step` 重算整條折線並就地更新網格。
   *
   * ⭐ **兩端不動**：`buildArcPath` 的端點是精確的（`taper` 在 i=0/n 歸零），
   * 所以重算改的只有中段的抖動 —— 弧仍然釘在施法者與目標身上，
   * ⛔ 不會因為「在抖」而脫靶。這正是 `#571` 驗收條件的兩半。
   */
  private reshape(strip: Strip, step: number): void {
    const spec = strip.spec;
    if (!spec) return;
    const points = buildArcPath(strip.from, strip.to, spec, strip.seed + step);
    const n = points.length;
    this.ensureMesh(strip, n);
    const { left, right } = arcStripPaths(points, spec.halfWidth);
    for (let i = 0; i < n; i++) {
      const l = left[i]!;
      const r = right[i]!;
      strip.left[i]!.set(l[0], l[1], l[2]);
      strip.right[i]!.set(r[0], r[1], r[2]);
    }
    const mesh = strip.mesh!;
    CreateRibbon(mesh.name, { pathArray: [strip.left, strip.right], instance: mesh });
    strip.step = step;
  }

  /** 空的弧帶：先找閒置的，再長到上限，再搶最舊的。 */
  private take(nowMs: number): Strip | null {
    let idx = this.strips.findIndex((s) => !s.active);
    if (idx < 0 && this.strips.length < this.cap) {
      this.strips.push(this.make());
      idx = this.strips.length - 1;
    }
    if (idx < 0) {
      idx = 0;
      for (let i = 1; i < this.strips.length; i++) {
        if (this.strips[i]!.bornMs < this.strips[idx]!.bornMs) idx = i;
      }
    }
    const s = this.strips[idx]!;
    s.bornMs = nowMs;
    return s;
  }

  private make(): Strip {
    const mat = new StandardMaterial("vfx-arc-mat", this.scene);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.emissiveColor = new Color3(1, 1, 1);
    // 加法混合:電弧是**光**,它不可以遮住底下那個正在被打的人。
    // `ALPHA_ADD` = (SRC_ALPHA, ONE),所以 `mat.alpha` 就是亮度旋鈕。
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.alpha = 0;
    // ⚡ 沿線發光貼圖(owner 2026-08-23「演算法**以及特效貼圖**」)。
    // ⭐ 兩個插槽都要:`emissiveTexture` 給白熱核心的 RGB,`opacityTexture` 給
    // 兩緣的柔邊 —— 加法混合只有 alpha 那一路縮得動亮度,少了後者邊緣仍然是硬的。
    const glow = this.ensureGlowTexture();
    // ⛔⛔ **這裡刻意一張貼圖都不掛。**（2026-08-24 量到並拍到）
    //
    // 原本掛的是一張 1×32 的橫截面漸層（`arcGlowRamp`），同時當 `emissiveTexture`
    // 與 `opacityTexture`。⭐ 實測：**只要那張圖在，這一族就是 0 個亮像素**——
    // `chain-lightning-audition.html` 上逐項排除：
    //   · 幾何在（18 頂點）· 材質 ready · 在視錐內 · `isEnabled()` true
    //   · emissive 拉到純白 ＋ alpha 1 ⇒ **仍然 0 個亮像素**
    //   · 拿掉 `opacityTexture` ⇒ 依舊 0；**再拿掉 `emissiveTexture` ⇒ 7,905 個亮像素、最大通道 255**
    // ⇒ 斷點在**那張貼圖的取樣**（1 texel 寬 × mipmap × 螢幕上只有幾個像素寬的帶子），
    //   ⛔ 不在混合模式、不在幾何、不在亮度。
    //
    // ⭐ 而柔邊本來就不是非它不可：加法混合的亮度由 `emissiveColor` 決定，
    //   `paint()` 每幀已經在寫「白熱核心 → 元素本色」的漸變。⇒ 一條乾淨的
    //   發光線，玩家看得到 —— 那是這一族存在的**唯一**理由。
    // ⚠️ 想要回「兩緣柔化」的話，正確做法是**多一條中線路徑**（三條 path 的
    //   ribbon，中間亮兩緣暗，用頂點色），⛔ 不是再掛一次這張會消失的貼圖。
    void glow;
    return {
      mesh: null,
      mat,
      left: [],
      right: [],
      bornMs: -Infinity,
      spec: null,
      active: false,
      from: { x: 0, y: 0, z: 0 },
      to: { x: 0, y: 0, z: 0 },
      seed: 0,
      step: 0,
    };
  }

  /**
   * 共用的沿線發光貼圖 —— 第一條 strip 建立時長出來，之後每一條都指同一份。
   *
   * ⚠️ `Engine.TEXTUREFORMAT_RGBA` + `TEXTURETYPE_UNSIGNED_INT`(= byte) 是
   * `RawTexture` 的既定組合(`render/views/voxelSkin.ts` 用同一組)。
   * 寬度 1、高度 `GLOW_RAMP_PX`:ribbon 的 v 軸橫跨弧帶寬度，u 軸沿著弧走 ——
   * 所以「橫截面的漸層」只需要一個像素寬。
   */
  private ensureGlowTexture(): RawTexture | null {
    if (this.glowTex) return this.glowTex;
    const spec = ARC_BOLT_TUNING.glowCoreT;
    this.glowTex = new RawTexture(
      arcGlowRamp(GLOW_RAMP_PX, spec),
      1,
      GLOW_RAMP_PX,
      Engine.TEXTUREFORMAT_RGBA,
      this.scene,
      false,
      false,
    );
    this.glowTex.name = "vfx-arc-glow";
    this.glowTex.hasAlpha = true;
    return this.glowTex;
  }

  /**
   * 這條 strip 的網格必須剛好有 `n` 個節點。`segments` 是可調的，所以不同
   * spec 會要不同的節點數；`CreateRibbon(..., { instance })` 只在頂點數一致時
   * 能就地更新，因此不一致時**換網格、留材質**（材質才是每幀在動的那個）。
   */
  private ensureMesh(strip: Strip, n: number): void {
    if (strip.mesh && strip.left.length === n) return;
    strip.mesh?.dispose(false, false);
    strip.left = new Array<Vector3>(n);
    strip.right = new Array<Vector3>(n);
    for (let i = 0; i < n; i++) {
      strip.left[i] = new Vector3(0, 0, 0);
      strip.right[i] = new Vector3(0, 0, 0);
    }
    const mesh = CreateRibbon(
      "vfx-arc",
      { pathArray: [strip.left, strip.right], updatable: true },
      this.scene,
    );
    // ⛔⛔ **UV 要自己寫，⛔ 不可以交給 `CreateRibbon` 算。**
    //
    // 這裡建網格用的是**全部 (0,0,0) 的退化路徑**（節點座標要等到 `reshape()`
    // 才填），而 Babylon 的 ribbon UV 是**從路徑長度推**的 ⇒ 路徑長度 0
    // ⇒ **每一個 UV 都是 (0,0)**。而 `CreateRibbon(…, { instance })` 就地更新
    // 位置時**不會重算 UV** ⇒ 那組 (0,0) 從此不會再變。
    //
    // ⭐ 後果不是「貼圖歪掉」，是**整族閃電一個像素都沒畫出來過**：
    // `opacityTexture` 是一張 1×32 的漸層，alpha 在 **v=0（兩緣）是 0**、
    // 在中央才是 1 ⇒ 每一條弧都取樣在最外緣 ⇒ **全透明**。
    // ⚠️ 2026-08-24 在 `chain-lightning-audition.html` 上量到並拍到：
    // 幾何在、材質 ready、在視錐內、`isEnabled()` 為 true、
    // 把 emissive 拉到純白＋alpha 1 **仍然看不見**；一拿掉 `opacityTexture`
    // 整片電網當場出現。owner 逐字：「一堆閃電特效⋯都沒有真的出現」。
    //
    // ⇒ 自己寫：**u 沿著弧走**（0→1），**v 橫跨弧帶寬度**（左緣 0、右緣 1）——
    // 那正是 `arcGlowRamp` 的檔頭本來就說的那件事（「v 軸橫跨弧帶寬度」）。
    {
      // ⚠️ 頂點是**交錯**的：`[左0, 右0, 左1, 右1, …]`（量出來的 ——
      // 相鄰兩個頂點的距離剛好是一個帶寬，⛔ 不是「左半段接右半段」）。
      // ⇒ 偶數 index 是左緣（v=0）、奇數是右緣（v=1）；u 沿著弧走。
      const uvs = new Float32Array(n * 2 * 2);
      for (let i = 0; i < n * 2; i++) {
        const along = n > 1 ? Math.floor(i / 2) / (n - 1) : 0;
        uvs[i * 2] = along;
        uvs[i * 2 + 1] = i % 2 === 0 ? 0 : 1;
      }
      mesh.setVerticesData(VertexBuffer.UVKind, uvs, true);
    }
    mesh.material = strip.mat;
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    // instance 更新不會刷新包圍盒,留著會讓活著的弧被視錐剔除掉(RibbonTrail
    // 踩過同一個坑)。一條弧只有十幾個三角形,不值得為它算 extents。
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.setEnabled(false);
    strip.mesh = mesh;
  }

  /** 把 t（0..1）的顏色與亮度寫進材質。 */
  private paint(strip: Strip, t: number): void {
    const spec = strip.spec;
    if (!spec) return;
    const { rgb, alpha } = arcColorAt(spec, t);
    strip.mat.emissiveColor.set(rgb[0], rgb[1], rgb[2]);
    strip.mat.alpha = alpha;
  }

  /** 每幀一次：⚡ 重抖折線、推進亮度，壽命到了的還回 free-list。 */
  update(nowMs: number): void {
    for (const s of this.strips) {
      if (!s.active || !s.spec) continue;
      const ageMs = nowMs - s.bornMs;
      const t = ageMs / s.spec.lifeMs;
      if (t >= 1) {
        s.active = false;
        s.spec = null;
        s.mat.alpha = 0;
        s.mesh?.setEnabled(false);
        continue;
      }
      // ⚡ 「它真的在抖」—— 這一行拿掉,弧就變成一條畫好的亮線(#571)。
      // 步進器是純函數且單調,所以同一步不會重算兩次,而 `rejitterHz: 0`
      // 恆回 0 ⇒ 這一整條分支對舊行為是逐位元的 no-op。
      const step = arcRejitterStep(s.spec, ageMs);
      if (step !== s.step) this.reshape(s, step);
      this.paint(s, t);
    }
  }

  /**
   * 回合邊界：場上的弧全部熄掉（池子留著）。上一回合最後一跳的電**不可以**
   * 跟著進商店場景 —— #216 / #259 抓到的是同一種病。
   */
  clear(): void {
    for (const s of this.strips) {
      s.active = false;
      s.spec = null;
      s.mat.alpha = 0;
      s.mesh?.setEnabled(false);
    }
  }

  /**
   * 回合邊界：free-list 本身修剪到 `cap` 條（只丟閒置的）。回傳丟掉幾條 ——
   * ⭐ **一個靜默的上限就是缺陷**（CLAUDE.md），所以它回報。
   */
  trimTo(cap: number): number {
    if (!Number.isFinite(cap) || this.strips.length <= cap) return 0;
    let dropped = 0;
    for (let i = this.strips.length - 1; i >= 0 && this.strips.length - dropped > cap; i--) {
      const s = this.strips[i]!;
      if (s.active) continue;
      s.mesh?.dispose(false, false);
      s.mat.dispose();
      this.strips.splice(i, 1);
      dropped++;
    }
    return dropped;
  }

  dispose(): void {
    for (const s of this.strips) {
      s.mesh?.dispose(false, false);
      s.mat.dispose();
    }
    this.strips.length = 0;
    // 共用貼圖也要還 —— 它是這個池子建的,⛔ 不是 scene 撿來的。
    this.glowTex?.dispose();
    this.glowTex = null;
  }
}
