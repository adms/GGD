/**
 * Telegraph — ground ring + magic-circle fill for AoE casts, with a RESOLVE
 * POP payoff (task #33 retune). The outer ring shows the full area
 * immediately (readability-critical — unchanged); the inner disc scale-fills
 * over the telegraph duration while slowly spinning. When the AoE actually
 * FIRES (fill complete) the moment lands: an expanding ground shockwave ring
 * + a stretched ember kick + a low-alpha dust body puff, then the telegraph
 * fades with an exponential-out curve instead of the old linear fade.
 *
 * Zero per-cast allocation: ring/fill/shockwave meshes AND the kick particle
 * systems come from per-scene free-list pools (the magic-circle texture is
 * loaded once per scene, not per cast).
 */
import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import {
  BurstPool,
  ringShape,
  hotToCoolStops,
  popShrinkStops,
  softBodyColorStops,
  type BurstSpec,
  type RingSpec,
  type Rgb,
} from "./vfxPresets";
import {
  paletteFor,
  telegraphAlpha,
  telegraphPulse,
  type TelegraphPalette,
  type TelegraphRelation,
} from "./telegraphChannel";
// ⭐ owner 2026-08-23（[優先]）——「施法範圍預覽可以參考 w3x 的**白色魔法陣**」。
// 值住 `config.ui-cues@1`（後台『畫面提示』頁），⛔ 不是這個檔裡的兩個字面值。
import { uiCues } from "../ui/uiCuesConfig";

const MAGIC_CIRCLE_URL = "/content/assets/textures/particles/magic_02.png";
const SPIN_RAD_PER_MS = 0.0012;

/** Telegraph identity colors (kept from the pre-retune look). */
const RING_TINT: Rgb = [0.95, 0.45, 0.2];
const FILL_TINT: Rgb = [1.0, 0.55, 0.25];
/**
 * ⭐【白色魔法陣】的填滿色（owner 2026-08-23）。
 *
 * ⚠️ **只有填滿那一層變白，外圈永遠是通道色。** #228 的第 4 條（敵／友／自己一眼
 * 分得出來）不可以被這一格吃掉 —— 一個滿地都是白圈的畫面，「來襲的 AoE」和
 * 「我自己剛剛瞄的那一發」會長得一模一樣，而那正是 `range-guide.json` 的註解
 * 特別記下「incoming 的紅刻意離兩組預覽色都很遠」的理由。
 */
const RUNE_TINT: Rgb = [1, 1, 1];
/**
 * Exported so the cast-telegraph PILLAR can be asserted against the real
 * number rather than a copied literal: the ground ring is the "where does it
 * land" contract and the column at the caster's feet may never out-shout it.
 */
export const BASE_ALPHA = 0.85;

/** Resolve-pop shockwave life (ms) — a punch accent, not a second telegraph. */
export const SHOCKWAVE_MS = 280;
/** Fill pops up to +12% scale while it fades — the "fires NOW" overshoot. */
const RESOLVE_POP_SCALE = 0.12;
/** Free-list cap per mesh kind (beyond it, released meshes are disposed). */
const MESH_POOL_CAP = 8;

/**
 * Pool key for per-radius ring meshes. The ring's diameter is BAKED into its
 * geometry (so the torus thickness stays a true 0.12 at every radius), which
 * means a pooled ring may only be reused for the radius it was built at — the
 * telegraph is the readability contract for "the AoE lands HERE" and must not
 * be off by a bucket width. 0.01u granularity: exact for authored ability
 * radii, still one shared free-list per distinct radius.
 */
function radiusKey(radius: number): string {
  return radius.toFixed(2);
}

// ---------------------------------------------------------------------------
// Per-scene shared assets: texture + mesh free-lists + kick particle pool
// ---------------------------------------------------------------------------

interface SharedAssets {
  circleTex: Texture;
  /** telegraph rings, free-list per EXACT radius (diameter is baked in) */
  rings: Map<string, Mesh[]>;
  /** unit magic-circle planes (scaled per cast) */
  fills: Mesh[];
  /** unit shockwave tori (scaled per frame while expanding) */
  shocks: Mesh[];
  /** pooled ember/dust kick systems (keys bake the radius bucket) */
  kicks: BurstPool;
}

