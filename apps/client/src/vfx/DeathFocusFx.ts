/**
 * DeathFocusFx — the imperative Babylon shell for the death-spectator focus
 * desaturation (task #85). ONE full-screen post-process per DEAD local
 * viewport: the whole frame drains to a cool grey except soft world-anchored
 * colour pools on that player's living teammates and live revive circle.
 *
 * All of the arming/disarming/ramp logic and the projection math are the pure
 * `render/deathFocus` module — this file only owns Babylon lifetime:
 *
 *   • ATTACH ON DEMAND. Exactly like CombatPostFx: the pass is attached only
 *     while the gate's strength is above zero and detaches the instant the
 *     linear fade-out reaches EXACTLY 0, so a live player pays nothing. The
 *     ramp is linear precisely so "off" is a hard zero and can never leave a
 *     nearly-transparent pass bolted to the camera.
 *   • ONE INSTANCE PER VIEWPORT. Couch play renders up to 4 cameras through
 *     `scene.activeCameras`, each with its own Viewport rect; a single shared
 *     PostProcess would resize its render target every camera every frame.
 *     `adaptScaleToCurrentViewport` sizes each pass's target to its own
 *     viewport rect, so a split-screen quadrant costs a quadrant, not a
 *     screen. The target also re-derives from the engine render size, so task
 *     #43's live resolution rescaling is followed automatically — and the
 *     pools themselves are pure UV math, welded to the world at any scale.
 *   • FAIL SAFE. `update(dt, null)` (no match state), a vanished camera, and
 *     `dispose()` all drive every viewport back to 0 and detach.
 *
 * Cost while active: one texture fetch + four smoothsteps per pixel, plus one
 * 4x4 matrix multiply and <=4 point transforms per dead viewport per frame. No
 * extra geometry pass, no render list, and nothing for the parallel work on
 * ability VFX (#79), the revive ring (#84) or the ground (#80) to register.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { Effect } from "@babylonjs/core/Materials/effect";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import {
  DeathFocusGate,
  FOCUS_IDLE_EPS,
  FOCUS_MAX_SOURCES,
  buildFocusSources,
  makeFocusSourcePool,
  projectFocusSource,
  type FocusEntity,
  type FocusSource,
} from "../render/deathFocus";

const SHADER_NAME = "ggdDeathFocus";
const UNIFORMS = ["uStrength", "uAspect", "uSrc0", "uSrc1", "uSrc2", "uSrc3", "uWeights"];

let shaderRegistered = false;

/**
 * Desaturation look. RESIDUAL_SAT keeps a whisper of hue so the grey reads as
 * drained rather than as a broken renderer; TINT darkens and cools it, which
 * separates "you are dead" from a plain black-and-white filter.
 *
 * Exported and interpolated INTO the shader (rather than duplicated as GLSL
 * literals) so anything that has to survive this wash — the cast-telegraph
 * pillar has to stay readable while you spectate — can be checked against the
 * real numbers instead of a copy that can silently drift.
 */
export const DEATH_FOCUS_RESIDUAL_SAT = 0.12;
export const DEATH_FOCUS_LUMA: readonly [number, number, number] = [0.2126, 0.7152, 0.0722];
export const DEATH_FOCUS_TINT: readonly [number, number, number] = [0.72, 0.76, 0.86];

/**
 * The desaturation the shader applies to one colour, at `strength` 0..1 and
 * outside every colour pool. Pure — same formula as `main()` below.
 */
export function deathFocusGrey(
  rgb: readonly [number, number, number],
  strength = 1,
): [number, number, number] {
  const [lr, lg, lb] = DEATH_FOCUS_LUMA;
  const luma = rgb[0] * lr + rgb[1] * lg + rgb[2] * lb;
  const s0 = Math.max(0, Math.min(1, strength));
  const s = s0 * s0 * (3 - 2 * s0); // smoothstep ease, exactly as in the shader
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const c = rgb[i] as number;
    const grey = (luma + (c - luma) * DEATH_FOCUS_RESIDUAL_SAT) * (DEATH_FOCUS_TINT[i] as number);
    out[i] = c + (grey - c) * s;
  }
  return out;
}

/**
 * The pools are combined with max(), never a sum, so two adjacent teammates
 * merge into one bubble instead of blowing out to a hard-edged blob.
 */
