/**
 * AnimationStateMachine — derives a visual animation state PURELY from
 * authoritative data: alive flag + movement (position delta / velocity) give
 * the base state; attack/cast/hurt are short pulses triggered by MSG.EVENT
 * fanout. No local gameplay guessing. Pure TS (client-07) — the Babylon side
 * (ClipAnimator / procedural swing) only consumes the resulting state.
 *
 * Movement has stop hysteresis (RUN_LINGER_MS): entering run is instant, but
 * leaving run waits for a short quiet period. Authoritative positions arrive
 * in discrete snapshots, so instantaneous "moved this frame?" checks flicker
 * at stalls/edges — without the linger the run clip restarts every flicker
 * and walking reads as twitching/spasming.
 *
 * Hurt never interrupts locomotion: while moving, a damage flinch would
 * restart the walk loop every hit (constant twitching in fights), so the
 * hurt pulse only plays from idle; movement keeps the run loop.
 */

export type AnimState = "idle" | "run" | "attack" | "cast" | "hurt" | "death";

export type AnimPulse = "attack" | "cast" | "hurt";

export const PULSE_MS: Record<AnimPulse, number> = {
  attack: 350,
  cast: 450,
  hurt: 250,
};

/** Keep run alive briefly across movement-detection flickers/stalls. */
export const RUN_LINGER_MS = 200;

/** Pulse priority when several land in the same window. */
const PULSE_RANK: Record<AnimPulse, number> = { hurt: 0, attack: 1, cast: 2 };

export interface AnimInputs {
  alive: boolean;
  /** authoritative movement (position delta between snapshots / velocity) */
  moving: boolean;
}

export class AnimationStateMachine {
  private pulse: AnimPulse | null = null;
  private pulseEndMs = 0;
  private lastMovingMs = -Infinity;
  /**
   * True once the pulse has passed its ACTION frame and is only playing its
   * follow-through (see `release`). Recovery is movement-interruptible: the sim
   * has already un-rooted the caster, so holding the cast pose over a run input
   * would make the character feel stuck for the length of the tail.
   */
  private recovery = false;
  state: AnimState = "idle";

  /**
   * Event-driven pulse (from MSG.EVENT: abilityCast / damage / basic attack).
   * `durMs` overrides the default window — cast events pass their real
   * castTime, attack wind-ups their wind-up span.
   */
  trigger(kind: AnimPulse, nowMs: number, durMs?: number): void {
    const end = nowMs + (durMs !== undefined && durMs > 0 ? durMs : PULSE_MS[kind]);
    if (this.pulse && this.pulseEndMs > nowMs && PULSE_RANK[this.pulse] > PULSE_RANK[kind]) {
      return; // an equal-or-higher pulse is already playing
    }
    this.pulse = kind;
    this.pulseEndMs = end;
    this.recovery = false;
  }

  /** End a pulse early (castInterrupt: the cast was BROKEN, cut the pose). */
  cancel(kind: AnimPulse): void {
    if (this.pulse === kind) {
      this.pulse = null;
      this.pulseEndMs = 0;
      this.recovery = false;
    }
  }

  /**
   * The pulse's ACTION frame just happened for real (castEnd = the sim resolved
   * the ability): keep the state alive for `tailMs` of follow-through, then let
   * it end. Unlike `cancel` this does not cut the animation at the release
   * frame — the body finishes throwing the move — but the tail is marked
   * RECOVERY so movement can break out of it immediately.
   *
   * Re-anchoring on the real event (rather than trusting the window set at
   * `trigger`) is what keeps the tail correct when the sim's wind-up ran long:
   * hitstop and hitstun both PAUSE a cast in CastResolveSystem, so `castEnd`
   * legitimately arrives later than `castTimeSec` predicted.
   */
  release(kind: AnimPulse, nowMs: number, tailMs: number): void {
    if (this.pulse !== kind) return;
    this.pulseEndMs = nowMs + Math.max(0, tailMs);
    this.recovery = true;
  }

  /**
   * Push a live pulse's end out by `ms` — used when hitstop freezes the model:
   * the clip is frozen for that long, so its window has to grow by the same
   * amount or the state would expire while the clip is still mid-swing.
   */
  extendPulse(kind: AnimPulse, ms: number): void {
    if (this.pulse === kind && ms > 0) this.pulseEndMs += ms;
  }

  /** True while the current pulse is past its action frame (see `release`). */
  get inRecovery(): boolean {
    return this.pulse !== null && this.recovery;
  }

  /** Recompute the state from authoritative flags; returns the new state. */
  update(inputs: AnimInputs, nowMs: number): AnimState {
    if (!inputs.alive) {
      this.pulse = null;
      this.recovery = false;
      this.lastMovingMs = -Infinity;
      this.state = "death";
      return this.state;
    }
    if (inputs.moving) this.lastMovingMs = nowMs;
    // run-exit hysteresis: moving now, or moved within the linger window
    const moving = inputs.moving || nowMs - this.lastMovingMs < RUN_LINGER_MS;
    if (this.pulse && nowMs < this.pulseEndMs) {
      // hurt is non-interrupting for locomotion — drop it while moving. So is a
      // pulse's RECOVERY tail: once the action frame has fired the sim has
      // un-rooted the caster, so a move input must break out of the
      // follow-through instead of locking the body for the rest of it.
      if (moving && (this.pulse === "hurt" || this.recovery)) {
        this.pulse = null;
        this.recovery = false;
      } else {
        this.state = this.pulse;
        return this.state;
      }
    } else {
      this.pulse = null;
    }
    this.state = moving ? "run" : "idle";
    return this.state;
  }
}
