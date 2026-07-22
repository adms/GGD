import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { asSeatId, asTeamId, type TeamId } from "@ggd/shared/ids";
import { Champions } from "@ggd/shared/sim/content/registry";
import { MatchController, type SeatSpec } from "./MatchController";
import { PhaseMachine } from "./PhaseMachine";
import { pairTeams, livesLost } from "./PairedDuels";
import { MatchState } from "@ggd/shared/protocol/schema";
import { projectSnapshot } from "../net/snapshot";
import { HumanDriver } from "../seat/HumanDriver";
import { AIDriver } from "../ai/Tier0Brain";
import { InputMailbox } from "../seat/InputMailbox";
import { sign, verify, mintTicket, verifyTicket } from "../auth/hmac";

/** Fast phase config so full matches run in a few thousand ticks. */
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

function runToEnd(ctl: MatchController, maxTicks = 60000): number {
  let n = 0;
  while (ctl.phase.phase !== "matchEnd" && n < maxTicks) {
    ctl.tick();
    n++;
  }
  return n;
}

describe("PhaseMachine (match-01)", () => {
  it("walks champSelect -> [intermission -> combat -> resolution]* and rounds increment", () => {
    cover("phase-machine-transitions");
    const pm = new PhaseMachine(FAST);
    expect(pm.phase).toBe("champSelect");
    expect(pm.round).toBe(0);
    pm.advance();
    expect(pm.phase).toBe("intermission");
    expect(pm.round).toBe(1);
    pm.advance();
    expect(pm.phase).toBe("combat");
    pm.advance();
    expect(pm.phase).toBe("resolution");
    pm.advance();
    expect(pm.phase).toBe("intermission");
    expect(pm.round).toBe(2);
    pm.end();
    expect(pm.phase).toBe("matchEnd");
  });
});

describe("PairedDuels (match-02, match-03)", () => {
  it("4-team round-robin rotates; 3 teams get a rotating bye; 2 teams single duel", () => {
    cover("paired-duels-pairing");
    const four = [0, 1, 2, 3].map(asTeamId);
    const r1 = pairTeams(four, 1);
    const r2 = pairTeams(four, 2);
    const r3 = pairTeams(four, 3);
    const key = (p: { sideA: TeamId; sideB: TeamId }): string => `${p.sideA}v${p.sideB}`;
    // every team appears exactly once per round
    for (const r of [r1, r2, r3]) {
      const seen = new Set(r.pairings.flatMap((p) => [p.sideA, p.sideB]));
      expect(seen.size).toBe(4);
      expect(r.bye).toBeNull();
    }
    // schedules differ across the 3-round cycle
    expect(new Set([...r1.pairings.map(key), ...r2.pairings.map(key), ...r3.pairings.map(key)]).size).toBe(6);
    // round 4 repeats round 1
    expect(pairTeams(four, 4).pairings.map(key)).toEqual(r1.pairings.map(key));

    const three = [0, 2, 3].map(asTeamId);
    const byes = [1, 2, 3].map((r) => pairTeams(three, r).bye);
    expect(new Set(byes).size).toBe(3); // bye rotates
    for (let r = 1; r <= 3; r++) {
      expect(pairTeams(three, r).pairings).toHaveLength(1);
    }

    const two = [1, 3].map(asTeamId);
    expect(pairTeams(two, 5).pairings).toEqual([{ zone: 0, sideA: 1, sideB: 3 }]);
  });

  it("lives lost scales with round", () => {
    cover("paired-duels-lives");
    expect(livesLost(1)).toBe(1);
    expect(livesLost(2)).toBe(1);
    expect(livesLost(3)).toBe(2);
    expect(livesLost(4)).toBe(2);
    expect(livesLost(5)).toBe(3);
    expect(livesLost(9)).toBe(3);
  });
});

describe("full bot match (match-04, match-09, match-10)", () => {
  it("12 bots run to matchEnd with placements 1-4 and lives decrement", () => {
    cover("match-full-bots");
    cover("combat-resolution");
    const ctl = new MatchController("m1", 1234, allBots(), FAST);
    const ticks = runToEnd(ctl);
    expect(ctl.phase.phase).toBe("matchEnd");
    expect(ticks).toBeLessThan(60000);
    expect(ctl.result).not.toBeNull();

    const placements = ctl.result!.teams.map((t) => t.placement).sort();
    expect(placements).toEqual([1, 2, 3, 4]);
    // exactly one team still has lives (the winner)
    const winners = [...ctl.lives.entries()].filter(([, l]) => l > 0);
    expect(winners).toHaveLength(1);
    expect(ctl.placements.get(winners[0]![0])).toBe(1);
    // rounds actually happened and kills were recorded
    expect(ctl.result!.rounds).toBeGreaterThanOrEqual(2);
    const totalKills = [...ctl.kills.values()].reduce((a, b) => a + b, 0);
    expect(totalKills).toBeGreaterThan(0);
  });

  it("same seed + same specs -> identical result (match-10)", () => {
    cover("match-deterministic");
    const run = (): string => {
      const ctl = new MatchController("m1", 4242, allBots(), FAST);
      runToEnd(ctl);
      return JSON.stringify({
        r: ctl.result?.teams.map((t) => ({ p: t.placement, k: t.members.map((m) => m.kills) })),
        rounds: ctl.result?.rounds,
        digest: ctl.world.digest(),
      });
    };
    expect(run()).toBe(run());
  });
});

