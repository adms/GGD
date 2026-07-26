/**
 * SmallFireworkFx — the tier-1 (round-win) fireworks: a short volley of small
 * peony bursts popping over the grey screen.
 *
 * THIS IS NOT THE CHICKEN SCALED DOWN, and that is the whole design. The two
 * tiers do different jobs:
 *
 *   • The match-win chicken is a SHAPE. It has to be read, so it launches
 *     once, holds still for over a second and owns the frame. It costs a
 *     bespoke mesh and a custom shader.
 *   • A round win happens three, four, five times a match. Its firework is
 *     PUNCTUATION — a couple of bright pops in the upper corners while the
 *     taunt plays, gone in a second and a half, never in the way of the
 *     scoreboard or the champions still standing on the floor. It reads as
 *     energy, not as an image, so it is pure `vfxPresets`: pooled BurstSpecs
 *     with the standard hot→cool gradients, allocating nothing after the
 *     first round of the match.
 *
 * The failure mode this file is written against is TEDIUM. A celebration that
 * is identical every round stops registering by round three, so `smallVolley`
 * reseeds the scatter and the palette per round, and the whole volley is
 * `SMALL_VOLLEY_MS` (~1.5 s) — short enough that it never delays the shop.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  SMALL_REF_DISTANCE,
  SMALL_SKY_Y,
  SMALL_VOLLEY_MS,
  framePoint,
  skyPlacement,
  smallShotState,
  smallTint,
  smallVolley,
  type SmallShot,
} from "./fireworkMath";
import {
  BurstPool,
  hotToCoolStops,
  popShrinkStops,
  softBodyColorStops,
  type BurstSpec,
  type PresetSystemOptions,
  type Rgb,
} from "./vfxPresets";

/**
 * DEPRECATED as a PLACEMENT (task #235). It is kept, exported and equal to
 * `SMALL_REF_DISTANCE` because it is the distance the tier-1 look was tuned at
 * and the new placement scales against it — but nothing is placed here any
 * more. Putting the volley this far down a 68°-pitched view axis is exactly
 * what buried it under the arena floor; see `fireworkMath.SMALL_SKY_Y`.
 */
export const SMALL_DISTANCE = SMALL_REF_DISTANCE;

// Pooled specs MUST name a texture, or the ParticleSystem renders nothing —
// see ChickenFireworkFx's note. Flare for the glowing cores, spark for streaks,
// smoke for the body puff.
const FLARE = "assets/textures/particles/flare_01.png";
const SPARK = "assets/textures/particles/spark_05_rotated.png";
const SMOKE = "assets/textures/particles/smoke_05.png";

/**
 * One small shell's layers. Three, in the same grammar as `impactRecipe`:
 * a white core flash, the stretched spark peony, and a low-alpha smoke puff
 * that gives the pop some body instead of leaving it a bare spark spray.
 */
export function smallShellRecipe(tint: Rgb, scale: number): { flash: BurstSpec; peony: BurstSpec; puff: BurstSpec } {
  // Gravity and emitter radius are WORLD quantities, so they scale with the
  // shell exactly as speed and size do. Without this a shell placed 4× closer
  // to the eye (to clear the arena floor — task #235) keeps falling at the
  // world rate authored for a shell 22 u away and drops out of frame in a third
  // of its own lifetime.
  const s = Math.max(0.02, scale);
  return {
    flash: {
      count: 2,
      lifetimeSec: { min: 0.04, max: 0.1 },
      speed: { min: 0, max: 0.5 },
      sizeStops: popShrinkStops(2.1 * scale, { popT: 0.2, endFrac: 0.3 }),
      colorStops: hotToCoolStops([1, 1, 1], { hotT: 0.3 }),
      blend: "additive",
      texture: FLARE,
    },
    peony: {
      // the classic sphere-shell spray: even in every direction, drag-braked,
      // then falling — a firework, not an impact spark cone
      count: 54,
      lifetimeSec: { min: 0.3, max: 0.62 },
      speed: { min: 4 * scale, max: 9.5 * scale },
      sizeStops: popShrinkStops(0.3 * scale),
      colorStops: hotToCoolStops(tint),
      blend: "additive",
      gravityY: -7 * s,
      drag: 0.55,
      stretched: true,
      tailLength: 2.0,
      emitterRadius: 0.25 * s,
      texture: SPARK,
    },
    puff: {
      count: 7,
      lifetimeSec: { min: 0.35, max: 0.55 },
      speed: { min: 1.2 * s, max: 3.4 * s },
      sizeStops: popShrinkStops(1.5 * scale, { popT: 0.3 }),
      colorStops: softBodyColorStops([tint[0] * 0.7, tint[1] * 0.7, tint[2] * 0.8], 0.22),
      blend: "alpha",
      gravityY: 0.8 * s,
      drag: 0.85,
      emitterRadius: 0.6 * s,
      texture: SMOKE,
    },
  };
}

/** The rising trail before each small shell breaks. */
export function smallCometSpec(tint: Rgb, scale = 1): BurstSpec {
  const s = Math.max(0.02, scale);
  return {
    count: 8,
    lifetimeSec: { min: 0.08, max: 0.22 },
    speed: { min: 0.3 * s, max: 1.4 * s },
    sizeStops: popShrinkStops(0.24 * s),
    colorStops: hotToCoolStops(tint),
    blend: "additive",
    gravityY: -2.5 * s,
    drag: 0.6,
    stretched: true,
    tailLength: 2.4,
    emitterRadius: 0.06 * s,
    texture: SPARK,
  };
}

