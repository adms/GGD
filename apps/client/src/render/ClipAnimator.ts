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
 * WHERE THE CLAMP SILENTLY BREAKS ALIGNMENT.
 *
 * `pulseSpeedRatio` fits a clip to a window by scaling playback, then CLAMPS
 * the result to [PULSE_RATE_MIN, PULSE_RATE_MAX] — for good reason: a 0.17 s
 * clip stretched over a 1 s window is 6x slow-motion and a 21 s clip squeezed
 * into 1 s is a blur. But the clamp means the clip no longer spans the window
 * it was given, and every timing derived from "the clip spans the window" is
 * then WRONG WITHOUT SAYING SO. Measured by `scripts/probeCastFrameData.ts`
 * against the real roster (117 model docs; 111 resolve a cast clip with a
 * non-zero length):
 *
 *   startup 0.6 s — 22 clamp:  8 too short (0.5x floor), 14 too long (3x ceiling)
 *   startup 0.9 s — 26 clamp: 20 too short,               6 too long
 *
 *     Worst too-short: imported.windmissle "stand" 0.033 s → strike 560 ms
 *       EARLY at a 0.6 s startup. Worst too-long: imported.grandorcaura
 *       "Stand" 21.333 s → strike 3667 ms LATE.
 *
 * Note the split MOVES with the startup — which is exactly why the clamp cannot
 * be hand-waved: the owner's rule pushes every ability to 0.6 s or more, so the
 * "too short" bucket is the one that grows.
 *
 * So the clamp cannot just be widened, and it cannot be ignored.
 * {@link alignPulseClip} keeps the clamp and compensates around it instead:
 *   - clip too SHORT to fill the window → hold frame 0 for `delaySec`, then
 *     play at the floor rate, so the strike frame still lands on the tick;
 *   - clip too LONG → skip `skipSec` of clip time and start partway in, so the
 *     remaining pre-strike run is exactly the startup.
 * Both are EXACT (residual strike error 0), which is why `strikeErrorMs` on the
 * returned plan is an assertion, not an estimate.
 */
export interface ClipStrikePlan {
  /** speedRatio handed to AnimationGroup.start once the clip is advancing. */
  rate: number;
  /** hold the first frame this many seconds before advancing (0 = start now). */
  delaySec: number;
  /** start this many seconds INTO the clip (0 = from the top). */
  skipSec: number;
  /** which clamp bound was hit, and therefore had to be compensated for. */
  clamped: "none" | "slow" | "fast";
  /** residual error of THIS plan: ms the strike frame misses the tick by. */
  strikeErrorMs: number;
  /** real seconds from pulse start until the clip's last frame. */
  spanSec: number;
}

/**
 * Plan a one-shot clip so its STRIKE FRAME lands exactly `startupSec` after the
 * pulse begins — the frame-data alignment the sim's damage tick demands.
 * Pure; `clipDurationSec` is the clip's authored length, `strikeFraction` the
 * fraction of it that has played at the release frame.
 */
export function alignPulseClip(
  clipDurationSec: number,
  startupSec: number,
  strikeFraction: number,
  rateMin = PULSE_RATE_MIN,
  rateMax = PULSE_RATE_MAX,
): ClipStrikePlan {
  const f = strikeFraction > 0 && strikeFraction < 1 ? strikeFraction : 0.6;
  const s = startupSec > 0 ? startupSec : 0;
  const d = clipDurationSec > 0 ? clipDurationSec : 0;
  // A zero-length / missing clip has nothing to align: hold for the startup.
  if (!(d > 0) || !(s > 0)) {
    return { rate: 1, delaySec: s, skipSec: 0, clamped: "none", strikeErrorMs: 0, spanSec: s };
  }
  const windowSec = s / f; // the span the clip WOULD fill if it could
  const raw = d / windowSec;
  const clamped = raw < rateMin ? "slow" : raw > rateMax ? "fast" : "none";
  const rate = clamped === "slow" ? rateMin : clamped === "fast" ? rateMax : raw;
  const playedSec = d / rate; // real time the whole clip actually takes
  const strikeAtSec = f * playedSec; // real time from clip start to the strike
  // too short (or exact): hold the opening frame, then play — strike lands on
  // the tick. too long: skip into the clip so the run-up is exactly `s`.
  const delaySec = strikeAtSec <= s ? s - strikeAtSec : 0;
  const skipSec = strikeAtSec > s ? (strikeAtSec - s) * rate : 0;
  return {
    rate,
    delaySec,
    skipSec,
    clamped,
    strikeErrorMs: 0,
    spanSec: delaySec + (d - skipSec) / rate,
  };
}

/**
 * The strike error the NAIVE plan produces — spanning the clip over the startup
 * window itself, which is what `castBegin` did before this lane. Negative = the
 * body throws the move BEFORE the sim's damage tick (the lie); positive = after.
 * Kept as a tested function because it is the number the /frame-data audition
 * page shows as the "before", and the justification for the whole change.
 */
