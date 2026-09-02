/**
 * ⭐⭐ GH#650 —— **出貨的那一支**（初號機 AT力場 `godie-e00r.e`）真的發得出 `blockVfx`。
 *
 * ⛔⛔ 為什麼 `blockVfxReachesWire.test.ts` 不夠（失敗形態⑤：被測的不是出貨的那個）:
 * 那一支自己造了一份 grant（`origin: "ability:test.block-vfx"`、`chance` 不存在、
 * `fraction: 1`）⇒ ⭐ 它證明的是「**機制**會發」，
 * ⛔ 而 owner 回報的是「**初號機**格擋成功沒出現特效」—— 那是兩個不同的宣稱。
 *
 * ⚠️ ⭐ 這一支跑的是**出貨內容**:`content/abilities/godie-e00r.e.json` 本人。
 * ⇒ 內容側哪一天把 `vfxId` 拿掉、改名、或那一格 rank 結構變了 ⇒ 這裡紅。
 *
 * ⭐ 而票文自己也過期了（前提回驗，2026-09-02）:
 * 它寫 `fx.fam.burst.physical.s100` / `vfxScale 1.6`，
 * ⛔ 而出貨今天是 `fx.fam.shockwave-ring.physical.s150` / `2.6`
 * —— ⭐ 那個 ring 正是 owner 要的「線條」。
 * ⇒ ⛔ 這裡**不抄字面值**，從出貨文件讀（⛔ 否則就是第四個住處）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, THORNE } from "../content/skeleton";
import { Abilities, registerChampion } from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type SeatId, type AbilityId, type ChampionId } from "../../ids";
import type { IntentFrame } from "../intents";
import { syncAbilityPassives } from "../abilities/abilityPassives";

const NO_INTENTS: ReadonlyMap<SeatId, IntentFrame> = new Map();
const Z0 = SKELETON_ARENA.zones[0]!;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const DOC = JSON.parse(
  readFileSync(join(ROOT, "content/abilities/godie-e00r.e.json"), "utf8"),
) as {
  id: string;
  passive?: { ranks?: { block?: { vfxId?: string; vfxScale?: number; vfxTint?: number[] } }[] };
};
/** ⭐ 出貨宣告的那一格 —— ⛔ 不抄字面值。 */
const SHIPPED = DOC.passive?.ranks?.[0]?.block;
const BLOCKER = "test.e00r-blocker" as ChampionId;

beforeAll(() => {
  registerSkeletonContent();
  // ⭐ 註冊**出貨那一份文件**當被動 —— ⛔ 不是我造的一份。
  //   ⚠️ `chance` 拿掉是刻意的:這一條問的是「**擋中之後**發不發特效」，
  //   ⛔ 不是「10% 會不會抽中」——那兩件事 owner 的票文逐字要求分開量。
  const doc = JSON.parse(JSON.stringify(DOC)) as typeof DOC & { schema?: string };
  const blk = doc.passive!.ranks![0]!.block as Record<string, unknown>;
  // ⚠️ ⭐ **設成 1,⛔ 不是 delete** —— `blockCutFor` 的第一道閘是
  //   `clamp01(b.chance) > 0`,而 `clamp01(undefined)` 不 `> 0` ⇒ 整個來源被跳過
  //   ⇒ ⭐ 看起來就跟「功能壞掉」一模一樣（我 2026-09-02 真的因此誤判過一次）。
  blk.chance = 1;
  blk.fraction = 1;
  Abilities.register(doc.id as AbilityId, doc as never);
  // ⭐ 掛進 **E 槽**（出貨那一支就是 `.e`）—— ⛔ 不是 `passiveAbility`:
  //   ⚠️ 天生技那條路的 rank 來源不同,而 `rankBlock()` 的第一行是
  //   `if (rank <= 0) return null` ⇒ 掛錯地方會得到「⛔ 沒擋中」，
  //   而那看起來**跟功能壞掉一模一樣**（CLAUDE.md 綠燈假來源⑩的反面）。
  registerChampion({
    ...THORNE,
    id: BLOCKER,
    abilities: { ...THORNE.abilities, E: { ...doc, slot: "E" } },
  } as never);
});

function runOneBlockedHit() {
  const world = new SimWorld(SKELETON_ARENA, 20260902);
  const blocker = spawnChampion(world, {
    championId: BLOCKER, seatId: asSeatId(0), teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: Z0.center.z + 10 }, zone: 0,
  });
  const attacker = spawnChampion(world, {
    championId: BLOCKER, seatId: asSeatId(1), teamId: asTeamId(0),
    pos: { x: Z0.center.x + 3, z: Z0.center.z + 10 }, zone: 0,
  });
  // ⭐ 學一級 —— ⛔ 沒有這一行 `rankBlock()` 直接回 null（那不是缺陷,是沒學技能）。
  const ab = world.abilities.get(blocker)!;
  (ab.slots as Record<string, { rank: number }>).E!.rank = 1;
  syncAbilityPassives(world, blocker);
  world.rebuildGrid();
  const before = world.health.get(blocker)!.hp;
  world.damageQueue.push({
    source: attacker, target: blocker, amount: 300,
    type: "physical", crit: false, origin: "ability:test.attack",
  });
  world.step(NO_INTENTS);
  const events = world.events as never as { type: string; data: Record<string, unknown> }[];
  return { events, lost: before - world.health.get(blocker)!.hp };
}

