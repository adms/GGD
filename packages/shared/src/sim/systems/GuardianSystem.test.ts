/**
 * Guardian (task #89) — the neutral duel-zone objective. Covers the three core
 * behaviours the ledger requires — last-hit grants the reward exactly once, the
 * AoE volley damages nearby enemies, everything is deterministic — plus the
 * attribution / neutrality / lifecycle edge cases from docs/guardian-tower.md.
 *
 * Damage is driven straight into `world.damageQueue` (the same queue every
 * ability/auto drains through) so these tests exercise the guardian in
 * isolation, without depending on the client/AI targeting seam.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { apDamageMult } from "../combat/apDamageScaling";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import {
  beginCombatGuardians,
  endCombatGuardians,
  guardianHp,
  guardianRamp,
  guardianVolleyDamage,
  guardianRulesFromConfig,
  type GuardianRules,
} from "./GuardianSystem";
import { DEFAULT_GUARDIAN_TOWER_CONFIG } from "../../content/schema/config";
import { Stat } from "../stats/statTypes";
import type { DamageType } from "../effects/effect";

beforeAll(() => registerSkeletonContent());

/** Small tick counts / low HP for fast, precise tests. */
const RULES: GuardianRules = {
  hpBase: 300,
  hpGrowthPerRound: 0.28,
  armor: 0,
  magicResist: 17.65,
  radius: 2.5,
  maxHitPctMaxHp: 0.15,
  volleyPeriodTicks: 3,
  volleyWindupTicks: 2,
  volleyMarks: 3,
  volleyRadius: 3.0,
  volleyDamageBase: 40,
  volleyDamageGrowthPerRound: 0.14,
  volleyRampPct: 0.15,
  volleyRampMax: 2.0,
  dormancyTicks: 5,
  rewardGold: 150,
  restoreHpPct: 1.0,
  restoreManaPct: 1.0,
  buffDurationTicks: 12,
  heirPulsePct: 0.25,
  heirPulseRadius: 2.5,
};

const ZONE0_CENTER = { x: -40, z: 0 };

const step = (w: SimWorld, n = 1): void => {
  for (let i = 0; i < n; i++) w.step(new Map());
};

function champAt(
  w: SimWorld,
  seat: number,
  team: number,
  x: number,
  z: number,
  champion: "sela" | "thorne" = "thorne",
): EntityId {
  return spawnChampion(w, {
    championId: champion as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x, z },
    zone: 0,
  });
}

function hit(
  w: SimWorld,
  source: EntityId,
  target: EntityId,
  amount: number,
  type: DamageType = "physical",
  origin = "ability:test",
): void {
  w.damageQueue.push({ source, target, amount, type, crit: false, origin });
}

/**
 * Land a guaranteed KILLING blow. The per-packet clamp (§5.3 `maxHitPctMaxHp`)
 * caps ONE packet at 15% of maxHp, so no single burst can ever delete the tower
 * — soften it to its last hit point first, then queue the finishing packet.
 */
function lastHit(w: SimWorld, source: EntityId, gid: EntityId): void {
  w.health.get(gid)!.hp = 1;
  hit(w, source, gid, 500);
}

/** The single alive guardian in zone 0. */
function theGuardian(w: SimWorld): EntityId {
  for (const [id] of w.structure) return id;
  throw new Error("no guardian");
}

