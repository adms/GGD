/**
 * Revive circles — sim primitives (rev-01..rev-09, task #84). Covers the drop
 * rule, the channel/contest/decay math, the revived state, every documented
 * edge case, and the determinism contract. Server-side match wiring lives in
 * apps/game-server/src/match/revive.test.ts.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { DEFAULT_MANA_ECONOMY } from "./manaEconomy";
import { DEFAULT_BASE_BONUS } from "./baseBonus";
import { Stat } from "./stats/statTypes";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type TeamId } from "../ids";
import {
  beginCombatRevives,
  endCombatRevives,
  reviveChargesFor,
  reviveCircleOfTeam,
  reviveRulesFromConfig,
  REVIVE_CIRCLE_MODEL_KEY,
  REVIVE_CHANNEL_SEC,
  type ReviveRules,
} from "./revive";
import { spawnFlower } from "./flowers";
import { getMatchStats } from "./stats/matchStats";
import { queryOverlap } from "./collision/queries";
import { circle } from "./collision/shapes";

beforeAll(() => registerSkeletonContent());

/**
 * A UNIT-TEST fixture (kept at 3.0s → 90 ticks so rev-07 pins the conversion
 * math independent of tuning). The SHIPPED threshold is 5.0s / 150 ticks —
 * {@link REVIVE_CHANNEL_SEC}, asserted separately below (task #206). No lifetime
 * (#196).
 */
const RULES: ReviveRules = reviveRulesFromConfig(
  {
    channelSec: 3,
    radius: 2,
    decayMult: 2,
    revivesPerTeamPerRound: 1,
    reviveHpPctMax: 0.5,
    reviveManaPctMax: 0.5,
    contestPauses: true,
    damageInterrupts: false,
    ccInterrupts: true,
  },
  1 / 30,
);

/** Short channel so the tests stay fast; every RULE is unchanged. */
const FAST: ReviveRules = { ...RULES, channelTicks: 6 };

const TEAM_A = asTeamId(0);
const TEAM_B = asTeamId(1);

const step = (w: SimWorld, n = 1): void => {
  for (let i = 0; i < n; i++) w.step(new Map());
};

function champAt(w: SimWorld, seat: number, team: number, x: number, z: number): EntityId {
  return spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x, z },
    zone: 0,
  });
}

/** Kill `id` by zeroing HP — DeathSystem books the death on the next step. */
function kill(w: SimWorld, id: EntityId): void {
  const hp = w.health.get(id)!;
  hp.hp = 0;
}

/** The single live circle (tests never create more than one at a time). */
function theCircle(w: SimWorld): EntityId | null {
  for (const [id] of w.reviveCircle) return id;
  return null;
}

/** A world with one 2v1: A0 (dies) + A1 (rescuer) vs B0. */
function duelWorld(rules: ReviveRules = FAST): {
  w: SimWorld;
  victim: EntityId;
  ally: EntityId;
  enemy: EntityId;
} {
  const w = new SimWorld(SKELETON_ARENA, 7);
  // ⚠️ GH#446 的回魔地板會淹掉這一支自己要量的東西。⭐ owner 2026-08-20 之後
  //    它**預設就是關的**（`enforceFloor: false`，「時間是建議原則」），所以
  //    這一行今天是多餘的 —— 留著是因為它釘的是**這一支要什麼**，⛔ 不是
  //    「出貨預設剛好是什麼」：預設哪天翻回去，這一支也不該跟著變。
  w.manaEconomy = { ...DEFAULT_MANA_ECONOMY, enabled: false };
  // ⚠️ 2026-08-20（GH#446）：`base-bonus.manaRegen` 現在是一格**全域**的
  //    每秒回魔贈禮（owner：「初始回魔也增加少許」）。它是一個**調校值**，
  //    ⛔ 不是這一支要量的機制 —— 留著它，這裡量到的魔力差會混進一個
  //    跟本題無關的全域數字（而且它每週都可能被改）。
  w.baseBonus = { ...DEFAULT_BASE_BONUS, [Stat.ManaRegen]: 0 };
  const c = SKELETON_ARENA.zones[0]!.center;
  const victim = champAt(w, 0, 0, c.x, c.z);
  const ally = champAt(w, 1, 0, c.x + 8, c.z);
  const enemy = champAt(w, 2, 1, c.x + 14, c.z);
  beginCombatRevives(w, rules, [TEAM_A, TEAM_B]);
  return { w, victim, ally, enemy };
}

