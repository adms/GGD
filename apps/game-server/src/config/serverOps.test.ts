/**
 * Server-ops resolution (ops-01..ops-06): the game-server side of the admin
 * 系統運維 dynamic config. Covered here:
 *   - a stored value beats the compiled default, key by key (ops-01)
 *   - an UNCONFIGURED platform (`values: {}`) does NOT override the built-in
 *     defaults — the protection carried over from the combat-env bug (ops-02)
 *   - platform down / non-200 / malformed body → fail-safe to the compiled
 *     defaults, never a throw and never a ceiling of 0 (ops-03)
 *   - out-of-range junk from a hand-edited file is dropped, not applied (ops-04)
 *   - GGD_SERVER_OPS_BYPASS skips the network entirely (ops-05)
 *   - ServerOpsCache: a burst of match creations shares one fetch (ops-06)
 *   - a platform OUTAGE holds the last known good table instead of reverting to
 *     the compiled defaults — a config outage is not a behaviour change (ops-07)
 *   - a snapshot rate the shipped client fleet cannot absorb is refused by the
 *     shard itself, not only by the platform's write path (ops-08)
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { SNAPSHOT_HZ } from "@ggd/shared/constants";
import {
  DEFAULT_MAX_ROOMS,
  MAX_ROOM_CAPACITY,
  MIN_ROOM_CAPACITY,
} from "../rooms/roomRegistry";
import {
  SERVER_OPS_KEYS,
  SERVER_OPS_SPEC,
  SHIPPED_DEFAULTS,
  ServerOpsCache,
  MIN_FLEET_SNAPSHOT_HZ,
  fetchServerOps,
  parseServerOpsDoc,
  type ServerOps,
} from "./serverOps";
import { INTERP_DELAY_MS } from "@ggd/shared/constants";

/** A fetch stub returning the given status/body (or rejecting). */
function fetchStub(status: number, body: unknown): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as Response) as unknown as typeof fetch;
}

const failFetch: typeof fetch = (async () => {
  throw new Error("ECONNREFUSED");
}) as unknown as typeof fetch;

/** A fetch that must never run (bypass tests). */
const bombFetch: typeof fetch = (async () => {
  throw new Error("fetch must not be called");
}) as unknown as typeof fetch;

const doc = (values: Record<string, unknown>): unknown => ({
  version: 1,
  updatedAt: "2026-07-23T00:00:00Z",
  values,
});

/** Fixed compiled defaults, so the tests do not depend on the ambient env. */
const DEFAULTS: ServerOps = { maxRooms: 200, snapshotHz: 30 };

describe("server-ops: the shipped defaults", () => {
  it("ops-00: the shipped room ceiling is the owner's 50, and the snapshot default follows the shared constant", () => {
    cover("ops-00");
    // The owner asked for 200 → 50. This is the number a deploy with no env var
    // and no platform actually runs on.
    expect(DEFAULT_MAX_ROOMS).toBe(50);
    expect(SHIPPED_DEFAULTS.maxRooms).toBe(50);
    // NEVER a literal: whatever the netcode work lands in @ggd/shared/constants
    // is the default this table starts from (the Go drift guard asserts the
    // platform advertises the same number).
    expect(SHIPPED_DEFAULTS.snapshotHz).toBe(SNAPSHOT_HZ);
    expect(SERVER_OPS_KEYS).toEqual(["maxRooms", "snapshotHz"]);
    expect(SERVER_OPS_SPEC.maxRooms.min).toBe(MIN_ROOM_CAPACITY);
    expect(SERVER_OPS_SPEC.maxRooms.max).toBe(MAX_ROOM_CAPACITY);
  });
});

