/**
 * 傳說武器真的抽得到嗎 —— 行為守衛 (owner 2026-07-30 的四件職業限定傳說)。
 *
 * ---------------------------------------------------------------------------
 * 這條守衛是為了「上一輪被駁回」而寫的,不是補文件
 * ---------------------------------------------------------------------------
 * 上一輪把四件新傳說(裂地巨斧 / 賢者的護身符 / 衝鋒重脛甲 / 穿甲弩)加進了
 * `content/loot-tables/legendary-weapons.json`,機制也真的做對了 ——
 * `sim/content/requirement.test.ts` 的 19 條行為守衛全綠。**但玩家永遠拿不到**,
 * 因為它們沒有進白名單 `apps/platform/internal/curation/starter.go` 的
 * `starterLegendaryItems`。這是 CLAUDE.md 七種失敗形態的第 ② 種:算出來了,
 * 但從來沒送到玩家手上。
 *
 * 而且後果比「抽不到」更糟。`MatchController` 的回合武器卡是**先抽後濾**:
 *
 *     const offer = offerItems(this.world, entity, grant.weaponLootTable, 3);
 *     offer.choices = this.whitelist.filterItems(offer.choices);
 *
 * 24 個條目裡有 4 個不在白名單時,那 4 個仍然會被抽進三張卡裡,然後在過濾時
 * 消失 —— 所以玩家看到的不是「三選一少了幾個選項」,而是**卡片本身只剩 1~2 張,
 * 甚至一張都不剩**(空的那次只留下一行 console.warn)。
 *
 * ---------------------------------------------------------------------------
 * 為什麼要跑真的 roll,而不是比對兩個清單
 * ---------------------------------------------------------------------------
 * `arenaItemModel.test.ts` 已經有一條 `LootTables("legendary-weapons").entries
 * === starterLegendaryItems` 的集合相等斷言,它也會抓到同一個漏洞 —— 但它抓到的
 * 是「兩份清單不一樣」,不是「玩家的卡片會變空」。兩者不同:集合相等在**未來**
 * 白名單改成 admin 覆寫、或 `filterItems` 的語意改變時就不再等價於可達性,
 * 而下面這條會。
 *
 * 所以這裡跑的是出貨的那兩行本身(`offerItems` → `whitelist.filterItems`),
 * 用出貨的內容樹、出貨的 `starter.go`、出貨的 `Whitelist` 類別,
 * 斷言的是玩家看到的東西:**卡片上有幾張、四件新武器出不出得來**。
 *
 * ---------------------------------------------------------------------------
 * 突變紀錄(實跑,不是估的)
 * ---------------------------------------------------------------------------
 * M1 把 starter.go 的 `starterLegendaryItems` 裡那四行(cleaver-of-the-warden /
 *    sage-ward-amulet / bulwark-charge-greaves / piercer-crossbow)刪掉
 *    → 本檔 4 紅(可達性 2 條 + 卡片深度 1 條 + 寶玉池 1 條)。
 *    ⚠️ 這正是上一輪整份被判 REFUTED 的那個漏洞,而在這條守衛存在之前,
 *    刪掉那四行**不會**讓任何行為測試變紅。
 * M2 `MatchController` 那兩行的順序改成「先濾後抽」(理論上的正確修法)
 *    → 卡片深度那條會由紅轉綠,可達性仍紅。這說明兩組斷言各自獨立:
 *    一組看「東西進不進得了池子」,一組看「卡片會不會變薄」。
 * M3 `sim/economy/offerEligibility.itemOfferableTo` 直接 `return true`
 *    → 本檔全綠(四件新傳說沒有 `requiresAttackType`,也沒有被
 *    `draftEligible` 關掉)。這條**故意記下來**:本檔不守 offer 閘,
 *    那是 `questDraftGate.test.ts` 與 `requirement.test.ts` 的地盤。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { LootTables } from "@ggd/shared/sim/content/registry";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { offerItems } from "@ggd/shared/sim/economy/draft";
import { legendaryPool } from "@ggd/shared/sim/economy/legendaryOrb";
import { LEGENDARY_POOL_TABLE } from "@ggd/shared/sim/economy/itemTiers";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "@ggd/shared/ids";
import { Whitelist } from "./whitelist";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../..");
const CONTENT_DIR = join(REPO, "content");
const STARTER_GO = join(REPO, "apps/platform/internal/curation/starter.go");

/** 出貨的三選一寬度 —— `DEFAULT_ARENA_RULES.offerCount`。 */
const OFFER_COUNT = 3;