const sharedByScene = new WeakMap<Scene, SharedAssets>();

function sharedFor(scene: Scene): SharedAssets {
  let s = sharedByScene.get(scene);
  if (!s) {
    const circleTex = new Texture(MAGIC_CIRCLE_URL, scene);
    circleTex.hasAlpha = true;
    s = { circleTex, rings: new Map(), fills: [], shocks: [], kicks: new BurstPool(scene) };
    sharedByScene.set(scene, s);
  }
  return s;
}

/** Test/observability seam: pooled free-list sizes for a scene. */
export function telegraphPoolStats(scene: Scene): { rings: number; fills: number; shocks: number } {
  const s = sharedByScene.get(scene);
  if (!s) return { rings: 0, fills: 0, shocks: 0 };
  let rings = 0;
  for (const list of s.rings.values()) rings += list.length;
  return { rings, fills: s.fills.length, shocks: s.shocks.length };
}

/**
 * ROUND-BOUNDARY RECLAIM (task #262) —— 把這個 scene 的預告圈 free-list 修剪到
 * `maxRings` 個網格，並把 fill / shockwave 的池子一起帶下來。
 *
 * 為什麼 #259 沒有清到這裡。#259 清的是**有主的**東西：`TelegraphLayer.live`
 * 裡的每一個 Live、VfxSystem 自己的 pool、rig 的 free-list。而 ring 網格在
 * `release()` 之後就不屬於任何 Telegraph 了 —— 它在 `sharedByScene` 這張
 * per-scene 的 WeakMap 裡，key 是**半徑字串**，一個 key 上限 8 個。沒有人清它，
 * `TelegraphLayer.dispose()` 也不清（它只走 `live`）。arena 的 Scene 活過整場
 * 比賽，所以那些網格（每一個帶一份自己的 StandardMaterial）從第一次施法起
 * 就留在 `scene.meshes` 裡，每一張 frame 都被走訪。
 *
 * 實測（`__probe`，60 個不同半徑 × 6 回合）：`dispose()` 之後 scene 上仍有
 * 72 mesh / 73 material / 13 texture / 12 particleSystem。
 *
 * ⚠️ 修剪的是 **free-list**，不是場上正在演的網格 —— 那些不在 list 裡（它們
 * 在某個 Telegraph 手上，`release()` 才會回來）。所以在戰鬥中呼叫也不會讓
 * 任何一個預告圈消失；只是下一次要用的時候重建。
 *
 * @param maxRings 這個 scene 允許留下的 ring 網格總數（跨所有半徑）。
 * @returns 這一次真的被 dispose 掉的網格數（測試/診斷用）。
 */
export function trimTelegraphPools(scene: Scene, maxRings: number): number {
  const s = sharedByScene.get(scene);
  if (!s) return 0;
  const cap = Math.max(0, Math.floor(maxRings));
  let freed = 0;
  // Map 迭代順序 = 插入順序：先丟掉最早出現的半徑，它們最可能是上一張地圖/
  // 上一組英雄的。先算總數，再從頭砍到 cap。
  let live = 0;
  for (const list of s.rings.values()) live += list.length;
  for (const [key, list] of s.rings) {
    while (live > cap && list.length > 0) {
      list.pop()!.dispose(false, true);
      live--;
      freed++;
    }
    if (list.length === 0) s.rings.delete(key);
    if (live <= cap) break;
  }
  // fill / shockwave 是 UNIT 網格（每次用的時候縮放），所以它們的池子本來就
  // 只有一條、上限 MESH_POOL_CAP。cap 0 的時候一起帶走，否則留著 —— 留 8 個
  // 單位網格的代價遠小於每一次施法重建。
  if (cap === 0) {
    for (const m of s.fills.splice(0)) {
      disposeButKeepSharedTextures(m);
      freed++;
    }
    for (const m of s.shocks.splice(0)) {
      disposeButKeepSharedTextures(m);
      freed++;
    }
  }
  return freed;
}