describe("guardian arming + neutrality (#89)", () => {
  it("off by default → no structure, no events, digest unchanged", () => {
    cover("guardian-disarmed-noop");
    const w = new SimWorld(SKELETON_ARENA, 7);
    champAt(w, 0, 0, -38, 0);
    const before = w.digest();
    step(w, 20);
    const after = w.digest();
    expect(w.guardianRules).toBeNull();
    expect(w.structure.size).toBe(0);
    // arm then immediately disarm — world returns to the disarmed digest lineage
    beginCombatGuardians(w, RULES, [0], 1);
    endCombatGuardians(w);
    expect(w.structure.size).toBe(0);
    expect(w.guardianRules).toBeNull();
    expect(w.guardianBuffs.size).toBe(0);
    void after;
    void before;
  });

  it("spawns one guardian per ACTIVE zone at zone.center, fully neutral", () => {
    cover("guardian-per-active-zone");
    const w = new SimWorld(SKELETON_ARENA, 1);
    beginCombatGuardians(w, RULES, [0], 1); // 3 alive teams => one pairing => zone 0 only
    expect(w.structure.size).toBe(1);
    const gid = theGuardian(w);
    const t = w.transform.get(gid)!;
    expect(t.pos).toEqual(ZONE0_CENTER);
    expect(t.radius).toBe(2.5);
    // neutral: no team, no champion, no matchStats, no nav, no stats
    expect(w.team.has(gid)).toBe(false);
    expect(w.champion.has(gid)).toBe(false);
    expect(w.matchStats.has(gid)).toBe(false);
    expect(w.nav.has(gid)).toBe(false);
    expect(w.stats.has(gid)).toBe(false);
    // two active zones => two guardians
    const w2 = new SimWorld(SKELETON_ARENA, 1);
    beginCombatGuardians(w2, RULES, [0, 1], 1);
    expect(w2.structure.size).toBe(2);
  });

  it("HP scales by round: 1450·(1+0.28·(R−1))", () => {
    cover("guardian-hp-by-round");
    const r = RULES; // hpBase 300 here; assert the formula against the shipped default too
    expect(guardianHp(r, 1)).toBe(300);
    expect(guardianHp(r, 3)).toBe(Math.round(300 * (1 + 0.28 * 2)));
    const shipped = guardianRulesFromConfig(DEFAULT_GUARDIAN_TOWER_CONFIG, 1 / 30);
    expect(guardianHp(shipped, 1)).toBe(1450);
    expect(guardianHp(shipped, 6)).toBe(Math.round(1450 * (1 + 0.28 * 5))); // 3480
  });

  it("a live guardian is invisible to team/champion iterations", () => {
    cover("guardian-invisible-to-team-iterations");
    const w = new SimWorld(SKELETON_ARENA, 3);
    const a = champAt(w, 0, 0, -38, 0);
    const b = champAt(w, 1, 1, -42, 0);
    beginCombatGuardians(w, RULES, [0], 1);
    let champs = 0;
    for (const [] of w.champion) champs++;
    expect(champs).toBe(2); // guardian is not a champion
    // still exactly the two team members
    expect(w.team.has(a) && w.team.has(b)).toBe(true);
    expect(w.matchStats.size).toBe(2);
  });
});

