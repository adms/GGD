/**
 * ⛔ **【淨化】不可以剝掉對手的裝備效果。**（owner 2026-08-18：「要確認它不會變成
 * 一鍵清空對手所有裝備效果」）
 *
 * ── 為什麼這一條不能靠既有守衛推論出來 ─────────────────────────────────────
 *
 * 朗基努斯之槍（`godie-i018`）的【淨化】寫的是 `pools.buffs: true`，而
 * `clearPools` 的 `buffs` 池**就是** `attachSource` 掛上去的 ModifierSource ——
 * 一件道具的常駐加成**真的住在那一池裡**。它今天拔不走，是因為**三件事同時成立**：
 *
 *	① `dispel` 永遠傳 `requireDispellable: true`（引擎寫死）
 *	② 出貨 `dispel.json` 的 `buffDefaultDispellable` 是 **false**
 *	③ 道具來源沒有 `polarity`，而淨化要的是 `polarity: "buff"`
 *
 * 三件事分別都有守衛（`clearPools.test.ts` ①③、`dispel.test.ts`），
 * ⛔ 但**沒有任何一條在問這三件事湊起來的結果**。而那正是 CLAUDE.md「配對式
 * 後置條件」講的形狀：分開檢查每一個名詞，在相容性故障面前必然是綠的。
 *
 * ⚠️ 它同時是一張**警示**：後台「淨化規則」頁把 `buffDefaultDispellable` 打開，
 * 這一條會紅 —— 那不是誤報，那正是「你剛剛允許敵人剝裝備」的通知。
 *
 * ── 突變紀錄（⭐ 結果本身就是答案的一部分）─────────────────────────────────
 *
 *	① 只把 `dispel.ts` 的 `requireDispellable` 改成 false      → **仍然綠**
 *	② 只把 `clearPools.polarityPasses` 對「沒標極性」放行       → **仍然綠**
 *	③ **兩個一起**改                                            → **紅**（護甲 57.6 → 17.6）
 *
 * ⇒ 擋住它的是**兩道各自獨立的鎖**，拆掉任何一道都還鎖著。這正是要告訴 owner 的
 * 那句話：⛔ 它不可能變成「一鍵清空對手所有裝備效果」，而且不是靠一個巧合。
 * ⚠️ 同時也證明這條守衛**不是空轉**：保護真的消失時它會紅，並指名該去看哪一格。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import { attachItemSource } from "../economy/itemSource";
import { DEFAULT_DISPEL_RULES } from "../dispelRules";
import { Stat } from "../stats/statTypes";
import { recomputeStats } from "../stats/statPipeline";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";
import type { ItemDef } from "../content/defs";

beforeAll(() => registerSkeletonContent());

/** 一件「防禦+40」的道具 —— 形狀與 `godie-i01w` 祕銀鎖子甲同一種。 */
const ARMOUR_ITEM: ItemDef = {
  id: "test-plate" as ItemId,
  name: "測試護甲",
  cost: 300,
  tier: 1,
  modifiers: [{ stat: Stat.Armor, op: "flat", value: 40 }],
} as ItemDef;

function equipped(): { world: SimWorld; hero: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 7);
  const c = SKELETON_ARENA.zones[0]!.center;
  const hero = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x, z: c.z },
    zone: 0,
  });
  world.step(new Map());
  attachItemSource(world, hero, ARMOUR_ITEM.id, 0, ARMOUR_ITEM);
  recomputeStats(world, hero);
  return { world, hero };
}

/**
 * ⛔ **從出貨的 JSON 讀那一發淨化，⛔ 不是在這裡重打一份。**
 *
 * 手抄一份 payload（或直接呼叫 `clearPools`）會讓這條守衛驗到一個影子：
 * `dispel.ts` 把 `requireDispellable` 改成 false 之後它照樣綠，因為紅不紅
 * 取決於**我抄的那一份**。實測過 —— 第一版就是那樣寫的。
 */
const LONGINUS_DISPEL: EffectDef = (() => {
  const items = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content/items");
  const doc = JSON.parse(readFileSync(join(items, "godie-i018.json"), "utf8")) as {
    passive?: { effects?: EffectDef[] }[];
  };
  const fx = (doc.passive ?? []).flatMap((p) => p.effects ?? []).find((e) => e.kind === "dispel");
  if (!fx) throw new Error("godie-i018 身上沒有 dispel —— 這條守衛在空轉");
  return fx;
})();

/** 真的跑出貨的 effect handler。 */
function longinusPurge(world: SimWorld, caster: EntityId, victim: EntityId): void {
  const ctx: EffectContext = {
    world,
    caster,
    rank: 1,
    targets: [victim],
    origin: "test:longinus",
    rng: world.rng,
  };
  runEffects([LONGINUS_DISPEL], ctx);
}

describe("朗基努斯之槍【淨化】—— ⛔ 剝不掉裝備", () => {
  it("★ 淨化打在身上，裝備給的護甲一點都沒少（連打 20 次也一樣）", () => {
    const { world, hero } = equipped();
    const before = world.stats.get(hero)!.final[Stat.Armor];
    expect(before, "夾具沒裝上道具 —— 這條守衛在空轉").toBeGreaterThanOrEqual(40);
    for (let i = 0; i < 20; i++) longinusPurge(world, hero, hero);
    recomputeStats(world, hero);
    expect(
      world.stats.get(hero)!.final[Stat.Armor],
      "裝備的加成被淨化拔掉了 —— 檢查 dispel.json 的 buffDefaultDispellable 是不是被打開了",
    ).toBe(before);
  });

  it("★ 出貨設定就是擋住它的那道閘（⛔ 不是巧合）", () => {
    // ⚠️ 這兩格任何一格翻面，上一條就會紅。寫在這裡是為了讓紅的時候知道要看哪。
    expect(DEFAULT_DISPEL_RULES.buffDefaultDispellable).toBe(false);
    expect(DEFAULT_DISPEL_RULES.maxCountCap).toBeGreaterThanOrEqual(1);
  });
});
