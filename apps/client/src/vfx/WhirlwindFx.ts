/**
 * WhirlwindFx — STATE-GATED, ROTATING model attachments (task #59).
 *
 * Why this channel exists
 * -----------------------
 * WC3 MDX animates per-geoset visibility with GEOSET ANIMATION alpha tracks
 * (`GEOA`/`KGAO`). glTF has NO visibility animation channel, so the importer
 * skips GEOA entirely — every models_report entry literally records
 * `skipped MDX chunks: ...GEOA...`. A geoset WC3 showed for ONE sequence
 * therefore shipped as permanently-on, non-rotating geometry.
 *
 * 索隆 (imported.heromusashimiyamoto) was the visible case: geoset 3
 * (`Textures\Tornado2b.blp`, half-width 223 WC3u ≈ 2.6 world units around a
 * 1.7u hero) has KGAO alpha 1.0 ONLY inside the `Attack Walk Stand Spin`
 * sequence and 0.0 in the other eleven — but it rendered always, and never
 * turned. Exactly the report: "應該是特定動作才會出現並且旋轉,而非一直出現並且不動".
 *
 * The geometry is stripped from the .glb by
 * tools/w3x-import/strip_geoset_prims.py; this module puts it back as a real
 * effect: pinned to the model's own `whirlWindDummy` joint (the WC3 attachment
 * point, deliberately preserved by the stripper) — its POSITION only, never its
 * basis, see `followAnchor` — SPINNING about world up, and alive only while the
 * entity is in a bound animation state.
 *
 * Design notes
 * ------------
 *  - Built on the task #33 toolkit (`vfxPresets`): pooled systems, capacity
 *    caps, gradient helpers. Nothing here allocates per cast — funnels and
 *    debris systems are pooled and reused forever.
 *  - AMBIENT-CHANNEL SHAPED: same attach/detach/sweep/tick API as AmbientVfx
 *    so GameApp drives it from the identical entity diff, plus the one thing
 *    AmbientVfx cannot express — a per-frame animation-state gate.
 *  - Bindings live in ONE table (`WHIRLWIND_BINDINGS`). Task #50 ports
 *    per-invocation art params (scale/facing/tint/alpha/height/timeScale +
 *    attach point) off the 872 JASS AddSpecialEffect call sites; `Whirlwind
 *    Binding` is deliberately that same parameter set, so #50 replaces the
 *    table's VALUES with content-doc data without touching this runtime.
 *
 * Pure math (`spinAngle`, `envelopeAlpha`, `funnelRadius`) is unit-tested;
 * the Babylon side runs on NullEngine.
 */
import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Constants } from "@babylonjs/core/Engines/constants";
import { particleBudgetScale } from "../render/RenderConfig";
import { qualityController } from "../render/QualityController";
import {
  BurstPool,
  popShrinkStops,
  softBodyColorStops,
  type BurstSpec,
  type PresetSystemOptions,
  type Rgb,
} from "./vfxPresets";

/** Visual animation states this channel can gate on (mirrors AnimState). */
export type WhirlwindState = "idle" | "run" | "attack" | "cast" | "hurt" | "death";

/**
 * One model's whirlwind. The field set is deliberately the task #50 art-param
 * set (attach point / scale / height / tint / alpha / timeScale) so the two
 * mechanisms converge instead of competing.
 */
export interface WhirlwindBinding {
  /** glb joint to parent to (WC3 attachment name); falls back to the root */
  anchorBone: string;
  /** animation states in which the effect is ALIVE — the whole point */
  states: readonly WhirlwindState[];
  /** funnel radius at the top (world units) */
  topRadius: number;
  /** funnel radius at the bottom (world units) */
  bottomRadius: number;
  /** funnel height (world units) */
  height: number;
  /** vertical offset from the anchor (world units) */
  yOffset: number;
  /** spin rate (radians/sec) — POSITIVE is counter-clockwise seen from above */
  spinRadPerSec: number;
  /** emissive tint */
  tint: Rgb;
  /** peak alpha at full strength (0..1) */
  alpha: number;
  /** fade-in / fade-out seconds of the visibility envelope */
  fadeSec: number;
  /** content-relative swirl texture */
  texture: string;
  /** ground debris burst cadence (ms); 0 disables the debris layer */
  debrisEveryMs: number;
}

