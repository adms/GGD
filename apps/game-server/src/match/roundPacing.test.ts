/**
 * roundPacing.test.ts — MATCH-LEVEL wiring for the round-pacing fire ring
 * (task #132) and the neutral duel-zone guardian (task #89), plus their
 * coordination with the round-settle freeze (task #100).
 *
 * The sim CORES are unit-tested next to their code (sim/fireRing.test.ts,
 * sim/systems/GuardianSystem.test.ts). These tests prove the CONTROLLER wires
 * them into the combat lifecycle: armed on combat entry, disarmed on combat
 * exit, gated so a settled round stops the ring, and DETERMINISTIC end-to-end
 * through the full bot-match flow (same seed → identical digest).
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { asSeatId } from "@ggd/shared/ids";
import type { EntityId } from "@ggd/shared/ids";
import type { SimEvent } from "@ggd/shared/sim/SimWorld";
import {
  DEFAULT_GUARDIAN_TOWER_CONFIG,
  type FireRingConfig,
} from "@ggd/shared/content";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({
    seatId: i,
    teamId: Math.floor(i / 3),
    isBot: true,
  }));

/** champSelect ends instantly; combat stays open long so WE decide when to settle. */
const CFG = {
  champSelectTicks: 1,
  intermissionTicks: 20,
  combatMaxTicks: 3000,
  resolutionTicks: 60,
};

/**
 * A fast ring (#195 shape): ignites 0.3 s into combat and closes over 0.5 s, so
 * champions standing anywhere in the zone are outside it almost immediately and
 * the whole arm→ignite→shrink→burn→settle path runs inside a short test.
 */
const FIRE_RING: FireRingConfig = {
  startSec: 0.3, // 9 ticks @30Hz
  shrinkSec: 0.5, // 15 ticks to fully closed
  minRadius: 0.5,
  burnPctPerSecStart: 0.3,
  burnPctPerSecEnd: 0.6,
  maxPctPerSec: 1,
};

const GUARDIAN_RULES: ArenaRules = {
  ...DEFAULT_ARENA_RULES,
  guardianTower: DEFAULT_GUARDIAN_TOWER_CONFIG,
};

/** Drive to the first combat phase. */
function toCombat(ctl: MatchController): void {
  let guard = 0;
  while (ctl.phase.phase !== "combat" && guard++ < 5000) ctl.tick();
  expect(ctl.phase.phase).toBe("combat");
}

/** Tick once and return a COPY of the events emitted that tick. */
function tickEvents(ctl: MatchController): SimEvent[] {
  ctl.tick();
  return [...ctl.world.events];
}

describe("fire-ring wired into the combat lifecycle (#132)", () => {
  it("arms on combat entry, ignites + burns during combat, disarms on round exit", () => {
    cover("match-firering-wired");
    const ctl = new MatchController("rp-fire", 4242, allBots(), CFG, 3, DEFAULT_ARENA_RULES, undefined, undefined, undefined, FIRE_RING);
    toCombat(ctl);

    // armed at combat entry: rules present, counter started at 0.
    expect(ctl.world.fireRingRules).not.toBeNull();
    expect(ctl.world.fireRingTicks).toBe(0);

    // run combat and watch the ring ignite (exactly one fireRingStart) then bite
    // (fireRingDamage on champions once the grace step passes).
    let ignitions = 0;
    let burns = 0;
    for (let i = 0; i < 40; i++) {
      for (const ev of tickEvents(ctl)) {
        if (ev.type === "fireRingStart") ignitions++;
        if (ev.type === "fireRingDamage") burns++;
      }
      if (ctl.phase.phase !== "combat") break; // ring may wipe the round
    }
    expect(ignitions).toBe(1); // ignites exactly once per round
    expect(burns).toBeGreaterThan(0); // and actually burns living champions

    // settle the round (still in combat): the ring must be disarmed + re-idled.
    if (ctl.phase.phase === "combat") {
      ctl.applyCheat(asSeatId(0), { kind: "skipPhase" });
    }
    expect(ctl.world.combatActive).toBe(false);
    expect(ctl.world.fireRingRules).toBeNull(); // disarmed on combat exit
    expect(ctl.world.fireRingTicks).toBe(-1); //   counter re-idled
  });

  it("a settled round stops the ring — no burn through resolution (coordinates with #100)", () => {
    cover("match-firering-wired");
    const ctl = new MatchController("rp-fire2", 77, allBots(), CFG, 3, DEFAULT_ARENA_RULES, undefined, undefined, undefined, FIRE_RING);
    toCombat(ctl);
    // let it ignite so the ring is definitely live before we settle.
    for (let i = 0; i < 20 && ctl.phase.phase === "combat"; i++) ctl.tick();

    if (ctl.phase.phase === "combat") ctl.applyCheat(asSeatId(0), { kind: "skipPhase" });
    expect(ctl.phase.phase).toBe("resolution");
    expect(ctl.world.combatActive).toBe(false);

    // across the whole frozen resolution beat NOT ONE fire-ring event fires.
    for (let i = 0; i < 40; i++) {
      for (const ev of tickEvents(ctl)) {
        expect(ev.type).not.toBe("fireRingStart");
        expect(ev.type).not.toBe("fireRingDamage");
      }
      if (ctl.phase.phase !== "resolution") break;
    }
  });
});

