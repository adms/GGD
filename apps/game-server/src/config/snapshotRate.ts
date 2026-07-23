/**
 * Snapshot (Colyseus patch) rate resolution.
 *
 * WHY THIS FILE EXISTS. Until now nothing in the repo ever assigned
 * `Room.patchRate`, so the broadcast cadence was Colyseus's own
 * DEFAULT_PATCH_RATE (1000/20 = 50 ms). `SNAPSHOT_HZ` in packages/shared was
 * decorative — it had no consumer, and editing it changed nothing on the wire.
 * MatchRoom now assigns the value this module resolves, so the constant is
 * finally authoritative.
 *
 * TUNABLE WITHOUT A REBUILD (deliberately narrow). `GGD_SNAPSHOT_HZ` overrides
 * the compiled default so the next latency adjustment can be a measurement on
 * the real phone-over-wifi setup rather than a deploy. This is safe because the
 * patch rate is pure TRANSPORT: it changes how often the already-computed state
 * is serialized, never what the sim computes. There is exactly ONE code path —
 * resolve a number, assign it — so no determinism surface is added.
 *
 * The clamp is not decoration. Below TICK_HZ/2 the interpolation buffer's
 * two-interval cushion would exceed any sane INTERP_DELAY_MS; above TICK_HZ we
 * would serialize the same tick twice and pay bandwidth for zero new
 * information (Colyseus would emit empty/duplicate patches).
 */
import { SNAPSHOT_HZ, TICK_HZ } from "@ggd/shared/constants";

/** Lowest useful broadcast rate: half the sim rate. */
export const MIN_SNAPSHOT_HZ = TICK_HZ / 2;
/** Highest useful broadcast rate: the sim rate — every tick is already sent. */
export const MAX_SNAPSHOT_HZ = TICK_HZ;

/**
 * Resolve the effective snapshot rate (Hz) from an env bag.
 * Absent / unparseable / out-of-range → the compiled SNAPSHOT_HZ default.
 * Pure: takes the env explicitly so it is unit-testable.
 */
export function resolveSnapshotHz(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.GGD_SNAPSHOT_HZ;
  if (raw === undefined || raw === "") return SNAPSHOT_HZ;
  const n = Number(raw);
  if (!Number.isFinite(n)) return SNAPSHOT_HZ;
  if (n < MIN_SNAPSHOT_HZ || n > MAX_SNAPSHOT_HZ) return SNAPSHOT_HZ;
  return n;
}

/** Effective milliseconds between snapshot patches — assign to `room.patchRate`. */
export function resolveSnapshotMs(env: NodeJS.ProcessEnv = process.env): number {
  return 1000 / resolveSnapshotHz(env);
}
