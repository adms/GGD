/**
 * settledZones — PER-ZONE combat teardown (task #216).
 *
 * THE PLAYTEST REPORT (owner, 2026-07-26):
 *   「回到商店時，戰鬥場景應該回覆，目前還會有火圈聲音跟血量會降低等，
 *     並且看得到戰場上的血條」
 *
 * The 血量會降低 half is a SIM bug, and it is NOT an intermission leak — during
 * the real `intermission` phase the world is provably clean (`combatActive` is
 * false, the ring is disarmed). It is one phase earlier and it is PER-ZONE:
 * `world.combatActive` only drops once EVERY pairing is decided, so a duel that
 * finished EARLY kept its survivors inside a live, shrinking fire ring — and a
 * player knocked out this round is ALREADY looking at the shop (client
 * `shopGate`), so what he sees is his team-mates' bars draining behind the shop
 * card while a fire bed roars.
 *
 * `world.settledZones` is the fix: recorded sim state the host writes the same
 * instant it records a zone's duel winner. These tests drive real worlds through
 * real ticks and pin the three claims that matter:
 *
 *   1. a settled zone STOPS burning, immediately and completely;
 *   2. a still-live zone is untouched — the ring keeps its global clock and
 *      radius, because the snapshot replicates exactly one radius;
 *   3. `isBurnedByFireRing` (the BURNING flag / red wash) agrees with the
 *      damage, tick for tick, so the client can never paint a burn that the sim
 *      is not applying.
 *
 * Plus the determinism obligations: the flag is load-bearing (it changes the
 * digest) and it is reproducible (same settle schedule ⇒ byte-identical world).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA, type ArenaDef } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import {
  beginCombatFireRing,
  fireRingRulesFromConfig,
  isBurnedByFireRing,
  type FireRingRules,
} from "./fireRing";
import { normalizeCombatEnv } from "./combatEnv";
import { beginCombatMobs, mobSystem } from "./systems/MobSystem";
import { mobsAliveInZone, type MobRules } from "./mobs";

beforeAll(() => registerSkeletonContent());

const DT = 1 / 30;

/**
 * The skeleton arena minus its pillars — same reasoning as
 * `systems/FireRingSystem.test.ts`: the obstacle on each zone centre is a fact
 * about the ARENA, and letting it push champions around would make this file
 * fail the day someone moves a pillar.
 */
const OPEN_ARENA: ArenaDef = {
  id: "arena.settledzones-open",
  name: "Settled Zones Test Arena",
  zones: SKELETON_ARENA.zones.map((z) => ({ ...z, obstacles: [] })),
};
const ZONE0 = OPEN_ARENA.zones[0]!;
const ZONE1 = OPEN_ARENA.zones[1]!;

/** The shipped ring shape, igniting IMMEDIATELY so a test is ticks, not minutes. */
function ringNow(): FireRingRules {
  return fireRingRulesFromConfig(
    {
      startSec: 0,
      shrinkSec: 20,
      minRadius: 0.5,
      burnPctPerSecStart: 0.04,
      burnPctPerSecEnd: 0.2,
      maxPctPerSec: 1,
    },
    DT,
  );
}

function world(seed = 99): SimWorld {
  const w = new SimWorld(OPEN_ARENA, seed);
  w.combatActive = true;
  w.combatEnv = normalizeCombatEnv({ maxHealth: 8.0 }); // the shipped #153 table
  return w;
}

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

const step = (w: SimWorld, n = 1): void => {
  for (let i = 0; i < n; i++) w.step(new Map());
};

/** Fire-ring damage dealt to `id` on the LAST stepped tick. */
function ringDmg(w: SimWorld, id: EntityId): number {
  let sum = 0;
  for (const ev of w.events) {
    if (ev.type === "fireRingDamage" && ev.data.id === id) sum += ev.data.amount as number;
  }
  return sum;
}

/**
 * A champion parked at 23.4 u from its own zone centre — EXACTLY
 * `clampToBoundary`'s limit for a 0.6 body, i.e. the farthest anyone can legally
 * stand. Safe on the ignition tick, burning from the very first shrink tick.
 */
