/**
 * Revive circles — match wiring (rev-08..rev-12, task #84): the config-doc
 * parse, arming on combat entry / teardown on combat end, the snapshot
 * projection of kind 3, the MatchRoom event whitelist, and the settlement
 * counters. Sim primitives live in packages/shared/src/sim/revive.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { zConfigArenaRulesDoc, DEFAULT_REVIVE_CIRCLE_CONFIG } from "@ggd/shared/content";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "@ggd/shared/ids";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import {
  beginCombatRevives,
  reviveRulesFromConfig,
  spawnReviveCircle,
  REVIVE_CIRCLE_MODEL_KEY,
} from "@ggd/shared/sim/revive";
import { MatchState, ENTITY_KIND, ENTITY_FLAG } from "@ggd/shared/protocol/schema";
import { createMatchStats } from "@ggd/shared/sim/stats/matchStats";
import { compositeScore } from "@ggd/shared/sim/stats/rating";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, rulesFromDoc, type ArenaRules } from "./arenaRules";
import { projectSnapshot } from "../net/snapshot";
import { AIDriver } from "../ai/Tier0Brain";
import { Seat } from "../seat/Seat";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

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

const REVIVE_RULES: ArenaRules = {
  ...DEFAULT_ARENA_RULES,
  reviveCircles: DEFAULT_REVIVE_CIRCLE_CONFIG,
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

describe("config parse (rev-08)", () => {
  it("arena-rules.json carries the additive reviveCircles block; legacy = null", () => {
    cover("revive-config-parse");
    const doc = zConfigArenaRulesDoc.parse(
      JSON.parse(readFileSync(join(ROOT, "content/config/arena-rules.json"), "utf8")),
    );
    expect(doc.reviveCircles).toEqual({
      channelSec: 3,
      lifetimeSec: 6,
      radius: 2,
      decayMult: 2,
      revivesPerTeamPerRound: 1,
      reviveHpPctMax: 0.5,
      reviveManaPctMax: 0.5,
      contestPauses: true,
      damageInterrupts: false,
      ccInterrupts: true,
    });
    // the shipped block IS the documented contract default
    expect(doc.reviveCircles).toEqual(DEFAULT_REVIVE_CIRCLE_CONFIG);
    expect(rulesFromDoc(doc).reviveCircles).toEqual(doc.reviveCircles);
    // absent block = the mechanic is simply off (flowers' legacy-compat rule)
    const { reviveCircles: _omit, ...withoutBlock } = doc;
    expect(rulesFromDoc(withoutBlock as typeof doc).reviveCircles).toBeNull();
    expect(DEFAULT_ARENA_RULES.reviveCircles).toBeNull();
  });

  it("the tuned numbers hold their derivation: lifetime is exactly 2x the channel", () => {
    cover("revive-config-parse");
    const cfg = DEFAULT_REVIVE_CIRCLE_CONFIG;
    // "you get exactly one channel's worth of travel time"
    expect(cfg.lifetimeSec).toBe(cfg.channelSec * 2);
    // 3.0s = 90 ticks and 6.0s = 180 ticks: integer at 30Hz, no rounding drift
    const rules = reviveRulesFromConfig(cfg, 1 / 30);
    expect(rules.channelTicks).toBe(90);
    expect(rules.lifetimeTicks).toBe(180);
    // above the measured p25 death cadence (2.00s) so a revive can never
    // outpace a kill, and inside the 90s combatMaxSec tail at 1 charge/team
    expect(cfg.channelSec).toBeGreaterThan(2);
    expect(cfg.revivesPerTeamPerRound).toBe(1);
  });
});

describe("match wiring (rev-09)", () => {
  it("arms a charge per ALIVE team on combat entry and tears everything down on combat end", () => {
    cover("revive-match-wiring");
    const ctl = new MatchController("m-rev", 4242, allBots(), FAST, 3, REVIVE_RULES);
    tickUntil(ctl, "combat");
    expect(ctl.world.reviveRules).not.toBeNull();
    expect(ctl.world.reviveRules!.channelTicks).toBe(90);
    // every team that is still in the match holds exactly one charge
    for (const [teamId, lives] of ctl.lives) {
      if (lives > 0) expect(ctl.world.reviveCharges.get(teamId)).toBe(1);
    }

    // drop a circle mid-combat, then let the round end
    const anySeat = [...ctl.seats.values()].find((s) => s.entityId !== null)!;
    const t = ctl.world.transform.get(anySeat.entityId!)!;
    spawnReviveCircle(ctl.world, {
      ownerId: anySeat.entityId!,
      ownerSeatId: asSeatId(anySeat.seatId),
      teamId: asTeamId(anySeat.teamId),
      zone: t.zone,
      pos: t.pos,
      lifetimeTicks: 999,
      radius: 2,
    });
    expect(ctl.world.reviveCircle.size).toBe(1);

    tickUntil(ctl, "resolution");
    // no circle survives into resolution, and no channel resolves across the
    // phase boundary
    expect(ctl.world.reviveCircle.size).toBe(0);
    expect(ctl.world.reviveRules).toBeNull();
    expect(ctl.world.reviveCharges.size).toBe(0);
  });

  it("a match WITHOUT the block never arms the mechanic (legacy behavior)", () => {
    cover("revive-match-wiring");
    const ctl = new MatchController("m-norev", 7, allBots(), FAST, 3, DEFAULT_ARENA_RULES);
    tickUntil(ctl, "combat");
    expect(ctl.world.reviveRules).toBeNull();
    for (let i = 0; i < 200; i++) ctl.tick();
    expect(ctl.world.reviveCircle.size).toBe(0);
  });

  it("a full 12-bot match with revives still reaches matchEnd with placements", () => {
    cover("revive-match-wiring");
    const ctl = new MatchController("m-rev-full", 99, allBots(), FAST, 2, REVIVE_RULES);
    tickUntil(ctl, "matchEnd", 200000);
    expect(ctl.result).not.toBeNull();
    // the round-termination clause held: the match resolved, nothing stalled
    expect(ctl.result!.teams.every((t) => t.placement >= 1 && t.placement <= 4)).toBe(true);
    // and no circle leaked into the settlement scene
    expect(ctl.world.reviveCircle.size).toBe(0);
  });
});

describe("snapshot projection (rev-10)", () => {
  it("projects kind 3 with progress/lifetime/radius in the reused float slots", () => {
    cover("revive-snapshot-kind");
    registerSkeletonContent();
    const w = new SimWorld(SKELETON_ARENA, 3);
    const c = SKELETON_ARENA.zones[0]!.center;
    const owner: EntityId = spawnChampion(w, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(4),
      teamId: asTeamId(1),
      pos: { x: c.x, z: c.z },
      zone: 0,
    });
    const rules = reviveRulesFromConfig(DEFAULT_REVIVE_CIRCLE_CONFIG, w.dt);
    beginCombatRevives(w, rules, [asTeamId(1)]);
    const id = spawnReviveCircle(w, {
      ownerId: owner,
      ownerSeatId: asSeatId(4),
      teamId: asTeamId(1),
      zone: 0,
      pos: { x: c.x, z: c.z },
      lifetimeTicks: rules.lifetimeTicks,
      radius: rules.radius,
    });
    const rc = w.reviveCircle.get(id)!;
    rc.progressTicks = 45;
    rc.channellerId = owner;
    rc.contested = true;

    const state = new MatchState();
    const ctl = { world: w, phase: { phase: "combat", round: 1, ticksLeft: 10 }, lives: new Map(), seats: new Map(), placements: new Map(), offers: new Map(), outcomeDecided: false };
    projectSnapshot(ctl as never, state, new Map());

    const es = state.entities.get(String(id))!;
    expect(es.kind).toBe(ENTITY_KIND.REVIVE_CIRCLE);
    expect(es.key).toBe(REVIVE_CIRCLE_MODEL_KEY);
    expect(es.seatId).toBe(4); // the DEAD owner's seat → team tint + HUD name
    expect(es.hp / es.maxHp).toBeCloseTo(45 / rules.channelTicks, 6);
    expect(es.maxMana).toBe(rules.lifetimeTicks);
    expect(es.mana).toBeLessThanOrEqual(rules.lifetimeTicks);
    expect(es.shield).toBe(rules.radius); // ring radius, off the config
    expect(es.alive).toBe(true);
    expect(es.flags & ENTITY_FLAG.CHANNELLING).toBeTruthy();
    expect(es.flags & ENTITY_FLAG.CONTESTED).toBeTruthy();

    // …and it LEAVES the snapshot the moment the circle is gone
    w.destroy(id);
    projectSnapshot(ctl as never, state, new Map());
    expect(state.entities.get(String(id))).toBeUndefined();
  });
});

describe("Tier-0 revive seeking (rev-18)", () => {
  const seatAt = (
    w: SimWorld,
    seatId: number,
    teamId: number,
    x: number,
    z: number,
    driver = new AIDriver(),
  ): { seat: Seat; id: EntityId } => {
    const id = spawnChampion(w, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(seatId),
      teamId: asTeamId(teamId),
      pos: { x, z },
      zone: 0,
    });
    const seat = new Seat(asSeatId(seatId), asTeamId(teamId), driver);
    seat.entityId = id;
    return { seat, id };
  };

  it("walks to its OWN team's circle in range, ignores the enemy's and out-of-range ones", () => {
    cover("revive-ai-seek");
    registerSkeletonContent();
    const w = new SimWorld(SKELETON_ARENA, 5);
    w.economyOpen = false; // combat
    const c = SKELETON_ARENA.zones[0]!.center;
    const driver = new AIDriver();
    const dead = seatAt(w, 0, 0, c.x, c.z);
    const bot = seatAt(w, 1, 0, c.x + 6, c.z, driver);
    seatAt(w, 2, 1, c.x + 9, c.z); // an enemy to fight, so "attack" is the default
    w.health.get(dead.id)!.alive = false;
    w.rebuildGrid();
    beginCombatRevives(w, reviveRulesFromConfig(DEFAULT_REVIVE_CIRCLE_CONFIG, w.dt), [
      asTeamId(0),
      asTeamId(1),
    ]);

    const think = (): ReturnType<AIDriver["produceIntent"]> =>
      driver.produceIntent(bot.seat, w, bot.seat.seatId as number);

    // no circle yet → the bot fights
    expect(think().order?.kind).toBe("attackTarget");

    // my team's circle, 6u away → walk to it
    const mine = spawnReviveCircle(w, {
      ownerId: dead.id,
      ownerSeatId: asSeatId(0),
      teamId: asTeamId(0),
      zone: 0,
      pos: { x: c.x, z: c.z },
      lifetimeTicks: 180,
      radius: 2,
    });
    const order = think().order;
    expect(order?.kind).toBe("move");
    expect(order?.point?.x).toBeCloseTo(c.x, 6);
    expect(order?.point?.z).toBeCloseTo(c.z, 6);

    // an ENEMY team's circle is never sought
    w.destroy(mine);
    spawnReviveCircle(w, {
      ownerId: dead.id,
      ownerSeatId: asSeatId(9),
      teamId: asTeamId(1),
      zone: 0,
      pos: { x: c.x, z: c.z },
      lifetimeTicks: 180,
      radius: 2,
    });
    expect(think().order?.kind).toBe("attackTarget");
  });
});

describe("event whitelist (rev-11)", () => {
  it("MatchRoom forwards the three revive events (source lint)", () => {
    cover("revive-event-whitelist");
    const src = readFileSync(join(ROOT, "apps/game-server/src/rooms/MatchRoom.ts"), "utf8");
    for (const ev of ["reviveCircleSpawn", "reviveCircleEnd", "reviveComplete"]) {
      expect(src).toContain(`ev.type === "${ev}"`);
    }
  });
});

describe("settlement counters (rev-12)", () => {
  it("revivesPerformed lifts the composite score, and support feels it most", () => {
    cover("revive-settlement-stat");
    const base = createMatchStats();
    base.kills = 3;
    base.deaths = 2;
    base.damageDealt = 6000;
    const withRevive = { ...base, revivesPerformed: 2 };
    const lobby = [base, withRevive];

    // a rescue is worth something on every role …
    expect(compositeScore(withRevive, lobby, "fighter")).toBeGreaterThan(
      compositeScore(base, lobby, "fighter"),
    );
    // … and it is a SUPPORT axis: the same two revives move a support further
    // than they move an assassin
    const supportGain =
      compositeScore(withRevive, lobby, "support") - compositeScore(base, lobby, "support");
    const assassinGain =
      compositeScore(withRevive, lobby, "assassin") - compositeScore(base, lobby, "assassin");
    expect(supportGain).toBeGreaterThan(assassinGain);
  });
});
