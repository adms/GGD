/**
 * ROUND 10 — 「所有隊伍在同一個場地大混戰」 (owner directive 2026-07-27), and the
 * four rulings that come with it, through the REAL MatchController.
 *
 *   A. nobody is eliminated — a team at 0 team health plays all ten rounds and
 *      keeps taking its levels / gold / 3-choose-1;
 *   B. team health is a scoreboard: it orders places 2/3/4 only;
 *   C. round 10 is a four-team royale in ONE zone; the survivor is the champion,
 *      regardless of team health;
 *   D. the finale field is bigger, with four equidistant spawn clusters (the map
 *      itself is pinned in royaleArena.test.ts);
 *   E. the finale's fire ring ignites at 180 s, not 60 s, from the enlarged rim.
 *
 * …plus the consequence that carries the whole change: with elimination gone,
 * FINISHING ROUND 10 IS THE ONLY THING THAT ENDS A MATCH.
 *
 * WHAT THESE TESTS DELIBERATELY ASSERT AGAINST. Every check below is written so
 * that DELETING the feature turns it red, not so that it merely observes state:
 * the finale's map id is asserted THROUGH `projectSnapshot` (the only channel a
 * client learns geometry by), the ring delay is asserted on the ARMED sim rules
 * plus the phase clock that has to be long enough to reach it, and the
 * no-elimination rule is asserted on a team driven to 0 health in round 1 and
 * then followed to the final round.
 */
import { describe, it, expect, vi } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { asTeamId, type TeamId } from "@ggd/shared/ids";
import { TICK_HZ } from "@ggd/shared/constants";
import { MatchState, ROUND_OUTCOME } from "@ggd/shared/protocol/schema";
import { ROYALE_ARENA, ROYALE_ZONE_RADIUS } from "@ggd/shared/sim/world/ArenaDef";
import { currentFireRingRadius } from "@ggd/shared/sim/fireRing";
import { guardiansAliveInZone } from "@ggd/shared/sim/systems/GuardianSystem";
import { DEFAULT_GUARDIAN_TOWER_CONFIG, type FireRingConfig } from "@ggd/shared/content";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";
import {
  FINAL_ROUND,
  ROYALE_COMBAT_SEC,
  ROYALE_FIRE_RING_START_SEC,
  isRoyaleRound,
  royaleBout,
} from "./PairedDuels";
import { projectSnapshot } from "../net/snapshot";

