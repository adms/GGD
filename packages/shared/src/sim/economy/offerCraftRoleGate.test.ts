/**
 * craftRole 排除清單 —— **兩條門讀同一份清單**（owner 2026-08-04）。
 *
 * ── 這一批在修什麼 ──────────────────────────────────────────────────────────
 * 三選一有兩條路，2026-08-04 之前它們對同一支道具給出**不同答案**：
 *
 *   · 免費武器卡（第 2/5 回合）→ `economy/draft.eligibleItemPool`
 *     ⛔ 完全沒有 craftRole 閘（`grep craftRole draft.ts` 零命中）
 *   · 2400 金傳說寶玉        → `economy/legendaryOrb.legendaryPool`
 *     ✅ 有，但寫死在那個檔案裡的一個 `Set`
 *
 * 後果：49 支傳說武器裡的 **8 支合成原料**免費卡發得出來、寶玉永遠抽不到。
 * 而 `offerEligibility.ts` 與 `legendaryOrb.ts` 兩份檔頭**都**警告過
 * 「只把閘加在其中一條路上，是最典型的半套修法」——它自己就是那個半套。
 *
 * owner 裁決「**49支可被隨機三選一 就好**」→ 清單搬到
 * `offerEligibility.itemOfferableTo`（兩條門都已經在呼叫它），
 * 出貨值拿掉 `component`，並升成後台欄位
 * `config.arena-rules@1` 的 `itemDraft.excludedCraftRoles`。
 *
 * ── 這三條守衛在守什麼 ──────────────────────────────────────────────────────
 * ⛔ 每一條都做過突變驗證（改壞→確認紅→改回），紀錄在 commit message：
 *
 *   A ⭐ **兩條門不可以再分岔**。突變：把 craftRole 判斷從 `itemOfferableTo`
 *     搬回 `legendaryOrb.orbEligible`（＝2026-08-04 之前的形狀）→ 免費卡看得到、
 *     寶玉看不到 → 紅。**這一條是本批的靈魂**，它釘的正是那個半套。
 *   B **owner 的裁決真的兌現了**：出貨設定下，一支 `component` 必須出現在
 *     **兩條**池子裡。突變：把 "component" 加回出貨排除清單 → 紅。
 *   C **欄位真的是閘**（不是裝飾）：把 "component" 填進
 *     `world.offerExcludedCraftRoles`，那支必須從**兩條**池子同時消失。
 *     突變：讓 `itemOfferableTo` 忽略那個欄位 → 兩條都還在 → 紅。
 *
 * ⛔ 沒有任何一條斷言寫死出貨值 —— 排除清單一律從
 * `DEFAULT_OFFER_EXCLUDED_CRAFT_ROLES` 讀（CLAUDE.md：驗機制不驗數字）。
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { LootTables, Items } from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";
import { Stat } from "../stats/statTypes";
import { ModOp } from "../stats/modifiers";
import { eligibleItemPool } from "./draft";
import { legendaryPool } from "./legendaryOrb";
import { DEFAULT_OFFER_EXCLUDED_CRAFT_ROLES } from "./offerEligibility";
import { LEGENDARY_POOL_TABLE } from "./itemTiers";

const TAG = "offer-craftrole-gate";

/**
 * 一支**合成原料**，而且它真的做得了事 —— `itemHasEffect` 那一半必須通過，
 * 否則測到的是「空殼被擋掉」而不是「原料被擋掉」（兩個不同的閘，失敗形態 ④）。
 * 出貨的 8 支就是這個形狀（例：`godie-i01g` 貫雷槍 armor+ / `godie-i020` 瑪那魔杖）。
 */
const COMPONENT_ITEM = "test-component-weapon" as ItemId;
/** 對照組：同樣有效果，但沒有 craftRole（＝出貨樹裡的 legacy / skeleton 文件）。 */
const PLAIN_ITEM = "test-plain-weapon" as ItemId;

