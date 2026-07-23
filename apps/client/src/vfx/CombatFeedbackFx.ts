/**
 * CombatFeedbackFx — the imperative shell for the generic combat-feedback
 * moments task #33 left blank: MUZZLE FLASH at a cast origin, LANDING DUST
 * under a knocked-down body, and the BLOCK/PARRY clink (task #39, item 3).
 *
 * All three share one BurstPool with the same discipline as the impact kit and
 * the blood layer: keyed by the tint/power bucket (never by direction — aim is
 * applied per fire on the emitter's velocity cone), grown to a cap, LRU-stolen
 * beyond it, and reaped when idle. Repeated fire allocates nothing.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { BurstPool, setBurstDirection, type BurstSpec, type PresetSystemOptions, type Rgb } from "./vfxPresets";
import { sprayCone, type Vec2 } from "./bloodPresets";
import {
  blockRecipe,
  landingDustRecipe,
  muzzleRecipe,
  walkDustRecipe,
  MUZZLE_TINTS,
  type BlockRecipe,
  type DustRecipe,
  type MuzzleRecipe,
} from "./feedbackPresets";

export type MuzzleDmgType = keyof typeof MUZZLE_TINTS;

/** Power is quantized into these buckets so pooled keys stay bounded. */
export const POWER_STEP = 0.25;

/** Quantize a 0..1 power onto POWER_STEP (pool-key discipline). PURE. */
export function quantizePower(power: number): number {
  const p = Math.min(1, Math.max(0, power));
  return Math.max(POWER_STEP, Math.round(p / POWER_STEP) * POWER_STEP);
}

export class CombatFeedbackFx {
  private readonly pool: BurstPool;
  /** memoized recipes per quantized key (gradients are baked per system) */
  private readonly muzzles = new Map<string, MuzzleRecipe>();
  private readonly dusts = new Map<number, DustRecipe>();
  private readonly blocks = new Map<number, BlockRecipe>();
  /** the one walking-dust spec (memoized: it takes no parameters) */
  private walkSpec: BurstSpec | null = null;

  constructor(scene: Scene, opts: PresetSystemOptions = {}) {
    this.pool = new BurstPool(scene, opts);
  }

  /** Pooled systems held for a key (test seam). */
  countFor(key: string): number {
    return this.pool.countFor(key);
  }

  /**
   * MUZZLE FLASH at a projectile's spawn point, aimed down `dir` (the shot
   * direction). `y` defaults to hand height. Returns the systems used.
   */
  muzzle(args: {
    x: number;
    z: number;
    y?: number;
    dir: Vec2;
    dmgType?: MuzzleDmgType;
    power?: number;
    scale?: number;
    nowMs: number;
  }): ParticleSystem[] {
    const dmgType = args.dmgType ?? "physical";
    const p = quantizePower(args.power ?? 1);
    const key = `muzzle/${dmgType}/${p}`;
    let recipe = this.muzzles.get(key);
    if (!recipe) {
      recipe = muzzleRecipe(MUZZLE_TINTS[dmgType] as Rgb, p);
      this.muzzles.set(key, recipe);
    }
    const y = args.y ?? 1.25;
    const scale = args.scale ?? 1;
    const flash = this.pool.fireAt(`${key}/flash`, recipe.flash, args.x, args.z, y, args.nowMs, scale);
    const streaks = this.pool.fireAt(
      `${key}/streaks`,
      recipe.streaks,
      args.x,
      args.z,
      y,
      args.nowMs,
      scale,
    );
    // streaks race down the shot line, with almost no upward bias
    const cone = sprayCone(args.dir, recipe.spread, 0.1);
    setBurstDirection(streaks, cone.d1, cone.d2);
    return [flash, streaks];
  }

  /** LANDING DUST: a flat radial floor kick at ground level (y is forced 0). */
  landingDust(args: { x: number; z: number; power?: number; scale?: number; nowMs: number }): ParticleSystem[] {
    const p = quantizePower(args.power ?? 1);
    let recipe = this.dusts.get(p);
    if (!recipe) {
      recipe = landingDustRecipe(p);
      this.dusts.set(p, recipe);
    }
    const scale = args.scale ?? 1;
    return [
      this.pool.fireAt(`dust/${p}/puff`, recipe.puff, args.x, args.z, 0.06, args.nowMs, scale),
      this.pool.fireAt(`dust/${p}/grit`, recipe.grit, args.x, args.z, 0.06, args.nowMs, scale),
    ];
  }

  /**
   * WALKING DUST: a small soft puff kicked up under a moving foot (grows +
   * rises + fades — see walkDustRecipe). `y` is forced near the floor. The
   * caller velocity-gates this per entity, so here it is a plain one-shot.
   */
  walkDust(args: { x: number; z: number; scale?: number; nowMs: number }): ParticleSystem {
    if (!this.walkSpec) this.walkSpec = walkDustRecipe();
    return this.pool.fireAt("walkdust", this.walkSpec, args.x, args.z, 0.05, args.nowMs, args.scale ?? 1);
  }

  /**
   * BLOCK / PARRY clink. `dir` is the INCOMING damage vector; the sparks are
   * fanned back along its negation, so the guard visibly deflects the hit.
   */
  block(args: {
    x: number;
    z: number;
    y?: number;
    dir: Vec2;
    power?: number;
    scale?: number;
    nowMs: number;
  }): ParticleSystem[] {
    const p = quantizePower(args.power ?? 1);
    let recipe = this.blocks.get(p);
    if (!recipe) {
      recipe = blockRecipe(p);
      this.blocks.set(p, recipe);
    }
    const y = args.y ?? 1.2;
    const scale = args.scale ?? 1;
    const flash = this.pool.fireAt(`block/${p}/flash`, recipe.flash, args.x, args.z, y, args.nowMs, scale);
    const sparks = this.pool.fireAt(`block/${p}/sparks`, recipe.sparks, args.x, args.z, y, args.nowMs, scale);
    // REBOUND: negate the incoming vector so the fan comes back at the attacker
    const cone = sprayCone({ x: -args.dir.x, z: -args.dir.z }, recipe.spread, 0.35);
    setBurstDirection(sparks, cone.d1, cone.d2);
    return [flash, sparks];
  }

  /** Reap idle pooled systems. Once per frame. */
  update(nowMs: number): void {
    this.pool.update(nowMs);
  }

  dispose(): void {
    this.pool.dispose();
    this.muzzles.clear();
    this.dusts.clear();
    this.blocks.clear();
    this.walkSpec = null;
  }
}
