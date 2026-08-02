/**
 * 火圈燒殭屍 —— 回合一定會結束的保底機制 (owner 2026-07-30).
 *
 *   「火圈百分比真實傷害是所有場上玩家、bot、各種殭屍都會百分比真實傷害燒死，
 *     所以還是有個保底結果」
 *
 * WHAT WAS ACTUALLY BROKEN. #132/#195/#270 built the burn as a loop over
 * `world.champion` and nothing else — measured, not assumed: before this change
 * `FireRingSystem` touched exactly one store, so a zombie could stand in a fully
 * closed ring forever. That is fine while a round ends on 「一隊全滅」 and fatal
 * the moment it also waits on the field being clear: one zombie wedged in a
 * corner holds the round open with no other mechanic guaranteed to reach it.
 *
 * WHY THESE ASSERTIONS AND NOT OTHERS (七種故障 ④/⑦):
 *
 *   • every hp assertion READS `world.health` off the real entity after real
 *     `world.step()` ticks — never a config field, never a rules object. A test
 *     that asserted `rules.burnCurveRates[1] === 0.2` would pass against a burn
 *     that reaches nobody.
 *   • the 殭屍王 case is the one that separates PERCENT from FLAT: it carries
 *     276,944 hp — 92× the champion standing beside it — and the guard is that
 *     the two die within half a second of each other. Any flat-damage
 *     implementation passes 「hp went down」 and fails this.
 *   • one test proves the ring's SAFE region still protects a mob (a zombie at
 *     the zone centre is untouched until the ring closes on it), so 「burn the
 *     mobs」 cannot degenerate into 「damage every mob every tick」 and still pass.
 *   • the champion guard compares TWO WORLDS tick for tick, so 「英雄的既有行為
 *     不變」 is a measured equality rather than a re-derivation of the same
 *     formula the implementation uses.
 *
 * MUTATION RECORD (all four verified by hand, each reverted afterwards):
 *   1. delete `fireRingBurnMobs(world)` from MobSystem  → the 4 burn tests fail.
 *   2. `hp.maxHp * ratePerSec * dt` → `ratePerSec * dt` (flat)  → the king
 *      survives; the 同一時鐘 test fails while 「hp dropped」 still passes.
 *   3. drop the `fireRingIsSafe(...) continue` guard  → the centre-safe test
 *      fails (a mob at the centre burns from tick 1).
 *   4. iterate `world.champion` instead of `world.mob` in `fireRingBurnMobs`
 *      → the champion's burn doubles and the two-world equality test fails.
 *   5. `isBurnedByFireRing`: drop the `&& !world.mob.has(id)` mob exemption
 *      → the settled-zone test fails on the flag while the damage keeps
 *      arriving, i.e. exactly the flag/damage disagreement #216 warned about.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA, type ArenaDef } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { asEntityId, asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import {
  beginCombatFireRing,
  fireRingRulesFromConfig,
  isBurnedByFireRing,
  type FireRingRules,
} from "../fireRing";
import { normalizeCombatEnv } from "../combatEnv";
import { type MobRules, spawnMob, summonMobBoss, MOB_MODEL_KEY } from "../mobs";
import { beginCombatMobs } from "./MobSystem";

beforeAll(() => registerSkeletonContent());

const DT = 1 / 30;
const HZ = 30;

/**
 * The skeleton arena minus its pillars — same reasoning as
 * `FireRingSystem.test.ts`: an obstacle parked on the zone centre would push
 * bodies around and make these tests fail the day someone moves furniture.
 */
const OPEN_ARENA: ArenaDef = {
  id: "arena.mob-firering-open",
  name: "Mob Fire Ring Test Arena",
  zones: SKELETON_ARENA.zones.map((z) => ({ ...z, obstacles: [] })),
};
const ZONE0 = OPEN_ARENA.zones[0]!;
const ZONE1 = OPEN_ARENA.zones[1]!;

