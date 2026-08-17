/**
 * 任務三選一的抽卡閘 + 天堂之劍的暴擊倍率 —— 行為守衛。
 *
 * ---------------------------------------------------------------------------
 * ① `draftEligible` —— 「代價做了、回報沒做」的道具不該發給玩家
 * ---------------------------------------------------------------------------
 * owner 2026-07-30 立這個欄位時,出貨的兩件任務道具是**淨負面或全空**的:
 * 天堂之劍 godie-i01n 只實作了原作 `AIlz`(生命 -500) + `AIcs`(暴擊),招牌的
 * `AIrc`「魂藏 / 起死回生3次」沒有實作,抽到就是拿血換一點暴擊;仙后座
 * godie-i01s 則是 modifiers=0 passive=0 auras=0,抽到什麼都沒有。解法是
 * **欄位而不是刪除**(CLAUDE.md 第一守則):`item@1.draftEligible`,預設 `true`,
 * 這兩件設 `false`,白名單照舊說它們「存在」,閘在 `offerEligibility`。
 *
 * ⚠️ owner 2026-08-01 把兩件都**修好並重新開啟**了 ——
 * 「請你將我剛剛輸入的 49 項傳說武器道具都實作完，登錄在隨機三選一」:
 *   · 天堂之劍的新文案**整段拿掉了魂藏/復活**,效能只剩「總生命-50%」與
 *     「6%機率造成10倍暴擊傷害」,兩者都已落地(maxHealth pctAdd -0.5 /
 *     critChance 0.06 / critDamage 8.25),所以它不再是純代價卡。
 *   · 仙后座拿到真的 payload(evasion 0.25 / maxMana pctAdd 1.0 / manaRegen 25),
 *     空卡問題消失。
 *   兩件的 `draftEligible: false` 都被移除 —— 而且**整個 content/ 現在一件
 *   關著的道具都沒有**(每件的 `authoringNote` 記著解除的理由)。
 *
 * 所以這一段守的不再是「這兩件發不出來」(那個結論已經被 owner 推翻),而是規則
 * 本身,拆成兩半:
 *   (a) 內容面 ——「有付出東西 ⇔ 發得出來」。對池子裡的每一件量真的 400 次三選
 *       一:付得出東西的必須至少出現一次(這正是 2026-08-01 那次重新開啟的守
 *       衛),純代價/全空的必須一次都不出現。今天 13 件全都付得出東西,所以
 *       前半有 13 條真斷言、後半是空的 —— 因此另外把**偵測器**單獨釘一次,
 *       否則它會是一條永遠綠的斷言(失敗形態④)。
 *       ⚠️ 那個偵測器只看「有沒有正的加成 / passive / auras」,所以它涵蓋的是
 *       **空卡**(仙后座 2026-08-01 之前的真實 payload:三個欄位全缺)與純代價
 *       卡。它**涵蓋不到**當初關掉天堂之劍的理由 —— 那件道具當時同時帶著
 *       生命-500 與兩條正的暴擊加成,靜態看是「有付出」的;真正的問題是文案
 *       承諾的『魂藏/起死回生3次』在 sim 裡沒有原語,那是人工判斷。這個邊界在
 *       「偵測器本身有牙」那條裡釘成了一條會紅的斷言,不是只寫在註解裡。
 *   (b) 引擎面 —— `draftEligible: false` 真的會被 roll 消費。出貨內容已經沒有
 *       關著的道具了,所以這一條改用**合成的**池子與道具跑真的 `offerItems`;
 *       不這樣做的話,把 `offerEligibility` 那一行刪掉整個檔案還是全綠
 *       (失敗形態③ —— 而那正是 2026-07-30 的 M1 原本守住的東西)。
 *       閘仍然在 **roll 之前**,先抽後濾正是 #47 空卡片的成因,所以合成池子
 *       是「4 件裡關掉 1 件、發 3 張」:卡片必須還是滿的 3 張。
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
 * 卡面那一條(文案↔資料)在 2026-08-01 重新瞄準過:新文案寫的是「造成10倍**暴擊
 * 傷害**」而不是舊的「10倍傷害」,代價那一行也從 `flat -500` 變成
 * 「總生命-50%」/ `pctAdd -0.5`。兩個數字現在都是**從文案讀出來再跟資料比**,
 * 不是寫死在測試裡 —— 數值再被調一次不用改這裡,文案與資料吵架仍然會紅。
 *
 * ---------------------------------------------------------------------------
 * 突變紀錄(實跑,數字是量到的)
 * ---------------------------------------------------------------------------
 * M1 `offerEligibility.itemOfferableTo` 拿掉 `if (def.draftEligible === false)`
 *    那一行 → 1 紅(合成池子那條:「draftEligible:false 的道具仍然被發出來了」)。
 * M2 把 `offerItems` 的閘搬到 roll **之後**(先抽 3 張再濾) → 1 紅(卡片被打薄,
 *    量到 minWidth = 2)。這是「閘在 roll 之前」自己的守衛。
 * M3 `content/items/godie-i01s.json` 的 modifiers 整段刪掉(退回 2026-08-01 之前
 *    的空卡) → 2 紅(它付不出東西卻仍然發得出來 + 偵測器那條)。
 * M3b `godie-i01n.json` 補回 `draftEligible: false`(把 owner 2026-08-01 的重新
 *    開啟撤銷) → 1 紅(「付得出東西卻 400 次一張都沒發出來」)。
 * M4 `BasicAttackSystem.ts` 的 `amount *= sc.final[Stat.CritDamage] || 1.75`
 *    改成 `amount *= 1.75`(暴擊倍率寫死回基礎值)→ 1 紅(倍率量到 1.75)。
 * M5 `godie-i01n.json` 的 `critDamage` 改回 48.25 → 2 紅(木樁量到 50.0,卡面
 *    與資料對不上)。這一條就是 owner 那次裁決本身的守衛。
 * M6 `godie-i01n.json` 的 maxHealth `op` 從 `pctAdd` 改回 `flat` → 1 紅
 *    (文案說「總生命-50%」而資料變成 -0.5 點血)。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { registerAll } from "../../content/registries";
import { Champions, Items, LootTables } from "../content/registry";
import type { ItemDef } from "../content/defs";
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

/**
 * 寶具三選一的池子。
 *
 * ⚠️ 2026-08-18：這裡本來是 `quest-rewards`（那張 0g「任務道具」表）。owner 那天
 * 把它整張搬進 `content/_legacy/loot-tables/` —— 「任務道具」的標籤在競技場新玩法
 * **完全不考慮**，那 6 件現在是散在三階寶具池裡的普通寶具。
 * ⇒ 判準改成陳述在**每一張出貨的寶具池**上，⛔ 不是換一張表繼續點名。這比原本強：
 * 「有付出東西 ⇔ 發得出來」本來就該對所有會發到玩家手上的池子成立。
 * ⭐ 兩件被點名的道具（天堂之劍 / 仙后座）2026-08-18 之後分屬**不同的池**，
 * 所以下面找的是「在**某一張**池裡」，⛔ 不是「在這一張池裡」。
 */
