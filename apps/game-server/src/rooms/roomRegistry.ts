/**
 * Process-wide concurrent-room cap (availability / DoS).
 *
 * `gameServer.define("match", MatchRoom)` places no ceiling on how many rooms
 * can exist, and each room starts a ~30 Hz sim over 12 seats. Absent a cap, a
 * create-flood (or a legit surge) spins up unbounded ticking sims → CPU/memory
 * exhaustion. This registry is a tiny counter the room acquires in onCreate and
 * releases in onDispose; when the ceiling is reached onCreate throws BEFORE any
 * sim world is allocated, so a refused create costs nothing.
 *
 * THE CEILING IS MUTABLE (task: 後台系統運維). The operator edits `maxRooms` in
 * the admin console; the game-server pushes it here immediately before every
 * `tryAcquire()` (config/serverOps.ts, short-TTL cache). That is why `max` is
 * NOT `readonly` any more and why there is no polling loop: the create path is
 * the ONLY reader of the ceiling in this process, so "live" and "at the next
 * create attempt" are the same instant.
 *
 * LOWERING THE CAP NEVER KILLS A MATCH. `setCapacity` is advisory downward: it
 * moves the admission line, it does not evict. With 63 rooms live and the cap
 * lowered to 50 the process enters a legal DRAINING state — `active` stays 63,
 * `tryAcquire()` refuses every new match, and admission resumes only once 13
 * matches finish on their own and `release()` brings the count under 50. An
 * operator watching /healthz sees `{active: 63, capacity: 50, draining: true}`,
 * which is the honest picture; the alternative (ending 13 games to satisfy a
 * config edit) would make a config field a kill switch.
 *
 * A pure class (with a shared singleton) so the cap logic unit-tests without a
 * Colyseus server.
 */

/** Hard floor for the ceiling. 0 would be a total outage: every create throws. */
export const MIN_ROOM_CAPACITY = 1;
/**
 * Hard ceiling for the ceiling. One Node process cannot tick anywhere near 500
 * rooms (500 × 12 seats at 30 Hz), so this is generous — but it keeps the guard
 * from being deleted outright by a fat-fingered 99999, which is exactly the
 * unbounded-ticking-sims exhaustion the registry exists to prevent.
 */
export const MAX_ROOM_CAPACITY = 500;

export class RoomRegistry {
  private count = 0;
  private max: number;

  constructor(max: number) {
    this.max = clampCapacity(max) ?? MAX_ROOM_CAPACITY;
  }

  /** Rooms currently holding a slot. */
  get active(): number {
    return this.count;
  }

  /** The configured ceiling. */
  get capacity(): number {
    return this.max;
  }

  /**
   * True when more rooms are live than the current ceiling allows — the
   * operator lowered the cap under the live count. No new match starts until
   * the running ones finish; nothing is evicted.
   */
  get draining(): boolean {
    return this.count > this.max;
  }

  /**
   * Move the admission ceiling. Garbage (NaN / 0 / negative / non-integer /
   * past MAX_ROOM_CAPACITY) is REFUSED, not clamped-and-applied: a config
   * outage or a malformed platform body must leave the last known-good ceiling
   * standing rather than silently install a value nobody chose. Returns whether
   * the new capacity was adopted.
   */
  setCapacity(n: number): boolean {
    const next = clampCapacity(n);
    if (next === null) return false;
    this.max = next;
    return true;
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

  /** Operator-facing snapshot (rendered by /healthz and the console). */
  stats(): { active: number; capacity: number; draining: boolean } {
    return { active: this.count, capacity: this.max, draining: this.draining };
  }
}

/** A valid room ceiling, or null when the input is not one. */
export function clampCapacity(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isInteger(n)) return null;
  if (n < MIN_ROOM_CAPACITY || n > MAX_ROOM_CAPACITY) return null;
  return n;
}

/**
 * The SHIPPED ceiling — the value a deploy uses with no env var and no platform.
 * Lowered 200 → 50 per the owner (「GGD_MAX_ROOMS=200 的確可以降低到 50 就好」).
 * The platform's opsenv package advertises the same number as its compiled
 * default; a Go drift test parses this literal and asserts they agree, so the
 * console can never claim a default the server would not actually use.
 */
export const DEFAULT_MAX_ROOMS = 50;

/**
 * BOOT default: the env var is the FLOOR of the resolution chain, so a deploy
 * with no platform behaves exactly as it does today. The platform's stored
 * `maxRooms`, when one exists, overrides this at match creation.
 */
export const MAX_CONCURRENT_ROOMS = ((): number => {
  const raw = Number(process.env.GGD_MAX_ROOMS);
  return clampCapacity(raw) ?? DEFAULT_MAX_ROOMS;
})();

/** The shared, process-wide counter MatchRoom acquires/releases. */
export const roomRegistry = new RoomRegistry(MAX_CONCURRENT_ROOMS);