describe("guardian wired into the combat lifecycle (#89)", () => {
  it("spawns one neutral guardian per ACTIVE duel zone on combat entry", () => {
    cover("match-guardian-wired");
    const ctl = new MatchController("rp-guard", 4242, allBots(), CFG, 3, GUARDIAN_RULES);
    toCombat(ctl);

    expect(ctl.world.guardianRules).not.toBeNull();
    // one guardian per pairing zone (the bye, if any, gets none).
    const zones = new Set(ctl.pairings.map((p) => p.zone));
    expect(ctl.world.structure.size).toBe(zones.size);
    for (const [id, sc] of ctl.world.structure) {
      expect(zones.has(sc.zone)).toBe(true);
      // NEUTRALITY: a guardian carries transform+health+structure and nothing
      // that any team/champion iteration reads.
      expect(ctl.world.team.has(id)).toBe(false);
      expect(ctl.world.champion.has(id)).toBe(false);
      expect(ctl.world.stats.has(id)).toBe(false);
      expect(ctl.world.nav.has(id)).toBe(false);
      expect(ctl.world.matchStats.has(id)).toBe(false);
    }
    // team lives untouched by guardian presence.
    for (const l of ctl.lives.values()) expect(l).toBe(3);

    // STATIC TERRAIN: the guardian stands at the zone CENTRE and must not drift.
    // Its body coincides with the skeleton arena's centre pillar, so without the
    // structure-is-static rule in MovementSystem the obstacle push-out would
    // eject it ~one body-width off its post every combat tick, and colliding
    // champions would shove it. Run real combat ticks and assert it holds.
    const posts = [...ctl.world.structure].map(([id, sc]) => ({
      id,
      center: { ...ctl.arena.zones[sc.zone]!.center },
    }));
    for (const p of posts) {
      const t = ctl.world.transform.get(p.id)!;
      expect(t.pos.x).toBeCloseTo(p.center.x, 6);
      expect(t.pos.z).toBeCloseTo(p.center.z, 6);
    }
    for (let i = 0; i < 20 && ctl.phase.phase === "combat"; i++) ctl.tick();
    for (const p of posts) {
      const t = ctl.world.transform.get(p.id);
      if (!t) continue; // a guardian a bot happened to kill is fine
      expect(t.pos.x).toBeCloseTo(p.center.x, 6);
      expect(t.pos.z).toBeCloseTo(p.center.z, 6);
    }
  });

  it("last hit pays the killer exactly once, then the guardian despawns", () => {
    cover("match-guardian-wired");
    const ctl = new MatchController("rp-guard-kill", 9182, allBots(), CFG, 3, GUARDIAN_RULES);
    toCombat(ctl);

    // pick a guardian and a champion sharing its zone to take the last hit.
    const [guardianId, sc] = [...ctl.world.structure][0]!;
    const zone = sc.zone;
    let killer: EntityId | null = null;
    let killerSeat = -1;
    for (const seat of ctl.seats.values()) {
      if (seat.entityId === null) continue;
      const t = ctl.world.transform.get(seat.entityId);
      const hp = ctl.world.health.get(seat.entityId);
      if (t?.zone === zone && hp?.alive) {
        killer = seat.entityId;
        killerSeat = seat.seatId;
        break;
      }
    }
    expect(killer).not.toBeNull();
    const goldBefore = ctl.world.champion.get(killer!)!.gold;

    // The per-packet clamp (§5.3 `maxHitPctMaxHp`) caps ONE packet at 15% of the
    // guardian's maxHp, so no single burst — not even 100000 — can delete the
    // tower: soften it to its last hit point first, then land the finishing blow.
    ctl.world.health.get(guardianId)!.hp = 1;

    // queue a lethal packet from the champion, then step: combatResolve applies
    // it, deathSystem drops the guardian, guardianSystem pays the last-hitter.
    ctl.world.damageQueue.push({
      source: killer!,
      target: guardianId,
      amount: 100000,
      type: "physical",
      crit: false,
      origin: "test",
    });
    const evs = tickEvents(ctl);

    const slain = evs.filter((e) => e.type === "guardianSlain");
    expect(slain).toHaveLength(1); // paid exactly once
    expect(slain[0]!.data.gold).toBe(DEFAULT_GUARDIAN_TOWER_CONFIG.rewardGold);
    expect(slain[0]!.data.killerSeatId).toBe(killerSeat);
    // killer got at least the guardian reward gold, and the guardian is gone.
    expect(ctl.world.champion.get(killer!)!.gold).toBeGreaterThanOrEqual(
      goldBefore + DEFAULT_GUARDIAN_TOWER_CONFIG.rewardGold,
    );
    expect(ctl.world.structure.has(guardianId)).toBe(false);

    // guardian death is NOT a champion kill: no seat's kill count moved for it
    // (the death carried killer=our champ but victim is a neutral structure).
    // (guarded indirectly: structure had no seat, so K/D can't have changed.)
  });

  it("despawns every guardian on combat exit (no post-round farming)", () => {
    cover("match-guardian-wired");
    const ctl = new MatchController("rp-guard-exit", 55, allBots(), CFG, 3, GUARDIAN_RULES);
    toCombat(ctl);
    expect(ctl.world.structure.size).toBeGreaterThan(0);

    ctl.applyCheat(asSeatId(0), { kind: "skipPhase" }); // settle the round
    expect(ctl.phase.phase).toBe("resolution");
    expect(ctl.world.structure.size).toBe(0); // every guardian despawned
    expect(ctl.world.guardianRules).toBeNull(); // mechanic disarmed
    expect(ctl.world.guardianBuffs.size).toBe(0); // inherited buffs dropped too
  });
});

describe("round-pacing determinism (#132 + #89 + #100)", () => {
  it("same seed + fire ring + guardians → byte-identical digest end to end", () => {
    cover("match-roundpace-determinism");
    const build = (): MatchController =>
      new MatchController("rp-det", 24680, allBots(), CFG, 3, GUARDIAN_RULES, undefined, undefined, undefined, FIRE_RING);
    const a = build();
    const b = build();
    // run well past several full rounds (ring wipes settle rounds quickly), so
    // guardian spawns/despawns, fire-ring burns and settle-freezes all replay.
    for (let i = 0; i < 3000; i++) {
      a.tick();
      b.tick();
      if (i % 500 === 0) expect(a.world.digest()).toBe(b.world.digest());
    }
    expect(a.world.digest()).toBe(b.world.digest());
    expect(a.phase.phase).toBe(b.phase.phase);
    expect(a.phase.round).toBe(b.phase.round);
  });
});