describe("GH#650 —— 出貨的初號機 AT力場真的發得出 blockVfx", () => {
  it("⭐ 前提:出貨文件真的宣告了一道特效（⛔ 它沒宣告的話這張票要改形狀）", () => {
    expect(SHIPPED, "⛔ 出貨文件的 passive.ranks[0].block 不見了").toBeTruthy();
    expect(SHIPPED!.vfxId, "⛔ 出貨沒有宣告 vfxId ⇒ emitBlockVfx 第一行就 return").toBeTruthy();
  });

  it("⭐ 量尺先自證:這一發**真的被擋掉了**", () => {
    expect(runOneBlockedHit().lost, "⛔ 血掉了 ⇒ 沒擋中,下面驗什麼都沒意義").toBe(0);
  });

  it("★★ ⭐ 擋中 ⇒ 發得出 `blockVfx`，而且帶的是**出貨宣告的那一道**", () => {
    const hit = runOneBlockedHit().events.filter((e) => e.type === "blockVfx");
    expect(hit.length, "⛔ 一則都沒有 —— 出貨的那一支走不到 emit 站").toBe(1);
    const d = hit[0]!.data;
    expect(d.vfxId, "⛔ 送的不是出貨文件宣告的那一道").toBe(SHIPPED!.vfxId);
    expect(d.scale).toBe(SHIPPED!.vfxScale ?? 1);
    expect(d.tint).toEqual(SHIPPED!.vfxTint);
    // ⭐ 客戶端那個 case 逐字讀這六個名字;少一個它第一行就 break
    for (const k of ["target", "vfxId", "scale", "tint", "x", "z"])
      expect(d, `⛔ payload 沒有 \`${k}\``).toHaveProperty(k);
  });
});

/**
 * ⭐⭐ GH#650 的**第二半**：`chanceMult` 這一格真的轉得動骰子。
 *
 * ⚠️ ⭐ **兩個方向都量**（CLAUDE.md：一把只驗過單邊的尺不算自證過）：
 * · 0 ⇒ 一發都擋不到（已知**沒有**的那一邊）
 * · 5 ⇒ 每一發都擋（已知**有**的那一邊）
 * ⛔ 只驗其中一邊的話，一個「這一格根本沒被讀」的實作也會綠。
 */
describe("GH#650 —— chanceMult 真的轉得動", () => {
  const run = (mult: number, chance: number) => {
    const world = new SimWorld(SKELETON_ARENA, 20260902);
    (world as unknown as { blockRules: { stacking: string; chanceMult: number } }).blockRules = {
      stacking: "independent",
      chanceMult: mult,
    };
    const blocker = spawnChampion(world, {
      championId: BLOCKER, seatId: asSeatId(0), teamId: asTeamId(0),
      pos: { x: Z0.center.x, z: Z0.center.z + 10 }, zone: 0,
    });
    const attacker = spawnChampion(world, {
      championId: BLOCKER, seatId: asSeatId(1), teamId: asTeamId(0),
      pos: { x: Z0.center.x + 3, z: Z0.center.z + 10 }, zone: 0,
    });
    const ab = world.abilities.get(blocker)!;
    (ab.slots as unknown as Record<string, { rank: number }>).E!.rank = 1;
    syncAbilityPassives(world, blocker);
    // ⭐ 直接改**掛上去的那一份** grant 的機率 —— ⛔ 不重註冊內容。
    for (const src of world.stats.get(blocker)!.sources)
      if (src.block) (src.block as { chance: number }).chance = chance;
    world.rebuildGrid();
    // ⛔⛔ **⛔ 不要用「血有沒有少 20」當量尺** —— 護甲會先吃掉一部分,
    //   ⇒ 每一發都「看起來被擋」而測試對倍率 0 也綠（2026-09-02 真的中了一次）。
    // ⭐ 量 `blockVfx` 的**則數**:它只在 `rng.chance()` 抽中之後才發 ⇒ 直指這一格。
    let blocked = 0;
    for (let i = 0; i < 20; i++) {
      const hp0 = world.health.get(blocker)!.hp;
      (world.events as unknown as unknown[]).length = 0;
      world.damageQueue.push({
        source: attacker, target: blocker, amount: 20,
        type: "physical", crit: false, origin: "ability:test.attack",
      });
      world.step(NO_INTENTS);
      blocked += (world.events as never as { type: string }[]).filter(
        (e) => e.type === "blockVfx",
      ).length;
      world.health.get(blocker)!.hp = hp0; // ⛔ 不要讓他死掉而讓後面 19 發變成空跑
    }
    return blocked;
  };

  it("★★ ⭐ 0 ⇒ **一發都擋不到**（已知沒有的那一邊）", () => {
    expect(run(0, 0.5), "⛔ 倍率 0 還擋得到 ⇒ 這一格沒有被讀").toBe(0);
  });

  it("★★ ⭐ 5 ⇒ **每一發都擋**（已知有的那一邊）", () => {
    expect(run(5, 0.5), "⛔ 倍率 5（0.5×5 ⇒ 夾到 1）卻沒有每發都擋").toBe(20);
  });
});
