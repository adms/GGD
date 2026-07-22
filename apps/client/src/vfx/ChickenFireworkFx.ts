/**
 * ChickenFireworkFx — the tier-2 (吃雞) match-win firework: a launch comet, a
 * break flash, and a FULL-SCREEN roast chicken made of a few thousand glowing
 * points that holds long enough to read and then droops out like a real shell.
 *
 * WHY THIS IS NOT A ParticleSystem. The task #33 toolkit is the right tool for
 * a burst that goes OUTWARD — its whole vocabulary is count/speed/gravity/drag
 * and it caps a system at HARD_CAPACITY_CAP = 256. A shaped firework is the
 * opposite problem: every particle has a personal DESTINATION, and reading a
 * silhouette at full-screen scale takes ~1600 of them, six pooled systems'
 * worth. Babylon's per-particle update also has no seam for "fly to your own
 * target", so it would mean overriding `updateFunction`, which owns recycling
 * and gradient stepping as well — reimplementing all of it to get one feature.
 *
 * So the formation is ONE mesh: 4 verts per point, one draw call, and a vertex
 * shader that places every point analytically from a handful of uniforms. The
 * CPU does nothing per frame except write ~8 floats. That matters here more
 * than anywhere else in the game — this plays at the exact moment a dropped
 * frame is most noticeable, over a scene that is still fully loaded.
 *
 * WHAT IT SHARES WITH THE TOOLKIT. The launch comet, the break flash and the
 * glitter that falls out of the formation are ordinary `vfxPresets` bursts on
 * a `BurstPool`, authored with `hotToCoolStops`/`popShrinkStops` like every
 * other effect in the repo. The point cloud is the only bespoke part.
 *
 * FRAMING. The mesh is welded to the camera: positioned `DISTANCE` in front of
 * it, rotated to face it, and scaled by `fitScale` so the bird covers ~86% of
 * the shorter frame axis. "Full-screen" therefore means full-screen on an
 * ultrawide and on a phone, and the match camera can be anywhere.
 *
 * All timing/easing lives in the pure `fireworkMath`; the silhouette lives in
 * the pure `chickenSilhouette`. This file owns Babylon lifetime only.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import {
  CHICKEN_BOUNDS,
  CHICKEN_DEFAULTS,
  sampleChickenSilhouette,
  type SilhouettePoint,
} from "./chickenSilhouette";
import {
  CHICKEN_TOTAL_MS,
  chickenBurstState,
  fitScale,
  type ChickenBurstState,
  type FireworkPhase,
} from "./fireworkMath";
import { BurstPool, hotToCoolStops, popShrinkStops, type BurstSpec, type PresetSystemOptions } from "./vfxPresets";

const SHADER_NAME = "ggdChickenFirework";

/** Metres in front of the camera the formation is drawn. Far enough that no
 *  arena geometry can poke through it, near enough to stay inside the far
 *  plane of every camera rig in the game. */
export const CHICKEN_DISTANCE = 26;

/** Fraction of the shorter frame axis the bird covers. */
export const CHICKEN_COVERAGE = 0.80;

/**
 * Base point half-extent in shape units, before the per-point `size`
 * multiplier. Tuned against `fillSpacing` (0.034): at 0.030 the sprites
 * overlapped 2x, additive blending saturated the whole breast to flat white
 * and the bird lost its granularity — a firework has to look like thousands
 * of embers, not like a painted decal. ~1.4x coverage is the window where the
 * mass still reads solid but individual points are still visible.
 */
const POINT_SIZE = 0.020;

/**
 * How far above frame centre the formation is placed, as a fraction of the
 * half-height. The shell sags by up to DROOP_MAX over the fade; centred, the
 * dish slides off the bottom of the frame while the bird is still visible,
 * which reads as the effect falling out of the shot rather than burning out.
 */
export const CHICKEN_RISE = 0.10;

const SHAPE_W = CHICKEN_BOUNDS.maxX - CHICKEN_BOUNDS.minX;
const SHAPE_H = CHICKEN_BOUNDS.maxY - CHICKEN_BOUNDS.minY;
/** Shape-space centre, so the bird is centred in frame and not on its origin. */
const SHAPE_CX = (CHICKEN_BOUNDS.maxX + CHICKEN_BOUNDS.minX) / 2;
const SHAPE_CY = (CHICKEN_BOUNDS.maxY + CHICKEN_BOUNDS.minY) / 2;