/**
 * MODEL BINDINGS — every entry is justified by the source MDX's GEOA track.
 *
 * heromusashimiyamoto: WC3 gated the tornado on `Attack Walk Stand Spin`, a
 * sequence the model doc's clipMap never plays (idle→Stand, run→Walk,
 * attack→Attack, cast→Spell, hurt→Stand, death→Death). A literal port of the
 * alpha track would therefore show it NEVER. `cast` is the faithful mapping:
 * 索隆's kit (鬼氣九刀流 / 三千世界) is spin attacks, and cast is what the
 * ability buttons pulse.
 */
export const WHIRLWIND_BINDINGS: Readonly<Record<string, WhirlwindBinding>> = {
  "imported.heromusashimiyamoto": {
    anchorBone: "whirlWindDummy",
    states: ["cast"],
    // WC3's quad cross was 2.6u in radius on a 1.7u hero — far too big to read
    // as "around the swordsman". Tuned to engulf the model, not the lane.
    topRadius: 1.05,
    bottomRadius: 0.34,
    height: 1.5,
    yOffset: 0.05,
    spinRadPerSec: 7.5,
    tint: [0.62, 0.88, 1.0], // pale wind-blue (Tornado2b reads cold//desaturated)
    alpha: 0.5,
    fadeSec: 0.12,
    texture: "assets/textures/particles/twirl_01.png",
    debrisEveryMs: 110,
  },
};

/** Tessellation of the funnel cone (low: it is a transparent additive shell). */
const FUNNEL_SIDES = 18;
/** Counter-rotating inner shell multiplier — gives the swirl real depth. */
const INNER_SCALE = 0.62;
const INNER_SPIN_FACTOR = -1.45;
/** Texture scroll speed (uv/sec) — the swirl slides as the shell turns. */
const UV_SCROLL_PER_SEC = 0.9;
/** Cap on simultaneously-active whirlwinds (overdraw discipline). */
export const MAX_ACTIVE_WHIRLWINDS = 6;

// ---------------------------------------------------------------------------
// Pure math (unit-tested)
// ---------------------------------------------------------------------------

/** Wrapped spin angle after `elapsedMs` at `radPerSec`. Always in [0, 2π). */
export function spinAngle(elapsedMs: number, radPerSec: number): number {
  const raw = (elapsedMs / 1000) * radPerSec;
  const wrapped = raw % (Math.PI * 2);
  return wrapped < 0 ? wrapped + Math.PI * 2 : wrapped;
}

/**
 * Visibility envelope: 0 before the effect starts, ramps to 1 over `fadeSec`,
 * holds while active, ramps back to 0 over `fadeSec` after release. `releaseMs`
 * is Infinity while the gating state still holds.
 */
export function envelopeAlpha(
  nowMs: number,
  startMs: number,
  releaseMs: number,
  fadeSec: number,
): number {
  if (nowMs <= startMs) return 0;
  const fadeMs = Math.max(1, fadeSec * 1000);
  const rise = Math.min(1, (nowMs - startMs) / fadeMs);
  if (!Number.isFinite(releaseMs) || nowMs <= releaseMs) return rise;
  const fall = 1 - (nowMs - releaseMs) / fadeMs;
  return Math.max(0, Math.min(rise, fall));
}

/** Funnel radius at height fraction `t` (0 = bottom, 1 = top). */
export function funnelRadius(t: number, bottomRadius: number, topRadius: number): number {
  const c = Math.max(0, Math.min(1, t));
  return bottomRadius + (topRadius - bottomRadius) * c;
}

/** True when the effect should be alive for this state. */
export function stateActive(binding: WhirlwindBinding, state: WhirlwindState): boolean {
  return binding.states.includes(state);
}