/**
 * ⛔ 這個函式存在的唯一理由：`AbstractMesh.dispose(doNotRecurse, disposeMaterialAndTextures)`
 * 的**第二個參數**會一路傳到 `material.dispose(false, true)`，把材質引用到的每一張
 * 貼圖也 dispose 掉 —— 而 fill / shock 的材質指的是
 * `sharedFor()` **每個 scene 只建一次的共用 `circleTex`**（見下面 `makeFill`）。
 *
 * 也就是說，原本的 `m.dispose(false, true)` 會在**第一個**回合邊界就殺掉那張共用貼圖，
 * 而 `trimTelegraphPools` 不會刪 `sharedByScene` 的條目，所以 `s.circleTex` 仍指著一張
 * 死掉的 Texture。第二回合建出來的新材質又指回同一張，`isBlocking` 預設 true →
 * `isReadyOrNotBlocking()` 恆為 false → `StandardMaterial.isReadyForSubMesh` 直接
 * `return false` → **那個 submesh 一張 frame 都不會被畫**。
 *
 * 症狀：#228「技能預告特效要看得見才來得及閃」的核心元件——隨吟唱填滿的魔法陣圓盤——
 * 從第 2 回合起在**出貨預設**（`purgeSharedPoolsOnRoundEnd: true`）下靜悄悄消失。
 * 外圈 ring 沒有貼圖，所以外圈還在，肉眼上像「預告變弱」而不是「預告不見」。
 *
 * ⚠️ 這是「修洩漏反而製造第①種故障（算出來但畫不出來）」的實例。守衛見
 * `telegraphSharedTextureSurvives.test.ts`：它讀的是 `isReadyOrNotBlocking()`（行為），
 * 不是 `scene.meshes.length`（屬性）—— 舊的那 33 條測試全綠而回歸就活在裡面，
 * 正是因為它們量的是後者。
 */
function disposeButKeepSharedTextures(m: Mesh): void {
  const mat = m.material;
  // 網格自己走掉，但**不要**碰材質（第二個參數 = false）。
  m.dispose(false, false);
  // 材質是每個網格自己的，該回收；`forceDisposeTextures = false` 讓共用貼圖活下來。
  mat?.dispose(true, false);
}

/**
 * SCENE TEARDOWN (task #262). Give back everything `sharedFor` ever built for
 * this scene — including the magic-circle Texture and the kick BurstPool, which
 * `trimTelegraphPools` deliberately leaves alone.
 *
 * ⚠️ 那句「deliberately leaves alone」在 2026-07-30 之前是**假的**：`trimTelegraphPools`
 * 用 `m.dispose(false, true)` 就把共用貼圖殺掉了，而這段註解讓後續的推理全部建立在
 * 一句謊話上（第三守則：註解會說謊，去驗證）。現在它是真的，靠的是
 * `disposeButKeepSharedTextures` 那個函式 —— 不要把它改回單一個 dispose 呼叫。
 *
 * `scene.dispose()` would eventually free these too, but the arena Scene is NOT
 * torn down between matches on every path, and a leak that only the GC can see
 * is exactly the shape #262 is about. Idempotent: the WeakMap entry is dropped,
 * so the next `sharedFor` rebuilds from scratch.
 */
export function disposeTelegraphShared(scene: Scene): void {
  const s = sharedByScene.get(scene);
  if (!s) return;
  trimTelegraphPools(scene, 0);
  s.kicks.dispose();
  s.circleTex.dispose();
  sharedByScene.delete(scene);
}

/**
 * The pre-#228 look, kept as the DEFAULT so every caller that has no relation
 * to express (guardianMark: a neutral tower is hostile to everyone equally)
 * renders exactly as it did. Callers that DO know the relation pass
 * `paletteFor(relation)` and get the #228 channel colours instead.
 */
const LEGACY_PALETTE: TelegraphPalette = {
  ring: RING_TINT,
  fill: FILL_TINT,
  alpha: BASE_ALPHA,
  dashed: false,
  pulseHz: 0,
  startAlphaFactor: 1,
};

/** Convenience: a mesh's emissive Color3 (every mesh here uses StandardMaterial). */
function tintOf(mesh: Mesh): Color3 {
  return (mesh.material as StandardMaterial).emissiveColor;
}

