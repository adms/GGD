/**
 * 殭屍王 + 特殊殭屍 (task #262 / GH#262 + owner 2026-07-28).
 *
 * ── WHAT THESE TESTS ARE SHAPED AGAINST ────────────────────────────────────
 *
 * The repo's seven failure shapes, and specifically the two that have bitten it
 * most recently:
 *
 *  ② 「算出來了但從沒送到客戶端」 — the whole bounty could be computed perfectly
 *     and never leave the server. Guarded by asserting on the EMITTED EVENT's
 *     payload (the only channel that reaches a socket), not just on `gold`.
 *  ④ 「斷言方向與缺陷無關」 — the trap that let a 「瞄準優先」 test pass against
 *     both a correct and a broken implementation. Every assertion below is
 *     written so the WRONG implementation gives a DIFFERENT number:
 *       · the summon boundary is checked at 99 AND at 100, not just 「有召喚」;
 *       · per-hero counting is checked with 50+50, where a team-sum
 *         implementation summons and a per-hero one does not;
 *       · the damage split uses 3 UNEQUAL contributions and a last hitter who
 *         is NOT the top damager, so 「照比例」, 「翻倍」 and 「總額不變」 are
 *         three independently falsifiable numbers rather than one;
 *       · the special-zombie roll is checked for REPRODUCIBILITY across seeds
 *         AND for actually varying, so a hard-coded "normal" fails.
 *
 * The pure arithmetic (sim/mobBoss.ts) is exercised directly — that is where the
 * rounding remainder and the doubling live, and driving them through a whole
 * SimWorld would make a failure unreadable. The lifecycle (summon / payout /
 * events) is exercised through a REAL SimWorld with REAL champions and REAL
 * damage packets, because 「the boss spawned」 is not a claim a unit of pure
 * arithmetic can make.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, asEntityId, type ChampionId, type EntityId } from "../ids";
import {
  type MobRules,
  MONSTER_TEAM,
  MOB_MODEL_KEY,
  mobProfile,
  mobSizeMultFor,
  mobVisualJson,
  parseMobVisualJson,
  DEFAULT_MOB_TINT_STRENGTH,
  mobRulesFromConfig,
  summonMobBoss,
  spawnMob,
} from "./mobs";
import { splitBossBounty, bossSummonsAt } from "./mobBoss";
import { beginCombatMobs, endCombatMobs, mobSystem } from "./systems/MobSystem";
import { DEFAULT_MOB_WAVES_CONFIG } from "../content/schema/config";

beforeAll(() => registerSkeletonContent());

const DT = 1 / 30;

/**
 * Rules with the 殭屍王 armed at a LOW threshold (3) and 特殊殭屍 disarmed.
 *
 * 3 rather than the shipped 100 for one reason only: the lifecycle tests below
 * kill mobs one at a time through the real death pipeline, and 100 of those is
 * a slow test that says nothing 3 does not. The BOUNDARY itself — that N-1 does
 * not summon and N does — is checked at the SHIPPED 100 too, in
 * `bossSummonsAt`, so the number the owner actually asked for is pinned.
 */
const RULES: MobRules = {
  fromRound: 3,
  firstWaveTicks: 1_000_000, // waves never fire: these tests spawn by hand
  waveIntervalTicks: 1_000_000,
  mobsPerWaveCap: 1,
  maxAlivePerZone: 50,
  level: 3,
  maxHp: 100,
  moveSpeed: 3,
  hpRegenPerSec: 0,
  modelKey: MOB_MODEL_KEY,
  sizeMult: 1,
  tintStrength: 0.65,
  attackDamage: 5,
  attackRangeSq: 1.8 * 1.8,
  attackCdTicks: 30,
  radius: 0.6,
  rewardGold: 20,
  rewardXp: 40,
  killsPerLevel: 0, // no level grants: they would move gold/xp and blur the split
  boss: {
    enabled: true,
    killThreshold: 3,
    repeatable: true,
    maxHp: 500,
    attackDamage: 12,
    sizeMult: 10,
    moveSpeed: 2.4,
    attackRangeSq: 2.6 * 2.6,
    attackCdTicks: 42,
    radius: 1.8,
    modelKey: "champ.mob.zombie-king",
    bountyGold: 1000,
    bountyXp: 500,
    // 0 so the world-level payout cases below keep measuring gold/xp alone.
    // The 等級提升 path (GH#206) has its own suite in `mobBossBonus.test.ts`.
    bountyLevels: 0,
    lastHitMultiplier: 2,
    // ⚠️ THIS FIXTURE IS DELIBERATELY ON THE NON-DEFAULT MODE. Every case in
    // this file was written against the conserving rule (`sum === pool`), which
    // GH#206 demoted from "the rule" to "one of two modes". Pinning the fixture
    // to `"weight"` keeps those assertions testing the thing they were written
    // to test, instead of being re-baselined into meaninglessness. The shipped
    // default `"bonus"` is covered in `mobBossBonus.test.ts`.
    lastHitMode: "weight",
  },
  special: null,
};

function newWorld(seed = 1): SimWorld {
  const w = new SimWorld(SKELETON_ARENA, seed);
  w.combatActive = true;
  return w;
}

function champAt(w: SimWorld, seat: number, team: number, x: number, z: number): EntityId {
  return spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x, z },
    zone: 0,
  });
}

/** Spawn one ordinary zombie and have `killer` execute it through the real pipeline. */
function killOneZombie(w: SimWorld, killer: EntityId, rules: MobRules = RULES): void {
  const id = spawnMob(w, 0, rules, 1, 0);
  w.damageQueue.push({
    source: killer,
    target: id,
    amount: 100000,
    type: "true",
    crit: false,
    origin: "ability",
  });
  w.step(new Map());
}

const bosses = (w: SimWorld): EntityId[] =>
  [...w.mob.entries()].filter(([, m]) => m.kind === "boss").map(([id]) => id);

// ───────────────────────────────────────────────── the summon boundary ──────

