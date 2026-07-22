/**
 * FlowerView — pooled view for the neutral healing flowers (task #34,
 * EntityState.kind 2, key "prop.flower"). Mirrors ProjectileView's pooling
 * contract (activate/deactivate, registry-owned free-list).
 *
 * The flower's model doc points at a hex waterlily .glb whose mesh is only
 * ~0.017u tall — at the doc scale that renders as a tiny flat disc on the
 * ground, invisible from the top-down MOBA camera. So the READABLE element is
 * NOT the .glb: it's a procedural, unmistakable "grab me for HP/MP" healing
 * BEACON, built from Babylon primitives + a small mote ParticleSystem and
 * sized (~1.1u tall) to read clearly from overhead:
 *   • a floating, gently-bobbing glowing flower bloom (green core + pink
 *     petals + white pistil) in the heal palette,
 *   • a soft additive upward light column/pillar rising from the ground,
 *   • a subtle pulsing ground halo ring, and
 *   • slow rising sparkle motes (the "collect me" cue).
 * The .glb (once loaded) is kept only as a decorative ground pad under the
 * beacon — it never hides the beacon.
 *
 * The over-head HP bar is owned externally (overheadAnchors → frameBus →
 * WorldAnchorLayer), projected at world y≈1.35 above the flower's x/z, so it
 * floats just over the beacon; nothing here draws it. Flowers are attackable
 * and the flowerBurst heal VFX fires on death (VfxSystem), independent of this
 * view. Idle motion is pure Math.sin (bobOffset / pulse01) written into
 * existing vectors/scalars — no per-frame allocation.
 */
import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { ModelDoc } from "@ggd/shared/content";
import type { AssetManager } from "../AssetManager";
import { effectiveQuality, particleScaleFor, type Quality } from "../RenderConfig";

// ── Beacon proportions (world units), tuned to read from the top-down camera ─
/** Rest height of the bobbing bloom (the beacon reads ~1.1u tall overall). */
const ORB_BASE_Y = 0.74;
/** Additive light-column height (base at y=0). */
const COLUMN_HEIGHT = 1.12;
const COLUMN_DIAM_TOP = 0.16;
const COLUMN_DIAM_BOTTOM = 0.52;
/** Ground halo ring geometry (lies flat in the XZ plane). */
const RING_RADIUS = 0.62;
const RING_THICKNESS = 0.1;
/** Height the mote particles emit from (just off the ground). */
const PARTICLE_BASE_Y = 0.12;

// ── Idle-motion tuning (rad/ms, world units) ────────────────────────────────
const BOB_AMPLITUDE = 0.1;
const BOB_SPEED = 0.0019;
const SPIN_SPEED = 0.0007;
const PULSE_SPEED = 0.0026;
/** Ground-ring pulse envelope. */
const RING_MIN_SCALE = 0.82;
const RING_MAX_SCALE = 1.3;
const RING_MIN_ALPHA = 0.2;
const RING_MAX_ALPHA = 0.6;
/** Light-column shimmer envelope. */
const COLUMN_MIN_ALPHA = 0.12;
const COLUMN_MAX_ALPHA = 0.32;

// ── Heal palette (soft green + pink/white) ──────────────────────────────────
const HEAL_GREEN: [number, number, number] = [0.4, 0.96, 0.55];
const HEAL_PINK: [number, number, number] = [1.0, 0.62, 0.82];
const HEAL_WHITE: [number, number, number] = [0.86, 1.0, 0.92];

const PETAL_COUNT = 6;
const MOTE_URL = "/content/assets/textures/particles/light_01.png";

/**
 * Idle vertical bob offset (pure). Sine sway so a field of flowers, phase-
 * de-synced per entity, doesn't bob in lockstep.
 */
export function bobOffset(nowMs: number, phase: number, amp = BOB_AMPLITUDE, speed = BOB_SPEED): number {
  return Math.sin(nowMs * speed + phase) * amp;
}

/**
 * Normalized 0..1 pulse (pure) driving the ground-ring scale/alpha and the
 * light-column shimmer.
 */
export function pulse01(nowMs: number, phase: number, speed = PULSE_SPEED): number {
  return 0.5 + 0.5 * Math.sin(nowMs * speed + phase);
}

/** Resolve the quality tier without throwing in odd (headless) environments. */
function safeQuality(): Quality {
  try {
    return effectiveQuality();
  } catch {
    return "desktop";
  }
}

export class FlowerView {
  private static counter = 0;
  readonly root: TransformNode;
  /** carries the bloom so the bob/spin never disturbs the raw entity pose */
  private readonly bloom: TransformNode;
  /** ground halo ring (pulses scale + alpha) */
  private readonly ring: Mesh;
  private readonly ringMat: StandardMaterial;
  /** additive light column/pillar (shimmers alpha) */
  private readonly column: Mesh;
  private readonly columnMat: StandardMaterial;
  /** all beacon meshes (for pool bookkeeping / tests) */
  private readonly parts: Mesh[] = [];
  /** rising "collect me" sparkle motes */
  private readonly motes: ParticleSystem;
  private glbRoot: TransformNode | null = null;
  private upgradeStarted = false;
  private disposed = false;
  private active = false;
  private alive = true;
  /** per-entity phase so a field of flowers doesn't bob/pulse in lockstep */
  private phase = 0;

