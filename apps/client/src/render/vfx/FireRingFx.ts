/**
 * FireRingFx — 「圈圈外會有激烈火焰」 (task #195).
 *
 * The world-space half of the shrinking fire ring: a wall of flame standing on
 * the ring's circumference, contracting with it, for the LOCAL player's duel
 * zone only.
 *
 * WHAT IT DRAWS
 *   1. THE BAND — one FLAT ANNULUS (a ribbon of `BAND_SEGMENTS` quads) lying on
 *      XZ at y ≈ 0.08 with an additive fire material (the
 *      `vfxPresets.ShockwaveRing` recipe: disableLighting + emissiveColor +
 *      alpha). ONE draw call; its 130 vertices are rewritten in place every
 *      frame from `MatchState.fireRingRadius`. It is the readable, always-
 *      present edge — the thing a player steers by.
 *
 * ⛔ 為什麼**不是** `CreateTorus` + `scaling`（GH#363，這是真的出過事的形狀）。
 *
 * 原本這裡是「單位直徑的圓環，每幀 `band.scaling.set(d, 1, d)`」。⚠️ 一個 torus
 * 的**管徑**是它自己幾何的一部分 —— 縮放整顆網格連管徑一起放大，所以
 * `thickness: 0.55` 這個「0.55 個世界單位寬的一條帶子」在半徑 20 的時候
 * 變成 **22 個世界單位寬**（`0.55 × d`，也就是 40 倍）：畫面上不是一條火線，
 * 是一片蓋掉半張圖的橘黃色圓盤。
 *
 * ⚠️ 而 `scaling.y` 留在 1 ⇒ 管子的**垂直**半徑仍是 0.275，band 掛在 y=0.08，
 * 所以它的下半部沉在 `y < 0`（地板下）。一顆 64 段的環把地板平面切開 ⇒
 * 交線是一圈 64 邊形的**鋸齒**，加上 additive 混色與每幀變動的半徑 ⇒
 * owner 2026-08-18 看到的「地圖中央一片**黃色鋸齒狀條紋**在閃，附近有一個
 * **大的黃色圈**」 —— 兩者是**同一顆網格**（issue 自己猜對了）。
 *
 * ⭐ 平面環沒有這個失敗模式**在型別上就沒有**：所有頂點的 y 都是常數，
 * 寬度是 `BAND_THICKNESS` 個世界單位（⛔ 不乘半徑），所以它既不可能穿過地板，
 * 也不可能隨著圈收縮而變成一片色塊。
 *   2. THE FLAMES — 8..12 pooled `fx.w3x.particle.flamessmoke.p00..p03`
 *      emitters, evenly placed on the rim via `swarmRingPlacements()` and
 *      re-positioned each frame as the rim closes. These are the 「激烈」 part;
 *      the band alone reads as a decal.
 *
 * WHY IT IS NOT ROUTED THROUGH `W3xEmitterRig`. That rig enforces
 * `DEFAULT_MAX_EFFECT_SEC = 12` and silently kills anything older. This band
 * has to burn for the ring's full 20 s shrink and then stay lit while the round
 * finishes, so the rig would put it out two thirds of the way through with no
 * error — exactly the class of silent failure #132 shipped.
 *
 * WHY IT IS ANCHORED TO A WORLD POSITION, NEVER TO A GLB NODE. Task #131: an
 * emitter parented to a model node inherits that node's transform, and a model
 * that never finishes loading (or is disposed on despawn) strands the emitter
 * at the origin as a permanent bright blob. The ring is arena geometry; it is
 * positioned from the zone's own centre, every frame, from numbers.
 *
 * BUDGET. `particleBudgetScale()` is re-read EVERY tick, not cached at
 * construction: the adaptive quality ladder (#43) drops particle density to 0.3
 * precisely when a lot is on screen — which is exactly when the ring is
 * burning — so a construction-time snapshot would hold the density the frame
 * before the ladder acted.
 */
import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { VfxDoc } from "@ggd/shared/content";
import { particleBudgetScale } from "../RenderConfig";
import { qualityController } from "../QualityController";
import { toParticleSystem } from "../../vfx/particleFactory";
import { swarmRingPlacements } from "./w3xFamilyRuntime";