/** Ground-debris burst for a whirlwind (flat outward ring, low and short). */
export function debrisSpec(binding: WhirlwindBinding): BurstSpec {
  return {
    count: 10,
    lifetimeSec: { min: 0.18, max: 0.36 },
    speed: { min: 1.4, max: 3.2 },
    sizeStops: popShrinkStops(0.16),
    colorStops: softBodyColorStops(binding.tint, 0.34),
    blend: "alpha",
    gravityY: -3.2,
    drag: 0.35,
    flatRing: { radius: binding.bottomRadius + 0.15, height: 0.12 },
  };
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

/** glb instantiation prefixes node names ("<entityId>-whirlWindDummy"). */
function findBoneNode(root: TransformNode, bone: string): TransformNode | null {
  const nodes = root.getChildTransformNodes(false);
  for (const n of nodes) if (n.name === bone) return n;
  for (const n of nodes) if (n.name.endsWith(bone)) return n;
  return null;
}

/**
 * Park `pivot` on `anchor`'s WORLD POSITION with a world-upright, unmirrored,
 * unit basis — the funnel follows the joint but never inherits its rotation.
 *
 * WHY THIS IS NOT `pivot.parent = anchor` (measured, not guessed). The first
 * cut did parent to the joint, which is wrong twice over:
 *
 *  1. `whirlWindDummy` is an ANIMATED WC3 attachment bone. Its basis swings
 *     with whatever clip is playing, so the funnel swung with it — sampled live
 *     over 391 enabled frames during 索隆's cast, only 30.4% were within 15° of
 *     upright and the tilt reached 180° (fully inverted, wide end down).
 *  2. The MDX→glTF axis conversion leaves that joint's world basis MIRRORED
 *     (determinant ≈ -1), so even the "rest" orientation is a flip, not a
 *     rotation — no quaternion correction on the child can undo it.
 *
 * A tornado is vertical in world space no matter how the shoulder it hangs off
 * is twisted, so the honest fix is to take the joint's translation and drop its
 * basis entirely. `computeWorldMatrix(true)` is what makes this exact on the
 * frame the animation just wrote (the tick runs BEFORE Babylon's own pass);
 * with MAX_ACTIVE_WHIRLWINDS = 6 that is at most six short chains per frame.
 */
function followAnchor(pivot: TransformNode, anchor: TransformNode, yOffset: number): void {
  // Sibling of task #131: the anchor joint can be disposed out from under us on
  // a model/LOD swap. Following a dead node would read a stale/origin matrix and
  // snap the funnel into a corner — freeze at the last good pose instead.
  if (anchor.isDisposed()) return;
  anchor.computeWorldMatrix(true);
  const p = anchor.getAbsolutePosition();
  if (!(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))) return;
  if (pivot.parent) pivot.parent = null; // world space, always
  pivot.rotationQuaternion = null; // drop any quaternion the pool left behind
  pivot.rotation.set(0, 0, 0);
  pivot.scaling.set(1, 1, 1);
  pivot.position.set(p.x, p.y + yOffset, p.z);
}

interface Funnel {
  /** spun container; both shells hang off it */
  pivot: TransformNode;
  outer: Mesh;
  inner: Mesh;
  outerMat: StandardMaterial;
  innerMat: StandardMaterial;
  outerTex: BaseTexture | null;
  innerTex: BaseTexture | null;
}

interface Live {
  modelKey: string;
  binding: WhirlwindBinding;
  root: TransformNode;
  funnel: Funnel;
  /** node the funnel FOLLOWS: the joint once found, the root until then */
  anchor: TransformNode;
  /** resolved anchor, or the root while the async .glb streams in */
  boneResolved: boolean;
  nextScanMs: number;
  /** envelope bookkeeping */
  startMs: number;
  releaseMs: number;
  spinMs: number;
  uv: number;
  /** true once the envelope has fully closed and the meshes are disabled */
  dormant: boolean;
  nextDebrisMs: number;
}

/** how often an unresolved anchor bone is re-searched (glb loads async) */
const BONE_RESCAN_MS = 500;

export interface WhirlwindFxOptions extends PresetSystemOptions {
  /** quality-tier particle budget multiplier (default: live quality params) */
  getScale?: () => number;
  /** test seam: bindings table override */
  bindings?: Readonly<Record<string, WhirlwindBinding>>;
}