  constructor(scene: Scene, quality: Quality = safeQuality()) {
    const id = FlowerView.counter++;
    this.root = new TransformNode(`flower-${id}`, scene);
    this.bloom = new TransformNode(`flower-${id}-bloom`, scene);
    this.bloom.parent = this.root;
    this.bloom.position.y = ORB_BASE_Y;

    // opaque emissive (a solid glowing object reads better than washed-out
    // additive for the bloom core/petals)
    const solid = (name: string, rgb: [number, number, number]): StandardMaterial => {
      const m = new StandardMaterial(`flower-${id}-${name}`, scene);
      m.disableLighting = true;
      m.emissiveColor = new Color3(rgb[0], rgb[1], rgb[2]);
      m.specularColor = new Color3(0, 0, 0);
      return m;
    };
    // additive translucent emissive → a glowing "beacon" shaft/halo
    const glow = (name: string, rgb: [number, number, number], alpha: number): StandardMaterial => {
      const m = solid(name, rgb);
      m.alpha = alpha;
      m.alphaMode = Constants.ALPHA_ADD;
      m.backFaceCulling = false;
      return m;
    };

    // — ground halo ring (flat in XZ) —
    this.ringMat = glow("ring", HEAL_PINK, RING_MIN_ALPHA);
    this.ring = MeshBuilder.CreateTorus(
      `flower-${id}-ring`,
      { diameter: RING_RADIUS * 2, thickness: RING_THICKNESS, tessellation: 28 },
      scene,
    );
    this.ring.material = this.ringMat;
    this.ring.parent = this.root;
    this.ring.position.y = 0.04;
    this.parts.push(this.ring);

    // — soft upward light column/pillar —
    this.columnMat = glow("column", HEAL_WHITE, COLUMN_MIN_ALPHA);
    this.column = MeshBuilder.CreateCylinder(
      `flower-${id}-column`,
      {
        height: COLUMN_HEIGHT,
        diameterTop: COLUMN_DIAM_TOP,
        diameterBottom: COLUMN_DIAM_BOTTOM,
        tessellation: 16,
      },
      scene,
    );
    this.column.material = this.columnMat;
    this.column.parent = this.root;
    this.column.position.y = COLUMN_HEIGHT / 2;
    this.parts.push(this.column);

    // — glowing bloom: green core + pink petals + white pistil (bobs/spins) —
    const core = MeshBuilder.CreateSphere(`flower-${id}-core`, { diameter: 0.34, segments: 12 }, scene);
    core.material = solid("core", HEAL_GREEN);
    core.parent = this.bloom;
    this.parts.push(core);

    const petalMat = solid("petal", HEAL_PINK);
    for (let i = 0; i < PETAL_COUNT; i++) {
      const a = (i / PETAL_COUNT) * Math.PI * 2;
      const petal = MeshBuilder.CreateSphere(`flower-${id}-petal-${i}`, { diameter: 0.2, segments: 8 }, scene);
      petal.material = petalMat;
      petal.parent = this.bloom;
      petal.position.set(Math.cos(a) * 0.22, -0.02, Math.sin(a) * 0.22);
      petal.scaling.y = 0.45; // flatten into petal shapes
      this.parts.push(petal);
    }

    const pistil = MeshBuilder.CreateSphere(`flower-${id}-pistil`, { diameter: 0.14, segments: 8 }, scene);
    pistil.material = solid("pistil", HEAL_WHITE);
    pistil.parent = this.bloom;
    pistil.position.y = 0.13;
    this.parts.push(pistil);

    for (const m of this.parts) m.isPickable = false;

    // — rising sparkle motes (world-space emitter, repositioned in setPose) —
    const pScale = particleScaleFor(quality); // 1 desktop, 0.5 mobile
    const capacity = Math.max(8, Math.round(56 * pScale));
    this.motes = new ParticleSystem(`flower-${id}-motes`, capacity, scene);
    const tex = new Texture(MOTE_URL, scene);
    tex.hasAlpha = true;
    this.motes.particleTexture = tex;
    this.motes.emitter = new Vector3(0, PARTICLE_BASE_Y, 0);
    this.motes.minEmitBox = new Vector3(-0.34, 0, -0.34);
    this.motes.maxEmitBox = new Vector3(0.34, 0.08, 0.34);
    this.motes.direction1 = new Vector3(-0.06, 1, -0.06);
    this.motes.direction2 = new Vector3(0.06, 1, 0.06);
    this.motes.minEmitPower = 0.28;
    this.motes.maxEmitPower = 0.62;
    this.motes.gravity = new Vector3(0, 0.18, 0); // gentle upward drift
    this.motes.minLifeTime = 0.95;
    this.motes.maxLifeTime = 1.7;
    this.motes.minSize = quality === "mobile" ? 0.13 : 0.16;
    this.motes.maxSize = quality === "mobile" ? 0.26 : 0.32;
    this.motes.color1 = new Color4(HEAL_GREEN[0], HEAL_GREEN[1], HEAL_GREEN[2], 0.9);
    this.motes.color2 = new Color4(HEAL_PINK[0], HEAL_PINK[1], HEAL_PINK[2], 0.9);
    this.motes.colorDead = new Color4(HEAL_WHITE[0], HEAL_WHITE[1], HEAL_WHITE[2], 0);
    this.motes.blendMode = ParticleSystem.BLENDMODE_ADD;
    this.motes.emitRate = Math.max(4, Math.round(18 * pScale));
    this.motes.updateSpeed = 0.016;

    this.root.setEnabled(false);
  }