const FAST = { champSelectTicks: 5, intermissionTicks: 20, combatMaxTicks: 600, resolutionTicks: 3 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/** The shipped ring schedule's shape (values as in content/config/config.match.json). */
const RING: FireRingConfig = {
  startSec: 60,
  shrinkSec: 20,
  minRadius: 0.5,
  burnPctPerSecStart: 0.04,
  burnPctPerSecEnd: 0.2,
  maxPctPerSec: 1,
};

const withGuardians = (): ArenaRules => ({
  ...DEFAULT_ARENA_RULES,
  guardianTower: DEFAULT_GUARDIAN_TOWER_CONFIG,
});

/** Tick until `round`'s combat is armed (i.e. enterCombat has just run). */
function tickToCombat(ctl: MatchController, round: number, guard = 400_000): void {
  let n = 0;
  while (!(ctl.phase.phase === "combat" && ctl.phase.round === round) && n++ < guard) ctl.tick();
  expect(ctl.phase.phase, `never reached round ${round} combat`).toBe("combat");
  expect(ctl.phase.round).toBe(round);
}

function runToEnd(ctl: MatchController, guard = 400_000): number {
  let n = 0;
  while (ctl.phase.phase !== "matchEnd" && n < guard) {
    ctl.tick();
    n++;
  }
  return n;
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);

// ===========================================================================
// C — the pairing shape
// ===========================================================================
describe("round 10 puts EVERY team in ONE zone (royale-pairing)", () => {
  it("swaps the two 3v3 duels for a single all-teams bout", () => {
    cover("royale-pairing");
    expect(isRoyaleRound(FINAL_ROUND - 1)).toBe(false);
    expect(isRoyaleRound(FINAL_ROUND)).toBe(true);

    const ctl = new MatchController("roy-shape", 4242, allBots(), FAST);
    tickToCombat(ctl, 1);
    expect(ctl.royale).toBeNull();
    expect(ctl.pairings).toHaveLength(2); // ordinary round: two duel zones
    expect(ctl.bye).toBeNull();

    tickToCombat(ctl, FINAL_ROUND);
    expect(ctl.pairings).toHaveLength(0); // …and no duels at all in the finale
    expect(ctl.bye).toBeNull();
    expect(ctl.royale).not.toBeNull();
    expect(ctl.royale!.teams).toEqual([0, 1, 2, 3]);
    expect(ctl.royale!.zone).toBe(0);

    // TWELVE champions, ALL of them, alive in that one zone — this is the whole
    // 「所有隊伍在同一個場地」 claim, and it is checked on the sim's own transforms.
    const placed = [...ctl.seats.values()].filter((s) => {
      const t = s.entityId === null ? null : ctl.world.transform.get(s.entityId);
      return t?.zone === 0 && ctl.world.health.get(s.entityId!)?.alive === true;
    });
    expect(placed).toHaveLength(12);
  });

  it("pairs deterministically — the bout is a pure function of who is playing", () => {
    cover("royale-pairing");
    expect(royaleBout([asTeamId(3), asTeamId(0), asTeamId(2), asTeamId(1)])).toEqual({
      zone: 0,
      teams: [0, 1, 2, 3],
    });
  });
});

// ===========================================================================
// D — the field and the spawns, as the player receives them
// ===========================================================================
describe("the finale field reaches the client (royale-arena-wiring)", () => {
  it("broadcasts arena.royale as mapId, and the sim collides against its 42 rim", () => {
    cover("royale-arena-wiring");
    const ctl = new MatchController("roy-map", 77, allBots(), FAST);
    tickToCombat(ctl, 1);
    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());
    const duelMap = state.mapId;

    tickToCombat(ctl, FINAL_ROUND);
    projectSnapshot(ctl, state, new Map());
    // THE ONLY CHANNEL THAT MATTERS: the client rebuilds ground + minimap + ring
    // from the doc it fetches with this id. If this stayed on the duel map the
    // enlarged arena would exist only in server memory.
    expect(state.mapId).toBe(ROYALE_ARENA.id);
    expect(state.mapId).not.toBe(duelMap);
    // …and the SIM is colliding against the same enlarged geometry
    expect(ctl.arena.id).toBe(ROYALE_ARENA.id);
    expect(ctl.world.arena.zones).toHaveLength(1);
    expect(ctl.world.arena.zones[0]!.boundaryRadius).toBe(ROYALE_ZONE_RADIUS);
  });

  it("spawns four clusters of three: teammates together, teams apart, nobody clipping", () => {
    cover("royale-arena-wiring");
    const ctl = new MatchController("roy-spawn", 909, allBots(), FAST);
    tickToCombat(ctl, FINAL_ROUND);
    const zone = ctl.world.arena.zones[0]!;
    const posByTeam = new Map<TeamId, { x: number; z: number }[]>();
    for (const seat of ctl.seats.values()) {
      const t = ctl.world.transform.get(seat.entityId!)!;
      (posByTeam.get(seat.teamId) ?? posByTeam.set(seat.teamId, []).get(seat.teamId)!).push({
        x: t.pos.x,
        z: t.pos.z,
      });
    }
    expect(posByTeam.size).toBe(4);
    const all = [...posByTeam.values()].flat();
    expect(all).toHaveLength(12);
    for (const p of all) expect(dist(p, zone.center)).toBeLessThanOrEqual(zone.boundaryRadius - 0.6);
    // no two champions interpenetrate at t=0
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) expect(dist(all[i]!, all[j]!)).toBeGreaterThan(1.2);
    }
    // teammates together / enemies apart
    for (const [ta, pa] of posByTeam) {
      for (const a of pa) for (const b of pa) expect(dist(a, b)).toBeLessThanOrEqual(9);
      for (const [tb, pb] of posByTeam) {
        if (tb === ta) continue;
        for (const a of pa) for (const b of pb) expect(dist(a, b)).toBeGreaterThan(20);
      }
    }
    // and everyone faces INTO the arena rather than out at the wall
    for (const seat of ctl.seats.values()) {
      const t = ctl.world.transform.get(seat.entityId!)!;
      const toCentre = { x: zone.center.x - t.pos.x, z: zone.center.z - t.pos.z };
      const dot = t.facing.x * toCentre.x + t.facing.z * toCentre.z;
      expect(dot).toBeGreaterThan(0);
    }
  });

  it("puts ONE guardian in the finale, against two on a duel round (#89)", () => {
    cover("royale-arena-wiring");
    const ctl = new MatchController("roy-guard", 31, allBots(), FAST, 20, withGuardians());
    tickToCombat(ctl, 1);
    expect(guardiansAliveInZone(ctl.world, 0) + guardiansAliveInZone(ctl.world, 1)).toBe(2);
    tickToCombat(ctl, FINAL_ROUND);
    expect(guardiansAliveInZone(ctl.world, 0)).toBe(1);
    expect(guardiansAliveInZone(ctl.world, 1)).toBe(0); // the royale arena HAS no zone 1
  });
});