export interface SmallFireworkOptions extends PresetSystemOptions {
  scale?: number;
  cameraFor?: () => Camera | null;
}

/**
 * A round-win volley. `play(nowMs, round)` starts one, `update(nowMs)` every
 * frame, `dispose()` on teardown. Re-playing restarts (a fast round sequence
 * never stacks two volleys).
 */
export class SmallFireworkFx {
  private readonly pool: BurstPool;
  private shots: SmallShot[] = [];
  private startedMs = -Infinity;
  private lastMs = -Infinity;
  private playing = false;

  constructor(
    private readonly scene: Scene,
    private readonly opts: SmallFireworkOptions = {},
  ) {
    this.pool = new BurstPool(scene, opts);
  }

  get active(): boolean {
    return this.playing;
  }

  /** Shots of the volley currently in flight (audition page + tests). */
  get volley(): readonly SmallShot[] {
    return this.shots;
  }

  /** Fire a volley. `round` seeds the scatter so no two rounds match. */
  play(nowMs: number, round = 0): void {
    this.shots = smallVolley(round);
    this.startedMs = nowMs;
    this.lastMs = nowMs - 1;
    this.playing = true;
  }

  stop(): void {
    this.playing = false;
  }

  update(nowMs: number): void {
    this.pool.update(nowMs);
    if (!this.playing) return;
    const t = nowMs - this.startedMs;
    if (t > SMALL_VOLLEY_MS) {
      this.playing = false;
      return;
    }
    const cam = this.opts.cameraFor?.() ?? this.scene.activeCamera ?? null;
    if (!cam) return;

    const engine = this.scene.getEngine();
    const aspect = engine.getAspectRatio(cam);
    const fovY = (cam as unknown as { fov?: number }).fov ?? 0.8;
    const tPrev = this.lastMs - this.startedMs;

    // Camera basis, read off the REAL camera (never reconstructed from
    // constants): the sky-plane solve needs `fwd.y` / `up.y` from whatever rig
    // is actually presenting — combat during a round, the settlement hero shot
    // at match end.
    const m = cam.getWorldMatrix();
    const fwd = Vector3.TransformNormalFromFloatsToRef(0, 0, 1, m, TMP_F).normalize();
    const right = Vector3.TransformNormalFromFloatsToRef(1, 0, 0, m, TMP_R);
    const up = Vector3.TransformNormalFromFloatsToRef(0, 1, 0, m, TMP_U);
    const eye = cam.globalPosition;

    for (let i = 0; i < this.shots.length; i++) {
      const shot = this.shots[i]!;
      const st = smallShotState(shot, tPrev, t);
      if (st.phase === "idle" || st.phase === "done") continue;
      const tint = smallTint(shot.hue);
      // THE #235 FIX: solve for the distance at which this shot's view ray
      // crosses the sky plane, instead of walking a fixed 22 u down an axis
      // that points into the ground.
      const place = skyPlacement(shot.v, fovY, eye.y, fwd.y, up.y);
      const target = framePoint(shot.u, shot.v, fovY, aspect, place.distance);
      const shellScale = shot.scale * place.scale;

      if (st.phase === "launch") {
        // rise from just below the frame to the shell's own break point
        const y0 = -Math.tan(fovY / 2) * place.distance * 1.1;
        const y = y0 + (target.y - y0) * st.cometT;
        this.fireAt(
          `sm/comet/${i}`,
          smallCometSpec(tint, place.scale),
          eye,
          fwd,
          right,
          up,
          place.distance,
          target.x,
          y,
          nowMs,
        );
      }
      if (st.breaks) {
        // ONE burst per shell, edge-triggered: level-testing "is it bursting"
        // would re-fire every frame and the pool would LRU-steal its own
        // still-live systems, turning a peony into a stuttering smear
        const r = smallShellRecipe(tint, shellScale);
        // The pool key bakes tint+scale — gradients AND world speeds are baked
        // at build time, and the scale now carries the sky-plane distance, so
        // it is quantised to keep the key set small (a fresh key per frame
        // would make the pool churn instead of pool).
        const k = `${Math.round(shot.hue * 6)}/${shellScale.toFixed(2)}`;
        for (const [name, spec] of [
          ["flash", r.flash],
          ["peony", r.peony],
          ["puff", r.puff],
        ] as const) {
          this.fireAt(
            `sm/${name}/${k}`,
            spec,
            eye,
            fwd,
            right,
            up,
            place.distance,
            target.x,
            target.y,
            nowMs,
          );
        }
      }
    }
    this.lastMs = nowMs;
  }

  private fireAt(
    key: string,
    spec: BurstSpec,
    eye: Vector3,
    fwd: Vector3,
    right: Vector3,
    up: Vector3,
    distance: number,
    x: number,
    y: number,
    nowMs: number,
  ): void {
    const p = TMP_P.copyFrom(eye);
    p.x += fwd.x * distance + right.x * x + up.x * y;
    p.y += fwd.y * distance + right.y * x + up.y * y;
    p.z += fwd.z * distance + right.z * x + up.z * y;
    this.pool.fireAt(key, spec, p.x, p.z, p.y, nowMs, this.opts.scale ?? 1);
  }

  dispose(): void {
    this.stop();
    this.pool.dispose();
  }
}

const TMP_F = new Vector3();
const TMP_R = new Vector3();
const TMP_U = new Vector3();
const TMP_P = new Vector3();