const QUEST_TABLES = ["legendary-weapons", "ex-release-weapons", "ex-origin-weapons"];
/** 出貨的三選一寬度。 */
const OFFER_COUNT = 3;

const HEAVEN_SWORD = "godie-i01n" as ItemId; // 天堂之劍
const CASSIOPEIA = "godie-i01s" as ItemId; // 仙后座

/** 合成的抽卡池 —— 只有 (b) 那一條用得到,見檔頭。 */
const SYNTH_TABLE = "test:draft-gate";
const SYNTH_BLOCKED = "test:blocked" as ItemId;
const SYNTH_OPEN: ItemId[] = ["test:open-a", "test:open-b", "test:open-c"] as ItemId[];

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
interface ItemCard {
  id: string;
  name?: string;
  description?: string;
  modifiers?: { stat: string; op?: string; value: number }[];
  passive?: unknown[];
  auras?: unknown[];
  /**
   * 非 modifier 的酬勞欄位。每一個都是**這張卡真的付得出來的東西**,而
   * {@link paysSomething} 看不到它們的話,一件只靠它們付款的道具會被誤判成
   * 「純代價卡」—— 見那個函式上方的警告。
   *
   * `critStrike` 帶著真正的型別(其餘只需要「在不在」),因為下面的暴擊守衛要讀
   * 它的三個數字並跟**文案**比對。
   */
  critStrike?: import("../combat/critStrike").CritStrikeGrant;
  block?: unknown;
  attributes?: unknown;
  sets?: unknown[];
  vision?: unknown;
  flight?: unknown;
  damageTypeOverride?: unknown;
}

