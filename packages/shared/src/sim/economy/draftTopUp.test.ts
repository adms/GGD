/**
 * 三選一到底有沒有三張 —— GH#249 的行為守衛（sim 這一層）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * owner 的診斷對了一半，而錯的那一半決定了守衛要斷言什麼
 * ════════════════════════════════════════════════════════════════════════════
 * owner 2026-08-01:「傳說武器有時候只有跳出一個而不是三選一」。issue 上寫的
 * 機制是「draft 是 roll-before-filter」。**`offerItems` 從來就不是** —— 它一直
 * 是先濾（已持有 + `itemOfferableTo`）再抽。roll-before-filter 的是**呼叫端**：
 *
 *     const offer = offerItems(world, entity, table, 3);        // MatchController
 *     offer.choices = this.whitelist.filterItems(offer.choices); // ← 這一行削卡
 *
 * 也就是說營運白名單這一道閘站錯了位置。49 條的池子、白名單只放行 W 條時，
 * 玩家看到的卡片長度是 3·W/49 的期望值 —— 而且**時有時無**，因為它取決於骰子
 * 剛好抽到哪幾條。
 *
 * 所以修法是把白名單搬進 `eligibleItemPool`（傳說寶玉一直都是這樣做的），而
 * 這一支測的是搬進去之後的**卡片**：
 *
 *   · 候選池夠大 → 卡片一定是滿的，**而且不隨候選池變小而變薄**（原缺陷）；
 *   · 候選池真的耗盡 → 三種 `shortPoolMode` 各自的合約；
 *   · 同一顆種子跑兩次 → 同樣三張（決定性）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼用 `world.itemEligible` 縮池子，而不是自己捏一張小 loot table
 * ════════════════════════════════════════════════════════════════════════════
 * 捏一張 3 條的表可以測「3 條抽 3 張」，但它測不到**缺陷本身**：缺陷是
 * 「表有 49 條、可用的只有幾條」。`world.itemEligible` 就是 MatchController
 * 餵給 sim 的那個白名單謂詞（`MatchController` 建構子裡
 * `this.whitelist.bypass ? null : (id) => this.whitelist.allowsItem(id)`），
 * 所以這裡縮的是**出貨那條路上真正會縮的東西**，用的是出貨的
 * `content/loot-tables/legendary-weapons.json` 整張表。
 *
 * ⚠️ 這一支**不**斷言 `topUp() 回傳 3 個** 這種東西（CLAUDE.md 失敗形態 ⑦：
 * 斷言輔助函式的屬性）。每一條讀的都是 `offerItems(...).choices` —— 玩家會看到
 * 的那張卡。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 突變紀錄 —— 每一條都**實跑過**，紅燈數字是數出來的（2026-08-01）
 * ════════════════════════════════════════════════════════════════════════════
 * M1 `economy/draft.eligibleItemPool` 拿掉白名單那一行
 *    （`if (allow !== null && !allow(e.itemId)) continue;`）→ 本檔 **4 紅**：
 *    「白名單只放行 6/49」「49 縮到 3」「卡面只含可用條目」「short 合約」。
 *    這一行就是 GH#249 的修法本身。
 * M2 把舊順序搬回 `offerItems`（`eligibleItemPool` 拿掉白名單 + 抽完之後用
 *    `world.itemEligible` 濾一次）→ 本檔 **5 紅**：上面四條裡的三條長度斷言，
 *    加上 duplicate / fallback 兩條合約（它們的前置池子也被削掉了）。
 *    ⚠️「卡面只含可用條目」在 M2 底下**仍然綠** —— 先抽後濾確實會把不可用的
 *    清掉，它只是同時把卡面清空。兩組斷言因此各守各的：一組看長度，一組看內容，
 *    缺任何一組都會讓另一半的缺陷溜過去。
 * M3 `offerItems` 的 `duplicate` 補滿迴圈刪掉 → **1 紅**（duplicate 合約），
 *    `short` / `fallback` 仍綠。
 * M4 `offerItems` 的 `fallback` 分支刪掉 → **1 紅**（fallback 合約）。
 * M5 `drawInto` 的 `working.splice(idx, 1)` 刪掉（變成有放回抽樣）→ **3 紅**：
 *    「三張互不相同」、`short`（一條可用時會被抽成三張同款）、`fallback`
 *    （主池那件會重複佔滿卡面）。
 * M6 `offerItems` 的 `const budget = Math.max(1, Math.trunc(policy.maxDraws))`
 *    改成 `Number.MAX_SAFE_INTEGER`（等於不讀那一格）→ **1 紅**（maxDraws）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../testkit/cover";
import { ContentLoader, registerAll } from "../../content";
import { FsContentSource } from "../../content/node";
import { LootTables } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";
import { offerItems, DEFAULT_ITEM_DRAFT_POLICY, type ItemDraftPolicy } from "./draft";

const TAG = "eco-draft-topup";
const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");

/** 出貨的棱彩池 + 出貨的卡片寬度（`content/config/arena-rules.json` offerCount）。 */
const POOL = "legendary-weapons";
// ⚠️ 2026-08-18：備援表本來是 `quest-rewards`，owner 那天把它整張搬進
// `content/_legacy/loot-tables/`。改用 `[EX解放]` 那一階 —— 它跟主池
// **完全不相交**（owner「一件寶具只屬於一個池」），所以「借到的」與「本來就抽得到的」
// 分得比以前更乾淨。
const FALLBACK_POOL = "ex-release-weapons";
const CARD = 3;

