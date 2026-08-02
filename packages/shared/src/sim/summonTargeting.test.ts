/**
 * 召喚物「誰打得到誰」 — behavioural guards for the R1 integration defect.
 *
 * ── THE DEFECT THESE EXIST FOR ─────────────────────────────────────────────
 * A summon deliberately carries neither `MobComp` nor `ChampionComp`, and BOTH
 * of the sim's automatic target pickers were allow-lists over exactly those two
 * stores:
 *
 *   targeting.ts   `if (!world.champion.has(c) && !world.mob.has(c)) return false;`
 *   MobSystem.ts   `if (!world.champion.has(cid)) continue;   // champions only`
 *
 * so NOTHING in the game could auto-acquire a summon. Measured before the fix,
 * with a summon standing ON TOP of an enemy champion for 300 ticks:
 *
 *   PROBE: enemyTarget= null summonId= 3 summonHp 1134 -> 1134 alive= true
 *
 * It hit people and nothing could hit it back. `it hurts the summon` below is
 * that exact scenario, inverted into an assertion.
 *
 * ── HOW THESE ARE SHAPED (CLAUDE.md 的七種失敗形態) ─────────────────────────
 *  ③ 「刪掉實作還全綠」 — every guard here has a recorded MUTATION (listed in
 *     the task report): the key line was broken, the guard was watched go RED,
 *     and the line was restored.
 *  ⑤ 「被測的不是出貨的」 — no test writes a `SummonComp` by hand and no test
 *     calls `spawnSummon` directly. Every body on the field got there by running
 *     the SHIPPED `summon` handler through the SHIPPED `runEffects` dispatch,
 *     and every acquisition comes out of a real `SimWorld.step()` — never out of
 *     a direct call to `acquireTarget`.
 *  ⑦ 「掃屬性代替掃行為」 — 「`world.summon` has N entries」 and 「`targetClassOf`
 *     returns 1」 are properties, not behaviour. The load-bearing assertions read
 *     `world.health.get(summon)!.hp` going DOWN and `alive` going FALSE, and the
 *     champion-priority guard reads which body the enemy's `nav.attackTarget`
 *     ACTUALLY holds after stepping the world.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { runEffects } from "./effects/effectRunner";
import type { EffectDef } from "./effects/effect";
import { zEffectDefUnion } from "../content/schema/effect";
import { beginCombatFireRing, fireRingRulesFromConfig } from "./fireRing";
import { beginCombatMobs } from "./systems/MobSystem";
import { MOB_MODEL_KEY, MONSTER_TEAM, type MobRules } from "./mobs";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const C = SKELETON_ARENA.zones[0]!.center;
const HERO = "sela" as ChampionId;

beforeAll(() => registerSkeletonContent());

/** A point on the clear lane 12 u above the zone centre (see autoAcquire.test.ts). */
function at(dx: number, dz = 0): { x: number; z: number } {
  return { x: C.x + dx, z: C.z + 12 + dz };
}

interface Rig {
  world: SimWorld;
  /** team 0, parked far from the action unless a test moves it */
  caster: EntityId;
  /** team 1 */
  enemy: EntityId;
  /** run the SHIPPED summon handler with the SHIPPED dispatch */
  summonOn: (target: EntityId, e: Partial<Extract<EffectDef, { kind: "summon" }>>) => EntityId;
  step: (n?: number) => void;
}

/**
 * caster far LEFT, enemy far RIGHT. The separation matters: it is > the enemy's
 * own acquire radius, so the ONLY hostile body the enemy can reach is whatever
 * the test summons next to it. Without that, every 「the enemy targeted the
 * summon」 assertion would also pass on a build that simply targeted the caster.
 */
