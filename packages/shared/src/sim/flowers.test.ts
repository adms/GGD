/**
 * Healing flowers — sim primitives (flw-02..flw-05): deterministic spawn
 * positions, spawn/respawn cadence, burst restore rules, targeting filters
 * and static separation. Server-side match wiring is covered in
 * apps/game-server/src/match/flowers.test.ts.
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
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "../ids";
import {
  FLOWER_CLEARANCE,
  FLOWER_RADIUS,
  beginCombatFlowers,
  endCombatFlowers,
  flowerRulesFromConfig,
  spawnFlower,
  type FlowerRules,
} from "./flowers";
import { Abilities } from "./content/registry";
import { castAbility } from "./abilities/abilitySystem";
import { dist } from "./math/vec2";
import type { AbilityDef } from "./content/defs";

beforeAll(() => registerSkeletonContent());

const RULES: FlowerRules = flowerRulesFromConfig(
  {
    firstSpawnSec: 15,
    respawnSec: 25,
    maxAlivePerZone: 1,
    hp: 60,
    healPctMax: 0.18,
    manaPctMax: 0.18,
    burstRadius: 6,
  },
  1 / 30,
);

/** Small tick counts for fast tests. */
const FAST_RULES: FlowerRules = { ...RULES, firstSpawnTicks: 3, respawnTicks: 5 };

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

describe("deterministic flower spawns (flw-02)", () => {
  const run = (seed: number): { positions: [number, number][]; digest: number } => {
    const w = new SimWorld(SKELETON_ARENA, seed);
    beginCombatFlowers(w, FAST_RULES, [0, 1]);
    const positions: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      step(w);
      for (const ev of w.events) {
        if (ev.type === "flowerSpawn") positions.push([ev.data.x as number, ev.data.z as number]);
      }
    }
    return { positions, digest: w.digest() };
  };

  it("two same-seed runs produce identical spawn positions + digests", () => {
    cover("flower-spawn-deterministic");
    const a = run(1234);
    const b = run(1234);
    expect(a.positions.length).toBe(2); // one per zone
    expect(a.positions).toEqual(b.positions);
    expect(a.digest).toBe(b.digest);
    // a different seed lands elsewhere
    const c = run(99);
    expect(JSON.stringify(c.positions)).not.toEqual(JSON.stringify(a.positions));
  });

  it("positions are inside the boundary with clearance from obstacles + spawns", () => {
    cover("flower-spawn-deterministic");
    for (const seed of [1, 7, 42, 1000]) {
      const w = new SimWorld(SKELETON_ARENA, seed);
      beginCombatFlowers(w, FAST_RULES, [0, 1]);
      step(w, 5);
      expect(w.flower.size).toBe(2);
      for (const [id, f] of w.flower) {
        const t = w.transform.get(id)!;
        const zone = SKELETON_ARENA.zones[f.zone]!;
        expect(dist(t.pos, zone.center)).toBeLessThanOrEqual(zone.boundaryRadius - FLOWER_RADIUS);
        for (const ob of zone.obstacles) {
          if (ob.kind === "circle") {
            expect(dist(t.pos, ob.center)).toBeGreaterThanOrEqual(ob.radius + FLOWER_CLEARANCE - 1e-9);
          }
        }
        for (const side of zone.spawns) {
          for (const s of side) {
            expect(dist(t.pos, s)).toBeGreaterThanOrEqual(FLOWER_CLEARANCE - 1e-9);
          }
        }
      }
    }
  });
});

describe("spawn cadence (flw-03)", () => {
  it("first spawn at firstSpawnTicks; maxAlivePerZone held; respawn measured from death", () => {
    cover("flower-cadence");
    const w = new SimWorld(SKELETON_ARENA, 5);
    beginCombatFlowers(w, FAST_RULES, [0]);

    step(w, FAST_RULES.firstSpawnTicks - 1);
    expect(w.flower.size).toBe(0); // not yet
    step(w);
    expect(w.flower.size).toBe(1); // exactly at firstSpawnTicks

    // maxAlivePerZone = 1: no second flower while one lives
    step(w, 20);
    expect(w.flower.size).toBe(1);

    // kill it: respawn comes respawnTicks AFTER the death tick
    const killer = champAt(w, 0, 0, SKELETON_ARENA.zones[0]!.center.x - 10, 0);
    const flowerId = [...w.flower.keys()][0]!;
    w.damageQueue.push({ source: killer, target: flowerId, amount: 999, type: "true", crit: false, origin: "basic" });
    step(w); // death + burst + destroy this tick
    expect(w.flower.size).toBe(0);
    step(w, FAST_RULES.respawnTicks - 1);
    expect(w.flower.size).toBe(0);
    step(w);
    expect(w.flower.size).toBe(1);

    // combat end: all flowers despawn, cadence disarmed
    endCombatFlowers(w);
    expect(w.flower.size).toBe(0);
    expect(w.combatTicks).toBe(-1);
    step(w, 30);
    expect(w.flower.size).toBe(0);
  });
});