// ===========================================================================
// E — the fire ring
// ===========================================================================
describe("the finale ring waits 180 s and opens at the bigger rim (royale-fire-ring)", () => {
  it("arms 60 s on rounds 1-9 and 180 s on the finale — per round, not globally", () => {
    cover("royale-fire-ring");
    const ctl = new MatchController("roy-ring", 5, allBots(), FAST, 20, DEFAULT_ARENA_RULES, undefined, undefined, undefined, RING);
    tickToCombat(ctl, 1);
    expect(ctl.world.fireRingRules!.startTicks).toBe(60 * TICK_HZ);
    tickToCombat(ctl, FINAL_ROUND - 1);
    expect(ctl.world.fireRingRules!.startTicks).toBe(60 * TICK_HZ); // round 9 unchanged
    tickToCombat(ctl, FINAL_ROUND);
    expect(ctl.world.fireRingRules!.startTicks).toBe(ROYALE_FIRE_RING_START_SEC * TICK_HZ);
    // …and the AUTHORED config is untouched, so the replay header still records 60
    expect(ctl.fireRing!.startSec).toBe(60);
  });

  it("opens at the ENLARGED radius, so the first contraction is not a team wipe", () => {
    cover("royale-fire-ring");
    const ctl = new MatchController("roy-ring2", 6, allBots(), FAST, 20, DEFAULT_ARENA_RULES, undefined, undefined, undefined, RING);
    tickToCombat(ctl, FINAL_ROUND);
    // dormant ring reads the zone rim — 42, not the duel zone's 24. Had the arena
    // not grown with the delay, the ring would ignite 18 units inside the field.
    expect(currentFireRingRadius(ctl.world, 0)).toBe(ROYALE_ZONE_RADIUS);
  });

  it("gives the finale a combat phase long enough for 180 s to actually arrive", () => {
    cover("royale-fire-ring");
    // ⚠️ THE TRAP THIS PINS: config.match@1 ships combatMaxSec: 100. On the normal
    // phase clock the round is force-settled on HP percentages at 100 s and the
    // 180 s ring NEVER IGNITES — rule E would be a number no player experiences.
    const ctl = new MatchController("roy-clock", 7, allBots(), FAST, 20, DEFAULT_ARENA_RULES, undefined, undefined, undefined, RING);
    tickToCombat(ctl, FINAL_ROUND);
    const needed = (ROYALE_FIRE_RING_START_SEC + (RING.shrinkSec ?? 20)) * TICK_HZ;
    expect(ctl.phase.ticksLeft).toBeGreaterThanOrEqual(needed);
    expect(ctl.phase.ticksLeft).toBeGreaterThanOrEqual(ROYALE_COMBAT_SEC * TICK_HZ - 1);
  });

  it("leaves a ringless match (unit tests / skeleton boot) on its own clock", () => {
    cover("royale-fire-ring");
    const ctl = new MatchController("roy-noring", 8, allBots(), FAST);
    tickToCombat(ctl, FINAL_ROUND);
    expect(ctl.world.fireRingRules).toBeNull();
    expect(ctl.phase.ticksLeft).toBeLessThanOrEqual(FAST.combatMaxTicks);
  });
});

