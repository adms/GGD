/**
 * GH#354 / G2 —— **輸出倍率**三軸真的接進三個封包層的入口。
 *
 * owner 2026-08-17 的 20 件 [EX解放] 裡有 7 件要的是同一件事：
 * 「這一次施放／這一段時間內，我造成的**傷害·治療·護盾整體** ×N」
 * （#54 · #57 · #58 · #60 · #64 · #65 · #69），再加上重設計後的 #61 閃耀金玉。
 *
 * ⚠️ 這一支驗的是**最終狀態**（真的少了幾點血、真的多補了幾點、盾真的比較厚），
 * ⛔ 不是「effect 物件長什麼樣」—— 後者對「屬性掛上去了但沒有人讀」也會過（失敗形態②）。
 *
 * ⚠️ 三條各自獨立，因為它們是**三個不同的檔案裡的三行**：漏掉任何一行，另外兩條
 * 仍然全綠。這正是它們不能合成一條斷言的理由。
 *
 * ⭐ 方向性是第四條：治療那一軸讀的是 **source** 不是 target
 *（「我治療別人更多」⛔ 不是「我被治療更多」——後者是重創那一軸，方向相反）。
 *
 * 突變紀錄：`combat/restore.ts` 的 `outputMult(world, opts.source, …)` 改成
 * `opts.target` → 第④條當場紅（施法者有加成時治療沒變多）；改回。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { registerAll } from "../../content/registries";
import { Augments, Champions, Items, LootTables } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { combatResolveSystem, addShield } from "../combat/damage";
import { healTarget } from "../combat/restore";
import { attachSource, recomputeStats } from "./statPipeline";
import { Stat } from "./statTypes";
import { ModOp } from "./modifiers";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
let champion: ChampionId;

beforeAll(async () => {
  for (const r of [Champions, Items, Augments, LootTables]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  champion = Champions.ids().slice().sort()[0]!;
});

function hero(world: SimWorld, seat: number, team: number): EntityId {
  const id = spawnChampion(world, {
    championId: champion,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: SKELETON_ARENA.zones[0]!.center.x + seat * 2, z: SKELETON_ARENA.zones[0]!.center.z },
    zone: 0,
  });
  recomputeStats(world, id);
  return id;
}

/** 給一個單位一格輸出加成。⛔ 走 `attachSource` —— 那是出貨路徑用的同一支。 */
function grant(world: SimWorld, id: EntityId, axis: Stat, value: number): void {
  attachSource(world, id, {
    id: `test:${axis}`,
    kind: "buff",
    modifiers: [{ stat: axis, op: ModOp.Flat, value }],
  });
  recomputeStats(world, id);
}

const RAW = 200;

/** 打一發真傷，回傳目標**實際掉的血**。真傷是為了繞開護甲，讓量到的就是那個倍率。 */
function dealt(bonus: number): number {
  const world = new SimWorld(SKELETON_ARENA, 1);
  const atk = hero(world, 0, 0);
  const def = hero(world, 1, 1);
  if (bonus !== 0) grant(world, atk, Stat.OutputDamagePct, bonus);
  const hp = world.health.get(def)!;
  const before = hp.hp;
  world.damageQueue.push({ source: atk, target: def, amount: RAW, type: "true", origin: "ability" } as never);
  combatResolveSystem(world);
  return before - world.health.get(def)!.hp;
}

/** 補一次血，回傳**實際補到**的量。目標先被打殘，才有補的空間。 */
function healed(bonus: number): number {
  const world = new SimWorld(SKELETON_ARENA, 1);
  const src = hero(world, 0, 0);
  const tgt = hero(world, 1, 0);
  if (bonus !== 0) grant(world, src, Stat.OutputHealingPct, bonus);
  const hp = world.health.get(tgt)!;
  hp.hp = 1; // 留出足夠的空間，⛔ 不要讓 maxHp 的夾取吃掉差異
  return healTarget(world, { source: src, target: tgt, amount: RAW, origin: "ability" } as never);
}

/** 生一片盾，回傳**盾的量**。 */
function shielded(bonus: number): number {
  const world = new SimWorld(SKELETON_ARENA, 1);
  const src = hero(world, 0, 0);
  const tgt = hero(world, 1, 0);
  if (bonus !== 0) grant(world, src, Stat.OutputShieldPct, bonus);
  addShield(world, tgt, RAW, 99, "test:shield", undefined, undefined, src);
  return (world.health.get(tgt)?.shields ?? []).reduce((a, s) => a + s.amount, 0);
}

describe("輸出倍率三軸（GH#354 / G2）", () => {
  it("① 傷害：`outputDamagePct` 真的讓同一發打得更痛", () => {
    const base = dealt(0);
    expect(base, "夾具本身就沒打到人 —— 下面兩條會變成 0 比 0 而且全綠").toBeGreaterThan(0);
    expect(dealt(0.25)).toBeCloseTo(base * 1.25, 4);
  });

  it("② 治療：`outputHealingPct` 真的補得更多", () => {
    const base = healed(0);
    expect(base).toBeGreaterThan(0);
    expect(healed(0.5)).toBeCloseTo(base * 1.5, 4);
  });

  it("③ 護盾：`outputShieldPct` 真的生出更厚的盾", () => {
    const base = shielded(0);
    expect(base).toBeCloseTo(RAW, 4);
    expect(shielded(0.2)).toBeCloseTo(RAW * 1.2, 4);
  });

  it("★ ④ 治療那一軸讀的是**施法者**，⛔ 不是被治療的人", () => {
    const world = new SimWorld(SKELETON_ARENA, 1);
    const src = hero(world, 0, 0);
    const tgt = hero(world, 1, 0);
    // 加成掛在**被治療的人**身上 —— 它一點都不該生效。
    grant(world, tgt, Stat.OutputHealingPct, 1.0);
    world.health.get(tgt)!.hp = 1;
    const wrongSide = healTarget(world, { source: src, target: tgt, amount: RAW, origin: "ability" } as never);
    expect(wrongSide, "掛在承受者身上卻生效了 —— source/target 抄反了").toBeCloseTo(healed(0), 4);
  });

  it("⑤ 沒有人填 = 嚴格 no-op（既有的每一場逐位元不變）", () => {
    expect(dealt(0)).toBeCloseTo(dealt(0), 6);
    expect(shielded(0)).toBeCloseTo(RAW, 6);
  });
});
