/**
 * 任務三選一的抽卡閘 + 天堂之劍的暴擊倍率 —— 行為守衛 (owner 2026-07-30)。
 *
 * ---------------------------------------------------------------------------
 * ① `draftEligible` —— 「代價做了、回報沒做」的道具不該發給玩家
 * ---------------------------------------------------------------------------
 * 兩件 w3x 匯入的任務道具目前是**淨負面或全空**的:
 *
 *   · 天堂之劍 godie-i01n —— 原作 base `azhr` 復活聖典,三支能力 `AIrc`(死亡時
 *     原地復活 x3 = 描述裡的「魂藏 / 起死回生3次」) / `AIlz`(生命 -500) /
 *     `AIcs`(暴擊)。GGD 只實作了後兩支,所以**代價在、回報不在**:抽到它就是
 *     -500 血換一點暴擊。sim 沒有「自己死亡時原地復活 xN」這個原語(#84 的復活是
 *     隊友走進圈裡引導,不是同一個機制),補它是獨立一件事。
 *   · 仙后座 godie-i01s —— modifiers=0 passive=0 auras=0,抽到完全沒東西。
 *
 * 解法是**欄位而不是刪除**(CLAUDE.md 第一守則:決策點要能在後台撥回來):
 * `item@1.draftEligible`,預設 `true`,這兩件設 `false`。白名單照舊放行它們
 * (白名單說「存不存在」),閘在 sim 的 `offerEligibility.itemOfferableTo`,
 * 而且是在 **roll 之前**過濾 —— 先抽後濾正是 #47 空卡片的成因。
 *
 * ---------------------------------------------------------------------------
 * ② 天堂之劍的 10 倍暴擊 —— 讀最終傷害,不是讀欄位
 * ---------------------------------------------------------------------------
 * owner 2026-07-30:「天堂之劍 critChance 0.03 + critDamage 48.25 => 調整 6%
 * 10 倍暴擊,不然太誇張了」。
 *
 * 文件上寫的是 `critDamage: 8.25`,那是一個**差值**,不是倍率 —— 真正的倍率是
 * 英雄基礎 1.75 加上去之後的 10.0。所以「斷言文件裡有 8.25」會在下列每一種
 * 壞法下都保持綠色:基礎值被改掉、combat-env 的 `critDamage` 倍率把它乘歪、
 * `BasicAttackSystem` 那行 fallback `|| 1.75` 蓋掉了真的 final 值。
 * 這裡量的是**同一個木樁掉了多少血**:必爆的一刀 ÷ 絕不爆的一刀 = 10.0。
 *
 * ---------------------------------------------------------------------------
 * 突變紀錄(實跑,數字是量到的)
 * ---------------------------------------------------------------------------
 * M1 `offerEligibility.itemOfferableTo` 拿掉 `if (def.draftEligible === false)`
 *    那一行 → 2 紅(兩件道具各一條)。這是欄位「有沒有被消費」的守衛。
 * M2 `content/items/godie-i01n.json` 的 `draftEligible` 改成 `true`
 *    → 1 紅(天堂之劍那條)。證明斷言讀的是出貨資料,不是硬編清單。
 * M3 `BasicAttackSystem.ts` 的 `amount *= sc.final[Stat.CritDamage] || 1.75`
 *    改成 `amount *= 1.75`(暴擊倍率寫死回基礎值)→ 1 紅(倍率量到 1.75)。
 * M4 `godie-i01n.json` 的 `critDamage` 改回 48.25 → 1 紅(量到 50.0)。
 *    這一條就是 owner 那次裁決本身的守衛。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { registerAll } from "../../content/registries";
import { Champions, Items, LootTables } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { attachSource, recomputeStats } from "../stats/statPipeline";
import { Stat } from "../stats/statTypes";
import { ModOp } from "../stats/modifiers";
import { grantItemFree } from "./shop";
import { offerItems } from "./draft";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");

/** 任務三選一的池子 —— `arena-rules` 的 draft 表。 */
const QUEST_TABLE = "quest-rewards";
/** 出貨的三選一寬度。 */
const OFFER_COUNT = 3;

const HEAVEN_SWORD = "godie-i01n" as ItemId; // 天堂之劍
const CASSIOPEIA = "godie-i01s" as ItemId; // 仙后座

/** 出貨名單裡的一支近戰英雄(亞瑟王 - Saber)。 */
const HERO = "godie-e002" as ChampionId;

/**
 * 英雄基礎暴擊倍率。**不是**寫死的期望值 —— 下面會先對真的英雄名冊斷言一次,
 * 這個常數只是把「10.0 = 1.75 + 8.25」這個算式寫出來給人看。
 */