/** The SHIPPED ring shape, igniting immediately so a test is 20 s, not 80 s. */
function ringNow(): FireRingRules {
  return fireRingRulesFromConfig(
    {
      startSec: 0,
      shrinkSec: 20,
      minRadius: 0.5,
      maxPctPerSec: 1,
    },
    DT,
  );
}

/**
 * Mob rules whose WAVE SCHEDULE can never fire (`firstWaveTicks` is far beyond
 * any test's horizon), so every mob in these worlds is one this file placed on
 * purpose and the alive set is never polluted by a wave landing mid-assertion.
 * `hpRegenPerSec: 0` for the same reason `FireRingSystem.test.ts` pins the
 * shipped `maxHealth` multiplier — regen must not mask a small burn.
 */
const BASE_RULES: MobRules = {
  fromRound: 3,
  firstWaveTicks: 10_000_000,
  waveIntervalTicks: 10_000_000,
  mobsPerWaveCap: 1,
  maxAlivePerZone: 99,
  level: 3,
  maxHp: 24, // the shipped 一般殭屍 at its round-3 floor (arena-rules.json)
  moveSpeed: 3,
  hpRegenPerSec: 0,
  modelKey: MOB_MODEL_KEY,
  sizeMult: 0.68,
  tintStrength: 0.65,
  attackDamage: 1.2,
  attackRangeSq: 1.8 * 1.8,
  attackCdTicks: 30,
  radius: 0.6,
  rewardGold: 20,
  rewardXp: 40,
  killsPerLevel: 6,
  boss: null,
  special: null,
};

/**
 * 特殊殭屍 forced to 100 % (`chance: 1`), so `spawnMob` yields a special without
 * this file having to reach into `world.rng`. The multipliers are the shipped
 * ones (arena-rules.json `mobWaves.special`); `bounty: null` keeps the payout on
 * the pre-#288 flat path, which is irrelevant to a burn test and one less thing
 * to perturb.
 */
const SPECIAL_RULES: MobRules = {
  ...BASE_RULES,
  special: {
    chance: 1,
    hpMult: 2,
    damageMult: 1.5,
    moveSpeedMult: 0.5,
    radiusMult: 1.8,
    sizeMult: 2,
    rewardMult: 3,
    modelKey: MOB_MODEL_KEY,
    maxHp: null,
    attackDamage: null,
    bounty: null,
  },
};

/**
 * 殭屍王 at the number the owner actually ships against: 276,944 hp. That is the
 * whole reason the burn has to be a PERCENTAGE — a flat environmental tick is a
 * rounding error at this scale.
 */
const KING_HP = 276_944;
const BOSS_RULES: MobRules = {
  ...BASE_RULES,
  boss: {
    enabled: true,
    killThreshold: 100,
    repeatable: true,
    maxHp: KING_HP,
    attackDamage: 12,
    moveSpeed: 2.4,
    attackRangeSq: 2.6 * 2.6,
    attackCdTicks: 42,
    radius: 1.8,
    modelKey: MOB_MODEL_KEY,
    sizeMult: 10,
    bountyGold: 30_000,
    bountyXp: 1200,
    bountyLevels: 50,
    lastHitMultiplier: 2,
    lastHitMode: "bonus",
    countOverkill: false,
  },
};

function world(): SimWorld {
  const w = new SimWorld(OPEN_ARENA, 99);
  w.combatActive = true;
  // The SHIPPED maxHealth multiplier (#153) — see FireRingSystem.test.ts for
  // why: at the neutral 1.0 table a champion's flat healthRegen visibly bends
  // the closed form the burn arithmetic is compared against.
  w.combatEnv = normalizeCombatEnv({ maxHealth: 8.0 });
  return w;
}

const step = (w: SimWorld, n = 1): void => {
  for (let i = 0; i < n; i++) w.step(new Map());
};

let nextSeat = 0;
function champ(w: SimWorld, x: number, z: number, zone: number, team = 1): EntityId {
  return spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(nextSeat++ % 12),
    teamId: asTeamId(team),
    pos: { x, z },
    zone,
  });
}