// ===========================================================================
// A — nobody is eliminated
// ===========================================================================
describe("team health no longer removes anybody (royale-no-elimination)", () => {
  it("a team driven to 0 in round 1 still plays, still earns, still shops", () => {
    cover("royale-no-elimination");
    const ctl = new MatchController("roy-noelim", 1234, allBots(), FAST);
    tickToCombat(ctl, 1);
    const broke = asTeamId(2);
    ctl.teamHealth.set(broke, 0);
    const brokeSeat = [...ctl.seats.values()].find((s) => s.teamId === broke)!;
    const goldAt = (): number => ctl.world.champion.get(brokeSeat.entityId!)!.gold;
    const levelAt = (): number => ctl.world.champion.get(brokeSeat.entityId!)!.level;

    const goldBefore = goldAt();
    const levelBefore = levelAt();
    // …and it is STILL in a bout on every remaining round, right through the finale
    for (let r = 2; r <= FINAL_ROUND; r++) {
      tickToCombat(ctl, r);
      // (its health may CLIMB again — a spent team can still win a High Stakes
      // round and be paid +15. That is the point: 0 is a scoreboard low, not a
      // death. What must hold every round is that it is in the bout.)
      const inBout = ctl.royale
        ? ctl.royale.teams.includes(broke)
        : ctl.pairings.some((p) => p.sideA === broke || p.sideB === broke);
      expect(inBout, `spent team sat out round ${r}`).toBe(true);
      expect(ctl.world.health.get(brokeSeat.entityId!)?.alive, `not spawned in round ${r}`).toBe(true);
    }
    // 照樣拿每回合的等級/金錢 — the grants the old `activeSeats` gate withheld
    expect(goldAt()).toBeGreaterThan(goldBefore);
    expect(levelAt()).toBeGreaterThan(levelBefore);
  });

  it("still fires the #193 settlement card when a pool runs out — once", () => {
    cover("royale-no-elimination");
    // The card is what the client's leave-through-settlement gate expects when it
    // sees `eliminated`. Removing elimination must NOT have removed the card.
    const ctl = new MatchController("roy-193", 55, allBots(), FAST);
    let cards: { teamId: number }[] = [];
    /** health each team was on AT THE MOMENT its card fired — see below. */
    const healthWhenCarded = new Map<number, number>();
    let n = 0;
    while (ctl.phase.phase !== "matchEnd" && n++ < 400_000) {
      ctl.tick();
      const fired = ctl.takeEliminationSettlements();
      for (const c of fired) {
        if (!healthWhenCarded.has(c.teamId))
          healthWhenCarded.set(c.teamId, ctl.teamHealth.get(asTeamId(c.teamId)) ?? -1);
      }
      cards = cards.concat(fired);
    }
    expect(cards.length).toBeGreaterThan(0);
    // exactly one card per team, never a repeat every subsequent round
    const perTeam = new Map<number, number>();
    for (const c of cards) perTeam.set(c.teamId, (perTeam.get(c.teamId) ?? 0) + 1);
    for (const [, count] of perTeam) expect(count).toBe(1);
    // …and every team that got one really was at 0 WHEN IT GOT IT.
    //
    // This used to read the health at MATCH END, which is a different claim and
    // the design says it can be false: the sibling test above spells out that a
    // spent team stays in the bout and 「its health may CLIMB again — a spent
    // team can still win a High Stakes round and be paid +15. 0 is a scoreboard
    // low, not a death.」 The end-of-match reading only happened to be 0 under
    // the old numbers; #265's balance pass (基礎生命 +300、倍率 4→3) let one
    // carded team win its way back to 15 and the assertion went red for a
    // reason that had nothing to do with the card. Sampling at the firing tick
    // is the condition the card actually encodes.
    for (const [teamId] of perTeam) expect(healthWhenCarded.get(teamId)).toBe(0);
  });
});