describe("殭屍王召喚 — the boundary, and whose counter it reads", () => {
  it("fires on exactly the Nth kill and NOT on the (N-1)th — at the SHIPPED 100", () => {
    cover("mob-boss-threshold");
    const boss = { enabled: true, killThreshold: 100, repeatable: true };
    // The off-by-one that 「有召喚就好」 would never catch.
    expect(bossSummonsAt(boss, 99)).toBe(false);
    expect(bossSummonsAt(boss, 100)).toBe(true);
    expect(bossSummonsAt(boss, 101)).toBe(false);
    // and the shipped doc really says 100, so this boundary is the live one
    expect(DEFAULT_MOB_WAVES_CONFIG.boss?.killThreshold).toBe(100);
  });

  it("`repeatable` is what decides whether 200 summons a second king", () => {
    cover("mob-boss-threshold");
    const on = { enabled: true, killThreshold: 100, repeatable: true };
    const off = { enabled: true, killThreshold: 100, repeatable: false };
    expect(bossSummonsAt(on, 200)).toBe(true);
    expect(bossSummonsAt(off, 200)).toBe(false);
    // …and BOTH still fire the first time, so the flag cannot be read as
    // "disabled" by a future refactor.
    expect(bossSummonsAt(on, 100)).toBe(true);
    expect(bossSummonsAt(off, 100)).toBe(true);
  });

  it("a disabled / absent block never summons, at any tally", () => {
    cover("mob-boss-threshold");
    expect(bossSummonsAt(null, 1_000_000)).toBe(false);
    expect(bossSummonsAt({ enabled: false, killThreshold: 1, repeatable: true }, 5)).toBe(false);
  });

  it("in a REAL world: the 3rd zombie summons a king, the 2nd does not", () => {
    cover("mob-boss-summon");
    const w = newWorld();
    beginCombatMobs(w, RULES, [0]);
    const hero = champAt(w, 0, 0, 0, 0);

    killOneZombie(w, hero);
    expect(w.mobKills.get(hero)).toBe(1);
    expect(bosses(w)).toHaveLength(0);
    killOneZombie(w, hero);
    expect(w.mobKills.get(hero)).toBe(2);
    expect(bosses(w)).toHaveLength(0); // ← the (N-1) half of the boundary
    killOneZombie(w, hero);
    expect(w.mobKills.get(hero)).toBe(3);
    expect(bosses(w)).toHaveLength(1); // ← and the Nth
  });

  it("counts ONE HERO's kills, not the team's — 2 + 1 across two heroes summons nothing", () => {
    cover("mob-boss-per-hero");
    // THE FAILURE-SHAPE-④ TEST. A team-sum implementation reaches 3 here and
    // summons; a per-hero one does not. The two implementations give DIFFERENT
    // answers to this exact input, which is the whole point.
    const w = newWorld();
    beginCombatMobs(w, RULES, [0]);
    const a = champAt(w, 0, 0, 0, 0);
    const b = champAt(w, 1, 1, 4, 0);

    killOneZombie(w, a);
    killOneZombie(w, a);
    killOneZombie(w, b);
    expect(w.mobKills.get(a)).toBe(2);
    expect(w.mobKills.get(b)).toBe(1);
    expect(bosses(w)).toHaveLength(0);

    // …and the moment A alone reaches 3, one appears.
    killOneZombie(w, a);
    expect(bosses(w)).toHaveLength(1);
  });

  it("the king spawns in the SUMMONER's zone, not zone 0 by accident", () => {
    cover("mob-boss-summon");
    const w = newWorld();
    beginCombatMobs(w, RULES, [0, 1]);
    // a champion fighting in ZONE 1 — a hard-coded 0 (or the dead mob's zone)
    // would put the king in the wrong battlefield and this goes red.
    const hero = spawnChampion(w, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: 0, z: 0 },
      zone: 1,
    });
    for (let i = 0; i < 3; i++) {
      // zombies spawned in zone 0; only the KILLER's zone should matter
      killOneZombie(w, hero);
    }
    const [king] = bosses(w);
    expect(king).toBeDefined();
    expect(w.mob.get(king!)?.zone).toBe(1);
    expect(w.transform.get(king!)?.zone).toBe(1);
  });

  it("killing the KING does not bump the zombie tally (no 100-kill loop)", () => {
    cover("mob-boss-summon");
    const w = newWorld();
    beginCombatMobs(w, RULES, [0]);
    const hero = champAt(w, 0, 0, 0, 0);
    for (let i = 0; i < 3; i++) killOneZombie(w, hero);
    const [king] = bosses(w);
    w.damageQueue.push({
      source: hero,
      target: king!,
      amount: 100000,
      type: "true",
      crit: false,
      origin: "ability",
    });
    w.step(new Map());
    expect(bosses(w)).toHaveLength(0);
    // still 3 — the king is the PRIZE, not a fourth zombie
    expect(w.mobKills.get(hero)).toBe(3);
  });

  it("the king is a real combat unit: king hp/damage/reach, not the zombie's", () => {
    cover("mob-boss-stats");
    const w = newWorld();
    const id = summonMobBoss(w, 0, RULES, asEntityId(1), 3);
    expect(id).not.toBeNull();
    expect(w.health.get(id!)?.maxHp).toBe(RULES.boss!.maxHp);
    expect(w.health.get(id!)?.maxHp).not.toBe(RULES.maxHp);
    expect(w.transform.get(id!)?.radius).toBe(RULES.boss!.radius);
    const p = mobProfile(RULES, "boss");
    expect(p.attackDamage).toBe(12);
    expect(p.moveSpeed).toBe(2.4);
    expect(p.attackCdTicks).toBe(42);
  });
});

// ────────────────────────────────────────────── the bounty arithmetic ───────