/** Park `id` inside the circle (no pathing needed — tests move directly). */
function teleportTo(w: SimWorld, id: EntityId, x: number, z: number): void {
  const t = w.transform.get(id)!;
  t.pos = { x, z };
}

describe("circle drop rules (rev-01)", () => {
  it("a champion death in combat drops ONE circle on the corpse, team-tagged", () => {
    cover("revive-circle-drop");
    const { w, victim } = duelWorld();
    kill(w, victim);
    step(w);

    const id = theCircle(w);
    expect(id).not.toBeNull();
    const rc = w.reviveCircle.get(id!)!;
    expect(rc.ownerId).toBe(victim);
    expect(rc.teamId).toBe(TEAM_A);
    expect(rc.zone).toBe(0);
    // dropped exactly ON the corpse — the death position, never a sampled point
    const t = w.transform.get(id!)!;
    const corpse = w.transform.get(victim)!.pos;
    expect(t.pos.x).toBeCloseTo(corpse.x, 6);
    expect(t.pos.z).toBeCloseTo(corpse.z, 6);
    expect(t.radius).toBe(FAST.radius);
    // ground area, NOT a unit: no health, no team seat — so teamAliveCount and
    // duel resolution can never see it
    expect(w.health.has(id!)).toBe(false);
    expect(w.team.has(id!)).toBe(false);
    expect(w.champion.has(id!)).toBe(false);
    // the spawn event carries everything the client needs
    const ev = w.events.find((e) => e.type === "reviveCircleSpawn");
    expect(ev?.data.teamId).toBe(TEAM_A);
    // no `ticks` on the payload: the ring has no lifetime to announce (#196)
    expect(ev?.data.ticks).toBeUndefined();
  });

  it("no circle when the rules are unarmed, for flowers, or with no living ally", () => {
    cover("revive-circle-drop");
    // unarmed world (unit tests / the client's prediction shadow world)
    const bare = new SimWorld(SKELETON_ARENA, 1);
    const c = SKELETON_ARENA.zones[0]!.center;
    const lone = champAt(bare, 0, 0, c.x, c.z);
    champAt(bare, 1, 0, c.x + 3, c.z);
    kill(bare, lone);
    step(bare);
    expect(bare.reviveCircle.size).toBe(0);

    // armed, but the dead thing is a neutral flower
    const w = new SimWorld(SKELETON_ARENA, 2);
    beginCombatRevives(w, FAST, [TEAM_A]);
    champAt(w, 0, 0, c.x + 3, c.z);
    const flower = spawnFlower(w, 0, { x: c.x, z: c.z }, 10);
    w.health.get(flower)!.hp = 0;
    step(w);
    expect(w.reviveCircle.size).toBe(0);

    // armed, champion death, but the team has nobody left to walk to it
    const solo = new SimWorld(SKELETON_ARENA, 3);
    beginCombatRevives(solo, FAST, [TEAM_A, TEAM_B]);
    const last = champAt(solo, 0, 0, c.x, c.z);
    champAt(solo, 1, 1, c.x + 5, c.z);
    kill(solo, last);
    step(solo);
    expect(solo.reviveCircle.size).toBe(0);
  });
});