describe("server-ops resolve: merge + fail-safe", () => {
  it("ops-01: a stored value beats the compiled default, key by key", async () => {
    cover("ops-01");
    const ops = await fetchServerOps("http://platform", {
      bypass: false,
      defaults: DEFAULTS,
      fetchImpl: fetchStub(200, doc({ maxRooms: 50 })),
    });
    expect(ops.maxRooms).toBe(50);
    // snapshotHz was not stored, so the compiled/env value stands.
    expect(ops.snapshotHz).toBe(DEFAULTS.snapshotHz);
  });

  it("ops-02: an UNCONFIGURED platform does not override the built-in defaults", async () => {
    cover("ops-02");
    // `values: {}` is what the platform serves when no operator has ever saved.
    // If it served a defaults-filled table instead, THIS shard — deliberately
    // started with GGD_MAX_ROOMS=200 — would silently drop to the platform's
    // idea of the number the moment it could reach a fresh platform. That is the
    // exact failure that reset every content-authored combat multiplier.
    const ops = await fetchServerOps("http://platform", {
      bypass: false,
      defaults: DEFAULTS,
      fetchImpl: fetchStub(200, doc({})),
    });
    expect(ops).toEqual(DEFAULTS);
  });

  it("ops-03: platform down / non-200 / malformed body → compiled defaults, never a throw", async () => {
    cover("ops-03");
    for (const impl of [
      failFetch,
      fetchStub(500, {}),
      fetchStub(200, { nonsense: true }),
      fetchStub(200, null),
      fetchStub(200, { values: null }),
    ]) {
      const ops = await fetchServerOps("http://platform", {
        bypass: false,
        defaults: DEFAULTS,
        fetchImpl: impl,
      });
      expect(ops).toEqual(DEFAULTS);
      // A config outage must never become a match outage: a ceiling of 0 would
      // make every single match creation throw.
      expect(ops.maxRooms).toBeGreaterThanOrEqual(MIN_ROOM_CAPACITY);
    }
  });

  it("ops-04: out-of-range or wrong-typed values from a hand-edited file are dropped", async () => {
    cover("ops-04");
    const ops = await fetchServerOps("http://platform", {
      bypass: false,
      defaults: DEFAULTS,
      fetchImpl: fetchStub(
        200,
        doc({ maxRooms: 0, snapshotHz: 5, bogus: 9 }),
      ),
    });
    // 0 rooms (outage) and 5 Hz (below TICK_HZ/2) are both refused here as well
    // as at the platform's PUT — a file on disk must not be able to install what
    // the API would reject.
    expect(ops).toEqual(DEFAULTS);

    expect(parseServerOpsDoc(doc({ maxRooms: 99999 }))).toEqual({});
    expect(parseServerOpsDoc(doc({ maxRooms: 12.5 }))).toEqual({});
    expect(parseServerOpsDoc(doc({ maxRooms: "50" }))).toEqual({});
    expect(parseServerOpsDoc(doc({ maxRooms: 50 }))).toEqual({ maxRooms: 50 });
    expect(parseServerOpsDoc({ values: null })).toBeNull();
  });

  it("ops-05: GGD_SERVER_OPS_BYPASS skips the network entirely", async () => {
    cover("ops-05");
    const ops = await fetchServerOps("http://platform", {
      bypass: true,
      defaults: DEFAULTS,
      fetchImpl: bombFetch,
    });
    expect(ops).toEqual(DEFAULTS);
  });

  it("ops-06: the cache shares one fetch across a burst, and expiry refetches", async () => {
    cover("ops-06");
    let calls = 0;
    const counting: typeof fetch = (async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => doc({ maxRooms: 50 }),
      } as Response;
    }) as unknown as typeof fetch;

    const cache = new ServerOpsCache("http://platform", 5_000, {
      bypass: false,
      defaults: DEFAULTS,
      fetchImpl: counting,
    });
    const [a, b, c] = await Promise.all([cache.get(0), cache.get(0), cache.get(0)]);
    expect(calls).toBe(1);
    expect(a.maxRooms).toBe(50);
    expect(b).toEqual(a);
    expect(c).toEqual(a);

    await cache.get(4_999);
    expect(calls).toBe(1);
    await cache.get(5_001);
    expect(calls).toBe(2);
  });

  it("ops-07: a platform OUTAGE keeps the last known good table, it does not revert", async () => {
    cover("ops-07");
    // The scar this pins: the cache used to overwrite itself with the compiled
    // defaults on any failed refresh. An operator who lowered the ceiling on a
    // shard whose env says 200 would have had it silently quadrupled back —
    // restoring the exact CPU exhaustion the cap exists to prevent — by a
    // platform hiccup, with nothing on any screen saying so. A CONFIG outage
    // must not be a BEHAVIOUR change.
    let down = false;
    const flaky: typeof fetch = (async () => {
      if (down) throw new Error("ECONNREFUSED");
      return { ok: true, status: 200, json: async () => doc({ maxRooms: 50 }) } as Response;
    }) as unknown as typeof fetch;

    const cache = new ServerOpsCache("http://platform", 1_000, {
      bypass: false,
      defaults: DEFAULTS,
      fetchImpl: flaky,
    });
    expect((await cache.get(0)).maxRooms).toBe(50);

    down = true;
    expect((await cache.get(5_000)).maxRooms).toBe(50);
    expect((await cache.get(10_000)).maxRooms).toBe(50);

    // Compiled defaults remain the floor for a process that has NEVER had a
    // good answer — the real fail-safe case, and never a ceiling of 0.
    const cold = new ServerOpsCache("http://platform", 1_000, {
      bypass: false,
      defaults: DEFAULTS,
      fetchImpl: failFetch,
    });
    expect(await cold.get(0)).toEqual(DEFAULTS);
    expect((await cold.get(0)).maxRooms).toBeGreaterThanOrEqual(MIN_ROOM_CAPACITY);
  });

  it("ops-08: a snapshot rate the shipped client fleet cannot absorb is refused HERE too", async () => {
    cover("ops-08");
    // The platform is the write-path guard, but this table arrives over an
    // UNAUTHENTICATED GET. An older platform, a rolled-back one, or a
    // hand-edited data/config/server-ops.json can serve a rate below what the
    // fleet's compiled interpolation delay can ride out — the interpolation
    // buffer freezes rather than extrapolating, so every client stutters. The
    // shard refuses to install it and keeps its compiled default.
    expect(MIN_FLEET_SNAPSHOT_HZ).toBe(
      (() => {
        let hz = Math.ceil(2000 / INTERP_DELAY_MS);
        while (hz > 1 && Math.floor(2000 / (hz - 1)) <= INTERP_DELAY_MS) hz--;
        return hz;
      })(),
    );

    const tooSlow = MIN_FLEET_SNAPSHOT_HZ - 1;
    expect(parseServerOpsDoc(doc({ snapshotHz: tooSlow }))).toEqual({});
    const ops = await fetchServerOps("http://platform", {
      bypass: false,
      defaults: DEFAULTS,
      fetchImpl: fetchStub(200, doc({ snapshotHz: tooSlow })),
    });
    expect(ops.snapshotHz).toBe(DEFAULTS.snapshotHz);

    // The legal boundary value still gets through.
    expect(parseServerOpsDoc(doc({ snapshotHz: MIN_FLEET_SNAPSHOT_HZ }))).toEqual({
      snapshotHz: MIN_FLEET_SNAPSHOT_HZ,
    });
  });
});