/** Park a body at `dist` from its zone centre, on the +x axis. */
function parkAt(w: SimWorld, id: EntityId, zoneDef: (typeof OPEN_ARENA)["zones"][number], dist: number): void {
  const t = w.transform.get(id)!;
  t.pos.x = zoneDef.center.x + dist;
  t.pos.z = zoneDef.center.z;
  t.vel.x = 0;
  t.vel.z = 0;
}

/** Fire-ring damage dealt to `id` on the LAST stepped tick. */
function ringDmg(w: SimWorld, id: EntityId): number {
  let sum = 0;
  for (const ev of w.events) {
    if (ev.type === "fireRingDamage" && ev.data.id === id) sum += ev.data.amount as number;
  }
  return sum;
}

/**
 * Step until `id` dies, returning the tick it died on (-1 if it never did).
 * Watches the `death` EVENT rather than `world.health`, because MobSystem
 * destroys a mob's components on the same tick its death resolves — polling
 * `health.get(id)!.alive` would throw on the very tick the answer arrives.
 */
function tickOfDeath(w: SimWorld, id: EntityId, maxTicks: number): number {
  for (let t = 1; t <= maxTicks; t++) {
    step(w);
    if (w.events.some((e) => e.type === "death" && e.data.id === id)) return t;
  }
  return -1;
}

describe("火圈燒到每一種殭屍 —— 保底 (firering-burns-mobs)", () => {
  it("一般殭屍 outside the ring loses hp, read off world.health", () => {
    cover("firering-burns-mobs");
    const w = world();
    beginCombatMobs(w, BASE_RULES, [0]);
    beginCombatFireRing(w, ringNow());
    const id = spawnMob(w, 0, BASE_RULES, 1, 0);
    // 23.4 u = the farthest a 0.6-body may legally stand: safe on the ignition
    // tick, burning from the very first shrink tick.
    parkAt(w, id, ZONE0, 23.4);
    expect(w.health.get(id)!.hp).toBe(BASE_RULES.maxHp);

    step(w, 10);
    const hp = w.health.get(id)!;
    expect(hp.hp).toBeLessThan(hp.maxHp);
    expect(ringDmg(w, id)).toBeGreaterThan(0); // …and it is the RING doing it
  });

  it("特殊殭屍 outside the ring loses hp too", () => {
    cover("firering-burns-mobs");
    const w = world();
    beginCombatMobs(w, SPECIAL_RULES, [0]);
    beginCombatFireRing(w, ringNow());
    const id = spawnMob(w, 0, SPECIAL_RULES, 1, 0);
    expect(w.mob.get(id)!.kind).toBe("special"); // ⑤: the shipped roll, not a hand-set flag
    const maxHp = w.health.get(id)!.maxHp;
    expect(maxHp).toBe(BASE_RULES.maxHp * 2); // hpMult 2 really applied

    // a special's body is 1.8× wider (radius 1.08), so its legal rim is nearer.
    parkAt(w, id, ZONE0, ZONE0.boundaryRadius - w.transform.get(id)!.radius);
    step(w, 10);
    expect(w.health.get(id)!.hp).toBeLessThan(maxHp);
    expect(ringDmg(w, id)).toBeGreaterThan(0);
  });

  it("殭屍王 (276,944 hp) loses hp — the number the owner ships against", () => {
    cover("firering-burns-mobs");
    const w = world();
    beginCombatMobs(w, BOSS_RULES, [0]);
    beginCombatFireRing(w, ringNow());
    const id = summonMobBoss(w, 0, BOSS_RULES, asEntityId(1), 100)!;
    expect(id).not.toBeNull();
    expect(w.mob.get(id)!.kind).toBe("boss");
    expect(w.health.get(id)!.maxHp).toBe(KING_HP);

    parkAt(w, id, ZONE0, ZONE0.boundaryRadius - w.transform.get(id)!.radius);
    step(w, 10);
    const hp = w.health.get(id)!;
    expect(hp.hp).toBeLessThan(KING_HP);
    // PERCENT, not flat: 10 ticks at ~4 %/s of 276,944 is ~3,690, i.e. four
    // orders of magnitude above anything a flat environmental tick would do.
    expect(KING_HP - hp.hp).toBeGreaterThan(1000);
  });
});

