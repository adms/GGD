/**
 * Server-ops resolution — the game-server side of the admin 系統運維 dynamic
 * config. It is the SECOND instance of the pattern internal/combatenv proved
 * out (task #28), deliberately identical in shape so there is one mechanism in
 * this repo for "an operator-editable number", not two:
 *
 *   durable JSON truth on the platform  →  public unauthenticated GET
 *   →  short-TTL process cache here     →  resolved ONCE per match creation
 *
 * WHAT IS IN THIS TABLE, AND WHY ONLY THIS. Two numbers, both chosen because
 * changing them cannot alter what the deterministic sim computes:
 *
 *   maxRooms    admission control. A counter consulted only inside onCreate,
 *               before any sim world exists (rooms/roomRegistry.ts). LIVE-SAFE:
 *               the create path is the only reader, so pushing the value in
 *               right before tryAcquire() makes it effective immediately with
 *               no polling loop. Lowering it never evicts a running match.
 *   snapshotHz  transport. Assigned once to Room.patchRate in onCreate; the sim
 *               still steps at TICK_HZ and stays byte-identical (see
 *               config/snapshotRate.ts). NEXT-MATCH-ONLY by construction: a
 *               running match keeps the rate it started with.
 *
 * Everything else an operator might want to see (tick rate, phase durations,
 * the rate-limit policy, the match TTL, the security flags) is deliberately NOT
 * writable here — the platform serves those as READ-ONLY descriptors. The hard
 * boundary: this document arrives over an UNAUTHENTICATED GET, so every value
 * it can carry must have a worst case of "the shard admits fewer matches" or
 * "patches arrive a little slower". The moment a security posture flag
 * (devCheats / whitelistBypass / deployTier) enters this table, an
 * unauthenticated document decides whether cheats are on.
 *
 * ENV IS THE FLOOR, NOT THE OVERRIDE. `GGD_MAX_ROOMS` / `GGD_SNAPSHOT_HZ` are
 * the COMPILED-IN defaults this module starts from, so a deploy with no
 * platform behaves exactly as it does today. A stored platform value wins over
 * the env; an absent one leaves the env value standing.
 *
 * FAIL-SAFE POLICY (copied from config/combatEnv.ts): platform unreachable,
 * non-200, or a malformed body → keep the compiled defaults, warn once, never
 * brick match creation. For maxRooms specifically the fallback is the
 * last-known-good/compiled ceiling — never 0 (which would be a total outage:
 * every match creation throws) and never unbounded (the exhaustion the registry
 * exists to prevent). Set GGD_SERVER_OPS_BYPASS=1 to skip the fetch entirely,
 * matching GGD_COMBAT_ENV_BYPASS.
 */
import { INTERP_DELAY_MS, SNAPSHOT_HZ } from "@ggd/shared/constants";
import {
  DEFAULT_MAX_ROOMS,
  MAX_ROOM_CAPACITY,
  MIN_ROOM_CAPACITY,
  MAX_CONCURRENT_ROOMS,
} from "../rooms/roomRegistry";
import { MAX_SNAPSHOT_HZ, MIN_SNAPSHOT_HZ, resolveSnapshotHz } from "./snapshotRate";
import { PLATFORM_URL, warnOnce } from "./platformUrl";

/** Process-wide bypass: skip the platform fetch (local dev/testing). */
export const SERVER_OPS_BYPASS = process.env.GGD_SERVER_OPS_BYPASS === "1";

/** Short cache TTL so a burst of match creations shares one fetch. */
const DEFAULT_TTL_MS = 5_000;

/**
 * THE SOURCE OF TRUTH for the writable key set. `apps/platform/internal/opsenv`
 * mirrors this list, and a Go drift test (keysync_test.go) regex-parses THIS
 * ARRAY and asserts set equality — the same guard combat-env grew after
 * abilityRange lived in the sim for a whole release without the platform
 * knowing about it, invisible in the console and dropped from every served
 * table. A key added on one side only turns the Go test red.
 */
export const SERVER_OPS_KEYS = ["maxRooms", "snapshotHz"] as const;

export type ServerOpsKey = (typeof SERVER_OPS_KEYS)[number];

