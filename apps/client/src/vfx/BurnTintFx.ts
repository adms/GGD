/**
 * BurnTintFx — 「角色被火燒到畫面會變半透明紅」 (task #195).
 *
 * ONE full-screen post-process per LOCAL VIEWPORT: while that seat's champion
 * is standing outside the fire ring, its whole frame washes translucent red.
 *
 * WHY THIS IS NOT FOLDED INTO CombatPostFx. `CombatPostFx` is desktop-only and
 * attaches to the PRIMARY camera only — on a phone, or in seats 1..3 of couch
 * play, it renders nothing. The burn tint is not juice; it is the ONLY signal
 * that tells a player they are dying to the environment and must move, so it
 * has to reach every seat on every device. `DeathFocusFx` already solved that
 * exact shape (a per-viewport slot with its own PostProcess sized to its own
 * viewport rect), so this is that pattern, not a new one.
 *
 * ORDER MATTERS. This attaches BEFORE DeathFocusFx, so when a burning champion
 * finally dies, the death desaturation greys down the red rather than the red
 * painting over the grey. The victory washes (#93) are DOM `backdrop-filter`
 * and compose above everything here automatically.
 *
 * CROSSFADE, NEVER STACK. `phase !== "combat"`, `outcomeDecided`, and the local
 * champion's death all ramp the tint out over `FOCUS_FADE_OUT_MS` — the SAME
 * constant DeathFocusFx fades in over, imported rather than copied, so the two
 * passes hand over instead of double-tinting for a few frames.
 *
 * All the intensity/decay arithmetic lives in `./postFxMath` (`burnTintForRate`,
 * `BURN_MAX`, `BURN_HALF_LIFE_MS`) where it is unit-tested without Babylon;
 * this file owns nothing but Babylon lifetime.
 *
 * Cost while active: one texture fetch and one mix() per pixel per burning
 * viewport. Zero when nobody is burning — the pass detaches at exactly 0.
 */
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { Effect } from "@babylonjs/core/Materials/effect";
import { FOCUS_FADE_OUT_MS } from "../render/deathFocus";
import { BURN_HALF_LIFE_MS, burnTintForRate, decayIntensity } from "./postFxMath";

const SHADER_NAME = "ggdBurnTint";
const UNIFORMS = ["uBurn"];

/** Below this the pass is detached outright — "off" must be a hard zero. */
const IDLE_EPS = 1e-3;

/**
 * The fire's colour. A deep, slightly orange red rather than pure #f00: pure
 * red mixed over a dark arena reads as a UI error state, this reads as flame.
 * Exported so a test can assert the shader and the docs agree.
 */
export const BURN_COLOR: readonly [number, number, number] = [0.75, 0.08, 0.05];

let shaderRegistered = false;

function registerShader(): void {
  if (shaderRegistered) return;
  shaderRegistered = true;
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = /* glsl */ `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float uBurn;

const vec3 BURN = vec3(${BURN_COLOR.map((v) => v.toFixed(4)).join(", ")});

void main(void) {
  vec4 src = texture2D(textureSampler, vUV);
  float b = clamp(uBurn, 0.0, 1.0);
  gl_FragColor = vec4(mix(src.rgb, BURN, b), src.a);
}
`;
}

/** The burn tint applied to one colour at `burn` strength. Pure — the shader's
 *  own `mix`, so a test can check the look without a GPU. */
export function burnTintColor(
  rgb: readonly [number, number, number],
  burn: number,
): [number, number, number] {
  const b = Math.max(0, Math.min(1, burn));
  return [
    rgb[0]! + (BURN_COLOR[0]! - rgb[0]!) * b,
    rgb[1]! + (BURN_COLOR[1]! - rgb[1]!) * b,
    rgb[2]! + (BURN_COLOR[2]! - rgb[2]!) * b,
  ];
}

export interface BurnTintDeps {
  /** Camera of local player `player`; null before its viewport exists. */
  cameraFor(player: number): Camera | null;
}

