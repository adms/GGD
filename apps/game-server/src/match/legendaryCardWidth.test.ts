/**
 * 傳說武器三選一真的有三張嗎 —— GH#249，跑**出貨的整條路**。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 這一支和 sim 那一支（`economy/draftTopUp.test.ts`）守的不是同一件事
 * ════════════════════════════════════════════════════════════════════════════
 * sim 那一支直接呼叫 `offerItems`，自己接 `world.itemEligible`。它擋得住
 * 「抽卡邏輯壞了」，**擋不住**「MatchController 又在卡片抽完之後濾一次」——
 * 而後者就是 owner 2026-08-01 打到的那個缺陷本身：
 *
 *     const offer = offerItems(this.world, entity, grant.weaponLootTable, 3);
 *     offer.choices = this.whitelist.filterItems(offer.choices);   // ← 削卡
 *
 * 所以這一支用**真的 `MatchController`**、真的
 * `content/config/arena-rules.json`、真的 `Whitelist` 類別，跑到真的第 2 回合
 * 中場，然後讀 `ctl.offers` —— 也就是 `net/snapshot.ts` 投影給玩家的那個東西。
 * 任何人把那條 post-filter 加回來（或加一條新的），這裡就紅。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼白名單刻意只放行 6 條而不是整張表
 * ════════════════════════════════════════════════════════════════════════════
 * 出貨的 `starter.go` 現在放行整張 49 條表，所以**用出貨白名單跑，先抽後濾和
 * 先濾後抽會給出一模一樣的結果** —— 一條用出貨白名單寫的測試對這個缺陷是瞎的
 * （CLAUDE.md 失敗形態 ④：斷言方向跟缺陷無關）。
 *
 * 而線上真正發生的事正是「白名單比表小」：`data/curation/whitelist.json` 是
 * 一次性 seed 的耐久檔，owner 2026-08-01 把池子從 24 條擴成 49 條之後，那份
 * 檔案不會自己長出新的 25 條。所以這裡把白名單縮小，重現的是**線上的狀態**，
 * 不是一個假想。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 突變紀錄 —— 每一條都**實跑過**，包括一條「以為會紅、實際是綠」的
 * ════════════════════════════════════════════════════════════════════════════
 * M1 **只**把 post-filter 加回來（`offerItems(...)` 之後補一行
 *    `offer.choices = this.whitelist.filterItems(offer.choices);`）
 *    → 本檔 **全綠**。
 *
 *    ⚠️ 這一條先寫成「會 2 紅」，實跑之後改掉 —— 因為它是**錯的**，而
 *    CLAUDE.md 第二守則點名過這個形態（宣稱某突變會紅、但沒跑）。原因很實在：
 *    白名單已經在 roll 之前擋掉不可用的條目，所以事後再濾一次**一個都濾不掉**，
 *    是無害的 no-op。這一支守的是**順序**，不是「有沒有第二道過濾」。
 *
 * M2 `sim/economy/draft.eligibleItemPool` 拿掉白名單那一行
 *    （`if (allow !== null && !allow(e.itemId)) continue;`）
 *    → **1 紅**：「卡面每一張都在白名單裡」（玩家會拿到沒開的武器）。寬度那兩條
 *    仍綠 —— 沒有任何過濾時卡片當然是滿的，只是內容不合法。
 * M3 M2 **加上** M1（= GH#249 之前逐字的出貨程式碼：白名單只在 roll 之後跑）
 *    → 本檔 **2 紅**：「每一張武器卡都是 offerCount 張」與
 *    「白名單從 49 縮到 6，卡片寬度完全不動」。對照組那條仍綠。
 *    這就是 owner 打到的那一場，而這兩條就是他看到的東西。
 * M4 `MatchController` 建構子的 `this.world.itemEligible = …` 改成永遠 `null`
 *    → **1 紅**：「卡面每一張都在白名單裡」。這一格證明白名單是**經由 sim
 *    這條管線**到位的，不是靠某個 host 端的殘留過濾。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { ContentLoader, registerAll, zConfigArenaRulesDoc, type ConfigArenaRulesDoc } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { Champions, Items, LootTables } from "@ggd/shared/sim/content/registry";
import { LEGENDARY_POOL_TABLE } from "@ggd/shared/sim/economy/itemTiers";
import { ITEM_OFFER_TIER } from "@ggd/shared/sim/economy/draft";
import { MatchController, type SeatSpec } from "./MatchController";
import { rulesFromDoc, type ArenaRules } from "./arenaRules";
import { Whitelist } from "../curation/whitelist";

const TAG = "eco-legendary-card-width";
const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

/** Fast phase config (mirrors arenaRules.test.ts). */
const FAST = {
  champSelectTicks: 5,
  intermissionTicks: 30,
  combatMaxTicks: 1200,
  resolutionTicks: 5,
};

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