// ===========================================================================
// B + C — how the match ends and who wins
// ===========================================================================
describe("finishing round 10 is the only end condition (royale-match-end)", () => {
  it("runs exactly ten rounds and crowns the finale's survivor", () => {
    cover("royale-match-end");
    const ctl = new MatchController("roy-end", 2468, allBots(), FAST);
    runToEnd(ctl);
    expect(ctl.phase.phase).toBe("matchEnd");
    expect(ctl.phase.round).toBe(FINAL_ROUND);
    expect(ctl.result!.rounds).toBe(FINAL_ROUND);
    expect(ctl.royaleWinner).not.toBeNull();
    // C: the CHAMPION is the survivor, and the settlement names the same team
    expect(ctl.placements.get(ctl.royaleWinner!)).toBe(1);
    expect(ctl.settlement!.winnerTeam).toBe(ctl.royaleWinner as number);
    // B: a full 1/2/3/4 board — no blanks, no ties
    expect([...ctl.placements.values()].sort()).toEqual([1, 2, 3, 4]);
    // #216 parity: the finale zone is marked SETTLED the instant it is decided,
    // so the fire ring and the mob waves stop instead of grinding the champion
    // down behind the victory screen.
    expect(ctl.world.settledZones.has(0)).toBe(true);
    // …and the controls are frozen for the victory beat (#100)
    expect(ctl.outcomeDecided).toBe(true);
  });

  it("orders places 2/3/4 by TEAM HEALTH, and lets a 0-health team still take place 1", () => {
    cover("royale-match-end");
    const ctl = new MatchController("roy-stand", 31337, allBots(), FAST);
    // Reach the finale, then author the scoreboard: the champion-to-be is the
    // team with the WORST health, so a standings-driven winner would be wrong.
    tickToCombat(ctl, FINAL_ROUND);
    ctl.teamHealth.set(asTeamId(0), 1);
    ctl.teamHealth.set(asTeamId(1), 30);
    ctl.teamHealth.set(asTeamId(2), 20);
    ctl.teamHealth.set(asTeamId(3), 10);
    // wipe everyone except team 0 → team 0 survives the royale on 1 health
    for (const seat of ctl.seats.values()) {
      if (seat.teamId === asTeamId(0)) continue;
      const hp = ctl.world.health.get(seat.entityId!)!;
      hp.alive = false;
      hp.hp = 0;
    }
    runToEnd(ctl);
    expect(ctl.royaleWinner).toBe(asTeamId(0));
    expect(ctl.placements.get(asTeamId(0))).toBe(1); // 不看團隊生命
    expect(ctl.placements.get(asTeamId(1))).toBe(2); // …then 30 / 20 / 10
    expect(ctl.placements.get(asTeamId(2))).toBe(3);
    expect(ctl.placements.get(asTeamId(3))).toBe(4);
  });

  it("does not end early even when three teams are on zero health at round 2", () => {
    cover("royale-match-end");
    const ctl = new MatchController("roy-nostop", 99, allBots(), FAST);
    tickToCombat(ctl, 2);
    for (const t of [0, 1, 2]) ctl.teamHealth.set(asTeamId(t), 0);
    runToEnd(ctl);
    // Under the old model this was an instant match end (one team "alive").
    expect(ctl.phase.round).toBe(FINAL_ROUND);
  });
});

// ===========================================================================
// THE NUMBER ITSELF — 10, written out
// ===========================================================================
describe("the finale is round TEN, as a number (royale-match-end)", () => {
  /**
   * ⚠️ THE ONLY TEST IN THIS FILE THAT DOES NOT READ `FINAL_ROUND` ON BOTH SIDES.
   *
   * Everything else here says `tickToCombat(ctl, FINAL_ROUND)` and
   * `expect(ctl.phase.round).toBe(FINAL_ROUND)`, which is exactly as true at 8,
   * at 12 or at 2: those tests pin the SHAPE of the finale, not WHICH round it
   * is. Ten is not an implementation detail — it is the owner's 2026-07-27
   * reward table (`content/config/arena-rules.json` authors a row per round and
   * the mob-wave schedule ends 8 → 10/30, 9 → 20/60, 10 → 0/0 for a clean
   * decider), and it is the wall-clock budget a family sitting was measured
   * against. So it is written out here, once, on both the constant and the match
   * the constant produces.
   */
  it("plays ten rounds — the literal 10, not 「whatever the constant says」", () => {
    cover("royale-match-end");
    expect(FINAL_ROUND).toBe(10);
    expect(isRoyaleRound(9)).toBe(false);
    expect(isRoyaleRound(10)).toBe(true);

    // …and a real match REACHES ten and stops there. Counted independently of
    // the constant: every distinct combat round the phase machine enters.
    const ctl = new MatchController("roy-ten", 24680, allBots(), FAST);
    const combatRounds = new Set<number>();
    let n = 0;
    while (ctl.phase.phase !== "matchEnd" && n++ < 400_000) {
      ctl.tick();
      if (ctl.phase.phase === "combat") combatRounds.add(ctl.phase.round);
    }
    expect(ctl.phase.phase).toBe("matchEnd");
    expect([...combatRounds].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ctl.phase.round).toBe(10);
    expect(ctl.result!.rounds).toBe(10);
  });
});

