/**
 * MobSystem (task #215 肉鴿小怪波) — the roguelite mob-wave mechanic. Covers the
 * schedule numbers (wave k → min(k,cap) mobs, sec1→1 sec3→2 …), the per-zone
 * alive cap, deterministic edge spawn positions, the +gold/+xp kill reward, the
 * every-30-kills level grant, and the two determinism invariants: byte-identical
 * when the mechanic is OFF, and reproducible across seeded runs when ON.
 *
 * Damage is driven straight into `world.damageQueue` (the same queue every
 * ability/auto drains through) so these tests exercise the mob in isolation,
 * without depending on the client/AI targeting seam.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import {
  type MobRules,
  MONSTER_TEAM,
  MOB_MODEL_KEY,
  mobRulesFromConfig,
  mobSpawnPos,
  mobsAliveInZone,
  mixInt,
} from "../mobs";
import { beginCombatMobs, endCombatMobs, mobSystem } from "./MobSystem";
import { DEFAULT_MOB_WAVES_CONFIG } from "../../content/schema/config";

beforeAll(() => registerSkeletonContent());

/**
 * Fast, precise tick counts for the schedule tests.
 *
 * #217 added `level` / `hpRegenPerSec` / `modelKey` to MobRules. This fixture
 * pins the ROUND-3 FLOOR (level 3) and `hpRegenPerSec: 0` deliberately: every
 * assertion below predates #217 and must keep measuring exactly what it measured
 * before, so the levelling is exercised in `mobs.level.test.ts` instead of
 * silently perturbing the schedule/reward/determinism suites here.
 */
const RULES: MobRules = {
  fromRound: 3,
  firstWaveTicks: 2,
  waveIntervalTicks: 3,
  mobsPerWaveCap: 3,
  maxAlivePerZone: 5,
  level: 3,
  maxHp: 120,
  moveSpeed: 3,
  hpRegenPerSec: 0,
  modelKey: MOB_MODEL_KEY,
  attackDamage: 12,
  attackRangeSq: 1.8 * 1.8,
  attackCdTicks: 3,
  radius: 0.6,
  rewardGold: 20,
  rewardXp: 40,
  killsPerLevel: 30,
};

const newWorld = (seed = 1): SimWorld => {
  const w = new SimWorld(SKELETON_ARENA, seed);
  w.combatActive = true;
  return w;
};

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

describe("MobSystem — wave schedule (#215)", () => {
  it("wave k spawns min(k, cap) mobs, respecting the per-zone alive cap", () => {
    cover("mob-wave-schedule");
    const w = newWorld();
    beginCombatMobs(w, RULES, [0]);
    // no champions in the world → spawned mobs have no target and stand still,
    // so the alive count is a clean running total of what each wave spawned.

    // wave 1 at mobTicks=2 → min(1,3)=1
    step(w, 2);
    expect(mobsAliveInZone(w, 0)).toBe(1);
    // wave 2 at mobTicks=5 → +min(2,3)=2 → 3
    step(w, 3);
    expect(mobsAliveInZone(w, 0)).toBe(3);
    // wave 3 at mobTicks=8 → wants +3 but cap is 5 → +2 → 5
    step(w, 3);
    expect(mobsAliveInZone(w, 0)).toBe(5);
    // wave 4 at mobTicks=11 → already at the cap → +0
    step(w, 3);
    expect(mobsAliveInZone(w, 0)).toBe(5);
  });

  it("matches the SPEC cadence: sec1→1, sec3→2, sec5→3 (config numbers, TICK_HZ=30)", () => {
    cover("mob-wave-cadence");
    const rules = mobRulesFromConfig(
      { ...DEFAULT_MOB_WAVES_CONFIG, maxAlivePerZone: 999 },
      1 / 30,
    );
    // firstWaveSec=1 → 30 ticks; waveIntervalSec=2 → 60 ticks. Wave k lands at
    // combat-second (2k-1): tick 30 (s1), 90 (s3), 150 (s5).
    expect(rules.firstWaveTicks).toBe(30);
    expect(rules.waveIntervalTicks).toBe(60);
    // #217: the `round` argument is optional and defaults to `fromRound`, i.e.
    // the level FLOOR — which is exactly what this pre-#217 call site means.
    expect(rules.level).toBe(DEFAULT_MOB_WAVES_CONFIG.mob.baseLevel);
    const w = newWorld();
    beginCombatMobs(w, rules, [0]);
    step(w, 30); // s1
    expect(mobsAliveInZone(w, 0)).toBe(1);
    step(w, 60); // s3
    expect(mobsAliveInZone(w, 0)).toBe(1 + 2);
    step(w, 60); // s5
    expect(mobsAliveInZone(w, 0)).toBe(1 + 2 + 3);
  });

  it("does not spawn before the first wave, and freezes when combat settles", () => {
    cover("mob-wave-gates");
    const w = newWorld();
    beginCombatMobs(w, RULES, [0]);
    step(w, 1); // mobTicks=1 < firstWaveTicks=2
    expect(mobsAliveInZone(w, 0)).toBe(0);
    // settle combat: the clock (and every spawn) freezes
    w.combatActive = false;
    const before = w.mobTicks;
    step(w, 10);
    expect(w.mobTicks).toBe(before); // no advance while settled
    expect(mobsAliveInZone(w, 0)).toBe(0);
  });
});

