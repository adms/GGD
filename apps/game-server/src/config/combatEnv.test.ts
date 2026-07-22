/**
 * Combat-env resolution (env-20..env-25): the game-server side of the admin
 * 戰鬥系統 dynamic config. Covered here:
 *   - admin override beats the content default, key by key (env-20)
 *   - platform down / non-200 / malformed body → fail-safe to content
 *     defaults, never a throw (env-21)
 *   - GGD_COMBAT_ENV_BYPASS skips the network entirely (env-22)
 *   - junk keys/values from the platform are dropped by the normalize pass
 *     (env-23)
 *   - CombatEnvCache: a burst of match creations shares one fetch; expiry
 *     refetches (env-24)
 *   - the resolved table is what MatchController snapshots into the sim
 *     (env-25 — the room-create merge path minus the Colyseus transport)
 */
import { describe, it, expect, afterEach } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { DEFAULT_COMBAT_ENV } from "@ggd/shared/sim/combatEnv";
import { Configs } from "@ggd/shared/content";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { MatchController, type SeatSpec } from "../match/MatchController";
import { DEFAULT_PHASE_CONFIG } from "../match/PhaseMachine";
import { DEFAULT_ARENA_RULES } from "../match/arenaRules";
import {
  CombatEnvCache,
  contentCombatEnv,
  fetchCombatEnv,
  parseCombatEnvDoc,
} from "./combatEnv";

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

const adminDoc = (multipliers: Record<string, unknown>): unknown => ({
  version: 1,
  updatedAt: "2026-07-22T00:00:00Z",
  multipliers,
});

afterEach(() => {
  Configs.clear();
});

describe("combat-env resolve: merge + fail-safe", () => {
  it("env-20: admin override beats the content default, key by key", async () => {
    cover("combatenv-resolve-merge");
    const table = await fetchCombatEnv("http://platform.test", {
      contentDefaults: { damageDealt: 1.25, healing: 0.8 },
      fetchImpl: fetchStub(200, adminDoc({ damageDealt: 2, cooldown: 0.5 })),
    });
    expect(table.damageDealt).toBe(2); // admin wins over content
    expect(table.cooldown).toBe(0.5); // admin-only key applies
    expect(table.healing).toBe(0.8); // content-only key survives
    expect(table.moveSpeed).toBe(1); // untouched keys stay neutral
  });

  it("env-21: platform down / non-200 / malformed → content defaults, no throw", async () => {
    cover("combatenv-resolve-failsafe");
    const content = { damageDealt: 1.25 };

    for (const fetchImpl of [
      failFetch, // unreachable
      fetchStub(500, {}), // server error
      fetchStub(200, "junk"), // non-object body
      fetchStub(200, { multipliers: null }), // malformed doc
    ]) {
      const table = await fetchCombatEnv("http://platform.test", {
        contentDefaults: content,
        fetchImpl,
      });
      expect(table.damageDealt).toBe(1.25);
      expect(table.cooldown).toBe(1);
    }

    // No content doc either → the neutral table.
    const neutral = await fetchCombatEnv("http://platform.test", {
      contentDefaults: {},
      fetchImpl: failFetch,
    });
    expect(neutral).toEqual(DEFAULT_COMBAT_ENV);
  });

  it("env-22: bypass never hits the network and uses content defaults", async () => {
    cover("combatenv-resolve-bypass");
    const table = await fetchCombatEnv("http://platform.test", {
      bypass: true,
      contentDefaults: { attackSpeed: 1.4 },
      fetchImpl: bombFetch,
    });
    expect(table.attackSpeed).toBe(1.4);
    expect(table.damageDealt).toBe(1);
  });

  it("env-23: junk keys and junk values from the platform are dropped", async () => {
    cover("combatenv-resolve-junk");
    const table = await fetchCombatEnv("http://platform.test", {
      contentDefaults: {},
      fetchImpl: fetchStub(
        200,
        adminDoc({
          cooldown: 2,
          notAKey: 9, // unknown key → dropped
          damageDealt: "5", // non-number → dropped
          healing: Number.NaN, // non-finite → dropped
          shield: -1, // negative → rejected by normalize
        }),
      ),
    });
    expect(table.cooldown).toBe(2);
    expect(table.damageDealt).toBe(1);
    expect(table.healing).toBe(1);
    expect(table.shield).toBe(1);
    expect(Object.keys(table)).not.toContain("notAKey");

    // parseCombatEnvDoc itself: tolerant of garbage shells.
    expect(parseCombatEnvDoc(null)).toBeNull();
    expect(parseCombatEnvDoc({ multipliers: 3 })).toBeNull();
    expect(parseCombatEnvDoc({ multipliers: {} })).toEqual({});
  });

  it("contentCombatEnv reads the registered config.combat-env@1 doc", () => {
    cover("combatenv-resolve-content");
    expect(contentCombatEnv()).toEqual({}); // nothing registered
    Configs.register({
      id: "combat-env",
      schema: "config.combat-env@1",
      version: 1,
      multipliers: { damageDealt: 1.25 },
    } as never);
    expect(contentCombatEnv()).toEqual({ damageDealt: 1.25 });
  });

  it("env-24: the cache shares one fetch within the TTL and refetches after", async () => {
    cover("combatenv-resolve-cache");
    let calls = 0;
    let factor = 2;
    const counting: typeof fetch = (async () => {
      calls++;
      return {
        ok: true,
        status: 200,
        json: async () => adminDoc({ cooldown: factor }),
      } as Response;
    }) as unknown as typeof fetch;

    const cache = new CombatEnvCache("http://platform.test", 5_000, {
      contentDefaults: {},
      fetchImpl: counting,
    });
    const a = await cache.get(1_000);
    const b = await cache.get(2_000); // within TTL → shared snapshot
    expect(calls).toBe(1);
    expect(a).toBe(b);
    expect(a.cooldown).toBe(2);

    factor = 3;
    const c = await cache.get(7_000); // expired → refetch
    expect(calls).toBe(2);
    expect(c.cooldown).toBe(3);
  });
});

describe("combat-env resolve → match snapshot (room-create merge path)", () => {
  it("env-25: the resolved table is what the controller injects into the sim", async () => {
    cover("combatenv-resolve-inject");
    const table = await fetchCombatEnv("http://platform.test", {
      contentDefaults: { damageDealt: 1.25 },
      fetchImpl: fetchStub(200, adminDoc({ cooldown: 0.5 })),
    });

    registerSkeletonContent();
    const specs: SeatSpec[] = Array.from({ length: 12 }, (_, i) => ({
      seatId: i,
      teamId: Math.floor(i / 3),
      isBot: true,
    }));
    const ctl = new MatchController(
      "m-env",
      42,
      specs,
      DEFAULT_PHASE_CONFIG,
      3,
      DEFAULT_ARENA_RULES,
      undefined,
      undefined,
      table,
    );
    expect(ctl.combatEnv).toBe(table);
    expect(ctl.world.combatEnv.cooldown).toBe(0.5);
    expect(ctl.world.combatEnv.damageDealt).toBe(1.25);
  });
});