/** Bounds + type of one knob. Mirrored by the platform's descriptor list. */
export interface ServerOpsSpec {
  /** compiled default — what a deploy with no stored value uses */
  readonly def: number;
  readonly min: number;
  readonly max: number;
  readonly integer: boolean;
}

/**
 * The spec. Every number here is IMPORTED, never typed twice: snapshotHz's
 * default is `SNAPSHOT_HZ` from @ggd/shared/constants and its bounds are the
 * TICK_HZ-derived MIN/MAX from snapshotRate.ts, so a change to the shared
 * constants moves this table (and, via the drift test, the platform's
 * advertised default) without anyone editing it.
 */
/**
 * The lowest snapshot rate the SHIPPED CLIENT FLEET can absorb, mirroring
 * opsenv.EffectiveMinSnapshotHz on the platform.
 *
 * The interpolation buffer clamps (freezes the remote) rather than
 * extrapolating, so a client needs two snapshot intervals of cushion, and
 * apps/client/src/settings/types.ts derives its slider floor as
 * floor(2 × SNAPSHOT_MS) from the compiled INTERP_DELAY_MS. A served rate below
 * this floor pushes every already-shipped client under its own cushion.
 *
 * It is enforced HERE as well as on the platform on purpose. The platform is
 * the write-path guard, but this process consumes an UNAUTHENTICATED document
 * over the network, and the shard must not install a fleet-stuttering rate just
 * because something upstream served one — an older platform, a rolled-back one,
 * or a hand-edited data/config/server-ops.json.
 */
export const MIN_FLEET_SNAPSHOT_HZ = ((): number => {
  let hz = Math.ceil(2000 / INTERP_DELAY_MS);
  while (hz > 1 && Math.floor(2000 / (hz - 1)) <= INTERP_DELAY_MS) hz--;
  return Math.min(MAX_SNAPSHOT_HZ, Math.max(MIN_SNAPSHOT_HZ, hz));
})();

export const SERVER_OPS_SPEC: Record<ServerOpsKey, ServerOpsSpec> = {
  maxRooms: {
    def: MAX_CONCURRENT_ROOMS,
    min: MIN_ROOM_CAPACITY,
    max: MAX_ROOM_CAPACITY,
    integer: true,
  },
  snapshotHz: {
    def: resolveSnapshotHz(),
    min: MIN_FLEET_SNAPSHOT_HZ,
    max: MAX_SNAPSHOT_HZ,
    integer: false,
  },
};

/** A fully resolved ops table — every key present. */
export type ServerOps = Record<ServerOpsKey, number>;

/** A sparse table as served by the platform (missing key = keep the default). */
export type ServerOpsPartial = Partial<Record<ServerOpsKey, number>>;

/**
 * The compiled defaults: the env floor (GGD_MAX_ROOMS / GGD_SNAPSHOT_HZ) or the
 * shipped constants. This is what a deploy with no platform runs on, and what
 * every fail-safe path returns to.
 */
export function defaultServerOps(): ServerOps {
  return { maxRooms: SERVER_OPS_SPEC.maxRooms.def, snapshotHz: SERVER_OPS_SPEC.snapshotHz.def };
}

/** Shipped defaults, ignoring the environment (what the console advertises). */
export const SHIPPED_DEFAULTS: ServerOps = { maxRooms: DEFAULT_MAX_ROOMS, snapshotHz: SNAPSHOT_HZ };

/**
 * Parse the platform's GET /api/v1/server-ops body into a sparse table,
 * tolerating junk: only known keys with finite in-range values survive. An
 * out-of-range number from a hand-edited file is DROPPED (falls back to the
 * compiled default) rather than applied — the platform validator already
 * rejects those on write, and a config file must never be able to install a
 * ceiling of 0.
 *
 * Returns null only when the envelope itself is unusable, which the caller
 * treats as "the platform said nothing" and fails safe.
 */