let shaderRegistered = false;

/**
 * The formation shader.
 *
 * `position` carries the point's TARGET (shape space, z=0) — not a vertex
 * position — and `corner` expands it into a camera-facing quad. Because the
 * mesh is already rotated to face the camera, a corner offset in local xy IS a
 * billboard, with no per-vertex view-matrix work.
 *
 * The three uniforms that make it behave like a firework rather than a fade-in
 * are uExpand (the outward rush), uDroop (gravity sag, weighted per point so
 * the cloud sags unevenly) and uCool (colour dying to ember). uAlpha is
 * staggered per point so the formation goes out in a scatter — a cloud that
 * dims uniformly reads as a dissolve, not as burning out.
 */
function registerShader(): void {
  if (shaderRegistered) return;
  shaderRegistered = true;
  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = /* glsl */ `
precision highp float;
attribute vec3 position;   // target offset in shape space (z unused)
attribute vec2 corner;     // -1..1 quad corner
attribute vec4 pdata;      // x=size mul, y=seed, z=fadeBias, w=rim flag
attribute vec4 color;      // emissive rgb + unused a

uniform mat4 worldViewProjection;
uniform float uExpand;
uniform float uDrift;
uniform float uDroop;
uniform float uAlpha;
uniform float uCool;
uniform float uFlash;
uniform float uTime;
uniform float uSize;

varying vec4 vColor;
varying vec2 vCorner;

const vec3 EMBER = vec3(1.0, 0.26, 0.06);

void main(void) {
  float seed = pdata.y;
  vec2 tgt = position.xy;

  // outward drift as the shell dies: points keep travelling along their own
  // radius, which is what makes a dying firework spread instead of just fade
  vec2 dir = length(tgt) > 0.0001 ? normalize(tgt) : vec2(0.0, 1.0);
  vec2 p = tgt * uExpand + dir * (uDrift - 1.0) * (0.25 + 0.9 * seed);

  // gravity sag, weighted per point so the cloud droops unevenly
  p.y -= uDroop * (0.55 + 0.9 * seed);

  // twinkle: every point breathes at its own rate
  float tw = 0.74 + 0.26 * sin(seed * 41.0 + uTime * (7.0 + seed * 15.0));

  // staggered burn-out: bone and dish (fadeBias > 0) are the last to go
  float thr = seed * 0.34 - pdata.z * 0.30;
  float a = clamp((uAlpha - thr) / max(1.0 - thr, 0.05), 0.0, 1.0);

  float sz = uSize * pdata.x * (0.86 + 0.30 * tw) * (1.0 + 1.4 * uFlash);
  gl_Position = worldViewProjection * vec4(p + corner * sz, 0.0, 1.0);

  vec3 c = mix(color.rgb, EMBER * (0.35 + 0.75 * max(color.r, color.g)), uCool);
  c += vec3(1.0, 0.96, 0.9) * uFlash * 2.2;
  vColor = vec4(c, a * tw);
  vCorner = corner;
}
`;
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = /* glsl */ `
precision highp float;
varying vec4 vColor;
varying vec2 vCorner;

void main(void) {
  float d = dot(vCorner, vCorner);
  if (d > 1.0) discard;
  // same soft radial falloff as an additive particle sprite, no texture fetch
  float a = pow(1.0 - d, 1.6) * vColor.a;
  if (a <= 0.002) discard;
  gl_FragColor = vec4(vColor.rgb, a);
}
`;
}

/** Points whose part should outlive the meat when the shell burns out. */
function fadeBiasFor(p: SilhouettePoint): number {
  return p.part === "knuckle" || p.part === "plate" ? 1 : 0;
}

