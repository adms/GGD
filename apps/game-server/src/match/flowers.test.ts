/**
 * Healing flowers — match wiring (flw-01, flw-06..flw-12): config-doc parse,
 * MatchController spawn scheduling, victory/lives/K-D isolation, despawn on
 * combat end, snapshot projection, Tier-0 flower seeking, the spawnFlower dev
 * cheat, and the MatchRoom event whitelist. Sim primitives are covered in
 * packages/shared/src/sim/flowers.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { zConfigArenaRulesDoc, DEFAULT_FLOWER_CONFIG } from "@ggd/shared/content";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "@ggd/shared/ids";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { spawnFlower, flowerRulesFromConfig, FLOWER_MODEL_KEY } from "@ggd/shared/sim/flowers";
import { MatchState, ENTITY_KIND } from "@ggd/shared/protocol/schema";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, rulesFromDoc, type ArenaRules } from "./arenaRules";
import { projectSnapshot } from "../net/snapshot";
import { AIDriver } from "../ai/Tier0Brain";
import { Seat } from "../seat/Seat";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Fast phase config (mirrors match.test.ts). */
const FAST = {
  champSelectTicks: 5,
  intermissionTicks: 30,
  combatMaxTicks: 1200,
  resolutionTicks: 5,
};

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({
    seatId: i,
    teamId: Math.floor(i / 3),
    isBot: true,
  }));

/** Arena rules with a fast flower cadence (skeleton content, no doc needed). */
const FLOWER_RULES: ArenaRules = {
  ...DEFAULT_ARENA_RULES,
  flowers: { ...DEFAULT_FLOWER_CONFIG, firstSpawnSec: 0.2, respawnSec: 0.5 },
};

function tickUntil(ctl: MatchController, phase: string, maxTicks = 20000): number {
  let n = 0;
  while (ctl.phase.phase !== phase && n < maxTicks) {
    ctl.tick();
    n++;
  }
  expect(ctl.phase.phase).toBe(phase);
  return n;
}

describe("config parse (flw-01)", () => {
  it("arena-rules.json carries the additive flowers block; rulesFromDoc forwards it; legacy = null", () => {
    cover("flower-config-parse");
    const doc = zConfigArenaRulesDoc.parse(
      JSON.parse(readFileSync(join(ROOT, "content/config/arena-rules.json"), "utf8")),
    );
    expect(doc.flowers).toEqual({
      firstSpawnSec: 15,
      respawnSec: 25,
      maxAlivePerZone: 1,
      hp: 60,
      healPctMax: 0.18,
      manaPctMax: 0.18,
      burstRadius: 6,
    });
    expect(rulesFromDoc(doc).flowers).toEqual(doc.flowers);
    // absent block -> null (legacy: no flowers)
    const raw = JSON.parse(readFileSync(join(ROOT, "content/config/arena-rules.json"), "utf8")) as Record<string, unknown>;
    delete raw.flowers;
    expect(rulesFromDoc(zConfigArenaRulesDoc.parse(raw)).flowers).toBeNull();
    expect(DEFAULT_ARENA_RULES.flowers).toBeNull();
  });
});

describe("match spawn scheduling (flw-08)", () => {
  it("flowers spawn during combat in the paired duel zones, per config timing", () => {
    cover("flower-match-cadence");
    const ctl = new MatchController("m-flw", 42, allBots(), FAST, 3, FLOWER_RULES);
    tickUntil(ctl, "combat");
    expect(ctl.world.flower.size).toBe(0); // not immediately

    const spawnEvents: { zone: number[] } = { zone: [] };
    const firstSpawnTicks = Math.round(0.2 / ctl.world.dt);
    for (let i = 0; i < firstSpawnTicks + 3 && ctl.phase.phase === "combat"; i++) {
      ctl.tick();
      for (const ev of ctl.world.events) {
        if (ev.type === "flowerSpawn") spawnEvents.zone.push(ev.data.id as number);
      }
    }
    // one flower per paired duel zone (4 teams alive -> 2 pairings)
    expect(ctl.pairings.length).toBe(2);
    expect(spawnEvents.zone.length).toBe(2);
    const zones = new Set([...ctl.world.flower.values()].map((f) => f.zone));
    expect(zones).toEqual(new Set(ctl.pairings.map((p) => p.zone)));
  });

  it("legacy rules (no flowers block) never spawn flowers", () => {
    cover("flower-match-cadence");
    const ctl = new MatchController("m-leg", 42, allBots(), FAST, 3, DEFAULT_ARENA_RULES);
    tickUntil(ctl, "combat");
    for (let i = 0; i < 40 && ctl.phase.phase === "combat"; i++) ctl.tick();
    expect(ctl.world.flower.size).toBe(0);
  });
});