/**
 * owner 2026-07-30 的四件職業限定傳說。寫死在這裡是**故意**的:如果哪天有人
 * 把它們從內容樹或白名單拿掉,這條守衛應該紅,而不是安靜地縮小自己的斷言範圍
 * (從內容樹推導 expected 會讓刪除變成無聲通過)。
 */
const CLASS_GATED_FOUR = [
  "cleaver-of-the-warden",
  "sage-ward-amulet",
  "bulwark-charge-greaves",
  "piercer-crossbow",
] as const;

/** 出貨名單裡的一支近戰英雄與一支遠程英雄(#189 的 `requiresAttackType` 會分岔)。 */
const MELEE_HERO = "godie-e002" as ChampionId; // 亞瑟王 - Saber
const RANGED_HERO = "godie-e00t" as ChampionId; // 七夜怪談 - 貞子

/** 從 Go 原始碼把一個 `name = []string{ … }` 區塊裡的 id 撈出來(同 arenaItemModel.test.ts)。 */
function goList(src: string, name: string): string[] {
  const start = src.indexOf(`${name} = []string{`);
  if (start < 0) throw new Error(`starter.go no longer declares ${name} — update this test`);
  const open = src.indexOf("{", start);
  const close = src.indexOf("\n\t}", open);
  if (close < 0) throw new Error(`could not find the end of ${name} in starter.go`);
  const body = src.slice(open, close).replace(/\/\/[^\n]*/g, "");
  return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

let wl: Whitelist;
let starterItems: string[] = [];

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  const src = readFileSync(STARTER_GO, "utf-8");
  // ApplyStarterSet unions these four lists into the served whitelist — see
  // starter.go's `starterItems = concat(shop, services, legendary, draft)`.
  starterItems = [
    ...goList(src, "starterShopItems"),
    ...goList(src, "starterServiceItems"),
    ...goList(src, "starterLegendaryItems"),
    ...goList(src, "starterDraftItems"),
  ];
  const champions = goList(src, "starterChampions");
  // bypass = false: this is the ENFORCING whitelist, the one a fresh install
  // actually serves. `bypass` is the dev escape hatch and would make every
  // assertion below vacuous.
  wl = new Whitelist({ version: 1, champions, items: starterItems, abilities: [] }, false);
});

/** 一名英雄,單獨站在第一個決鬥區 —— 發卡只需要一個 `ChampionComp`。 */
function hero(seed: number, championId: ChampionId): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, seed);
  const c = SKELETON_ARENA.zones[0]!.center;
  const id = spawnChampion(world, {
    championId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x, z: c.z },
    zone: 0,
  });
  return { world, id };
}

/**
 * 出貨的回合武器卡,一張。**逐字**照 `MatchController.grantRoundRewards` 的那兩行:
 * 先 `offerItems` 抽,再 `whitelist.filterItems` 濾。順序就是缺陷本身,所以
 * 不可以在這裡「順手修好」。
 */
function weaponCard(seed: number, championId: ChampionId): ItemId[] {
  const { world, id } = hero(seed, championId);
  const offer = offerItems(world, id, LEGENDARY_POOL_TABLE, OFFER_COUNT);
  return wl.filterItems(offer.choices);
}