describe("殭屍王分紅 — 照傷害比例 + 最後一刀翻倍", () => {
  const A = asEntityId(10);
  const B = asEntityId(11);
  const C = asEntityId(12);

  it("pays out EXACTLY the configured pool — no gold lost or minted to rounding", () => {
    cover("mob-boss-bounty");
    // 1000 / 7 is not an integer, and neither is any of the three shares: this
    // input is chosen so a naive `Math.round` per share OVERPAYS and a naive
    // `Math.floor` UNDERPAYS. Only the named-remainder rule lands on 1000.
    const shares = splitBossBounty(
      [
        [A, 100],
        [B, 200],
        [C, 400],
      ],
      { gold: 1000, xp: 500, levels: 0 },
      B,
      2,
      "weight",
    );
    expect(shares.reduce((s, x) => s + x.gold, 0)).toBe(1000);
    expect(shares.reduce((s, x) => s + x.xp, 0)).toBe(500);
  });

  it("is PROPORTIONAL: double the damage, double the share (equal-weight case)", () => {
    cover("mob-boss-bounty");
    // No last hitter, so no doubling is in play and the ratio is pure damage.
    const s = splitBossBounty(
      [
        [A, 100],
        [B, 200],
      ],
      { gold: 900, xp: 0, levels: 0 },
      null,
      2,
      "weight",
    );
    const byId = new Map(s.map((x) => [x.id, x]));
    expect(byId.get(A)!.gold).toBe(300);
    expect(byId.get(B)!.gold).toBe(600);
  });

  it("the last hitter is DOUBLED — and it is not just 「the top damager wins」", () => {
    cover("mob-boss-lasthit");
    // A did 100, B did 200, and A landed the kill. Weights: A 200, B 200.
    // A CORRECT implementation splits 1000 evenly (500/500).
    // An implementation that forgot the doubling gives A 333 and B 666.
    // An implementation that doubled the WRONG player gives A 333, B 666 too.
    // Three implementations, three different numbers. Failure shape ④ closed.
    const s = splitBossBounty(
      [
        [A, 100],
        [B, 200],
      ],
      { gold: 1000, xp: 0, levels: 0 },
      A,
      2,
      "weight",
    );
    const byId = new Map(s.map((x) => [x.id, x]));
    expect(byId.get(A)!.gold).toBe(500);
    expect(byId.get(B)!.gold).toBe(500);
    expect(byId.get(A)!.lastHit).toBe(true);
    expect(byId.get(B)!.lastHit).toBe(false);
    // …and the total is still exactly the pool: the doubling is a WEIGHT, it
    // does not mint gold.
    expect(s.reduce((t, x) => t + x.gold, 0)).toBe(1000);
  });

  it("the last hitter ALSO gets their proportional share, not only the bonus", () => {
    cover("mob-boss-lasthit");
    // A did 3× B's damage AND landed the kill: 300 vs 100 → weights 600 vs 100.
    // If the implementation paid the last hitter a FLAT doubled slice instead of
    // weighting their damage, A would get far less than 857.
    const s = splitBossBounty(
      [
        [A, 300],
        [B, 100],
      ],
      { gold: 700, xp: 0, levels: 0 },
      A,
      2,
      "weight",
    );
    const byId = new Map(s.map((x) => [x.id, x]));
    expect(byId.get(A)!.gold).toBe(600);
    expect(byId.get(B)!.gold).toBe(100);
  });

  it("`lastHitMultiplier: 1` really removes the bonus (the knob is live)", () => {
    cover("mob-boss-lasthit");
    const s = splitBossBounty(
      [
        [A, 100],
        [B, 100],
      ],
      { gold: 1000, xp: 0, levels: 0 },
      A,
      1,
      "weight",
    );
    expect(s.map((x) => x.gold)).toEqual([500, 500]);
  });

  it("is ORDER-INDEPENDENT: the same table shuffled pays the same amounts", () => {
    cover("mob-boss-determinism");
    // `world.bossDamage`'s inner Map iterates in FIRST-HIT order, which two
    // hosts can legitimately disagree about. Sorting by entity id is what makes
    // that unobservable; this test is what proves the sort is there.
    const forward = splitBossBounty(
      [
        [A, 137],
        [B, 291],
        [C, 55],
      ],
      { gold: 1000, xp: 333, levels: 0 },
      C,
      2,
      "weight",
    );
    const backward = splitBossBounty(
      [
        [C, 55],
        [B, 291],
        [A, 137],
      ],
      { gold: 1000, xp: 333, levels: 0 },
      C,
      2,
      "weight",
    );
    expect(backward).toEqual(forward);
    expect(forward.map((x) => x.id)).toEqual([A, B, C]); // ascending id
  });

  it("a champion who did no damage but landed the blow still gets paid", () => {
    cover("mob-boss-bounty");
    const s = splitBossBounty([[A, 400]], { gold: 1000, xp: 0, levels: 0 }, B, 2, "weight");
    const byId = new Map(s.map((x) => [x.id, x]));
    expect(byId.has(B)).toBe(true);
    expect(s.reduce((t, x) => t + x.gold, 0)).toBe(1000);
  });

  it("nobody at all → nobody is paid (and nothing throws)", () => {
    cover("mob-boss-bounty");
    expect(splitBossBounty([], { gold: 1000, xp: 100, levels: 0 }, null, 2, "weight")).toEqual([]);
  });
});

// ────────────────────────────────────── the payout through a real world ─────

describe("殭屍王分紅 — end to end, through real damage packets", () => {

  function fight(seed: number): {
    w: SimWorld;
    heroes: EntityId[];
    ev: Record<string, unknown>;
    goldBefore: Map<EntityId, number>;
  } {
    const w = newWorld(seed);
    beginCombatMobs(w, RULES, [0]);
    const h = [champAt(w, 0, 0, -3, 0), champAt(w, 1, 1, 3, 0), champAt(w, 2, 2, 0, 3)];
    const goldBefore = new Map(h.map((id) => [id, w.champion.get(id)!.gold]));
    const king = summonMobBoss(w, 0, RULES, h[0]!, 3)!;
    const hit = (src: EntityId, amount: number): void => {
      w.damageQueue.push({ source: src, target: king, amount, type: "true", crit: false, origin: "ability" });
      w.step(new Map());
    };
    // 500 hp total. 100 + 200 + the finisher.
    hit(h[0]!, 100); // hero 0: 100
    hit(h[1]!, 200); // hero 1: 200
    hit(h[2]!, 400); // hero 2: 200 recorded (overkill is NOT credited) + the kill
    const ev = w.events.find((e) => e.type === "mobBossSlain");
    expect(ev, "mobBossSlain never reached the event stream").toBeDefined();
    return { w, heroes: h, ev: ev!.data, goldBefore };
  }

  it("emits mobBossSlain carrying the WHOLE split — the ② guard", () => {
    cover("mob-boss-event");
    const { heroes, ev } = fight(1);
    const shares = ev["shares"] as { id: number; gold: number; damage: number; lastHit: boolean }[];
    expect(shares).toHaveLength(3);
    // every participant is named, with their damage and their money
    expect(shares.map((s) => s.id).sort((a, b) => a - b)).toEqual([...heroes].sort((a, b) => a - b));
    expect(ev["killer"]).toBe(heroes[2]);
    expect(ev["lastHitMultiplier"]).toBe(2);
    // the number the client would print equals the number actually granted
    for (const s of shares) {
      expect(s.gold).toBeGreaterThan(0);
    }
    expect(ev["totalGold"]).toBe(shares.reduce((t, s) => t + s.gold, 0));
  });

  it("the granted gold matches the announced split, and totals the configured pool", () => {
    cover("mob-boss-bounty");
    const { w, heroes, ev, goldBefore } = fight(1);
    const shares = ev["shares"] as { id: number; gold: number; xp: number }[];
    let sum = 0;
    for (const s of shares) {
      const champ = w.champion.get(s.id as EntityId)!;
      // THE ANNOUNCED NUMBER IS THE GRANTED NUMBER (#125): the wallet moved by
      // exactly what the event said, and by nothing else (killsPerLevel is 0
      // here and there is no other income in this world).
      expect(champ.gold - goldBefore.get(s.id as EntityId)!).toBe(s.gold);
      sum += s.gold;
    }
    expect(sum).toBe(RULES.boss!.bountyGold); // 1000, exactly
    // and the finisher — hero 2, who did the SAME 200 as hero 1 — got strictly
    // more, which is the 翻倍 landing on the right person.
    const byId = new Map(shares.map((s) => [s.id, s]));
    expect(byId.get(heroes[2] as number)!.gold).toBeGreaterThan(byId.get(heroes[1] as number)!.gold);
  });

  it("is DETERMINISTIC: two runs of the same seed pay bit-identical amounts", () => {
    cover("mob-boss-determinism");
    const a = fight(7);
    const b = fight(7);
    expect(b.ev["shares"]).toEqual(a.ev["shares"]);
    expect(b.ev["totalGold"]).toEqual(a.ev["totalGold"]);
    // …and a different seed does not change the payout either, because none of
    // it is random — a payout that moved with the seed would be the bug.
    const c = fight(99);
    expect(c.ev["shares"]).toEqual(a.ev["shares"]);
  });

  it("the ledger dies with the king — a recycled entity id inherits nothing", () => {
    cover("mob-boss-bounty");
    const { w } = fight(1);
    expect(w.bossDamage.size).toBe(0);
  });

  it("endCombatMobs despawns a king silently and clears the ledger", () => {
    cover("mob-boss-bounty");
    const w = newWorld();
    beginCombatMobs(w, RULES, [0]);
    const hero = champAt(w, 0, 0, 0, 0);
    const king = summonMobBoss(w, 0, RULES, hero, 3)!;
    w.damageQueue.push({ source: hero, target: king, amount: 50, type: "true", crit: false, origin: "ability" });
    w.step(new Map());
    expect(w.bossDamage.size).toBe(1);

    // A ledger keyed by an id that is NOT in `world.mob` — the exact state
    // `endCombatMobs`'s wholesale `bossDamage.clear()` exists for. Without that
    // line this entry survives into the next round, because the despawn loop
    // only reaches ids `world.mob` still knows about. (Mutating this line away
    // and finding the suite still green is what put this assertion here.)
    const orphan = asEntityId(9999);
    w.bossDamage.set(orphan, new Map([[hero, 500]]));
    expect(w.bossDamage.size).toBe(2);

    const goldBefore = w.champion.get(hero)!.gold;
    endCombatMobs(w);
    expect(w.mob.size).toBe(0);
    expect(w.bossDamage.size).toBe(0);
    expect(w.bossDamage.has(orphan)).toBe(false);
    expect(w.champion.get(hero)!.gold).toBe(goldBefore); // no post-round payout
  });
});