describe("channel → revive (rev-02)", () => {
  it("a teammate standing in it fills in exactly channelTicks and revives at 50%", () => {
    cover("revive-channel-complete");
    const { w, victim, ally } = duelWorld();
    kill(w, victim);
    step(w);
    const id = theCircle(w)!;
    const corpse = { ...w.transform.get(id)!.pos };

    // walk the ally onto the ring and hold it
    teleportTo(w, ally, corpse.x + 0.5, corpse.z);
    for (let i = 0; i < FAST.channelTicks - 1; i++) {
      teleportTo(w, ally, corpse.x + 0.5, corpse.z); // separation would nudge
      step(w);
      expect(w.health.get(victim)!.alive).toBe(false); // not yet
    }
    teleportTo(w, ally, corpse.x + 0.5, corpse.z);
    step(w);

    const hp = w.health.get(victim)!;
    expect(hp.alive).toBe(true);
    // exactly half — never full: the revived player is the weakest body on the
    // field, and a revive must never strictly dominate the healing flower
    expect(hp.hp / hp.maxHp).toBeCloseTo(0.5, 3);
    expect(hp.mana / hp.maxMana).toBeCloseTo(0.5, 3);
    expect(hp.shields).toEqual([]);
    // …at the CHANNELLER's feet, not the ring centre and never at spawn
    const at = w.transform.get(victim)!;
    const chan = w.transform.get(ally)!;
    expect(Math.hypot(at.pos.x - chan.pos.x, at.pos.z - chan.pos.z)).toBeLessThan(1.5);
    expect(at.zone).toBe(0);
    // circle consumed, charge spent, event emitted
    expect(w.reviveCircle.has(id)).toBe(false);
    expect(reviveChargesFor(w, TEAM_A)).toBe(0);
    const ev = w.events.find((e) => e.type === "reviveComplete");
    expect(ev?.data.ownerId).toBe(victim);
    expect(ev?.data.channeller).toBe(ally);
  });

  it("keeps items/gold/level and does NOT rewrite the death or the kill", () => {
    cover("revive-keeps-history");
    const { w, victim, ally, enemy } = duelWorld();
    const champ = w.champion.get(victim)!;
    champ.gold = 1234;
    champ.level = 7;
    // kill it through the REAL pipeline so DeathSystem credits the enemy
    w.damageQueue.push({
      source: enemy,
      target: victim,
      amount: 99999,
      type: "true",
      crit: false,
      origin: "test",
    });
    step(w);
    const deathsBefore = getMatchStats(w, victim).deaths;
    const killsBefore = getMatchStats(w, enemy).kills;
    expect(deathsBefore).toBe(1);
    expect(killsBefore).toBe(1);

    const corpse = { ...w.transform.get(theCircle(w)!)!.pos };
    for (let i = 0; i < FAST.channelTicks; i++) {
      teleportTo(w, ally, corpse.x, corpse.z);
      step(w);
    }
    expect(w.health.get(victim)!.alive).toBe(true);
    // history is intact …
    expect(getMatchStats(w, victim).deaths).toBe(deathsBefore);
    expect(getMatchStats(w, enemy).kills).toBe(killsBefore);
    // … the rescue scores on its OWN line …
    expect(getMatchStats(w, ally).revivesPerformed).toBe(1);
    expect(getMatchStats(w, victim).revivesReceived).toBe(1);
    // … and nothing was confiscated
    expect(champ.gold).toBe(1234);
    expect(champ.level).toBe(7);
  });
});

