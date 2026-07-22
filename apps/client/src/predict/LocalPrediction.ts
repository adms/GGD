/**
 * LocalPrediction — client-side prediction for the LOCAL champion only.
 * Mirrors a tiny SimWorld containing just the local entity and steps it with
 * the SAME shared orderSystem + movementSystem (and the same arena zones) the
 * server runs, so predicted movement matches the authority bit-for-bit.
 *
 * Reconciliation: on every authoritative update we snap the shadow entity to
 * the server position, re-apply the newest ACKED order (it keeps steering the
 * server after the ack), then replay all unacked inputs — each input replays
 * the number of prediction ticks it was active for. The visual error between
 * old and corrected prediction is absorbed into an offset that decays
 * exponentially (~100 ms half-life) so corrections never pop.
 *
 * RENDER INTERPOLATION (task #43): the sim advances in fixed 30 Hz ticks but
 * the display runs at 60–144 Hz, so rendering the RAW tick position makes the
 * hero jump a whole tick-step on one frame and stand still on the next (a
 * measured 20:1 per-frame speed ratio = the reported walking judder). We keep
 * the position from BEFORE the last tick and `renderPose` blends prev→cur by a
 * render alpha (the caller's fixed-step leftover / TICK_MS).
 *
 * Interpolate, don't extrapolate — and why: blending prev→cur renders the local
 * hero at most one tick (33 ms) in the past, which is far below the perceptual
 * threshold for click-to-move and is exactly what remote entities already do
 * (they render 100 ms in the past via InterpolationBuffer). Extrapolating the
 * current tick FORWARD by alpha·velocity would keep input latency at zero but
 * overshoots on every direction change and pushes the hero through walls that
 * the shared collision step has already resolved — i.e. it would invent
 * positions the sim never produced. Facing is deliberately NOT interpolated
 * here: it is taken from the current tick so aim stays latency-free, and
 * ChampionView.stepFacing nlerp-smooths the yaw downstream anyway.
 *
 * Pure TS — no Babylon, no network, unit-testable. This file only ever READS
 * sim state; the blend result is a render value that is never written back.
 */
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { orderSystem } from "@ggd/shared/sim/systems/OrderSystem";
import { movementSystem } from "@ggd/shared/sim/systems/MovementSystem";
import { SKELETON_ARENA, type ArenaDef } from "@ggd/shared/sim/world/ArenaDef";
import { asSeatId, type ChampionId, type EntityId, type SeatId, type TeamId } from "@ggd/shared/ids";
import { Stat, zeroStats } from "@ggd/shared/sim/stats/statTypes";
import type { IntentFrame, Order } from "@ggd/shared/sim/intents";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";

/** Wrap-aware uint16 sequence compare: is `a` <= `b`? */
export function seqLE(a: number, b: number): boolean {
  return (b - a + 65536) % 65536 < 32768;
}

interface HistoryEntry {
  seq: number;
  order: Order;
  /** prediction ticks stepped while this was the newest order */
  ticks: number;
  /** whether the order has been fed into orderSystem yet */
  applied: boolean;
}

export interface LocalChampionSetup {
  seatId: number;
  pos: Vec2;
  zone: number;
  radius?: number;
  moveSpeed: number;
  /**
   * Effective Stat.AttackRange. REQUIRED for parity: `orderSystem` stops an
   * attack-target chase at a fraction of the attacker's reach, so a shadow left
   * at range 0 predicts a walk into body contact while the server holds at
   * range — a permanent reconcile snap on the local hero.
   */
  attackRange?: number;
}

export interface RenderPose {
  x: number;
  z: number;
  fx: number;
  fz: number;
}

export class LocalPrediction {
  readonly world: SimWorld;
  private id: EntityId | null = null;
  private seatId: SeatId = asSeatId(0);
  private history: HistoryEntry[] = [];
  /** newest acked order — still steering the server after its ack */
  private baseOrder: Order | null = null;
  /** visual error offset (decays exponentially) */
  private err: Vec2 = { x: 0, z: 0 };
  /** position BEFORE the most recent tick — the `a` end of the render blend */
  private prevPos: Vec2 = { x: 0, z: 0 };
  /**
   * Render alpha the last `renderPose` call used. `reconcile` re-anchors the
   * error offset at this same blend phase so a correction cannot silently eat
   * (or double) the one-tick interpolation lag; without it the lag would be
   * folded into `err` on every snapshot (~20 Hz) and accumulate.
   */
  private lastAlpha = 1;

  constructor(
    arena: ArenaDef = SKELETON_ARENA,
    private readonly errorHalfLifeMs = 100,
  ) {
    this.world = new SimWorld(arena, 1);
  }

  get active(): boolean {
    return this.id !== null;
  }