  get upgradeAttempted(): boolean {
    return this.upgradeStarted;
  }

  get hasGlb(): boolean {
    return this.glbRoot !== null;
  }

  /** Test/observability seam: the rising-mote particle system. */
  get moteSystem(): ParticleSystem {
    return this.motes;
  }

  /** Test/observability seam: beacon mesh count (excludes the decorative .glb). */
  get partCount(): number {
    return this.parts.length;
  }

  /** Acquire from the pool for entity `entityId` (phase de-syncs the idle). */
  activate(entityId: number): void {
    this.active = true;
    this.alive = true;
    this.phase = (entityId % 17) * 0.37 * Math.PI;
    this.setVisible(true);
  }

  /** Release back to the pool (the .glb, once loaded, is kept for reuse). */
  deactivate(): void {
    this.active = false;
    this.setVisible(false);
  }

  setPose(x: number, z: number): void {
    this.root.position.x = x;
    this.root.position.z = z;
    // world-space mote emitter tracks the flower (allocation-free .set)
    (this.motes.emitter as Vector3).set(x, PARTICLE_BASE_Y, z);
  }

  /** A dead-but-still-replicated flower hides (the burst vfx carries death). */
  setAlive(alive: boolean): void {
    if (alive === this.alive) return;
    this.alive = alive;
    this.setVisible(this.active && alive);
  }

  /** Toggle meshes + gate the mote emission with the same enabled state. */
  private setVisible(on: boolean): void {
    this.root.setEnabled(on);
    if (on) this.motes.start();
    else this.motes.stop();
  }

  /** Cheap idle bob/spin + ring & column pulse; call once per frame while active. */
  update(nowMs: number): void {
    // bobbing, slowly spinning bloom
    this.bloom.position.y = ORB_BASE_Y + bobOffset(nowMs, this.phase);
    this.bloom.rotation.y = nowMs * SPIN_SPEED + this.phase;
    // ground halo ring: pulse scale (in place) + alpha
    const p = pulse01(nowMs, this.phase);
    const s = RING_MIN_SCALE + p * (RING_MAX_SCALE - RING_MIN_SCALE);
    this.ring.scaling.x = s;
    this.ring.scaling.z = s;
    this.ringMat.alpha = RING_MIN_ALPHA + p * (RING_MAX_ALPHA - RING_MIN_ALPHA);
    // light column: gentle shimmer (anti-phase so the beacon "breathes")
    this.columnMat.alpha = COLUMN_MAX_ALPHA - p * (COLUMN_MAX_ALPHA - COLUMN_MIN_ALPHA);
  }

  /**
   * Swap in the model doc's .glb (async) as a decorative ground pad under the
   * beacon — never hides the beacon. Idempotent: safe to call every frame
   * until a doc is available; only the first call with a doc loads.
   */
  tryUpgradeToGlb(assets: AssetManager, doc: ModelDoc | null): void {
    if (!doc || this.upgradeStarted || this.disposed) return;
    this.upgradeStarted = true;
    void assets
      .load(doc.glbPath)
      .then((container) => {
        if (!container || this.disposed || this.glbRoot) return;
        const inst = container.instantiateModelsToScene((n) => `${this.root.name}-${n}`, false, {
          doNotInstantiate: true,
        });
        const glbRoot = new TransformNode(`${this.root.name}-glb`, this.root.getScene());
        glbRoot.parent = this.root;
        glbRoot.scaling.setAll(doc.scale);
        for (const node of inst.rootNodes) node.parent = glbRoot;
        for (const mesh of glbRoot.getChildMeshes(false)) mesh.isPickable = false;
        this.glbRoot = glbRoot;
      })
      .catch(() => {
        /* the procedural beacon stands on its own */
      });
  }

  dispose(): void {
    this.disposed = true;
    this.motes.dispose();
    this.root.dispose(false, true);
  }
}