/** Palette for a caster RELATION — the seam VfxSystem/TelegraphLayer use. */
export function telegraphPaletteFor(relation: TelegraphRelation): TelegraphPalette {
  return paletteFor(relation);
}

function emissiveMat(name: string, scene: Scene, tint: Rgb): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.disableLighting = true;
  mat.emissiveColor = new Color3(tint[0], tint[1], tint[2]);
  mat.alpha = BASE_ALPHA;
  return mat;
}

function release(list: Mesh[], mesh: Mesh): void {
  mesh.setEnabled(false);
  if (list.length >= MESH_POOL_CAP) mesh.dispose(false, true);
  else list.push(mesh);
}

// ---------------------------------------------------------------------------
// Resolve-pop kick specs (vfxPresets toolkit ramps; keys bake the radius)
// ---------------------------------------------------------------------------

function emberKickSpec(radius: number): BurstSpec {
  return {
    count: 14,
    lifetimeSec: { min: 0.15, max: 0.3 },
    speed: { min: 5, max: 8.5 },
    sizeStops: popShrinkStops(0.3),
    colorStops: hotToCoolStops(FILL_TINT),
    blend: "additive",
    gravityY: -12,
    drag: 0.4,
    stretched: true,
    tailLength: 2.2,
    emitterRadius: Math.max(0.15, radius * 0.5),
    texture: "assets/textures/particles/spark_05_rotated.png",
  };
}

function dustKickSpec(radius: number): BurstSpec {
  return {
    count: 12,
    lifetimeSec: { min: 0.3, max: 0.5 },
    speed: { min: 2.2, max: 4 },
    sizeStops: popShrinkStops(0.8, { popT: 0.25 }),
    colorStops: softBodyColorStops([0.5, 0.44, 0.38], 0.3),
    blend: "alpha", // standard blend = the weight layer
    gravityY: 0.6,
    drag: 0.85,
    emitterRadius: Math.max(0.2, radius * 0.6),
    texture: "assets/textures/particles/smoke_05.png",
  };
}

// ---------------------------------------------------------------------------
// Telegraph
// ---------------------------------------------------------------------------

/**
 * Per-instance look/behaviour knobs added by task #228. All optional, so the
 * pre-#228 positional constructor keeps working unchanged.
 */
export interface TelegraphOptions {
  /**
   * Which CHANNEL this ring belongs to — the whole point of #228's requirement
   * 4. Defaults to the pre-#228 amber, which is what `guardianMark` and any
   * relation-less caller still get.
   */
  palette?: TelegraphPalette;
  /**
   * Budget degradation (telegraphChannel.telegraphTier === "outline"): ring
   * only, no magic-circle fill and no resolve kick. Still warns, costs almost
   * nothing, and keeps a crowded floor readable.
   */
  outlineOnly?: boolean;
  /**
   * Suppress the resolve PAYOFF (shockwave + ember/dust kick) but keep the
   * fade. Used by the instant-cast landing flash: an ability with no wind-up
   * has no dodge window, so it gets a "it landed HERE" mark, not a full
   * pop on top of the impact FX that already fire on the same frame.
   */
  quiet?: boolean;
}