/** The four WC3 flame/smoke emitter layers the wall is built from. */
export const FLAME_DOC_IDS = [
  "fx.w3x.particle.flamessmoke.p00",
  "fx.w3x.particle.flamessmoke.p01",
  "fx.w3x.particle.flamessmoke.p02",
  "fx.w3x.particle.flamessmoke.p03",
] as const;

/** Emitters on the rim at full particle budget, and the floor when it collapses. */
export const MAX_FLAME_EMITTERS = 12;
export const MIN_FLAME_EMITTERS = 8;

/** Band geometry. Flat on the floor, thick enough to read at combat pitch. */
const BAND_Y = 0.08;
/**
 * 帶子有多寬，**世界單位**（GH#363）。
 *
 * ⚠️ 「世界單位」是這一行的全部重點：它以前是一顆被整體縮放的 torus 的
 * `thickness`，於是實際寬度是 `0.55 × 直徑` —— 半徑 20 的時候 22 個單位寬。
 * 現在 {@link bandRingPositions} 直接把內外緣算成 `r ∓ BAND_THICKNESS / 2`，
 * ⛔ 沒有任何地方再乘半徑。
 */
export const BAND_THICKNESS = 0.55;
export const BAND_TESSELLATION = 64;
/** UV scroll speed of the band's fire texture (loops/sec). */
const BAND_SCROLL_PER_SEC = 0.9;
/** Fire colour of the band — hot orange core, not the tint's deep red. */
const BAND_COLOR: readonly [number, number, number] = [1, 0.42, 0.12];
/** Band alpha at ignition → at full closure (it gets angrier as it bites). */
const BAND_ALPHA_MIN = 0.55;
const BAND_ALPHA_MAX = 0.95;

/** How many emitters to stand on the rim at `scale` particle budget. */
export function flameEmitterCount(scale: number): number {
  const s = Number.isFinite(scale) ? Math.min(1, Math.max(0, scale)) : 1;
  const n = Math.round(MIN_FLAME_EMITTERS + (MAX_FLAME_EMITTERS - MIN_FLAME_EMITTERS) * s);
  return Math.max(MIN_FLAME_EMITTERS, Math.min(MAX_FLAME_EMITTERS, n));
}

/**
 * 帶子的內外緣半徑。⭐ 寬度**恆等於** {@link BAND_THICKNESS}（世界單位），
 * ⛔ 不隨 `ringRadius` 放大 —— 那正是 GH#363 的缺陷。
 */
export function bandRadii(ringRadius: number): { inner: number; outer: number } {
  const r = Number.isFinite(ringRadius) ? Math.max(0, ringRadius) : 0;
  const half = BAND_THICKNESS / 2;
  // 內緣夾在 0：圈收到比帶寬還小的時候要變成一片圓餅，⛔ 不是一個翻過來的環。
  return { inner: Math.max(0, r - half), outer: r + half };
}

/**
 * 平面環的頂點座標（局部空間，**y 全部是 0**）。原地寫進 `out`，⛔ 不配置。
 *
 * 佈局：`i = 0..BAND_TESSELLATION` 各兩個頂點（內緣、外緣），首尾重疊成閉環。
 * ⭐ y 是常數 ⇒ 這個網格**在型別上**不可能穿過地板（GH#363 的根因）。
 */
export function bandRingPositions(
  ringRadius: number,
  out: Float32Array,
  rect?: { halfW: number; halfD: number },
): Float32Array {
  if (rect !== undefined) return rectBandPositions(ringRadius, rect, out);
  const { inner, outer } = bandRadii(ringRadius);
  for (let i = 0; i <= BAND_TESSELLATION; i++) {
    const a = (i / BAND_TESSELLATION) * Math.PI * 2;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const o = i * 6;
    out[o] = cx * inner;
    out[o + 1] = 0;
    out[o + 2] = cz * inner;
    out[o + 3] = cx * outer;
    out[o + 4] = 0;
    out[o + 5] = cz * outer;
  }
  return out;
}