describe("driver seam (match-05, match-06)", () => {
  it("swapping AI->Human->AI at tick boundaries preserves entity state", () => {
    cover("driver-swap-seam");
    const ctl = new MatchController("m2", 99, allBots(), FAST);
    // run into the first combat
    while (ctl.phase.phase !== "combat") ctl.tick();
    for (let i = 0; i < 60; i++) ctl.tick();

    const seat = ctl.seats.get(asSeatId(0))!;
    const entity = seat.entityId!;
    const hpBefore = ctl.world.health.get(entity)!.hp;
    const goldBefore = ctl.world.champion.get(entity)!.gold;
    const posBefore = { ...ctl.world.transform.get(entity)!.pos };

    // human takes over (e.g. reconnect) — swap applies at NEXT tick boundary
    const human = new HumanDriver();
    seat.setDriver(human);
    expect(seat.driverKind).toBe("ai"); // not yet applied mid-tick
    ctl.tick();
    expect(seat.driverKind).toBe("human");
    // entity state untouched by the swap itself
    expect(ctl.world.health.get(entity)!.hp).toBeLessThanOrEqual(hpBefore); // only combat can change it
    expect(ctl.world.champion.get(entity)!.gold).toBe(goldBefore);
    expect(seat.entityId).toBe(entity);

    // hand back to AI: swap applies at the next boundary and the seat keeps
    // the same entity + inventory (nothing to migrate — that's the seam's point)
    void posBefore;
    seat.setDriver(new AIDriver());
    expect(seat.driverKind).toBe("human"); // pending until boundary
    ctl.tick();
    expect(seat.driverKind).toBe("ai");
    expect(seat.entityId).toBe(entity);
    expect(ctl.world.champion.get(entity)!.gold).toBe(goldBefore);
  });

  it("AI makes intermission decisions: ranks abilities, buys items, picks offers, readies (match-06)", () => {
    cover("ai-intermission");
    const ctl = new MatchController("m3", 7, allBots(), FAST);
    // run through round 1 into ROUND 2 combat: by then round rewards + the
    // round-2 item gacha have landed, so economy decisions are observable
    // (500 starting gold can't afford any buildPriority item in round 1).
    let guard = 0;
    while (!(ctl.phase.phase === "combat" && ctl.phase.round >= 2) && guard++ < 20000) ctl.tick();
    expect(ctl.phase.round).toBeGreaterThanOrEqual(2);

    let anyItems = 0;
    let anyAugments = 0;
    let anyRanked = 0;
    for (const seat of ctl.seats.values()) {
      const champ = ctl.world.champion.get(seat.entityId!)!;
      anyItems += champ.items.filter((i) => i !== null).length;
      anyAugments += champ.augments.length;
      const ab = ctl.world.abilities.get(seat.entityId!)!;
      anyRanked += ab.slots.Q.rank + ab.slots.W.rank + ab.slots.E.rank + ab.slots.R.rank;
    }
    expect(anyItems).toBeGreaterThan(0); // round-2 gacha + any affordable buys
    expect(anyAugments).toBeGreaterThan(0); // round-1 silver offers were picked
    expect(anyRanked).toBeGreaterThan(12); // Q starts learned (12) + level-up points spent
    // offers consumed at combat start
    expect(ctl.offers.size).toBe(0);
  });
});