function rig(seed = 11): Rig {
  const world = new SimWorld(SKELETON_ARENA, seed);
  // ⚠️ `autoAcquirePass` is gated on `combatActive` (OrderSystem). Without this
  // line EVERY assertion below would read `attackTarget === null` for a reason
  // that has nothing to do with summons — 失敗形態 ④「斷言方向跟缺陷無關」.
  world.combatActive = true;
  const caster = spawnChampion(world, {
    championId: HERO,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: at(-18),
    zone: 0,
  });
  const enemy = spawnChampion(world, {
    championId: HERO,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: at(14),
    zone: 0,
  });
  return {
    world,
    caster,
    enemy,
    summonOn: (target, e) => {
      const before = new Set(world.summon.keys());
      runEffects(
        [
          {
            kind: "summon",
            championId: HERO,
            count: 1,
            durationSec: 600,
            at: "target",
            spread: 1,
            ...e,
          } as EffectDef,
        ],
        { world, caster, rank: 1, targets: [target], origin: "ability:test.summon", rng: world.rng },
      );
      const made = [...world.summon.keys()].filter((id) => !before.has(id));
      expect(made, "the shipped handler placed exactly one body").toHaveLength(1);
      return made[0]!;
    },
    step: (n = 1) => {
      for (let i = 0; i < n; i++) world.step(new Map());
    },
  };
}

describe("召喚物 is a real target for the enemy (gh289-summon)", () => {
  it("an enemy champion auto-acquires a summon standing on it, and KILLS it", () => {
    cover("gh289-summon");
    const r = rig();
    // `hpMult: 0.05` is a TEST-DURATION knob, not part of the claim: two mirror
    // heroes at full sheet trade for well over 900 ticks, and the assertion is
    // about the DEATH PATH existing (damage → deathSystem → summonSystem
    // despawn), not about how long it takes.
    const s = r.summonOn(r.enemy, { hpMult: 0.05 });
    r.step(1);

    const hp0 = r.world.health.get(s)!.hp;
    expect(hp0, "the body spawned with real HP").toBeGreaterThan(0);

    // ⑦: not 「the predicate returns 1」 — the enemy's nav has to actually hold
    // it, which only happens if autoAcquirePass ran inside a real step().
    r.step(3);
    expect(
      r.world.nav.get(r.enemy)!.attackTarget,
      "the enemy never even LOOKED at the summon",
    ).toBe(s);

    // …and the whole point: HP really comes off, through basicAttackSystem →
    // damageQueue → combatResolveSystem → deathSystem, and the body dies.
    let died = false;
    let sawDamage = false;
    for (let i = 0; i < 900 && !died; i++) {
      r.step(1);
      if ((r.world.health.get(s)?.hp ?? 0) < hp0) sawDamage = true;
      died = !r.world.summon.has(s);
    }
    expect(sawDamage, "the summon never took a point of damage").toBe(true);
    expect(died, "900 ticks of an enemy hero swinging and the summon survived").toBe(true);
    expect(r.world.health.get(s)?.alive ?? false, "the corpse is gone, not lingering").toBe(false);
  });

  it("the OWNER's side never auto-targets its own summon (己方不打自己人)", () => {
    cover("gh289-summon");
    const r = rig();
    // Summon it right next to its own summoner — the nearest body the caster
    // has, by a wide margin.
    const s = r.summonOn(r.caster, {});
    // ⚠️ NOT 「the summon ends at full HP」: `summonSystem` aims it at the
    // nearest enemy with no radius limit, so it walks the 32 u across the lane
    // and duels the enemy hero. Its HP falling is that duel, not friendly fire.
    // What must never happen is the CASTER pointing at it or damaging it, and
    // both are asserted directly.
    for (let i = 0; i < 120; i++) {
      r.step(1);
      expect(
        r.world.nav.get(r.caster)!.attackTarget,
        `the summoner auto-attacked its own pet on tick ${i}`,
      ).not.toBe(s);
      for (const ev of r.world.events) {
        if (ev.type !== "damage") continue;
        expect(
          ev.data.source === r.caster && ev.data.target === s,
          `the summoner dealt damage to its own pet on tick ${i}`,
        ).toBe(false);
      }
    }
    expect(r.world.health.get(s)!.alive, "the pet died to friendly fire").toBe(true);
  });

  it("`team: \"neutral\"` flips it: the summoner's OWN hero now shoots it", () => {
    cover("gh289-summon");
    const r = rig();
    // The mirror of the guard above, and the reason that guard is about TEAMS
    // and not about 「summons are never targeted by their spawner」: a hostile
    // summon (WC3 「敵對召喚」) must be a legal target for everyone.
    const s = r.summonOn(r.caster, { team: "neutral" });
    const hp0 = r.world.health.get(s)!.hp;
    r.step(150);
    expect(r.world.health.get(s)?.hp ?? 0, "a hostile summon was still untouchable").toBeLessThan(
      hp0,
    );
  });
});

