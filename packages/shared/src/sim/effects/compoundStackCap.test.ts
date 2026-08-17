/**
 * GH#354 / G1 —— **複利疊層也要吃得到 `maxStacks`**。
 *
 * owner 2026-08-17 的 20 件 [EX解放] 裡有 8 件是同一個形狀：「每層 ×k，最多 N 層」
 * （#51 金剛 6 層 ×1.04 · #53 指貫 10 次 ×1.03 · #54 火把 20 層 ×1.02 · #55 噬魂 5 魂
 * ×1.08 · #56 肉切 5 層 ×1.15 · #59 雷槍 5 層 ×1.10 · #63 重力劍 5 層 ×1.18 ·
 * #66 魔導鎧 5 層 ×1.06）。
 *
 * ⚠️ 這一批之前**寫不出來**，而且失敗方式是最糟的那一種：schema 收得下 `maxStacks`、
 * 後台存得起來、卡片上印著「最多 6 層」，而遊戲裡疊到無限（失敗形態②）——
 * 因為那個夾取只寫在 `if (e.stackKey !== undefined)` 區塊裡，而複利路徑不填 stackKey。
 *
 * 這一支驗**三條**性質，⛔ 不驗任何出貨數字：
 *   ① 複利路徑真的是複利（N 份來源相乘，⛔ 不是線性相加）
 *   ② 到了 `maxStacks` 就停（第 N+1 次施加不再增加）
 *   ③ 沒填 `maxStacks` 仍然無限（`endless-edge` 的「可無限疊加」一個字都沒被改到）
 *
 * 突變紀錄：`applyBuff.ts` 的 `if (held >= e.maxStacks) continue;` 刪掉
 * → ②「到上限就停」當場紅；改回。
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
import { Stat } from "../stats/statTypes";
import { ModOp } from "../stats/modifiers";
import { Rng } from "../math/rng";
import { applyEffect } from "./effectRunner";
import type { EffectDef } from "./effect";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
let champion: ChampionId;

beforeAll(async () => {
  for (const r of [Champions, Items, Augments, LootTables]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  champion = Champions.ids().slice().sort()[0]!;
});

function hero(world: SimWorld): EntityId {
  return spawnChampion(world, {
    championId: champion,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: SKELETON_ARENA.zones[0]!.center.x, z: SKELETON_ARENA.zones[0]!.center.z },
    zone: 0,
  });
}

/** ⛔ 刻意**不填** stackKey —— 那是複利路徑的唯一開關（見 ModOp.PercentMult 檔頭）。 */
function buff(maxStacks?: number): EffectDef {
  return {
    kind: "applyBuff",
    duration: 999,
    ...(maxStacks !== undefined ? { maxStacks } : {}),
    modifiers: [{ stat: Stat.AttackDamage, op: ModOp.PercentMult, value: 0.5 }],
  } as EffectDef;
}

/** 用 `origin` 施加 n 次，回傳這個 origin 掛了幾份來源。複利路徑一次 = 一份。 */
function applyN(
  world: SimWorld,
  id: EntityId,
  origin: string,
  maxStacks: number | undefined,
  n: number,
  tick0 = 1,
): number {
  for (let i = 0; i < n; i++) {
    // 每次換一個 tick：同一 tick 的來源 id 會撞在一起（既有行為，⛔ 不是這條要驗的）。
    world.tick = tick0 + i;
    applyEffect(buff(maxStacks), {
      world,
      caster: id,
      rank: 1,
      targets: [id],
      origin,
      rng: new Rng(1),
    });
  }
  const prefix = `buff:${origin}#`;
  return (world.stats.get(id)?.sources ?? []).filter((s) => s.id.startsWith(prefix)).length;
}

describe("複利疊層的層數上限（GH#354 / G1）", () => {
  it("① 不填 stackKey = 每次施加各自一份來源（那就是複利的形狀）", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    expect(applyN(w, hero(w), "test:a", undefined, 3)).toBe(3);
  });

  it("★ ② 到了 maxStacks 就停 —— 第 N+1 次不再增加", () => {
    const cap = 4;
    const w1 = new SimWorld(SKELETON_ARENA, 1);
    expect(applyN(w1, hero(w1), "test:b", cap, cap)).toBe(cap);
    const w2 = new SimWorld(SKELETON_ARENA, 1);
    // 多打三次，⛔ 一份都不可以多。
    expect(applyN(w2, hero(w2), "test:b", cap, cap + 3)).toBe(cap);
  });

  it("③ 沒填 maxStacks 仍然無限 —— `endless-edge` 的「可無限疊加」沒有被改到", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    expect(applyN(w, hero(w), "test:c", undefined, 12)).toBe(12);
  });

  it("⛔ 別人的來源不吃掉這一張的額度（用 id 前綴數，⛔ 不是數 sources.length）", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    const id = hero(w);
    applyN(w, id, "test:someone-else", undefined, 3, 1);
    // maxStacks 2 的那一張應該還有滿滿兩格。
    expect(applyN(w, id, "test:mine", 2, 5, 100), "被別人的來源吃掉額度了").toBe(2);
  });
});
