/**
 * [反向嘲諷]（戰鬥力探測器 `content/items/scouter.json`）—— 「指定我方去嘲諷
 * 指定目標」。
 *
 * ⭐ 三條斷言必須**一起**讀，少任何一條都會對一個壞掉的實作放行：
 *   ① `forcedTargetOf(B) === E`      —— 隊友真的被指去打**第三者**（不是施法者）
 *   ② `forcedTargetOf(M, "mob") === E` —— 中立那一格（`includeNeutrals`）也接上了
 *   ③ `forcedTargetOf(E) === null`    —— ⭐ **方向真的反了**，不是「圓變寬了」
 *
 * ③ 是失敗形態④的解藥：一個「兩邊都拉」的實作在 ①② 底下照樣全綠。
 *
 * 第二個 `it` 從磁碟讀**出貨的**鍊金術之盾（`godie-i06q`）跑同一支 handler ——
 * 這一批加的是「另一側」，⛔ 不是「改一側」，而那句話只有拿出貨文件跑才算數
 * （失敗形態⑤：被測的不是出貨的那個）。
 *
 * 幾何抄 `taunt.test.ts`：zone 0 的中心在 (-40, 0)，所有身體站在 z = center.z+12
 * 這條淨空的線上（世界原點在區域外，會被邊界夾回來，那會毀掉每一段距離）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import { Stat, zeroStats } from "./stats/statTypes";
import { zeroAttrBonus } from "./stats/attributes";
import { MONSTER_TEAM } from "./mobs";
import { forcedTargetOf } from "./targeting";
import { tauntedBy } from "./taunt";
import { runEffects } from "./effects/effectRunner";
import type { EffectDef } from "./effects/effect";
import * as V from "./math/vec2";

const TAG = "taunt-forced-targeting";
const Z0 = SKELETON_ARENA.zones[0]!;
const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

function at(dx: number): V.Vec2 {
  return { x: Z0.center.x + dx, z: Z0.center.z + 12 };
}

function body(world: SimWorld, seat: number, team: number, pos: V.Vec2): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { ...pos },
    vel: V.v2(),
    facing: { x: 1, z: 0 },
    radius: 0.6,
    zone: 0,
  });
  world.health.set(id, { hp: 5000, maxHp: 5000, mana: 0, maxMana: 0, alive: true, shields: [] });
  world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
  world.nav.set(id, {
    order: null,
    moveTarget: null,
    override: null,
    attackTarget: null,
    attackTargetAuto: false,
  });
  return id;
}

/** 一個英雄（有 ChampionComp，所以 `targetClassOf` 認得它）。 */
function champ(world: SimWorld, seat: number, team: number, pos: V.Vec2): EntityId {
  const id = body(world, seat, team, pos);
  world.status.set(id, { effects: [] });
  const final = zeroStats();
  final[Stat.MoveSpeed] = 1e-9;
  final[Stat.AttackRange] = 1.6;
  world.stats.set(id, { championId: "probe" as ChampionId, final, dirty: false, sources: [] });
  world.champion.set(id, {
    championId: "probe" as ChampionId,
    level: 1,
    xp: 0,
    gold: 0,
    items: [],
    augments: [],
    statStacks: 0,
    attrBonus: zeroAttrBonus(),
    statCapstonePct: 0,
    pendingOrbSlots: 0,
    undoStack: [],
  });
  return id;
}

/** 一隻 #215 殭屍：MONSTER 陣營、有 MobComp、⛔ 沒有 ChampionComp。 */
function mob(world: SimWorld, pos: V.Vec2): EntityId {
  const id = body(world, -1, MONSTER_TEAM, pos);
  world.mob.set(id, {
    zone: 0,
    team: MONSTER_TEAM,
    target: -1 as EntityId,
    attackCdTicks: 0,
    spawnTick: 0,
    kind: "normal",
  });
  return id;
}

/** A=持有者(隊1) · B=隊友(隊1) · M=殭屍 · E=敵人(隊2)，全部在同一個圓裡。 */
function deck(): { world: SimWorld; A: EntityId; B: EntityId; M: EntityId; E: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 11);
  world.combatActive = true;
  const A = champ(world, 0, 1, at(0));
  const B = champ(world, 1, 1, at(2));
  const M = mob(world, at(3));
  const E = champ(world, 2, 2, at(6));
  world.rebuildGrid();
  return { world, A, B, M, E };
}

describe("[反向嘲諷] 指定我方去嘲諷指定目標", () => {
  it("隊友與中立殭屍被指去打**第三者**，而那個第三者自己沒有被拉", () => {
    cover(TAG);
    const { world, A, B, M, E } = deck();

    runEffects(
      [
        {
          kind: "taunt",
          durationSec: 3,
          radius: 20,
          side: "allies",
          forcedTarget: "target",
          includeNeutrals: true,
        },
      ],
      { world, caster: A, rank: 1, targets: [E], origin: "item:test", rng: world.rng },
    );

    expect(forcedTargetOf(world, B)).toBe(E);
    expect(forcedTargetOf(world, M, "mob")).toBe(E);
    // ⭐ 方向真的反了：圓裡的敵人一筆紀錄都沒有。少了這一條，一個「兩邊都拉」
    // 的實作也會綠（失敗形態④）。
    expect(forcedTargetOf(world, E)).toBeNull();
    expect(tauntedBy(world, E)).toBeNull();
  });

  it("出貨的鍊金術之盾走同一支 handler，行為逐字不變（拉敵人來打自己）", () => {
    cover(TAG);
    const { world, A, B, M, E } = deck();
    const doc = JSON.parse(readFileSync(join(CONTENT_DIR, "items/godie-i06q.json"), "utf-8")) as {
      passive: { effects: EffectDef[] }[];
    };
    const shipped = doc.passive[0]!.effects;

    runEffects(shipped, {
      world,
      caster: A,
      rank: 1,
      targets: [],
      origin: "item:godie-i06q",
      rng: world.rng,
    });

    // 那張卡寫的是「吸引周圍**敵人**優先攻擊**自己**」——兩根軸都缺席。
    expect(tauntedBy(world, E)).toBe(A);
    expect(tauntedBy(world, M)).toBe(A);
    expect(tauntedBy(world, B)).toBeNull();
  });
});
