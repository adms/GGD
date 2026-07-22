/**
 * CombatPostFx — the two screen-space combat post-processes folded into ONE
 * full-screen pass (cheapest): a red SCREEN-EDGE VIGNETTE that flares when the
 * LOCAL player takes damage (intensity by hp lost), and a RIPPLE / heat-
 * distortion that pulses on heavy hits + beams/explosions.
 *
 * Perf contract: the pass is quality-tier GATED (constructed disabled on the
 * mobile/low tier via GameApp) and, when enabled, is ATTACHED to the local
 * camera only while either channel is non-zero — it detaches the instant both
 * decay to 0, so steady-state combat with no recent hit costs nothing and the
 * ~700 fps baseline holds. All intensity/decay math is the pure postFxMath
 * module; this file is the imperative Babylon shell.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { Effect } from "@babylonjs/core/Materials/effect";
import {
  decayIntensity,
  rippleAmpForImpact,
  vignetteIntensityForHpLoss,
  RIPPLE_HALF_LIFE_MS,
  VIGNETTE_HALF_LIFE_MS,
  type RippleInput,
} from "./postFxMath";

const SHADER_NAME = "ggdCombatFx";
let shaderRegistered = false;

function registerShader(): void {
  if (shaderRegistered) return;
  shaderRegistered = true;
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = /* glsl */ `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float rippleAmp;
uniform float rippleTime;
uniform float vignette;
uniform vec3 vignetteColor;
uniform vec2 rippleCenter;
void main(void) {
  vec2 uv = vUV;
  if (rippleAmp > 0.0) {
    vec2 d = uv - rippleCenter;
    float dist = length(d);
    float falloff = max(0.0, 1.0 - dist * 1.6);
    float wave = sin(dist * 55.0 - rippleTime * 11.0);
    uv += (d / max(dist, 1e-4)) * wave * rippleAmp * falloff;
  }
  vec4 col = texture2D(textureSampler, uv);
  if (vignette > 0.0) {
    float r = distance(vUV, vec2(0.5));
    float edge = smoothstep(0.33, 0.75, r);
    col.rgb = mix(col.rgb, vignetteColor, edge * vignette);
  }
  gl_FragColor = col;
}
`;
}

/** Below this both channels are treated as idle and the pass detaches. */
const IDLE_EPS = 1e-3;

export class CombatPostFx {
  private pp: PostProcess | null = null;
  private attached = false;
  private enabled: boolean;
  private disposed = false;

  private vignette = 0;
  private ripple = 0;
  private rippleTimeSec = 0;
  /** deep red edge tint. */
  private readonly color: [number, number, number] = [0.85, 0.06, 0.06];

  constructor(
    private readonly scene: Scene,
    private readonly cameraFor: () => Camera | null,
    enabled = true,
  ) {
    this.enabled = enabled;
  }

  /** Quality-tier gate. Disabling detaches + clears the channels immediately. */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.vignette = 0;
      this.ripple = 0;
      this.detach();
    }
  }

  /** Red vignette flare from a chunk of hp lost (0..1 of max hp). */
  addVignette(hpLostFrac: number): void {
    if (!this.enabled || this.disposed) return;
    this.vignette = Math.max(this.vignette, vignetteIntensityForHpLoss(hpLostFrac));
  }

  /** Ripple/heat-distortion pulse from a heavy hit or a beam/explosion. */
  addRipple(input: RippleInput): void {
    if (!this.enabled || this.disposed) return;
    this.ripple = Math.max(this.ripple, rippleAmpForImpact(input));
  }

  /** Per-frame: decay both channels, advance the ripple clock, attach/detach. */
  update(dtMs: number): void {
    if (this.disposed) return;
    this.vignette = decayIntensity(this.vignette, dtMs, VIGNETTE_HALF_LIFE_MS);
    this.ripple = decayIntensity(this.ripple, dtMs, RIPPLE_HALF_LIFE_MS);
    const active = this.enabled && (this.vignette > IDLE_EPS || this.ripple > IDLE_EPS);
    if (active) {
      this.rippleTimeSec += dtMs / 1000;
      this.attach();
    } else {
      this.detach();
    }
  }

  private ensurePp(): PostProcess | null {
    if (this.pp || this.disposed) return this.pp;
    const camera = this.cameraFor();
    if (!camera) return null;
    registerShader();
    this.pp = new PostProcess(
      SHADER_NAME,
      SHADER_NAME,
      ["rippleAmp", "rippleTime", "vignette", "vignetteColor", "rippleCenter"],
      null,
      1.0,
      camera,
    );
    this.pp.onApply = (effect): void => {
      effect.setFloat("rippleAmp", this.ripple);
      effect.setFloat("rippleTime", this.rippleTimeSec);
      effect.setFloat("vignette", this.vignette);
      effect.setFloat3("vignetteColor", this.color[0], this.color[1], this.color[2]);
      effect.setFloat2("rippleCenter", 0.5, 0.5);
    };
    // created attached — start detached; update() attaches on demand
    this.attached = true;
    this.detach();
    return this.pp;
  }

  private attach(): void {
    if (this.attached) return;
    const pp = this.ensurePp();
    const camera = this.cameraFor();
    if (!pp || !camera) return;
    camera.attachPostProcess(pp);
    this.attached = true;
  }

  private detach(): void {
    if (!this.attached || !this.pp) return;
    const camera = this.cameraFor();
    camera?.detachPostProcess(this.pp);
    this.attached = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detach();
    this.pp?.dispose();
    this.pp = null;
  }
}