describe("once per team per round (rev-03)", () => {
  it("a revived champion who dies again drops NOTHING (the round terminates)", () => {
    cover("revive-once-per-team");
    const { w, victim, ally } = duelWorld();
    kill(w, victim);
    step(w);
    const corpse = { ...w.transform.get(theCircle(w)!)!.pos };
    for (let i = 0; i < FAST.channelTicks; i++) {
      teleportTo(w, ally, corpse.x, corpse.z);
      step(w);
    }
    expect(w.health.get(victim)!.alive).toBe(true);
    expect(reviveChargesFor(w, TEAM_A)).toBe(0);

    // second death on the same team → no circle at all
    kill(w, victim);
    step(w);
    expect(w.reviveCircle.size).toBe(0);
    // …and the OTHER team is unaffected: charges are per team
    expect(reviveChargesFor(w, TEAM_B)).toBe(1);
  });

  it("a second death while a circle still burns drops no second circle", () => {
    cover("revive-once-per-team");
    const w = new SimWorld(SKELETON_ARENA, 11);
    const c = SKELETON_ARENA.zones[0]!.center;
    const a0 = champAt(w, 0, 0, c.x, c.z);
    const a1 = champAt(w, 1, 0, c.x + 4, c.z);
    champAt(w, 2, 0, c.x + 6, c.z);
    champAt(w, 3, 1, c.x + 12, c.z);
    beginCombatRevives(w, FAST, [TEAM_A, TEAM_B]);

    kill(w, a0);
    step(w);
    expect(w.reviveCircle.size).toBe(1);
    const first = theCircle(w)!;
    kill(w, a1);
    step(w);
    expect(w.reviveCircle.size).toBe(1);
    expect(theCircle(w)).toBe(first); // still the ORIGINAL owner's ring
    expect(w.reviveCircle.get(first)!.ownerId).toBe(a0);
    expect(reviveCircleOfTeam(w, TEAM_A, 0)).toBe(first);
  });
});