// ─────────────────────────────────────────────────────── 特殊殭屍 ───────────

describe("特殊殭屍 — the roll, and whether anyone can SEE it", () => {
  const specialRules = (chance: number): MobRules => ({
    ...RULES,
    special: {
      chance,
      hpMult: 2,
      damageMult: 1.5,
      moveSpeedMult: 1.25,
      radiusMult: 1.8,
      sizeMult: 1.8,
      rewardMult: 3,
      modelKey: "champ.mob.zombie-special",
    },
  });

  it("the roll goes through world.rng — same seed, same zombies", () => {
    cover("mob-special-rng");
    const kinds = (seed: number): string[] => {
      const w = newWorld(seed);
      beginCombatMobs(w, specialRules(0.5), [0]);
      const out: string[] = [];
      for (let i = 0; i < 40; i++) out.push(w.mob.get(spawnMob(w, 0, specialRules(0.5), 1, i))!.kind);
      return out;
    };
    const a = kinds(12345);
    expect(kinds(12345)).toEqual(a); // reproducible
    // …and it actually VARIES, so a hard-coded "normal" (or "special") fails.
    expect(new Set(a).size).toBe(2);
    expect(a).toContain("special");
    expect(a).toContain("normal");
    // a DIFFERENT seed gives a different sequence — proving the roll reads the
    // stream rather than an index-derived pattern.
    expect(kinds(999)).not.toEqual(a);
  });

  it("chance 0 draws NOTHING from the shared stream (crits/orb stay put)", () => {
    cover("mob-special-rng");
    const w = newWorld(5);
    beginCombatMobs(w, specialRules(0), [0]);
    const before = w.rng.state;
    for (let i = 0; i < 20; i++) spawnMob(w, 0, specialRules(0), 1, i);
    expect(w.rng.state).toBe(before);
    expect([...w.mob.values()].every((m) => m.kind === "normal")).toBe(true);
    // and with the chance armed the stream DOES move — so the line above is
    // measuring a real absence.
    const armed = newWorld(5);
    beginCombatMobs(armed, specialRules(0.5), [0]);
    const armedBefore = armed.rng.state;
    for (let i = 0; i < 20; i++) spawnMob(armed, 0, specialRules(0.5), 1, i);
    expect(armed.rng.state).not.toBe(armedBefore);
  });

  it("chance 1 makes EVERY zombie special, with its own hp / body / reach", () => {
    cover("mob-special-stats");
    const rules = specialRules(1);
    const w = newWorld();
    beginCombatMobs(w, rules, [0]);
    const id = spawnMob(w, 0, rules, 1, 0);
    expect(w.mob.get(id)!.kind).toBe("special");
    expect(w.health.get(id)!.maxHp).toBe(RULES.maxHp * 2);
    expect(w.transform.get(id)!.radius).toBeCloseTo(RULES.radius * 1.8, 9);
    const p = mobProfile(rules, "special");
    expect(p.attackDamage).toBeCloseTo(RULES.attackDamage * 1.5, 9);
    expect(p.moveSpeed).toBeCloseTo(RULES.moveSpeed * 1.25, 9);
    // reach scales with the body, or a wider zombie stands inside its target
    expect(p.attackRangeSq).toBeCloseTo(RULES.attackRangeSq * 1.8 * 1.8, 9);
  });

  it("IT IS VISIBLE: the three kinds resolve to three DIFFERENT rendered sizes", () => {
    cover("mob-special-visible");
    // 「它要看得出來」.
    //
    // ⚠️ THIS ASSERTION MOVED CHANNEL IN GH#192, and the move is the point.
    // #262 asserted three distinct MODEL KEYS, because the key was then the only
    // thing that differed. Since GH#192 the mesh is resolved FROM THE CHAMPION,
    // so all three kinds normally share ONE key — and a key-distinctness test
    // would now fail on a perfectly correct build while a build that rendered
    // three identical zombies could pass by naming three docs that happen to
    // point at one mesh (which is exactly what #262's docs did: all three were
    // `blocky-undead.glb`). The SIZE is the behaviour; assert the size.
    const rules = specialRules(0.5);
    const sizes = [
      mobSizeMultFor(rules, "normal"),
      mobSizeMultFor(rules, "special"),
      mobSizeMultFor(rules, "boss"),
    ];
    expect(new Set(sizes).size).toBe(3);
    expect(sizes[2]!).toBeGreaterThan(sizes[1]!);
    expect(sizes[1]!).toBeGreaterThan(sizes[0]!);
    // …and the SHIPPED doc is authored the same way, not just this fixture.
    const shipped = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT);
    const shippedSizes = [
      mobSizeMultFor(shipped, "normal"),
      mobSizeMultFor(shipped, "special"),
      mobSizeMultFor(shipped, "boss"),
    ];
    expect(new Set(shippedSizes).size).toBe(3);
    // The king is TEN TIMES the zombie (owner GH#192 「modal 大小是10倍」) —
    // 「大一點」 is not 「看得出來是王」, so the ratio is pinned, not just ordered.
    expect(shippedSizes[2]! / shippedSizes[0]!).toBeCloseTo(10, 9);
    // A mob whose rules were never armed reads as 1× rather than 0× / NaN×.
    expect(mobSizeMultFor(null, "boss")).toBe(1);
  });

  it("殭屍王 HP is ×100 of THAT ROUND's zombie, not a flat number (owner GH#192)", () => {
    cover("mob-boss-hpmult");
    // MUTATION SURVIVOR FIX. The first version of this only checked round 3,
    // where ×100 of a 60 hp zombie is 6,000 — byte-identical to the flat `maxHp`
    // the doc also carries. Ignoring `hpMult` entirely therefore passed. Round 9
    // is where the two implementations SEPARATE: the zombie is 180 hp there, so
    // ×100 is 18,000 while the flat number is still 6,000.
    const r3 = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT, 3);
    const r9 = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT, 9);
    const mult = DEFAULT_MOB_WAVES_CONFIG.boss!.hpMult!;
    expect(mult).toBe(100);
    expect(r3.boss!.maxHp).toBe(r3.maxHp * mult);
    expect(r9.boss!.maxHp).toBe(r9.maxHp * mult);
    // …and the two rounds really do give different kings, so this is a CURVE.
    expect(r9.boss!.maxHp).toBeGreaterThan(r3.boss!.maxHp);
    // the flat `maxHp` is what a NO-hpMult arena still gets — the legacy path
    // must not have been deleted along the way
    const flat = mobRulesFromConfig(
      {
        ...DEFAULT_MOB_WAVES_CONFIG,
        boss: { ...DEFAULT_MOB_WAVES_CONFIG.boss!, hpMult: undefined },
      },
      DT,
      9,
    );
    expect(flat.boss!.maxHp).toBe(DEFAULT_MOB_WAVES_CONFIG.boss!.maxHp);
    expect(flat.boss!.maxHp).not.toBe(r9.boss!.maxHp);
  });

  it("殭屍外觀 survives the JSON round trip, and EVERY failure degrades to the SHIPPED tint", () => {
    cover("mob-special-visible");
    // The round trip the wire really does.
    const shipped = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT);
    expect(parseMobVisualJson(mobVisualJson(shipped)).tintStrength).toBe(shipped.tintStrength);
    expect(shipped.tintStrength).toBe(DEFAULT_MOB_TINT_STRENGTH);

    // THE DISCRIMINATING PART. Every degraded input must land on the SHIPPED
    // table, never on 0 — 0 means 「no tint」, i.e. the zombies silently render
    // in the champion's own colours and 「跟玩家混在一起」 (failure shape ③: the
    // feature deleted, quietly, with everything still green).
    for (const bad of ["", null, undefined, "not json", "[]", "null", "3", '{"tintStrength":"x"}',
      '{"tintStrength":null}', '{"tintStrength":2}', '{"tintStrength":-1}', "{}"]) {
      expect(parseMobVisualJson(bad).tintStrength, `${String(bad)} degraded wrong`).toBe(
        DEFAULT_MOB_TINT_STRENGTH,
      );
    }
    // …but a LEGITIMATE 0 (the operator really did turn 染黑 off) is honoured.
    expect(parseMobVisualJson('{"tintStrength":0}').tintStrength).toBe(0);
    expect(parseMobVisualJson('{"tintStrength":1}').tintStrength).toBe(1);
    // A world that never armed the mechanic still publishes the shipped default
    // rather than an un-tinted table.
    expect(parseMobVisualJson(mobVisualJson(null)).tintStrength).toBe(DEFAULT_MOB_TINT_STRENGTH);
  });

  it("pays `rewardMult`× on death — the reason to hunt it", () => {
    cover("mob-special-reward");
    const rules = specialRules(1);
    const w = newWorld();
    beginCombatMobs(w, rules, [0]);
    const hero = champAt(w, 0, 0, 0, 0);
    const before = w.champion.get(hero)!.gold;
    killOneZombie(w, hero, rules);
    expect(w.champion.get(hero)!.gold - before).toBe(RULES.rewardGold * 3);
    // a special zombie is still ONE zombie for the quest counter
    expect(w.mobKills.get(hero)).toBe(1);
    const ev = w.events.find((e) => e.type === "mobSlain");
    expect(ev?.data["kind"]).toBe("special");
    expect(ev?.data["gold"]).toBe(RULES.rewardGold * 3);
  });

  it("a plain zombie still pays exactly the base reward (the multiplier is scoped)", () => {
    cover("mob-special-reward");
    const w = newWorld();
    beginCombatMobs(w, RULES, [0]);
    const hero = champAt(w, 0, 0, 0, 0);
    const before = w.champion.get(hero)!.gold;
    killOneZombie(w, hero);
    expect(w.champion.get(hero)!.gold - before).toBe(RULES.rewardGold);
  });
});

