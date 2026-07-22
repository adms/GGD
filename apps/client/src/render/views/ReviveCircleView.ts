/**
 * ReviveCircleView — pooled world view for the revive circles (task #84,
 * EntityState.kind 3, key "prop.revive-circle"). Mirrors FlowerView's pooling
 * contract (activate/deactivate, registry-owned free-list).
 *
 * TASK #22 IS THE CAUTIONARY TALE: the healing flower shipped as a 0.137u flat
 * disc and was invisible from the fixed top-down camera. This ring is built to
 * be unmistakable at the camera's DEFAULT (closest) zoom before anything else:
 *
 *   • a team-tinted ground ring at the authoritative `radius` (2.0u — 1.7x a
 *     champion's own diameter, so it is never a pixel-hunt),
 *   • a crown of RISING FLAME TONGUES around that ring: the tongues light up
 *     in order, so the ring visibly FILLS as the channel progresses. This is
 *     the world-space progress read the brief demands — the channeller AND the
 *     enemy standing on top of them both see how close the rescue is without
 *     looking at any HUD,
 *   • a central pillar of fire whose height tracks the same progress, readable
 *     even when bodies are stacked over the ring,
 *   • rising embers (one capacity-capped ParticleSystem, quality-scaled like
 *     every other pooled system — task #33's discipline),
 *   • an idle "burn-down" cue: as the 6s lifetime runs out the whole ring dims
 *     and beats faster, so an expiring circle is legible as expiring,
 *   • a CONTESTED state (enemy inside, progress held): the fire snaps to a hot
 *     warning white-orange and strobes, so "you are being blocked" reads
 *     instantly and differently from "nobody is channelling".
 *
 * All idle motion is pure Math.sin over `nowMs` written into existing
 * vectors/scalars — no per-frame allocation. This file is CLIENT-side render
 * only; nothing here feeds the sim (circles are server entities, interpolated,
 * never predicted).
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
import { TEAM_COLORS } from "./ChampionView";

/** Flame tongues around the rim — the discrete progress read. */
export const TONGUE_COUNT = 20;
/** Ring geometry is authored at radius 1 and SCALED to the wire radius. */
const REF_RADIUS = 1;
const RING_THICKNESS = 0.16;
/** Tongue proportions (world units at radius 1, scaled with the ring). */
const TONGUE_DIAM = 0.2;
const TONGUE_HEIGHT = 0.62;
/** Central pillar: idle height → full height at 100% progress. */
const PILLAR_MIN_HEIGHT = 0.35;
const PILLAR_MAX_HEIGHT = 2.3;
const PILLAR_DIAM_BOTTOM = 0.62;
const PILLAR_DIAM_TOP = 0.1;

// ── idle motion (rad/ms) ────────────────────────────────────────────────────
const FLICKER_SPEED = 0.011;
const BEAT_SPEED = 0.0042;
/** Contested strobe is deliberately much faster than the calm beat. */
const CONTEST_STROBE_SPEED = 0.022;

// ── alpha envelopes ─────────────────────────────────────────────────────────
const RING_MIN_ALPHA = 0.45;
const RING_MAX_ALPHA = 0.95;
const PILLAR_MIN_ALPHA = 0.22;
const PILLAR_MAX_ALPHA = 0.55;
/** Below this much lifetime left the ring reads as burning out. */
export const BURNDOWN_FROM = 0.35;

/** Hot warning tint used while an enemy contests the ring. */
const CONTEST_RGB: readonly [number, number, number] = [1.0, 0.62, 0.16];
/** Flame highlight mixed into the team hue so it reads as FIRE, not a decal. */
const FLAME_RGB: readonly [number, number, number] = [1.0, 0.78, 0.3];

const EMBER_URL = "/content/assets/textures/particles/light_01.png";

/** Team base colour for a circle (shared 4-team palette; -1 → neutral gold). */
export function teamRgb(teamId: number): readonly [number, number, number] {
  if (teamId < 0) return [0.85, 0.78, 0.5];
  return TEAM_COLORS[((teamId % 4) + 4) % 4]!;
}