/** Build the one-draw-call formation mesh from a sampled point cloud. */
function buildFormationMesh(pts: readonly SilhouettePoint[], scene: Scene): Mesh {
  const n = pts.length;
  const positions = new Float32Array(n * 4 * 3);
  const corners = new Float32Array(n * 4 * 2);
  const pdata = new Float32Array(n * 4 * 4);
  const colors = new Float32Array(n * 4 * 4);
  const indices = new Uint32Array(n * 6);
  const CORNER = [-1, -1, 1, -1, 1, 1, -1, 1];

  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const bias = fadeBiasFor(p);
    for (let v = 0; v < 4; v++) {
      const j = i * 4 + v;
      positions[j * 3] = p.x - SHAPE_CX;
      positions[j * 3 + 1] = p.y - SHAPE_CY;
      positions[j * 3 + 2] = 0;
      corners[j * 2] = CORNER[v * 2]!;
      corners[j * 2 + 1] = CORNER[v * 2 + 1]!;
      pdata[j * 4] = p.size;
      pdata[j * 4 + 1] = p.seed;
      pdata[j * 4 + 2] = bias;
      pdata[j * 4 + 3] = p.rim ? 1 : 0;
      colors[j * 4] = p.r;
      colors[j * 4 + 1] = p.g;
      colors[j * 4 + 2] = p.b;
      colors[j * 4 + 3] = 1;
    }
    const b = i * 4;
    const k = i * 6;
    indices[k] = b;
    indices[k + 1] = b + 1;
    indices[k + 2] = b + 2;
    indices[k + 3] = b;
    indices[k + 4] = b + 2;
    indices[k + 5] = b + 3;
  }

  const mesh = new Mesh("vfx-chicken-firework", scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.applyToMesh(mesh, false);
  mesh.setVerticesData("corner", corners, false, 2);
  mesh.setVerticesData("pdata", pdata, false, 4);
  mesh.setVerticesData("color", colors, false, 4);
  mesh.isPickable = false;
  // the formation is drawn in front of everything and never occludes anything
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.renderingGroupId = 1;
  mesh.setEnabled(false);
  return mesh;
}

// ---------------------------------------------------------------------------
// supporting bursts (pooled preset layers)
// ---------------------------------------------------------------------------

/**
 * Every pooled spec carries a `texture`: `makeBurstSystem` only binds one when
 * the spec names it, and a ParticleSystem with no texture renders nothing at
 * all (the fragment shader samples a texture that was never bound). An early
 * cut of this file shipped these textureless and the whole launch + break +
 * glitter layer was silently invisible — caught by a frame-stepped screenshot,
 * never by a test, which is exactly why the audition page exists.
 */
const FLARE = "assets/textures/particles/flare_01.png";
const SPARK = "assets/textures/particles/spark_05_rotated.png";
const STAR = "assets/textures/particles/star_08.png";

/** The rising shell: a stretched golden comet with a short sparking tail. */
export function launchCometSpec(): BurstSpec {
  return {
    count: 26,
    lifetimeSec: { min: 0.12, max: 0.34 },
    speed: { min: 0.4, max: 2.6 },
    sizeStops: popShrinkStops(0.55, { popT: 0.1 }),
    colorStops: hotToCoolStops([1, 0.78, 0.32]),
    blend: "additive",
    gravityY: -3.5,
    drag: 0.5,
    stretched: true,
    tailLength: 2.6,
    emitterRadius: 0.12,
    texture: SPARK,
  };
}

/** The break: one enormous white-hot flash that hides the formation snapping in. */
export function breakFlashSpec(): BurstSpec {
  return {
    count: 5,
    lifetimeSec: { min: 0.06, max: 0.16 },
    speed: { min: 0, max: 1.2 },
    sizeStops: popShrinkStops(9, { popT: 0.18, endFrac: 0.25 }),
    colorStops: hotToCoolStops([1, 0.92, 0.68], { hotT: 0.35 }),
    blend: "additive",
    emitterRadius: 0.5,
    texture: FLARE,
  };
}

/** Glitter shed by the formation while it droops — embers falling off a roast. */
export function glitterSpec(): BurstSpec {
  return {
    count: 40,
    lifetimeSec: { min: 0.5, max: 1.5 },
    speed: { min: 0.6, max: 4.5 },
    sizeStops: popShrinkStops(0.42),
    colorStops: hotToCoolStops([1, 0.6, 0.16]),
    blend: "additive",
    gravityY: -5.5,
    drag: 0.55,
    stretched: true,
    tailLength: 1.6,
    emitterRadius: 6,
    texture: STAR,
  };
}

export interface ChickenFireworkOptions extends PresetSystemOptions {
  /**
   * Quality-tier point budget multiplier (RenderConfig). Scales the SAMPLING
   * pitch, never a truncation: a decimated bird is still a whole bird, just a
   * sparser one. Below ~0.45 the silhouette stops reading, so it clamps.
   */
  scale?: number;
  /** Override the camera the formation frames itself against. */
  cameraFor?: () => Camera | null;
}