let itemDocs: Map<string, ItemCard>;

beforeAll(async () => {
  for (const r of [Champions, Items, LootTables]) r.clear();
  const store = (await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store;
  registerAll(store);
  itemDocs = new Map(store.all<ItemCard>("items").map((d) => [d.id, d]));
});

/**
 * 這張卡**至少付得出一樣東西**嗎? —— 「純代價卡 / 空卡」的偵測器。
 *
 * 全空 = 抽到什麼都沒有(仙后座 2026-08-01 之前);只剩負的加成 = 抽到只有代價
 * (天堂之劍 2026-08-01 之前)。兩種都是「不是選擇,是懲罰」。
 *
 * ⚠️ `value > 0` 之所以能直接當成「好處」,是因為 `Stat` 這個 enum 裡**每一條
 * 都是越高越好**(沒有「冷卻秒數」這種越低越好的屬性 —— `cdr` 是減免比例)。
 * 哪天加進一條反向屬性,這個判準要跟著改,而不是靜靜地誤判。
 * passive/auras 一律當成「有付出」:它們的內容是掛鉤,好壞不是這裡能靜態判的。
 *
 * ⚠️⚠️ **這個列表必須跟著 `item@1` 的酬勞欄位一起長,而漏掉一個是靜默的。**
 * 2026-08-01 抓到過一次:天堂之劍的暴擊從 `critChance`/`critDamage` 兩條
 * modifier 搬到 `item@1.critStrike`(sim/combat/critStrike.ts),這個偵測器沒有
 * 跟著改,於是一件**變強了**的武器被判成「純代價卡」,而上面那條斷言的結論會是
 * 「它不該被發出去」—— 一個 100% 反向的誤判。
 * 判準是:凡是 `sim/economy/itemSource.ts` `itemModifierSource` 會轉發出去的
 * `ItemDef` 欄位,都是「付得出來的東西」,都要列在這裡。
 */
function paysSomething(doc: ItemCard): boolean {
  return (
    (doc.passive?.length ?? 0) > 0 ||
    (doc.auras?.length ?? 0) > 0 ||
    (doc.sets?.length ?? 0) > 0 ||
    doc.critStrike !== undefined ||
    doc.block !== undefined ||
    doc.attributes !== undefined ||
    doc.vision !== undefined ||
    doc.flight !== undefined ||
    doc.damageTypeOverride !== undefined ||
    (doc.modifiers ?? []).some((m) => m.value > 0)
  );
}

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
    for (const table of QUEST_TABLES) {
      const offer = offerItems(world, id, table, OFFER_COUNT);
      minWidth = Math.min(minWidth, offer.choices.length);
      for (const itemId of offer.choices) seen.add(itemId as string);
    }
  }
  return { seen, minWidth };
}

