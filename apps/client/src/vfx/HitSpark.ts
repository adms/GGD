/**
 * HitSpark — the LAYERED impact kit at hit points (task #33 retune).
 *
 * Was: one scale-pop voxel cube per hit, with a fresh mesh + material
 * allocated and disposed every time. Now each HitSpark is a thin per-hit
 * HANDLE onto a scene-shared pooled ImpactComposer (vfxPresets): one
 * construction fires the full Diablo/LoL-school layered impact — white-hot
 * additive core flash (1–3 frames) + fast gravity/drag stretched spark
 * streaks + low-alpha standard-blend smoke body, plus an expanding ground
 * shockwave ring on heavy/EX hits. All the energy lands at t=0 as manual
 * bursts (impact-first, then dissipate) and repeat hits allocate NOTHING:
 * the composer reuses pooled ParticleSystems keyed by intensity + tint.
 *
 * The public shape is unchanged (VfxSystem constructs one per hit and drives
 * update()/dispose()), so every call site — basic-attack hitImpact, 破防
 * guardBreak, and the doc-less fallbacks — upgrades without touching
 * VfxSystem. The legacy (big, color) call shape maps onto an intensity:
 *   big=false                     → "light"  basic attacks, doc-less pops
 *   big=true                      → "heavy"  crit / killingBlow (+ ring)
 *   big=true + guard-break tint   → "ex"     破防 shatter: max layers + ring
 * Color identity is preserved: `color` is the dmgType tint and the layered
 * ramp runs white-hot → THAT tint → cooled/darkened tint → gone, so an icy
 * cool-white guard break stays icy and an arcane hit stays arcane.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { particleBudgetScale } from "../render/RenderConfig";
import { qualityController } from "../render/QualityController";
import {
  ImpactComposer,
  IMPACT_TINTS,
  impactRecipe,
  type ImpactIntensity,
  type Rgb,
} from "./vfxPresets";

/** Legacy default tints (the old cube's color identity): warm spark / ember. */
const LIGHT_TINT: Rgb = [1, 0.85, 0.35];
const HEAVY_TINT: Rgb = [1, 0.3, 0.15];

/** Channel tolerance when matching a tint against a known constant. */
const TINT_EPS = 1e-3;

function tintEquals(a: Rgb, b: Rgb): boolean {
  return (
    Math.abs(a[0] - b[0]) < TINT_EPS &&
    Math.abs(a[1] - b[1]) < TINT_EPS &&
    Math.abs(a[2] - b[2]) < TINT_EPS
  );
}

/**
 * Map the legacy (big, color) call shape onto an impact intensity: plain hits
 * are light, big hits (crit/killingBlow) heavy, and the guard-break cool-white
 * tint (IMPACT_TINTS.guardBreak — only 破防 fires it) is THE fight-defining
 * shatter → ex, the heaviest treatment. New callers may skip the mapping and
 * pass an ImpactIntensity directly in place of `big`.
 */
export function sparkIntensity(
  big: boolean | ImpactIntensity,
  color?: Rgb,
): ImpactIntensity {
  if (typeof big === "string") return big;
  if (!big) return "light";
  return color !== undefined && tintEquals(color, IMPACT_TINTS.guardBreak) ? "ex" : "heavy";
}

interface SceneImpactKit {
  composer: ImpactComposer;
  /** last nowMs the composer was pumped (N live sparks → 1 tick per frame) */
  lastPumpMs: number;
}

/** One shared composer per scene; disposed with the scene itself. */
const kits = new WeakMap<Scene, SceneImpactKit>();

function kitFor(scene: Scene): SceneImpactKit {
  let kit = kits.get(scene);
  if (!kit) {
    const composer = new ImpactComposer(scene);
    kit = { composer, lastPumpMs: -Infinity };
    kits.set(scene, kit);
    scene.onDisposeObservable.addOnce(() => {
      composer.dispose();
      kits.delete(scene);
    });
  }
  return kit;
}

/**
 * The scene-shared pooled composer every HitSpark fires through
 * (observability/test seam — e.g. assert activeRingCount after a heavy hit).
 */
export function impactComposerFor(scene: Scene): ImpactComposer {
  return kitFor(scene).composer;
}

export class HitSpark {
  private readonly kit: SceneImpactKit;
  private readonly bornMs: number;
  /** ms until the longest layer (smoke body / shockwave ring) has finished */
  private readonly doneAfterMs: number;
  /** the pooled layer systems this hit fired (flash, sparks, smoke) — seam */
  readonly systems: readonly ParticleSystem[];
  readonly intensity: ImpactIntensity;
  done = false;

  constructor(
    scene: Scene,
    x: number,
    z: number,
    nowMs: number,
    /** legacy big flag (crit/killingBlow/guardBreak) or an explicit intensity */
    big: boolean | ImpactIntensity = false,
    /** legacy cube life — layer lifetimes now come from the impact recipe */
    _lifeMs = 220,
    /** dmgType tint; the ramp stays white-hot → THIS color → cooled dark */
    color?: readonly [number, number, number],
    /** impact height (world y) — the CONTACT surface, defaults to torso ~1.0 */
    y = 1.0,
    /** 🔵 GH#617 —— 這一發的傷害量,用來查五級距（owner：越大速度越快）。 */
    amount?: number,
  ) {
    this.bornMs = nowMs;
    this.kit = kitFor(scene);
    this.intensity = sparkIntensity(big, color);
    const tint: Rgb = color ?? (this.intensity === "light" ? LIGHT_TINT : HEAVY_TINT);
    // live particle-density setting (0–1) → quality-tier particle budget
    const scale = particleBudgetScale(qualityController.getParams().particleDensity);
    this.systems = this.kit.composer.fire(this.intensity, x, z, nowMs, { tint, y, scale, amount });
    const recipe = impactRecipe(this.intensity, tint, amount);
    this.doneAfterMs = Math.max(recipe.smoke.lifetimeSec.max * 1000, recipe.ring?.lifeMs ?? 0);
  }

  /**
   * Per-frame tick: pumps the shared composer (ring expansion + idle-pool
   * reaping) at most once per frame across all live sparks, then flips `done`
   * once every layer of THIS hit has finished so VfxSystem can drop the
   * handle. The pooled systems themselves stay alive for the next hit.
   */
  update(nowMs: number): void {
    if (this.done) return;
    if (this.kit.lastPumpMs !== nowMs) {
      this.kit.lastPumpMs = nowMs;
      this.kit.composer.update(nowMs);
    }
    if (nowMs - this.bornMs >= this.doneAfterMs) this.done = true;
  }

  /** Drops the per-hit handle only — pooled systems live on with the scene. */
  dispose(): void {
    this.done = true;
  }
}
