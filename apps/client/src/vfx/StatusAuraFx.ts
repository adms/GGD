/**
 * StatusAuraFx — pulsed status-effect body visuals (task #39, item 3).
 *
 * Feed it `set(entityId, flags, x, z)` each frame for every live entity and
 * `update(nowMs)` once, and each CC'd champion grows the aura for its status.
 * Pulsed rather than continuously emitted, so it rides the ordinary BurstPool:
 *   · no per-entity ParticleSystem to start/stop/leak,
 *   · an entity that despawns mid-stun simply stops being set and goes quiet
 *     on the next `update` (see `forget`/the stale sweep),
 *   · pooled systems are shared by every entity with the same status, since a
 *     pulse only needs the emitter re-pointed.
 *
 * WIRING (one line, deliberately left to the owner of the render loop): the
 * authoritative `flags` bitmask already ships in EntitySchema, so all this
 * needs is the game loop calling `set(id, es.flags, x, z)` inside the same
 * per-entity pass that already updates the champion anchors. Until it does,
 * `activeCount` stays 0 and this layer costs nothing.
 */
import type { Scene } from "@babylonjs/core/scene";
import { BurstPool, type PresetSystemOptions } from "./vfxPresets";
import { statusAura, statusesFrom, type StatusKind } from "./statusPresets";

/** Entities not `set` for this long are dropped (despawn / death safety net). */
export const STALE_MS = 400;

/**
 * Free-list size per status. ONE pooled system can serve many entities —
 * Babylon particles are simulated in WORLD space, so a particle keeps the
 * position it was born at even when the emitter is later re-pointed at another
 * champion. The free-list therefore only has to cover CAPACITY (a system holds
 * ~2 pulses), not concurrency; 6 gives a 12-player brawl comfortable headroom
 * and degrades gracefully (the oldest pulse is dropped) beyond it.
 */
export const MAX_AURA_SYSTEMS = 6;

interface Tracked {
  x: number;
  z: number;
  seenMs: number;
  /** per-status next-pulse timestamp */
  nextMs: Partial<Record<StatusKind, number>>;
  statuses: StatusKind[];
}

export class StatusAuraFx {
  private readonly pool: BurstPool;
  private readonly tracked = new Map<number, Tracked>();

  constructor(
    scene: Scene,
    private readonly opts: PresetSystemOptions & { scale?: number } = {},
  ) {
    this.pool = new BurstPool(scene, { maxPerKey: MAX_AURA_SYSTEMS, ...opts });
  }

  /** Entities currently showing at least one status aura (test seam). */
  get activeCount(): number {
    let n = 0;
    for (const t of this.tracked.values()) if (t.statuses.length > 0) n++;
    return n;
  }

  /** Pooled systems held for a status (test seam). */
  countFor(kind: StatusKind): number {
    return this.pool.countFor(`status/${kind}`);
  }

  /**
   * Report an entity's authoritative flags + rendered position for this frame.
   * Cheap and idempotent — safe to call for every entity every frame.
   */
  set(id: number, flags: number, x: number, z: number, nowMs: number): void {
    const statuses = statusesFrom(flags);
    let t = this.tracked.get(id);
    if (!t) {
      if (statuses.length === 0) return; // nothing to track for a healthy entity
      t = { x, z, seenMs: nowMs, nextMs: {}, statuses };
      this.tracked.set(id, t);
    }
    t.x = x;
    t.z = z;
    t.seenMs = nowMs;
    t.statuses = statuses;
  }

  /** Stop tracking an entity immediately (death / despawn). */
  forget(id: number): void {
    this.tracked.delete(id);
  }

  /**
   * Fire any pulses that came due, drop stale entities, reap idle systems.
   * Call once per frame AFTER the per-entity `set` pass.
   */
  update(nowMs: number): void {
    const scale = this.opts.scale ?? 1;
    for (const [id, t] of this.tracked) {
      if (nowMs - t.seenMs > STALE_MS || t.statuses.length === 0) {
        // no longer reported (despawned) or no longer CC'd — stop pulsing
        if (nowMs - t.seenMs > STALE_MS) this.tracked.delete(id);
        continue;
      }
      for (const kind of t.statuses) {
        const due = t.nextMs[kind] ?? -Infinity;
        if (nowMs < due) continue;
        const aura = statusAura(kind);
        t.nextMs[kind] = nowMs + aura.repeatMs;
        this.pool.fireAt(`status/${kind}`, aura.spec, t.x, t.z, aura.y, nowMs, scale);
      }
    }
    this.pool.update(nowMs);
  }

  dispose(): void {
    this.pool.dispose();
    this.tracked.clear();
  }
}
