/**
 * RibbonTrail — the ribbon@1 renderer (WC3 RIBB emitters), retuned by task #37
 * to read as 刀光劍影: a crisp bright streak that hugs the weapon arc and is
 * COMPLETELY gone within RIBBON_FADE_BUDGET_SEC (0.25 s) of the blade stopping.
 *
 * What it does per frame, and why (see ribbonMath.ts for the full autopsy of
 * the light-pollution bug):
 *
 *  · SWING GATE — the anchor's speed RELATIVE TO THE ENTITY ROOT drives a
 *    hysteresis gate. Samples are laid only while the blade is actually being
 *    swung, so an idle/walking champion has NO trail at all (the old always-on
 *    ring collapsed onto a still weapon bone and stacked N coincident additive
 *    quads into a permanent glued-on blob). Each sample also bakes the swing
 *    weight it was laid at, so slow drifts stay dark and fast arcs are bright.
 *  · FIXED-RATE RING — samples advance on a wall-clock interval
 *    (RIBBON_SAMPLE_HZ), not once per frame, so the streak covers the same
 *    ~0.2 s of motion at 30, 60 or 144 fps (and through hitstop). Between
 *    advances the head sample tracks the weapon so the leading edge never lags.
 *  · TAPERED, SHARPLY-FADED STRIP — width pinches to nothing along the tail
 *    and the color ramp is the task #33 `hotToCoolStops` kit sampled by sample
 *    AGE: white-hot leading edge → the doc's own tint (COLOR IDENTITY: an ice
 *    weapon stays icy) → cooled → gone, with an exponential alpha falloff.
 *  · REAL FADE FOR ADDITIVE — additive is `blendFunc(ONE, ONE)`, which
 *    DISCARDS source alpha, so the fade is premultiplied into the vertex RGB.
 *    Fading alpha alone (the old code) was a no-op on 51 of 55 ribbon docs.
 *  · BUDGET — concurrent live trails are capped by a shared `RibbonBudget`
 *    (LRU steal), and the mesh is disabled the moment the strip is invisible.
 *
 * Pooling: the mesh/material/texture are built ONCE per trail and reused for
 * every swing forever; attach/detach re-seed the ring so a pooled trail
 * (AmbientVfx) never shows a stale streak.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateRibbon } from "@babylonjs/core/Meshes/Builders/ribbonBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { RibbonDoc, VfxBlendMode } from "@ggd/shared/content";
import { hotToCoolStops, type ColorStop } from "./vfxPresets";
import {
  buildRibbonPaths,
  clampRibbonHalfWidth,
  clampRibbonLifespanSec,
  ribbonFadeModeFor,
  ribbonSampleCount,
  ribbonVertexColors,
  sampleLifeFractions,
  swingGateStep,
  swingWeight,
  RIBBON_SAMPLE_HZ,
  SWING_GATE_CLOSED,
  type RibbonFadeMode,
  type RibbonSample,
  type SwingGateState,
} from "./ribbonMath";

const CONTENT_BASE = "/content/";

/** ms between ring advances (frame-rate independent trail length). */
const SAMPLE_INTERVAL_MS = 1000 / RIBBON_SAMPLE_HZ;

/** t where the hot→cool ramp reaches the doc's own tint (identity stop). */
const RIBBON_HOT_T = 0.18;

/** ribbon blendMode → engine alpha mode (same WC3 mapping as particles). */
export function ribbonAlphaModeFor(mode: VfxBlendMode): number {
  switch (mode) {
    case "additive":
      return Constants.ALPHA_ONEONE;
    case "modulate":
      return Constants.ALPHA_MULTIPLY;
    case "alpha":
    case "alphaKey":
      return Constants.ALPHA_COMBINE;
  }
}

/** Max trails laying samples at the same time (overdraw discipline). */
export const MAX_ACTIVE_RIBBONS = 10;

interface BudgetedTrail {
  /** force the trail's gate shut (its streak then fades out normally) */
  closeForBudget(): void;
}

/**
 * Shared cap on CONCURRENT swing trails. A trail asks to open its gate; past
 * the cap the least-recently-opened trail is stolen (closed) so the screen can
 * never fill with overlapping bands no matter how many champions swing at
 * once. Stolen trails keep fading normally — nothing pops.
 */