/**
 * How many rim tongues are lit at `progress` (0..1). Always shows at least one
 * once ANY progress exists, so the very first tick of a channel is visible.
 */
export function litTongues(progress: number, count = TONGUE_COUNT): number {
  const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
  if (p <= 0) return 0;
  return Math.max(1, Math.min(count, Math.ceil(p * count)));
}

/** 0..1 flicker (pure); phase de-syncs concurrent circles. */
export function flicker01(nowMs: number, phase: number, speed = FLICKER_SPEED): number {
  return 0.5 + 0.5 * Math.sin(nowMs * speed + phase);
}

/**
 * Urgency 0..1 from the fraction of lifetime REMAINING: 0 while the circle has
 * plenty of time, ramping to 1 as it burns out. Drives the dim + faster beat.
 */
export function burndown01(lifeLeftFrac: number): number {
  const f = lifeLeftFrac < 0 ? 0 : lifeLeftFrac > 1 ? 1 : lifeLeftFrac;
  return f >= BURNDOWN_FROM ? 0 : 1 - f / BURNDOWN_FROM;
}

/** Per-frame inputs from the authoritative snapshot. */
export interface ReviveCircleVisualState {
  /** channel fill 0..1 */
  progress: number;
  /** fraction of the lifetime still to run, 1 → 0 */
  lifeLeft: number;
  /** at least one ally is channelling right now */
  channelling: boolean;
  /** an enemy stands inside, holding progress */
  contested: boolean;
}

/** Resolve the quality tier without throwing in odd (headless) environments. */
function safeQuality(): Quality {
  try {
    return effectiveQuality();
  } catch {
    return "desktop";
  }
}

export class ReviveCircleView {
  private static counter = 0;
  readonly root: TransformNode;
  private readonly ring: Mesh;
  private readonly ringMat: StandardMaterial;
  private readonly pillar: Mesh;
  private readonly pillarMat: StandardMaterial;
  private readonly tongues: Mesh[] = [];
  private readonly tongueMat: StandardMaterial;
  private readonly embers: ParticleSystem;
  private readonly emberBase: Color4;
  /** quality-capped full-throttle emit rate (never exceeded) */
  private readonly emberRate: number;
  private active = false;
  private disposed = false;
  /** de-sync concurrent circles so two rings never flicker in lockstep */
  private phase = 0;
  /** authored-at-1 geometry is scaled to this every activate() */
  private radius = 1;
  private team = 0;
  private lit = -1; // last applied tongue count (avoids redundant setEnabled)

