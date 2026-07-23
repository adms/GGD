/**
 * Process-wide concurrent-room cap (availability / DoS).
 *
 * `gameServer.define("match", MatchRoom)` places no ceiling on how many rooms
 * can exist, and each room starts a ~60 Hz sim over 12 seats. Absent a cap, a
 * create-flood (or a legit surge) spins up unbounded ticking sims → CPU/memory
 * exhaustion. This registry is a tiny counter the room acquires in onCreate and
 * releases in onDispose; when the ceiling is reached onCreate throws BEFORE any
 * sim world is allocated, so a refused create costs nothing.
 *
 * A pure class (with a shared singleton) so the cap logic unit-tests without a
 * Colyseus server.
 */
export class RoomRegistry {
  private count = 0;

  constructor(private readonly max: number) {}

  /** Rooms currently holding a slot. */
  get active(): number {
    return this.count;
  }

  /** The configured ceiling. */
  get capacity(): number {
    return this.max;
  }

  /** Reserve a slot; false when the process is already at capacity. */
  tryAcquire(): boolean {
    if (this.count >= this.max) return false;
    this.count += 1;
    return true;
  }

  /** Return a previously-acquired slot (idempotent-safe at zero). */
  release(): void {
    if (this.count > 0) this.count -= 1;
  }
}

/** Ceiling, overridable via GGD_MAX_ROOMS; sane default keeps a busy shard alive. */
export const MAX_CONCURRENT_ROOMS = ((): number => {
  const raw = Number(process.env.GGD_MAX_ROOMS);
  return Number.isInteger(raw) && raw > 0 ? raw : 200;
})();

/** The shared, process-wide counter MatchRoom acquires/releases. */
export const roomRegistry = new RoomRegistry(MAX_CONCURRENT_ROOMS);