let ARENA: ArenaRules;
let poolIds: string[] = [];
/**
 * 池子裡**沒有** `requiresAttackType` 的那些條目。
 *
 * ⚠️ 這個區分是實測逼出來的，不是預防性的。第一版用 `poolIds.slice(0, 3)` 當窄
 * 白名單，結果三件裡有兩件是近戰限定（泰坦九頭蛇 / 無盡連刃），於是**遠程英雄
 * 的候選池真的只剩 1 條**，卡片就真的只有 1 張 —— 而那是 `short` 合約下的正確
 * 行為，不是缺陷。用它當「卡片不准變薄」的樣本，等於把功能誤判成 bug。
 *
 * 所以窄白名單只從「每支英雄都配得上」的條目裡取，這樣「池子夠大」對 12 個座位
 * 同時成立，紅燈只可能來自削卡。攻擊型態閘本身由
 * `curation/legendaryReachability.test.ts` 兩個方向守著。
 */
let unrestrictedIds: string[] = [];
let allChampions: string[] = [];

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  const doc = zConfigArenaRulesDoc.parse(
    JSON.parse(readFileSync(join(CONTENT_DIR, "config/arena-rules.json"), "utf8")),
  ) as ConfigArenaRulesDoc;
  // ⚠️ `draftConflict: "both"` 是這場實驗的**前提**，不是在測非預設路徑（#340）：
  // 出貨排程裡發寶具的那兩個回合同時也排了聖杯願望，而 owner 2026-08-17 的裁決
  // 讓聖杯贏 ⇒ 出貨預設下這一支一張寶具卡都觀察不到，整份會變成空跑。這一支的
  // 主題是**卡面寬度**（GH#249 先抽後濾），它需要一個真的發得出卡的世界。
  ARENA = { ...rulesFromDoc(doc), draftConflict: "both" };
  poolIds = LootTables.get(LEGENDARY_POOL_TABLE).entries.map((e) => e.itemId as string);
  unrestrictedIds = poolIds.filter((id) => Items.get(id as never).requiresAttackType === undefined);
  allChampions = Champions.all().map((c) => c.id as string);
});

/**
 * 一個 ENFORCING 白名單（`bypass = false` —— bypass 會讓每一條斷言都變成空跑）：
 * 英雄與技能全開（否則沒人上得了場，紅燈會混進「選不到英雄」），
 * 道具只放行 `legendaryCount` 件**所有英雄都配得上**的棱彩武器。
 */
function narrowWhitelist(legendaryCount: number): Whitelist {
  return new Whitelist(
    {
      version: 1,
      champions: allChampions,
      items: unrestrictedIds.slice(0, legendaryCount),
      abilities: [],
    },
    false,
  );
}

/** 整張表全開的白名單 —— 對照組（今天的 `starter.go` 就是這個狀態）。 */
function fullWhitelist(): Whitelist {
  return new Whitelist({ version: 1, champions: allChampions, items: poolIds, abilities: [] }, false);
}

/** 跑到 `round` 的中場，回傳每個座位的**武器卡**（`ctl.offers` 裡 kind=item 的那些）。 */
function weaponCardsAtRound(seed: number, wl: Whitelist, round: number): string[][] {
  const ctl = new MatchController(`cardwidth-${seed}`, seed, allBots(), FAST, 3, ARENA, undefined, wl);
  let n = 0;
  while (!(ctl.phase.phase === "intermission" && ctl.phase.round === round) && n++ < 60000) ctl.tick();
  expect(ctl.phase.phase, `seed ${seed} 沒有跑到第 ${round} 回合中場`).toBe("intermission");
  expect(ctl.phase.round).toBe(round);
  return [...ctl.offers.values()]
    .filter((o) => o.kind === "item" && o.tier === ITEM_OFFER_TIER)
    .map((o) => [...o.choices] as string[]);
}