export class Telegraph {
  private readonly shared: SharedAssets;
  private readonly ringKey: string;
  private ring: Mesh | null;
  private fill: Mesh | null;
  private shock: Mesh | null = null;
  private readonly bornMs: number;
  private resolvedAtMs = -1;
  /**
   * When the FADE clock starts. Anchored to the moment the fill COMPLETED, not
   * to the frame the pop happened, so a frame-quantised update cannot make a
   * telegraph linger past its window.
   */
  private fadeAnchorMs = -1;
  private readonly palette: TelegraphPalette;
  private readonly outlineOnly: boolean;
  private readonly quiet: boolean;
  /**
   * ⭐【白色魔法陣】—— 填滿那一層的色與不透明度上限，在**建構時**從
   * `config.ui-cues@1` 解析一次。
   *
   * ⛔ 不在 `update()` 裡每幀讀：一次施法的預告在它活著的期間不可以換樣式
   * （後台存檔的那一刻剛好有一發在飛 = 一個變色到一半的圈）。
   */
  private readonly fillTint: Rgb;
  private readonly fillAlphaScale: number;
  /**
   * Externally-driven wind-up fraction (task #228). `null` = fall back to the
   * wall-clock `fillMs` timer, which is what the pre-#228 callers use.
   *
   * WHY IT EXISTS. A wall-clock fill DRIFTS from the sim: `CastResolveSystem`
   * pauses `ticksLeft` during hitstop and hitstun and aborts on stun/knockdown,
   * so a locally-timed ring both fills too early and still fires its "it lands
   * HERE" pop for a cast that was interrupted. Driven from the cast bar's own
   * source (`CastTracker.progressFor`) instead, the ring can never disagree
   * with the bar the player is reading above the caster's head.
   */
  private drivenT: number | null = null;
  done = false;

  constructor(
    private readonly scene: Scene,
    private x: number,
    private z: number,
    private readonly radius: number,
    nowMs: number,
    private readonly fillMs = 300,
    private readonly holdMs = 150,
    opts: TelegraphOptions = {},
  ) {
    this.bornMs = nowMs;
    this.shared = sharedFor(scene);
    this.ringKey = radiusKey(radius);
    this.palette = opts.palette ?? LEGACY_PALETTE;
    this.outlineOnly = opts.outlineOnly === true;
    this.quiet = opts.quiet === true || this.outlineOnly;
    // ⭐ owner 2026-08-23 —— 白色魔法陣。關掉就是 #228 的通道色填滿（rollback）。
    const cues = uiCues();
    this.fillTint = cues.telegraphRune ? RUNE_TINT : this.palette.fill;
    this.fillAlphaScale = cues.telegraphRune ? cues.telegraphRuneAlpha : 1;

    // ---- outer ring (pooled per exact radius: thickness stays 0.12) ----
    let list = this.shared.rings.get(this.ringKey);
    if (!list) {
      list = [];
      this.shared.rings.set(this.ringKey, list);
    }
    this.ring =
      list.pop() ??
      MeshBuilder.CreateTorus(
        "telegraph-ring",
        { diameter: radius * 2, thickness: 0.12, tessellation: 48 },
        scene,
      );
    if (!this.ring.material) this.ring.material = emissiveMat("telegraph-ring", scene, this.palette.ring);
    // A POOLED mesh keeps the material it was built with, so the channel tint
    // has to be (re)applied on every acquire or a recycled enemy ring would
    // render an ally's cast in danger crimson.
    tintOf(this.ring).set(this.palette.ring[0], this.palette.ring[1], this.palette.ring[2]);
    (this.ring.material as StandardMaterial).alpha = telegraphAlpha(this.palette, 0);
    this.ring.position.set(x, 0.06, z);
    this.ring.isPickable = false;
    this.ring.setEnabled(true);

    // ---- magic-circle fill (pooled unit plane, scaled per cast) ----
    if (this.outlineOnly) {
      this.fill = null;
      return;
    }
    this.fill =
      this.shared.fills.pop() ??
      // Keep the fill circular in geometry as well as in the texture alpha.
      // If a browser/GPU/material regression ever ignores the PNG alpha, a
      // plane exposes a giant square card in actual play.  A disc degrades to
      // a plain circle, which is still a truthful telegraph and never leaks a
      // texture backdrop.
      MeshBuilder.CreateDisc(
        "telegraph-fill",
        { radius: 0.5, tessellation: 48, sideOrientation: 2 /* DOUBLESIDE */ },
        scene,
      );
    if (!this.fill.material) {
      const mat = emissiveMat("telegraph-fill", scene, this.fillTint);
      // The rune is an opacity mask, not the emitted colour.  Binding the PNG
      // to emissiveTexture as well makes its square RGB sheet visible before
      // alpha shaping, which becomes a huge grey/purple card for large AoE
      // previews.  Colour stays in emissiveColor; only the rune alpha cuts it.
      mat.opacityTexture = this.shared.circleTex;
      this.fill.material = mat;
    }
    // ⚠️ 和外圈同一個理由：**池子裡撿回來的** mesh 帶著上一次的材質，所以每一次
    // 取用都要重寫一次色，⛔ 不能只在新建時寫。
    tintOf(this.fill).set(this.fillTint[0], this.fillTint[1], this.fillTint[2]);
    this.setFillAlpha(telegraphAlpha(this.palette, 0));
    this.fill.rotation.x = Math.PI / 2;
    this.fill.rotation.y = 0;
    this.fill.position.set(x, 0.05, z);
    this.fill.isPickable = false;
    this.fill.scaling.set(0.01, 0.01, 1);
    this.fill.setEnabled(true);
  }