describe("MobSystem — spawned entity shape (#215)", () => {
  it("a mob carries transform+health+nav+MONSTER team but NO champion/stats", () => {
    cover("mob-entity-shape");
    const w = newWorld();
    beginCombatMobs(w, RULES, [0]);
    step(w, 2);
    const [id] = [...w.mob.keys()];
    expect(id).toBeDefined();
    expect(w.transform.has(id!)).toBe(true);
    expect(w.health.get(id!)?.maxHp).toBe(RULES.maxHp);
    expect(w.nav.has(id!)).toBe(true);
    expect(w.team.get(id!)?.teamId).toBe(MONSTER_TEAM);
    expect(w.champion.has(id!)).toBe(false);
    expect(w.stats.has(id!)).toBe(false);
    expect(w.abilities.has(id!)).toBe(false);
  });
});

describe("MobSystem — deterministic edge positions (#215)", () => {
  it("mobSpawnPos is a pure function of (zone,k,i) — identical across worlds", () => {
    cover("mob-edge-pos-pure");
    const a = newWorld(1);
    const b = newWorld(999); // different seed must NOT matter (zero rng draws)
    for (let k = 1; k <= 4; k++) {
      for (let i = 0; i < 5; i++) {
        const pa = mobSpawnPos(a, 0, k, i, RULES.radius);
        const pb = mobSpawnPos(b, 0, k, i, RULES.radius);
        expect(pa).toEqual(pb);
      }
    }
    // and the shared rng stream is untouched by spawning (guardian-style)
    const before = a.rng.state;
    mobSpawnPos(a, 0, 2, 3, RULES.radius);
    expect(a.rng.state).toBe(before);
  });

  it("mixInt is a stable unsigned 32-bit integer hash", () => {
    cover("mob-mixint");
    expect(mixInt(0, 1, 2)).toBe(mixInt(0, 1, 2));
    expect(mixInt(0, 1, 2)).not.toBe(mixInt(0, 1, 3));
    expect(mixInt(1, 2, 3)).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(mixInt(5, 5, 5))).toBe(true);
  });
});