export class RibbonBudget {
  private readonly active: { trail: BudgetedTrail; sinceMs: number }[] = [];

  constructor(private readonly max: number = MAX_ACTIVE_RIBBONS) {}

  /** trails currently laying samples (test/observability seam) */
  get activeCount(): number {
    return this.active.length;
  }

  /** Reserve a slot, stealing the oldest live trail when full. Always grants. */
  acquire(trail: BudgetedTrail, nowMs: number): void {
    if (this.active.some((e) => e.trail === trail)) return;
    while (this.active.length >= this.max) {
      let oldest = 0;
      for (let i = 1; i < this.active.length; i++) {
        if (this.active[i]!.sinceMs < this.active[oldest]!.sinceMs) oldest = i;
      }
      const [stolen] = this.active.splice(oldest, 1);
      stolen!.trail.closeForBudget();
    }
    this.active.push({ trail, sinceMs: nowMs });
  }

  release(trail: BudgetedTrail): void {
    const i = this.active.findIndex((e) => e.trail === trail);
    if (i >= 0) this.active.splice(i, 1);
  }
}

export interface RibbonTrailOptions {
  /** test seam: URL → texture (NullEngine tests skip image decode) */
  createTexture?: (url: string, scene: Scene) => Texture | null;
  /** content-relative texture path → URL (default "/content/<path>") */
  resolveTextureUrl?: (contentPath: string) => string;
  /** shared concurrent-trail cap (AmbientVfx owns one per scene) */
  budget?: RibbonBudget;
}

export class RibbonTrail implements BudgetedTrail {
  readonly doc: RibbonDoc;
  /** authored lifespan CLAMPED into the 刀光 budget (ms) */
  readonly lifespanMs: number;

  private readonly scene: Scene;
  private readonly capacity: number;
  private readonly samples: RibbonSample[] = [];
  private readonly material: StandardMaterial;
  private readonly texture: Texture | null = null;
  private readonly widthAbove: number;
  private readonly widthBelow: number;
  private readonly stops: readonly ColorStop[];
  private readonly fadeMode: RibbonFadeMode;
  private readonly budget: RibbonBudget | null;
  private mesh: Mesh | null = null;
  private anchor: TransformNode | null = null;
  /** entity root: swing speed is measured RELATIVE to it (walking ≠ swinging) */
  private reference: TransformNode | null = null;
  private disposed = false;
  private gate: SwingGateState = SWING_GATE_CLOSED;
  private accMs = 0;
  private visible = false;
  private hasPrev = false;
  private relSpeed = 0;
  /** reused per-tick scratch (paths as Vector3 rows for CreateRibbon) */
  private readonly pathTop: Vector3[] = [];
  private readonly pathBottom: Vector3[] = [];
  private readonly prevAnchor = new Vector3();
  private readonly prevRef = new Vector3();
  private readonly colors: Float32Array;

  constructor(scene: Scene, doc: RibbonDoc, opts: RibbonTrailOptions = {}) {
    this.scene = scene;
    this.doc = doc;
    this.budget = opts.budget ?? null;
    this.lifespanMs = clampRibbonLifespanSec(doc.lifespanSec) * 1000;
    this.capacity = ribbonSampleCount(this.lifespanMs / 1000);
    this.widthAbove = clampRibbonHalfWidth(doc.widthAbove);
    this.widthBelow = clampRibbonHalfWidth(doc.widthBelow);
    this.fadeMode = ribbonFadeModeFor(doc.blendMode);
    // task #33 toolkit: white-hot leading edge → THE DOC'S OWN TINT → cooled.
    // Sampled by sample AGE, so colour identity is preserved at the tint stop.
    this.stops = hotToCoolStops([doc.color[0], doc.color[1], doc.color[2]], {
      peakAlpha: 1,
      hotT: RIBBON_HOT_T,
    });
    this.colors = new Float32Array(this.capacity * 2 * 4);
    for (let i = 0; i < this.capacity; i++) {
      this.samples.push({ x: 0, y: 0, z: 0, tMs: -Infinity, w: 0 });
    }

    const mat = new StandardMaterial(`ribbon-${doc.id}-mat`, scene);
    mat.emissiveColor = new Color3(1, 1, 1); // tint lives in the vertex ramp
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.disableLighting = true;
    mat.backFaceCulling = false; // two-sided strip
    mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
    mat.alphaMode = ribbonAlphaModeFor(doc.blendMode);
    // a swing streak must never occlude what it sweeps past
    mat.disableDepthWrite = true;
    if (doc.texture) {
      const url = (opts.resolveTextureUrl ?? ((p: string): string => CONTENT_BASE + p))(doc.texture);
      const make =
        opts.createTexture ?? ((u: string, s: Scene): Texture => new Texture(u, s, false, false));
      this.texture = make(url, this.scene);
      if (this.texture) {
        this.texture.hasAlpha = true;
        mat.emissiveTexture = this.texture;
        mat.opacityTexture = this.texture;
      }
    }
    this.material = mat;
    this.createMesh();
  }