describe("百分比真實傷害:王和英雄走同一個時鐘 (firering-mob-percent)", () => {
  it("a 276,944 hp king and a ~3,000 hp champion die within half a second of each other", () => {
    cover("firering-mob-percent");
    const w = world();
    beginCombatMobs(w, BOSS_RULES, [0, 1]);
    beginCombatFireRing(w, ringNow());

    // Champion in zone 0, king in zone 1 — separate zones so neither can hit,
    // push or otherwise perturb the other; each is judged against its OWN ring.
    const hero = champ(w, ZONE0.center.x + 23.4, ZONE0.center.z, 0);
    const king = summonMobBoss(w, 1, BOSS_RULES, asEntityId(1), 100)!;
    parkAt(w, king, ZONE1, ZONE1.boundaryRadius - w.transform.get(king)!.radius);

    const heroMax = w.health.get(hero)!.maxHp;
    const kingMax = w.health.get(king)!.maxHp;
    // The premise of the whole guard: the king really is ~two orders of
    // magnitude fatter. If content ever makes these comparable the test below
    // stops meaning anything, so it is asserted rather than assumed.
    expect(kingMax / heroMax).toBeGreaterThan(50);

    let heroDeath = -1;
    let kingDeath = -1;
    for (let t = 1; t <= 25 * HZ && (heroDeath < 0 || kingDeath < 0); t++) {
      step(w);
      for (const ev of w.events) {
        if (ev.type !== "death") continue;
        if (ev.data.id === hero && heroDeath < 0) heroDeath = t;
        if (ev.data.id === king && kingDeath < 0) kingDeath = t;
      }
    }
    expect(heroDeath).toBeGreaterThan(0);
    expect(kingDeath).toBeGreaterThan(0);
    // ∫(0.04 + 0.008t)dt = 1 at t ≈ 11.58 s for BOTH, because both burns are a
    // fraction of the victim's OWN maxHealth. Half a second of slack absorbs the
    // champion's (tiny) flat regen; a flat-damage implementation would miss by
    // minutes, and would in fact never kill the king inside the 20 s shrink.
    expect(Math.abs(kingDeath - heroDeath)).toBeLessThanOrEqual(HZ / 2);
  });
});

describe("圈內的殭屍還是安全的 (firering-mob-safe-inside)", () => {
  it("a zombie at the zone CENTRE takes nothing until the ring closes on it", () => {
    cover("firering-mob-safe-inside");
    const w = world();
    beginCombatMobs(w, BASE_RULES, [0]);
    beginCombatFireRing(w, ringNow());
    const id = spawnMob(w, 0, BASE_RULES, 1, 0);
    parkAt(w, id, ZONE0, 0);

    // inner reaches the 0.6 body radius at k = 600·(24−0.6)/23.5 = 597.4 ticks,
    // so ticks 1..597 must be completely clean. This is the assertion that stops
    // 「burn the mobs」 from degenerating into 「damage every mob every tick」.
    let burned = 0;
    for (let t = 1; t <= 597; t++) {
      step(w);
      burned += ringDmg(w, id);
    }
    expect(burned).toBe(0);
    expect(w.health.get(id)!.hp).toBe(BASE_RULES.maxHp);

    step(w);
    expect(ringDmg(w, id)).toBeGreaterThan(0); // …沒有生存空間, for zombies too
  });
});