describe("burst restore (flw-04)", () => {
  it("killer + radius allies restored by pct of OWN maxima; enemy/dead/far allies not; no kill xp/gold", () => {
    cover("flower-burst");
    const w = new SimWorld(SKELETON_ARENA, 11);
    w.flowerRules = RULES;
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
    const cx = SKELETON_ARENA.zones[0]!.center.x;
    const fx = cx + 12; // flower position, clear of the center pillar

    const killer = champAt(w, 0, 0, fx - 8, 0); // OUTSIDE burstRadius (killer always collects)
    const allyNear = champAt(w, 1, 0, fx + 3, 0, "sela"); // within 6u
    const allyFar = champAt(w, 2, 0, fx, 9); // outside 6u
    const allyDead = champAt(w, 3, 0, fx + 2, 2); // within 6u but dead
    const enemyNear = champAt(w, 4, 1, fx - 2, -2); // within 6u, wrong team

    const dead = w.health.get(allyDead)!;
    dead.alive = false;
    dead.hp = 0;

    // dent everyone's pools so the restore is visible
    const before = new Map<EntityId, { hp: number; mana: number; maxHp: number; maxMana: number }>();
    for (const id of [killer, allyNear, allyFar, enemyNear]) {
      const h = w.health.get(id)!;
      h.hp = h.maxHp * 0.4;
      h.mana = h.maxMana * 0.3;
      before.set(id, { hp: h.hp, mana: h.mana, maxHp: h.maxHp, maxMana: h.maxMana });
    }
    const champBefore = { ...w.champion.get(killer)! };

    const flowerId = spawnFlower(w, 0, { x: fx, z: 0 }, RULES.hp);
    w.damageQueue.push({ source: killer, target: flowerId, amount: 999, type: "true", crit: false, origin: "basic" });
    step(w);

    // flower destroyed same tick + burst event with the killer's team
    expect(w.flower.size).toBe(0);
    expect(w.transform.has(flowerId)).toBe(false);
    const burst = w.events.find((e) => e.type === "flowerBurst");
    expect(burst).toBeDefined();
    expect(burst!.data.teamId).toBe(0);

    const regenSlack = 0.2; // one tick of natural hp/mana regen
    for (const id of [killer, allyNear]) {
      const b = before.get(id)!;
      const h = w.health.get(id)!;
      expect(h.hp).toBeGreaterThanOrEqual(b.hp + b.maxHp * RULES.healPctMax - 1e-6);
      expect(h.hp).toBeLessThanOrEqual(b.hp + b.maxHp * RULES.healPctMax + regenSlack);
      expect(h.mana).toBeGreaterThanOrEqual(b.mana + b.maxMana * RULES.manaPctMax - 1e-6);
      expect(h.mana).toBeLessThanOrEqual(b.mana + b.maxMana * RULES.manaPctMax + regenSlack);
    }
    for (const id of [allyFar, enemyNear]) {
      const b = before.get(id)!;
      const h = w.health.get(id)!;
      expect(h.hp).toBeLessThanOrEqual(b.hp + regenSlack); // regen only — no burst
      expect(h.mana).toBeLessThanOrEqual(b.mana + regenSlack);
    }
    const deadAfter = w.health.get(allyDead)!;
    expect(deadAfter.alive).toBe(false);
    expect(deadAfter.hp).toBe(0);

    // flower kills award NO xp/gold (their reward is the burst)
    const champAfter = w.champion.get(killer)!;
    expect(champAfter.xp).toBe(champBefore.xp);
    expect(champAfter.gold).toBe(champBefore.gold);
  });
});