// ===========================================================================
// ① 抽卡閘
// ===========================================================================
describe("draftEligible —— 有付出東西 ⇔ 發得出來 (eco-draft-eligible)", () => {
  it("★ 400 次任務三選一:付得出東西的每一件都發得出來,純代價/空卡一件都發不出來", () => {
    cover("eco-draft-eligible");
    // ⚠️ RE-AIMED 2026-08-01。這一條原本斷言的是「天堂之劍與仙后座一次都沒被
    // 發出來」;owner 那天把兩件都補完並重新開啟,所以那個結論本身被推翻了 ——
    // 現在守的是它背後的規則,而且**兩個方向都守**:
    //   · 付得出東西的 → 必須真的發得出來(擋住「有人又把好卡默默關掉」,
    //     也就是 2026-08-01 那次重新開啟的守衛);
    //   · 付不出東西的 → 一次都不准出現(原本那條規則,只是不再點名兩件道具)。
    const table = QUEST_TABLES.flatMap((t) =>
      LootTables.get(t).entries.map((e) => e.itemId as string),
    );
    // 兩件仍然要在**某一張**池子的內容裡:被移出所有表 = 刪除,不是開關(而且下面
    // 的斷言會因為「表裡本來就沒有」而空綠 —— 失敗形態④)。
    expect(table, "沒有任何一張寶具池含天堂之劍 —— 那就變成刪除而不是開關了").toContain(HEAVEN_SWORD);
    expect(table, "沒有任何一張寶具池含仙后座 —— 那就變成刪除而不是開關了").toContain(CASSIOPEIA);

    const { seen } = questCards(400);
    // ⚠️ 攻擊型態閘不是「被誰擋住了」——`requiresAttackType` 對不上的道具**依設計**
    // 發不到這支英雄手上（`economy/offerEligibility.ts`）。取樣英雄是固定的一支近戰，
    // 所以先把型態不合的剔掉，⛔ 否則這條會把一個正確的過濾器報成缺陷。
    const heroType = Champions.get(HERO).attackType;
    for (const id of table) {
      const doc = itemDocs.get(id);
      expect(doc, `${id} 在寶具池裡卻沒有 item@1 文件`).toBeDefined();
      const needs = (doc as { requiresAttackType?: string }).requiresAttackType;
      if (needs !== undefined && needs !== heroType) continue;
      const pays = paysSomething(doc!);
      expect(
        seen.has(id),
        pays
          ? `${id} (${doc!.name}) 付得出東西卻 400 次一張都沒發出來 —— 被誰擋住了?`
          : `${id} (${doc!.name}) 什麼都沒給,卻仍然會被發到玩家的三選一卡上`,
      ).toBe(pays);
    }
  });

  it("★ 偵測器本身有牙 —— 而且它抓不到的那一半也一起釘住", () => {
    // 上面那條的「純代價」分支今天是空的(13 件全都付得出東西),空分支等於一條
    // 永遠綠的斷言。所以把偵測器釘在具體 payload 上,跟 itemTiers.test.ts 用
    // godie-i00w 的重複區塊釘 `duplicatedBlock` 同一招。

    // ① 空卡 —— 這一份是**真的出過貨的**:2026-08-01 之前的仙后座整份文件裡
    //    modifiers / passive / auras 三個欄位一個都不存在
    //    (`git show HEAD:content/items/godie-i01s.json`,理由寫在它當時的
    //    authoringNote)。抽到它什麼都拿不到,這正是 owner 2026-07-30 關掉它的
    //    原因,也是這個偵測器唯一有實戰紀錄的形態。
    const shippedEmptyCard: ItemCard = { id: CASSIOPEIA };
    expect(paysSomething(shippedEmptyCard), "空卡被判成『有付出』").toBe(false);

    // ② 純代價卡 —— 這一份是**合成的**,而且必須標明,因為出貨史上還沒有過。
    //    「只有負的加成、沒有 passive/auras」是規則的另一半,先把牙釘上。
    const syntheticPureCost: ItemCard = {
      id: "test:pure-cost",
      modifiers: [{ stat: Stat.MaxHealth, op: ModOp.Flat, value: -500 }],
    };
    expect(paysSomething(syntheticPureCost), "純代價卡被判成『有付出』").toBe(false);

    // ③ ⚠️ 覆蓋範圍的邊界,釘成一條會紅的斷言而不是一句註解。
    //    2026-08-01 之前的天堂之劍**不是**這個偵測器抓得到的形態:它真的出貨的
    //    modifiers 是 生命-500 **加上** critChance 0.06 與 critDamage 8.25 兩條
    //    正的(`git show HEAD:content/items/godie-i01n.json`),所以
    //    `paysSomething` 對它回 true。它當初被關掉的理由是別的 ——
    //    「代價實作了、回報沒實作」:招牌的『魂藏/起死回生3次』(原作 AIrc)在 sim
    //    裡沒有原語,而文案照樣承諾。那是一個「文案答應的機制有沒有落地」的人工
    //    判斷,從 item 文件本身靜態看不出來,今天記在該道具的 authoringNote
    //    【仍缺】欄位與 `draftEligible` 開關上,不在這個函式裡。
    //    把它釘成 true 是為了讓這個邊界不能被誤讀成「都涵蓋了」——哪天有人把
    //    `paysSomething` 改成剛好對它回 false,這一行會紅,他就得正面處理這件事
    //    而不是以為順手補強了。
    const shippedHeavenSwordBefore: ItemCard = {
      id: HEAVEN_SWORD,
      modifiers: [
        { stat: Stat.MaxHealth, op: ModOp.Flat, value: -500 },
        { stat: Stat.CritChance, op: ModOp.Flat, value: 0.06 },
        { stat: Stat.CritDamage, op: ModOp.Flat, value: 8.25 },
      ],
    };
    expect(
      paysSomething(shippedHeavenSwordBefore),
      "偵測器現在宣稱抓得到 2026-08-01 之前的天堂之劍 —— 它抓不到,那次是人工判斷",
    ).toBe(true);

    // ④ …而今天出貨的兩件都必須是「有付出」的,否則上面那條會用錯分支去斷言。
    expect(paysSomething(itemDocs.get(HEAVEN_SWORD)!), "天堂之劍今天沒有任何正向回報").toBe(true);
    expect(paysSomething(itemDocs.get(CASSIOPEIA)!), "仙后座今天仍然是空卡").toBe(true);
  });

  it("★ 關掉的道具真的抽不到,而且卡片仍然是滿的三張(閘在 roll 之前)", () => {
    // ⚠️ 這一條 2026-08-01 之後只能用**合成**內容:owner 把僅有的兩件關著的
    // 道具都打開了,出貨的 content/ 現在一件 `draftEligible: false` 都沒有,所以
    // 拿真資料跑的話,把 `offerEligibility` 那一行刪掉會全綠(失敗形態③ ——
    // 功能可以整個撤銷而測試不動)。
    //
    // 池子 4 件、關掉 1 件、發 3 張:
    //   · 被關掉的那件一次都不准出現           → 欄位真的被消費
    //   · 卡片每一次都必須是滿的 3 張           → 閘跑在 roll 之前
    //     (先抽後濾的話 3 張裡混到那件就會被濾成 2 張 —— #47 空卡片的成因)
    const mk = (id: ItemId, draftEligible?: boolean): ItemDef => ({
      id,
      name: `synthetic ${id}`,
      cost: 0,
      tier: 1,
      tags: [],
      modifiers: [{ stat: Stat.AttackDamage, op: ModOp.Flat, value: 1 }],
      ...(draftEligible === undefined ? {} : { draftEligible }),
    });
    Items.register(SYNTH_BLOCKED, mk(SYNTH_BLOCKED, false));
    for (const id of SYNTH_OPEN) Items.register(id, mk(id));
    LootTables.register(SYNTH_TABLE, {
      id: SYNTH_TABLE,
      entries: [SYNTH_BLOCKED, ...SYNTH_OPEN].map((itemId) => ({ itemId, weight: 1 })),
    });

    const seen = new Set<string>();
    let minWidth = Number.POSITIVE_INFINITY;
    for (let seed = 1; seed <= 200; seed++) {
      const { world, id } = solo(seed);
      const offer = offerItems(world, id, SYNTH_TABLE, OFFER_COUNT);
      minWidth = Math.min(minWidth, offer.choices.length);
      for (const itemId of offer.choices) seen.add(itemId as string);
    }
    expect(seen.has(SYNTH_BLOCKED), "draftEligible:false 的道具仍然被發出來了").toBe(false);
    expect([...seen].sort(), "沒被關掉的三件應該全部發得出來").toEqual([...SYNTH_OPEN].sort());
    expect(minWidth, "卡片被打薄了 —— 閘跑在 roll 之後").toBe(OFFER_COUNT);
  });

  it("★ 出貨的任務池也一樣是滿的三張(不是把三選一縮成二選一)", () => {
    // 合成池子證明的是「閘不會打薄卡片」;這一條證明**真的那個池子**今天也發得
    // 滿 —— 池子被砍到剩兩件、或哪天又有人把一半關掉,都會在這裡紅。
    expect(questCards(400).minWidth).toBe(OFFER_COUNT);
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
 * 一名英雄 + 一個貼在面前、每 tick 被補滿血的木樁,揮 N 刀,把每一刀真的打掉的
 * 血、以及每一次吸血回的血,原原本本收回來。
 *
 * ⚠️ 2026-08-01 重寫,而且是**必須**重寫:天堂之劍的 10 倍不再是
 * `Stat.CritDamage` 的一個差值,而是 `item@1.critStrike` 自己的一次 proc
 * (sim/combat/critStrike.ts)。舊版用 `critChance flat +1` 把英雄推到必爆,再量
 * 「必爆 ÷ 絕不爆」—— 那個做法在新語意下量到的是 **1.75**,因為 `empowers`
 * 的出貨值是 `"ownProcOnly"`:英雄自己骰出來的暴擊**不吃**這件武器的倍率。
 * 那正是這一批要表達的設計(一個堆滿暴擊率的英雄不會整場 10 倍),所以量法要跟
 * 著改成「讓它自己 proc」,不是把設計改回來遷就測試。
 *
 * 英雄自己的暴擊率被推到 **0**(flat −1,`Stat.CritChance` 夾在 [0,1]),所以
 * 場上出現的每一次 `crit: true` 都只可能來自這件武器 —— 這是「比值 = 10」這句
 * 話成立的前提,不是方便。
 *
 * 攻擊者的血被壓在 1 點,吸血才回得進去(滿血的人回多少都是 0,那會讓
 * 「回滿傷害」這一半變成一條永遠綠的斷言)。
 */
interface Swings {
  /** 每一發 origin:"basic" 的傷害,依序。 */
  hits: { amount: number; crit: boolean }[];
  /** 每一次 origin:"lifesteal" 回到攻擊者身上的量,依序。 */
  lifesteal: number[];
}

function swings(ticks: number): Swings {
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
    id: "t:nocrit",
    kind: "buff",
    modifiers: [{ stat: Stat.CritChance, op: ModOp.Flat, value: -1 }],
  });
  recomputeStats(world, attacker);

  const out: Swings = { hits: [], lifesteal: [] };
  const dummyPos = { ...world.transform.get(dummy)!.pos };
  for (let i = 0; i < ticks; i++) {
    const hp = world.health.get(dummy)!;
    hp.hp = hp.maxHp; // 木樁永遠站著、永遠滿血
    world.health.get(attacker)!.hp = 1; // 吸血才有地方回
    world.transform.get(dummy)!.pos = { ...dummyPos };
    world.nav.get(attacker)!.attackTarget = dummy;
    world.step(new Map());
    for (const e of world.events) {
      if (e.type === "damage") {
        const d = e.data as { source: number; origin?: string; amount: number; crit?: boolean };
        if (d.source !== (attacker as unknown as number) || d.origin !== "basic") continue;
        out.hits.push({ amount: d.amount, crit: d.crit === true });
      } else if (e.type === "heal") {
        const h = e.data as { target: number; origin?: string; amount: number };
        if (h.target !== (attacker as unknown as number) || h.origin !== "lifesteal") continue;
        out.lifesteal.push(h.amount);
      }
    }
  }
  return out;
}

describe("天堂之劍是 10 倍暴擊,不是 50 倍 (eco-heaven-sword-crit)", () => {
  it("★ 名冊的基礎暴擊倍率真的是 1.75(它是「一般暴擊」那一端的對照組)", () => {
    cover("eco-heaven-sword-crit");
    const bases = [...new Set(Champions.all().map((c) => c.baseStats[Stat.CritDamage]))];
    expect(bases, "英雄名冊對基礎暴擊倍率不一致 —— 對照組就沒有唯一解了").toEqual([CRIT_BASE]);
  });

  it("★ proc 的那一刀 ÷ 平常那一刀 = 10.0(讀木樁掉的血,不是讀欄位)", () => {
    const s = swings(4000);
    expect(s.hits.length, "4000 tick 之內一刀都沒打出去 —— 木樁站錯地方了").toBeGreaterThan(20);

    const proc = s.hits.filter((h) => h.crit);
    const plainHits = s.hits.filter((h) => !h.crit);
    // 英雄自己的暴擊率被推到 0,所以場上每一次 crit 都是這件武器 proc 的。
    expect(proc.length, "一次都沒 proc —— 6% × 這麼多刀,種子挑錯了").toBeGreaterThan(0);
    expect(plainHits.length, "每一刀都 proc —— 機率沒有被讀到").toBeGreaterThan(0);

    const plain = plainHits[0]!.amount;
    expect(plain, "非暴擊那一刀是 0 —— 比值沒有意義").toBeGreaterThan(0);
    for (const p of proc) {
      expect(p.amount / plain, "proc 的一刀不是 10 倍").toBeCloseTo(HEAVEN_SWORD_CRIT, 6);
    }
    // 反向釘死 owner 推翻掉的那個值:50 倍是 w3x 的原值,不是出貨值。
    expect(proc[0]!.amount / plain).not.toBeCloseTo(CRIT_BASE + 48.25, 3);
    // 而且**沒有** proc 的那一刀吃的是英雄自己的暴擊(這裡是 0 暴擊率,所以就是
    // 平砍)—— `empowers: "ownProcOnly"` 的整個意思。少了這一條,一個把
    // `empowers` 悄悄改成 `everyCrit` 的改動不會被抓到。
    for (const h of plainHits) expect(h.amount).toBeCloseTo(plain, 6);
  });

  it("★ proc 的那一刀吸滿:回的血 = 那一刀真的打掉的血", () => {
    const s = swings(4000);
    const proc = s.hits.filter((h) => h.crit);
    expect(proc.length, "一次都沒 proc").toBeGreaterThan(0);
    // 文案:「暴擊時吸血回復100%傷害」。lifestealFraction = 1,而基數是**真的從
    // 血條掉下來的量** —— 木樁沒有護盾也沒有格擋,所以那就是 damage 事件的 amount。
    //
    // ⚠️ 這一條是這一批唯一能抓到「近戰接了、遠程沒接」的守衛的近戰半邊:
    // `critLifesteal` 少掛在封包上,回血就會退回英雄自己的 `Stat.Lifesteal`
    // (sela = 0),於是 `lifesteal` 陣列直接是空的。
    expect(s.lifesteal.length, "proc 了卻一次都沒吸到血 —— critLifesteal 沒有到達傷害佇列").toBeGreaterThan(0);
    const biggest = Math.max(...s.lifesteal);
    const biggestProc = Math.max(...proc.map((h) => h.amount));
    expect(biggest, "吸回的血不等於那一刀的傷害").toBeCloseTo(biggestProc, 6);
  });

  it("★ 卡面文案與資料一致 —— 暴擊那一行,與「總生命-％」那一行", () => {
    // 玩家在三選一/背包上讀到的是這兩行。文案與資料分兩個地方存,語意改了而文案
    // 沒改就是謊話(CLAUDE.md 第三守則)。這裡把兩邊綁在一起。
    //
    // ⚠️ RE-AIMED 2026-08-01(第二次):這一行的資料從 `modifiers` 搬到
    // `critStrike`,理由見 sim/combat/critStrike.ts ①。數字仍然是從**文案**讀出來
    // 再跟資料比,沒有寫死。
    const doc = itemDocs.get(HEAVEN_SWORD)!;
    const text = doc.description ?? "";
    const m = /(\d+(?:\.\d+)?)\s*[%％]機率造成\s*(\d+(?:\.\d+)?)\s*倍(?:暴擊)?傷害/.exec(text);
    expect(m, "天堂之劍的描述不再包含暴擊那一行").not.toBeNull();
    const cs = doc.critStrike;
    expect(cs, "天堂之劍沒有 critStrike —— 那一行文案沒有任何資料在付").toBeDefined();
    expect(Number(m![1]) / 100).toBeCloseTo(cs!.chance, 6);
    expect(cs!.damageMult, "damageMult 是**總**倍率,不是差值").toBeCloseTo(Number(m![2]), 6);
    expect(Number(m![2])).toBeCloseTo(HEAVEN_SWORD_CRIT, 6);
    // 「暴擊時吸血回復100%傷害」—— 文案的另一半也要有人付。
    expect(text).toContain("暴擊時吸血回復100%傷害");
    expect(cs!.lifestealFraction, "文案說回復 100%").toBeCloseTo(1, 6);
    // 舊表示法必須真的消失:兩者並存 = 12% 暴擊率,而且一半還是舊語意。
    expect(
      (doc.modifiers ?? []).some((x) => x.stat === Stat.CritChance || x.stat === Stat.CritDamage),
      "critStrike 與舊的 critChance/critDamage 並存",
    ).toBe(false);

    // 代價那一行。owner 2026-08-01 把 `flat -500` 改成「總生命-50%」/
    // `pctAdd -0.5` —— 出貨文案裡「總生命」是**比例**、「生命」才是點數
    // (見 tools/legendary-status/status.py 的標籤對照),所以 op 打成 flat 的話
    // 卡面說「少一半血」而實際只少 0.5 點,是一個純靜默的謊。
    const hpText = /總生命\s*-\s*(\d+(?:\.\d+)?)\s*[%％]/.exec(text);
    expect(hpText, "天堂之劍的描述不再包含『總生命-％』那一行").not.toBeNull();
    const hp = (doc.modifiers ?? []).find((x) => x.stat === Stat.MaxHealth);
    expect(hp, "文案寫了總生命的代價,資料裡卻沒有 maxHealth 那一條").toBeDefined();
    expect(hp!.op, "「總生命-％」是比例,不是點數").toBe(ModOp.PercentAdd);
    expect(hp!.value).toBeCloseTo(-Number(hpText![1]) / 100, 6);
  });
});