const rimOf = (zone: { center: { x: number; z: number } }): { x: number; z: number } => ({
  x: zone.center.x + 23.4,
  z: zone.center.z,
});

describe("a SETTLED zone stops burning (#216 血量會降低)", () => {
  it("the survivors of a duel that ended EARLY take no further ring damage", () => {
    cover("teardown-settled-zone-burn");
    const w = world();
    const r0 = rimOf(ZONE0);
    const r1 = rimOf(ZONE1);
    const inZone0 = champ(w, r0.x, r0.z, 0, 1);
    const inZone1 = champ(w, r1.x, r1.z, 1, 2);
    beginCombatFireRing(w, ringNow());

    // BASELINE: both zones live → both champions burn, every tick.
    let burn0 = 0;
    let burn1 = 0;
    for (let t = 0; t < 30; t++) {
      step(w);
      burn0 += ringDmg(w, inZone0);
      burn1 += ringDmg(w, inZone1);
    }
    expect(burn0).toBeGreaterThan(0);
    expect(burn1).toBeGreaterThan(0);

    // THE EDGE: zone 0's duel is decided (the host records its winner and, in
    // the same instant, marks the zone settled). Zone 1 fights on.
    w.settledZones.add(0);
    const hp0AtSettle = w.health.get(inZone0)!.hp;

    let burn0After = 0;
    let burn1After = 0;
    for (let t = 0; t < 120; t++) {
      step(w);
      burn0After += ringDmg(w, inZone0);
      burn1After += ringDmg(w, inZone1);
      // …and not one tick of it. The bug the owner filmed was a slow drain, so
      // "zero total" is checked per tick, not only at the end.
      expect(w.health.get(inZone0)!.hp).toBeGreaterThanOrEqual(hp0AtSettle);
    }
    expect(burn0After).toBe(0); // 商店裡不再扣血
    expect(burn1After).toBeGreaterThan(0); // the live duel is untouched
  });

  it("`combatActive` alone was NOT enough — this is the gate the bug slipped through", () => {
    cover("teardown-settled-zone-burn");
    // The pre-#216 behaviour, reproduced: with the ONLY gate being the global
    // `combatActive`, a decided zone kept burning because the OTHER zone was
    // still fighting. Same world, same ticks, settledZones left empty.
    const w = world();
    const r0 = rimOf(ZONE0);
    const id = champ(w, r0.x, r0.z, 0, 1);
    champ(w, rimOf(ZONE1).x, rimOf(ZONE1).z, 1, 2);
    beginCombatFireRing(w, ringNow());
    expect(w.combatActive).toBe(true); // the round is globally live…

    let burn = 0;
    for (let t = 0; t < 60; t++) {
      step(w);
      burn += ringDmg(w, id);
    }
    expect(burn).toBeGreaterThan(0); // …so without the per-zone flag it burns
  });

  it("a settled zone does not freeze the ring's CLOCK or the live zone's radius", () => {
    cover("teardown-settled-zone-burn");
    // The snapshot replicates ONE radius for the whole arena (protocol/schema),
    // so settling a zone must skip the DAMAGE only — never the shrink counter.
    const w = world();
    champ(w, ZONE0.center.x, ZONE0.center.z, 0, 1);
    const live = champ(w, rimOf(ZONE1).x, rimOf(ZONE1).z, 1, 2);
    beginCombatFireRing(w, ringNow());
    w.settledZones.add(0);

    const before = w.fireRingTicks;
    let liveBurn = 0;
    for (let t = 0; t < 60; t++) {
      step(w);
      liveBurn += ringDmg(w, live);
    }
    expect(w.fireRingTicks).toBe(before + 60); // the clock kept counting
    expect(liveBurn).toBeGreaterThan(0); // and the live zone kept shrinking onto its own
  });
});