describe("MobSystem — kill rewards (#215)", () => {
  it("a champion killer earns +gold and +xp per mob kill", () => {
    cover("mob-kill-reward");
    const w = newWorld();
    beginCombatMobs(w, RULES, [0]);
    const killer = champAt(w, 0, 0, -40, 0);
    const goldBefore = w.champion.get(killer)!.gold;
    const xpBefore = w.champion.get(killer)!.xp;
    // spawn a wave, then last-hit one mob
    step(w, 2);
    const [mobId] = [...w.mob.keys()];
    w.damageQueue.push({
      source: killer,
      target: mobId!,
      amount: 1000,
      type: "physical",
      crit: false,
      origin: "ability:test",
    });
    step(w, 1); // resolve(8) kills it, death(9) credits killer, mobSystem(9d') pays
    const champ = w.champion.get(killer)!;
    expect(champ.gold).toBe(goldBefore + RULES.rewardGold);
    expect(champ.xp).toBeGreaterThanOrEqual(xpBefore + 1); // 40 xp granted (no level yet)
    expect(w.mobKills.get(killer)).toBe(1);
    expect(w.mob.has(mobId!)).toBe(false); // corpse despawned
  });

  it("every 30th mob kill grants the killer +1 level", () => {
    cover("mob-kill-level");
    const w = newWorld();
    beginCombatMobs(w, RULES, [0]);
    const killer = champAt(w, 0, 0, -40, 0);
    w.champion.get(killer)!.level = 1;
    w.champion.get(killer)!.xp = 0;
    w.mobKills.set(killer, 29); // the NEXT kill is the 30th
    step(w, 2);
    const [mobId] = [...w.mob.keys()];
    w.damageQueue.push({
      source: killer,
      target: mobId!,
      amount: 1000,
      type: "physical",
      crit: false,
      origin: "ability:test",
    });
    step(w, 1);
    expect(w.mobKills.get(killer)).toBe(30);
    expect(w.champion.get(killer)!.level).toBe(2); // grantLevels(1) fired
  });

  it("the mob-kill tally is MATCH-cumulative — a remainder survives the round boundary (owner #215)", () => {
    cover("mob-kill-cumulative");
    const w = newWorld();
    const killer = champAt(w, 0, 0, -40, 0);
    w.champion.get(killer)!.level = 1;

    // Round A: reach a 29-kill remainder, then the round ends.
    beginCombatMobs(w, RULES, [0]);
    w.mobKills.set(killer, 29);
    step(w, 2); // mobs on the field
    endCombatMobs(w);
    expect(w.mob.size).toBe(0); // entities despawn — no post-round PvE farming
    expect(w.mobKills.get(killer)).toBe(29); // …but the tally CARRIES OVER

    // Round B: the very next kill is the 30th ACROSS THE MATCH → +1 level.
    beginCombatMobs(w, RULES, [0]);
    expect(w.mobKills.get(killer)).toBe(29); // begin→end preserves it too
    step(w, 2);
    const [mobId] = [...w.mob.keys()];
    w.damageQueue.push({
      source: killer,
      target: mobId!,
      amount: 1000,
      type: "physical",
      crit: false,
      origin: "ability:test",
    });
    step(w, 1);
    expect(w.mobKills.get(killer)).toBe(30);
    expect(w.champion.get(killer)!.level).toBe(2); // the cross-round tally levels him
  });

  it("a mob killed by a NON-champion pays nobody", () => {
    cover("mob-kill-no-champ");
    const w = newWorld();
    beginCombatMobs(w, RULES, [0]);
    step(w, 2);
    const ids = [...w.mob.keys()];
    // one mob kills another (source is a mob, not a champion)
    w.damageQueue.push({
      source: ids[0]!,
      target: ids[1] ?? ids[0]!,
      amount: 1000,
      type: "physical",
      crit: false,
      origin: "mob",
    });
    // need two live mobs for this; ensure a second wave exists
    step(w, 3); // reach wave 2 → >=3 mobs alive
    const victim = [...w.mob.keys()][0]!;
    w.damageQueue.push({
      source: [...w.mob.keys()][1]!,
      target: victim,
      amount: 1000,
      type: "physical",
      crit: false,
      origin: "mob",
    });
    step(w, 1);
    // no mobKills entry was ever created for a mob source
    expect([...w.mobKills.keys()].length).toBe(0);
  });
});