// ===========================================================================
// RE-ENTERING THE FINALE — the stale-champion trap (commit d090d77d)
// ===========================================================================
describe("a re-entered finale is fought again, not re-awarded (royale-match-end)", () => {
  /**
   * `isRoyaleRound` is `round >= FINAL_ROUND`, so round 11 is ALSO a royale —
   * and the #46 tick failsafe can get there: if `maybeFinish` throws on round
   * 10's resolution, `forceAdvanceOnFault` pushes the phase machine forward
   * instead of ending the match, and the next combat entry arms the finale a
   * second time.
   *
   * `checkRoyaleEnd`'s first line is `if (this.royaleWinner !== null) return
   * true`. A champion left over from the first finale therefore decides the
   * second one ON ITS FIRST COMBAT TICK, before a blow is struck — the wrong
   * team crowned, from a flag nobody reset. This drives that exact path with the
   * shipped failsafe (no source-string peeking) and asserts the bout is decided
   * by WHO IS STANDING NOW.
   */
  it("clears the previous champion, so the survivor of the RE-RUN takes it", () => {
    cover("royale-match-end");
    const ctl = new MatchController("roy-reentry", 31415, allBots(), FAST);
    tickToCombat(ctl, FINAL_ROUND);

    // ARM THE #46 FAILSAFE: the resolution phase can no longer end the match.
    // (The failsafe logs the contained fault; the spy keeps the run readable and
    // doubles as proof that the path we are driving really is the fault path.)
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    (ctl as unknown as { maybeFinish: () => boolean }).maybeFinish = () => {
      throw new Error("simulated #46 fault so the finale is entered twice");
    };

    let stale: TeamId | null = null;
    let n = 0;
    while (!(ctl.phase.phase === "combat" && ctl.phase.round === FINAL_ROUND + 1) && n++ < 400_000) {
      ctl.tick();
      if (stale === null && ctl.royaleWinner !== null) stale = ctl.royaleWinner;
    }
    expect(ctl.phase.round, "never re-entered the finale").toBe(FINAL_ROUND + 1);
    expect(ctl.faultCount, "the #46 failsafe never fired — this is not the path").toBeGreaterThan(0);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
    expect(isRoyaleRound(ctl.phase.round)).toBe(true);
    expect(ctl.royale).not.toBeNull();
    expect(stale, "the first finale crowned nobody, so there is no stale flag to clear").not.toBeNull();

    // the flag the first finale latched must NOT have survived the re-arm
    expect(ctl.royaleWinner).toBeNull();

    // …and behaviourally: hand the second bout to a DIFFERENT team by wiping
    // everyone else, then let it settle. A stale flag would crown `stale`.
    const survivor = ctl.royale!.teams.find((t) => t !== stale)!;
    for (const seat of ctl.seats.values()) {
      if (seat.teamId === survivor) continue;
      const hp = ctl.world.health.get(seat.entityId!)!;
      hp.alive = false;
      hp.hp = 0;
    }
    ctl.tick();
    expect(ctl.royaleWinner, "the re-run was awarded to the OLD champion").toBe(survivor);
    expect(ctl.royaleWinner).not.toBe(stale);
  });
});