  /**
   * 寫填滿那一層的不透明度 —— **唯一**的寫入點。
   *
   * ⭐ 白色魔法陣的濃度上限（`telegraphRuneAlpha`）在這裡乘進去，⛔ 不是在三個
   * 呼叫端各乘一次：漏掉其中一個的症狀是「圈在填滿的時候是對的，落地那一幀突然
   * 變得刺眼」，而那看起來像特效壞了，不像少乘了一個數字。
   */
  private setFillAlpha(a: number): void {
    if (!this.fill) return;
    (this.fill.material as StandardMaterial).alpha = a * this.fillAlphaScale;
  }

  /**
   * Feed the SIM's wind-up fraction (0→1). Once called, the wall-clock timer is
   * ignored for the rest of this telegraph's life and the ring resolves exactly
   * when `t` reaches 1 — i.e. when the cast bar completes and the damage lands.
   */
  setProgress(t: number): void {
    if (this.done) return;
    this.drivenT = t < 0 ? 0 : t > 1 ? 1 : t;
  }

  /**
   * Re-anchor a CASTER-CENTRED telegraph (the `self` marker). A ground AoE is
   * pinned to `cast.point` and must never move — this is only called for shapes
   * whose sim anchor is the caster's live position.
   */
  moveTo(x: number, z: number): void {
    if (this.done || !Number.isFinite(x) || !Number.isFinite(z)) return;
    this.x = x;
    this.z = z;
    this.ring?.position.set(x, 0.06, z);
    this.fill?.position.set(x, 0.05, z);
  }

  /**
   * INTERRUPTED (stun / knockdown / death mid-cast). Tear down with no resolve
   * pop and no shockwave: a telegraph that still says "it lands HERE" after the
   * caster was stunned out of the cast is a lie, and the cast PILLAR has always
   * handled this correctly while the ring did not.
   */
  cancel(): void {
    if (this.done) return;
    this.releaseTelegraphMeshes();
    if (this.shock) {
      release(this.shared.shocks, this.shock);
      this.shock = null;
    }
    this.done = true;
  }

  /** True once the resolve payoff (shockwave + kick) has fired. */
  get resolveFired(): boolean {
    return this.resolvedAtMs >= 0;
  }

  /** The RESOLVE moment: expanding shockwave + ember streaks + dust body. */
  private fireResolvePop(nowMs: number): void {
    this.resolvedAtMs = nowMs;
    // QUIET (instant-cast flash / outline tier): mark resolved and fade. The
    // #33/#39 impact layers already fire on this exact frame; a second payoff
    // would be budget spent saying the same thing twice.
    if (this.quiet) return;
    // shockwave: pooled unit torus, expanded/faded per frame by update()
    this.shock =
      this.shared.shocks.pop() ??
      MeshBuilder.CreateTorus("telegraph-shock", { diameter: 1, thickness: 0.09, tessellation: 40 }, this.scene);
    if (!this.shock.material) this.shock.material = emissiveMat("telegraph-shock", this.scene, this.palette.ring);
    tintOf(this.shock).set(this.palette.ring[0], this.palette.ring[1], this.palette.ring[2]);
    this.shock.position.set(this.x, 0.08, this.z);
    this.shock.isPickable = false;
    this.shock.setEnabled(true);
    this.updateShock(nowMs);
    // layered kick, pooled per radius bucket (specs bake the emitter radius)
    this.shared.kicks.fireAt(`ember/${this.ringKey}`, emberKickSpec(this.radius), this.x, this.z, 0.3, nowMs);
    this.shared.kicks.fireAt(`dust/${this.ringKey}`, dustKickSpec(this.radius), this.x, this.z, 0.25, nowMs);
  }