/**
 * ⭐ 矩形分區的帶子 —— **矩形的框**（GH#364）。
 *
 * ⚠️ 這不是美術偏好。sim 的 `fireRingSafeAt` 對 `bounds.kind === "rect"` 的
 * 分區用的是**等比內縮的矩形**（`k = radius / halfW`），所以短軸上的真正邊界是
 * `halfD · k`，而一個半徑 `radius` 的**圓**在那裡多畫了 `halfW/halfD` 倍
 * （出貨 24×18 ⇒ 33% ）。畫一個圓 = 告訴玩家一片會燒死他的地方是安全的。
 *
 * ⛔ 取樣按**邊**分（每邊 `BAND_TESSELLATION/4` 段），⛔ 不是按總周長：
 * 那樣四個角才會剛好落在頂點上，內外兩圈的轉角才對得齊。
 */
function rectBandPositions(
  ringRadius: number,
  rect: { halfW: number; halfD: number },
  out: Float32Array,
): Float32Array {
  const k = rect.halfW > 0 ? Math.max(0, Math.min(1, ringRadius / rect.halfW)) : 0;
  const half = BAND_THICKNESS / 2;
  const hw = rect.halfW * k;
  const hd = rect.halfD * k;
  const per = BAND_TESSELLATION / 4;
  const point = (w: number, d: number, side: number, u: number): { x: number; z: number } => {
    if (side === 0) return { x: -w + 2 * w * u, z: -d };
    if (side === 1) return { x: w, z: -d + 2 * d * u };
    if (side === 2) return { x: w - 2 * w * u, z: d };
    return { x: -w, z: d - 2 * d * u };
  };
  for (let i = 0; i <= BAND_TESSELLATION; i++) {
    const j = i === BAND_TESSELLATION ? 0 : i;
    const side = Math.floor(j / per);
    const u = (j % per) / per;
    // 內外兩圈是同一個矩形**逐軸**外擴／內縮半個帶寬 —— 邊上寬度剛好是
    // BAND_THICKNESS，轉角略寬（就是一條描邊該有的樣子）。
    const a = point(Math.max(0, hw - half), Math.max(0, hd - half), side, u);
    const b = point(hw + half, hd + half, side, u);
    const o = i * 6;
    out[o] = a.x;
    out[o + 1] = 0;
    out[o + 2] = a.z;
    out[o + 3] = b.x;
    out[o + 4] = 0;
    out[o + 5] = b.z;
  }
  return out;
}

/**
 * `count` 個均勻分布在**帶子上**的點，直接從剛寫好的頂點緩衝取樣（外緣那一排）。
 * ⭐ 火焰因此不可能與帶子分家 —— 它們讀的是同一份幾何。
 */
export function bandSamples(pos: Float32Array, count: number): { x: number; z: number }[] {
  const n = Math.max(0, Math.floor(count));
  const outArr: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const v = Math.round((i / n) * BAND_TESSELLATION) % BAND_TESSELLATION;
    outArr.push({ x: pos[v * 6 + 3]!, z: pos[v * 6 + 5]! });
  }
  return outArr;
}

/**
 * Band alpha for a shrink progress 0..1. Linear and clamped — the ring is a
 * navigational signal, so it must never dip below "clearly visible".
 */
export function bandAlphaForProgress(progress: number): number {
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return BAND_ALPHA_MIN + (BAND_ALPHA_MAX - BAND_ALPHA_MIN) * p;
}

/** One frame of ring state, straight off `MatchState` + the local zone. */
export interface FireRingFrame {
  phase: string;
  /** MatchState.fireRingTicks; -1 = disarmed */
  fireRingTicks: number;
  /** MatchState.fireRingRadius (world units) */
  fireRingRadius: number;
  /**
   * The LOCAL player's duel zone — centre + boundaryRadius. null when this
   * client has no zone (spectator, bye round, pre-spawn): the ring then draws
   * nothing at all rather than guessing at zone 0.
   *
   * ⭐ `rect` 在場地是**矩形分區**時帶上半寬半深（GH#364）。缺席 = 圓盤，
   * 也就是既有 6 張場地的行為。⚠️ 它不是裝飾：sim 對 rect 分區用的是**矩形**
   * 火圈（`fireRingSafeAt`），畫一個圓會在短軸上多畫 `halfW/halfD` 倍的
   * 「安全區」—— 而那一片是真的會燒死人的地方。
   */
  zone: { x: number; z: number; r: number; rect?: { halfW: number; halfD: number } } | null;
}

export interface FireRingFxOptions {
  /** quality-tier particle budget multiplier (default: live quality params) */
  getScale?: () => number;
  /** content seam: vfx doc by id (null = that layer is skipped) */
  vfxDocFor: (id: string) => VfxDoc | null;
}