describe("edge cases (rev-04)", () => {
  it("multiple channellers do NOT stack: two allies fill at 1x, not 2x", () => {
    cover("revive-edge-cases");
    const build = (allies: number): number => {
      const w = new SimWorld(SKELETON_ARENA, 5);
      const c = SKELETON_ARENA.zones[0]!.center;
      const victim = champAt(w, 0, 0, c.x, c.z);
      const helpers: EntityId[] = [];
      for (let i = 0; i < allies; i++) helpers.push(champAt(w, 1 + i, 0, c.x + 20 + i, c.z));
      champAt(w, 9, 1, c.x + 40, c.z);
      beginCombatRevives(w, FAST, [TEAM_A, TEAM_B]);
      kill(w, victim);
      step(w);
      const id = theCircle(w)!;
      const pos = { ...w.transform.get(id)!.pos };
      for (const h of helpers) teleportTo(w, h, pos.x, pos.z);
      step(w);
      return w.reviveCircle.get(id)!.progressTicks;
    };
    expect(build(1)).toBe(1);
    expect(build(2)).toBe(1); // redundancy, never speed
  });

  it("an enemy inside PAUSES progress; it never resets it", () => {
    cover("revive-edge-cases");
    const { w, victim, ally, enemy } = duelWorld();
    kill(w, victim);
    step(w);
    const id = theCircle(w)!;
    const pos = { ...w.transform.get(id)!.pos };

    teleportTo(w, ally, pos.x, pos.z);
    step(w);
    step(w);
    const held = w.reviveCircle.get(id)!.progressTicks;
    expect(held).toBeGreaterThan(0);

    // enemy steps on: progress HOLDS (does not zero, does not advance)
    for (let i = 0; i < 3; i++) {
      teleportTo(w, ally, pos.x, pos.z);
      teleportTo(w, enemy, pos.x, pos.z);
      step(w);
      expect(w.reviveCircle.get(id)!.progressTicks).toBe(held);
      expect(w.reviveCircle.get(id)!.contested).toBe(true);
    }
    // shove them off and it resumes from where it was
    teleportTo(w, enemy, pos.x + 30, pos.z);
    teleportTo(w, ally, pos.x, pos.z);
    step(w);
    expect(w.reviveCircle.get(id)!.progressTicks).toBe(held + 1);
  });

  it("damage does NOT interrupt, but hard CC does", () => {
    cover("revive-edge-cases");
    const { w, victim, ally } = duelWorld();
    kill(w, victim);
    step(w);
    const id = theCircle(w)!;
    const pos = { ...w.transform.get(id)!.pos };

    // bleeding out mid-channel changes nothing
    teleportTo(w, ally, pos.x, pos.z);
    w.health.get(ally)!.hp -= 40;
    step(w);
    expect(w.reviveCircle.get(id)!.progressTicks).toBe(1);

    // a stun does: progress stops advancing and starts draining
    w.status.get(ally)!.effects.push({
      statusId: "stun" as never,
      sourceId: "test",
      expiresAtTick: w.tick + 50,
      stun: true,
    });
    teleportTo(w, ally, pos.x, pos.z);
    step(w);
    expect(w.reviveCircle.get(id)!.progressTicks).toBe(0);
    expect(w.reviveCircle.get(id)!.channellerId).toBeNull();
  });

  it("progress DRAINS at decayMult when the ring empties (a sidestep survives)", () => {
    cover("revive-edge-cases");
    const { w, victim, ally } = duelWorld();
    kill(w, victim);
    step(w);
    const id = theCircle(w)!;
    const pos = { ...w.transform.get(id)!.pos };
    for (let i = 0; i < 4; i++) {
      teleportTo(w, ally, pos.x, pos.z);
      step(w);
    }
    const filled = w.reviveCircle.get(id)!.progressTicks;
    expect(filled).toBe(4);
    // step out: -decayMult per tick, floored at 0 (never snaps to zero)
    teleportTo(w, ally, pos.x + 30, pos.z);
    step(w);
    expect(w.reviveCircle.get(id)!.progressTicks).toBe(filled - FAST.decayMult);
    // …and a hand-off resumes, because progress lives on the CIRCLE
    teleportTo(w, ally, pos.x, pos.z);
    step(w);
    expect(w.reviveCircle.get(id)!.progressTicks).toBe(filled - FAST.decayMult + 1);
  });

  it("the channeller dying cancels the channel but the CIRCLE survives", () => {
    cover("revive-edge-cases");
    const w = new SimWorld(SKELETON_ARENA, 13);
    const c = SKELETON_ARENA.zones[0]!.center;
    const victim = champAt(w, 0, 0, c.x, c.z);
    const rescuer = champAt(w, 1, 0, c.x + 1, c.z);
    const third = champAt(w, 2, 0, c.x + 20, c.z);
    champAt(w, 3, 1, c.x + 40, c.z);
    beginCombatRevives(w, FAST, [TEAM_A, TEAM_B]);
    kill(w, victim);
    step(w);
    const id = theCircle(w)!;
    const pos = { ...w.transform.get(id)!.pos };

    teleportTo(w, rescuer, pos.x, pos.z);
    step(w);
    step(w);
    expect(w.reviveCircle.get(id)!.progressTicks).toBeGreaterThan(0);

    kill(w, rescuer);
    step(w);
    // circle still there, no SECOND circle for the dead rescuer, charge unspent
    expect(w.reviveCircle.has(id)).toBe(true);
    expect(w.reviveCircle.size).toBe(1);
    expect(w.reviveCircle.get(id)!.ownerId).toBe(victim);
    expect(reviveChargesFor(w, TEAM_A)).toBe(1);
    // the third member can take over and finish it
    for (let i = 0; i < FAST.channelTicks; i++) {
      teleportTo(w, third, pos.x, pos.z);
      step(w);
    }
    expect(w.health.get(victim)!.alive).toBe(true);
  });

  it("the owner's team being wiped extinguishes the circle in the same tick", () => {
    cover("revive-edge-cases");
    const w = new SimWorld(SKELETON_ARENA, 17);
    const c = SKELETON_ARENA.zones[0]!.center;
    const victim = champAt(w, 0, 0, c.x, c.z);
    const last = champAt(w, 1, 0, c.x + 1, c.z);
    champAt(w, 2, 1, c.x + 30, c.z);
    beginCombatRevives(w, FAST, [TEAM_A, TEAM_B]);
    kill(w, victim);
    step(w);
    const id = theCircle(w)!;
    const pos = { ...w.transform.get(id)!.pos };
    // Channel to 99% — one tick short of completion. Driven off the REAL
    // progress rather than a fixed tick count: the count used to be exact only
    // because the arena's centre pillar shoved the channeller out of the ring for
    // one tick, and #218 deleted that pillar. A loop that stops at
    // `channelTicks - 1` states the precondition this test actually needs
    // ("99%, not yet revived") and cannot silently over-run into a completed
    // revive the way the fixed count just did.
    for (let i = 0; i < FAST.channelTicks * 4; i++) {
      if ((w.reviveCircle.get(id)?.progressTicks ?? 0) >= FAST.channelTicks - 1) break;
      teleportTo(w, last, pos.x, pos.z);
      step(w);
    }
    expect(w.reviveCircle.get(id)!.progressTicks).toBe(FAST.channelTicks - 1);
    expect(w.health.get(victim)!.alive).toBe(false); // still 99%, not revived
    // …then lose the duel. The ring dies WITH the team; a 99% channel does not
    // save the round.
    kill(w, last);
    step(w);
    expect(w.reviveCircle.size).toBe(0);
    expect(w.health.get(victim)!.alive).toBe(false);
  });

  it("never expires: it outlives the old 2x-channel deadline and stays revivable", () => {
    cover("revive-lifetime-unbounded");
    const { w, victim, ally, enemy } = duelWorld();
    kill(w, victim);
    step(w);
    const id = theCircle(w)!;
    const spawned = w.reviveCircle.get(id)!.spawnedAtTick;
    const pos = { ...w.transform.get(id)!.pos };

    // Hold it contested for 20x the OLD lifetime (which was 2x the channel).
    // Under the old rule the ring was gone by tick spawned+12; now nothing but
    // a reason can end it, and a permanent contest is not a reason.
    const oldDeadline = spawned + FAST.channelTicks * 2;
    for (let i = 0; i < FAST.channelTicks * 40; i++) {
      teleportTo(w, ally, pos.x, pos.z);
      teleportTo(w, enemy, pos.x, pos.z);
      step(w);
    }
    expect(w.tick).toBeGreaterThan(oldDeadline);
    expect(w.reviveCircle.has(id)).toBe(true);
    expect(w.events.some((e) => e.type === "reviveCircleEnd")).toBe(false);
    expect(w.health.get(victim)!.alive).toBe(false);
    // nothing was spent while it burned
    expect(reviveChargesFor(w, TEAM_A)).toBe(1);

    // …and the rescue is still on: shove the enemy off and finish the channel.
    teleportTo(w, enemy, pos.x + 20, pos.z + 20);
    for (let i = 0; i < FAST.channelTicks + 2; i++) {
      teleportTo(w, ally, pos.x, pos.z);
      step(w);
    }
    expect(w.health.get(victim)!.alive).toBe(true);
    expect(w.reviveCircle.has(id)).toBe(false);
    expect(reviveChargesFor(w, TEAM_A)).toBe(0);
  });

  it("endCombatRevives despawns every circle, cancels channels and resets charges", () => {
    cover("revive-combat-teardown");
    const { w, victim, ally } = duelWorld();
    kill(w, victim);
    step(w);
    const pos = { ...w.transform.get(theCircle(w)!)!.pos };
    teleportTo(w, ally, pos.x, pos.z);
    step(w);
    expect(w.reviveCircle.size).toBe(1);

    endCombatRevives(w);
    expect(w.reviveCircle.size).toBe(0);
    expect(w.reviveRules).toBeNull();
    expect(reviveChargesFor(w, TEAM_A)).toBe(0);
    // and the system is inert afterwards: no circle can appear outside combat
    kill(w, ally);
    step(w);
    expect(w.reviveCircle.size).toBe(0);
  });
});