/**
 * One-shot roast-chicken firework. `play(nowMs)` fires it, `update(nowMs)`
 * must be called every frame, `dispose()` on scene teardown. Idempotent:
 * playing while one is already in flight restarts it.
 */
export class ChickenFireworkFx {
  private readonly pool: BurstPool;
  private mesh: Mesh | null = null;
  private mat: ShaderMaterial | null = null;
  private startedMs = -Infinity;
  private playing = false;
  private lastPhase: FireworkPhase = "idle";
  private cometAtMs = -Infinity;
  private glitterAtMs = -Infinity;
  private readonly quat = new Quaternion();
  private readonly pos = new Vector3();
  /** point count actually built (test/observability seam) */
  pointCount = 0;

  constructor(
    private readonly scene: Scene,
    private readonly opts: ChickenFireworkOptions = {},
  ) {
    this.pool = new BurstPool(scene, opts);
  }

  /** True while the shot is in flight. */
  get active(): boolean {
    return this.playing;
  }

  /** Current timeline state (audition page + tests). */
  stateAt(nowMs: number): ChickenBurstState {
    return chickenBurstState(nowMs - this.startedMs);
  }

  /** Fire the shot. Builds the mesh lazily on the first play. */
  play(nowMs: number): void {
    this.ensureBuilt();
    this.startedMs = nowMs;
    this.playing = true;
    this.lastPhase = "idle";
    this.cometAtMs = -Infinity;
    this.glitterAtMs = -Infinity;
    if (this.mesh) this.mesh.setEnabled(true);
  }

  /** Stop immediately and hide (round ended, scene torn down, skip pressed). */
  stop(): void {
    this.playing = false;
    if (this.mesh) this.mesh.setEnabled(false);
  }

  private camera(): Camera | null {
    return this.opts.cameraFor?.() ?? this.scene.activeCamera ?? null;
  }

  private ensureBuilt(): void {
    if (this.mesh) return;
    registerShader();
    // scale the SAMPLING PITCH, not the point list: a coarser bird is still a
    // whole bird. Clamped because below ~0.45 the silhouette stops reading and
    // a firework nobody recognises is worse than a few dropped frames.
    const q = Math.min(1, Math.max(0.45, this.opts.scale ?? 1));
    const pts = sampleChickenSilhouette({
      fillSpacing: CHICKEN_DEFAULTS.fillSpacing / q,
      rimSpacing: CHICKEN_DEFAULTS.rimSpacing / Math.sqrt(q),
      rimBand: CHICKEN_DEFAULTS.rimBand,
    });
    this.pointCount = pts.length;
    this.mesh = buildFormationMesh(pts, this.scene);
    this.mat = new ShaderMaterial(
      "vfx-chicken-mat",
      this.scene,
      { vertex: SHADER_NAME, fragment: SHADER_NAME },
      {
        attributes: ["position", "corner", "pdata", "color"],
        uniforms: [
          "worldViewProjection",
          "uExpand",
          "uDrift",
          "uDroop",
          "uAlpha",
          "uCool",
          "uFlash",
          "uTime",
          "uSize",
        ],
        needAlphaBlending: true,
      },
    );
    this.mat.alphaMode = Constants.ALPHA_ADD;
    this.mat.backFaceCulling = false;
    // additive glow must not write depth or it punches a hole in the scene
    this.mat.disableDepthWrite = true;
    this.mesh.material = this.mat;
  }