export function parseServerOpsDoc(body: unknown): ServerOpsPartial | null {
  if (typeof body !== "object" || body === null) return null;
  const values = (body as Record<string, unknown>).values;
  if (typeof values !== "object" || values === null) return null;
  const src = values as Record<string, unknown>;
  const out: ServerOpsPartial = {};
  for (const k of SERVER_OPS_KEYS) {
    const v = src[k];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const spec = SERVER_OPS_SPEC[k];
    if (v < spec.min || v > spec.max) continue;
    if (spec.integer && !Number.isInteger(v)) continue;
    out[k] = v;
  }
  return out;
}

export interface ServerOpsFetchOpts {
  /** injectable fetch (tests) — defaults to global fetch */
  fetchImpl?: typeof fetch;
  /** override the process bypass flag (tests) */
  bypass?: boolean;
  /** per-request timeout */
  timeoutMs?: number;
  /** override the compiled defaults (tests) */
  defaults?: ServerOps;
}

/**
 * The outcome of one resolution attempt. `ok` distinguishes "the platform
 * answered" from "we fell back", which the cache needs in order to hold the
 * LAST KNOWN GOOD table across an outage instead of silently reverting.
 */
export interface ServerOpsResult {
  ops: ServerOps;
  ok: boolean;
}

/**
 * Resolve the effective ops table once: compiled defaults with the platform's
 * stored values merged OVER them, PER KEY. Never throws — every failure path
 * returns the compiled defaults and warns once.
 *
 * The per-key merge is why the platform must distinguish "never configured"
 * from "configured": an unconfigured platform serves `values: {}` and the
 * compiled defaults stand. If it served a defaults-filled table instead, a
 * fresh platform would silently install ITS idea of every number over this
 * process's env configuration — the exact bug that reset every content-authored
 * combat multiplier.
 */