describe("no-pick champ-select auto-assign (match-nopick)", () => {
  // #130: letting the champ-select clock run out must NOT strand the player in a
  // dead/spectator state (0 HP, ☠觀戰中). autoPickAndSpawn assigns a random
  // ENABLED, model-backed champion and spawns it ALIVE.
  const oneHumanRestBots = (): SeatSpec[] =>
    Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: i !== 0 }));

  it("human never picks -> spawns ALIVE with a valid model-backed champion in round 1", () => {
    cover("match-nopick-alive");
    const ctl = new MatchController("nopick", 1234, oneHumanRestBots(), FAST);
    const seat0 = ctl.seats.get(asSeatId(0))!;
    seat0.setDriver(new HumanDriver()); // a real human seat…
    // …that NEVER calls selectChampion: run the champ-select clock to expiry
    while (ctl.phase.phase === "champSelect") ctl.tick();

    // a champion was auto-assigned, and it is a real champion with a model key
    // (not "" / stale). NB: unit tests register skeleton champions but not the
    // Models registry, so model-backing is enforced in-controller via
    // randomChampionPool + isEnabledSpawnablePick; here we assert the champion
    // resolves and carries a modelKey.
    expect(seat0.championId.length).toBeGreaterThan(0);
    const def = Champions.tryGet(seat0.championId as never);
    expect(def).toBeDefined();
    expect(def!.modelKey.length).toBeGreaterThan(0);
    // an entity exists and is alive with real HP (never a 0-HP spectator)
    expect(seat0.entityId).not.toBeNull();
    const hp = ctl.world.health.get(seat0.entityId!)!;
    expect(hp.maxHp).toBeGreaterThan(0);

    // …and it is still alive once round-1 combat actually starts
    while (ctl.phase.phase !== "combat") ctl.tick();
    const hpCombat = ctl.world.health.get(seat0.entityId!)!;
    expect(hpCombat.alive).toBe(true);
    expect(hpCombat.hp).toBeGreaterThan(0);
  });

  it("a stale/invalid pre-set champion is re-rolled, not spawned broken (match-nopick)", () => {
    cover("match-nopick-alive");
    // Under the dev bypass whitelist, allowsChampion() is true for ANY string —
    // so an invalid id must be caught by the model-backed guard, else spawnChampion
    // throws / spawns an un-renderable unit (the 0-HP spectator symptom).
    const specs: SeatSpec[] = Array.from({ length: 12 }, (_, i) => ({
      seatId: i,
      teamId: Math.floor(i / 3),
      isBot: true,
      ...(i === 0 ? { championId: "godie-not-a-real-champion" } : {}),
    }));
    const ctl = new MatchController("stale", 77, specs, FAST);
    expect(() => {
      while (ctl.phase.phase === "champSelect") ctl.tick();
    }).not.toThrow();
    const seat0 = ctl.seats.get(asSeatId(0))!;
    expect(Champions.tryGet(seat0.championId as never)).toBeDefined();
    expect(seat0.entityId).not.toBeNull();
    expect(ctl.world.health.get(seat0.entityId!)!.maxHp).toBeGreaterThan(0);
  });
});

describe("hmac + tickets (match-07, match-08)", () => {
  it("sign/verify roundtrip; tamper + skew rejected", () => {
    cover("game-hmac");
    const secret = "s3cret";
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ a: 1 });
    const auth = sign(secret, ts, body);
    expect(verify(secret, ts, body, auth)).toBe(true);
    expect(verify(secret, ts, body + " ", auth)).toBe(false); // body tamper
    expect(verify("other", ts, body, auth)).toBe(false); // wrong secret
    const oldTs = String(Math.floor(Date.now() / 1000) - 3600);
    expect(verify(secret, oldTs, body, sign(secret, oldTs, body))).toBe(false); // skew
  });

  it("seat tickets verify and expire", () => {
    cover("game-ticket");
    const secret = "s3cret";
    const t = mintTicket(secret, "acct_123", 120);
    expect(verifyTicket(secret, t)).toBe("acct_123");
    expect(verifyTicket("other", t)).toBeNull();
    const expired = mintTicket(secret, "acct_123", -10);
    expect(verifyTicket(secret, expired)).toBeNull();
    expect(verifyTicket(secret, "garbage")).toBeNull();
  });
});

describe("input mailbox (match-11)", () => {
  it("drops stale seqs, keeps latest order, queues commands", () => {
    cover("input-mailbox-seq");
    const mb = new InputMailbox();
    mb.push({ seq: 1, order: { kind: "move", point: { x: 1, z: 1 } } });
    mb.push({ seq: 3, order: { kind: "move", point: { x: 3, z: 3 } } });
    mb.push({ seq: 2, order: { kind: "move", point: { x: 2, z: 2 } } }); // stale
    mb.push({ seq: 4, commands: [{ kind: "ready" }] });
    const frame = mb.drain();
    expect(frame.order).toEqual({ kind: "move", point: { x: 3, z: 3 } });
    expect(frame.commands).toEqual([{ kind: "ready" }]);
    // drained
    const empty = mb.drain();
    expect(empty.order).toBeUndefined();
    expect(empty.commands).toEqual([]);
  });
});

describe("snapshot projection (match-12)", () => {
  it("projects seats/teams/entities into the schema", () => {
    cover("snapshot-projection");
    const ctl = new MatchController("m4", 55, allBots(), FAST);
    while (ctl.phase.phase !== "combat") ctl.tick();
    for (let i = 0; i < 30; i++) ctl.tick();

    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());

    expect(state.phase).toBe("combat");
    expect(state.round).toBe(1);
    expect(state.teams.length).toBe(4);
    expect(state.seats.size).toBe(12);
    // 12 champions projected with model keys + hp
    let champs = 0;
    state.entities.forEach((e) => {
      if (e.kind === 0) {
        champs++;
        expect(e.key.startsWith("champ.")).toBe(true);
        expect(e.maxHp).toBeGreaterThan(0);
      }
    });
    expect(champs).toBe(12);
    // seat projection carries economy
    const seat0 = state.seats.get("0")!;
    expect(seat0.championId.length).toBeGreaterThan(0);
    expect(seat0.gold).toBeGreaterThanOrEqual(0);
    expect(seat0.abilityRanks.length).toBe(4);
  });
});