  constructor(scene: Scene, quality: Quality = safeQuality()) {
    const id = ReviveCircleView.counter++;
    this.root = new TransformNode(`revive-${id}`, scene);

    const glow = (name: string, alpha: number): StandardMaterial => {
      const m = new StandardMaterial(`revive-${id}-${name}`, scene);
      m.disableLighting = true;
      m.specularColor = new Color3(0, 0, 0);
      m.emissiveColor = new Color3(1, 1, 1);
      m.alpha = alpha;
      m.alphaMode = Constants.ALPHA_ADD;
      m.backFaceCulling = false;
      return m;
    };

    // — ground ring (flat in XZ, authored at radius 1) —
    this.ringMat = glow("ring", RING_MIN_ALPHA);
    this.ring = MeshBuilder.CreateTorus(
      `revive-${id}-ring`,
      { diameter: REF_RADIUS * 2, thickness: RING_THICKNESS, tessellation: 40 },
      scene,
    );
    this.ring.material = this.ringMat;
    this.ring.parent = this.root;
    this.ring.position.y = 0.05;

    // — rim flame tongues: the discrete progress fill —
    this.tongueMat = glow("tongue", 0.85);
    for (let i = 0; i < TONGUE_COUNT; i++) {
      const a = (i / TONGUE_COUNT) * Math.PI * 2;
      const t = MeshBuilder.CreateCylinder(
        `revive-${id}-tongue-${i}`,
        {
          height: TONGUE_HEIGHT,
          diameterTop: 0.02,
          diameterBottom: TONGUE_DIAM,
          tessellation: 8,
        },
        scene,
      );
      t.material = this.tongueMat;
      t.parent = this.root;
      t.position.set(Math.cos(a) * REF_RADIUS, TONGUE_HEIGHT / 2, Math.sin(a) * REF_RADIUS);
      t.setEnabled(false);
      this.tongues.push(t);
    }

    // — central pillar (height tracks progress) —
    this.pillarMat = glow("pillar", PILLAR_MIN_ALPHA);
    this.pillar = MeshBuilder.CreateCylinder(
      `revive-${id}-pillar`,
      {
        height: 1, // unit height: scaling.y IS the height
        diameterTop: PILLAR_DIAM_TOP,
        diameterBottom: PILLAR_DIAM_BOTTOM,
        tessellation: 18,
      },
      scene,
    );
    this.pillarMat.emissiveColor = new Color3(FLAME_RGB[0], FLAME_RGB[1], FLAME_RGB[2]);
    this.pillar.material = this.pillarMat;
    this.pillar.parent = this.root;

    for (const m of [this.ring, this.pillar, ...this.tongues]) m.isPickable = false;

    // — rising embers (world-space emitter; repositioned in setPose) —
    const pScale = particleScaleFor(quality); // 1 desktop, 0.5 mobile
    const capacity = Math.max(8, Math.round(64 * pScale));
    this.embers = new ParticleSystem(`revive-${id}-embers`, capacity, scene);
    const tex = new Texture(EMBER_URL, scene);
    tex.hasAlpha = true;
    this.embers.particleTexture = tex;
    this.embers.emitter = new Vector3(0, 0.1, 0);
    this.embers.minEmitBox = new Vector3(-1, 0, -1);
    this.embers.maxEmitBox = new Vector3(1, 0.1, 1);
    this.embers.direction1 = new Vector3(-0.1, 1, -0.1);
    this.embers.direction2 = new Vector3(0.1, 1, 0.1);
    this.embers.minEmitPower = 0.5;
    this.embers.maxEmitPower = 1.2;
    this.embers.gravity = new Vector3(0, 0.5, 0);
    this.embers.minLifeTime = 0.5;
    this.embers.maxLifeTime = 1.1;
    this.embers.minSize = quality === "mobile" ? 0.12 : 0.16;
    this.embers.maxSize = quality === "mobile" ? 0.24 : 0.34;
    this.emberBase = new Color4(1, 1, 1, 0.95);
    this.embers.color1 = this.emberBase;
    this.embers.color2 = new Color4(FLAME_RGB[0], FLAME_RGB[1], FLAME_RGB[2], 0.9);
    this.embers.colorDead = new Color4(1, 0.5, 0.15, 0);
    this.embers.blendMode = ParticleSystem.BLENDMODE_ADD;
    this.emberRate = Math.max(6, Math.round(26 * pScale));
    this.embers.emitRate = this.emberRate;
    this.embers.updateSpeed = 0.016;

    this.root.setEnabled(false);
  }

  /** Test/observability seam. */
  get emberSystem(): ParticleSystem {
    return this.embers;
  }

  /** Test/observability seam: how many rim tongues are currently lit. */
  get litCount(): number {
    let n = 0;
    for (const t of this.tongues) if (t.isEnabled(false)) n++;
    return n;
  }

  /**
   * Acquire from the pool for one circle. `radius` is the AUTHORITATIVE ring
   * size off the wire (never a client-side constant), `teamId` picks the tint
   * from the shared 4-team palette.
   */
  activate(entityId: number, teamId: number, radius: number): void {
    this.active = true;
    this.phase = (entityId % 23) * 0.41 * Math.PI;
    this.team = teamId;
    this.radius = radius > 0 ? radius : 1;
    // one uniform scale on the root: the ring, the tongue placement and the
    // pillar footprint all grow together, so the wire radius is honoured
    // exactly without re-authoring any geometry.
    this.root.scaling.set(this.radius, 1, this.radius);
    const rgb = teamRgb(teamId);
    this.ringMat.emissiveColor.set(rgb[0], rgb[1], rgb[2]);
    this.tongueMat.emissiveColor.set(
      (rgb[0] + FLAME_RGB[0]) / 2,
      (rgb[1] + FLAME_RGB[1]) / 2,
      (rgb[2] + FLAME_RGB[2]) / 2,
    );
    this.emberBase.set(rgb[0], rgb[1], rgb[2], 0.95);
    this.lit = -1;
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
    (this.embers.emitter as Vector3).set(x, 0.1, z);
  }

