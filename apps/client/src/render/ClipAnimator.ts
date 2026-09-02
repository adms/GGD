/**
 * ClipAnimator — maps AnimationGroups from a loaded .glb onto the visual
 * anim states (idle/run/attack/cast/hurt/death) plus the presentation-only
 * `celebrate` (see {@link ClipState}). Clip names come from the
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

/**
 * PRESENTATION-ONLY clip states (GH#257).
 *
 * `AnimState` is what the SIM's `AnimationStateMachine` can derive from
 * authoritative data — alive/moving plus the three event pulses. `celebrate`
 * is NOT one of those: nothing in a match ever produces it. It exists because
 * the presentation screens (回合頒獎台, and any future 英靈殿 showcase) need to
 * ASK for a clip that the state machine can never ask for.
 *
 * Widening the animator's key type here instead of widening `AnimState` keeps
 * the sim-facing contract exactly six states — every `AnimState` is a valid
 * `ClipState`, so every existing caller still typechecks unchanged, but a new
 * `AnimationStateMachine.update()` return value can never be `celebrate`.
 */
/**
 * ⭐ 不進 `clipMap` 的演出剪輯 —— `zClipMap` **嚴格在 6 格**，
 * ⛔ 動它要改每一份 model doc。⇒ 這條軸就是為此存在的（`celebrate` 是前例）。
 *
 * ⭐⭐ 2026-09-02 加 `guard` / `dodge`（Codex 阻塞清單 P0-2）：
 * 264 顆出貨 glb 裡 `guard`/`dodge` 是 **0 位元組** ⇒ 它們**必然**走模糊比對，
 * 而找不到就退回 idle 並**警告一次** —— ⭐ 那是 fail-loud 的那一半。
 */
export type PresentationClip = "celebrate" | "guard" | "dodge";
export type ClipState = AnimState | PresentationClip;

/**
 * Fuzzy name candidates per state, used when the model doc's `clipMap` has no
 * entry (or names a clip the .glb does not contain).
 *
 * `celebrate` measured against the shipped roster (247 .glb files under
 * `content/assets/models/{champions,imported}`): 8 carry `cheer` (the voxel /
 * blocky rig's 7th clip, see `@ggd/shared/voxel/clips`) and 6 carry
 * `Stand Victory` (w3x imports). The remaining 233 have NOTHING — they resolve
 * to nothing and `start()` warns once before falling back to idle, which is the
 * fail-LOUD half of that fallback (CLAUDE.md: fail-open is fine, SILENT is the
 * defect). Do not add a silent second fallback path here.
 */
const DEFAULT_CLIP_NAMES: Record<ClipState, string[]> = {
  idle: ["idle", "stand"],
  run: ["run", "walk", "move"],
  attack: ["attack", "swing", "shoot"],
  cast: ["cast", "spell", "ability"],
  hurt: ["hurt", "hit", "flinch"],
  death: ["death", "die", "ko"],
  celebrate: ["celebrate", "cheer", "victory", "dance"],
  /**
   * ⭐ 格擋 —— ⛔ **刻意沒有 `hurt`**（Codex 逐字：「不得將 `hurt` 當成唯一格擋動作」）。
   * ⚠️ `attack defend` 在出貨的 264 顆 glb 裡有 **21 顆**（普查量的），
   * 而它正是 WC3 「舉盾格擋」的剪輯名。找不到 ⇒ 退回 idle（⛔ 不是 hurt）。
   */
  guard: ["defend", "block", "guard", "shield", "parry"],
  /**
   * ⭐ 迴避 —— 一個閃身。`walk`/`run` 在 171/many 顆上有，
   * 而 `pulseSpeedRatio` 會把它壓進 220ms 的窗 ⇒ 看起來是一個急促的側移。
   * ⛔ 沒有 `hurt`：閃過去的人**沒有被打到**，播受擊會說謊。
   */
  dodge: ["dodge", "evade", "roll", "sidestep", "walk"],
};

const LOOPING: Record<ClipState, boolean> = {
  // ⭐ 兩塊新脈衝都是**一次性**的（⛔ 循環的格擋會卡住身體）
  guard: false,
  dodge: false,
  idle: true,
  run: true,
  attack: false,
  cast: false,
  hurt: false,
  death: false,
  // a podium beat lasts seconds; a one-shot cheer would freeze on its last
  // frame halfway through and read as "the winner also stopped moving".
  celebrate: true,
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
  clipMap?: Partial<Record<ClipState, string>>,
): Map<ClipState, number> {
  const out = new Map<ClipState, number>();
  for (const state of Object.keys(DEFAULT_CLIP_NAMES) as ClipState[]) {
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
  state: ClipState,
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
  private readonly byState = new Map<ClipState, AnimationGroup>();
  private current: ClipState | null = null;
  /** per-state one-shot window override (seconds), set by event wiring */
  private readonly pulseWindowSec = new Map<ClipState, number>();
  /**
   * per-state STRIKE alignment (startup + strike fraction). Takes precedence
   * over `pulseWindowSec`: the window is then derived, not given.
   */
  private readonly pulseAlign = new Map<ClipState, { startupSec: number; strikeFraction: number }>();
  /** a delayed start in flight: hold frame 0 until `remainingSec` runs out. */
  private pending: { state: ClipState; remainingSec: number; rate: number } | null = null;
  /** the plan the current one-shot started with (diagnostics / audition page). */
  private lastPlanValue: (ClipStrikePlan & { state: ClipState }) | null = null;
  private locomotionRate = 1.0;
  /** hitstop: current group frozen (speedRatio 0) for the impact window. */
  private frozen = false;
  private savedRate = 1.0;
  /** states already reported as unresolved — warn once, never per frame. */
  private readonly warnedStates = new Set<ClipState>();

  constructor(groups: AnimationGroup[], clipMap?: Partial<Record<ClipState, string>>) {
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

  /**
   * The state whose clip is currently playing (observability / tests).
   *
   * This is what the caller ASKED for, not what resolved: a model with no
   * `celebrate` clip reports `celebrate` while the idle group actually turns —
   * which is the honest answer for "did the podium request the cheer?", and the
   * fallback itself is reported by `start()`'s warn-once.
   */
  get currentClip(): ClipState | null {
    return this.current;
  }

  /** Idempotent per frame. */
  play(state: ClipState): void {
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
  restart(state: ClipState): void {
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
    state: ClipState,
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
  get lastPlan(): (ClipStrikePlan & { state: ClipState }) | null {
    return this.lastPlanValue;
  }

  /** Authored length (seconds) of the clip a state resolves to, or 0. */
  clipDurationSec(state: ClipState): number {
    const g = this.byState.get(state);
    return g ? (g.to - g.from) / GLTF_FPS : 0;
  }

  /**
   * Set the one-shot window (seconds) for a pulse state before it (re)starts.
   * Cast wiring passes castTimeSec; attack wiring passes the wind-up span.
   * Pass undefined to fall back to the default PULSE_MS window.
   */
  setPulseWindow(state: ClipState, windowSec: number | undefined): void {
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

  private start(state: ClipState): void {
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