/** One frame of authoritative state, built by the caller from reused pools. */
export interface BurnTintFrame {
  phase: string;
  outcomeDecided: boolean;
  /**
   * Per local player: is that seat's own champion burning THIS frame, and at
   * what per-second rate (fraction of maxHp)? `burning` comes from
   * `ENTITY_FLAG.BURNING` on the seat's entity — the server composes it from
   * the sim's own burn predicate, so the wash cannot disagree with the damage.
   * `rate` is derived from the ring's shrink progress for the ramp.
   */
  readonly burning: readonly boolean[];
  readonly rate: readonly number[];
  /** local champion is alive (a dead player gets DeathFocusFx, not this) */
  readonly alive: readonly boolean[];
}

interface BurnSlot {
  pp: PostProcess | null;
  camera: Camera | null;
  attached: boolean;
  burn: number;
}

export class BurnTintFx {
  private readonly slots: BurnSlot[] = [];
  private disposed = false;

  constructor(
    private readonly deps: BurnTintDeps,
    playerCount: number,
  ) {
    for (let p = 0; p < Math.max(1, playerCount); p++) {
      this.slots.push({ pp: null, camera: null, attached: false, burn: 0 });
    }
  }

  /** Tint strength 0..1 of player `player` (introspection / tests). */
  burnOf(player: number): number {
    return this.slots[player]?.burn ?? 0;
  }

  /** True while player `player`'s pass is attached (introspection / tests). */
  isAttached(player: number): boolean {
    return this.slots[player]?.attached ?? false;
  }

  /**
   * Per-frame. `frame` is null when there is no match state — every viewport
   * then ramps out and detaches, exactly like DeathFocusFx's null path.
   */
  update(dtMs: number, frame: BurnTintFrame | null): void {
    if (this.disposed) return;
    for (let p = 0; p < this.slots.length; p++) {
      const slot = this.slots[p]!;
      // The round is no longer a place where burning means anything: no state,
      // out of combat, outcome settled, or this seat is dead (DeathFocusFx owns
      // the screen from here). Ramp out on the DEATH WASH's own clock so the
      // two passes crossfade instead of stacking.
      const forcedOut =
        frame === null ||
        frame.phase !== "combat" ||
        frame.outcomeDecided ||
        !(frame.alive[p] ?? false);
      const burning = !forcedOut && (frame!.burning[p] ?? false);

      if (burning) {
        // Rising edge / sustained burn: snap UP to the target, so the very
        // first burning frame reads. Only the RELEASE is smoothed.
        slot.burn = Math.max(slot.burn, burnTintForRate(frame!.rate[p] ?? 0));
      } else if (slot.burn > 0) {
        slot.burn = forcedOut
          ? Math.max(0, slot.burn - dtMs / FOCUS_FADE_OUT_MS) // linear crossfade
          : decayIntensity(slot.burn, dtMs, BURN_HALF_LIFE_MS); // stepped back inside
        if (slot.burn < IDLE_EPS) slot.burn = 0;
      }

      if (slot.burn <= 0) {
        this.detach(slot);
        continue;
      }
      const camera = this.deps.cameraFor(p);
      if (!camera) {
        this.detach(slot);
        continue;
      }
      this.attach(slot, camera);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const slot of this.slots) {
      slot.burn = 0;
      this.detach(slot);
      slot.pp?.dispose();
      slot.pp = null;
      slot.camera = null;
    }
  }

  // ------------------------------------------------------------- internals --

  private ensurePp(slot: BurnSlot, camera: Camera): PostProcess | null {
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
      effect.setFloat("uBurn", slot.burn);
    };
    slot.pp = pp;
    slot.camera = camera;
    // the constructor attaches; start detached and let update() attach on demand
    slot.attached = true;
    this.detach(slot);
    return slot.pp;
  }

  private attach(slot: BurnSlot, camera: Camera): void {
    const pp = this.ensurePp(slot, camera);
    if (!pp || slot.attached) return;
    camera.attachPostProcess(pp);
    slot.attached = true;
  }

  private detach(slot: BurnSlot): void {
    if (!slot.attached || !slot.pp) {
      slot.attached = false;
      return;
    }
    slot.camera?.detachPostProcess(slot.pp);
    slot.attached = false;
  }
}
