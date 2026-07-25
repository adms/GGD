/**
 * CoinView — pooled view for a DROPPED GOLD COIN (task #191 陣亡投幣,
 * EntityState.kind 5, key "prop.gold-coin"). Cloned from FlowerView's pooling
 * contract (activate/deactivate, registry-owned free-list).
 *
 * THE OWNER ASKED FOR 「閃光光芒」 — a shine. There is no coin asset in the repo
 * and the combat scene runs no GlowLayer or bloom post-process, so "shine" here
 * is built the same way FlowerView's beacon is: a `solid()` / `glow()` pair of
 * unlit emissive materials (`disableLighting`, `emissiveColor`, zero specular;
 * the halo variant adds `alpha` + `Constants.ALPHA_ADD` + `backFaceCulling
 * false`). Additive translucency over an opaque emissive core is what reads as
 * light on a top-down camera without a bloom pass.
 *
 * The coin itself is an UPRIGHT cylinder (d 0.62, h 0.06) standing on edge at
 * y≈0.55, so from the MOBA camera it presents its face rather than a
 * near-invisible ground disc — the same mistake the flower's 0.017u lily made.
 * It spins on Y (phase-offset per entity so a pile never turns in lockstep),
 * pulses a glint, sits on an additive torus ground-light, and throws a small
 * quality-capped mote system.
 *
 * A coin carries NO health bar (`overheadAnchors.hasOverheadBar` returns false
 * for kind 5) and no name — nothing here draws one. Idle motion is pure
 * Math.sin via FlowerView's shared `pulse01`, written into existing
 * vectors/scalars; no per-frame allocation.
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
import { effectiveQuality, particleScaleFor, type Quality } from "../RenderConfig";
import { pulse01 } from "./FlowerView";

/** Coin face diameter / thickness (world units) — a readable disc, edge-up. */
const COIN_DIAMETER = 0.62;
const COIN_THICKNESS = 0.06;
/** Height of the coin's centre: eye-catching from overhead, still "on the floor". */
const COIN_Y = 0.55;
/** Additive ground-light ring under the coin. */
const RING_RADIUS = 0.44;
const RING_THICKNESS = 0.07;
const RING_Y = 0.04;
/** Height the sparkle motes emit from. */
const PARTICLE_BASE_Y = 0.18;

// ── Idle motion (rad/ms) ────────────────────────────────────────────────────
const SPIN_SPEED = 0.0026;
const GLINT_SPEED = 0.0041;
/** Ground-light pulse envelope. */
const RING_MIN_ALPHA = 0.22;
const RING_MAX_ALPHA = 0.66;
const RING_MIN_SCALE = 0.88;
const RING_MAX_SCALE = 1.24;
/** Glint envelope on the coin's own halo. */
const GLINT_MIN_ALPHA = 0.18;
const GLINT_MAX_ALPHA = 0.62;

// ── Gold palette ────────────────────────────────────────────────────────────
const GOLD: [number, number, number] = [0.85, 0.78, 0.5];
const GOLD_BRIGHT: [number, number, number] = [1.0, 0.94, 0.68];

const MOTE_URL = "/content/assets/textures/particles/light_01.png";

/** Resolve the quality tier without throwing in odd (headless) environments. */
function safeQuality(): Quality {
  try {
    return effectiveQuality();
  } catch {
    return "desktop";
  }
}

export class CoinView {
  private static counter = 0;
  readonly root: TransformNode;
  /** carries the coin body so the spin never disturbs the raw entity pose */
  private readonly body: TransformNode;
  private readonly ring: Mesh;
  private readonly ringMat: StandardMaterial;
  /** additive shell around the coin — the 閃光 that reads without a bloom pass */
  private readonly halo: Mesh;
  private readonly haloMat: StandardMaterial;
  private readonly parts: Mesh[] = [];
  private readonly motes: ParticleSystem;
  private disposed = false;
  private active = false;
  /** per-entity phase so a pile of coins never spins in lockstep */
  private phase = 0;

