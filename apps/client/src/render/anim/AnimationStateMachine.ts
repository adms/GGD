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
  }

  /** End a pulse early (castEnd / castInterrupt events). */
  cancel(kind: AnimPulse): void {
    if (this.pulse === kind) {
      this.pulse = null;
      this.pulseEndMs = 0;
    }
  }

  /** Recompute the state from authoritative flags; returns the new state. */
  update(inputs: AnimInputs, nowMs: number): AnimState {
    if (!inputs.alive) {
      this.pulse = null;
      this.lastMovingMs = -Infinity;
      this.state = "death";
      return this.state;
    }
    if (inputs.moving) this.lastMovingMs = nowMs;
    // run-exit hysteresis: moving now, or moved within the linger window
    const moving = inputs.moving || nowMs - this.lastMovingMs < RUN_LINGER_MS;
    if (this.pulse && nowMs < this.pulseEndMs) {
      // hurt is non-interrupting for locomotion — drop it while moving
      if (this.pulse === "hurt" && moving) {
        this.pulse = null;
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