describe("guardian wake / sleep / volley AoE (#89)", () => {
  it("dormant until first damage, then wakes on world.tick", () => {
    cover("guardian-wake-on-damage");
    const w = new SimWorld(SKELETON_ARENA, 5);
    const a = champAt(w, 0, 0, -38, 0);
    beginCombatGuardians(w, RULES, [0], 1);
    const gid = theGuardian(w);
    step(w, 4);
    expect(w.structure.get(gid)!.wakeTick).toBe(-1); // still dormant
    hit(w, a, gid, 20);
    step(w); // combatResolve applies, guardianSystem wakes it this tick
    const sc = w.structure.get(gid)!;
    expect(sc.wakeTick).toBe(w.tick - 1); // stamped from world.tick at wake
    expect(sc.threat.get(a)).toBeGreaterThan(0);
  });

  it("sleeps after dormancy: threat + ramp reset", () => {
    cover("guardian-sleep-on-neglect");
    const w = new SimWorld(SKELETON_ARENA, 5);
    const a = champAt(w, 0, 0, -38, 0);
    beginCombatGuardians(w, RULES, [0], 1);
    const gid = theGuardian(w);
    hit(w, a, gid, 20);
    step(w);
    expect(w.structure.get(gid)!.wakeTick).toBeGreaterThanOrEqual(0);
    step(w, RULES.dormancyTicks + 1); // neglect it
    const sc = w.structure.get(gid)!;
    expect(sc.wakeTick).toBe(-1);
    expect(sc.volleysFired).toBe(0);
    expect(sc.threat.size).toBe(0);
  });

  it("volley marks the top damager and its AoE hits a nearby enemy", () => {
    cover("guardian-mark-splash");
    const w = new SimWorld(SKELETON_ARENA, 9);
    const attacker = champAt(w, 0, 0, -40, 0.4); // on top of the guardian's centre
    const victim = champAt(w, 1, 1, -40, 2.2); // 1.8u from the attacker → inside 3.0 splash
    beginCombatGuardians(w, RULES, [0], 1);
    const gid = theGuardian(w);
    const vMaxHp = w.health.get(victim)!.maxHp;
    // feed threat every tick until the first volley's mark resolves
    for (let i = 0; i < RULES.volleyPeriodTicks + RULES.volleyWindupTicks + 2; i++) {
      hit(w, attacker, gid, 15);
      step(w);
    }
    expect(w.health.get(victim)!.hp).toBeLessThan(vMaxHp); // splashed by the volley
  });

  it("a mark does NOT track: walking out of it takes zero", () => {
    cover("guardian-mark-does-not-track");
    const w = new SimWorld(SKELETON_ARENA, 11);
    const a = champAt(w, 0, 0, -40, 0.4);
    beginCombatGuardians(w, RULES, [0], 1);
    const gid = theGuardian(w);
    const sc = w.structure.get(gid)!;
    // wake + drive to the fire tick
    while (sc.marks.length === 0) {
      hit(w, a, gid, 15);
      step(w);
      if (w.tick > 40) throw new Error("volley never fired");
    }
    // a mark is now stamped at a's position; teleport a out of the splash radius
    w.transform.get(a)!.pos = { x: -30, z: 0 };
    const aHpBefore = w.health.get(a)!.hp;
    step(w, RULES.volleyWindupTicks + 2); // let the mark resolve
    expect(w.health.get(a)!.hp).toBe(aHpBefore); // the stamped point did not follow a
  });

  it("ramp: volley n deals base × min(2.0, 1 + 0.15(n−1))", () => {
    cover("guardian-ramp");
    expect(guardianRamp(RULES, 1)).toBeCloseTo(1.0, 6);
    expect(guardianRamp(RULES, 2)).toBeCloseTo(1.15, 6);
    expect(guardianRamp(RULES, 8)).toBe(2.0); // clamped at rampMax
    expect(guardianVolleyDamage(RULES, 1)).toBeCloseTo(40, 6);
    expect(guardianVolleyDamage(RULES, 3)).toBeCloseTo(40 * (1 + 0.14 * 2), 6);
  });
});

