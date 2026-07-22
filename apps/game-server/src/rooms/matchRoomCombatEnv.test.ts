/**
 * env-26/env-27: the ROOM-CREATE seam of the admin 戰鬥系統 dynamic config.
 * config/combatEnv.test.ts proves the resolver in isolation; this file drives
 * `MatchRoom.onCreate` itself — the only place a real match gets its table —
 * and asserts the three things a match depends on:
 *
 *   - the resolved table is snapshotted into the sim world BEFORE tick 0, and
 *     published to clients as `MatchState.combatEnvJson` (prediction parity);
 *   - the admin override beats the content default key by key (env-26);
 *   - a DOWN platform never bricks match creation — the room falls back to the
 *     content defaults and still comes up (env-27);
 *   - the snapshot is frozen for the match: a later admin save changes the
 *     NEXT room's table, never a running one (env-28).
 *
 * Colyseus transport is stubbed (setSimulationInterval/onMessage) so onCreate
 * runs without a server; everything else is the real room code path.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { Configs } from "@ggd/shared/content";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { DEFAULT_COMBAT_ENV, parseCombatEnvJson } from "@ggd/shared/sim/combatEnv";
import { MatchRoom, type MatchRoomOptions } from "./MatchRoom";
import { Whitelist } from "../curation/whitelist";
import { sharedCombatEnvCache } from "../config/combatEnv";

/** A room with the Colyseus transport bits stubbed out. */
interface TestRoom {
  onCreate(options: MatchRoomOptions): Promise<void>;
  state: { combatEnvJson: string; seed: number };
  ctl: { combatEnv: Record<string, number>; world: { combatEnv: Record<string, number> } };
}

function makeRoom(): TestRoom {
  const room = new MatchRoom() as unknown as TestRoom & {
    setSimulationInterval: () => void;
    onMessage: () => void;
  };
  room.setSimulationInterval = (): void => {};
  room.onMessage = (): void => {};
  return room;
}

/** Register the content-tree default table (content/config/combat-env.json). */
function registerContentDefaults(multipliers: Record<string, number>): void {
  Configs.register({
    id: "combat-env",
    schema: "config.combat-env@1",
    version: 1,
    multipliers,
  } as never);
}

const baseOptions: MatchRoomOptions = {
  matchId: "m-combat-env",
  seed: 4242,
  whitelist: Whitelist.allowAll(),
};

afterEach(() => {
  Configs.clear();
  sharedCombatEnvCache().invalidate();
  vi.unstubAllGlobals();
});

describe("MatchRoom.onCreate — combat-env snapshot", () => {
  it("env-26: the admin override beats the content default and reaches sim + wire", async () => {
    cover("combatenv-room-merge");
    registerSkeletonContent();
    // content ships damageDealt 1.25 + cooldown 1.5; the admin table (served by
    // the platform at /api/v1/combat-env) overrides cooldown only.
    registerContentDefaults({ damageDealt: 1.25, cooldown: 1.5 });
    vi.stubGlobal(
      "fetch",
      (async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            version: 1,
            updatedAt: "2026-07-22T00:00:00Z",
            multipliers: { cooldown: 0.5, notAKey: 9 },
          }),
        }) as unknown as Response) as unknown as typeof fetch,
    );

    const room = makeRoom();
    await room.onCreate(baseOptions);

    // admin wins on cooldown, content survives on damageDealt, rest neutral
    expect(room.ctl.world.combatEnv.cooldown).toBe(0.5);
    expect(room.ctl.world.combatEnv.damageDealt).toBe(1.25);
    expect(room.ctl.world.combatEnv.healing).toBe(1);
    expect(room.ctl.world.combatEnv).not.toHaveProperty("notAKey");
    // the sim world holds the very table the room resolved (no copy drift)
    expect(room.ctl.world.combatEnv).toBe(room.ctl.combatEnv);
    // …and clients decode the identical table off the schema field
    expect(parseCombatEnvJson(room.state.combatEnvJson)).toEqual(room.ctl.combatEnv);
  });

  it("env-27: a DOWN platform still creates the match, on the content defaults", async () => {
    cover("combatenv-room-failsafe");
    registerSkeletonContent();
    registerContentDefaults({ maxHealth: 1.4 });
    vi.stubGlobal(
      "fetch",
      (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    );

    const room = makeRoom();
    // the whole point: onCreate resolves rather than rejecting
    await expect(room.onCreate(baseOptions)).resolves.toBeUndefined();

    expect(room.ctl.world.combatEnv.maxHealth).toBe(1.4); // content default held
    expect(room.ctl.world.combatEnv.cooldown).toBe(1); // nothing else invented
    expect(room.state.combatEnvJson).not.toBe("");
    expect(room.state.seed).toBe(4242); // the room came up normally

    // with no content doc either, a down platform degrades to the neutral table
    Configs.clear();
    sharedCombatEnvCache().invalidate();
    const bare = makeRoom();
    await bare.onCreate({ ...baseOptions, matchId: "m-bare" });
    expect(parseCombatEnvJson(bare.state.combatEnvJson)).toEqual(DEFAULT_COMBAT_ENV);
  });

  it("env-28: each room snapshots at creation — a later save only hits the NEXT match", async () => {
    cover("combatenv-room-snapshot");
    registerSkeletonContent();

    // an explicitly injected table skips the fetch entirely (dev/test seam)…
    const first = makeRoom();
    await first.onCreate({ ...baseOptions, combatEnv: { damageDealt: 2 } });
    expect(first.ctl.world.combatEnv.damageDealt).toBe(2);

    // …then the admin saves a different table and a NEW room is created.
    const second = makeRoom();
    await second.onCreate({ ...baseOptions, matchId: "m-next", combatEnv: { damageDealt: 0.5 } });
    expect(second.ctl.world.combatEnv.damageDealt).toBe(0.5);

    // the running match kept its own snapshot — both in the sim and on the wire
    expect(first.ctl.world.combatEnv.damageDealt).toBe(2);
    expect(parseCombatEnvJson(first.state.combatEnvJson).damageDealt).toBe(2);
    expect(parseCombatEnvJson(second.state.combatEnvJson).damageDealt).toBe(0.5);

    // an absent override is the neutral table, byte-identical to legacy combat
    const legacy = makeRoom();
    await legacy.onCreate({ ...baseOptions, matchId: "m-legacy", combatEnv: {} });
    expect(legacy.ctl.world.combatEnv).toEqual(DEFAULT_COMBAT_ENV);
  });
});
