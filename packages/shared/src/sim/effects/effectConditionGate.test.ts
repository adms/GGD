/**
 * ⭐ 效果上的 `condition` 真的生效（GH#300 求值端）。三個方向一起讀：① 成立真的執行
 * ② 不成立真的沒執行 ③ 沒有 condition 一格不變；只驗①的話「永遠通過」也全綠（④）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import type { EffectCondition } from "../content/condition";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type StatusId } from "../../ids";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;
const [FEAR, BRAND] = ["fear", "brand"] as [StatusId, StatusId];
const IF_FEARED: EffectCondition = { kind: "status", subject: "target", statusId: FEAR };
const selfIs = (is: "champion" | "mob"): EffectCondition => ({ kind: "kind", subject: "self", is });

/**
 * 施法者 + 一個帶〔恐懼〕的敵人 + 一個沒帶的。⛔ 不跑 `step()`（普攻與回血會污染量
 * 測）。`fire` 蓋一個印記、走**出貨的** `runEffects` 派發 —— 印記在不在 = 發生沒發生。
 */
function rig() {
  const world = new SimWorld(SKELETON_ARENA, 11);
  const at = (seat: number, dx: number): EntityId => spawnChampion(world, { zone: 0,
    championId: SELA.id as ChampionId, seatId: asSeatId(seat), teamId: asTeamId(seat === 0 ? 0 : 1),
    pos: { x: C.x + dx, z: C.z } });
  const [hero, feared, calm] = [at(0, 0), at(1, 2), at(2, 4)] as [EntityId, EntityId, EntityId];
  world.status.get(feared)!.effects.push({ statusId: FEAR, sourceId: "seed", expiresAtTick: 300 });
  const has = (id: EntityId): boolean => (world.status.get(id)?.effects ?? []).some((e) => e.statusId === BRAND);
  const fire = (targets: EntityId[], condition?: EffectCondition, applyTo?: "self"): void => {
    const probe: EffectDef = { kind: "applyStatus", statusId: BRAND, duration: 5,
      ...(applyTo !== undefined ? { applyTo } : {}), ...(condition !== undefined ? { condition } : {}) };
    const ctx: EffectContext = { world, caster: hero, rank: 1, targets, origin: "probe", rng: world.rng };
    runEffects([probe], ctx);
  };
  return { world, hero, feared, calm, has, fire };
}

describe("effect 上的 condition", () => {
  it("逐一過濾：同一發 AoE 只在通過條件的那個身體上發生", () => {
    const r = rig();
    r.fire([r.feared, r.calm], IF_FEARED);
    expect(r.has(r.feared)).toBe(true); // ① 成立 → 真的執行
    expect(r.has(r.calm)).toBe(false); // ② 不成立 → 真的沒執行
  });

  it("一個目標都沒通過 → handler 完全不被呼叫（不是傳一個空的 targets 進去）", () => {
    // `applyTo:"self"` 不讀 targets，「傳空陣列」的實作會照樣蓋在施法者身上 ——
    const r = rig(); // 這一格就是 owner 要的「沒通過條件」vs「執行了但沒打到人」。
    r.fire([r.calm], IF_FEARED, "self");
    expect(r.has(r.hero)).toBe(false);
    r.fire([r.feared], IF_FEARED, "self"); // 對照組：成立時它是會發生的
    expect(r.has(r.hero)).toBe(true);
  });

  it("沒有目標的效果退化成整段閘，不是永遠不執行", () => {
    const r = rig();
    r.fire([], selfIs("mob"), "self");
    expect(r.has(r.hero)).toBe(false);
    r.fire([], selfIs("champion"), "self");
    expect(r.has(r.hero)).toBe(true);
  });

  /**
   * ⭐ 決策④的**危險那一半**（2026-08-09 對抗複驗補上）。
   *
   * 「沒有目標時退化成整段閘」有兩種寫法，而上面那一條對兩種都是綠的：求值時
   * `target` **缺席**（讀 FALSE，出貨的那一種），或**退回施法者**。差別只在
   * `subject:"target"` 上，所以只用 `subject:"self"` 斷言等於沒有斷言。
   *
   * 突變（真的跑過）：`effectRunner.ts` 的 ④ 改成
   * `{ self: caster, target: caster }` → 這一條紅；而在它出現之前，
   * `src/sim/{content,effects,systems}` 全部 495 條**一條都不紅**。
   *
   * 為什麼這一格值錢：`damageArea` / `damageLine` / `randomArea` 自己重解身體，
   * 永遠走這條路。讀 FALSE = 那張卡一次都不發（作者看得到「沒反應」）；
   * 退回施法者 = 它照施法者的狀態決定要不要**打全場**，而那是安靜地打錯人。
   */
  it("目標缺席時 `subject:\"target\"` 讀 FALSE —— 不是退回施法者", () => {
    const r = rig();
    r.world.status.get(r.hero)!.effects.push({
      statusId: FEAR, sourceId: "seed", expiresAtTick: 300,
    }); // 施法者自己帶著恐懼：退回施法者的實作會在這裡通過
    r.fire([], IF_FEARED, "self");
    expect(r.has(r.hero)).toBe(false);
  });

  it("沒有 condition 的效果一格不變，連 rng 的位置都不動", () => {
    const r = rig();
    const before = r.world.rng.state;
    r.fire([r.feared, r.calm]);
    expect(r.has(r.feared)).toBe(true);
    expect(r.has(r.calm)).toBe(true);
    expect(r.world.rng.state).toBe(before);
  });
});