describe("victory / lives / K-D isolation (flw-06) + despawn on round end (flw-07)", () => {
  it("a live flower never blocks duel resolution; flower kills don't feed K-D; flowers despawn at combat end", () => {
    cover("flower-victory-isolated");
    cover("flower-despawn-roundend");
    const ctl = new MatchController("m-iso", 7, allBots(), FAST, 3, FLOWER_RULES);
    tickUntil(ctl, "combat");
    const firstSpawnTicks = Math.round(0.2 / ctl.world.dt);
    for (let i = 0; i < firstSpawnTicks + 2; i++) ctl.tick();
    expect(ctl.world.flower.size).toBeGreaterThan(0);

    // a champion kills a flower: no kill credit, no gold/xp from the kill path
    const seat0 = ctl.seats.get(asSeatId(0))!;
    const killer = seat0.entityId!;
    const flowerId = [...ctl.world.flower.keys()][0]!;
    ctl.world.damageQueue.push({
      source: killer,
      target: flowerId,
      amount: 9999,
      type: "true",
      crit: false,
      origin: "basic",
    });
    ctl.tick();
    expect(ctl.world.flower.has(flowerId)).toBe(false);
    expect(ctl.kills.get(asSeatId(0)) ?? 0).toBe(0);

    // decide every duel by killing one side; flowers alive at that moment
    // (respawn 0.5s) must not delay resolution or count as alive units
    const livesBefore = new Map(ctl.lives);
    for (let i = 0; i < Math.round(0.5 / ctl.world.dt) + 2; i++) ctl.tick(); // let the flower respawn
    expect(ctl.world.flower.size).toBeGreaterThan(0);
    for (const pairing of ctl.pairings) {
      for (const seat of ctl.seats.values()) {
        if (seat.teamId !== pairing.sideB || seat.entityId === null) continue;
        const hp = ctl.world.health.get(seat.entityId);
        const t = ctl.world.transform.get(seat.entityId);
        if (hp && t?.zone === pairing.zone) {
          hp.hp = 0;
          hp.alive = false;
        }
      }
    }
    ctl.tick(); // checkCombatEnd resolves both duels
    expect(ctl.phase.phase).toBe("resolution");
    // all flowers despawned the moment combat ended
    expect(ctl.world.flower.size).toBe(0);
    // only the defeated sides lost lives — flowers changed nothing
    for (const pairing of ctl.pairings) {
      expect(ctl.lives.get(pairing.sideA)).toBe(livesBefore.get(pairing.sideA));
      expect(ctl.lives.get(pairing.sideB)).toBe((livesBefore.get(pairing.sideB) ?? 0) - 1);
    }
  });
});

describe("snapshot projection (flw-09)", () => {
  it("flowers project as kind 2 / key prop.flower / seatId -1 with hp, and leave after death", () => {
    cover("flower-snapshot-kind");
    const ctl = new MatchController("m-snap", 3, allBots(), FAST, 3, FLOWER_RULES);
    tickUntil(ctl, "intermission");
    const fid = spawnFlower(ctl.world, 0, { x: SKELETON_ARENA.zones[0]!.center.x + 10, z: 0 }, 60);

    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());
    const es = state.entities.get(String(fid));
    expect(es).toBeDefined();
    expect(es!.kind).toBe(ENTITY_KIND.FLOWER);
    expect(es!.key).toBe(FLOWER_MODEL_KEY);
    expect(es!.seatId).toBe(-1);
    expect(es!.hp).toBe(60);
    expect(es!.maxHp).toBe(60);
    expect(es!.alive).toBe(true);
    expect(es!.flags).toBe(0);

    ctl.world.destroy(fid);
    projectSnapshot(ctl, state, new Map());
    expect(state.entities.get(String(fid))).toBeUndefined();
  });
});

