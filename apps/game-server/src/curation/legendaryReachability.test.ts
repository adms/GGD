/**
 * 傳說武器真的抽得到嗎 —— 行為守衛 (owner 2026-08-01 的 49 支棱彩武器)。
 *
 * ---------------------------------------------------------------------------
 * 這條守衛是為了「上一輪被駁回」而寫的,不是補文件
 * ---------------------------------------------------------------------------
 * 上一輪把四件新傳說加進了 `content/loot-tables/legendary-weapons.json`,機制也
 * 真的做對了 —— `sim/content/requirement.test.ts` 的 19 條行為守衛全綠。
 * **但玩家永遠拿不到**,因為它們沒有進白名單
 * `apps/platform/internal/curation/starter.go` 的 `starterLegendaryItems`。
 * 這是 CLAUDE.md 七種失敗形態的第 ② 種:算出來了,但從來沒送到玩家手上。
 *
 * 而且後果比「抽不到」更糟。`MatchController` 的回合武器卡**曾經是先抽後濾**:
 *
 *     const offer = offerItems(this.world, entity, grant.weaponLootTable, 3);
 *     offer.choices = this.whitelist.filterItems(offer.choices);
 *
 * 條目裡有幾個不在白名單時,那幾個仍然會被抽進三張卡裡,然後在過濾時消失 ——
 * 所以玩家看到的不是「三選一少了幾個選項」,而是**卡片本身只剩 1~2 張,
 * 甚至一張都不剩**(空的那次只留下一行 console.warn)。
 *
 * ⚠️ 那正是 owner 2026-08-01 實戰回報的 GH#249,而它**已經修掉了**:白名單改由
 * `world.itemEligible` 走在 roll 前面(`economy/draft.eligibleItemPool`),
 * `MatchController` 的 post-filter 刪除。本檔的 `weaponCard()` 因此跟著改成新的
 * 順序(見那支函式的檔頭),而「卡片會不會被削薄」這件事現在由
 * `match/legendaryCardWidth.test.ts` 用窄白名單 + 真的 MatchController 守。
 *
 * ---------------------------------------------------------------------------
 * owner 2026-08-01 之後為什麼改成「整張表」而不是四個寫死的 id
 * ---------------------------------------------------------------------------
 * 「隨機三選一發放道具 都改成棱彩武器道具」把池子從 24 條擴成 49 條,而且
 * **回合 2 與回合 5 兩張武器卡現在都滾這張表**。原本寫死的四件裡有兩件
 * (賢者的護身符 / 穿甲弩)已經被 owner 從表裡拿掉,所以那四個 id 既不是這條
 * 守衛想守的東西,也擋不住新加的 45 條。
 *
 * 守的東西沒變、範圍變大:**表裡的每一條,對它「配得上」的英雄,都要真的從出貨
 * 的那兩行滾出來**。攻擊型態(`requiresAttackType`)是**功能不是缺陷**,所以它
 * 兩邊都要斷言 —— 配得上的一定要出現,配不上的一次都不准出現。寫死清單只能
 * 抓「這四件不見了」,推導版連「第 50 件加進來忘了補白名單」都會抓到,而後者
 * 才是這一批真正發生的事。
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
 * M1 把 starter.go 的 `starterLegendaryItems` 裡任意一行刪掉(實測拿
 *    `cleaver-of-the-warden` 開刀)→ 本檔 4 紅(白名單 1 + 可達性 2 + 寶玉池 1)。
 *    ⚠️ 這正是上一輪整份被判 REFUTED 的那個漏洞,而在這條守衛存在之前,
 *    刪掉那一行**不會**讓任何行為測試變紅。
 * M2 (2026-08-01 之前) `MatchController` 那兩行的順序改成「先濾後抽」
 *    → 卡片深度那條會由紅轉綠,可達性仍紅。這說明兩組斷言各自獨立:
 *    一組看「東西進不進得了池子」,一組看「卡片會不會變薄」。
 *    ⚠️ GH#249 之後這個突變**不再存在**(先濾後抽已經是出貨行為),等價的
 *    突變是把 post-filter 加回來,而抓它的是 `match/legendaryCardWidth.test.ts`
 *    —— 本檔的白名單是出貨的那份、放行整張表,所以兩種順序在這裡結果相同。
 * M3 `sim/economy/offerEligibility.itemOfferableTo` 直接 `return true`
 *    → 「配不上的一次都不准出現」那半邊轉紅(近戰英雄會抽到 ranged 限定的
 *    熾天使之弓)。2026-08-01 之前這條寫著「本檔全綠、不守 offer 閘」——
 *    那是因為當時寫死的四件都沒有 `requiresAttackType`,換成整張表之後
 *    這個閘就在守備範圍內了(表裡有 5 melee + 1 ranged)。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { CONTENT, shippedChampionIds } from "../testkit/contentFixtures";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { Champions, Items, LootTables } from "@ggd/shared/sim/content/registry";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { offerItems } from "@ggd/shared/sim/economy/draft";
import { legendaryPool } from "@ggd/shared/sim/economy/legendaryOrb";
import { LEGENDARY_POOL_TABLE } from "@ggd/shared/sim/economy/itemTiers";
import { DEFAULT_OFFER_EXCLUDED_CRAFT_ROLES } from "@ggd/shared/sim/economy/offerEligibility";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "@ggd/shared/ids";
import { Whitelist } from "./whitelist";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../..");
const CONTENT_DIR = join(REPO, "content");
const STARTER_GO = join(REPO, "apps/platform/internal/curation/starter.go");

/** 出貨的三選一寬度 —— `DEFAULT_ARENA_RULES.offerCount`。 */
const OFFER_COUNT = 3;