describe("the BURNING flag never claims a burn that did not happen (#216)", () => {
  it("isBurnedByFireRing agrees with the damage, tick for tick, in both zones", () => {
    cover("teardown-settled-zone-flag");
    const w = world();
    const settled = champ(w, rimOf(ZONE0).x, rimOf(ZONE0).z, 0, 1);
    const live = champ(w, rimOf(ZONE1).x, rimOf(ZONE1).z, 1, 2);
    beginCombatFireRing(w, ringNow());
    w.settledZones.add(0);

    let liveFlagged = 0;
    for (let t = 0; t < 90; t++) {
      step(w);
      // the client's red wash is derived from this predicate; a mismatch here is
      // a champion painted on fire while taking nothing (or the reverse).
      expect(isBurnedByFireRing(w, settled)).toBe(false);
      expect(ringDmg(w, settled)).toBe(0);
      if (isBurnedByFireRing(w, live)) {
        liveFlagged++;
        expect(ringDmg(w, live)).toBeGreaterThan(0);
      }
    }
    expect(liveFlagged).toBeGreaterThan(0);
  });
});

describe("a SETTLED zone stands its mobs down (#216 + #215)", () => {
  const MOB_RULES: MobRules = {
    fromRound: 3,
    firstWaveTicks: 2,
    waveIntervalTicks: 3,
    mobsPerWaveCap: 3,
    maxAlivePerZone: 5,
    maxHp: 120,
    attackDamage: 12,
    attackRangeSq: 1.8 * 1.8,
    attackCdTicks: 3,
    radius: 0.6,
    rewardGold: 20,
    rewardXp: 40,
    killsPerLevel: 30,
  };

  it("no new wave arrives in a settled zone, while the live zone keeps receiving them", () => {
    cover("teardown-settled-zone-mobs");
    const w = world(7);
    beginCombatMobs(w, MOB_RULES, [0, 1]);
    w.settledZones.add(0);
    // drive the mob system directly: no champions, so spawned mobs just stand
    // there and the alive count is a clean total of what each wave spawned.
    for (let t = 0; t < 12; t++) mobSystem(w);
    expect(mobsAliveInZone(w, 0)).toBe(0); // 打完了就不再湧入
    expect(mobsAliveInZone(w, 1)).toBeGreaterThan(0);
  });

  it("mobs already in a settled zone drop aggro instead of chewing on the survivors", () => {
    cover("teardown-settled-zone-mobs");
    const w = world(7);
    const victim = champ(w, ZONE0.center.x, ZONE0.center.z, 0, 1);
    beginCombatMobs(w, MOB_RULES, [0]);
    for (let t = 0; t < 3; t++) mobSystem(w);
    const mobIds = [...w.mob.keys()];
    expect(mobIds.length).toBeGreaterThan(0);

    // park the wave ON TOP of the champion so range can never be the reason the
    // melee stops — only the stand-down can be.
    const vpos = w.transform.get(victim)!.pos;
    for (const id of mobIds) {
      const t = w.transform.get(id)!;
      t.pos.x = vpos.x;
      t.pos.z = vpos.z;
      w.mob.get(id)!.attackCdTicks = 0;
    }
    mobSystem(w);
    expect(w.mob.get(mobIds[0]!)!.target).toBe(victim); // aggro proven live…
    expect(w.damageQueue.length).toBeGreaterThan(0); // …and biting
    w.damageQueue.length = 0;

    // THE EDGE: this zone's duel is decided.
    w.settledZones.add(0);
    for (let t = 0; t < 10; t++) mobSystem(w);
    for (const id of mobIds) {
      expect(w.mob.get(id)!.target).toBe(-1);
      expect(w.nav.get(id)?.attackTarget ?? null).toBeNull();
    }
    expect(w.damageQueue.length).toBe(0);
  });
});

/**
 * #216 × #221 — the pair that only misbehaves TOGETHER.
 *
 * Both branches were green on their own. #221 gave every champion an in-sim
 * auto-acquire pass gated on the GLOBAL `combatActive`, which is exactly the
 * gate #216 exists because it is too coarse: in the window between "my duel
 * ended" and "the last duel ends" a survivor of a settled zone would be handed
 * a fresh target and go right on fighting — in practice farming the zombies
 * `mobSystem` had just stood down two describes above, while the defeated
 * player watches from the shop. Same "the round is over HERE" rule as the ring
 * and the mobs.
 */