describe("targeting filters + static prop (flw-05)", () => {
  const ALLY_HEAL: AbilityDef = {
    id: "test.allyheal" as AbilityId,
    name: "Test Ally Heal",
    slot: "W",
    castType: "targeted",
    maxRank: 1,
    cooldown: [1],
    manaCost: [0],
    range: 20,
    targetsEnemies: false,
    effects: [{ kind: "heal", amount: { flat: 50 } }],
  };
  const ENEMY_NUKE: AbilityDef = {
    id: "test.nuke" as AbilityId,
    name: "Test Nuke",
    slot: "E",
    castType: "targeted",
    maxRank: 1,
    cooldown: [1],
    manaCost: [0],
    range: 20,
    targetsEnemies: true,
    // ⚠️ 傷害從**花的血量**推導，⛔ 不是一個字面值 25。這一條驗的是「敵方指定
    // 與地面 AoE 打得到花」，也就是**兩次都要削掉一塊而不是打死它** ——
    // 而技能傷害在 2026-08-21 之後還要再乘一層全域 AP 加成，一個寫死的 25
    // 會讓這條測試在某個 `rate` 上安靜地變成「一發就死」（失敗形態④）。
    effects: [{ kind: "damage", damageType: "magic", amount: { flat: RULES.hp / 8 } }],
  };
  const GROUND_AOE: AbilityDef = {
    id: "test.aoe" as AbilityId,
    name: "Test Ground AoE",
    slot: "R",
    castType: "ground",
    maxRank: 1,
    cooldown: [1],
    manaCost: [0],
    range: 20,
    radius: 3,
    // 同 ENEMY_NUKE：從花的血量推導，理由見那裡。
    effects: [{ kind: "damage", damageType: "magic", amount: { flat: RULES.hp / 8 } }],
  };

  beforeAll(() => {
    Abilities.register(ALLY_HEAL.id, ALLY_HEAL);
    Abilities.register(ENEMY_NUKE.id, ENEMY_NUKE);
    Abilities.register(GROUND_AOE.id, GROUND_AOE);
  });

  function armed(): { w: SimWorld; caster: EntityId; ally: EntityId; flowerId: EntityId } {
    const w = new SimWorld(SKELETON_ARENA, 3);
    w.flowerRules = RULES;
    const cx = SKELETON_ARENA.zones[0]!.center.x;
    const caster = champAt(w, 0, 0, cx + 8, 0);
    const ally = champAt(w, 1, 0, cx + 8, 3, "sela");
    const flowerId = spawnFlower(w, 0, { x: cx + 12, z: 0 }, RULES.hp);
    const ab = w.abilities.get(caster)!;
    ab.slots.W = { abilityId: ALLY_HEAL.id, rank: 1, cooldownRemainingTicks: 0 };
    ab.slots.E = { abilityId: ENEMY_NUKE.id, rank: 1, cooldownRemainingTicks: 0 };
    ab.slots.R = { abilityId: GROUND_AOE.id, rank: 1, cooldownRemainingTicks: 0 };
    w.rebuildGrid();
    return { w, caster, ally, flowerId };
  }

  it("ally-targeted casts reject flowers; the same cast on a real ally is ok", () => {
    cover("flower-target-filters");
    const { w, caster, ally, flowerId } = armed();
    expect(castAbility(w, caster, "W", { type: "entity", entityId: flowerId })).toBe("bad-target");
    expect(castAbility(w, caster, "W", { type: "entity", entityId: ally })).toBe("ok");
  });

  it("enemy-targeted casts and ground AoE damage flowers", () => {
    cover("flower-target-filters");
    const { w, caster, flowerId } = armed();
    expect(castAbility(w, caster, "E", { type: "entity", entityId: flowerId })).toBe("ok");
    step(w); // resolve the queued damage
    const afterNuke = w.health.get(flowerId)!.hp;
    expect(afterNuke).toBeLessThan(RULES.hp);

    const ft = w.transform.get(flowerId)!;
    expect(castAbility(w, caster, "R", { type: "point", point: { x: ft.pos.x, z: ft.pos.z } })).toBe("ok");
    step(w);
    expect(w.health.get(flowerId)!.hp).toBeLessThan(afterNuke);
  });

  it("basic attacks hit flowers (attackTarget order) — melee chase closes to reach", () => {
    cover("flower-target-filters");
    const { w, caster, flowerId } = armed();
    const nav = w.nav.get(caster)!;
    nav.attackTarget = flowerId; // thorne is MELEE: chase + windup + swing
    let burst = false;
    // ⚠️ 2026-08-13：預算 60 → 150。⛔ **斷言一個字沒動**（「花真的被普攻打爆」），
    // 動的是這個迴圈的**時間預算** —— 它以前剛好卡在實際值上，所以 owner 那天的
    // 再平衡（`strToAttackDamage` 1→0.4、`agiToAttackSpeed` 0.02→0.01）一落地，
    // 這一條就用**錯誤的訊息**紅了：它說「普攻打不到花」，真相是普攻變慢了。
    // ⭐ 量到的是 **68 tick**（改動前在 60 以內），150 給 2.2× 餘裕 ——
    // 留餘裕不留剛好，但**也不留無限**：TTK 真的再翻倍的那天這一條還是會紅。
    for (let i = 0; i < 150 && !burst; i++) {
      step(w);
      burst ||= w.events.some((e) => e.type === "flowerBurst" && (e.data.id as EntityId) === flowerId);
      const hp = w.health.get(flowerId);
      if (hp) expect(hp.hp).toBeLessThanOrEqual(RULES.hp);
    }
    // the auto landed, killed the flower and triggered the burst + despawn
    expect(burst).toBe(true);
    expect(w.flower.has(flowerId)).toBe(false);
    expect(w.transform.has(flowerId)).toBe(false);
  });

  it("unit separation never moves a flower (static prop)", () => {
    cover("flower-target-filters");
    const { w, caster, flowerId } = armed();
    const ft = w.transform.get(flowerId)!;
    const start = { x: ft.pos.x, z: ft.pos.z };
    // drop the champion right on top of the flower
    const ct = w.transform.get(caster)!;
    ct.pos = { x: start.x + 0.1, z: start.z };
    step(w, 10);
    expect(ft.pos.x).toBe(start.x);
    expect(ft.pos.z).toBe(start.z);
    // the champion was pushed out to at least touching distance
    expect(dist(w.transform.get(caster)!.pos, start)).toBeGreaterThanOrEqual(
      FLOWER_RADIUS + ct.radius - 1e-6,
    );
  });
});
