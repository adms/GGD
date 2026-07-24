/**
 * CombatPostFx — the screen-space combat post-process: a red SCREEN-EDGE
 * VIGNETTE that flares when the LOCAL player takes damage (intensity by hp
 * lost).
 *
 * IT USED TO CARRY A SECOND CHANNEL, and the removal is the whole point of
 * this comment (task #196). A radial "ripple / heat-distortion" warp shared
 * this pass: `sin(dist * 55.0 - rippleTime * 11.0)` shoving screen UVs outward
 * from `rippleCenter`, which onApply hard-coded to (0.5, 0.5). That constant is
 * not a neutral default — `CameraRig.apply()` calls
 * `setTarget(this.target.x, 0, this.target.z)` with `target` follow-lerped onto
 * the LOCAL champion, so the camera's look-at point is the ground under his
 * feet and it projects to exactly UV (0.5, 0.5). The ripple origin was
 * therefore welded to the local hero's feet by construction, could never track
 * the actual impact, and — because a UV warp is only legible where the image
 * has high-frequency detail, which at the 68° pitch is the tiled arena floor —
 * it read as concentric seismic rings travelling outward across the GROUND.
 * It animated off its own `rippleTimeSec` clock, so a perfectly still camera
 * showed it too. The trigger made it permanent: `damage` is an unfiltered
 * broadcast of every duel zone, and the arming call had no local-player gate
 * (unlike the vignette), so hits nobody could see kept re-slamming a 90 ms
 * half-life back to full and the pass never detached for a whole round.
 *
 * The effect is gone rather than gated because there is no version of it worth
 * keeping: any radial screen warp centred on the camera target is, in this
 * game, a warp centred on your own feet — and re-centring it on the impact
 * puts it right back there whenever the impact is YOU, which is the common
 * case. Owner report: 「為什麼開始戰鬥 地板總是會有莫名的震動波紋曲線」.
 *
 * Perf contract (unchanged): the pass is quality-tier GATED (constructed
 * disabled on the mobile/low tier via GameApp) and, when enabled, is ATTACHED
 * to the local camera only while the vignette is non-zero — it detaches the
 * instant it decays to 0, so steady-state combat with no recent hit costs
 * nothing and the ~700 fps baseline holds. All intensity/decay math is the pure
 * postFxMath module; this file is the imperative Babylon shell.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { Effect } from "@babylonjs/core/Materials/effect";
import {
  decayIntensity,
  vignetteIntensityForHpLoss,
  VIGNETTE_HALF_LIFE_MS,
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
uniform float vignette;
uniform vec3 vignetteColor;
void main(void) {
  vec4 col = texture2D(textureSampler, vUV);
  if (vignette > 0.0) {
    float r = distance(vUV, vec2(0.5));
    float edge = smoothstep(0.33, 0.75, r);
    col.rgb = mix(col.rgb, vignetteColor, edge * vignette);
  }
  gl_FragColor = col;
}
`;
}

/** Below this the channel is treated as idle and the pass detaches. */
const IDLE_EPS = 1e-3;

export class CombatPostFx {
  private pp: PostProcess | null = null;
  private attached = false;
  private enabled: boolean;
  private disposed = false;

  private vignette = 0;
  /** deep red edge tint. */
  private readonly color: [number, number, number] = [0.85, 0.06, 0.06];

  constructor(
    private readonly scene: Scene,
    private readonly cameraFor: () => Camera | null,
    enabled = true,
  ) {
    this.enabled = enabled;
  }

  /** Quality-tier gate. Disabling detaches + clears the channel immediately. */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.vignette = 0;
      this.detach();
    }
  }

  /** Red vignette flare from a chunk of hp lost (0..1 of max hp). */
  addVignette(hpLostFrac: number): void {
    if (!this.enabled || this.disposed) return;
    this.vignette = Math.max(this.vignette, vignetteIntensityForHpLoss(hpLostFrac));
  }

  /** Per-frame: decay the channel and attach/detach. */
  update(dtMs: number): void {
    if (this.disposed) return;
    this.vignette = decayIntensity(this.vignette, dtMs, VIGNETTE_HALF_LIFE_MS);
    if (this.enabled && this.vignette > IDLE_EPS) this.attach();
    else this.detach();
  }

  private ensurePp(): PostProcess | null {
    if (this.pp || this.disposed) return this.pp;
    const camera = this.cameraFor();
    if (!camera) return null;
    registerShader();
    this.pp = new PostProcess(
      SHADER_NAME,
      SHADER_NAME,
      ["vignette", "vignetteColor"],
      null,
      1.0,
      camera,
    );
    this.pp.onApply = (effect): void => {
      effect.setFloat("vignette", this.vignette);
      effect.setFloat3("vignetteColor", this.color[0], this.color[1], this.color[2]);
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