  get attached(): boolean {
    return this.anchor !== null;
  }

  /** true while the blade is moving fast enough to lay a streak */
  get swinging(): boolean {
    return this.gate.open;
  }

  /** true while any part of the strip is still on screen */
  get isVisible(): boolean {
    return this.visible;
  }

  /** last measured anchor speed relative to the entity root (world u/s) */
  get anchorSpeed(): number {
    return this.relSpeed;
  }

  /** live vertex colors (test seam: alpha/brightness falloff along the strip) */
  get vertexColors(): Readonly<Float32Array> {
    return this.colors;
  }

  /**
   * Start trailing `anchor`; re-seeds the ring at its position so a pooled
   * trail never shows a stale streak. `reference` is the entity root the swing
   * speed is measured against — without a DISTINCT reference node (i.e. the
   * anchor bone never resolved) the trail stays dark, which is the point: a
   * ribbon with no weapon bone has no swing to draw.
   */
  attachTo(anchor: TransformNode, nowMs: number, reference?: TransformNode): void {
    if (this.disposed) return;
    this.anchor = anchor;
    this.reference = reference ?? this.reference;
    this.seed(anchor.getAbsolutePosition(), nowMs);
    this.hasPrev = false;
    this.relSpeed = 0;
    this.closeGate();
  }

  /** Stop trailing (mesh hidden, ring cleared — pool-safe). */
  detach(): void {
    this.anchor = null;
    this.reference = null;
    this.hasPrev = false;
    this.relSpeed = 0;
    this.closeGate();
    this.hide();
  }

  /** Budget steal: shut the gate; the existing streak fades out normally. */
  closeForBudget(): void {
    this.gate = SWING_GATE_CLOSED;
  }

  /** Per-frame: measure the swing, advance the ring, rebuild the strip. */
  tick(nowMs: number, dtMs: number): void {
    if (this.disposed || !this.anchor) return;
    const p = this.anchor.getAbsolutePosition();
    const r = this.reference ? this.reference.getAbsolutePosition() : null;

    // Speed of the weapon bone RELATIVE to the entity root: subtract the
    // root's own displacement so running is not mistaken for swinging.
    if (this.hasPrev && dtMs > 0) {
      const dx = p.x - this.prevAnchor.x - (r ? r.x - this.prevRef.x : 0);
      const dy = p.y - this.prevAnchor.y - (r ? r.y - this.prevRef.y : 0);
      const dz = p.z - this.prevAnchor.z - (r ? r.z - this.prevRef.z : 0);
      this.relSpeed = (Math.sqrt(dx * dx + dy * dy + dz * dz) * 1000) / dtMs;
    } else {
      this.relSpeed = 0;
    }
    this.prevAnchor.copyFrom(p);
    if (r) this.prevRef.copyFrom(r);
    else this.prevRef.setAll(0);
    this.hasPrev = true;

    const wasOpen = this.gate.open;
    this.gate = swingGateStep(this.gate, this.relSpeed, dtMs);
    if (this.gate.open && !wasOpen) {
      this.budget?.acquire(this, nowMs);
      this.seed(p, nowMs); // a new swing starts clean — no bridge from the last
    } else if (!this.gate.open && wasOpen) {
      this.budget?.release(this);
    }

    if (this.gate.open) {
      this.accMs += Math.max(0, dtMs);
      if (this.accMs >= SAMPLE_INTERVAL_MS) {
        // advance the ring: recycle the oldest sample as the new head
        this.accMs = Math.min(this.accMs - SAMPLE_INTERVAL_MS, SAMPLE_INTERVAL_MS);
        this.samples.push(this.samples.shift()!);
      }
      const head = this.samples[this.capacity - 1]!;
      head.x = p.x;
      head.y = p.y;
      head.z = p.z;
      head.tMs = nowMs;
      head.w = swingWeight(this.relSpeed);
    } else if (nowMs - this.samples[this.capacity - 1]!.tMs >= this.lifespanMs) {
      this.hide(); // the whole strip has aged out — nothing left to draw
      return;
    }

    this.rebuild(nowMs);
    if (this.texture && this.doc.uvScrollPerSec !== undefined) {
      this.texture.uOffset = (this.texture.uOffset - (this.doc.uvScrollPerSec * dtMs) / 1000) % 1;
    }
  }

