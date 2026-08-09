/**
 * GH#304 —— `applyStatus` 的**狀態那一半**（身上沒有同名標記時）三個新分支。
 *
 * ⚠️ 2026-08-09 實測：三個分支**各自整段刪掉，`packages/shared` 3,357 條全綠**。
 * 三個的失敗形態都是「畫面上跟正常長得一樣」（CLAUDE.md 失敗形態②），所以一條
 * 薄守衛把三個一起關掉。突變紀錄：①③②逐一改壞 → 對應的 `it` 各自紅。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "./effectRunner";
import { hasStatus, statusStacks } from "./effectCommon";
import type { EffectDef } from "./effect";
import { asSeatId, asTeamId, type EntityId, type StatusId } from "../../ids";

const S = "test-counter" as StatusId;
beforeAll(() => registerSkeletonContent());

function rig(): { w: SimWorld; id: EntityId } {
  const w = new SimWorld(SKELETON_ARENA, 3);
  const c = SKELETON_ARENA.zones[0]!.center;
  return { w, id: spawnChampion(w, { championId: SELA.id, seatId: asSeatId(0), teamId: asTeamId(0), pos: { ...c }, zone: 0 }) };
}
function fire(w: SimWorld, id: EntityId, stacks: number, refresh?: "keep"): void {
  runEffects(
    [{ kind: "applyStatus", statusId: S, duration: 4, applyTo: "self", stacks, ...(refresh ? { refresh } : {}) } as unknown as EffectDef],
    { world: w, caster: id, rank: 1, targets: [id], origin: "test", rng: w.rng },
  );
}

describe("GH#304 applyStatus 層數的三個邊界", () => {
  it("① 身上沒有這個狀態時，減層什麼都不做 —— 不會長出一筆讓 hasStatus 說謊", () => {
    const { w, id } = rig();
    fire(w, id, -1);
    expect(hasStatus(w, id, S), "掛了一筆 0/負層的狀態 → 條件葉從此說謊").toBe(false);
  });

  it("② 扣到 0 層那一筆就消失，不是留一個 ×0", () => {
    const { w, id } = rig();
    fire(w, id, 2);
    fire(w, id, -2);
    expect(statusStacks(w, id, S)).toBe(0);
    expect(hasStatus(w, id, S), "0 層等於沒有 —— 留著會讓 HUD 與條件葉一起錯").toBe(false);
  });

  it("③ 減層不續期（不然掛在 onInterval 上的計數器會變成永久）", () => {
    const { w, id } = rig();
    fire(w, id, 3);
    const due = w.status.get(id)!.effects.find((e) => e.statusId === S)!.expiresAtTick;
    for (let i = 0; i < 10; i++) w.tick++;
    fire(w, id, -1);
    expect(w.status.get(id)!.effects.find((e) => e.statusId === S)!.expiresAtTick).toBe(due);
  });
});