function registerShader(): void {
  if (shaderRegistered) return;
  shaderRegistered = true;
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = /* glsl */ `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float uStrength;
uniform float uAspect;
uniform vec4 uSrc0;
uniform vec4 uSrc1;
uniform vec4 uSrc2;
uniform vec4 uSrc3;
uniform vec4 uWeights;

const float RESIDUAL_SAT = ${DEATH_FOCUS_RESIDUAL_SAT.toFixed(4)};
const vec3 LUMA = vec3(${DEATH_FOCUS_LUMA.map((v) => v.toFixed(4)).join(", ")});
const vec3 TINT = vec3(${DEATH_FOCUS_TINT.map((v) => v.toFixed(4)).join(", ")});

float pool(vec4 s, float w, vec2 uv) {
  if (w <= 0.0) return 0.0;
  vec2 d = (uv - s.xy) * vec2(uAspect, 1.0);
  return w * (1.0 - smoothstep(s.z, s.w, length(d)));
}

void main(void) {
  vec3 col = texture2D(textureSampler, vUV).rgb;
  float m = pool(uSrc0, uWeights.x, vUV);
  m = max(m, pool(uSrc1, uWeights.y, vUV));
  m = max(m, pool(uSrc2, uWeights.z, vUV));
  m = max(m, pool(uSrc3, uWeights.w, vUV));
  vec3 grey = mix(vec3(dot(col, LUMA)), col, RESIDUAL_SAT) * TINT;
  float s = clamp(uStrength, 0.0, 1.0);
  s = s * s * (3.0 - 2.0 * s); // ease the linear ramp
  gl_FragColor = vec4(mix(col, grey, s * (1.0 - m)), 1.0);
}
`;
}

export interface DeathFocusDeps {
  /** Camera of local player `player`; null before its viewport exists. */
  cameraFor(player: number): Camera | null;
  /** Rendered (interpolated) position of an entity; null = use the snapshot. */
  posOf(id: number): { x: number; z: number } | null;
}

/** One frame of authoritative state, built by the caller from reused pools. */
export interface DeathFocusFrame {
  phase: string;
  outcomeDecided: boolean;
  /** champion entity id of each local player (index = player); -1 = none */
  localEntities: readonly number[];
  /**
   * Whether each local player's OWN duel is already decided (index = player),
   * task #208. When true the desaturation lifts so the still-fighting zone the
   * spectator camera jumped to reads in colour. Absent/short array = false
   * (treated as "own duel still live", preserving the #85 behaviour).
   */
  ownDuelDecided?: readonly boolean[];
  /** every entity in this frame's snapshot */
  entities: readonly FocusEntity[];
}

interface FocusSlot {
  readonly gate: DeathFocusGate;
  readonly sources: FocusSource[];
  /** 4 x vec4: (u, v, rFull, rFade) per pool, in viewport-normalized UV */
  readonly uv: Float32Array;
  readonly weights: Float32Array;
  pp: PostProcess | null;
  /** the camera `pp` was built against (rebuilt if the rig is replaced) */
  camera: Camera | null;
  attached: boolean;
  strength: number;
  aspect: number;
  /** sources filled on the last frame that had authoritative state */
  sourceCount: number;
}

export class DeathFocusFx {
  private readonly slots: FocusSlot[] = [];
  /** entity ids named by this frame's `death` events (resolved in update) */
  private readonly deaths: number[] = [];
  private readonly viewProj = new Matrix();
  private disposed = false;
  /** stable, bound resolver — the hot path must not allocate a closure. */
  private readonly posOf = (id: number): { x: number; z: number } | null =>
    this.deps.posOf(id);

  constructor(
    private readonly scene: Scene,
    private readonly deps: DeathFocusDeps,
    playerCount: number,
  ) {
    for (let p = 0; p < Math.max(1, playerCount); p++) {
      this.slots.push({
        gate: new DeathFocusGate(),
        sources: makeFocusSourcePool(),
        uv: new Float32Array(FOCUS_MAX_SOURCES * 4),
        weights: new Float32Array(FOCUS_MAX_SOURCES),
        pp: null,
        camera: null,
        attached: false,
        strength: 0,
        aspect: 1,
        sourceCount: 0,
      });
    }
  }

  /**
   * A sim `death` event fired for `entityId`. The entity is NOT resolved to a
   * local player here: the event drain runs before this frame's local-entity
   * table is rebuilt, so the id is queued and matched inside `update`, where
   * the table (and the phase) are current. Anything unmatched is dropped.
   */
  noteDeath(entityId: number): void {
    if (this.disposed || !Number.isFinite(entityId) || entityId < 0) return;
    if (this.deaths.length >= 32) return; // bound a pathological event burst
    this.deaths.push(entityId);
  }

  /** True while player `player`'s pass is attached (introspection / tests). */
  isAttached(player: number): boolean {
    return this.slots[player]?.attached ?? false;
  }

  /** Greyscale strength 0..1 of player `player` (introspection / tests). */
  strengthOf(player: number): number {
    return this.slots[player]?.strength ?? 0;
  }