  /** Advance one frame. Cheap when idle: an early return and nothing else. */
  update(nowMs: number): void {
    this.pool.update(nowMs);
    if (!this.playing) return;

    const t = nowMs - this.startedMs;
    const s = chickenBurstState(t);
    if (s.phase === "done" || t > CHICKEN_TOTAL_MS) {
      this.stop();
      return;
    }
    const cam = this.camera();
    if (!cam) return;

    // --- frame the formation against the live camera ------------------------
    const engine = this.scene.getEngine();
    const aspect = engine.getAspectRatio(cam);
    const fovY = (cam as unknown as { fov?: number }).fov ?? 0.8;
    const world = fitScale(SHAPE_W, SHAPE_H, fovY, aspect, CHICKEN_DISTANCE, CHICKEN_COVERAGE);

    const m = cam.getWorldMatrix();
    const fwd = Vector3.TransformNormalFromFloatsToRef(0, 0, 1, m, TMP_FWD).normalize();
    const up = Vector3.TransformNormalFromFloatsToRef(0, 1, 0, m, TMP_UP);
    const rise = Math.tan(fovY / 2) * CHICKEN_DISTANCE * CHICKEN_RISE;
    this.pos.copyFrom(cam.globalPosition);
    this.pos.x += fwd.x * CHICKEN_DISTANCE + up.x * rise;
    this.pos.y += fwd.y * CHICKEN_DISTANCE + up.y * rise;
    this.pos.z += fwd.z * CHICKEN_DISTANCE + up.z * rise;

    if (this.mesh && this.mat) {
      if (!this.mesh.rotationQuaternion) this.mesh.rotationQuaternion = this.quat;
      this.mesh.rotationQuaternion.copyFrom(cam.absoluteRotation);
      this.mesh.position.copyFrom(this.pos);
      this.mesh.scaling.setAll(world);
      const on = s.expand > 0 && s.alpha > 0.002;
      this.mesh.setEnabled(on);
      if (on) {
        this.mat.setFloat("uExpand", s.expand);
        this.mat.setFloat("uDrift", s.drift);
        this.mat.setFloat("uDroop", s.droop);
        this.mat.setFloat("uAlpha", s.alpha);
        this.mat.setFloat("uCool", s.cool);
        this.mat.setFloat("uFlash", s.flash);
        this.mat.setFloat("uTime", t / 1000);
        this.mat.setFloat("uSize", POINT_SIZE);
      }
    }

    // --- pooled supporting layers, placed in the same camera-relative frame --
    // The break flash is EDGE-triggered on the phase change, not level-tested
    // on `flash > threshold`: at 60 fps the first frame after the break is
    // already ~16 ms in and a threshold test can miss the peak entirely,
    // silently dropping the single loudest beat of the whole celebration.
    const half = Math.tan(fovY / 2) * CHICKEN_DISTANCE;
    if (s.phase === "launch") {
      // the comet rises from below the frame; re-emitted on a throttle so it
      // draws a continuous trail without thrashing the pool's LRU every frame
      if (nowMs - this.cometAtMs >= 45) {
        this.cometAtMs = nowMs;
        this.fireAtLocal("chk/comet", launchCometSpec(), cam, fwd, nowMs, 0, -half * 1.25 * (1 - s.cometT));
      }
    } else if (this.lastPhase === "launch" && s.phase === "expand") {
      this.fireAtLocal("chk/flash", breakFlashSpec(), cam, fwd, nowMs, 0, 0);
      this.glitterAtMs = nowMs;
    } else if (s.phase === "droop" && nowMs - this.glitterAtMs > 620) {
      this.glitterAtMs = nowMs;
      this.fireAtLocal("chk/glitter", glitterSpec(), cam, fwd, nowMs, 0, 0);
    }
    this.lastPhase = s.phase;
  }

  /** Fire a pooled preset burst at a camera-relative (x, y) offset. */
  private fireAtLocal(
    key: string,
    spec: BurstSpec,
    cam: Camera,
    fwd: Vector3,
    nowMs: number,
    x: number,
    y: number,
  ): void {
    const m = cam.getWorldMatrix();
    const right = Vector3.TransformNormalFromFloatsToRef(1, 0, 0, m, TMP_RIGHT);
    const up = Vector3.TransformNormalFromFloatsToRef(0, 1, 0, m, TMP_UP);
    const p = TMP_POS.copyFrom(cam.globalPosition);
    p.x += fwd.x * CHICKEN_DISTANCE + right.x * x + up.x * y;
    p.y += fwd.y * CHICKEN_DISTANCE + right.y * x + up.y * y;
    p.z += fwd.z * CHICKEN_DISTANCE + right.z * x + up.z * y;
    this.pool.fireAt(key, spec, p.x, p.z, p.y, nowMs, this.opts.scale ?? 1);
  }

  dispose(): void {
    this.stop();
    this.pool.dispose();
    this.mesh?.dispose(false, true);
    this.mesh = null;
    this.mat = null;
  }
}

const TMP_FWD = new Vector3();
const TMP_RIGHT = new Vector3();
const TMP_UP = new Vector3();
const TMP_POS = new Vector3();
