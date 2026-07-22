/**
 * ClipAnimator — maps AnimationGroups from a loaded .glb onto the visual
 * anim states (idle/run/attack/cast/hurt/death). Clip names come from the
 * model doc's clipMap (exact match, case-insensitive) with fuzzy fallback
 * matching for GLBs without a doc. Cloned instances rename groups to
 * "<entityId>-<clip>", so matching is prefix-tolerant (suffix match after a
 * "-"). Looping states loop; pulses play once at a speedRatio that squeezes
 * (or stretches) the clip into the pulse window — the wind-up/cast events
 * carry real durations, so a sword swing lands its strike at the damage
 * point and a cast animation spans castTimeSec. The run loop's rate follows
 * the entity's actual ground speed (foot-slide fix). Death sticks on its
 * last frame. All targeted animations get blending (~0.1) for smooth
 * transitions.
 */
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { PULSE_MS, type AnimState } from "./anim/AnimationStateMachine";

const DEFAULT_CLIP_NAMES: Record<AnimState, string[]> = {
  idle: ["idle", "stand"],
  run: ["run", "walk", "move"],
  attack: ["attack", "swing", "shoot"],
  cast: ["cast", "spell", "ability"],
  hurt: ["hurt", "hit", "flinch"],
  death: ["death", "die", "ko"],
};

const LOOPING: Record<AnimState, boolean> = {
  idle: true,
  run: true,
  attack: false,
  cast: false,
  hurt: false,
  death: false,
};

const BLENDING_SPEED = 0.1;
/** glTF clips are sampled at 60 fps by the Babylon loader. */
const GLTF_FPS = 60;

/**
 * Reference ground speed (world units/s) at which a run clip plays at its
 * authored 1.0 rate. Tuned to the roster median move speed (5.8 u/s) so both
 * KayKit and imported rigs cycle believably at typical speeds.
 */
export const REFERENCE_RUN_SPEED = 5.8;
/** Run-rate clamp — never slower than 0.6x or faster than 1.8x authored. */
export const RUN_RATE_MIN = 0.6;
export const RUN_RATE_MAX = 1.8;

/** One-shot speed clamp — squeeze up to 3x, stretch down to 0.5x. */
export const PULSE_RATE_MIN = 0.5;
export const PULSE_RATE_MAX = 3.0;

/**
 * Case-insensitive clip-name match that tolerates the per-instance prefix
 * Babylon's instantiateModelsToScene adds to cloned groups
 * ("<entityId>-Walk" matches clip "Walk").
 */
export function clipNameMatches(groupName: string, clipName: string): boolean {
  const n = groupName.toLowerCase();
  const c = clipName.toLowerCase();
  return n === c || n.endsWith("-" + c);
}

/** Resolve state → AnimationGroup using the clipMap, with fuzzy fallback. */
export function resolveClips(
  groups: readonly { name: string }[],
  clipMap?: Partial<Record<AnimState, string>>,
): Map<AnimState, number> {
  const out = new Map<AnimState, number>();
  for (const state of Object.keys(DEFAULT_CLIP_NAMES) as AnimState[]) {
    const explicit = clipMap?.[state];
    let idx = explicit ? groups.findIndex((g) => clipNameMatches(g.name, explicit)) : -1;
    if (idx < 0) {
      idx = groups.findIndex((g) => {
        const n = g.name.toLowerCase();
        return DEFAULT_CLIP_NAMES[state].some((k) => n.includes(k));
      });
    }
    if (idx >= 0) out.set(state, idx);
  }
  return out;
}

/**
 * speedRatio that makes a one-shot clip fit its pulse window (squeezed OR
 * stretched, clamped). `windowSec` overrides the default per-state window —
 * cast events pass castTimeSec, attack wind-ups pass the wind-up span.
 */
export function pulseSpeedRatio(
  clipDurationSec: number,
  state: AnimState,
  windowSec?: number,
): number {
  if (LOOPING[state] || state === "death") return 1.0;
  const pulseSec = windowSec ?? PULSE_MS[state as keyof typeof PULSE_MS] / 1000;
  if (!(clipDurationSec > 0) || !(pulseSec > 0)) return 1.0;
  return Math.min(PULSE_RATE_MAX, Math.max(PULSE_RATE_MIN, clipDurationSec / pulseSec));
}

/**
 * Run-loop playback rate synced to actual ground speed (pure; unit-tested).
 * Unknown/zero speed plays at the authored rate.
 */
export function runSpeedRatio(unitsPerSec: number, referenceSpeed = REFERENCE_RUN_SPEED): number {
  if (!(unitsPerSec > 0) || !(referenceSpeed > 0)) return 1.0;
  return Math.min(RUN_RATE_MAX, Math.max(RUN_RATE_MIN, unitsPerSec / referenceSpeed));
}