beforeAll(() => {
  registerSkeletonContent();
  Items.register(COMPONENT_ITEM, {
    id: COMPONENT_ITEM,
    name: "測試用合成原料",
    cost: 0,
    tier: 3,
    tags: [],
    craftRole: "component",
    modifiers: [{ stat: Stat.Armor, op: ModOp.Flat, value: 10 }],
  });
  Items.register(PLAIN_ITEM, {
    id: PLAIN_ITEM,
    name: "測試用一般武器",
    cost: 0,
    tier: 3,
    tags: [],
    modifiers: [{ stat: Stat.AttackDamage, op: ModOp.Flat, value: 10 }],
  });
});

function armPool(entries: ItemId[]): void {
  LootTables.register(LEGENDARY_POOL_TABLE, {
    id: LEGENDARY_POOL_TABLE,
    entries: entries.map((itemId) => ({ itemId, weight: 1 })),
  });
}

const POOL: ItemId[] = [COMPONENT_ITEM, PLAIN_ITEM];
afterEach(() => armPool(POOL));

function makeWorld(): { world: SimWorld; id: EntityId } {
  armPool(POOL);
  const world = new SimWorld(SKELETON_ARENA, 7);
  const c = SKELETON_ARENA.zones[0]!.center;
  const id = spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x, z: c.z },
    zone: 0,
  });
  return { world, id };
}

/** 免費武器卡那條路看得到的 id。 */
function cardPool(world: SimWorld, id: EntityId): ItemId[] {
  return eligibleItemPool(world, id, LEGENDARY_POOL_TABLE).map((e) => e.itemId);
}
/** 2400 金傳說寶玉那條路看得到的 id。 */
function orbPool(world: SimWorld, id: EntityId): ItemId[] {
  return legendaryPool(world, id);
}

describe("craftRole 排除清單：免費卡與傳說寶玉讀同一份", () => {
  it("★ A 兩條門對同一支道具的判定必須一致（這一條釘的是「半套修法」本身）", () => {
    cover(TAG);
    const { world, id } = makeWorld();

    // 出貨設定：兩條門都看得到原料與一般武器。
    expect(cardPool(world, id).sort()).toEqual(orbPool(world, id).sort());

    // 換一份排除清單：兩條門**一起**變，不是只有一條變。
    world.offerExcludedCraftRoles = ["component"];
    expect(cardPool(world, id).sort()).toEqual(orbPool(world, id).sort());

    // 再換一份：一般武器沒有 craftRole，任何清單都擋不掉它 —— 兩條門仍然一致。
    world.offerExcludedCraftRoles = ["final", "component", "quest"];
    expect(cardPool(world, id).sort()).toEqual(orbPool(world, id).sort());
  });

  it("★ B 出貨設定下，合成原料在「兩條」路上都抽得到（owner:「49支可被隨機三選一」）", () => {
    cover(TAG);
    const { world, id } = makeWorld();

    // ⛔ 前提檢查：出貨清單裡不可以有 component，否則下面兩條斷言在測別的東西。
    expect(DEFAULT_OFFER_EXCLUDED_CRAFT_ROLES).not.toContain("component");
    expect(world.offerExcludedCraftRoles).toEqual(DEFAULT_OFFER_EXCLUDED_CRAFT_ROLES);

    expect(cardPool(world, id)).toContain(COMPONENT_ITEM);
    expect(orbPool(world, id)).toContain(COMPONENT_ITEM);
  });

  it("★ C 把角色填進欄位，那支要從兩條路同時消失（欄位是閘不是裝飾）", () => {
    cover(TAG);
    const { world, id } = makeWorld();

    world.offerExcludedCraftRoles = ["component"];
    expect(cardPool(world, id)).not.toContain(COMPONENT_ITEM);
    expect(orbPool(world, id)).not.toContain(COMPONENT_ITEM);
    // 沒有 craftRole 的那一支不受影響 —— 「缺標記」不是「不可以發」的證據。
    expect(cardPool(world, id)).toContain(PLAIN_ITEM);
    expect(orbPool(world, id)).toContain(PLAIN_ITEM);

    // 清空 → 兩條都回來。
    world.offerExcludedCraftRoles = [];
    expect(cardPool(world, id)).toContain(COMPONENT_ITEM);
    expect(orbPool(world, id)).toContain(COMPONENT_ITEM);
  });
});