describe("四件新傳說真的抽得到 (eco-legendary-reachable)", () => {
  it("★ 出貨的白名單放行它們 —— 白名單說「存在」,不是「誰可以拿」", () => {
    cover("eco-legendary-reachable");
    // 這一條是最上游的:白名單擋住的話,下面兩條的 roll 全部白做。
    const blocked = CLASS_GATED_FOUR.filter((id) => !wl.allowsItem(id));
    expect(
      blocked,
      "這幾件在 content/loot-tables/legendary-weapons.json 裡,卻不在 starter.go 的 " +
        "starterLegendaryItems 裡 —— 抽得到、發不出去,而且會把回合武器卡打薄。",
    ).toEqual([]);
  });

  it("★ 真的從回合武器三選一抽出來(近戰與遠程英雄都要抽得到)", () => {
    // 24 個條目、每張卡抽 3 個、不重複抽 —— 200 顆種子下每一件的出現機率極高,
    // 而且因為 world.rng 是決定性的,這個「極高」不是機率而是**固定結果**。
    for (const championId of [MELEE_HERO, RANGED_HERO]) {
      const seen = new Set<string>();
      for (let seed = 1; seed <= 200; seed++) for (const id of weaponCard(seed, championId)) seen.add(id);
      const never = CLASS_GATED_FOUR.filter((id) => !seen.has(id));
      expect(never, `${championId} 的回合武器卡在 200 次三選一裡從來沒出現過這幾件`).toEqual([]);
    }
  });

  it("★ 整張表都抽得到 —— 沒有任何一個條目是死的", () => {
    // 比上一條更寬:任何一個 loot-table 條目落在白名單外都會被抓到,不只這四件。
    // 這是「下一次有人加內容忘了補白名單」的守衛。
    //
    // ⚠️ 要**兩種攻擊型態的英雄聯集**才算數。#189 的 `requiresAttackType` 是
    // 一個刻意的閘:熾天使之弓 (godie-i012) 標了 ranged,所以近戰英雄無論抽幾次
    // 都不該看到它 —— 這條測試第一次跑就是被它抓到的,而那是功能不是缺陷。
    // 只用一種英雄取樣會把「白名單漏了」跟「攻擊型態擋住」混成同一個紅燈。
    const entries = [...LootTables.get(LEGENDARY_POOL_TABLE).entries.map((e) => e.itemId as string)];
    const seen = new Set<string>();
    for (const championId of [MELEE_HERO, RANGED_HERO]) {
      for (let seed = 1; seed <= 400; seed++) for (const id of weaponCard(seed, championId)) seen.add(id);
    }
    expect(
      entries.filter((id) => !seen.has(id)),
      "loot table 有條目在近戰+遠程各 400 次三選一之後仍然一次都沒被發出去 —— " +
        "白名單濾掉了它,或它同時標了互相矛盾的 offer 條件",
    ).toEqual([]);
  });
});

describe("卡片深度 —— 三選一必須真的有三張 (eco-weapon-card-depth)", () => {
  it("★ 400 張卡沒有一張被濾成 <3 張", () => {
    cover("eco-weapon-card-depth");
    // 這是 REFUTED 的那個數字本身。四件死條目在 24 裡 ⇒ 每張卡的三個抽樣各有
    // 1/6 機率落在死條目上,約 44% 的卡片至少少一張。這條斷言讀的是**玩家看到
    // 幾張卡**,不是任何清單。
    const thin: string[] = [];
    for (let seed = 1; seed <= 400; seed++) {
      const card = weaponCard(seed, MELEE_HERO);
      if (card.length < OFFER_COUNT) thin.push(`seed ${seed}: ${card.length} 張 [${card.join(", ")}]`);
    }
    expect(
      thin.slice(0, 6),
      `${thin.length}/400 張回合武器卡被白名單濾成不到 ${OFFER_COUNT} 張 —— ` +
        `MatchController 是先抽後濾,所以池子裡的死條目會直接變成玩家的空位`,
    ).toEqual([]);
  });
});

describe("傳說寶玉的池子 (eco-orb-pool-reachable)", () => {
  it("★ 2400g 寶玉的池子裡真的有這四件", () => {
    cover("eco-orb-pool-reachable");
    // 寶玉走的是**先濾後抽**(legendaryPool 讀 world.itemEligible),所以它不會
    // 發空卡 —— 但白名單漏掉的東西一樣永遠滾不出來。兩條路都要守。
    const { world, id } = hero(7, MELEE_HERO);
    world.itemEligible = (itemId) => wl.allowsItem(itemId);
    const pool = new Set(legendaryPool(world, id) as string[]);
    world.itemEligible = null;
    expect(
      CLASS_GATED_FOUR.filter((x) => !pool.has(x)),
      "傳說寶玉的池子撈不到這幾件 —— 白名單或 orbEligible(craftRole/有沒有效果) 擋掉了",
    ).toEqual([]);
  });
});