/**
 * 一支**近戰**英雄。攻擊型態要固定，否則 `requiresAttackType` 會讓「可用條目
 * 有幾條」隨取樣英雄浮動，而這一支的每一條都在數那個數字。
 */
const HERO = "godie-e002" as ChampionId; // 亞瑟王 - Saber (melee)

let poolIds: string[] = [];

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  poolIds = LootTables.get(POOL).entries.map((e) => e.itemId as string);
});

/** 一名英雄，站在第一個決鬥區 —— 發一張卡只需要一個 `ChampionComp`。 */
function hero(seed: number): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, seed);
  const c = SKELETON_ARENA.zones[0]!.center;
  const id = spawnChampion(world, {
    championId: HERO,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x, z: c.z },
    zone: 0,
  });
  return { world, id };
}

/**
 * 出貨的一張回合武器卡，白名單只放行 `allowed`。
 *
 * `world.itemEligible` 的接法**逐字**照 `MatchController` 的建構子：
 * bypass 時是 `null`，否則是「這個 id 在不在白名單裡」。
 */
function card(seed: number, allowed: readonly string[], policy = DEFAULT_ITEM_DRAFT_POLICY): ItemId[] {
  const set = new Set(allowed);
  const { world, id } = hero(seed);
  world.itemEligible = (itemId) => set.has(itemId as string);
  return offerItems(world, id, POOL, CARD, policy).choices;
}

describe("候選池縮小，卡片不准跟著縮水 (eco-draft-topup)", () => {
  it("★ 白名單只放行 6 / 49 條時，200 張卡每一張都還是三張", () => {
    cover(TAG);
    // 這就是 owner 打的那一場。舊的先抽後濾在同樣條件下每張卡的期望長度是
    // 3 × 6/49 ≈ 0.37 —— 也就是大部分卡片是空的或只有一張。
    const allowed = poolIds.slice(0, 6);
    const thin: string[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      const c = card(seed, allowed);
      if (c.length !== CARD) thin.push(`seed ${seed}: ${c.length} 張 [${c.join(", ")}]`);
    }
    expect(
      thin.slice(0, 6),
      `${thin.length}/200 張卡不是 ${CARD} 張 —— 白名單擋掉的條目又在削卡面了`,
    ).toEqual([]);
  });

  it("★ 候選池從 49 一路縮到 3，卡片寬度一格都不能掉", () => {
    cover(TAG);
    // 原缺陷的形狀是「可用的越少、卡面越薄」。這一條直接對著那個相關性：
    // 池子縮到只剩 CARD 條時，卡片**仍然**是 CARD 張。
    for (const size of [49, 24, 12, 6, 4, 3]) {
      const allowed = poolIds.slice(0, size);
      for (let seed = 1; seed <= 40; seed++) {
        const c = card(seed, allowed);
        expect(c.length, `可用 ${size} 條時 seed ${seed} 的卡片只有 ${c.length} 張`).toBe(CARD);
      }
    }
  });

  it("★ 卡面上的每一張都必須是白名單放行的，而且三張互不相同", () => {
    cover(TAG);
    const allowed = poolIds.slice(0, 8);
    const set = new Set(allowed);
    for (let seed = 1; seed <= 120; seed++) {
      const c = card(seed, allowed);
      for (const itemId of c) {
        expect(set.has(itemId as string), `seed ${seed} 發出了沒放行的 ${itemId}`).toBe(true);
      }
      expect(new Set(c).size, `seed ${seed} 的卡片有重複：[${c.join(", ")}]`).toBe(c.length);
    }
  });
});