/** `arena-rules` 排了武器卡的第一個回合 —— 不寫死 2，改排程也不會靜默失準。 */
function firstWeaponRound(): number {
  for (const [round, grant] of [...ARENA.rounds.entries()].sort((a, b) => a[0] - b[0])) {
    if (grant.weaponLootTable) return round;
  }
  throw new Error("arena-rules 沒有任何回合發武器卡了 —— 這一支要重寫");
}

describe("出貨路徑：白名單再窄，三選一還是三張 (eco-legendary-card-width)", () => {
  it("★ 前置：這場實驗真的有鑑別力（表 49 條、白名單只放行 6 條）", () => {
    cover(TAG);
    // 沒有這一格，下面兩條在「表剛好只有 6 條」的世界裡也會過，而那不是缺陷
    // 存在的世界。窄白名單必須真的窄。
    expect(poolIds.length, "棱彩表變小了 —— 重新選 narrowWhitelist 的數字").toBeGreaterThanOrEqual(20);
    expect(
      unrestrictedIds.length,
      "沒有足夠的「所有英雄都配得上」條目 —— 窄白名單會製造真的耗盡，樣本失效",
    ).toBeGreaterThanOrEqual(6);
    expect(ARENA.offerCount).toBe(3);
    expect(firstWeaponRound()).toBeGreaterThan(0);
  });

  it("★ 每一張武器卡都是 offerCount 張 —— 不是 1 張，也不是 2 張", () => {
    cover(TAG);
    const round = firstWeaponRound();
    const wl = narrowWhitelist(6);
    const thin: string[] = [];
    for (const seed of [11, 202, 3003, 40004, 55555]) {
      const cards = weaponCardsAtRound(seed, wl, round);
      expect(cards.length, `seed ${seed} 這一回合一張武器卡都沒發`).toBeGreaterThan(0);
      for (const [i, c] of cards.entries()) {
        if (c.length !== ARENA.offerCount) thin.push(`seed ${seed} 卡 ${i}: ${c.length} 張 [${c.join(", ")}]`);
      }
    }
    expect(
      thin.slice(0, 8),
      `${thin.length} 張武器卡不是 ${ARENA.offerCount} 張 —— 白名單擋掉的條目又在削卡面了` +
        `（GH#249：MatchController 先抽後濾）`,
    ).toEqual([]);
  });

  it("★ 白名單從 49 縮到 6，卡片寬度完全不動（原缺陷的相關性本身）", () => {
    cover(TAG);
    const round = firstWeaponRound();
    const seed = 8123;
    const widths = (wl: Whitelist): number[] =>
      weaponCardsAtRound(seed, wl, round).map((c) => c.length);
    const wide = widths(fullWhitelist());
    expect(wide.every((w) => w === ARENA.offerCount), `整張表開放時就已經不是三張：${wide}`).toBe(true);
    for (const n of [24, 12, 6, 3]) {
      expect(widths(narrowWhitelist(n)), `白名單只放行 ${n} 件時卡片變薄了`).toEqual(wide);
    }
  });

  it("★ 卡面上的每一張都必須是白名單真的開放的武器", () => {
    cover(TAG);
    // 寬度對了但內容錯了，等於把白名單整個廢掉 —— 上一條抓不到這個方向。
    const round = firstWeaponRound();
    const allowed = new Set(unrestrictedIds.slice(0, 6));
    const wl = narrowWhitelist(6);
    for (const seed of [11, 202, 3003]) {
      for (const c of weaponCardsAtRound(seed, wl, round)) {
        for (const itemId of c) {
          expect(allowed.has(itemId), `seed ${seed} 發出了沒開放的 ${itemId}`).toBe(true);
        }
      }
    }
  });
});