  /**
   * Re-seed the ring at one point with staggered ages (oldest exactly expired),
   * so the strip has zero area and zero brightness until the blade moves.
   */
  private seed(p: Vector3, nowMs: number): void {
    for (let i = 0; i < this.capacity; i++) {
      const s = this.samples[i]!;
      s.x = p.x;
      s.y = p.y;
      s.z = p.z;
      s.tMs = nowMs - (this.capacity - 1 - i) * SAMPLE_INTERVAL_MS;
      s.w = 0;
    }
    this.accMs = 0;
  }

  private closeGate(): void {
    if (this.gate.open) this.budget?.release(this);
    this.gate = SWING_GATE_CLOSED;
  }

  private hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.mesh?.setEnabled(false);
  }

  private createMesh(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.pathTop[i] = new Vector3(0, 0, 0);
      this.pathBottom[i] = new Vector3(0, 0, 0);
    }
    const mesh = CreateRibbon(
      `ribbon-${this.doc.id}`,
      { pathArray: [this.pathTop, this.pathBottom], updatable: true },
      this.scene,
    );
    mesh.material = this.material;
    mesh.hasVertexAlpha = true;
    mesh.isPickable = false;
    // the ribbon instance update does not refresh extents, so a stale bbox
    // would let the frustum cull a live streak — it is 30 triangles, keep it
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.setEnabled(false);
    this.mesh = mesh;
  }

  private rebuild(nowMs: number): void {
    ribbonVertexColors(this.samples, nowMs, this.lifespanMs, this.doc.color, {
      stops: this.stops,
      fadeMode: this.fadeMode,
      out: this.colors,
    });
    // nothing left with any brightness → draw nothing at all (this is what
    // makes "gone" actually mean gone, budget-wise as well as visually)
    let peak = 0;
    for (let i = 3; i < this.colors.length; i += 4) {
      if (this.colors[i]! > peak) peak = this.colors[i]!;
    }
    if (peak <= 0) {
      this.hide();
      return;
    }
    const life = sampleLifeFractions(this.samples, nowMs, this.lifespanMs);
    const { top, bottom } = buildRibbonPaths(this.samples, this.widthAbove, this.widthBelow, life);
    for (let i = 0; i < this.capacity; i++) {
      const t = top[i]!;
      const b = bottom[i]!;
      this.pathTop[i]!.set(t[0], t[1], t[2]);
      this.pathBottom[i]!.set(b[0], b[1], b[2]);
    }
    const mesh = this.mesh!;
    CreateRibbon(`ribbon-${this.doc.id}`, {
      pathArray: [this.pathTop, this.pathBottom],
      instance: mesh,
    });
    mesh.setVerticesData(VertexBuffer.ColorKind, this.colors, true);
    if (!this.visible) {
      this.visible = true;
      mesh.setEnabled(true);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.closeGate();
    this.anchor = null;
    this.reference = null;
    this.mesh?.dispose(false, false);
    this.mesh = null;
    this.texture?.dispose();
    this.material.dispose();
  }
}
