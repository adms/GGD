/**
 * Neutral duel-zone GUARDIAN — the WIRING that makes it a real, visible objective
 * (task #89/#105). The mechanic itself is covered in
 * packages/shared/src/sim/systems/GuardianSystem.test.ts; this proves the parts
 * that were the pathology — the guardian existed in the sim but could not be
 * SEEN or reacted to:
 *   • snapshot projection: it encodes as its OWN kind (GUARDIAN), NEUTRAL
 *     (seatId -1), with the per-arena model key + hp — not a kind-0 champion
 *     fall-through (grey humanoid painted team-0);
 *   • per-arena identity (#105): the arena picks 樹人 / 石頭人 / 巨獸人;
 *   • the AoE radius + its telegraph carry the post-abilityRange value (#125);
 *   • MatchRoom's event whitelist fans out the events the client needs.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { DEFAULT_GUARDIAN_TOWER_CONFIG } from "@ggd/shared/content";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { DEFAULT_COMBAT_ENV } from "@ggd/shared/sim/combatEnv";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "@ggd/shared/ids";
import {
  spawnGuardian,
  beginCombatGuardians,
  guardianRulesFromConfig,
  guardianModelKeyForArena,
  GUARDIAN_MODEL_STONE,
  GUARDIAN_MODEL_BEAST,
  GUARDIAN_MODEL_TREANT,
} from "@ggd/shared/sim/systems/GuardianSystem";
import { MatchState, ENTITY_KIND } from "@ggd/shared/protocol/schema";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";
import { projectSnapshot } from "../net/snapshot";
import { FANNED_OUT_EVENT_TYPES } from "../net/eventFanout";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

const GUARDIAN_RULES: ArenaRules = { ...DEFAULT_ARENA_RULES, guardianTower: DEFAULT_GUARDIAN_TOWER_CONFIG };

function tickUntil(ctl: MatchController, phase: string, maxTicks = 20000): void {
  let n = 0;
  while (ctl.phase.phase !== phase && n < maxTicks) {
    ctl.tick();
    n++;
  }
  expect(ctl.phase.phase).toBe(phase);
}

describe("guardian snapshot projection (gdn-wire-01)", () => {
  it("projects as kind GUARDIAN / neutral seatId -1 / per-arena model key + hp, and leaves after death", () => {
    cover("guardian-snapshot-kind");
    const ctl = new MatchController("m-gdn", 3, allBots(), FAST, 3, GUARDIAN_RULES);
    tickUntil(ctl, "intermission");
    const rules = guardianRulesFromConfig(DEFAULT_GUARDIAN_TOWER_CONFIG, ctl.world.dt);
    const gid = spawnGuardian(ctl.world, 0, 1450, rules, 1);

    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());
    const es = state.entities.get(String(gid));
    expect(es).toBeDefined();
    // its OWN distinct kind — NOT the kind-0 champion fall-through
    expect(es!.kind).toBe(ENTITY_KIND.GUARDIAN);
    expect(es!.kind).not.toBe(ENTITY_KIND.CHAMPION);
    // NEUTRAL: no team owns it (the old bug resolved seatId -1 → team 0/blue)
    expect(es!.seatId).toBe(-1);
    // per-arena model doc id (skeleton → stone)
    expect(es!.key).toBe(GUARDIAN_MODEL_STONE);
    expect(es!.hp).toBe(1450);
    expect(es!.maxHp).toBe(1450);
    expect(es!.alive).toBe(true);

    ctl.world.destroy(gid);
    projectSnapshot(ctl, state, new Map());
    expect(state.entities.get(String(gid))).toBeUndefined();
  });
});

describe("per-arena guardian identity #105 (gdn-wire-02)", () => {
  it("each arena selects one of the three faces; unknown falls back to stone", () => {
    cover("guardian-arena-identity");
    expect(guardianModelKeyForArena("arena.skeleton")).toBe(GUARDIAN_MODEL_STONE);
    expect(guardianModelKeyForArena("arena.colosseum")).toBe(GUARDIAN_MODEL_BEAST);
    expect(guardianModelKeyForArena("arena.godie")).toBe(GUARDIAN_MODEL_BEAST);
    expect(guardianModelKeyForArena("arena.dota")).toBe(GUARDIAN_MODEL_TREANT);
    expect(guardianModelKeyForArena("arena.castle")).toBe(GUARDIAN_MODEL_TREANT);
    expect(guardianModelKeyForArena("arena.unknown")).toBe(GUARDIAN_MODEL_STONE);
    // all three faces are actually reachable from the shipped rotation
    const faces = new Set(
      ["arena.skeleton", "arena.castle", "arena.colosseum", "arena.dota", "arena.godie"].map(
        guardianModelKeyForArena,
      ),
    );
    expect(faces).toEqual(new Set([GUARDIAN_MODEL_STONE, GUARDIAN_MODEL_BEAST, GUARDIAN_MODEL_TREANT]));
  });

  it("spawnGuardian stamps the ACTIVE arena's model key on the wire", () => {
    cover("guardian-arena-modelkey");
    const world = new SimWorld(SKELETON_ARENA, 7);
    const rules = guardianRulesFromConfig(DEFAULT_GUARDIAN_TOWER_CONFIG, world.dt);
    const gid = spawnGuardian(world, 0, 1450, rules, 1);
    expect(world.structure.get(gid)!.modelKey).toBe(guardianModelKeyForArena(SKELETON_ARENA.id));
  });
});

describe("guardian AoE radius respects abilityRange #125/#136 (gdn-wire-03)", () => {
  it("the volley telegraph radius is the post-abilityRange value, not the raw one", () => {
    cover("guardian-range-scaled");
    registerSkeletonContent();
    const world = new SimWorld(SKELETON_ARENA, 11);
    // the exact combat-env the LAN playtest runs (abilityRange 0.6)
    world.combatEnv = { ...DEFAULT_COMBAT_ENV, abilityRange: 0.6 };
    const rules = guardianRulesFromConfig(DEFAULT_GUARDIAN_TOWER_CONFIG, world.dt);
    const cx = SKELETON_ARENA.zones[0]!.center.x;
    // a real champion next to the centre is the guardian's damager (only a
    // champion's damage builds threat, so only then does a volley fire).
    const a: EntityId = spawnChampion(world, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: cx + 3, z: 0 },
      zone: 0,
    });
    beginCombatGuardians(world, rules, [0], 1);
    let gid: EntityId | null = null;
    for (const [id] of world.structure) gid = id;
    expect(gid).not.toBeNull();

    let markRadius = -1;
    for (let i = 0; i < 600 && markRadius < 0; i++) {
      world.damageQueue.push({ source: a, target: gid!, amount: 5, type: "physical", crit: false, origin: "test" });
      world.step(new Map());
      for (const ev of world.events) {
        if (ev.type === "guardianMark") {
          markRadius = (ev.data as { radius: number }).radius;
          break;
        }
      }
    }
    // post-multiplier: raw 3.0 × 0.6 = 1.8, NOT the raw 3.0
    expect(markRadius).toBeCloseTo(DEFAULT_GUARDIAN_TOWER_CONFIG.volleyRadius * 0.6, 5);
    expect(markRadius).not.toBeCloseTo(DEFAULT_GUARDIAN_TOWER_CONFIG.volleyRadius, 5);
  });
});

describe("MatchRoom event whitelist (gdn-wire-04)", () => {
  it("fans out the guardian events the client needs to see/dodge/reward", () => {
    cover("guardian-event-whitelist");
    for (const t of ["guardianSpawn", "guardianWake", "guardianMark", "guardianImpact", "guardianSlain"]) {
      expect(FANNED_OUT_EVENT_TYPES.has(t)).toBe(true);
    }
  });
});
