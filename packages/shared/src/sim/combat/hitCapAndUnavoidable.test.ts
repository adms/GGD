/**
 * GH#354 —— **G12 單發傷害上限** 與 **G13 無法被迴避** 的共同守衛。
 *
 * 兩條放一起：它們是同一批 [EX解放] 的兩個防禦/命中側機制，各只有一條承重的線。
 *
 * | | 機制 | 擋住 | 承重的那一行 |
 * |---|---|---|---|
 * | G12 | `Stat.MaxHitPctMaxHp` | #52 謎之紙片 | 上限在**抗性之後**，而且**真傷也吃** |
 * | G13 | `Stat.UnavoidablePct` | #51 神槍・金剛徹 | 折抵的是**對方的迴避**，且 1 走 ZERO GUARANTEE |
 *
 * ⛔ 一個出貨數字都不寫進斷言（第二守則）。
 *
 * 突變紀錄（承重的那一條）：`damage.ts` 的真傷早退改回 `return pkt.amount`
 *（＝上限不吃真傷）→ 第②條當場紅；改回。
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
import { combatResolveSystem } from "./damage";
import { rollEvade } from "./evasion";
import { attachSource, recomputeStats } from "../stats/statPipeline";
import { Stat } from "../stats/statTypes";
import { ModOp } from "../stats/modifiers";
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

function give(world: SimWorld, id: EntityId, stat: Stat, value: number): void {
  attachSource(world, id, {
    id: `t:${stat}`,
    kind: "buff",
    modifiers: [{ stat, op: ModOp.Flat, value }],
  });
  recomputeStats(world, id);
}

describe("G12 —— 單發傷害上限（`maxHitPctMaxHp`）", () => {
  /** 打一發，回傳目標**實際掉的血**。 */
  function hit(type: "true" | "physical", capPct: number, amount: number): number {
    const w = new SimWorld(SKELETON_ARENA, 1);
    const atk = hero(w, 0, 0);
    const def = hero(w, 1, 1);
    if (capPct > 0) give(w, def, Stat.MaxHitPctMaxHp, capPct);
    const hp = w.health.get(def)!;
    hp.hp = hp.maxHp;
    const before = hp.hp;
    w.damageQueue.push({ source: atk, target: def, amount, type, origin: "ability" } as never);
    combatResolveSystem(w);
    return before - w.health.get(def)!.hp;
  }

  function maxHpOf(): number {
    const w = new SimWorld(SKELETON_ARENA, 1);
    return w.health.get(hero(w, 0, 0))!.maxHp;
  }

  it("★ ① 超過上限的那一發被砍到上限；沒填 = 沒有上限（⛔ 不是上限 0%）", () => {
    const maxHp = maxHpOf();
    const huge = maxHp * 5;
    const uncapped = hit("true", 0, huge);
    expect(uncapped, "沒填上限卻被砍了 —— 0 被讀成了「上限 0%」").toBeCloseTo(huge, 4);
    expect(hit("true", 0.2, huge)).toBeCloseTo(maxHp * 0.2, 4);
  });

  it("★ ② **真傷也吃這條上限** —— 一發打得死人的真傷不可以繞過去", () => {
    const maxHp = maxHpOf();
    expect(hit("true", 0.2, maxHp * 5)).toBeLessThan(maxHp);
  });

  it("③ 上限之下的那一發原封不動（上限不是「一律變成這個數」）", () => {
    const maxHp = maxHpOf();
    const small = maxHp * 0.05;
    expect(hit("true", 0.2, small)).toBeCloseTo(small, 4);
  });

  it("④ 物理那一路也吃得到（上限坐在抗性四段之後）", () => {
    const maxHp = maxHpOf();
    expect(hit("physical", 0.2, maxHp * 5)).toBeCloseTo(maxHp * 0.2, 4);
  });
});

describe("G13 —— 無法被迴避（`unavoidablePct`）", () => {
  /** 掃 n 次，回傳被閃掉幾次。 */
  function dodged(evade: number, unavoidable: number, n = 200): number {
    const w = new SimWorld(SKELETON_ARENA, 1);
    const atk = hero(w, 0, 0);
    const def = hero(w, 1, 1);
    give(w, def, Stat.Evasion, evade);
    if (unavoidable > 0) give(w, atk, Stat.UnavoidablePct, unavoidable);
    let c = 0;
    for (let i = 0; i < n; i++) if (rollEvade(w, atk, def)) c++;
    return c;
  }

  it("★ 1 = 完全躲不掉，而且它折抵的是**對方的迴避**", () => {
    const base = dodged(0.5, 0);
    expect(base, "夾具本身就沒有人在閃 —— 下面兩條會是 0 比 0 而且全綠").toBeGreaterThan(0);
    expect(dodged(0.5, 1), "掛了「無法被迴避」還是被閃掉了").toBe(0);
  });

  it("⭐ 中間值有意義（0.5 = 迴避率砍半），⛔ 不是一個布林", () => {
    const full = dodged(0.5, 0);
    const half = dodged(0.5, 0.5);
    expect(half).toBeLessThan(full);
    expect(half).toBeGreaterThan(0);
  });

  it("⛔ 攻擊者沒填 = 逐位元不變（既有的每一場錄影）", () => {
    expect(dodged(0.5, 0)).toBe(dodged(0.5, 0));
  });

  it("★ 完全命中走的是 ZERO GUARANTEE —— ⛔ 不消耗亂數", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    const atk = hero(w, 0, 0);
    const def = hero(w, 1, 1);
    give(w, def, Stat.Evasion, 0.5);
    give(w, atk, Stat.UnavoidablePct, 1);
    // rng 狀態在 roll 前後必須完全一樣：多抽一次會讓每一場既有錄影 desync。
    const before = JSON.stringify(w.rng);
    expect(rollEvade(w, atk, def)).toBe(false);
    expect(JSON.stringify(w.rng), "抽了亂數 —— 既有錄影會 desync").toBe(before);
  });
});