describe("Tier-0 flower seeking (flw-10)", () => {
  function aiWorld(hpPct: number): { world: SimWorld; seat: Seat; driver: AIDriver; flowerId: EntityId; enemy: EntityId } {
    registerSkeletonContent();
    const world = new SimWorld(SKELETON_ARENA, 8);
    world.economyOpen = false;
    const cx = SKELETON_ARENA.zones[0]!.center.x;
    const me = spawnChampion(world, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: cx - 12, z: 0 },
      zone: 0,
    });
    const enemy = spawnChampion(world, {
      championId: "sela" as ChampionId,
      seatId: asSeatId(3),
      teamId: asTeamId(1),
      pos: { x: cx - 4, z: 0 },
      zone: 0,
    });
    const hp = world.health.get(me)!;
    hp.hp = hp.maxHp * hpPct;
    world.flowerRules = flowerRulesFromConfig(DEFAULT_FLOWER_CONFIG, world.dt);
    const flowerId = spawnFlower(world, 0, { x: cx - 12, z: 5 }, 60); // 5u away — within seek range
    const driver = new AIDriver();
    const seat = new Seat(asSeatId(0), asTeamId(0), driver);
    seat.entityId = me;
    world.rebuildGrid();
    return { world, seat, driver, flowerId, enemy };
  }

  it("below 65% HP the bot attack-targets the in-zone flower; healthy bots fight the enemy", () => {
    cover("flower-ai-seek");
    const hurt = aiWorld(0.4);
    const frame = hurt.driver.produceIntent(hurt.seat, hurt.world, 0); // tick 0 -> seat 0 replans
    expect(frame.order).toEqual({ kind: "attackTarget", entity: hurt.flowerId });

    const healthy = aiWorld(1.0);
    const frame2 = healthy.driver.produceIntent(healthy.seat, healthy.world, 0);
    expect(frame2.order).toEqual({ kind: "attackTarget", entity: healthy.enemy });
  });
});

describe("spawnFlower dev cheat (flw-11)", () => {
  it("spawns a flower in the caller's zone, even without a flowers block (contract defaults)", () => {
    cover("flower-cheat-spawn");
    const ctl = new MatchController("m-cheat", 9, allBots(), FAST, 3, DEFAULT_ARENA_RULES);
    // before the champion exists the cheat is refused
    expect(ctl.applyCheat(asSeatId(0), { kind: "spawnFlower" })).toBe(false);
    tickUntil(ctl, "intermission");
    expect(ctl.applyCheat(asSeatId(0), { kind: "spawnFlower" })).toBe(true);
    expect(ctl.world.flower.size).toBe(1);
    const seatEntity = ctl.seats.get(asSeatId(0))!.entityId!;
    const zone = ctl.world.transform.get(seatEntity)!.zone;
    expect([...ctl.world.flower.values()][0]!.zone).toBe(zone);
    // rules were armed from the contract defaults so the burst flow works
    expect(ctl.world.flowerRules?.hp).toBe(DEFAULT_FLOWER_CONFIG.hp);
  });
});

describe("MatchRoom event whitelist (flw-12)", () => {
  it("forwards flowerSpawn + flowerBurst on MSG.EVENT (source lint)", () => {
    cover("flower-event-whitelist");
    const src = readFileSync(join(ROOT, "apps/game-server/src/rooms/MatchRoom.ts"), "utf8");
    expect(src).toMatch(/ev\.type === "flowerSpawn"/);
    expect(src).toMatch(/ev\.type === "flowerBurst"/);
  });
});