describe("召喚物 索敵優先級 (gh289-summon)", () => {
  it("an enemy CHAMPION outranks a summon at the same distance", () => {
    cover("gh289-summon");
    const r = rig();
    // A third champion on team 0, right beside the enemy, tied with the summon
    // on distance. Key 1 (kind) must break the tie in the hero's favour.
    const ally = spawnChampion(r.world, {
      championId: HERO,
      seatId: asSeatId(2),
      teamId: asTeamId(0),
      pos: at(14, 2),
      zone: 0,
    });
    const s = r.summonOn(r.enemy, {});
    r.step(3);
    const held = r.world.nav.get(r.enemy)!.attackTarget;
    expect(held, "a pet out-ranked a hero standing the same distance away").toBe(ally);
    expect(held).not.toBe(s);
  });

  it("`targetPriority: \"champion\"` makes the DECOY win that tie instead", () => {
    cover("gh289-summon");
    const r = rig();
    const ally = spawnChampion(r.world, {
      championId: HERO,
      seatId: asSeatId(2),
      teamId: asTeamId(0),
      pos: at(14, 2),
      zone: 0,
    });
    // 57-03 複製鏡 / 27-002 霧隱分身之術: the clone EXISTS to be shot at.
    // Same geometry as the test above, one authored field different — so this
    // pair proves the field is what decides, not the positions.
    const s = r.summonOn(r.enemy, { targetPriority: "champion" });
    r.step(3);
    // Both are class 0 now, so the remaining keys decide; whichever wins, the
    // authored decoy must at least be REACHABLE, which the default tier denied.
    const held = r.world.nav.get(r.enemy)!.attackTarget;
    expect([ally, s], "the decoy is not even a candidate").toContain(held);
    // Distance breaks the tie: the summon spawns ON the enemy (spread 1), the
    // ally is 2 u away. So the decoy specifically must win.
    expect(held, "an authored `targetPriority: champion` decoy still lost to the hero").toBe(s);
  });
});

describe("召喚物 決策點: autoTargetable / manualTargetable (gh289-summon)", () => {
  it("`autoTargetable: false` hides it from auto-acquire — but NOT from AoE", () => {
    cover("gh289-summon");
    const r = rig();
    const s = r.summonOn(r.enemy, { autoTargetable: false });
    r.step(60);
    expect(
      r.world.nav.get(r.enemy)!.attackTarget,
      "an un-targetable summon was auto-acquired anyway",
    ).not.toBe(s);
    expect(r.world.health.get(s)!.hp, "…and it took auto-attack damage").toBe(
      r.world.health.get(s)!.maxHp,
    );

    // ⚠️ THE OTHER HALF, and the reason the doc says 「this is not
    // invulnerability」: the body stays in the broad-phase, so a targeted AoE
    // still lands on it. A future refactor that implements the flag by removing
    // summons from `rebuildGrid` would pass the assertion above and fail here.
    const t = r.world.transform.get(s)!;
    runEffects(
      [{ kind: "damageArea", amount: { flat: 50 }, radius: 4 } as EffectDef],
      {
        world: r.world,
        caster: r.enemy,
        rank: 1,
        targets: [],
        point: { x: t.pos.x, z: t.pos.z },
        origin: "ability:test.aoe",
        rng: r.world.rng,
      },
    );
    r.step(2);
    expect(
      r.world.health.get(s)!.hp,
      "an `autoTargetable:false` summon was immune to a targeted AoE — that is invulnerability, not a targeting rule",
    ).toBeLessThan(r.world.health.get(s)!.maxHp);
  });

  it("`manualTargetable: false` makes a seat's explicit attack order resolve to nothing", () => {
    cover("gh289-summon");
    const r = rig();
    const s = r.summonOn(r.enemy, { manualTargetable: false, autoTargetable: false });
    const seat = r.world.team.get(r.enemy)!.seatId;
    const frames = new Map<SeatId, IntentFrame>([
      [seat, { commands: [], order: { kind: "attackTarget", entity: s } }],
    ]);
    r.world.step(frames);
    expect(
      r.world.nav.get(r.enemy)!.attackTarget,
      "the seat's click on an un-clickable summon stuck anyway",
    ).not.toBe(s);

    // The DEFAULT still works — otherwise the guard above would also pass on a
    // build that rejected every explicit order.
    const r2 = rig(12);
    const s2 = r2.summonOn(r2.enemy, { autoTargetable: false });
    const seat2 = r2.world.team.get(r2.enemy)!.seatId;
    r2.world.step(
      new Map<SeatId, IntentFrame>([
        [seat2, { commands: [], order: { kind: "attackTarget", entity: s2 } }],
      ]),
    );
    expect(r2.world.nav.get(r2.enemy)!.attackTarget, "a normal summon became un-clickable").toBe(s2);
  });
});

