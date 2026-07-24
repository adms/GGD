/**
 * audio/remoteFootsteps — footstep cadence for EVERY OTHER champion.
 *
 * Today exactly one of the twelve bodies in a fight makes a walking sound:
 * `audio/footsteps.FootstepCadence` is a single-instance accumulator fed the
 * LOCAL champion's position from `GameApp.frame` (step 4). The other eleven walk
 * in total silence. That is not a wiring gap — the sim deliberately emits no
 * per-tick footstep event (it would be a wire flood), so the cue has to be
 * DERIVED client-side, per entity, from the rendered ground track. This is that
 * derivation, and it is the single highest-value item in the spatial-audio
 * request: a flanker you cannot see is exactly the information a fixed camera
 * denies you and a soundfield can give back.
 *
 * Three throttles, each for a different failure it prevents:
 *
 *  1. PER-SOURCE COOLDOWN. Without it a champion whose rendered position jitters
 *     across the stride boundary machine-guns the key.
 *  2. PER-FRAME CAP, NEAREST FIRST. `content/config/audio-map.json` gates
 *     `footstep` at `maxConcurrent 2` globally, keyed on the event name alone —
 *     so twelve bodies feeding one key means two arbitrary strangers own every
 *     step in the fight. Taking only the nearest few per frame makes the ones
 *     that survive the ones that matter.
 *  3. AUDIBILITY PRE-FILTER. Candidates beyond the `texture` cutoff are dropped
 *     BEFORE the cap is applied, so a champion across the arena — who would have
 *     been silenced by `spatialMix` anyway — cannot spend one of the slots.
 */
import { FootstepCadence } from "./footsteps";
import { TEXTURE_FAR } from "./spatial";

/**
 * Minimum ms between two steps from the SAME champion, on top of the global
 * per-key gate. A sprint is roughly 4 steps/s, so 260 ms admits a full run
 * cadence and rejects render jitter.
 */
export const REMOTE_FOOTSTEP_COOLDOWN_MS = 260;

/**
 * Most remote steps emitted in one frame. Three is deliberate: it fills the
 * `footstep` key's concurrency (2) with one in reserve for the frame's ordering,
 * and it is small enough that a stampede reads as "a group over there" rather
 * than as a wall of scuffing.
 */
export const REMOTE_FOOTSTEP_MAX_PER_FRAME = 3;

export interface FootstepSample {
  id: number;
  x: number;
  z: number;
}

export class RemoteFootsteps {
  private readonly cadences = new Map<number, FootstepCadence>();
  private readonly lastPlayMs = new Map<number, number>();
  /** scratch, reused every frame — this runs inside the render loop. */
  private readonly candidates: { sample: FootstepSample; d: number }[] = [];

  /**
   * Advance every remote champion's cadence and return the ones that should
   * SOUND this frame, nearest-to-the-listener first. Positions are the RENDERED
   * ones (`EntityViewRegistry.posOf`), so the cue tracks what the player sees,
   * including interpolation and prediction correction.
   *
   * Ids absent from `samples` are forgotten, so a despawn/cull/round-end cannot
   * leak an accumulator or let a stale position fire a phantom step.
   */
  step(
    samples: readonly FootstepSample[],
    listenerX: number,
    listenerZ: number,
    nowMs: number,
  ): FootstepSample[] {
    this.candidates.length = 0;
    const seen = new Set<number>();

    for (const s of samples) {
      if (!Number.isFinite(s.x) || !Number.isFinite(s.z)) continue;
      seen.add(s.id);
      let cadence = this.cadences.get(s.id);
      if (!cadence) {
        cadence = new FootstepCadence();
        this.cadences.set(s.id, cadence);
      }
      // ALWAYS advance, even for an inaudible source: the accumulator is the
      // champion's travelled distance, and skipping frames would make a walker
      // who crosses the audibility edge burst a step the instant they arrive.
      const fired = cadence.advance(s.x, s.z);
      if (!fired) continue;

      const dx = s.x - listenerX;
      const dz = s.z - listenerZ;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > TEXTURE_FAR) continue; // spatialMix would drop it — don't spend a slot

      const last = this.lastPlayMs.get(s.id);
      if (last !== undefined && nowMs - last < REMOTE_FOOTSTEP_COOLDOWN_MS) continue;
      this.candidates.push({ sample: s, d });
    }

    // prune vanished entities
    if (this.cadences.size > seen.size) {
      for (const id of this.cadences.keys()) if (!seen.has(id)) this.forget(id);
    }

    if (this.candidates.length === 0) return [];
    this.candidates.sort((a, b) => a.d - b.d);
    const out: FootstepSample[] = [];
    for (const c of this.candidates) {
      if (out.length >= REMOTE_FOOTSTEP_MAX_PER_FRAME) break;
      this.lastPlayMs.set(c.sample.id, nowMs);
      out.push(c.sample);
    }
    return out;
  }

  forget(id: number): void {
    this.cadences.delete(id);
    this.lastPlayMs.delete(id);
  }

  reset(): void {
    this.cadences.clear();
    this.lastPlayMs.clear();
  }

  /** Entities currently being tracked (diagnostics / tests). */
  get tracked(): number {
    return this.cadences.size;
  }
}