  constructor(scene: Scene, quality: Quality = safeQuality()) {
    const id = CoinView.counter++;
    this.root = new TransformNode(`coin-${id}`, scene);
    this.body = new TransformNode(`coin-${id}-body`, scene);
    this.body.parent = this.root;
    this.body.position.y = COIN_Y;

    const solid = (name: string, rgb: [number, number, number]): StandardMaterial => {
      const m = new StandardMaterial(`coin-${id}-${name}`, scene);
      m.disableLighting = true;
      m.emissiveColor = new Color3(rgb[0], rgb[1], rgb[2]);
      m.specularColor = new Color3(0, 0, 0);
      return m;
    };
    const glow = (name: string, rgb: [number, number, number], alpha: number): StandardMaterial => {
      const m = solid(name, rgb);
      m.alpha = alpha;
      m.alphaMode = Constants.ALPHA_ADD;
      m.backFaceCulling = false;
      return m;
    };

    // — the coin: an UPRIGHT cylinder, i.e. a disc standing on its edge —
    const face = MeshBuilder.CreateCylinder(
      `coin-${id}-face`,
      { height: COIN_THICKNESS, diameter: COIN_DIAMETER, tessellation: 24 },
      scene,
    );
    face.material = solid("face", GOLD);
    face.parent = this.body;
    face.rotation.x = Math.PI / 2; // lay the cylinder's axis flat -> face-up to the camera
    this.parts.push(face);

    // — additive halo: the same disc, slightly larger, blended ADD —
    this.haloMat = glow("halo", GOLD_BRIGHT, GLINT_MIN_ALPHA);
    this.halo = MeshBuilder.CreateCylinder(
      `coin-${id}-halo`,
      { height: COIN_THICKNESS * 0.6, diameter: COIN_DIAMETER * 1.5, tessellation: 24 },
      scene,
    );
    this.halo.material = this.haloMat;
    this.halo.parent = this.body;
    this.halo.rotation.x = Math.PI / 2;
    this.parts.push(this.halo);

    // — ground light: a flat additive torus, so the coin lights the floor —
    this.ringMat = glow("ring", GOLD, RING_MIN_ALPHA);
    this.ring = MeshBuilder.CreateTorus(
      `coin-${id}-ring`,
      { diameter: RING_RADIUS * 2, thickness: RING_THICKNESS, tessellation: 24 },
      scene,
    );
    this.ring.material = this.ringMat;
    this.ring.parent = this.root;
    this.ring.position.y = RING_Y;
    this.parts.push(this.ring);

    for (const m of this.parts) m.isPickable = false;

    // — sparkle motes (world-space emitter, repositioned in setPose) —
    const pScale = particleScaleFor(quality); // 1 desktop, 0.5 mobile
    const capacity = Math.max(6, Math.round(36 * pScale));
    this.motes = new ParticleSystem(`coin-${id}-motes`, capacity, scene);
    const tex = new Texture(MOTE_URL, scene);
    tex.hasAlpha = true;
    this.motes.particleTexture = tex;
    this.motes.emitter = new Vector3(0, PARTICLE_BASE_Y, 0);
    this.motes.minEmitBox = new Vector3(-0.2, 0, -0.2);
    this.motes.maxEmitBox = new Vector3(0.2, 0.12, 0.2);
    this.motes.direction1 = new Vector3(-0.05, 1, -0.05);
    this.motes.direction2 = new Vector3(0.05, 1, 0.05);
    this.motes.minEmitPower = 0.2;
    this.motes.maxEmitPower = 0.5;
    this.motes.gravity = new Vector3(0, 0.12, 0);
    this.motes.minLifeTime = 0.6;
    this.motes.maxLifeTime = 1.15;
    this.motes.minSize = quality === "mobile" ? 0.1 : 0.13;
    this.motes.maxSize = quality === "mobile" ? 0.2 : 0.26;
    this.motes.color1 = new Color4(GOLD_BRIGHT[0], GOLD_BRIGHT[1], GOLD_BRIGHT[2], 0.95);
    this.motes.color2 = new Color4(GOLD[0], GOLD[1], GOLD[2], 0.9);
    this.motes.colorDead = new Color4(GOLD[0], GOLD[1], GOLD[2], 0);
    this.motes.blendMode = ParticleSystem.BLENDMODE_ADD;
    this.motes.emitRate = Math.max(3, Math.round(14 * pScale));
    this.motes.updateSpeed = 0.016;

    this.root.setEnabled(false);
  }

  /** Test/observability seam: the sparkle particle system. */
  get moteSystem(): ParticleSystem {
    return this.motes;
  }

  /** Test/observability seam: mesh count. */
  get partCount(): number {
    return this.parts.length;
  }

  /** Acquire from the pool for entity `entityId` (phase de-syncs the spin). */
  activate(entityId: number): void {
    this.active = true;
    this.phase = (entityId % 17) * 0.37 * Math.PI;
    this.setVisible(true);
  }

  /** Release back to the pool. */
  deactivate(): void {
    this.active = false;
    this.setVisible(false);
  }

  setPose(x: number, z: number): void {
    this.root.position.x = x;
    this.root.position.z = z;
    (this.motes.emitter as Vector3).set(x, PARTICLE_BASE_Y, z);
  }

  private setVisible(on: boolean): void {
    this.root.setEnabled(on);
    if (on) this.motes.start();
    else this.motes.stop();
  }

  /** Spin + glint + ground-light pulse; call once per frame while active. */
  update(nowMs: number): void {
    this.body.rotation.y = nowMs * SPIN_SPEED + this.phase;
    // the glint runs faster than the ground light so the two never beat together
    const g = pulse01(nowMs, this.phase, GLINT_SPEED);
    this.haloMat.alpha = GLINT_MIN_ALPHA + g * (GLINT_MAX_ALPHA - GLINT_MIN_ALPHA);
    const p = pulse01(nowMs, this.phase);
    const s = RING_MIN_SCALE + p * (RING_MAX_SCALE - RING_MIN_SCALE);
    this.ring.scaling.x = s;
    this.ring.scaling.z = s;
    this.ringMat.alpha = RING_MIN_ALPHA + p * (RING_MAX_ALPHA - RING_MIN_ALPHA);
  }

  /** True while pooled-out and visible (test seam). */
  get isActive(): boolean {
    return this.active;
  }

  dispose(): void {
    this.disposed = true;
    this.motes.dispose();
    this.root.dispose(false, true);
  }

  /** True once disposed (test seam; mirrors FlowerView's guard). */
  get isDisposed(): boolean {
    return this.disposed;
  }
}