// ===========================================================================
// roundWins — what the finale's bump is actually for
// ===========================================================================
describe("the finale is a round the champion WON (royale-match-end)", () => {
  /**
   * WHAT `roundWins` REALLY DRIVES — because the hand-off got this wrong.
   *
   * The claim was 「the client's victory gate edge-detects roundWins, so the
   * finale must bump it or the champion gets no firework」. IT DOES NOT. Read
   * `apps/client/src/vfx/victoryTrigger.ts`: the MATCH-WIN branch is checked
   * FIRST and it does not look at the counter at all — it fires on
   * `outcomeDecided && placement === 1` and then re-baselines `lastRoundWins`.
   * Its own test ("reports the FINAL round as a match win only, never both at
   * once") pins that. Worse, `outcomeDecided` latches one resolution phase
   * BEFORE `placements` is written, so during that window the champion takes the
   * gate's loser path, which re-baselines the counter too. No firework depends
   * on this bump.
   *
   * What DOES depend on it:
   *   • `TeamState.roundWins` on the wire — the replicated 「你到目前贏了幾場」.
   *     Without the bump the champion's own scoreboard is permanently one short
   *     of the rounds it actually won, forever, on every client;
   *   • `replay/digest.ts`, which hashes it as host state;
   *   • `finalStandings`' second sort key. (That one is NOT affected by the
   *     finale's bump — the champion is filtered out of `rest` before the sort —
   *     which is precisely why a standings assertion cannot guard this line.)
   *
   * So the contract asserted here is the counter's own definition: it equals the
   * number of rounds this team was recorded WON, finale included, and the wire
   * carries that value.
   */
  it("counts it: roundWins equals the rounds recorded WON, and the wire agrees", () => {
    cover("royale-match-end");
    const ctl = new MatchController("roy-wins", 8642, allBots(), FAST);
    const state = new MatchState();
    const wireWins = (): Map<number, number> => {
      projectSnapshot(ctl, state, new Map());
      const m = new Map<number, number>();
      for (const t of state.teams) m.set(t.teamId, t.roundWins);
      return m;
    };

    const wonRounds = new Map<number, number>();
    let wireBeforeFinaleSettles = new Map<number, number>();
    let prev = ctl.phase.phase;
    let n = 0;
    while (ctl.phase.phase !== "matchEnd" && n++ < 400_000) {
      if (ctl.phase.phase === "combat" && ctl.phase.round === FINAL_ROUND) {
        wireBeforeFinaleSettles = wireWins(); // last projection before the settle
      }
      ctl.tick();
      // settleRound / settleRoyale both run in the tick that enters `resolution`
      if (ctl.phase.phase === "resolution" && prev !== "resolution") {
        for (const [teamId, outcome] of ctl.roundOutcome) {
          if (outcome === ROUND_OUTCOME.WON) wonRounds.set(teamId, (wonRounds.get(teamId) ?? 0) + 1);
        }
      }
      prev = ctl.phase.phase;
    }

    const champion = ctl.royaleWinner!;
    expect(champion).not.toBeNull();
    // the finale itself was recorded as a WIN for the champion…
    expect(ctl.roundOutcome.get(champion)).toBe(ROUND_OUTCOME.WON);
    // …so the lifetime counter must include it, for EVERY team
    for (const [teamId, won] of wonRounds) {
      expect(ctl.roundWins.get(asTeamId(teamId)), `team ${teamId} 贏了幾場`).toBe(won);
    }
    expect(wonRounds.get(champion as number)).toBeGreaterThanOrEqual(1);

    // …and the CLIENT sees the increment: the champion's replicated counter is
    // one higher after the finale settles than it was while it was still being
    // fought. (Every other team's is unchanged — the finale pays one winner.)
    const after = wireWins();
    expect(after.get(champion as number)).toBe(
      (wireBeforeFinaleSettles.get(champion as number) ?? 0) + 1,
    );
    expect(after.get(champion as number)).toBe(ctl.roundWins.get(champion));
    for (const [teamId, before] of wireBeforeFinaleSettles) {
      if (teamId === (champion as number)) continue;
      expect(after.get(teamId)).toBe(before);
    }
  });
});

// ===========================================================================
// determinism — replay has to reproduce the finale exactly
// ===========================================================================
describe("the finale is deterministic (royale-determinism)", () => {
  it("same seed → same champion, same spawn layout, same sim digest", () => {
    cover("royale-determinism");
    const run = (): string => {
      const ctl = new MatchController("roy-det", 8675309, allBots(), FAST);
      tickToCombat(ctl, FINAL_ROUND);
      const layout = [...ctl.seats.values()]
        .map((s) => {
          const t = ctl.world.transform.get(s.entityId!)!;
          return `${s.seatId}:${t.pos.x},${t.pos.z}`;
        })
        .join("|");
      runToEnd(ctl);
      return JSON.stringify({
        layout,
        winner: ctl.royaleWinner,
        places: [...ctl.placements.entries()].sort((a, b) => a[0] - b[0]),
        digest: ctl.world.digest(),
      });
    };
    expect(run()).toBe(run());
  });
});