describe("召喚物 決策點: 小怪索敵 (gh289-summon)", () => {
  const MOB_RULES: MobRules = {
    fromRound: 1,
    firstWaveTicks: 1,
    waveIntervalTicks: 100000, // exactly ONE wave, so the count is knowable
    mobsPerWaveCap: 1,
    maxAlivePerZone: 1,
    level: 1,
    maxHp: 400,
    moveSpeed: 6,
    hpRegenPerSec: 0,
    modelKey: MOB_MODEL_KEY,
    sizeMult: 1,
    tintStrength: 0.65,
    attackDamage: 20,
    attackRangeSq: 1.8 * 1.8,
    attackCdTicks: 3,
    radius: 0.6,
    rewardGold: 20,
    rewardXp: 40,
    killsPerLevel: 30,
    boss: null,
    special: null,
  };

  /** The one mob the wave placed. */
  function theMob(w: SimWorld): EntityId {
    const ids = [...w.mob.keys()];
    expect(ids, "the wave placed exactly one mob").toHaveLength(1);
    return ids[0]!;
  }

  it("a zombie aggros onto a summon (WC3: creeps fight summoned units)", () => {
    cover("gh289-summon");
    const r = rig();
    beginCombatMobs(r.world, MOB_RULES, [0]);
    // Every champion is parked FAR from the mob's edge spawn, so 「it aimed at
    // the summon」 cannot be an accident of the summon merely being nearest to
    // something it would have chased anyway: without the fix the mob's only
    // legal targets are the two heroes and it locks one of them.
    const s = r.summonOn(r.caster, {});
    r.step(3);
    const mob = theMob(r.world);
    // Put the summon right on the zombie so distance is not the question.
    const mt = r.world.transform.get(mob)!;
    r.world.transform.get(s)!.pos = { x: mt.pos.x, z: mt.pos.z };
    r.step(2);
    expect(r.world.mob.get(mob)!.target, "the zombie walked straight past the summon").toBe(s);
    expect(r.world.nav.get(mob)!.attackTarget).toBe(s);
  });

  it("`mobTargetable: false` puts it back out of zombie reach", () => {
    cover("gh289-summon");
    const r = rig();
    beginCombatMobs(r.world, MOB_RULES, [0]);
    const s = r.summonOn(r.caster, { mobTargetable: false });
    r.step(3);
    const mob = theMob(r.world);
    const mt = r.world.transform.get(mob)!;
    r.world.transform.get(s)!.pos = { x: mt.pos.x, z: mt.pos.z };
    r.step(2);
    expect(r.world.mob.get(mob)!.target, "the flag did nothing").not.toBe(s);
  });

  it("a MONSTER-team summon is never aggroed by the zombies (they are allies)", () => {
    cover("gh289-summon");
    const r = rig();
    beginCombatMobs(r.world, MOB_RULES, [0]);
    const s = r.summonOn(r.caster, { team: "neutral" });
    expect(r.world.team.get(s)!.teamId).toBe(MONSTER_TEAM);
    r.step(3);
    const mob = theMob(r.world);
    const mt = r.world.transform.get(mob)!;
    r.world.transform.get(s)!.pos = { x: mt.pos.x, z: mt.pos.z };
    r.step(2);
    expect(r.world.mob.get(mob)!.target, "zombies turned on their own side").not.toBe(s);
  });
});

