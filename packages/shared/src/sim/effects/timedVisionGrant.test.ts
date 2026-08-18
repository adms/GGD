/**
 * ⭐ GH#373 —— 一份**限時**的 `applyBuff` 真的授予得了隱形／真視。
 *
 * 這是這一批的**承重線**：`vision` 是 `SOURCE_GRANT_SHAPE` 的第八格，而引擎那一半
 * （`sim/stealth.ts::syncVisionGrants` 掃 `StatsComp.sources`、不問 `kind`、已經在
 * 跳過過期的 source）從 2026-07-30 就在。擋住「隱身 20 秒」的一直只有兩件事：
 * schema 上那一格，與 `stats/sourceGrants.ts` 的那一行轉發。
 *
 * ⛔ **為什麼不能靠既有的守衛**：`content/abilityNoOpEffects.test.ts` 只讀內容
 * （它看得到 `vision:{…}` 寫在文件上就滿意了），`castabilitySweep` 看得到那份
 * buff 掛上去（`buff` 頻道）—— 兩支都**對「轉發那一行被刪掉」全綠**，
 * 而症狀是卡片說隱形、遊戲裡完全看得見（失敗形態②）。
 *
 * 突變紀錄：把 `sourceGrants()` 裡
 * `...(from.vision !== undefined ? { vision: from.vision } : {})` 那一行刪掉
 * → 兩條全紅（實測）。
 *
 * ⛔ 驗的是**機制**不是數字：秒數／半徑住在 JSON（第一守則），這裡只問
 * 「按下去之後，場上有沒有多出一份隱形／真視狀態」。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { castAbility } from "../abilities/abilitySystem";
import { INNATE_SLOT, type CastTarget } from "../intents";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const Z0 = SKELETON_ARENA.zones[0]!;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
});

/** 放一次天生技，步進到吟唱與淡出都結束為止。 */
function castInnate(championId: string, target: CastTarget): { world: SimWorld; caster: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  const caster = spawnChampion(world, {
    championId: championId as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: Z0.center.z },
    zone: 0,
  });
  world.step(new Map());
  world.health.get(caster)!.mana = world.health.get(caster)!.maxMana;
  expect(castAbility(world, caster, INNATE_SLOT, target)).toBe("ok");
  // 吟唱 + 隱形淡出（3 秒）都涵蓋得到；⛔ 不釘 tick 數，那是 JSON 的事。
  for (let i = 0; i < 150; i++) world.step(new Map());
  return { world, caster };
}

describe("GH#373 — 限時 applyBuff 授予得了隱形／真視", () => {
  it("53-00 空間穿梭：放下去之後身上真的有一份隱形（而且是隱著的）", () => {
    const { world, caster } = castInnate("godie-o00l", { type: "self" });
    expect(world.stealth.has(caster), "應該有一份隱形狀態掛在施法者身上").toBe(true);
  });

  it("30-00 攝影機：放下去之後身上真的有一份真視", () => {
    const { world, caster } = castInnate("godie-orkn", {
      type: "point",
      point: { x: Z0.center.x + 3, z: Z0.center.z },
    });
    expect((world.trueSight.get(caster)?.radius ?? 0) > 0, "應該有一份真視半徑").toBe(true);
  });
});