  private setVisible(on: boolean): void {
    this.root.setEnabled(on);
    if (on) this.embers.start();
    else this.embers.stop();
  }

  /**
   * Per-frame visual update. Everything here is a write into an existing
   * vector/scalar — no allocation, no geometry rebuild.
   */
  update(nowMs: number, st: ReviveCircleVisualState): void {
    if (!this.active) return;

    const urgency = burndown01(st.lifeLeft);
    // calm beat while there is time; a fast strobe while contested; an
    // accelerating beat as the ring burns out
    const beatSpeed = st.contested
      ? CONTEST_STROBE_SPEED
      : BEAT_SPEED * (1 + urgency * 2.2);
    const beat = 0.5 + 0.5 * Math.sin(nowMs * beatSpeed + this.phase);
    const flick = flicker01(nowMs, this.phase);
    // a burning-out ring dims: the "hurry up" read
    const dim = 1 - urgency * 0.45;

    this.ringMat.alpha = (RING_MIN_ALPHA + beat * (RING_MAX_ALPHA - RING_MIN_ALPHA)) * dim;

    // — rim fill: light the first N tongues, flicker their height —
    const want = litTongues(st.progress);
    if (want !== this.lit) {
      for (let i = 0; i < this.tongues.length; i++) this.tongues[i]!.setEnabled(i < want);
      this.lit = want;
    }
    const tongueScale = 0.75 + flick * 0.5 + (st.channelling ? 0.35 : 0);
    for (let i = 0; i < want; i++) {
      const t = this.tongues[i]!;
      // stagger the flicker around the rim so it licks rather than pulses
      const s = tongueScale + 0.18 * Math.sin(nowMs * FLICKER_SPEED + i * 0.7 + this.phase);
      t.scaling.y = s;
      t.position.y = (TONGUE_HEIGHT * s) / 2;
    }
    this.tongueMat.alpha = (0.6 + flick * 0.4) * dim;

    // — central pillar: height IS the progress, so a stacked fight still reads —
    const h = PILLAR_MIN_HEIGHT + st.progress * (PILLAR_MAX_HEIGHT - PILLAR_MIN_HEIGHT);
    this.pillar.scaling.y = h;
    this.pillar.position.y = h / 2;
    this.pillarMat.alpha =
      (PILLAR_MIN_ALPHA + (st.channelling ? beat : 0.25) * (PILLAR_MAX_ALPHA - PILLAR_MIN_ALPHA)) *
      dim;

    // — contest: hot warning tint on ring + pillar; team hue otherwise —
    const rgb = st.contested ? CONTEST_RGB : teamRgb(this.team);
    this.ringMat.emissiveColor.set(rgb[0], rgb[1], rgb[2]);
    this.pillarMat.emissiveColor.set(
      st.contested ? CONTEST_RGB[0] : FLAME_RGB[0],
      st.contested ? CONTEST_RGB[1] : FLAME_RGB[1],
      st.contested ? CONTEST_RGB[2] : FLAME_RGB[2],
    );

    // embers pour while somebody is actually channelling — an idle ring still
    // burns, but a driven one is visibly ALIVE. Both rates stay inside the
    // quality-scaled budget (`emberRate` is the capped full-throttle value).
    this.embers.emitRate = st.channelling ? this.emberRate : this.emberRate * 0.3;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.embers.stop();
    this.embers.dispose();
    for (const t of this.tongues) t.dispose();
    this.ring.dispose();
    this.pillar.dispose();
    this.ringMat.dispose();
    this.tongueMat.dispose();
    this.pillarMat.dispose();
    this.root.dispose();
  }
}