describe("settled zone: the player stops burning, the zombie does not (firering-mob-settled)", () => {
  it("a settled zone still burns its mobs — and the BURNING predicate agrees, tick for tick", () => {
    cover("firering-mob-settled");
    // THE DELIBERATE DIVERGENCE. #216's settled-zone skip exists for a
    // PLAYER-facing complaint (「回到商店…血量會降低」); a zombie has no shop and
    // no bar to protect, and a zone that settles while one is still standing is
    // exactly the 「卡在角落的殭屍」 hole the 保底 exists to close. So the
    // champion stops burning here and the mob does not — and because the client
    // paints its flame off `isBurnedByFireRing`, that predicate has to fork on
    // the same condition or it starts describing a burn that is not happening.
    const w = world();
    // `moveSpeed: 0` ONLY here: this is the one test with a champion and a mob
    // in the SAME zone, so a walking zombie would chase the survivor inward, out
    // of the fire and out of the claim under test. MovementSystem reads a mob's
    // speed through `mobProfile(world.mobRules, kind)`, so zeroing it in the
    // ARMED rules is what actually holds it still — nothing else is changed.
    const STILL_RULES: MobRules = { ...BASE_RULES, moveSpeed: 0 };
    beginCombatMobs(w, STILL_RULES, [0]);
    beginCombatFireRing(w, ringNow());
    const survivor = champ(w, ZONE0.center.x + 23.4, ZONE0.center.z, 0);
    const zombie = spawnMob(w, 0, STILL_RULES, 1, 0);
    // the far rim, opposite the survivor: no collision push, no melee contact.
    parkAt(w, zombie, ZONE0, -23.4);

    // BASELINE: both burning while the duel is live.
    step(w, 5);
    expect(ringDmg(w, survivor)).toBeGreaterThan(0);
    expect(ringDmg(w, zombie)).toBeGreaterThan(0);

    // THE EDGE: this zone's duel is decided.
    w.settledZones.add(0);
    let heroBurn = 0;
    let mobBurn = 0;
    for (let t = 0; t < 60; t++) {
      step(w);
      heroBurn += ringDmg(w, survivor);
      mobBurn += ringDmg(w, zombie);
      // the flag and the damage must agree for BOTH, every tick — otherwise the
      // client is painting a fire that the sim is not applying (or vice versa).
      expect(isBurnedByFireRing(w, survivor)).toBe(false);
      expect(isBurnedByFireRing(w, zombie)).toBe(true);
    }
    expect(heroBurn).toBe(0); // #216 unchanged for the player
    expect(mobBurn).toBeGreaterThan(0); // 保底 unchanged for the zombie
  });
});

describe("英雄的既有行為完全不變 (firering-hero-unchanged)", () => {
  it("a champion burns identically, tick for tick, whether or not mobs are on the field", () => {
    cover("firering-hero-unchanged");
    // WORLD A: the pre-change situation — champion alone in the ring.
    const a = world();
    const heroA = champ(a, ZONE0.center.x + 23.4, ZONE0.center.z, 0);
    beginCombatFireRing(a, ringNow());

    // WORLD B: identical champion, plus three burning zombies in the OTHER zone
    // (different zone so collision/aggro can never be the reason a number moved).
    const b = world();
    const heroB = champ(b, ZONE0.center.x + 23.4, ZONE0.center.z, 0);
    beginCombatMobs(b, BASE_RULES, [0, 1]);
    beginCombatFireRing(b, ringNow());
    const mobs = [0, 1, 2].map((i) => spawnMob(b, 1, BASE_RULES, 1, i));
    for (const m of mobs) parkAt(b, m, ZONE1, 23.4);

    let mobBurn = 0;
    for (let t = 1; t <= 120; t++) {
      step(a);
      step(b);
      // EXACT equality, not a tolerance: the champion burn is deterministic
      // arithmetic and adding a second store to the ring must not perturb one
      // ulp of it.
      expect(b.health.get(heroB)!.hp).toBe(a.health.get(heroA)!.hp);
      for (const m of mobs) mobBurn += ringDmg(b, m);
    }
    // …and the comparison is not vacuous: world B's zombies really were burning
    // the whole time, so "identical" means "unchanged", not "nothing happened".
    expect(mobBurn).toBeGreaterThan(0);
    expect(a.health.get(heroA)!.hp).toBeLessThan(a.health.get(heroA)!.maxHp);
  });
});