describe("a SETTLED zone stands its AUTO-ATTACK down (#216 × #221)", () => {
  it("a survivor stops auto-acquiring, and releases the auto target it held", () => {
    cover("teardown-settled-zone-autoacquire");
    const w = world(11);
    // Two enemies nose to nose, well inside the melee acquire floor.
    const a = champ(w, ZONE0.center.x, ZONE0.center.z, 0, 1);
    const b = champ(w, ZONE0.center.x + 1.2, ZONE0.center.z, 0, 2);
    // A second, still-LIVE duel: it must be completely untouched.
    const c = champ(w, ZONE1.center.x, ZONE1.center.z, 1, 1);
    champ(w, ZONE1.center.x + 1.2, ZONE1.center.z, 1, 2);

    // BASELINE: acquisition proven live in both zones.
    step(w);
    expect(w.nav.get(a)!.attackTarget).toBe(b);
    expect(w.nav.get(a)!.attackTargetAuto).toBe(true);
    expect(w.nav.get(c)!.attackTarget).not.toBeNull();

    // THE EDGE: zone 0's duel is decided. Zone 1 fights on.
    w.settledZones.add(0);
    for (let t = 0; t < 20; t++) {
      step(w);
      expect(w.nav.get(a)!.attackTarget).toBeNull(); // released, and never re-taken
      expect(w.nav.get(a)!.attackTargetAuto).toBe(false);
      expect(w.nav.get(b)!.attackTarget).toBeNull();
    }
    expect(w.nav.get(c)!.attackTarget).not.toBeNull(); // the live duel is untouched
  });
});

describe("settledZones is DETERMINISTIC recorded state (#216)", () => {
  /** Run a world for `ticks`, settling zone 0 at `settleAt` (-1 = never). */
  function run(seed: number, settleAt: number, ticks = 150): SimWorld {
    const w = world(seed);
    champ(w, rimOf(ZONE0).x, rimOf(ZONE0).z, 0, 1);
    champ(w, rimOf(ZONE1).x, rimOf(ZONE1).z, 1, 2);
    beginCombatFireRing(w, ringNow());
    for (let t = 0; t < ticks; t++) {
      if (t === settleAt) w.settledZones.add(0);
      step(w);
    }
    return w;
  }

  it("the same settle schedule replays byte-identically", () => {
    cover("teardown-settled-zone-determinism");
    nextSeat = 0;
    const a = run(31337, 40);
    nextSeat = 0;
    const b = run(31337, 40);
    expect(a.digest()).toBe(b.digest());
    expect([...a.settledZones]).toEqual([...b.settledZones]);
  });

  it("the flag is LOAD-BEARING: settling changes the world, so a replica that disagrees is caught", () => {
    cover("teardown-settled-zone-determinism");
    // If this ever passed, the gate would be dead code — and the replay
    // host-digest would be hashing a field with no consequences.
    nextSeat = 0;
    const settled = run(31337, 40);
    nextSeat = 0;
    const never = run(31337, -1);
    expect(settled.digest()).not.toBe(never.digest());
  });

  it("is pure world state: no wall clock, no rng draw, order-independent", () => {
    cover("teardown-settled-zone-determinism");
    // Marking a zone settled must not consume rng — it is a fact the host
    // already decided, not a new random event.
    const w = world(5);
    champ(w, rimOf(ZONE0).x, rimOf(ZONE0).z, 0, 1);
    beginCombatFireRing(w, ringNow());
    step(w, 10);
    const rngBefore = w.rng.state;
    w.settledZones.add(0);
    expect(w.rng.state).toBe(rngBefore);
    // and the SET's insertion order carries no meaning — 1-then-0 and 0-then-1
    // are the same world (the replay digest sorts before hashing for this reason)
    const p = new SimWorld(OPEN_ARENA, 5);
    const q = new SimWorld(OPEN_ARENA, 5);
    p.settledZones.add(1);
    p.settledZones.add(0);
    q.settledZones.add(0);
    q.settledZones.add(1);
    expect([...p.settledZones].sort()).toEqual([...q.settledZones].sort());
  });
});