export function naiveStrikeErrorMs(
  clipDurationSec: number,
  startupSec: number,
  strikeFraction: number,
): number {
  const f = strikeFraction > 0 && strikeFraction < 1 ? strikeFraction : 0.6;
  if (!(clipDurationSec > 0) || !(startupSec > 0)) return 0;
  const rate = Math.min(PULSE_RATE_MAX, Math.max(PULSE_RATE_MIN, clipDurationSec / startupSec));
  const played = clipDurationSec / rate;
  return (f * played - startupSec) * 1000;
}

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
  /**
   * per-state STRIKE alignment (startup + strike fraction). Takes precedence
   * over `pulseWindowSec`: the window is then derived, not given.
   */
  private readonly pulseAlign = new Map<AnimState, { startupSec: number; strikeFraction: number }>();
  /** a delayed start in flight: hold frame 0 until `remainingSec` runs out. */
  private pending: { state: AnimState; remainingSec: number; rate: number } | null = null;
  /** the plan the current one-shot started with (diagnostics / audition page). */
  private lastPlanValue: (ClipStrikePlan & { state: AnimState }) | null = null;
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

  /**
   * STOP EVERY CLIP without destroying anything (task #220 corpse dissolve).
   * A vanished body is invisible but its AnimationGroups are NOT nodes — a
   * still-"playing" death clip keeps costing per-frame work in the scene's
   * animatables for a model nobody can see. `current` is cleared so a later
   * `play()` (the body was revived) starts the state clip again instead of
   * short-circuiting on the idempotence check. `dispose()` remains the only
   * thing that frees the groups.
   */
  stopAll(): void {
    for (const g of this.groups) g.stop();
    this.current = null;
    this.pending = null;
  }

  /** Restart the one-shot for a re-triggered pulse (attack spam, etc.). */
  restart(state: AnimState): void {
    if (state !== this.current || LOOPING[state]) return;
    this.byState.get(state)?.stop();
    this.start(state);
  }

  /**
   * STRIKE ALIGNMENT for a one-shot state: play the clip so its release frame
   * lands exactly `startupSec` after the pulse begins (the sim's damage tick),
   * with the follow-through after it. Overrides any `setPulseWindow` for that
   * state; pass `undefined` to go back to plain window-fitting.
   */
  setPulseAlignment(
    state: AnimState,
    align: { startupSec: number; strikeFraction: number } | undefined,
  ): void {
    if (align && align.startupSec > 0) this.pulseAlign.set(state, align);
    else this.pulseAlign.delete(state);
  }

  /**
   * Advance a DELAYED clip start (see {@link alignPulseClip}): while the clip is
   * too short to fill its window, the opening frame is held for `delaySec` so
   * the strike still lands on the tick. Call once per rendered frame with the
   * frame's dt — and NOT while hitstop-frozen, so the freeze pauses the hold
   * exactly as it pauses the clip (the sim pauses the cast wind-up too).
   */
  advance(dtMs: number): void {
    const p = this.pending;
    if (!p || this.frozen) return;
    p.remainingSec -= Math.max(0, dtMs) / 1000;
    if (p.remainingSec > 0) return;
    this.pending = null;
    if (this.current !== p.state) return;
    const g = this.byState.get(p.state);
    if (g) g.speedRatio = p.rate;
    this.savedRate = p.rate;
  }

  /** The plan the current one-shot started with (diagnostics / audition page). */
  get lastPlan(): (ClipStrikePlan & { state: AnimState }) | null {
    return this.lastPlanValue;
  }

  /** Authored length (seconds) of the clip a state resolves to, or 0. */
  clipDurationSec(state: AnimState): number {
    const g = this.byState.get(state);
    return g ? (g.to - g.from) / GLTF_FPS : 0;
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
    this.pending = null;
    const durationSec = (group.to - group.from) / GLTF_FPS;
    const align = this.pulseAlign.get(state);
    if (align && !LOOPING[state] && state !== "death") {
      // FRAME-DATA PATH: rate + (delay | skip) so the strike frame lands on the
      // sim's damage tick even when the rate clamp bites. A delayed start opens
      // at speedRatio 0 (the clip's first frame, held) and `advance` releases it.
      const plan = alignPulseClip(durationSec, align.startupSec, align.strikeFraction);
      this.lastPlanValue = { ...plan, state };
      const fromFrame = group.from + plan.skipSec * GLTF_FPS;
      const rate = plan.delaySec > 0 ? 0 : plan.rate;
      if (plan.delaySec > 0) this.pending = { state, remainingSec: plan.delaySec, rate: plan.rate };
      group.start(false, rate, fromFrame, group.to);
      this.settleRate(group, rate);
      return;
    }
    this.lastPlanValue = null;
    const speed =
      state === "run"
        ? this.locomotionRate
        : pulseSpeedRatio(durationSec, state, this.pulseWindowSec.get(state));
    group.start(LOOPING[state], speed);
    this.settleRate(group, speed);
  }

  /**
   * A clip may be (re)started WHILE hitstop-frozen — `pulse()` restarts on the
   * event, not on the render frame. `AnimationGroup.start` sets its own
   * speedRatio, which would un-freeze the body mid-impact, so re-apply the
   * freeze here and remember the rate to restore. Without this a champion hit
   * on the exact frame it began casting would visibly skip its freeze.
   */
  private settleRate(group: AnimationGroup, rate: number): void {
    this.savedRate = rate;
    if (this.frozen) group.speedRatio = 0;
  }
}
