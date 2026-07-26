/**
 * InterpolationBuffer — per-entity ring buffer of authoritative transform
 * samples. Remote entities are rendered ~INTERP_DELAY_MS in the past: the
 * caller computes a (fractional) `renderTick` and we sample between the
 * bracketing snapshots. Position uses a Catmull-Rom spline (C1-continuous, no
 * velocity kinks at sample boundaries → visibly smoother than plain lerp);
 * facing stays linear (the ChampionView nlerp-smooths yaw downstream anyway).
 *
 * TELEPORT SNAP (task #43): respawns, round resets and blink/teleport abilities
 * move an entity tens of units in a single tick. Interpolating across that jump
 * would fly the body across the arena; worse, a jump sample sitting in a
 * NEIGHBOURING slot poisons the Catmull-Rom tangent of an otherwise ordinary
 * bracket and makes the entity lurch before/after the teleport. So `push` flags
 * any sample that is discontinuous from its predecessor and `sample` (a) holds
 * at the pre-jump sample and snaps at the tick boundary instead of gliding, and
 * (b) drops flagged neighbours from the tangent estimate.
 *
 * Pure TS — no Babylon, no network. Read-only w.r.t. the sim: this buffer only
 * ever stores copies of authoritative snapshots and returns render values.
 */
import { catmullRom1D, TELEPORT_STEP_UNITS } from "../render/math/motion";

export interface InterpSample {
  tick: number;
  x: number;
  z: number;
  fx: number;
  fz: number;
  /**
   * AIRBORNE HEIGHT above the floor, GGD units (task #247). Absent = 0 =
   * grounded, which every pre-#247 caller and test implicitly supplies.
   */
  h?: number;
}

interface StoredSample extends InterpSample {
  /** true when this sample is discontinuous from the one before it. */
  snap: boolean;
}