export class WhirlwindFx {
  private readonly live = new Map<number, Live>();
  private readonly funnelPool: Funnel[] = [];
  private readonly debris: BurstPool;
  private readonly getScale: () => number;
  private readonly bindings: Readonly<Record<string, WhirlwindBinding>>;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly opts: WhirlwindFxOptions = {},
  ) {
    this.bindings = opts.bindings ?? WHIRLWIND_BINDINGS;
    this.getScale =
      opts.getScale ??
      ((): number => particleBudgetScale(qualityController.getParams().particleDensity));
    this.debris = new BurstPool(scene, { ...opts, maxPerKey: 2 });
  }

  /** Models this channel knows about (GameApp skips the rest for free). */
  static handles(modelKey: string): boolean {
    return modelKey in WHIRLWIND_BINDINGS;
  }

  has(entityId: number): boolean {
    return this.live.has(entityId);
  }

  get activeCount(): number {
    let n = 0;
    for (const l of this.live.values()) if (!l.dormant) n++;
    return n;
  }

  /**
   * Bind (or re-bind) an entity's whirlwind under `rootNode` and drive its
   * gate from `state`. Idempotent per (entityId, modelKey, rootNode); an
   * unbound modelKey is a no-op. Call every frame — this IS the gate.
   */
  sync(
    entityId: number,
    modelKey: string,
    rootNode: TransformNode,
    state: WhirlwindState,
    nowMs: number,
  ): void {
    if (this.disposed) return;
    const binding = this.bindings[modelKey];
    if (!binding) {
      if (this.live.has(entityId)) this.detach(entityId);
      return;
    }
    let entry = this.live.get(entityId);
    if (entry && (entry.modelKey !== modelKey || entry.root !== rootNode)) {
      this.detach(entityId);
      entry = undefined;
    }
    const want = stateActive(binding, state);
    if (!entry) {
      // never build anything for an entity that has not cast yet
      if (!want) return;
      if (this.activeCount >= MAX_ACTIVE_WHIRLWINDS) return;
      entry = this.acquire(entityId, modelKey, binding, rootNode, nowMs);
    }
    if (want) {
      if (entry.dormant || Number.isFinite(entry.releaseMs)) {
        // re-arm: a new cast during the tail restarts the envelope cleanly
        if (entry.dormant) {
          entry.startMs = nowMs;
          entry.funnel.pivot.setEnabled(true);
        }
        entry.releaseMs = Infinity;
        entry.dormant = false;
      }
    } else if (!Number.isFinite(entry.releaseMs)) {
      entry.releaseMs = nowMs;
    }
  }

  /** Unbind and pool the entity's funnel (safe when not attached). */
  detach(entityId: number): void {
    const entry = this.live.get(entityId);
    if (!entry) return;
    const f = entry.funnel;
    f.pivot.setEnabled(false);
    f.pivot.parent = null;
    this.funnelPool.push(f);
    this.live.delete(entityId);
  }

  /** Detach every entity NOT in `keep` (frame-loop diff helper). */
  sweep(keep: ReadonlySet<number>): void {
    for (const id of [...this.live.keys()]) if (!keep.has(id)) this.detach(id);
  }

  /** Per-frame: late bone resolution, spin, envelope, debris cadence. */
  tick(nowMs: number, dtMs: number): void {
    if (this.disposed) return;
    for (const [id, entry] of this.live) {
      const { binding, funnel } = entry;

      // the .glb (and its joints) stream in async — keep re-searching
      if (!entry.boneResolved && nowMs >= entry.nextScanMs) {
        const node = findBoneNode(entry.root, binding.anchorBone);
        if (node) {
          entry.anchor = node;
          entry.boneResolved = true;
        }
        entry.nextScanMs = nowMs + BONE_RESCAN_MS;
      }
      // FOLLOW THE JOINT'S POSITION, NEVER ITS BASIS (see followAnchor).
      followAnchor(funnel.pivot, entry.anchor, binding.yOffset);

      const a = envelopeAlpha(nowMs, entry.startMs, entry.releaseMs, binding.fadeSec);
      if (a <= 0 && Number.isFinite(entry.releaseMs)) {
        if (!entry.dormant) {
          entry.dormant = true;
          funnel.pivot.setEnabled(false);
        }
        continue;
      }
      if (entry.dormant) continue;

      // SPIN — the half of the bug report that geometry could never satisfy
      entry.spinMs += dtMs;
      const ang = spinAngle(entry.spinMs, binding.spinRadPerSec);
      funnel.outer.rotation.y = ang;
      funnel.inner.rotation.y = spinAngle(entry.spinMs, binding.spinRadPerSec * INNER_SPIN_FACTOR);

      entry.uv = (entry.uv + (dtMs / 1000) * UV_SCROLL_PER_SEC) % 1;
      const outerTex = funnel.outerTex as Texture | null;
      const innerTex = funnel.innerTex as Texture | null;
      if (outerTex && "uOffset" in outerTex) outerTex.uOffset = entry.uv;
      if (innerTex && "uOffset" in innerTex) innerTex.uOffset = -entry.uv * 1.6;

      const peak = binding.alpha * a;
      funnel.outerMat.alpha = peak;
      funnel.innerMat.alpha = peak * 0.72;

      if (binding.debrisEveryMs > 0 && nowMs >= entry.nextDebrisMs) {
        entry.nextDebrisMs = nowMs + binding.debrisEveryMs;
        // the pivot is parentless (followAnchor), so local === world here —
        // read `.position` rather than the absolute, which Babylon only
        // refreshes on ITS pass, i.e. one frame behind this tick
        const p = funnel.pivot.position;
        this.debris.fireAt(
          `whirl-${entry.modelKey}`,
          debrisSpec(binding),
          p.x,
          p.z,
          p.y,
          nowMs,
          this.getScale(),
        );
      }
      void id;
    }
    this.debris.update(nowMs);
  }

  dispose(): void {
    if (this.disposed) return;
    for (const id of [...this.live.keys()]) this.detach(id);
    this.disposed = true;
    for (const f of this.funnelPool) {
      f.outerTex?.dispose();
      f.innerTex?.dispose();
      f.outerMat.dispose();
      f.innerMat.dispose();
      f.outer.dispose(false, false);
      f.inner.dispose(false, false);
      f.pivot.dispose();
    }
    this.funnelPool.length = 0;
    this.debris.dispose();
  }

  // -------------------------------------------------------------------------

  private acquire(
    entityId: number,
    modelKey: string,
    binding: WhirlwindBinding,
    root: TransformNode,
    nowMs: number,
  ): Live {
    const funnel = this.funnelPool.pop() ?? this.buildFunnel(binding);
    const node = findBoneNode(root, binding.anchorBone);
    const anchor = node ?? root;
    followAnchor(funnel.pivot, anchor, binding.yOffset);
    funnel.pivot.setEnabled(true);
    const entry: Live = {
      modelKey,
      binding,
      root,
      funnel,
      anchor,
      boneResolved: node !== null,
      nextScanMs: nowMs + BONE_RESCAN_MS,
      startMs: nowMs,
      releaseMs: Infinity,
      spinMs: 0,
      uv: 0,
      dormant: false,
      nextDebrisMs: nowMs,
    };
    this.live.set(entityId, entry);
    return entry;
  }

  private buildFunnel(binding: WhirlwindBinding): Funnel {
    const scene = this.scene;
    const pivot = new TransformNode("whirlwind-pivot", scene);

    const shell = (name: string, scale: number): [Mesh, StandardMaterial, BaseTexture | null] => {
      const mesh = MeshBuilder.CreateCylinder(
        name,
        {
          height: binding.height * scale,
          diameterTop: binding.topRadius * 2 * scale,
          diameterBottom: binding.bottomRadius * 2 * scale,
          tessellation: FUNNEL_SIDES,
          cap: 0, // Mesh.NO_CAP — an open funnel, never a lid
          sideOrientation: 2, // Mesh.DOUBLESIDE
        },
        scene,
      );
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = true;
      // the cylinder is centred on its origin; sit it on the anchor
      mesh.position.y = (binding.height * scale) / 2;
      mesh.parent = pivot;

      const mat = new StandardMaterial(name + "-mat", scene);
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      mat.diffuseColor = new Color3(0, 0, 0);
      mat.specularColor = new Color3(0, 0, 0);
      mat.emissiveColor = new Color3(binding.tint[0], binding.tint[1], binding.tint[2]);
      mat.alphaMode = Constants.ALPHA_ADD;
      mat.alpha = 0;
      const tex = this.makeTexture(binding.texture, scene);
      if (tex) {
        mat.emissiveTexture = tex;
        mat.opacityTexture = tex;
        if ("wrapU" in tex) {
          (tex as Texture).wrapU = Texture.WRAP_ADDRESSMODE;
          (tex as Texture).wrapV = Texture.WRAP_ADDRESSMODE;
          (tex as Texture).uScale = 3;
        }
      }
      mesh.material = mat;
      return [mesh, mat, tex];
    };

    const [outer, outerMat, outerTex] = shell("whirlwind-outer", 1);
    const [inner, innerMat, innerTex] = shell("whirlwind-inner", INNER_SCALE);
    pivot.setEnabled(false);
    return {
      pivot,
      outer,
      inner,
      outerMat,
      innerMat,
      outerTex,
      innerTex,
    };
  }

  private makeTexture(contentPath: string, scene: Scene): BaseTexture | null {
    const url = (this.opts.resolveTextureUrl ?? ((p: string): string => "/content/" + p))(
      contentPath,
    );
    const make = this.opts.createTexture ?? ((u: string, s: Scene): BaseTexture => new Texture(u, s));
    return make(url, scene);
  }
}