/**
 * 出貨名單裡的一支近戰英雄與一支遠程英雄(#189 的 `requiresAttackType` 會分岔)。
 * 兩支都必要:只用一種攻擊型態取樣,會把「白名單漏了」跟「攻擊型態擋住」混成
 * 同一個紅燈。
 */
// GH#323 —— 取樣英雄從**出貨內容推導**，⛔ 不寫死 id：`godie-e00t`（貞子）
// 在 2026-08-13 退場了，而寫死的版本紅的訊息是「forbidden 一件都沒有」——
// 那聽起來像 #189 的閘破了，真相只是這位英雄不在名單上，`attackTypeOf` 拿不到她。
// ⭐ 判準不變：一近戰一遠程，兩邊都要真的有「被擋的武器」才有鑑別力。
function pickHero(want: "melee" | "ranged"): ChampionId {
  for (const id of shippedChampionIds()) {
    const doc = JSON.parse(
      readFileSync(join(CONTENT, "champions", `${id}.json`), "utf8"),
    ) as { attackType?: string };
    if ((doc.attackType ?? "melee") === want) return id as ChampionId;
  }
  throw new Error(`出貨名單裡一位 ${want} 英雄都沒有 —— 取樣不可能有鑑別力`);
}
const MELEE_HERO = pickHero("melee");
const RANGED_HERO = pickHero("ranged");

/** 出貨的棱彩池,原封不動 —— 斷言全部從這裡推導,沒有第二份清單可以漂移。 */
function poolEntries(): string[] {
  return LootTables.get(LEGENDARY_POOL_TABLE).entries.map((e) => e.itemId as string);
}

/**
 * 一支英雄「配得上」的條目 / 「配不上」的條目。
 *
 * `requiresAttackType` 沒填 = 所有人都配得上(200+ 份舊文件的預設)。
 *
 * **不呼叫 `economy/offerEligibility.itemOfferableTo`,是故意的**:用出貨的謂詞
 * 算 expected,會讓 LRT-3 那種突變(謂詞整個 `return true`)把預期與實際一起
 * 帶偏,測試就永遠綠。所以這裡重寫一份。
 *
 * ⚠️ 而且這份**只鏡射攻擊型態那一半**。`itemOfferableTo` 還有第一道閘
 * `draftEligible === false`,這裡**刻意不抄**。方向是安全的:某條目哪天被關掉
 * `draftEligible`,它仍會被算進 `fits`、卻永遠滾不出來,於是本檔轉紅 —— 而那
 * 正是該紅的,「在三選一池子裡但抽不到」本身就是缺陷(owner 2026-08-01 把
 * 天堂之劍 godie-i01n 與仙后座 godie-i01s 的 `draftEligible: false` 拿掉,就是
 * 為了讓它們真的抽得到)。2026-08-01 實測:49 條裡沒有任何一條關著。
 */
function splitByAttackType(attackType: "melee" | "ranged"): { fits: string[]; forbidden: string[] } {
  const fits: string[] = [];
  const forbidden: string[] = [];
  for (const id of poolEntries()) {
    const need = Items.get(id as ItemId).requiresAttackType;
    if (need === undefined || need === attackType) fits.push(id);
    else forbidden.push(id);
  }
  return { fits, forbidden };
}