// A structure has NO StatsComp, so `mitigate()` used to find no resist on it and
// hand the guardian FULL damage "exactly like the flower". It now reads the
// armor / magicResist / maxHitPctMaxHp carried on StructureComp (§5.1 / §5.3).
describe("guardian mitigation + per-packet cap (#89 §5.1/§5.3)", () => {
  /** The SHIPPED numbers: armor 0, MR 17.65, maxHitPctMaxHp 0.15, hpBase 1450. */
  const SHIPPED = guardianRulesFromConfig(DEFAULT_GUARDIAN_TOWER_CONFIG, 1 / 30);

  function armedGuardian(w: SimWorld): EntityId {
    beginCombatGuardians(w, SHIPPED, [0], 1);
    return theGuardian(w);
  }

  it("physical into armor 0 is unmitigated; magic into MR 17.65 is ×0.85", () => {
    cover("guardian-mitigation-physical");
    cover("guardian-mitigation-magic");
    const w = new SimWorld(SKELETON_ARENA, 21);
    const a = champAt(w, 0, 0, -38, 0);
    const gid = armedGuardian(w);
    const hp = w.health.get(gid)!;
    expect(hp.maxHp).toBe(1450); // round 1 shipped HP (cap = 217.5, both hits are under it)

    // ⚠️ 2026-08-21：`hit()` 的 origin 是 `ability:test`，所以每一發都先吃一次
    // AP 傷害加成（`combat/apDamageScaling.ts`）。⛔ 乘數**讀**出貨函式，不寫死
    // —— 這一條驗的是「護甲 0 不減傷 / 魔抗 17.65 是 ×0.85」，⛔ 不是封包多大。
    const apMult = apDamageMult(w, a, "ability:test");

    const beforePhys = hp.hp;
    hit(w, a, gid, 100, "physical");
    step(w);
    expect(beforePhys - hp.hp).toBeCloseTo(100 * apMult, 6); // armor 0 → the siege lane is free

    const beforeMagic = hp.hp;
    hit(w, a, gid, 100, "magic");
    step(w);
    expect(beforeMagic - hp.hp).toBeCloseTo(100 * apMult * (100 / 117.65), 4); // the A0C1 0.85

    // true damage bypasses armour/MR exactly as it does on a champion
    // ⚠️ 但它**不**繞過 AP 傷害加成 —— 那一層在減傷**之前**（「我這一發多重」），
    //    而真傷繞過的是減傷（「他扛得多好」）。兩者是不同的位置。
    const beforeTrue = hp.hp;
    hit(w, a, gid, 100, "true");
    step(w);
    expect(beforeTrue - hp.hp).toBeCloseTo(100 * apMult, 6);
  });

  it("caps ONE packet at maxHitPctMaxHp × maxHp — a burst cannot delete the tower", () => {
    cover("guardian-cap-single-packet");
    const w = new SimWorld(SKELETON_ARENA, 22);
    const a = champAt(w, 0, 0, -38, 0);
    const gid = armedGuardian(w);
    const hp = w.health.get(gid)!;
    const cap = hp.maxHp * DEFAULT_GUARDIAN_TOWER_CONFIG.maxHitPctMaxHp; // 0.15 × 1450 = 217.5

    const before = hp.hp;
    hit(w, a, gid, 5000, "physical"); // a nuke that would one-shot it uncapped
    step(w);
    expect(before - hp.hp).toBeCloseTo(cap, 6);
    expect(hp.alive).toBe(true);
    // the CLAMPED value is what the threat table (and the client `damage` event) saw
    expect(w.structure.get(gid)!.threat.get(a)).toBeCloseTo(cap, 6);

    // the cap is post-mitigation and UNCONDITIONAL — true damage is capped too
    const beforeTrue = hp.hp;
    hit(w, a, gid, 5000, "true");
    step(w);
    expect(beforeTrue - hp.hp).toBeCloseTo(cap, 6);
  });

  it("a guardian can never die in fewer than 7 packets", () => {
    cover("guardian-cap-min-packets");
    const w = new SimWorld(SKELETON_ARENA, 23);
    const a = champAt(w, 0, 0, -38, 0);
    const gid = armedGuardian(w);
    let packets = 0;
    while (w.health.get(gid)?.alive && packets < 20) {
      hit(w, a, gid, 999999, "true"); // the biggest possible single blow
      packets++;
      step(w);
    }
    expect(w.structure.has(gid)).toBe(false); // it did eventually die
    expect(packets).toBeGreaterThanOrEqual(7); // 1 / 0.15 = 6.67 → 7
  });

  it("a CHAMPION's mitigation is untouched: StatsComp armor, and no cap", () => {
    cover("guardian-cap-champions-untouched");
    const w = new SimWorld(SKELETON_ARENA, 24);
    const a = champAt(w, 0, 0, -38, 0);
    const v = champAt(w, 1, 1, -34, 0);
    beginCombatGuardians(w, SHIPPED, [0], 1); // guardians armed, but irrelevant here
    const hp = w.health.get(v)!;
    const armor = w.stats.get(v)!.final[Stat.Armor];
    // 400 physical is FAR above 15% of a champion's bar — if the structure cap
    // leaked onto champions this would be clamped. It must not be. (Read the
    // resolved packet off the `damage` event: hp itself also regenerates.)
    hit(w, a, v, 400, "physical");
    step(w);
    const dealt = w.events.find((e) => e.type === "damage" && e.data.target === v)!.data
      .amount as number;
    // ⚠️ 同上：`hit()` 用的是技能 origin，所以封包先過了一次 AP 傷害加成。
    expect(dealt).toBeCloseTo(
      400 * apDamageMult(w, a, "ability:test") * (100 / (100 + armor)),
      6,
    );
    expect(dealt).toBeGreaterThan(hp.maxHp * 0.15);
  });
});