describe("a circle is ground area, not a unit (rev-05)", () => {
  it("is untargetable, uncollidable, and never moves off the corpse", () => {
    cover("revive-not-a-unit");
    const { w, victim, ally } = duelWorld();
    kill(w, victim);
    step(w);
    const id = theCircle(w)!;
    const pos = { ...w.transform.get(id)!.pos };

    // never in the broad phase → invisible to every ability/projectile query
    expect(w.grid.queryCircle(pos, 5)).not.toContain(id);
    expect(queryOverlap(w, circle(pos, 5), { zone: 0 })).not.toContain(id);

    // an ally walking through it is not pushed by it, and it is not pushed
    for (let i = 0; i < 6; i++) {
      teleportTo(w, ally, pos.x, pos.z);
      step(w);
      if (!w.reviveCircle.has(id)) break;
      const t = w.transform.get(id)!;
      expect(t.pos.x).toBeCloseTo(pos.x, 9);
      expect(t.pos.z).toBeCloseTo(pos.z, 9);
    }
  });

  it("exposes a stable model key for the wire", () => {
    cover("revive-not-a-unit");
    expect(REVIVE_CIRCLE_MODEL_KEY).toBe("prop.revive-circle");
  });
});

describe("determinism (rev-06)", () => {
  it("two same-seed runs of a full revive produce identical digests", () => {
    cover("revive-deterministic");
    const run = (): number => {
      const { w, victim, ally } = duelWorld();
      kill(w, victim);
      step(w);
      const pos = { ...w.transform.get(theCircle(w)!)!.pos };
      for (let i = 0; i < FAST.channelTicks + 4; i++) {
        teleportTo(w, ally, pos.x, pos.z);
        step(w);
      }
      return w.digest();
    };
    const a = run();
    expect(run()).toBe(a);
  });

  it("circle progress + team charges are folded into the digest", () => {
    cover("revive-deterministic");
    const { w, victim, ally } = duelWorld();
    kill(w, victim);
    step(w);
    const id = theCircle(w)!;
    const before = w.digest();
    w.reviveCircle.get(id)!.progressTicks += 1; // simulate a desync
    expect(w.digest()).not.toBe(before);
    const withCharge = w.digest();
    w.reviveCharges.set(TEAM_A as TeamId, 0);
    expect(w.digest()).not.toBe(withCharge);
    void ally;
  });
});