export class ClipAnimator {
  /**
   * EVERY group handed to us, not just the ones a state resolved to.
   * `instantiateModelsToScene` clones the container's whole animation list, so
   * the clips no state mapped to are live scene objects too — `dispose()` has
   * to free them or they leak exactly like the mapped ones.
   */
  private readonly groups: AnimationGroup[];
  private readonly byState = new Map<AnimState, AnimationGroup>();
  private current: AnimState | null = null;
  /** per-state one-shot window override (seconds), set by event wiring */
  private readonly pulseWindowSec = new Map<AnimState, number>();
  private locomotionRate = 1.0;
  /** hitstop: current group frozen (speedRatio 0) for the impact window. */
  private frozen = false;
  private savedRate = 1.0;
  /** states already reported as unresolved — warn once, never per frame. */
  private readonly warnedStates = new Set<AnimState>();

  constructor(groups: AnimationGroup[], clipMap?: Partial<Record<AnimState, string>>) {
    this.groups = groups.slice();
    const resolved = resolveClips(groups, clipMap);
    for (const [state, idx] of resolved) this.byState.set(state, groups[idx]!);
    for (const g of groups) {
      g.stop();
      for (const ta of g.targetedAnimations) {
        ta.animation.enableBlending = true;
        ta.animation.blendingSpeed = BLENDING_SPEED;
      }
    }
  }

  get hasClips(): boolean {
    return this.byState.size > 0;
  }

  /** Idempotent per frame. */
  play(state: AnimState): void {
    if (state === this.current) return;
    const prev = this.current ? this.byState.get(this.current) : undefined;
    if (prev && prev !== this.byState.get(state)) prev.stop();
    this.start(state);
    this.current = state;
  }

  /**
   * HITSTOP: freeze / unfreeze the currently-playing clip by zeroing its
   * speedRatio (and restoring it on release). Syncs the struck model's
   * animation to the sim's deterministic hitstop tick-freeze so the hit reads
   * as impact. Idempotent; a no-op when there is no active clip.
   */
  setFrozen(frozen: boolean): void {
    if (frozen === this.frozen) return;
    this.frozen = frozen;
    const g = this.current ? this.byState.get(this.current) : undefined;
    if (!g) return;
    if (frozen) {
      this.savedRate = g.speedRatio;
      g.speedRatio = 0;
    } else {
      g.speedRatio = this.savedRate;
    }
  }

  get isFrozen(): boolean {
    return this.frozen;
  }

  /** Restart the one-shot for a re-triggered pulse (attack spam, etc.). */
  restart(state: AnimState): void {
    if (state !== this.current || LOOPING[state]) return;
    this.byState.get(state)?.stop();
    this.start(state);
  }

  /**
   * Set the one-shot window (seconds) for a pulse state before it (re)starts.
   * Cast wiring passes castTimeSec; attack wiring passes the wind-up span.
   * Pass undefined to fall back to the default PULSE_MS window.
   */
  setPulseWindow(state: AnimState, windowSec: number | undefined): void {
    if (windowSec !== undefined && windowSec > 0) this.pulseWindowSec.set(state, windowSec);
    else this.pulseWindowSec.delete(state);
  }

  /**
   * Sync the run loop's playback rate to the entity's actual ground speed
   * (units/s). Applies live if the run clip is playing (foot-slide fix).
   */
  setLocomotionSpeed(unitsPerSec: number): void {
    const rate = runSpeedRatio(unitsPerSec);
    if (rate === this.locomotionRate) return;
    this.locomotionRate = rate;
    if (this.current === "run") {
      const group = this.byState.get("run");
      if (group) group.speedRatio = rate;
    }
  }

  /**
   * Free the cloned AnimationGroups this animator was handed.
   * `instantiateModelsToScene` CLONES every group in the AssetContainer, and an
   * AnimationGroup registers itself in `scene.animationGroups` — a list Babylon
   * walks every frame. The owning view's `root.dispose()` touches NODES only,
   * so without this each champion despawn permanently strands N groups whose
   * targetedAnimations point at already-disposed TransformNodes, and a match
   * full of deaths/respawns grows that per-frame list without bound.
   * Idempotent: the group list is emptied, so a second call is a no-op.
   * (`AnimationGroup.dispose` stops a running group itself, so no stop() here.)
   */
  dispose(): void {
    for (const g of this.groups) g.dispose();
    this.groups.length = 0;
    this.byState.clear();
    this.current = null;
  }

  private start(state: AnimState): void {
    let group = this.byState.get(state);
    if (!group) {
      // A model whose clipMap points at a clip its .glb does not contain (or
      // aliases to "Stand") silently plays IDLE forever — which on screen is
      // indistinguishable from a frozen champion, and is exactly how a
      // mis-mapped rig hides. Keep the fallback, but say so once per model so
      // the defect is visible in the console instead of only in the gameplay.
      if (!this.warnedStates.has(state)) {
        this.warnedStates.add(state);
        console.warn(
          `[ClipAnimator] no "${state}" clip resolved — falling back to idle. ` +
            `Check the model doc's clipMap against the .glb's animation names.`,
        );
      }
      group = this.byState.get("idle");
    }
    if (!group) return;
    const durationSec = (group.to - group.from) / GLTF_FPS;
    const speed =
      state === "run"
        ? this.locomotionRate
        : pulseSpeedRatio(durationSec, state, this.pulseWindowSec.get(state));
    group.start(LOOPING[state], speed);
  }
}