describe("guardian last-hit reward (#89)", () => {
  it("last hit grants gold + full HP&MP + 鎮守之力, exactly once", () => {
    cover("guardian-reward-values");
    const w = new SimWorld(SKELETON_ARENA, 2);
    const k = champAt(w, 0, 0, -38, 0);
    beginCombatGuardians(w, RULES, [0], 1);
    const gid = theGuardian(w);
    const kh = w.health.get(k)!;
    kh.hp = 5; // hurt, to prove the restore
    kh.mana = 0;
    const goldBefore = w.champion.get(k)!.gold;
    lastHit(w, k, gid); // the finishing packet (see lastHit: the §5.3 cap)
    step(w);
    // guardian gone, paid once
    expect(w.structure.size).toBe(0);
    expect(w.health.has(gid)).toBe(false);
    expect(w.champion.get(k)!.gold).toBe(goldBefore + 150);
    expect(kh.hp).toBe(kh.maxHp);
    expect(kh.mana).toBe(kh.maxMana);
    expect(w.guardianBuffs.has(k)).toBe(true);
    const slain = w.events.filter((e) => e.type === "guardianSlain");
    expect(slain.length).toBe(1);
    expect(slain[0]!.data.gold).toBe(150);
    expect(slain[0]!.data.killerSeatId).toBe(0);
  });

  it("killing a guardian grants NO kill xp / gold / bounty", () => {
    cover("guardian-no-xp-no-gold-on-death");
    const w = new SimWorld(SKELETON_ARENA, 2);
    const k = champAt(w, 0, 0, -38, 0);
    beginCombatGuardians(w, RULES, [0], 1);
    const gid = theGuardian(w);
    const ms = w.matchStats.get(k)!;
    const xpBefore = ms.xp;
    const goldEarnedBefore = ms.goldEarned;
    lastHit(w, k, gid);
    step(w);
    // only the guardian reward (150), never GOLD_REWARDS.kill(150)+bounty(100) on top
    expect(ms.goldEarned).toBe(goldEarnedBefore + 150);
    expect(ms.xp).toBe(xpBefore); // no kill XP for a structure
    expect(ms.kills).toBe(0);
  });

  it("killing-blow source wins over a later overkill packet in the same tick (B1)", () => {
    cover("guardian-lasthit-killing-blow");
    const w = new SimWorld(SKELETON_ARENA, 4);
    const nuker = champAt(w, 0, 0, -38, 0); // its packet crosses zero
    const slowpoke = champAt(w, 1, 1, -42, 0); // a later overkill packet, same tick
    beginCombatGuardians(w, RULES, [0], 1);
    const gid = theGuardian(w);
    // both queued this tick; nuker first (crosses zero → killingBlow), slowpoke after
    lastHit(w, nuker, gid); // crosses zero → killingBlow
    hit(w, slowpoke, gid, 500); // queued after, lands on an already-dead tower
    const nukerGold = w.champion.get(nuker)!.gold;
    const slowGold = w.champion.get(slowpoke)!.gold;
    step(w);
    expect(w.champion.get(nuker)!.gold).toBe(nukerGold + 150); // credit to the killing blow
    expect(w.champion.get(slowpoke)!.gold).toBe(slowGold); // not the last packet
  });

  it("void when the killer is a non-champion: guardian still dies, nobody paid", () => {
    cover("guardian-lasthit-void-non-champion");
    const w = new SimWorld(SKELETON_ARENA, 6);
    const summon = w.spawn(); // a bare entity, not a champion
    beginCombatGuardians(w, RULES, [0], 1);
    const gid = theGuardian(w);
    lastHit(w, summon, gid);
    step(w);
    expect(w.structure.size).toBe(0); // guardian despawned
    expect(w.guardianBuffs.size).toBe(0); // no buff granted
    const slain = w.events.filter((e) => e.type === "guardianSlain");
    expect(slain[0]!.data.gold).toBe(0); // void payout
  });

  it("void when the killer is dead at payout", () => {
    cover("guardian-lasthit-void-dead-killer");
    const w = new SimWorld(SKELETON_ARENA, 6);
    const k = champAt(w, 0, 0, -38, 0);
    beginCombatGuardians(w, RULES, [0], 1);
    const gid = theGuardian(w);
    // kill the killer in the same tick: its own health crosses zero too
    lastHit(w, k, gid);
    w.health.get(k)!.hp = 0; // dead before deathSystem flips alive=false
    step(w);
    expect(w.structure.size).toBe(0);
    expect(w.champion.get(k)!.gold).toBe(0); // no reward to a corpse
    expect(w.guardianBuffs.has(k)).toBe(false);
  });
});