describe("config → rules conversion (rev-07)", () => {
  it("REVIVE_CHANNEL_SEC is the named 5s threshold → 150 ticks @30Hz (task #206)", () => {
    cover("revive-config-parse");
    // the >5s accumulate contract lives in one named constant, not a magic 5
    expect(REVIVE_CHANNEL_SEC).toBe(5);
    const rules = reviveRulesFromConfig(
      {
        channelSec: REVIVE_CHANNEL_SEC,
        radius: 2,
        decayMult: 2,
        revivesPerTeamPerRound: 1,
        reviveHpPctMax: 0.5,
        reviveManaPctMax: 0.5,
        contestPauses: true,
        damageInterrupts: false,
        ccInterrupts: true,
      },
      1 / 30,
    );
    // exactly 5.0s of banked ticks before the ring fires — the rim fills across
    // these 150 ticks toward 100%
    expect(rules.channelTicks).toBe(150);
  });

  it("seconds convert to whole ticks at 30Hz; there is no lifetime to convert", () => {
    cover("revive-config-parse");
    expect(RULES.channelTicks).toBe(90);
    expect("lifetimeTicks" in RULES).toBe(false); // removed in #196, not zeroed
    expect(RULES.radius).toBe(2);
    expect(RULES.revivesPerTeamPerRound).toBe(1);
    expect(RULES.damageInterrupts).toBe(false);
    expect(RULES.ccInterrupts).toBe(true);
    expect(RULES.contestPauses).toBe(true);
  });
});