export interface InterpPose {
  x: number;
  z: number;
  fx: number;
  fz: number;
  /** interpolated fly height (task #247); 0 for every grounded entity. */
  h: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export class InterpolationBuffer {
  private readonly buffers = new Map<number, StoredSample[]>();

  constructor(private readonly capacity = 64) {}

  /** Record an authoritative sample; out-of-order (older) ticks are ignored. */
  push(entityId: number, sample: InterpSample): void {
    let buf = this.buffers.get(entityId);
    if (!buf) {
      buf = [];
      this.buffers.set(entityId, buf);
    }
    const last = buf[buf.length - 1];
    if (last) {
      if (sample.tick < last.tick) return; // stale
      if (sample.tick === last.tick) {
        // same-tick correction: re-classify against the sample BEFORE it
        buf[buf.length - 1] = { ...sample, snap: isSnap(buf[buf.length - 2], sample) };
        return;
      }
    }
    // the very first sample of a buffer (spawn) has no predecessor → no jump
    buf.push({ ...sample, snap: isSnap(last, sample) });
    if (buf.length > this.capacity) buf.splice(0, buf.length - this.capacity);
  }

  /**
   * Sample the entity's pose at a (fractional) server tick. Lerps between the
   * bracketing samples; clamps to the newest/oldest sample at the edges (no
   * extrapolation). Returns null for unknown entities.
   */
  sample(entityId: number, renderTick: number): InterpPose | null {
    const buf = this.buffers.get(entityId);
    if (!buf || buf.length === 0) return null;
    const first = buf[0]!;
    const last = buf[buf.length - 1]!;
    if (renderTick <= first.tick) return poseOf(first);
    if (renderTick >= last.tick) return poseOf(last);
    // find bracket (buffers are small; linear scan from the tail is fine)
    for (let i = buf.length - 2; i >= 0; i--) {
      const a = buf[i]!;
      if (a.tick <= renderTick) {
        const b = buf[i + 1]!;
        // TELEPORT: `b` is discontinuous from `a` — hold at `a` for the whole
        // bracket and let the tick boundary do the jump, so a respawn/blink
        // reads as an instant relocation instead of a glide across the arena.
        if (b.snap) return poseOf(a);
        const t = (renderTick - a.tick) / (b.tick - a.tick);
        // Catmull-Rom needs the two outer samples for its tangents; at a buffer
        // edge the neighbour is absent and the tangent falls back one-sided.
        // A neighbour across a teleport is worse than absent (it would drag the
        // tangent toward the old/new location), so treat it as missing too:
        // `a.snap` marks a discontinuous from p0, `p3raw.snap` marks p3 from b.
        const p0 = a.snap ? undefined : buf[i - 1];
        const p3raw = buf[i + 2];
        const p3 = p3raw && !p3raw.snap ? p3raw : undefined;
        return {
          x: catmullRom1D(p0?.x ?? a.x, a.x, b.x, p3?.x ?? b.x, t, !!p0, !!p3),
          z: catmullRom1D(p0?.z ?? a.z, a.z, b.z, p3?.z ?? b.z, t, !!p0, !!p3),
          fx: lerp(a.fx, b.fx, t),
          fz: lerp(a.fz, b.fz, t),
          // HEIGHT gets the SAME Catmull-Rom as x/z (task #247): C1 continuity
          // matters more on an arc than anywhere else, because a plain lerp puts
          // a velocity kink at every 30 Hz sample and the eye reads VERTICAL
          // kinks far more readily than horizontal ones.
          h: catmullRom1D(p0?.h ?? a.h ?? 0, a.h ?? 0, b.h ?? 0, p3?.h ?? b.h ?? 0, t, !!p0, !!p3),
        };
      }
    }
    return poseOf(first);
  }

  has(entityId: number): boolean {
    return this.buffers.has(entityId);
  }

  remove(entityId: number): void {
    this.buffers.delete(entityId);
  }

  /** Drop buffers for entities no longer present in the authoritative state. */
  prune(liveIds: ReadonlySet<number>): void {
    for (const id of [...this.buffers.keys()]) {
      if (!liveIds.has(id)) this.buffers.delete(id);
    }
  }

  clear(): void {
    this.buffers.clear();
  }
}

/**
 * Is `cur` a teleport relative to `prev`? The budget scales with the tick gap
 * (snapshots arrive at SNAPSHOT_HZ against a TICK_HZ sim; at the current 30/30
 * a bracket spans exactly 1 tick, but the scaling keeps this correct if the
 * broadcast rate is ever dropped below the sim rate again).
 * The first sample of a buffer has no predecessor and is never a jump.
 */
function isSnap(prev: InterpSample | undefined, cur: InterpSample): boolean {
  if (!prev) return false;
  const dTicks = Math.max(1, cur.tick - prev.tick);
  const dx = cur.x - prev.x;
  const dz = cur.z - prev.z;
  // TASK #247 — the classifier is 3-D now. For every grounded entity dh === 0,
  // so this is a BEHAVIOURAL NO-OP for everything that shipped before the leap
  // and every existing test stays green. It matters for exactly one case: a
  // champion KILLED AT APEX, whose height drops 11–18 units in one tick. Without
  // it, Catmull-Rom would smear the corpse down through the air over several
  // frames while the death animation plays on the ground; with it, the drop
  // snaps at the tick boundary — the same treatment a blink already gets.
  //
  // Checked against TELEPORT_STEP_UNITS = 4: the largest LEGITIMATE per-tick
  // height step is at takeoff, 4·A·(N-1)/N² — 1.00 u for the 43-tick/11.00 u arc
  // and 2.82 u for the 25-tick/18.33 u vertical leap. Both comfortably under 4,
  // so no real leap is ever misclassified as a teleport.
  const dh = (cur.h ?? 0) - (prev.h ?? 0);
  const budget = TELEPORT_STEP_UNITS * dTicks;
  return dx * dx + dz * dz + dh * dh > budget * budget;
}

/** A stored sample as a pose (grounded defaults for pre-#247 samples). */
function poseOf(s: StoredSample): InterpPose {
  return { x: s.x, z: s.z, fx: s.fx, fz: s.fz, h: s.h ?? 0 };
}
