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
  SMALL_VOLLEY_MS,
  framePoint,
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

/** Distance in front of the camera the volley plays at. */
export const SMALL_DISTANCE = 22;

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
      gravityY: -7,
      drag: 0.55,
      stretched: true,
      tailLength: 2.0,
      emitterRadius: 0.25,
      texture: SPARK,
    },
    puff: {
      count: 7,
      lifetimeSec: { min: 0.35, max: 0.55 },
      speed: { min: 1.2, max: 3.4 },
      sizeStops: popShrinkStops(1.5 * scale, { popT: 0.3 }),
      colorStops: softBodyColorStops([tint[0] * 0.7, tint[1] * 0.7, tint[2] * 0.8], 0.22),
      blend: "alpha",
      gravityY: 0.8,
      drag: 0.85,
      emitterRadius: 0.6,
      texture: SMOKE,
    },
  };
}

/** The rising trail before each small shell breaks. */
export function smallCometSpec(tint: Rgb): BurstSpec {
  return {
    count: 8,
    lifetimeSec: { min: 0.08, max: 0.22 },
    speed: { min: 0.3, max: 1.4 },
    sizeStops: popShrinkStops(0.24),
    colorStops: hotToCoolStops(tint),
    blend: "additive",
    gravityY: -2.5,
    drag: 0.6,
    stretched: true,
    tailLength: 2.4,
    emitterRadius: 0.06,
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

    for (let i = 0; i < this.shots.length; i++) {
      const shot = this.shots[i]!;
      const st = smallShotState(shot, tPrev, t);
      if (st.phase === "idle" || st.phase === "done") continue;
      const tint = smallTint(shot.hue);
      const target = framePoint(shot.u, shot.v, fovY, aspect, SMALL_DISTANCE);

      if (st.phase === "launch") {
        // rise from just below the frame to the shell's own break point
        const y0 = -Math.tan(fovY / 2) * SMALL_DISTANCE * 1.1;
        const y = y0 + (target.y - y0) * st.cometT;
        this.fireAt(`sm/comet/${i}`, smallCometSpec(tint), cam, target.x, y, nowMs, fovY);
      }
      if (st.breaks) {
        // ONE burst per shell, edge-triggered: level-testing "is it bursting"
        // would re-fire every frame and the pool would LRU-steal its own
        // still-live systems, turning a peony into a stuttering smear
        const r = smallShellRecipe(tint, shot.scale);
        // the pool key bakes tint+scale — gradients are baked at build time
        const k = `${Math.round(shot.hue * 6)}/${shot.scale.toFixed(2)}`;
        this.fireAt(`sm/flash/${k}`, r.flash, cam, target.x, target.y, nowMs, fovY);
        this.fireAt(`sm/peony/${k}`, r.peony, cam, target.x, target.y, nowMs, fovY);
        this.fireAt(`sm/puff/${k}`, r.puff, cam, target.x, target.y, nowMs, fovY);
      }
    }
    this.lastMs = nowMs;
  }

  private fireAt(
    key: string,
    spec: BurstSpec,
    cam: Camera,
    x: number,
    y: number,
    nowMs: number,
    _fovY: number,
  ): void {
    const m = cam.getWorldMatrix();
    const fwd = Vector3.TransformNormalFromFloatsToRef(0, 0, 1, m, TMP_F).normalize();
    const right = Vector3.TransformNormalFromFloatsToRef(1, 0, 0, m, TMP_R);
    const up = Vector3.TransformNormalFromFloatsToRef(0, 1, 0, m, TMP_U);
    const p = TMP_P.copyFrom(cam.globalPosition);
    p.x += fwd.x * SMALL_DISTANCE + right.x * x + up.x * y;
    p.y += fwd.y * SMALL_DISTANCE + right.y * x + up.y * y;
    p.z += fwd.z * SMALL_DISTANCE + right.z * x + up.z * y;
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