export class FireRingFx {
  private band: Mesh | null = null;
  private bandMat: StandardMaterial | null = null;
  /** 平面環的頂點緩衝，配置一次、每幀原地重寫（⛔ 不是每幀重建網格）。 */
  private readonly bandPos = new Float32Array((BAND_TESSELLATION + 1) * 6);
  private readonly emitters: ParticleSystem[] = [];
  private readonly getScale: () => number;
  private uv = 0;
  private active = false;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly opts: FireRingFxOptions,
  ) {
    this.getScale =
      opts.getScale ??
      ((): number => particleBudgetScale(qualityController.getParams().particleDensity));
  }

  /** True while the band is on screen (introspection / tests). */
  get isActive(): boolean {
    return this.active;
  }

  /** Live emitters standing on the rim (introspection / tests). */
  get emitterCount(): number {
    return this.emitters.filter((e) => e.isStarted()).length;
  }

  /**
   * Per-frame. `frame` is null (or has no zone / no ring) → everything stops
   * and hides; there is no lingering state to go stale.
   */
  tick(nowMs: number, dtMs: number, frame: FireRingFrame | null): void {
    if (this.disposed) return;
    const zone = frame?.zone ?? null;
    const show =
      frame !== null &&
      zone !== null &&
      frame.phase === "combat" &&
      frame.fireRingTicks >= 0 &&
      frame.fireRingRadius > 0 &&
      // Before the first shrink tick the ring IS the zone boundary; drawing a
      // wall of fire on the wall is noise. It lights up the moment it moves.
      frame.fireRingRadius < zone.r;
    if (!show) {
      this.hide();
      return;
    }
    const r = frame.fireRingRadius;
    const progress = Math.min(1, Math.max(0, 1 - r / zone.r));

    // ---- the band ----------------------------------------------------------
    // ⭐ GH#363 —— **改寫頂點，⛔ 不縮放網格**。縮放會把帶寬一起乘上去
    //    （半徑 20 ⇒ 22 單位寬的一片色塊），而且只縮 XZ 會讓管子的下半部沉到
    //    地板下面切出一圈 64 邊形鋸齒。平面環兩個問題都沒有。
    const band = this.ensureBand();
    band.position.set(zone.x, BAND_Y, zone.z);
    const pos = bandRingPositions(r, this.bandPos, zone.rect);
    band.updateVerticesData(VertexBuffer.PositionKind, pos);
    band.setEnabled(true);
    const mat = this.bandMat!;
    mat.alpha = bandAlphaForProgress(progress);
    this.uv = (this.uv + (dtMs / 1000) * BAND_SCROLL_PER_SEC) % 1;
    const tex = mat.emissiveTexture as Texture | null;
    if (tex && "uOffset" in tex) tex.uOffset = this.uv;

    // ---- the flames --------------------------------------------------------
    // Budget is read EVERY tick — the adaptive ladder moves during the burn.
    const want = flameEmitterCount(this.getScale());
    this.ensureEmitters(want);
    // `swarmRingPlacements` gives the canonical even-on-the-rim layout the WC3
    // locust family uses; the ring's own radius is the layout radius, so the
    // flames walk inward with the band instead of being re-solved by hand.
    // Only `radiusWorld` and `spawnIntervalSec` are read; the rest of the
    // W3xSwarmLayout shape is object-data provenance the fire ring has none of
    // (it is arena geometry, not an imported ability) and is filled inertly.
    //
    // ⭐ GH#364 —— **矩形分區改讀 band 自己剛寫好的頂點**，⛔ 不再用圓形佈局：
    // `swarmRingPlacements` 是一個圓，而矩形分區的火圈是一個框，兩者只在四個
    // 中點重合 —— 火焰會飄在牆裡跟空地上。從 `pos` 取樣保證火焰**永遠站在
    // 那條帶子上**，因為它就是同一份幾何。
    const places =
      zone.rect === undefined
        ? swarmRingPlacements(
            {
              countPerLevel: [want],
              spawnIntervalSec: 0, // all flames burn at once — a wall, not a spawn wave
              radiusWc3: 0,
              radiusWorld: r,
              durationSec: 0,
              memberScale: 1,
              memberTint: [1, 1, 1],
              memberModel: "",
              memberModelPresent: false,
            },
            want,
          )
        : bandSamples(pos, want);
    for (let i = 0; i < this.emitters.length; i++) {
      const ps = this.emitters[i]!;
      const p = places[i];
      if (!p || i >= want) {
        if (ps.isStarted()) ps.stop();
        continue;
      }
      (ps.emitter as Vector3).set(zone.x + p.x, 0, zone.z + p.z);
      if (!ps.isStarted()) ps.start();
    }
    this.active = true;
    void nowMs;
  }

  /** Stop everything (round settled, no local zone, no state). Idempotent. */
  hide(): void {
    if (!this.active) return;
    this.active = false;
    this.band?.setEnabled(false);
    for (const ps of this.emitters) if (ps.isStarted()) ps.stop();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    for (const ps of this.emitters) {
      ps.stop();
      ps.dispose();
    }
    this.emitters.length = 0;
    this.band?.dispose(false, true);
    this.band = null;
    this.bandMat = null;
  }

  // ------------------------------------------------------------- internals --

  private ensureBand(): Mesh {
    if (this.band) return this.band;
    const mat = new StandardMaterial("fire-ring-band-mat", this.scene);
    mat.disableLighting = true;
    mat.emissiveColor = new Color3(BAND_COLOR[0], BAND_COLOR[1], BAND_COLOR[2]);
    mat.alpha = BAND_ALPHA_MIN;
    // additive so overlapping flame sprites and the band bloom together rather
    // than compositing into a dull brown edge
    mat.alphaMode = 1; // Engine.ALPHA_ADD — the numeric constant avoids the import
    mat.backFaceCulling = false;
    // ⭐ FLAT ANNULUS on XZ, vertices rewritten per frame (GH#363). ⛔ NOT a
    // torus + `scaling`: see this file's header for the failure that shipped.
    const mesh = new Mesh("fire-ring-band", this.scene);
    const vd = new VertexData();
    const positions = bandRingPositions(1, new Float32Array((BAND_TESSELLATION + 1) * 6));
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= BAND_TESSELLATION; i++) {
      normals.push(0, 1, 0, 0, 1, 0);
      // u 沿著圓周（UV 捲動用），v 橫跨帶寬
      uvs.push(i / BAND_TESSELLATION, 0, i / BAND_TESSELLATION, 1);
      if (i === BAND_TESSELLATION) break;
      const a = i * 2;
      indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    vd.positions = Array.from(positions);
    vd.normals = normals;
    vd.uvs = uvs;
    vd.indices = indices;
    // `updatable: true` —— 每幀走 `updateVerticesData`，⛔ 不重建網格。
    vd.applyToMesh(mesh, true);
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.setEnabled(false);
    this.band = mesh;
    this.bandMat = mat;
    return mesh;
  }

  /** Grow the emitter pool to `want`, cycling the four flame layers. */
  private ensureEmitters(want: number): void {
    while (this.emitters.length < Math.min(want, MAX_FLAME_EMITTERS)) {
      const i = this.emitters.length;
      const docId = FLAME_DOC_IDS[i % FLAME_DOC_IDS.length]!;
      const doc = this.opts.vfxDocFor(docId);
      if (!doc) return; // unauthored layer — degrade to fewer flames, never throw
      // ⏳ GH#570 —— `persistent: true` 是**顯式**豁免:火圈是**整個回合**都在的
      // 場地特效(它是玩家判斷「哪裡還站得住」的讀數),⛔ 不是一次性效果。
      // ⚠️ 名字前綴 `fire-ring-` 同時列在 `vfxHardCapExemptPrefixes` 裡 ——
      // 那一份是給**不走這條路**的系統用的,這一格才是這裡的答案(兩格都有不是
      // 重複,是「程式標記」與「資料豁免」各自蓋住不同的一半)。
      const ps = toParticleSystem(doc, this.scene, {
        scale: this.getScale(),
        name: `fire-ring-flame-${i}`,
        position: { x: 0, y: 0, z: 0 },
        persistent: true,
      });
      // WORLD-ANCHORED (task #131): a Vector3 emitter, never a TransformNode
      // borrowed from a champion glb that may never load or may be disposed.
      ps.emitter = new Vector3(0, 0, 0);
      this.emitters.push(ps);
    }
  }
}