/** 英雄的攻擊型態,從出貨的英雄文件讀 —— 不寫死,換英雄不會靜默失準。 */
function attackTypeOf(championId: ChampionId): "melee" | "ranged" {
  const t = Champions.get(championId).attackType;
  expect(t, `${championId} 沒有 attackType,取樣英雄選錯了`).toBeTruthy();
  return t as "melee" | "ranged";
}

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
 * 出貨的回合武器卡,一張。**逐字**照 `MatchController.grantRoundRewards` 今天的
 * 那一段:白名單經由 `world.itemEligible` 走在 roll **前面**,之後沒有任何過濾。
 *
 * ⚠️ 2026-08-01 GH#249 改過。這裡本來寫的是
 *
 *     const offer = offerItems(world, id, LEGENDARY_POOL_TABLE, OFFER_COUNT);
 *     return wl.filterItems(offer.choices);          // ← 先抽後濾
 *
 * 並附一句「順序就是缺陷本身,所以不可以在這裡順手修好」—— 那句話在當時是對的
 * （出貨的兩行就長那樣）。owner 打了一場之後那個缺陷被修掉了:白名單搬進
 * `economy/draft.eligibleItemPool`,`MatchController` 的 post-filter 刪除。
 * 舊寫法如果留著,本檔就會變成 CLAUDE.md 失敗形態 ⑤：**測的不是出貨的那個**
 * —— 它會繼續替一段已經不存在的程式碼作證。
 *
 * 卡片寬度那一組斷言（下面的 eco-weapon-card-depth）因此改由
 * `match/legendaryCardWidth.test.ts` 用**窄白名單 + 真的 MatchController** 來守;
 * 這裡留下的那條是「出貨白名單放行整張表」這個條件下的回歸線。
 */
function weaponCard(seed: number, championId: ChampionId): ItemId[] {
  const { world, id } = hero(seed, championId);
  world.itemEligible = (itemId) => wl.allowsItem(itemId);
  return offerItems(world, id, LEGENDARY_POOL_TABLE, OFFER_COUNT).choices;
}

