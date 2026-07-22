/**
 * audio/footsteps — footstep cadence for the LOCAL champion. The sim emits no
 * "footstep" event (it would be per-tick spam on the wire), so the client
 * derives the cue from the rendered ground track: accumulate travelled distance
 * and fire one step every STRIDE units. Pure bookkeeping — the GameApp feeds it
 * the local champion's position each frame and calls `audioSystem.playSfx`
 * (cooldown-gated) when it returns true, so the actual sound stays a discrete,
 * throttled event, never a per-frame path.
 */

/** World units of travel between footsteps (roughly one stride). */
export const FOOTSTEP_STRIDE = 1.6;
/** Ignore a single frame's jump beyond this (respawn/teleport) — never a step. */
export const FOOTSTEP_MAX_STEP = 6;

export class FootstepCadence {
  private acc = 0;
  private lastX: number | null = null;
  private lastZ: number | null = null;

  /**
   * Feed the champion's current planar position. Returns true on the frame a
   * footstep should sound. Teleports (a jump > FOOTSTEP_MAX_STEP) re-baseline
   * silently. Standing still never accumulates, so idle is silent.
   */
  advance(x: number, z: number): boolean {
    if (this.lastX === null || this.lastZ === null) {
      this.lastX = x;
      this.lastZ = z;
      return false;
    }
    const dx = x - this.lastX;
    const dz = z - this.lastZ;
    this.lastX = x;
    this.lastZ = z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > FOOTSTEP_MAX_STEP) {
      this.acc = 0; // teleport — don't stomp on landing
      return false;
    }
    this.acc += dist;
    if (this.acc >= FOOTSTEP_STRIDE) {
      this.acc -= FOOTSTEP_STRIDE;
      return true;
    }
    return false;
  }

  /** Clear all state (despawn / match end). */
  reset(): void {
    this.acc = 0;
    this.lastX = null;
    this.lastZ = null;
  }
}