export async function fetchServerOpsResult(
  baseUrl: string,
  opts: ServerOpsFetchOpts = {},
): Promise<ServerOpsResult> {
  const defaults = opts.defaults ?? defaultServerOps();
  const bypass = opts.bypass ?? SERVER_OPS_BYPASS;
  // A bypass is a deliberate configuration, not a failure: the compiled
  // defaults ARE the answer, and there is nothing to hold on to.
  if (bypass) return { ops: { ...defaults }, ok: true };

  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/server-ops`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 3_000);
  try {
    const res = await doFetch(url, { signal: controller.signal });
    if (!res.ok) {
      warnOnce(
        "server-ops-status",
        `[server-ops] platform returned ${res.status} for ${url} — FAILING SAFE to the last known ` +
          `good table, or the compiled defaults (maxRooms=${defaults.maxRooms}, ` +
          `snapshotHz=${defaults.snapshotHz}). Fix the platform or set GGD_SERVER_OPS_BYPASS=1.`,
      );
      return { ops: { ...defaults }, ok: false };
    }
    const stored = parseServerOpsDoc(await res.json());
    if (!stored) {
      warnOnce(
        "server-ops-malformed",
        `[server-ops] malformed body from ${url} — FAILING SAFE to the last known good table.`,
      );
      return { ops: { ...defaults }, ok: false };
    }
    return { ops: { ...defaults, ...stored }, ok: true };
  } catch (err) {
    warnOnce(
      "server-ops-unreachable",
      `[server-ops] could not reach the platform at ${url} — FAILING SAFE to the last known good ` +
        `table (admin 系統運維 settings NOT re-read).`,
      err,
    );
    return { ops: { ...defaults }, ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/** `fetchServerOpsResult` without the outcome flag. */
export async function fetchServerOps(
  baseUrl: string,
  opts: ServerOpsFetchOpts = {},
): Promise<ServerOps> {
  return (await fetchServerOpsResult(baseUrl, opts)).ops;
}

/**
 * A tiny TTL cache so a burst of match creations shares one fetch. Each match
 * still resolves its own frozen values via get(); within the TTL window the
 * same table is reused. Never throws (fetchServerOps fails safe).
 *
 * There is deliberately NO background polling: onCreate is the only reader of
 * both knobs, so refreshing at the create attempt IS "live".
 */
export class ServerOpsCache {
  private cached: ServerOps | null = null;
  /** The last table the platform actually SERVED (never a fallback). */
  private lastGood: ServerOps | null = null;
  private expiresAt = 0;
  private inflight: Promise<ServerOps> | null = null;

  constructor(
    private readonly baseUrl: string = PLATFORM_URL,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly opts: ServerOpsFetchOpts = {},
  ) {}

  async get(now: number = Date.now()): Promise<ServerOps> {
    if (this.cached && now < this.expiresAt) return this.cached;
    if (this.inflight) return this.inflight;
    const expiresAt = now + this.ttlMs;
    this.inflight = fetchServerOpsResult(this.baseUrl, this.opts)
      .then(({ ops, ok }) => {
        // A CONFIG OUTAGE MUST NOT BE A BEHAVIOUR CHANGE. When the platform
        // answered, its table becomes both the cache and the last known good.
        // When it did NOT, we keep serving the last table it gave us rather
        // than snapping back to the compiled defaults: an operator who raised
        // the ceiling for a tournament would otherwise have it silently
        // dropped the moment the platform hiccuped, and one who lowered it on
        // a shard whose env says 200 would have the cap he set for CPU
        // headroom silently quadrupled — by an outage, with nothing asking.
        // Compiled defaults remain the floor for a process that has NEVER had
        // a good answer, which is the real fail-safe case.
        const effective = ok ? ops : (this.lastGood ?? ops);
        if (ok) this.lastGood = ops;
        this.cached = effective;
        this.expiresAt = expiresAt;
        return effective;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  /** Drop the cache (tests / forced refresh). Keeps the last known good. */
  invalidate(): void {
    this.cached = null;
    this.expiresAt = 0;
  }

  /** Forget everything, including the last known good (tests). */
  reset(): void {
    this.invalidate();
    this.lastGood = null;
  }
}

// ------------------------------------------------------- trusted resolution --

/**
 * Test-only override for the resolved table.
 *
 * IT IS A MODULE EXPORT, NOT A FIELD ON THE ROOM'S OPTIONS BAG, AND THAT IS THE
 * WHOLE POINT. `MatchRoom.onCreate` receives options straight from the client
 * that created the room — that is exactly why it has to verify
 * `options.createToken` — so anything read out of that bag in a deploy WITHOUT
 * a shared secret (dev, and the LAN/family deploys this project actually ships
 * to) is attacker-controlled. `maxRooms` is not per-match state: it moves the
 * PROCESS-WIDE admission ceiling and outlives the room that set it. A client
 * sending `{serverOps: {maxRooms: 1}}` would pin the whole shard at one
 * concurrent match for everybody; `{maxRooms: 500}` would delete the DoS guard
 * the registry exists to be. A module export cannot be reached over the wire.
 */
let opsOverrideForTests: ServerOps | null = null;

/** Install (or clear, with null) the test override. */
export function setServerOpsForTests(ops: ServerOpsPartial | null): void {
  opsOverrideForTests = ops ? { ...defaultServerOps(), ...normalizeServerOps(ops) } : null;
}

/**
 * Clamp an ops table to the spec, dropping anything out of range or of the
 * wrong type — the same tolerance `parseServerOpsDoc` applies to the wire.
 */
export function normalizeServerOps(input: ServerOpsPartial): ServerOpsPartial {
  const out: ServerOpsPartial = {};
  for (const k of SERVER_OPS_KEYS) {
    const v = input[k];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const spec = SERVER_OPS_SPEC[k];
    if (v < spec.min || v > spec.max) continue;
    if (spec.integer && !Number.isInteger(v)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * THE ONLY resolution MatchRoom uses. Trusted by construction: the values come
 * from the platform (or the compiled/env defaults), never from the caller.
 */
export async function resolveServerOps(): Promise<ServerOps> {
  if (opsOverrideForTests) return { ...opsOverrideForTests };
  if (SERVER_OPS_BYPASS) return defaultServerOps();
  return sharedServerOpsCache().get();
}

/**
 * The process-wide cache used by MatchRoom. Constructed lazily so tests can
 * import the module without a platform running.
 */
let sharedCache: ServerOpsCache | null = null;
export function sharedServerOpsCache(): ServerOpsCache {
  if (!sharedCache) sharedCache = new ServerOpsCache();
  return sharedCache;
}
