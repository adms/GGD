/**
 * 【節拍疊層掛攻擊者】GH#747 軸 (b)（owner 2026-07-26 第 5 條裁決的下半）。
 *
 * ⭐ 這一條要回答的是一個**現況**問題，⛔ 不是一個新機制：
 *    #143 記的形狀是 `effectRunner.ts:233` 的 `const sc = world.stats.get(target)`
 *    ——「疊層永遠掛在受擊者身上」。2026-08 的效果系統重構之後那一段搬進
 *    `effects/applyBuff.ts`，而且長出了 **S9b**（`applyTo`）：
 *      `const subjects = e.applyTo === "self" ? [ctx.caster] : ctx.targets;`
 *    ⇒ 疊層要掛誰現在是**內容的一格參數**，⛔ 不是引擎寫死的語意 ——
 *      那正是第〇·五守則要的形狀（引擎做機制、JSON 做技能）。
 *
 * 所以這一支釘的是那件事**真的成立**：
 *   ① `applyTo:"self"` + `stackKey` ⇒ 層數長在**攻擊者**身上
 *   ② ⭐ **換目標不歸零** —— 打 A 再打 B，攻擊者身上仍然是第 2 層
 *   ③ 對照組：不填 `applyTo` ⇒ 逐位元回到受擊者語意（240 份既有文件不變）
 *
 * ⛔ 不斷言任何出貨數字（層數上限、倍率都是設定值，第二守則）。
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
const KEY = "beat";
let champion: ChampionId;

beforeAll(async () => {
  for (const r of [Champions, Items, Augments, LootTables]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  champion = Champions.ids().slice().sort()[0]!;
});

function champAt(world: SimWorld, seat: number, team: number, dx: number): EntityId {
  const c = SKELETON_ARENA.zones[0]!.center;
  return spawnChampion(world, {
    championId: champion,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: c.x + dx, z: c.z },
    zone: 0,
  });
}

/** 一發「打中就疊一層」的節拍增益。`applyTo` 就是軸 (b) 的那一格。 */
function beat(applyTo?: "self"): EffectDef {
  return {
    kind: "applyBuff",
    duration: 999,
    stackKey: KEY,
    ...(applyTo !== undefined ? { applyTo } : {}),
    modifiers: [{ stat: Stat.AttackDamage, op: ModOp.Flat, value: 1 }],
  } as EffectDef;
}

/** 這個身體身上這個 stackKey 的層數（0 = 一份都沒有）。 */
function stacksOn(world: SimWorld, id: EntityId): number {
  const src = world.stats.get(id)?.sources.find((s) => s.id === `buff:stack:${KEY}`);
  return src === undefined ? 0 : (src.stacks ?? 1);
}

function strike(world: SimWorld, caster: EntityId, victim: EntityId, e: EffectDef, tick: number): void {
  world.tick = tick;
  applyEffect(e, { world, caster, rank: 1, targets: [victim], origin: "test:beat", rng: new Rng(1) });
}

describe("節拍疊層掛攻擊者 (GH#747 軸 b)", () => {
  it("★ 換目標不歸零：打 A 再打 B，層數長在**攻擊者**身上", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    const me = champAt(w, 0, 0, 0);
    const a = champAt(w, 1, 1, 2);
    const b = champAt(w, 2, 1, 4);

    strike(w, me, a, beat("self"), 1);
    strike(w, me, b, beat("self"), 2); // ⭐ 換了目標

    // ⬇ 把 applyBuff.ts 的 `e.applyTo === "self" ? [ctx.caster] : ctx.targets`
    //    改回無條件 `ctx.targets`，這一條就紅。
    expect(stacksOn(w, me)).toBe(2);
    // 而兩個受擊者身上**一層都沒有** —— 這才是「節拍是我的，不是你的」。
    expect(stacksOn(w, a)).toBe(0);
    expect(stacksOn(w, b)).toBe(0);
  });

  it("對照組：不填 applyTo ⇒ 逐位元回到受擊者語意（既有文件不變）", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    const me = champAt(w, 0, 0, 0);
    const a = champAt(w, 1, 1, 2);
    const b = champAt(w, 2, 1, 4);

    strike(w, me, a, beat(), 1);
    strike(w, me, b, beat(), 2);

    expect(stacksOn(w, me)).toBe(0);
    expect(stacksOn(w, a)).toBe(1);
    expect(stacksOn(w, b)).toBe(1); // ⛔ 換目標＝從頭數起,那正是 owner 要改掉的行為
  });
});