  /** (Re)create the shadow entity for the local champion. */
  spawn(setup: LocalChampionSetup): void {
    if (this.id !== null) this.world.destroy(this.id);
    const id = this.world.spawn();
    this.world.transform.set(id, {
      pos: { x: setup.pos.x, z: setup.pos.z },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: setup.radius ?? 0.6,
      zone: setup.zone,
    });
    this.seatId = asSeatId(setup.seatId);
    this.world.team.set(id, { teamId: 0 as TeamId, seatId: this.seatId });
    this.world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null });
    this.world.status.set(id, { effects: [] });
    this.world.health.set(id, { hp: 1, maxHp: 1, mana: 0, maxMana: 0, alive: true, shields: [] });
    const final = zeroStats();
    final[Stat.MoveSpeed] = setup.moveSpeed;
    final[Stat.AttackRange] = setup.attackRange ?? 0;
    this.world.stats.set(id, {
      championId: "" as ChampionId,
      final,
      dirty: false,
      sources: [],
    });
    this.id = id;
    this.history = [];
    this.baseOrder = null;
    this.err = { x: 0, z: 0 };
    // SNAP, never glide: a fresh spawn has no previous tick to blend from.
    this.prevPos = { x: setup.pos.x, z: setup.pos.z };
    this.lastAlpha = 1;
  }

  despawn(): void {
    if (this.id !== null) this.world.destroy(this.id);
    this.id = null;
    this.history = [];
    this.baseOrder = null;
  }

  /** Keep the shadow's speed in sync with authoritative stat changes. */
  setMoveSpeed(unitsPerSec: number): void {
    if (this.id === null) return;
    const stats = this.world.stats.get(this.id);
    if (stats) stats.final[Stat.MoveSpeed] = unitsPerSec;
  }

  /** Keep the shadow's attack reach in sync (chase stop distance — see spawn). */
  setAttackRange(units: number): void {
    if (this.id === null) return;
    const stats = this.world.stats.get(this.id);
    if (stats) stats.final[Stat.AttackRange] = units;
  }

  /** Hard teleport (round reset / zone change): snap and forget history. */
  teleport(pos: Vec2, zone: number): void {
    if (this.id === null) return;
    const t = this.world.transform.get(this.id)!;
    t.pos = { x: pos.x, z: pos.z };
    t.zone = zone;
    t.vel = { x: 0, z: 0 };
    const nav = this.world.nav.get(this.id)!;
    nav.order = null;
    nav.moveTarget = null;
    nav.attackTarget = null;
    nav.override = null;
    this.history = [];
    this.baseOrder = null;
    this.err = { x: 0, z: 0 };
    // SNAP, never glide: respawn / round reset / zone change must NOT smear the
    // hero across the arena, so collapse the blend segment onto the new spot.
    this.prevPos = { x: pos.x, z: pos.z };
    this.lastAlpha = 1;
  }

  /** Record an order the IntentSender just transmitted with `seq`. */
  recordInput(seq: number, order: Order): void {
    this.history.push({ seq, order, ticks: 0, applied: false });
  }

  /** Advance the shadow world one fixed tick (30 Hz). */
  stepTick(): void {
    if (this.id === null) return;
    const cur = this.history[this.history.length - 1];
    let newOrder: Order | undefined;
    if (cur && !cur.applied) {
      newOrder = cur.order;
      cur.applied = true;
    }
    this.tickOnce(newOrder);
    if (cur) cur.ticks++;
  }

  /** Authoritative update: snap → drop acked → replay unacked. */
  reconcile(authPos: Vec2, ackSeq: number): void {
    if (this.id === null) return;
    const t = this.world.transform.get(this.id)!;
    const nav = this.world.nav.get(this.id)!;
    // What we ACTUALLY drew last frame — the blended pose, not the raw tick.
    const a0 = this.lastAlpha;
    const shownBefore = {
      x: this.prevPos.x + (t.pos.x - this.prevPos.x) * a0 + this.err.x,
      z: this.prevPos.z + (t.pos.z - this.prevPos.z) * a0 + this.err.z,
    };
    const beforeSnap = { x: t.pos.x, z: t.pos.z };
    let replayed = 0;

    // absorb acked inputs — the newest acked order keeps steering the server
    let i = 0;
    while (i < this.history.length && seqLE(this.history[i]!.seq, ackSeq)) {
      this.baseOrder = this.history[i]!.order;
      i++;
    }
    if (i > 0) this.history = this.history.slice(i);

    // snap the shadow to the authority
    t.pos = { x: authPos.x, z: authPos.z };
    t.vel = { x: 0, z: 0 };
    nav.order = null;
    nav.moveTarget = null;
    nav.attackTarget = null;
    nav.override = null;

    if (this.baseOrder) this.applyOrderOnly(this.baseOrder);

    // replay unacked inputs: each replays the ticks it was active for
    for (const e of this.history) {
      if (e.ticks === 0) {
        // recorded but not yet stepped — just (re)stage the order
        this.applyOrderOnly(e.order);
        e.applied = true;
        continue;
      }
      for (let k = 0; k < e.ticks; k++) {
        this.tickOnce(k === 0 ? e.order : undefined);
        replayed++;
      }
      e.applied = true;
    }

    // Re-anchor the render blend on the CORRECTED stream.
    //  - replayed > 0: `tickOnce` already rewrote `prevPos` to the position
    //    before the last replayed tick, so the prev→cur segment is correct.
    //  - replayed === 0 (everything acked, nothing to re-simulate): translate
    //    prevPos by the same correction the snap applied, which preserves the
    //    segment's length/direction — i.e. the rendered SPEED — instead of
    //    collapsing it and stalling the hero for a frame.
    const after = this.world.transform.get(this.id)!.pos;
    if (replayed === 0) {
      this.prevPos = {
        x: this.prevPos.x + (after.x - beforeSnap.x),
        z: this.prevPos.z + (after.z - beforeSnap.z),
      };
    }
    // Keep the rendered position continuous ACROSS the correction: compare the
    // last drawn pose against the corrected stream sampled at the SAME blend
    // phase. The residual decays exponentially, so corrections never pop and
    // the one-tick interpolation lag is not mistaken for prediction error.
    this.err = {
      x: shownBefore.x - (this.prevPos.x + (after.x - this.prevPos.x) * a0),
      z: shownBefore.z - (this.prevPos.z + (after.z - this.prevPos.z) * a0),
    };
  }

  /** Raw (unsmoothed) predicted position — what the tests compare. */
  get predictedPos(): Vec2 | null {
    if (this.id === null) return null;
    const t = this.world.transform.get(this.id);
    return t ? { x: t.pos.x, z: t.pos.z } : null;
  }

  get facing(): Vec2 | null {
    if (this.id === null) return null;
    const t = this.world.transform.get(this.id);
    return t ? { x: t.facing.x, z: t.facing.z } : null;
  }

  get zone(): number {
    if (this.id === null) return 0;
    return this.world.transform.get(this.id)?.zone ?? 0;
  }

  /** Error magnitude (units) — used to detect teleports vs. drift upstream. */
  errorTo(authPos: Vec2): number {
    const p = this.predictedPos;
    if (!p) return 0;
    const dx = authPos.x - p.x;
    const dz = authPos.z - p.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /**
   * Smoothed pose for rendering; decays the correction offset by `dtMs`.
   *
   * `alpha` is the caller's fixed-step leftover (predAccumMs / TICK_MS) — how
   * far the render clock has advanced INTO the tick that has not run yet — and
   * is clamped to [0,1]. alpha = 1 (the default) reproduces the old raw-tick
   * behaviour, which is what the settlement freeze wants (the hero is pinned on
   * the authority) and what the parity tests assert.
   *
   * Settle-at-rest is exact: when the sim is idle prevPos === t.pos, so the
   * blend returns that position for every alpha — no creep, no overshoot. The
   * error offset also hard-zeroes below 1e-3 u, so a stopped hero lands on the
   * authoritative position bit-for-bit rather than asymptotically near it.
   *
   * NOTE: read-only w.r.t. the sim. Nothing here writes `t.pos`; the blended
   * value exists only in the returned RenderPose, so the shared-sim state (and
   * therefore same-seed replay determinism) is untouched.
   */
  renderPose(dtMs: number, alpha = 1): RenderPose | null {
    if (this.id === null) return null;
    const t = this.world.transform.get(this.id)!;
    const a = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha;
    this.lastAlpha = a;
    const decay = Math.pow(0.5, dtMs / this.errorHalfLifeMs);
    this.err.x *= decay;
    this.err.z *= decay;
    if (Math.abs(this.err.x) < 1e-3) this.err.x = 0;
    if (Math.abs(this.err.z) < 1e-3) this.err.z = 0;
    const px = this.prevPos.x + (t.pos.x - this.prevPos.x) * a;
    const pz = this.prevPos.z + (t.pos.z - this.prevPos.z) * a;
    return { x: px + this.err.x, z: pz + this.err.z, fx: t.facing.x, fz: t.facing.z };
  }

  /** Position the render blend starts from (before the last tick) — tests. */
  get prevTickPos(): Vec2 | null {
    return this.id === null ? null : { x: this.prevPos.x, z: this.prevPos.z };
  }

  /** One shared-sim tick: orderSystem → movementSystem (the server's order). */
  private tickOnce(order?: Order): void {
    // Snapshot the pre-integration position for the render blend. This lives in
    // `tickOnce` (not `stepTick`) on purpose: a single render frame may run 0,
    // 1 or 2+ ticks, and the alpha must interpolate across the LAST tick that
    // executed — the same reason reconcile's replay leaves it correctly set.
    const t0 = this.world.transform.get(this.id!);
    if (t0) this.prevPos = { x: t0.pos.x, z: t0.pos.z };
    const intents = new Map<SeatId, IntentFrame>();
    intents.set(this.seatId, { order, commands: [] });
    this.world.rebuildGrid();
    orderSystem(this.world, intents);
    movementSystem(this.world);
    this.world.tick++;
  }

  /** Stage an order into nav state without integrating movement. */
  private applyOrderOnly(order: Order): void {
    const intents = new Map<SeatId, IntentFrame>();
    intents.set(this.seatId, { order, commands: [] });
    orderSystem(this.world, intents);
  }
}