  /**
   * Per-frame. `frame` is null when there is no match state — every viewport
   * then ramps out and detaches.
   */
  update(dtMs: number, frame: DeathFocusFrame | null): void {
    if (this.disposed) return;
    for (let p = 0; p < this.slots.length; p++) {
      const slot = this.slots[p]!;
      const entityId = frame?.localEntities[p] ?? -1;
      const self = frame && entityId >= 0 ? findEntity(frame.entities, entityId) : null;

      // arm from this frame's death events, now that the entity table is fresh
      if (frame && entityId >= 0 && this.deaths.includes(entityId)) {
        slot.gate.noteDeath(entityId, frame.phase);
      }

      slot.strength = slot.gate.update({
        phase: frame?.phase ?? "",
        outcomeDecided: frame?.outcomeDecided ?? true,
        ownDuelDecided: frame?.ownDuelDecided?.[p] ?? false,
        entityId,
        present: self !== null,
        alive: self?.alive ?? true,
        dtMs,
      });

      if (slot.strength <= FOCUS_IDLE_EPS) {
        this.detach(slot);
        continue;
      }
      const camera = this.deps.cameraFor(p);
      if (!camera) {
        this.detach(slot);
        continue;
      }
      // While the entity is gone (despawn / state drop) the gate is already
      // disarming; keep re-projecting the LAST sources so the pass fades out
      // with the pools still welded to the world instead of popping.
      if (frame && self) {
        slot.sourceCount = buildFocusSources(
          self.id,
          self.seatId,
          self.teamId,
          frame.entities,
          this.posOf,
          slot.sources,
        );
      }
      this.project(slot, camera, slot.sourceCount);
      this.attach(slot, camera);
    }
    this.deaths.length = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.deaths.length = 0;
    for (const slot of this.slots) {
      slot.gate.reset();
      slot.strength = 0;
      slot.sourceCount = 0;
      this.detach(slot);
      slot.pp?.dispose();
      slot.pp = null;
      slot.camera = null;
    }
  }

  // ------------------------------------------------------------- internals --

  /** World sources → viewport-normalized UV centres + radii for the shader. */
  private project(slot: FocusSlot, camera: Camera, count: number): void {
    const view = camera.getViewMatrix();
    const proj = camera.getProjectionMatrix();
    view.multiplyToRef(proj, this.viewProj);
    const m = this.viewProj.m;
    const fy = proj.m[5]!;

    // aspect of THIS camera's viewport rect (split-screen quadrants differ);
    // read off the screen size so the post-process's own target can't skew it
    const engine = this.scene.getEngine();
    const vp = camera.viewport;
    const w = engine.getRenderWidth(true) * (vp.width || 1);
    const h = engine.getRenderHeight(true) * (vp.height || 1);
    slot.aspect = h > 0 ? w / h : 1;

    for (let i = 0; i < FOCUS_MAX_SOURCES; i++) {
      const src = i < count ? slot.sources[i]! : null;
      slot.weights[i] =
        src && src.weight > 0 ? projectFocusSource(src, m, fy, slot.uv, i * 4) : 0;
      if (!src || src.weight <= 0) {
        slot.uv[i * 4 + 2] = 0;
        slot.uv[i * 4 + 3] = 1;
      }
    }
  }

  private ensurePp(slot: FocusSlot, camera: Camera): PostProcess | null {
    if (slot.pp && slot.camera === camera) return slot.pp;
    if (slot.pp) {
      this.detach(slot);
      slot.pp.dispose();
      slot.pp = null;
    }
    registerShader();
    const pp = new PostProcess(SHADER_NAME, SHADER_NAME, UNIFORMS, null, 1.0, camera);
    // split-screen: size the pass to its own viewport rect, not the canvas
    pp.adaptScaleToCurrentViewport = true;
    pp.onApply = (effect): void => {
      const uv = slot.uv;
      const wt = slot.weights;
      effect.setFloat("uStrength", slot.strength);
      effect.setFloat("uAspect", slot.aspect);
      effect.setFloat4("uSrc0", uv[0]!, uv[1]!, uv[2]!, uv[3]!);
      effect.setFloat4("uSrc1", uv[4]!, uv[5]!, uv[6]!, uv[7]!);
      effect.setFloat4("uSrc2", uv[8]!, uv[9]!, uv[10]!, uv[11]!);
      effect.setFloat4("uSrc3", uv[12]!, uv[13]!, uv[14]!, uv[15]!);
      effect.setFloat4("uWeights", wt[0]!, wt[1]!, wt[2]!, wt[3]!);
    };
    slot.pp = pp;
    slot.camera = camera;
    // the constructor attaches; start detached and let update() attach on demand
    slot.attached = true;
    this.detach(slot);
    return slot.pp;
  }

  private attach(slot: FocusSlot, camera: Camera): void {
    const pp = this.ensurePp(slot, camera);
    if (!pp || slot.attached) return;
    camera.attachPostProcess(pp);
    slot.attached = true;
  }

  private detach(slot: FocusSlot): void {
    if (!slot.attached || !slot.pp) {
      slot.attached = false;
      return;
    }
    slot.camera?.detachPostProcess(slot.pp);
    slot.attached = false;
  }
}

/** Linear scan of the frame's entity pool (<= a couple of dozen entries). */
function findEntity(entities: readonly FocusEntity[], id: number): FocusEntity | null {
  for (const e of entities) if (e.id === id) return e;
  return null;
}