const CRIT_BASE = 1.75;
/** owner 2026-07-30 裁決的最終倍率。 */
const HEAVEN_SWORD_CRIT = 10.0;

const C = SKELETON_ARENA.zones[0]!.center;

/**
 * 出貨的 `item@1` 文件本身。**不是** `Items.get()` —— `ItemDef`(sim 那一側的
 * 介面)沒有 `description` 欄位,而卡面文案的斷言要讀的正是它。從 store 拿原始
 * 文件,是「玩家在卡片上看到什麼」最接近的來源。
 */
let itemDocs: Map<string, { description?: string; modifiers?: { stat: string; value: number }[] }>;

beforeAll(async () => {
  for (const r of [Champions, Items, LootTables]) r.clear();
  const store = (await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store;
  registerAll(store);
  itemDocs = new Map(
    store
      .all<{ id: string; description?: string; modifiers?: { stat: string; value: number }[] }>("items")
      .map((d) => [d.id, d]),
  );
});

/** 一名英雄,單獨站著 —— 發卡只需要一個 `ChampionComp`。 */
function solo(seed: number): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, seed);
  const id = spawnChampion(world, {
    championId: HERO,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  return { world, id };
}

/** N 次真的任務三選一,回傳出現過的道具與最薄的一張卡。 */
function questCards(seeds: number): { seen: Set<string>; minWidth: number } {
  const seen = new Set<string>();
  let minWidth = Number.POSITIVE_INFINITY;
  for (let seed = 1; seed <= seeds; seed++) {
    const { world, id } = solo(seed);
    const offer = offerItems(world, id, QUEST_TABLE, OFFER_COUNT);
    minWidth = Math.min(minWidth, offer.choices.length);
    for (const itemId of offer.choices) seen.add(itemId as string);
  }
  return { seen, minWidth };
}

// ===========================================================================
// ① 抽卡閘
// ===========================================================================
describe("draftEligible —— 純負面 / 全空的任務道具不再進三選一 (eco-draft-eligible)", () => {
  it("★ 400 次任務三選一,天堂之劍與仙后座一次都沒被發出來", () => {
    cover("eco-draft-eligible");
    const { seen } = questCards(400);
    // 先確認這兩件真的還在池子的**內容**裡 —— 否則下面的斷言會因為「表裡本來就
    // 沒有」而空綠(失敗形狀④:斷言方向跟缺陷無關)。
    const table = LootTables.get(QUEST_TABLE).entries.map((e) => e.itemId as string);
    expect(table, "quest-rewards 不再含天堂之劍 —— 那就變成刪除而不是開關了").toContain(HEAVEN_SWORD);
    expect(table, "quest-rewards 不再含仙后座 —— 那就變成刪除而不是開關了").toContain(CASSIOPEIA);

    expect(seen.has(HEAVEN_SWORD), "天堂之劍仍然會被發到玩家的三選一卡上").toBe(false);
    expect(seen.has(CASSIOPEIA), "仙后座仍然會被發到玩家的三選一卡上").toBe(false);
  });

  it("★ 關掉兩件之後,卡片仍然是滿的三張(不是把三選一縮成二選一)", () => {
    // 這是把「排除」跟「打薄卡片」分開來的那條。閘在 roll 之前,所以池子從 13
    // 變 11,卡片寬度不變 —— 如果哪天有人把閘搬到 roll 之後,這條就會紅。
    expect(questCards(400).minWidth).toBe(OFFER_COUNT);
  });

  it("★ 池子裡其他任務道具照常發得出來(閘沒有誤傷)", () => {
    const table = LootTables.get(QUEST_TABLE).entries.map((e) => e.itemId as string);
    const expected = table.filter((id) => id !== HEAVEN_SWORD && id !== CASSIOPEIA);
    const { seen } = questCards(400);
    expect(expected.filter((id) => !seen.has(id)), "被關掉的以外還有東西發不出來").toEqual([]);
  });

  it("★ 閘只擋『發卡』,不擋『已經拿到』—— 直接授予仍然成功", () => {
    // 這是刻意保留的語意,跟 `requiresAttackType` 一致:一件已經在格子裡的道具
    // 不可以因為策展改了就從背包消失。任務獎勵/後台補發也走同一個入口。
    const { world, id } = solo(1);
    expect(grantItemFree(world, id, HEAVEN_SWORD)).toBeGreaterThanOrEqual(0);
    expect(world.champion.get(id)!.items).toContain(HEAVEN_SWORD);
  });
});

// ===========================================================================
// ② 天堂之劍的暴擊倍率 —— 量真的傷害
// ===========================================================================

/**
 * 一名英雄 + 一個貼在面前、每 tick 被補滿血的木樁。`critChance` 用一個 flat
 * 修正推到必爆 (+1) 或絕不爆 (-1) —— `Stat.CritChance` 會被夾回 [0,1],所以
 * 這兩個值分別就是「每刀都爆」與「一刀都不爆」,不需要動 rng。
 */
function swingDamage(alwaysCrit: boolean): number {
  const world = new SimWorld(SKELETON_ARENA, 7);
  const attacker = spawnChampion(world, {
    championId: HERO,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  const dummy = spawnChampion(world, {
    championId: HERO,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: C.x + 1.0, z: C.z },
    zone: 0,
  });
  // 出貨的授予入口(三選一 / 寶玉 / 任務獎勵共用),不是測試自己 attachSource。
  expect(grantItemFree(world, attacker, HEAVEN_SWORD)).toBeGreaterThanOrEqual(0);
  attachSource(world, attacker, {
    id: "t:crit",
    kind: "buff",
    modifiers: [{ stat: Stat.CritChance, op: ModOp.Flat, value: alwaysCrit ? 1 : -1 }],
  });
  recomputeStats(world, attacker);

  const dummyPos = { ...world.transform.get(dummy)!.pos };
  for (let i = 0; i < 400; i++) {
    const hp = world.health.get(dummy)!;
    hp.hp = hp.maxHp; // 木樁永遠站著、永遠滿血
    world.transform.get(dummy)!.pos = { ...dummyPos };
    world.nav.get(attacker)!.attackTarget = dummy;
    world.step(new Map());
    for (const e of world.events) {
      if (e.type !== "damage") continue;
      const d = e.data as { source: number; origin?: string; amount: number; crit?: boolean };
      // `origin: "basic"` = 普攻的傷害封包(技能/道具 proc 走別的 origin)。
      if (d.source !== (attacker as unknown as number) || d.origin !== "basic") continue;
      expect(d.crit, `alwaysCrit=${alwaysCrit} 時暴擊旗標不符`).toBe(alwaysCrit);
      return d.amount;
    }
  }
  throw new Error("400 tick 之內一刀都沒打出去 —— 木樁站錯地方了");
}

describe("天堂之劍是 10 倍暴擊,不是 50 倍 (eco-heaven-sword-crit)", () => {
  it("★ 名冊的基礎暴擊倍率真的是 1.75(10.0 = 1.75 + 8.25 的前提)", () => {
    cover("eco-heaven-sword-crit");
    const bases = [...new Set(Champions.all().map((c) => c.baseStats[Stat.CritDamage]))];
    expect(bases, "英雄名冊對基礎暴擊倍率不一致 —— 「+8.25」就沒有唯一解了").toEqual([CRIT_BASE]);
  });

  it("★ 必爆的一刀 ÷ 絕不爆的一刀 = 10.0(讀木樁掉的血,不是讀欄位)", () => {
    const crit = swingDamage(true);
    const plain = swingDamage(false);
    expect(plain, "非暴擊那一刀是 0 —— 比值沒有意義").toBeGreaterThan(0);
    expect(crit / plain).toBeCloseTo(HEAVEN_SWORD_CRIT, 6);
    // 反向釘死 owner 推翻掉的那個值:50 倍是 w3x 的原值,不是出貨值。
    expect(crit / plain).not.toBeCloseTo(CRIT_BASE + 48.25, 3);
  });

  it("★ 卡面文案與資料一致 —— 「6%機率造成10倍傷害」", () => {
    // 玩家在三選一/背包上讀到的是這一行。文案與 modifier 分兩個地方存,語意改了
    // 而文案沒改就是謊話(CLAUDE.md)。這裡把兩邊綁在一起。
    const doc = itemDocs.get(HEAVEN_SWORD)!;
    const m = /(\d+(?:\.\d+)?)%機率造成(\d+(?:\.\d+)?)倍傷害/.exec(doc.description ?? "");
    expect(m, "天堂之劍的描述不再包含暴擊那一行").not.toBeNull();
    const chance = (doc.modifiers ?? []).find((x) => x.stat === Stat.CritChance)?.value;
    const delta = (doc.modifiers ?? []).find((x) => x.stat === Stat.CritDamage)?.value;
    expect(Number(m![1]) / 100).toBeCloseTo(chance!, 6);
    expect(CRIT_BASE + delta!).toBeCloseTo(Number(m![2]), 6);
    expect(Number(m![2])).toBeCloseTo(HEAVEN_SWORD_CRIT, 6);
  });
});