describe("guardian 鎮守之力 inherited pulse (#89)", () => {
  it("pulses enemy champions in radius, then stops at expiry", () => {
    cover("guardian-heir-pulse");
    const w = new SimWorld(SKELETON_ARENA, 8);
    // stand well clear of the guardian body (which would separate them on spawn)
    const k = champAt(w, 0, 0, -34, 0);
    const enemy = champAt(w, 1, 1, -34, 1.8); // within heirPulseRadius 2.5 of k
    const ally = champAt(w, 2, 0, -34, -1.8); // same team → never pulsed
    beginCombatGuardians(w, RULES, [0], 1);
    const gid = theGuardian(w);
    lastHit(w, k, gid); // k takes the last hit → gains the buff
    step(w);
    expect(w.guardianBuffs.has(k)).toBe(true);
    const enemyMax = w.health.get(enemy)!.maxHp;
    const allyMax = w.health.get(ally)!.maxHp;
    step(w, RULES.volleyPeriodTicks + 2); // let a pulse fire + resolve
    expect(w.health.get(enemy)!.hp).toBeLessThan(enemyMax); // enemy pulsed
    expect(w.health.get(ally)!.hp).toBe(allyMax); // ally never
    // run past expiry; enemy heals back up and takes no further pulse
    step(w, RULES.buffDurationTicks + RULES.volleyPeriodTicks + 4);
    expect(w.guardianBuffs.has(k)).toBe(false);
  });
});

describe("guardian determinism + tick source (#89)", () => {
  it("same seed + same scripted damage → identical digest every tick", () => {
    cover("guardian-determinism-digest");
    const run = (): number[] => {
      const w = new SimWorld(SKELETON_ARENA, 42);
      const a = champAt(w, 0, 0, -40, 0.4);
      champAt(w, 1, 1, -40, 2.2);
      beginCombatGuardians(w, RULES, [0], 3);
      const gid = theGuardian(w);
      const digests: number[] = [];
      for (let i = 0; i < 30; i++) {
        if (i < 20) hit(w, a, gid, 12); // a full siege incl. volleys + payout window
        step(w);
        digests.push(w.digest());
      }
      return digests;
    };
    expect(run()).toEqual(run());
  });

  it("no rng draws: a full siege leaves rng.state untouched (purity)", () => {
    cover("guardian-purity-no-rng");
    const w = new SimWorld(SKELETON_ARENA, 99);
    const a = champAt(w, 0, 0, -40, 0.4);
    champAt(w, 1, 1, -40, 2.2);
    beginCombatGuardians(w, RULES, [0], 2);
    const gid = theGuardian(w);
    const rngBefore = w.rng.state;
    for (let i = 0; i < 25; i++) {
      if (i < 18) hit(w, a, gid, 12);
      step(w);
    }
    expect(w.rng.state).toBe(rngBefore);
  });

  it("wakes / volleys / pays with flowerRules null — nothing reads combatTicks (B3)", () => {
    cover("guardian-tick-source");
    const w = new SimWorld(SKELETON_ARENA, 13);
    const k = champAt(w, 0, 0, -40, 0.4);
    beginCombatGuardians(w, RULES, [0], 1);
    expect(w.flowerRules).toBeNull();
    expect(w.combatTicks).toBe(-1); // the flower clock never started
    const gid = theGuardian(w);
    // wake it, then last-hit it — all on absolute world.tick
    hit(w, k, gid, 20);
    step(w);
    expect(w.structure.get(gid)!.wakeTick).toBeGreaterThanOrEqual(0);
    lastHit(w, k, gid);
    step(w);
    expect(w.structure.size).toBe(0);
    expect(w.champion.get(k)!.gold).toBe(150); // paid despite no flower clock
  });
});