describe("召喚物 決策點: 火圈 + 賞金 (gh289-summon)", () => {
  /** A ring that is ALREADY closed: everything outside 0.5 u burns immediately. */
  const closedRing = (w: SimWorld) =>
    fireRingRulesFromConfig(
      {
        startSec: 0,
        shrinkSec: 1 / 30, // one tick to fully close
        minRadius: 0.5,
        // flat 50 %/s for the whole burn — this test is about WHO burns, not
        // about the ramp, so the curve is deliberately constant.
        burnCurve: [
          { sec: 0, pctPerSec: 0.5 },
          { sec: 60, pctPerSec: 0.5 },
        ],
        maxPctPerSec: 1,
      },
      w.dt,
    );

  it("the ring eats a summon (owner 2026-07-30 保底), and the flag turns it off", () => {
    cover("gh289-summon");
    const r = rig();
    const burns = r.summonOn(r.caster, {});
    const safe = r.summonOn(r.enemy, { burnsInFireRing: false, autoTargetable: false });
    beginCombatFireRing(r.world, closedRing(r.world));
    const hp0 = r.world.health.get(burns)!.hp;
    const hp0Safe = r.world.health.get(safe)!.hp;

    r.step(6);
    expect(
      r.world.health.get(burns)?.hp ?? hp0,
      "the ring closed on the summon and it did not burn",
    ).toBeLessThan(hp0);
    expect(
      r.world.health.get(safe)!.hp,
      "`burnsInFireRing: false` burned anyway",
    ).toBe(hp0Safe);
  });

  it("`bountyGold` pays the killer; the default pays nobody", () => {
    cover("gh289-summon");
    // PAID. The enemy champion kills it through the shipped attack path, so the
    // killer identity comes from deathSystem's own credit rule.
    const paid = rig();
    const s = paid.summonOn(paid.enemy, { bountyGold: 77, hpMult: 0.05 });
    const goldBefore = paid.world.champion.get(paid.enemy)!.gold;
    for (let i = 0; i < 900 && paid.world.summon.has(s); i++) paid.step(1);
    expect(paid.world.summon.has(s), "it never died, so the bounty never came due").toBe(false);
    expect(
      paid.world.champion.get(paid.enemy)!.gold - goldBefore,
      "the authored bounty was not paid",
    ).toBe(77);

    // DEFAULT: same scenario, no field → not one coin (WC3: 召喚物不給錢).
    const free = rig(13);
    const s2 = free.summonOn(free.enemy, { hpMult: 0.05 });
    const before2 = free.world.champion.get(free.enemy)!.gold;
    for (let i = 0; i < 900 && free.world.summon.has(s2); i++) free.step(1);
    expect(free.world.summon.has(s2)).toBe(false);
    expect(
      free.world.champion.get(free.enemy)!.gold,
      "an un-authored summon printed gold",
    ).toBe(before2);
  });
});

describe("召喚物 決策點: the schema mirrors the sim (gh289-summon)", () => {
  it("every new decision the handler reads is ACCEPTED by the Zod union", () => {
    cover("gh289-summon");
    const full = {
      kind: "summon",
      championId: HERO,
      count: 1,
      autoTargetable: false,
      targetPriority: "champion",
      mobTargetable: false,
      manualTargetable: false,
      burnsInFireRing: false,
      bountyGold: 40,
    };
    expect(
      zEffectDefUnion.safeParse(full).success,
      "the schema rejects a field the sim reads — the editor could never set it",
    ).toBe(true);
    // …and the bounds are real (CLAUDE.md 「欄位要有上界，不是只有下界」).
    expect(zEffectDefUnion.safeParse({ ...full, bountyGold: 5000 }).success).toBe(false);
    expect(zEffectDefUnion.safeParse({ ...full, bountyGold: -1 }).success).toBe(false);
    expect(zEffectDefUnion.safeParse({ ...full, targetPriority: "structure" }).success).toBe(false);
  });
});
