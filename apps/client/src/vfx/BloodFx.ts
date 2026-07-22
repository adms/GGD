/**
 * BloodFx — the imperative shell for the 濺血 / impact-debris layer (task #39).
 *
 * One `fire()` lands three things on the SAME frame as task #33's impact kit
 * (flash + sparks + smoke + shockwave), never instead of it:
 *   1. directional droplets along the damage vector (pooled, aimed per hit),
 *   2. a brief wound mist,
 *   3. a fading ground splat (blood style only; capped + pooled).
 *
 * POOLING. Systems are keyed by `style/severity/dmgType` — deliberately NOT by
 * direction: the aim lives on the emitter's velocity cone and is re-pointed on
 * every fire (`setBurstDirection`), so one pooled pair of systems serves every
 * incoming angle and a 12-player brawl still allocates nothing per hit.
 *
 * OFF MEANS OFF. When the resolved style is "off" (or intensity 0) `fire()`
 * returns an empty array having touched neither pool — no system is created,
 * no decal is spawned, nothing is emitted. That is the contract the settings
 * toggle rests on.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { BurstPool, setBurstDirection, type PresetSystemOptions } from "./vfxPresets";
import { GroundDecalPool } from "./GroundDecalPool";
import {
  bloodRecipe,
  sprayCone,
  type HitSeverity,
  type STYLIZED_TINTS,
  type Vec2,
} from "./bloodPresets";
import type { GoreStyle } from "./goreConfig";

export type BloodDmgType = keyof typeof STYLIZED_TINTS;

export interface BloodFireArgs {
  /** impact point (world) */
  x: number;
  z: number;
  /** wound height; defaults to torso level */
  y?: number;
  /** unit planar damage vector (attacker → victim), from `sprayDirection` */
  dir: Vec2;
  severity: HitSeverity;
  style: GoreStyle;
  /** 0..1 resolved gore intensity */
  intensity: number;
  /** tints the STYLIZED style (ignored by "blood") */
  dmgType?: BloodDmgType;
  /** quality-tier particle budget multiplier */
  scale?: number;
  nowMs: number;
}

/** Wound height when the caller doesn't know one (torso, not feet). */
export const DEFAULT_WOUND_Y = 1.15;

export class BloodFx {
  private readonly pool: BurstPool;
  private readonly decals: GroundDecalPool;

  constructor(
    scene: Scene,
    opts: PresetSystemOptions & {
      /** free-list cap per pooled key (BurstPool) */
      maxPerKey?: number;
      /** idle ms before a pooled system is disposed (BurstPool) */
      idleReapMs?: number;
      /** hard cap on concurrent ground splats (GroundDecalPool) */
      maxDecals?: number;
    } = {},
  ) {
    this.pool = new BurstPool(scene, opts);
    this.decals = new GroundDecalPool(scene, opts);
  }

  /** Live ground splats (test/observability seam). */
  get decalCount(): number {
    return this.decals.activeCount;
  }

  /** Pooled systems held for a key (test seam). */
  countFor(key: string): number {
    return this.pool.countFor(key);
  }

  /**
   * Fire one spray. Returns the pooled systems used ([] when the style is
   * "off" / intensity 0, i.e. nothing was emitted at all).
   */
  fire(args: BloodFireArgs): ParticleSystem[] {
    const recipe = bloodRecipe(args.style, args.severity, args.intensity, args.dmgType ?? "physical");
    if (!recipe) return [];
    const y = args.y ?? DEFAULT_WOUND_Y;
    const scale = args.scale ?? 1;
    const keyBase = `${args.style}/${args.severity}/${args.dmgType ?? "physical"}`;

    const droplets = this.pool.fireAt(
      `${keyBase}/droplets`,
      recipe.droplets,
      args.x,
      args.z,
      y,
      args.nowMs,
      scale,
    );
    // aim AFTER queueing: particles are only born on the next animate(), so the
    // burst we just queued picks up this cone (see setBurstDirection)
    const cone = sprayCone(args.dir, recipe.spread);
    setBurstDirection(droplets, cone.d1, cone.d2);

    const mist = this.pool.fireAt(`${keyBase}/mist`, recipe.mist, args.x, args.z, y, args.nowMs, scale);

    if (recipe.decal) {
      // the splat lands slightly PAST the victim, along the damage vector —
      // blood keeps travelling, it does not pool under the wound
      const lead = recipe.decal.radius * 0.6;
      this.decals.spawn(args.x + args.dir.x * lead, args.z + args.dir.z * lead, recipe.decal, args.nowMs);
    }
    return [droplets, mist];
  }

  /** Advance decal fades + reap idle pooled systems. Once per frame. */
  update(nowMs: number): void {
    this.decals.update(nowMs);
    this.pool.update(nowMs);
  }

  dispose(): void {
    this.pool.dispose();
    this.decals.dispose();
  }
}