describe("候選池真的耗盡時的三種合約 (eco-draft-topup)", () => {
  it("★ short（出貨值）：只剩一條可用時就發一張 —— 誠實地短，不是被削短", () => {
    cover(TAG);
    // ⚠️ 這一條跟上面兩條**不衝突**。上面是「有得抽卻沒抽滿」（缺陷），
    // 這一條是「真的只剩一條」（內容事實）。出貨值選 short 就是不替 owner
    // 決定要不要拿別的東西填。
    for (let seed = 1; seed <= 20; seed++) {
      expect(card(seed, poolIds.slice(0, 1))).toHaveLength(1);
      expect(card(seed, poolIds.slice(0, 2))).toHaveLength(2);
      expect(card(seed, [])).toHaveLength(0);
    }
  });

  it("★ duplicate：只剩一條可用時補成三張，而且補的是同一件", () => {
    cover(TAG);
    const policy: ItemDraftPolicy = { ...DEFAULT_ITEM_DRAFT_POLICY, shortPoolMode: "duplicate" };
    const only = poolIds[0]!;
    for (let seed = 1; seed <= 20; seed++) {
      const c = card(seed, [only], policy);
      expect(c, `seed ${seed}`).toEqual([only, only, only]);
    }
    // 一張都抽不到時 duplicate 沒有東西可以複製 —— 補不出無中生有的卡。
    expect(card(1, [], policy)).toHaveLength(0);
  });

  it("★ fallback：只剩一條可用時從第二張表借滿三張，借來的也要過白名單", () => {
    cover(TAG);
    const fallbackIds = LootTables.get(FALLBACK_POOL).entries.map((e) => e.itemId as string);
    // 借得到的必須是備援表**獨有**的條目，否則「借到」和「本來就抽得到」分不開。
    const onlyInFallback = fallbackIds.filter((id) => !poolIds.includes(id));
    expect(
      onlyInFallback.length,
      `${FALLBACK_POOL} 已經是 ${POOL} 的子集，換一張備援表`,
    ).toBeGreaterThan(0);

    const policy: ItemDraftPolicy = {
      ...DEFAULT_ITEM_DRAFT_POLICY,
      shortPoolMode: "fallback",
      fallbackTable: FALLBACK_POOL,
    };
    const primary = poolIds[0]!;
    const allowed = [primary, ...onlyInFallback];
    for (let seed = 1; seed <= 40; seed++) {
      const c = card(seed, allowed, policy);
      expect(c, `seed ${seed} 沒有借滿`).toHaveLength(CARD);
      expect(c[0], `seed ${seed} 的第一張不是主池那件`).toBe(primary);
      expect(new Set(c).size, `seed ${seed} 借出了重複的：[${c.join(", ")}]`).toBe(CARD);
      for (const itemId of c.slice(1)) {
        expect(onlyInFallback.includes(itemId as string), `${itemId} 不是從備援表借的`).toBe(true);
      }
    }
    // 備援表本身被白名單擋光時，fallback 退化成 short —— 不會憑空生出卡片。
    expect(card(1, [primary], policy)).toEqual([primary]);
  });
});

describe("決定性 (eco-draft-topup)", () => {
  it("★ 同一顆種子跑兩次，三張卡逐張相同（含 fallback 這條較長的路徑）", () => {
    cover(TAG);
    const allowed = poolIds.slice(0, 10);
    const fallback: ItemDraftPolicy = {
      ...DEFAULT_ITEM_DRAFT_POLICY,
      shortPoolMode: "fallback",
      fallbackTable: FALLBACK_POOL,
    };
    for (let seed = 1; seed <= 60; seed++) {
      expect(card(seed, allowed), `seed ${seed} 兩次不一樣`).toEqual(card(seed, allowed));
      const one = poolIds.slice(0, 1);
      expect(card(seed, one, fallback), `seed ${seed} 的 fallback 兩次不一樣`).toEqual(
        card(seed, one, fallback),
      );
    }
    // 不同種子真的會給不同的卡 —— 否則上面那條在「永遠回同一張卡」的實作下
    // 也會過（vacuous）。
    const cards = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) cards.add(card(seed, allowed).join("|"));
    expect(cards.size, "60 顆種子只長出一種卡片，rng 沒有真的在抽").toBeGreaterThan(5);
  });

  it("★ maxDraws 是硬上界：設成 1 的話一張卡最多只抽得到一張", () => {
    cover(TAG);
    // 這一格存在的理由是「病態的池子不能空轉」。它擋不住任何今天的情形
    // （不放回抽樣本來就會終止），所以守的是它**真的被讀了**：讀不到的話
    // 這一條會拿到三張。
    const policy: ItemDraftPolicy = { ...DEFAULT_ITEM_DRAFT_POLICY, maxDraws: 1 };
    for (let seed = 1; seed <= 20; seed++) {
      expect(card(seed, poolIds, policy), `seed ${seed}`).toHaveLength(1);
    }
  });
});