describe("棱彩池整張表真的抽得到 (eco-legendary-reachable)", () => {
  it("★ 出貨的白名單放行整張表 —— 白名單說「存在」,不是「誰可以拿」", () => {
    cover("eco-legendary-reachable");
    // 這一條是最上游的:白名單擋住的話,下面兩條的 roll 全部白做。
    // 逐條掃整張表,不是掃某幾個 id —— owner 2026-08-01 一次加了 25 條,
    // 「新加的忘了補白名單」正是這條在守的東西。
    const entries = poolEntries();
    expect(entries.length, "棱彩池空了或表不見了").toBeGreaterThanOrEqual(6);
    const blocked = entries.filter((id) => !wl.allowsItem(id));
    expect(
      blocked,
      "這幾件在 content/loot-tables/legendary-weapons.json 裡,卻不在 starter.go 的 " +
        "starterLegendaryItems 裡 —— 抽得到、發不出去,而且會把回合武器卡打薄。",
    ).toEqual([]);
  });

  it("★ 真的從回合武器三選一抽出來,而且攻擊型態閘兩個方向都成立", () => {
    // 49 個條目、每張卡抽 3 個、不重複抽 —— 200 顆種子下每一件的出現機率極高,
    // 而且因為 world.rng 是決定性的,這個「極高」不是機率而是**固定結果**。
    //
    // 兩個方向都斷言,因為 #189 的攻擊型態閘是**功能**:
    //   · 配得上的:一次都沒滾出來 = 白名單漏了 / 池子壞了。
    //   · 配不上的:滾出來過一次 = 閘破了(近戰英雄拿到 ranged 限定武器)。
    // 只斷言前者的話,把 `itemOfferableTo` 改成 `return true` 仍然全綠。
    for (const championId of [MELEE_HERO, RANGED_HERO]) {
      const { fits, forbidden } = splitByAttackType(attackTypeOf(championId));
      const seen = new Set<string>();
      for (let seed = 1; seed <= 200; seed++) for (const id of weaponCard(seed, championId)) seen.add(id);
      expect(
        fits.filter((id) => !seen.has(id)),
        `${championId} 的回合武器卡在 200 次三選一裡從來沒出現過這幾件`,
      ).toEqual([]);
      expect(
        forbidden.filter((id) => seen.has(id)),
        `${championId} 抽到了攻擊型態不符的武器 —— #189 的 requiresAttackType 閘破了`,
      ).toEqual([]);
      // 閘要真的在守著東西:兩支取樣英雄合起來必須至少各碰到一件被擋的,
      // 否則上面那半條斷言是空跑的(vacuous truth)。
      expect(forbidden.length, `${championId} 一件被擋的都沒有,取樣英雄選得沒有鑑別力`).toBeGreaterThan(0);
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
  /**
   * craftRole 排除清單。**2026-08-04 之前這裡是一份手抄的 Set** —— 那是對的,
   * 因為當時清單也是手寫死在 `legendaryOrb.orbEligible` 裡,鏡射才擋得住突變。
   *
   * ⛔ **現在不是了。** owner 2026-08-04「49支可被隨機三選一 就好」之後,清單
   * 升格成後台欄位(`config.arena-rules@1` 的 `itemDraft.excludedCraftRoles`),
   * 而**兩條門讀同一份**(`economy/offerEligibility.itemOfferableTo`)。
   * 再抄一份就變成 CLAUDE.md 說的「第四個住處」——它一定會過期,而且會用錯誤的
   * 訊息紅(「寶玉池對不起來」,真相是有人在後台改了一格)。
   *
   * 所以這裡改成**讀出貨值**。守衛的價值沒有消失,只是搬家了:
   * 「兩條門必須讀同一份清單」由
   * `packages/shared/src/sim/economy/offerCraftRoleGate.test.ts` 的三條守著
   * (三個突變都驗過會紅);這一條守的仍然是**可達性** ——
   * 出貨設定下,棱彩表裡配得上這位英雄的每一條,寶玉都要真的滾得到。
   */
  const excluded = new Set(DEFAULT_OFFER_EXCLUDED_CRAFT_ROLES);

  it("★ 2400g 寶玉的池子 = 整張表扣掉排除清單擋掉的那些", () => {
    cover("eco-orb-pool-reachable");
    // 寶玉走的是**先濾後抽**(legendaryPool 讀 world.itemEligible),所以它不會
    // 發空卡 —— 但白名單漏掉的東西一樣永遠滾不出來。兩條路都要守。
    //
    // ⭐ 2026-08-04 起兩條路對 craftRole **等價**了。在那之前回合武器卡只過
    // `itemOfferableTo`、寶玉還多一層寫死在 legendaryOrb 裡的 Set,於是 49 支裡
    // 8 支 component **回合卡發得出來、寶玉永遠滾不到** —— 那正是
    // `offerEligibility.ts` 檔頭警告過的「半套修法」,而它自己就是。
    const attackType = attackTypeOf(MELEE_HERO);
    const { fits } = splitByAttackType(attackType);
    const want = fits.filter((id) => !excluded.has(Items.get(id as ItemId).craftRole ?? "")).sort();

    const { world, id } = hero(7, MELEE_HERO);
    world.itemEligible = (itemId) => wl.allowsItem(itemId);
    const pool = (legendaryPool(world, id) as string[]).slice().sort();
    world.itemEligible = null;
    expect(
      pool,
      "傳說寶玉的池子跟棱彩表對不起來 —— 白名單、craftRole 排除清單、" +
        "itemHasEffect 或攻擊型態閘吃掉了本來該滾得到的條目",
    ).toEqual(want);

    // ⭐ owner 2026-08-04:「**49支已經全部都是傳說武器道具，並非原料**」。
    // 那 8 支曾經被標成 `component` 的是 WC3 匯入留下的錯標記（在原作它們是別人的
    // 合成材料，而 GGD 沒有合成系統），資料已改成 "final"。這一條釘住那個內容決定。
    // 突變：把任何一支改回 "component" → 紅。
    expect(
      poolEntries().filter((id) => Items.get(id as ItemId).craftRole === "component"),
      "傳說池裡出現 craftRole:\"component\" —— owner 裁決 49 支全部是武器道具不是原料",
    ).toEqual([]);

    // 近戰英雄唯一滾不到的,只剩攻擊型態不符的那一支。
    expect(
      poolEntries()
        .filter((x) => !pool.includes(x))
        .sort(),
      "寶玉撈不到的條目變了 —— 要重新判這是內容決定還是閘的行為改變",
    ).toEqual(["godie-i012"]);
  });
});
