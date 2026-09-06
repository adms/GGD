/**
 * 閘①（GH#1030）：「玩家拿得到的道具」是**算出來的聯集**，⛔ 不是任何一張表。
 *
 * 假前提 #1（2026-09-05）：讀了 `legendaryShelfIds()`（只讀 `legendary-weapons`）
 * 就說「ex-release / ex-origin 零消費端、玩家拿不到」。⭐ 它證明的是「不在貨架上」，
 * 說成的是「拿不到」。這裡把**每一條出貨的取得管道**都跑真的函式，取聯集，
 * 並斷言聯集 ≠ 任何單一管道 —— 下一次有人只讀一張表，這條會指名差集。
 *
 * 兩個方向（形態⑫）：宣告的管道 → 它的表要存在（或宣告退場）；
 * 登錄表裡的每一張表 → 要有一條管道引用它（有實體而無宣告 ⇒ 紅）。
 * ⚠️ 母體是**內容層**：`world.itemEligible`（線上白名單）是執行期覆蓋層，這裡是 null。
 * ⛔ 沒有寫死 84 / 30 / 39 / 15 —— 每個數字都是登錄表的產物（第二守則：驗機制不驗數字）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { registerAll } from "../../content/registries";
import { Champions, Items, LootTables } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";
import { buyItem } from "./shop";
import { legendaryPool } from "./legendaryOrb";
import { eligibleItemPool } from "./draft";
import { isShopService } from "./itemTiers";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
interface Rules {
  legendaryShelf: SimWorld["legendaryShelf"];
  weaponShelfOpen: boolean;
  rounds: Record<string, { weaponLootTable?: string }>;
  weaponTiers: { id: string; table: string }[];
  retiredLootTables?: string[];
  gacha?: { lootTable: string };
}
const RULES = JSON.parse(readFileSync(join(CONTENT_DIR, "config/arena-rules.json"), "utf8")) as Rules;
const RETIRED = new Set(RULES.retiredLootTables ?? []);
/** 一條取得管道：名字 · 讀的是哪一張表（null = 不走表）· 真的跑出貨函式算出的 id 集合。 */
interface Channel { id: string; table: string | null; ids: ReadonlySet<string> }

/** ⚠️ 母體是**看英雄的**（`requiresAttackType`：6 件只給近戰／遠程）⇒ 一近一遠兩個探針取聯集。 */
function rig(championId: string): { world: SimWorld; me: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 1030);
  world.legendaryShelf = { ...RULES.legendaryShelf };
  world.weaponShelfOpen = RULES.weaponShelfOpen;
  const c = SKELETON_ARENA.zones[0]!.center;
  const me = spawnChampion(world, { championId: championId as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0), pos: c, zone: 0 });
  return { world, me };
}
let probes: string[] = [];
const fromTable = (id: string, table: string): Channel => ({
  id, table,
  ids: new Set(probes.flatMap((p) => { const { world, me } = rig(p); return eligibleItemPool(world, me, table).map((e) => e.itemId); })),
});

let channels: Channel[] = [];
beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  probes = (["melee", "ranged"] as const).map((t) => Champions.all().find((c) => c.attackType === t)!.id);
  const shelf = new Set<string>();
  for (const itemId of Items.ids()) {
    if (isShopService(itemId)) continue; // 服務不佔格、不是道具
    for (const p of probes) {
      const { world, me } = rig(p);
      world.champion.get(me)!.gold = 1e9;
      if (buyItem(world, me, itemId as ItemId) === "ok") shelf.add(itemId);
    }
  }
  const orb = probes.map((p) => rig(p));
  // ⚠️ 引擎預設 gacha 表是 apps/game-server/src/match/arenaRules.ts 的 `round-reward`；文件缺席就用它。
  const gacha = RULES.gacha?.lootTable ?? "round-reward";
  channels = [
    { id: "shop-shelf（buyItem）", table: null, ids: shelf },
    { id: "legendary-orb（legendaryPool）", table: "legendary-weapons", ids: new Set(orb.flatMap((o) => legendaryPool(o.world, o.me))) },
    ...Object.entries(RULES.rounds).flatMap(([r, g]) => (g.weaponLootTable ? [fromTable(`round-${r}-draft`, g.weaponLootTable)] : [])),
    ...RULES.weaponTiers.map((t) => fromTable(`weapon-tier:${t.id}`, t.table)),
    fromTable("gacha（legacy）", gacha),
    fromTable("quest-rewards（legacy）", "quest-rewards"),
  ];
});
const manifest = (): string =>
  `探針=${probes.join("/")}；` + channels.map((c) => `${c.id}${c.table ? `←${c.table}` : ""}=${c.ids.size}`).join(" · ");

describe("閘①：拿得到的道具 = 每一條管道的聯集（GH#1030 假前提 #1）", () => {
  it("兩個方向：宣告的表要存在或已退場；登錄表的每一張表都要有管道引用", () => {
    for (const c of channels) {
      if (c.table === null) continue;
      const exists = LootTables.tryGet(c.table) !== undefined;
      expect(exists || RETIRED.has(c.table), `${c.id} 讀 ${c.table}：表不存在又沒宣告退場`).toBe(true);
      expect(!(exists && RETIRED.has(c.table)), `${c.table} 已宣告退場卻仍在 content/loot-tables/`).toBe(true);
    }
    const referenced = new Set(channels.map((c) => c.table));
    for (const table of LootTables.ids())
      expect(referenced.has(table), `loot table ${table} 沒有任何一條管道引用它 —— 有實體而無宣告`).toBe(true);
  });

  it("聯集 ≠ 任何單一管道；ex-release / ex-origin 的每一件都在聯集裡", () => {
    const union = new Set(channels.flatMap((c) => [...c.ids]));
    expect(union.size, manifest()).toBeGreaterThan(0);
    for (const c of channels) {
      const missing = [...union].filter((id) => !c.ids.has(id));
      expect(missing.length, `只讀「${c.id}」會漏掉 ${union.size - c.ids.size} 件 —— 這不是母體。掃過的管道：${manifest()}`).toBeGreaterThan(0);
    }
    for (const t of RULES.weaponTiers)
      for (const e of LootTables.get(t.table).entries)
        expect(union.has(e.itemId), `${e.itemId}（${t.table}）在出貨管道裡拿得到，不可以被說成「拿不到」`).toBe(true);
    console.info(`[GH#1030 閘①] 拿得到的道具 ${union.size} 件（${manifest()}）`);
  });
});