describe("MobSystem — melee AI (#215)", () => {
  it("a mob walks to the nearest enemy champion and deals melee damage", () => {
    cover("mob-melee");
    const w = newWorld();
    beginCombatMobs(w, RULES, [0]);
    const victim = champAt(w, 0, 0, -40, 0);
    const hpMax = w.health.get(victim)!.maxHp;
    step(w, 2); // spawn wave 1
    expect(w.mob.size).toBeGreaterThan(0);
    // mobs spawn at the zone RIM (~23u from the centre where the champion
    // stands), so give them time to walk in at BASE_MOVE_SPEED and land swings.
    step(w, 200);
    expect(w.health.get(victim)!.hp).toBeLessThan(hpMax);
    // the mob acquired the champion as its target
    const anyMob = [...w.mob.values()][0];
    if (anyMob) expect(anyMob.target === victim || anyMob.target === -1).toBe(true);
  });
});

describe("MobSystem — determinism (#215)", () => {
  it("is byte-identical to a never-armed world when the mechanic is OFF", () => {
    cover("mob-off-byte-identical");
    // world A: arm then immediately disarm → fields present but OFF
    const a = newWorld(7);
    champAt(a, 0, 0, -40, 0);
    beginCombatMobs(a, RULES, [0]);
    endCombatMobs(a);
    // world B: never touched the mob mechanic at all
    const b = newWorld(7);
    champAt(b, 0, 0, -40, 0);
    step(a, 50);
    step(b, 50);
    expect(a.mobTicks).toBe(-1);
    expect(a.mob.size).toBe(0);
    expect(a.mobKills.size).toBe(0);
    expect(a.digest()).toBe(b.digest());
  });

  it("two seeded runs with mobs ARMED produce identical digests", () => {
    cover("mob-armed-determinism");
    const build = (): SimWorld => {
      const w = newWorld(42);
      champAt(w, 0, 0, -40, 0);
      champAt(w, 1, 1, -40, 4);
      beginCombatMobs(w, RULES, [0]);
      return w;
    };
    const a = build();
    const b = build();
    step(a, 120);
    step(b, 120);
    expect(a.mob.size).toBeGreaterThan(0); // the mechanic actually ran
    expect(a.digest()).toBe(b.digest());
  });

  it("endCombatMobs despawns everything and stops the clock", () => {
    cover("mob-end-combat");
    const w = newWorld();
    beginCombatMobs(w, RULES, [0]);
    step(w, 8);
    expect(w.mob.size).toBeGreaterThan(0);
    endCombatMobs(w);
    expect(w.mob.size).toBe(0);
    // mobKills is deliberately NOT cleared (match-cumulative, #215); it is empty
    // here only because no champion landed a kill in this arm/disarm.
    expect(w.mobRules).toBe(null);
    expect(w.mobTicks).toBe(-1);
    // a disarmed system is a strict no-op
    mobSystem(w);
    expect(w.mobTicks).toBe(-1);
  });
});

describe("MobSystem — constants", () => {
  it("exposes the standin model key + MONSTER team sentinel", () => {
    cover("mob-constants");
    expect(typeof MOB_MODEL_KEY).toBe("string");
    expect(MOB_MODEL_KEY.length).toBeGreaterThan(0);
    // #217 REGRESSION: the reported symptom was a mob rendering as the KNIGHT
    // stand-in. The default key must be 喪標麥可's own model doc, never a
    // borrowed champion mesh.
    expect(MOB_MODEL_KEY).toBe("champ.godie-zombiex");
    expect(MOB_MODEL_KEY).not.toBe("champ.thorne");
    // MONSTER team is outside the player range 0..3
    expect(MONSTER_TEAM).toBeGreaterThan(3);
  });
});