  private shockSpec(): RingSpec {
    return {
      startRadius: this.radius * 0.35,
      endRadius: this.radius * 1.15,
      lifeMs: SHOCKWAVE_MS,
      alpha: this.palette.alpha,
    };
  }

  /**
   * Wind-up fraction this frame. The DRIVEN value (the cast bar's own source)
   * wins whenever it has been supplied; the wall-clock ratio is only the
   * fallback for callers with a real tick-derived window and no per-frame
   * feed (guardianMark: `impactTick − tick`).
   */
  private progressAt(age: number): number {
    if (this.drivenT !== null) return this.drivenT;
    return this.fillMs > 0 ? age / this.fillMs : 1;
  }

  private updateShock(nowMs: number): void {
    if (!this.shock) return;
    const t = (nowMs - this.resolvedAtMs) / SHOCKWAVE_MS;
    if (t >= 1) {
      release(this.shared.shocks, this.shock);
      this.shock = null;
      return;
    }
    const { radius, alpha } = ringShape(t, this.shockSpec()); // ease-out + (1-t)² fade
    const d = radius * 2;
    this.shock.scaling.set(d, 1, d);
    (this.shock.material as StandardMaterial).alpha = alpha;
  }

  update(nowMs: number): void {
    if (this.done) return;
    const age = nowMs - this.bornMs;
    this.shared.kicks.update(nowMs); // reap idle pooled kick systems

    if (this.fill) this.fill.rotation.y = age * SPIN_RAD_PER_MS;

    if (this.resolvedAtMs < 0) {
      const t = this.progressAt(age);
      if (t < 1) {
        // fill phase: disc scale-fills the ring (readability look unchanged)
        if (this.fill) {
          const d = this.radius * 2 * Math.max(0.01, t);
          this.fill.scaling.set(d, d, 1);
        }
        // URGENCY (#228 requirement 3): brightness ramp + a late pulse, so
        // "about to land" reads without measuring the disc — and reads through
        // the #85 spectator desaturation, which flattens hue but not value.
        const a = telegraphAlpha(this.palette, t) * telegraphPulse(this.palette, t, nowMs);
        if (this.ring) (this.ring.material as StandardMaterial).alpha = a;
        this.setFillAlpha(a);
        return;
      }
      // the AoE fires HERE — payoff pop exactly once, on the resolve frame
      this.fadeAnchorMs = this.drivenT !== null ? nowMs : this.bornMs + this.fillMs;
      this.fireResolvePop(nowMs);
    }
    this.updateShock(nowMs);

    const peakAlpha = telegraphAlpha(this.palette, 1);
    const fade = Math.min((nowMs - this.fadeAnchorMs) / this.holdMs, 1);
    if (fade < 1) {
      const eased = (1 - fade) * (1 - fade); // exponential-out, not linear
      const pop = 1 + RESOLVE_POP_SCALE * (1 - eased); // slight overshoot as it fires
      if (this.fill) {
        const d = this.radius * 2 * pop;
        this.fill.scaling.set(d, d, 1);
        this.setFillAlpha(peakAlpha * eased);
      }
      if (this.ring) (this.ring.material as StandardMaterial).alpha = peakAlpha * eased;
    } else {
      this.releaseTelegraphMeshes();
      // stay alive until the shockwave finishes its expansion
      if (!this.shock) this.finish();
    }
  }

  private releaseTelegraphMeshes(): void {
    if (this.ring) {
      release(this.shared.rings.get(this.ringKey)!, this.ring);
      this.ring = null;
    }
    if (this.fill) {
      release(this.shared.fills, this.fill);
      this.fill = null;
    }
  }

  private finish(): void {
    this.done = true;
  }

  dispose(): void {
    if (this.done) return;
    this.releaseTelegraphMeshes();
    if (this.shock) {
      release(this.shared.shocks, this.shock);
      this.shock = null;
    }
    this.done = true;
  }
}