// ───────────────────────────────────────── off by default / neutrality ──────

describe("#262 is inert unless armed", () => {
  it("rules with boss+special null behave exactly as #215 did", () => {
    cover("mob-boss-off");
    const w = newWorld();
    beginCombatMobs(w, RULES, [0]);
    const hero = champAt(w, 0, 0, 0, 0);
    const rules: MobRules = { ...RULES, boss: null, special: null };
    w.mobRules = rules;
    const before = w.rng.state;
    for (let i = 0; i < 10; i++) killOneZombie(w, hero, rules);
    expect(bosses(w)).toHaveLength(0);
    expect(w.rng.state).toBe(before);
    expect(w.events.some((e) => e.type === "mobBossSpawn")).toBe(false);
  });

  it("summonMobBoss on disarmed rules spawns nothing at all", () => {
    cover("mob-boss-off");
    const w = newWorld();
    expect(summonMobBoss(w, 0, { ...RULES, boss: null }, asEntityId(1), 3)).toBeNull();
    expect(w.mob.size).toBe(0);
  });

  it("the shipped config converts into live boss + special rules", () => {
    cover("mob-boss-config");
    // The 「受測的東西不是出貨的東西」 guard (failure shape ⑤): everything above
    // runs on a fixture, so this pins the SHIPPED doc's own conversion.
    const r = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT);
    expect(r.boss).not.toBeNull();
    expect(r.boss!.enabled).toBe(true);
    expect(r.boss!.killThreshold).toBe(100);
    expect(r.boss!.lastHitMultiplier).toBe(2);
    expect(r.boss!.bountyGold).toBeGreaterThan(0);
    // seconds → ticks happened once, at arm time
    expect(r.boss!.attackCdTicks).toBe(Math.round(DEFAULT_MOB_WAVES_CONFIG.boss!.attackCdSec / DT));
    expect(r.special).not.toBeNull();
    // percent → fraction happened once, at arm time
    expect(r.special!.chance).toBeCloseTo(DEFAULT_MOB_WAVES_CONFIG.special!.chancePercent / 100, 12);
    expect(r.special!.chance).toBeGreaterThan(0);
    expect(r.special!.chance).toBeLessThan(1);
  });

  it("GH#206 一個人單殺殭屍王 → 錢包多 60,000(= 30,000 的 200%),走出貨設定", () => {
    cover("mob-boss-bounty");
    // owner 2026-07-28:「殭屍王 總獎金也要後台能設定 預設是 30,000」
    // owner 2026-07-29(GH#206),推翻了上面那句的「總」:
    //   「除了最後一刀的人可以雙倍領取(超過總額沒關係,極端情形第一刀就是最後
    //     一刀全傷害 = 200% 金錢跟等級獎勵)」
    //
    // ⚠️ 這條測試以前斷言 30,000,而且它是對的 —— 對**當時的規則**而言。
    // 現在出貨的 `lastHitMode` 是 `"bonus"`,而這個情境正好就是 owner 舉的
    // 那個極端例子(一個人打完全部傷害又補刀),所以正確答案是 60,000。
    // 這不是「測試壞了去改數字」,這是規格反轉之後這條測試該有的樣子;
    // 舊語意的守衛沒有消失,它們在同一個檔的 fixture(已釘 `"weight"`)裡。
    //
    // 為什麼不是 `expect(DEFAULT_MOB_WAVES_CONFIG.boss.bountyGold).toBe(30000)`:
    // 那是失敗形狀⑦(掃屬性而非行為)。這個數字要經過
    //   出貨文件 → mobRulesFromConfig → summonMobBoss → 傷害管線 → splitBossBounty
    //   → champ.gold + `mobBossSlain` 事件
    // 才會變成玩家真的拿到的金幣;中間任何一段把它換成別的常數(例如把
    // `rules.boss.bountyGold` 讀成 `rules.rewardGold`)屬性斷言都看不到。
    //
    // 30,000 與其它任何常數都差得夠遠:雜魚獎勵 20、XP 賞金 1,200、舊值 3,000,
    // 沒有一個能碰巧湊出這個數字。
    const w = newWorld();
    const shipped = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT);
    beginCombatMobs(w, shipped, [0]);
    const hero = champAt(w, 0, 0, 0, 0);
    const king = summonMobBoss(w, 0, shipped, hero, shipped.boss!.killThreshold)!;

    const goldBefore = w.champion.get(hero)!.gold;
    w.damageQueue.push({
      source: hero,
      target: king,
      amount: shipped.boss!.maxHp * 10,
      type: "true",
      crit: false,
      origin: "ability",
    });
    w.step(new Map());

    // 30,000 的 200%。與其它任何常數都差得夠遠:雜魚獎勵 20、XP 賞金 1,200、
    // 舊值 3,000、獎金池本身 30,000 —— 沒有一個能碰巧湊出 60,000,
    // 所以「加碼有沒有真的發出去」是可證偽的。
    expect(w.champion.get(hero)!.gold - goldBefore).toBe(60000);
    // 失敗形狀②:算對了但沒送出去。`mobBossSlain` 是唯一會離開伺服器的通道。
    const ev = w.events.find((e) => e.type === "mobBossSlain")!;
    expect(ev).toBeDefined();
    const shares = ev.data["shares"] as { id: number; gold: number }[];
    expect(shares).toHaveLength(1);
    expect(shares[0]).toMatchObject({ id: hero, gold: 60000 });
    // 事件上的 totalGold 必須是**實發**而不是設定值 —— 否則分紅面板會寫
    // 「總獎金 30,000」而玩家實拿 60,000(失敗形態②的顯示版)。
    expect(ev.data["totalGold"]).toBe(60000);
    // 等級也走同一條路:出貨 50 級 → 200% = 100 級的**請求**,
    // 但實發受 LEVEL_CAP 99 夾住,所以事件報的必須 ≤ 請求且 > 0。
    const paidLevels = ev.data["totalLevels"] as number;
    expect(paidLevels).toBeGreaterThan(0);
    expect(paidLevels).toBeLessThanOrEqual(100);
  });

  it("mobSystem is still a strict no-op on a world nobody armed", () => {
    cover("mob-boss-off");
    const w = new SimWorld(SKELETON_ARENA, 7);
    w.combatActive = true;
    const before = w.digest();
    mobSystem(w);
    expect(w.mobTicks).toBe(-1);
    expect(w.digest()).toBe(before);
    expect(w.bossDamage.size).toBe(0);
  });

  it("a king is on the MONSTER team and carries no ChampionComp", () => {
    cover("mob-boss-summon");
    // the #215 neutrality contract, extended to the king: the scoreboard, duel
    // resolution and placement must stay blind to it BY CONSTRUCTION.
    const w = newWorld();
    const id = summonMobBoss(w, 0, RULES, asEntityId(1), 3)!;
    expect(w.team.get(id)?.teamId).toBe(MONSTER_TEAM);
    expect(w.champion.has(id)).toBe(false);
    expect(w.stats.has(id)).toBe(false);
    expect(w.matchStats.has(id)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────── ADVERSARIAL ────
/**
 * VERIFIER PASS (2026-07-28). Each `it` below was written against a MUTANT that
 * the delivered suite could not tell from the real implementation — a mutation
 * applied to the shipping source, the whole suite run, and every test still
 * green. They are listed with the mutant they kill, because a guard whose
 * mutant is not stated is a guard nobody can check.
 */
describe("殭屍王 / 特殊殭屍 — guards the delivered suite was blind to", () => {
  const A = asEntityId(10);
  const B = asEntityId(11);
  const C = asEntityId(12);

  it("MUTANT N2: the rounding remainder goes to the LAST HITTER, by name", () => {
    cover("mob-boss-bounty");
    // Every payout case in the delivered suite happened to divide EXACTLY
    // (1000 over weights 200/200, 900 over 100/200), so 「餘數全部給補刀者」 —
    // a stated rule in mobBoss.ts's header — was never observed. Handing the
    // remainder to the last ARRAY SLOT instead kept every total right and every
    // test green.
    //
    // 100 gold over weights 1 / 1 / 2 (C last-hits, ×2) = 4: 25 / 25 / 50 is
    // exact, so instead use a pool that does NOT divide. Weights 100/200/200
    // (B last-hits at ×2 on 100 damage) total 500; 1000 gold → 200/400/400,
    // also exact. 1001 is not: 200/400/400 = 1000, one coin left over — and it
    // must land on B, who is NEITHER the first nor the last id in the sorted
    // list. Both the "give it to ids[0]" and the "give it to the last slot"
    // implementations put it somewhere else.
    const shares = splitBossBounty(
      [
        [A, 100],
        [B, 100],
        [C, 200],
      ],
      { gold: 1001, xp: 1001, levels: 0 },
      B,
      2,
      "weight",
    );
    const byId = new Map(shares.map((s) => [s.id, s]));
    expect(shares.reduce((t, s) => t + s.gold, 0)).toBe(1001); // nothing evaporates
    expect(byId.get(B)!.lastHit).toBe(true);
    // A: 100/500, C: 200/500, B: 200/500 → 200 / 400 / 400 = 1000, +1 to B.
    expect(byId.get(A)!.gold).toBe(200);
    expect(byId.get(C)!.gold).toBe(400);
    expect(byId.get(B)!.gold).toBe(401); // ← the named recipient, not a slot
    expect(byId.get(B)!.xp).toBe(401);
    // …and with NO last hitter the rule falls back to the LOWEST ENTITY ID —
    // which is a stated rule too, and equally unobserved.
    const orphaned = splitBossBounty(
      [
        [C, 200],
        [B, 100],
        [A, 100],
      ],
      { gold: 1001, xp: 0, levels: 0 },
      null,
      2,
      "weight",
    );
    const byId2 = new Map(orphaned.map((s) => [s.id, s]));
    expect(byId2.get(A)!.gold).toBe(251); // 250 + the odd coin, lowest id
    expect(byId2.get(B)!.gold).toBe(250);
    expect(byId2.get(C)!.gold).toBe(500);
  });

  it("MUTANT N4/N5: the announced XP is really granted, and the ledger measures MITIGATED damage", () => {
    cover("mob-boss-bounty");
    // N4: deleting `grantXp` from payBossBounty left the whole suite green —
    // `mobBossSlain.shares[].xp` was asserted, the WALLET was not. That is #125
    // (「顯示的數字必須是玩家真正拿到的」) failing in the direction nobody looked.
    // N5: feeding `recordDamage` the RAW packet amount instead of the
    // post-mitigation `impact` also left it green, because no assertion pinned
    // an exact share — only orderings and sums.
    const w = newWorld(3);
    beginCombatMobs(w, RULES, [0]);
    const h = [champAt(w, 0, 0, -3, 0), champAt(w, 1, 1, 3, 0)];
    const goldBefore = h.map((id) => w.champion.get(id)!.gold);
    // `champion.xp` is the BAR, not the total — `grantXp` spends it on levels.
    // `matchStats.xp` is the cumulative earned figure (`recordXp`), which is the
    // one that has to equal the announced number.
    const xpBefore = h.map((id) => w.matchStats.get(id)!.xp);
    const king = summonMobBoss(w, 0, RULES, h[0]!, 3)!;
    const hit = (src: EntityId, amount: number): void => {
      w.damageQueue.push({ source: src, target: king, amount, type: "true", crit: false, origin: "ability" });
      w.step(new Map());
    };
    hit(h[0]!, 100); // hero 0 → 100 recorded
    hit(h[1]!, 400); // hero 1 → 400 recorded (post-mitigation, NOT capped at the
    //                  king's remaining 400 hp and NOT the raw packet either —
    //                  they coincide here, which is why the exact numbers below
    //                  are what pin the semantics), and lands the kill at ×2.
    const ev = w.events.find((e) => e.type === "mobBossSlain")!;
    const shares = ev.data["shares"] as { id: number; gold: number; xp: number; damage: number }[];
    const byId = new Map(shares.map((s) => [s.id, s]));
    // weights 100 / 800 → 900. gold 1000 → 111 / 888 = 999, +1 to the last
    // hitter = 889. xp 500 → 55 / 444 = 499, +1 → 445.
    expect(byId.get(h[0]! as number)!.damage).toBe(100);
    expect(byId.get(h[1]! as number)!.damage).toBe(400);
    expect(byId.get(h[0]! as number)!.gold).toBe(111);
    expect(byId.get(h[1]! as number)!.gold).toBe(889);
    expect(byId.get(h[0]! as number)!.xp).toBe(55);
    expect(byId.get(h[1]! as number)!.xp).toBe(445);
    // THE WALLET, not the announcement: both currencies actually moved, by
    // exactly what was announced.
    for (let i = 0; i < h.length; i++) {
      const s = byId.get(h[i]! as number)!;
      expect(w.champion.get(h[i]!)!.gold - goldBefore[i]!).toBe(s.gold);
      expect(w.matchStats.get(h[i]!)!.xp - xpBefore[i]!).toBe(s.xp);
      expect(s.xp).toBeGreaterThan(0); // …and there WAS xp to lose
    }
    expect(shares.reduce((t, s) => t + s.xp, 0)).toBe(RULES.boss!.bountyXp);
  });

  it("MUTANT N5': the ledger credits OVERKILL in full — pinned because the docblock claimed it did not", () => {
    cover("mob-boss-bounty");
    // `recordDamage` is handed `impact` (post-mitigation, pre-shield), and
    // NOTHING on this path caps it at the king's remaining hp: `mitigate()`
    // clamps only a STRUCTURE's per-packet cap, and `hpLoss` is the same
    // uncapped number (a mob has no StatsComp and no shields, so `output`,
    // `hpLoss` and the raw packet amount all coincide — swapping between them
    // is an EQUIVALENT change, which is why no assertion could tell them apart).
    // What is NOT equivalent is capping at remaining hp, and the delivered
    // comment claimed exactly that (「killing blow's overkill cannot inflate one
    // player's share」). It does inflate it.
    //
    // THIS TEST DOES NOT ENDORSE THE RULE — it pins it. Which of the two is
    // wanted is an owner call (see the note in stats/matchStats.ts); until then
    // the number a player is paid cannot change without this going red.
    const w = newWorld(4);
    beginCombatMobs(w, RULES, [0]);
    const h = [champAt(w, 0, 0, -3, 0), champAt(w, 1, 1, 3, 0)];
    const king = summonMobBoss(w, 0, RULES, h[0]!, 3)!;
    const hit = (src: EntityId, amount: number): void => {
      w.damageQueue.push({ source: src, target: king, amount, type: "true", crit: false, origin: "ability" });
      w.step(new Map());
    };
    hit(h[0]!, 100); // 100 of the king's 500 hp
    hit(h[1]!, 4000); // 400 hp REMAINED — 3,600 of this is overkill
    const ev = w.events.find((e) => e.type === "mobBossSlain")!;
    const byId = new Map(
      (ev.data["shares"] as { id: number; gold: number; damage: number }[]).map((s) => [s.id, s]),
    );
    // credited 4000, not the 400 hp it removed
    expect(byId.get(h[1]! as number)!.damage).toBe(4000);
    // weights 100 / 8000 → 8100. 1000 gold → 12 / 987, remainder 1 → 988.
    // (an hp-loss ledger would read 100 / 800 → 111 / 889 instead)
    expect(byId.get(h[0]! as number)!.gold).toBe(12);
    expect(byId.get(h[1]! as number)!.gold).toBe(988);
  });

  it("MUTANT N6: an ORDINARY zombie pays the base reward even when 特殊殭屍 is armed", () => {
    cover("mob-special-reward");
    // The delivered suite checked the base reward only with `special: null`,
    // and the ×3 reward only with `chance: 1` — so NOTHING ever killed a normal
    // zombie in a world where the special block exists. Reading
    // `rules.special.rewardMult` unconditionally (every zombie pays 3×, 60g
    // instead of 20g, the whole match economy tripled) passed the entire suite.
    const rules: MobRules = {
      ...RULES,
      special: {
        chance: 0, // armed but never rolls → the kind is deterministically normal
        hpMult: 2,
        damageMult: 1.5,
        moveSpeedMult: 1.25,
        radiusMult: 1.8,
        sizeMult: 1.8,
        rewardMult: 3,
        modelKey: "champ.mob.zombie-special",
      },
    };
    const w = newWorld();
    beginCombatMobs(w, rules, [0]);
    const hero = champAt(w, 0, 0, 0, 0);
    const before = w.champion.get(hero)!.gold;
    const xpBefore = w.champion.get(hero)!.xp;
    killOneZombie(w, hero, rules);
    expect(w.mob.size).toBe(0);
    expect(w.champion.get(hero)!.gold - before).toBe(RULES.rewardGold); // 20, not 60
    expect(w.champion.get(hero)!.xp - xpBefore).toBe(RULES.rewardXp); // 40, not 120
    const ev = w.events.find((e) => e.type === "mobSlain");
    expect(ev?.data["kind"]).toBe("normal");
    expect(ev?.data["gold"]).toBe(RULES.rewardGold);
  });

  it("MUTANT N8: two kings in one zone do NOT stand on the same rim point", () => {
    cover("mob-boss-summon");
    // `summonMobBoss` keys the spawn position by `kills` precisely so a
    // repeatable king cannot stack on its predecessor — a claim in its own
    // docblock that nothing measured. Dropping `kills` from the key kept the
    // suite green and put both kings on one pixel.
    const w = newWorld();
    const first = summonMobBoss(w, 0, RULES, asEntityId(1), 3)!;
    const second = summonMobBoss(w, 0, RULES, asEntityId(1), 6)!;
    const a = w.transform.get(first)!.pos;
    const b = w.transform.get(second)!.pos;
    const d2 = (a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z);
    // Farther apart than the two bodies are wide, so they are not overlapping.
    expect(d2).toBeGreaterThan((2 * RULES.boss!.radius) ** 2);
  });

  it("MUTANT N9: a damager that despawns takes its contribution with it", () => {
    cover("mob-boss-bounty");
    // `destroy()` clears this entity BOTH as a boss (outer key) and as a
    // DAMAGER of some other boss (inner key). Only the outer half was measured;
    // deleting the inner loop left the suite green while a recycled entity id
    // inherited somebody else's damage and got paid for it.
    const w = newWorld();
    beginCombatMobs(w, RULES, [0]);
    const gone = champAt(w, 0, 0, -3, 0);
    const alive = champAt(w, 1, 1, 3, 0);
    const king = summonMobBoss(w, 0, RULES, gone, 3)!;
    for (const [src, amount] of [
      [gone, 400],
      [alive, 50],
    ] as const) {
      w.damageQueue.push({ source: src, target: king, amount, type: "true", crit: false, origin: "ability" });
      w.step(new Map());
    }
    expect(w.bossDamage.get(king)!.get(gone)).toBe(400);

    // …the big damager leaves the match (disconnect / champion swap).
    w.destroy(gone);
    expect(w.bossDamage.get(king)!.has(gone)).toBe(false);

    // A brand-new entity that inherits the recycled id must NOT be paid for the
    // 400 damage it never did: `alive` finishes the king alone and takes it all.
    const goldBefore = w.champion.get(alive)!.gold;
    w.damageQueue.push({ source: alive, target: king, amount: 100000, type: "true", crit: false, origin: "ability" });
    w.step(new Map());
    const ev = w.events.find((e) => e.type === "mobBossSlain")!;
    const shares = ev.data["shares"] as { id: number; gold: number }[];
    expect(shares.map((s) => s.id)).toEqual([alive]);
    expect(w.champion.get(alive)!.gold - goldBefore).toBe(RULES.boss!.bountyGold);
  });

  it("MUTANT N10: the king actually WALKS at the king's speed, through MovementSystem", () => {
    cover("mob-boss-stats");
    // `mobProfile(rules,"boss").moveSpeed === 2.4` is an ATTRIBUTE of a pure
    // function (failure shape ⑦). The MovementSystem edit that makes a mob read
    // ITS OWN kind's speed had no behavioural guard at all: reverting it to
    // `world.mobRules.moveSpeed` — a king sprinting at the zombie's 3.0 — left
    // every test green. This measures DISTANCE TRAVELLED in a real world.
    //
    // Two worlds, identical in every respect except the mob's kind, both mobs
    // teleported to the same start point so the arena geometry cannot explain a
    // difference.
    // ZONE 0's centre is (-40, 0) with boundaryRadius 24 (SKELETON_ARENA), so
    // both bodies are placed well INSIDE it — a body clamped back over the rim
    // would be measuring `clampToBoundary`, not walking speed, and the king's
    // 1.8 radius clamps sooner than the zombie's 0.6.
    const ZC = -40;
    const walk = (kind: "normal" | "boss"): number => {
      const w = newWorld();
      beginCombatMobs(w, RULES, [0]);
      champAt(w, 0, 0, ZC, 12); // the prey — far enough that it never chases back
      const id = kind === "boss" ? summonMobBoss(w, 0, RULES, asEntityId(1), 3)! : spawnMob(w, 0, RULES, 1, 0);
      const t = w.transform.get(id)!;
      t.pos.x = ZC;
      t.pos.z = -9; // same start for both kinds
      for (let i = 0; i < 5; i++) w.step(new Map()); // ACCEL_TICKS ramp (3) + slack
      const z0 = w.transform.get(id)!.pos.z;
      for (let i = 0; i < 20; i++) w.step(new Map());
      return Math.abs(w.transform.get(id)!.pos.z - z0);
    };
    const zombie = walk("normal");
    const king = walk("boss");
    expect(zombie).toBeGreaterThan(0); // both really moved
    expect(king).toBeGreaterThan(0);
    // 2.4 vs 3.0 — the king is the SLOWER one, and by the ratio the rules state.
    expect(king).toBeLessThan(zombie);
    expect(king / zombie).toBeCloseTo(RULES.boss!.moveSpeed / RULES.moveSpeed, 2);
  });

  it("MUTANT N13: killing the king credits the 連殺 combo like any other kill", () => {
    cover("mob-boss-summon");
    // #244's ruling — 殭屍與英雄都算，累加在同一個數字上 — has to survive the
    // early `continue` the boss branch takes. Deleting the fireHooks +
    // creditKillCombo pair from that branch left the suite green.
    const w = newWorld();
    beginCombatMobs(w, RULES, [0]);
    const hero = champAt(w, 0, 0, 0, 0);
    for (let i = 0; i < 3; i++) killOneZombie(w, hero); // 3 zombies → combo 3
    expect(w.killCombo.get(hero)?.count).toBe(3);
    const [king] = bosses(w);
    w.damageQueue.push({ source: hero, target: king!, amount: 100000, type: "true", crit: false, origin: "ability" });
    w.step(new Map());
    // the king is the FOURTH link in the same chain, not a gap in it
    expect(w.killCombo.get(hero)?.count).toBe(4);
  });
});
