/**
 * battlefieldIntel.test.ts — GH#220 全場戰況的守衛。
 *
 * owner 2026-07-30：「在商店要能看到所有人**包括敵方**的等級 生命 攻速/AP/AD 裝備
 * 作為制定反打參考 增加策略性」
 *
 * 任務指定了兩條守衛，這個檔案兩條都用**畫面上的字串**斷言，不是用 store、
 * 也不是用函式回傳值：
 *
 *  A. 敵方那幾列的數字要跟該玩家自己看到的一致（同一來源，不是兩份）
 *     → `crossPanelValue()` 同時 server-render 兩個真的元件（`StatPanel` 與
 *       `BattlefieldIntelPanel`），從 markup 把字挖出來比。回傳值一樣而畫面印
 *       別的東西是第⑤種故障，比函式回傳值抓不到。
 *
 *  B. 敵方裝備是「上一回合結束的快照」不是即時
 *     → 封存之後讓敵方買一件 AP 裝，再斷言面板上的 AP 數字**沒有動**、裝備格
 *       **還是空的**，而同一次呼叫裡自己那一列的數字**有動**。只斷言「敵方是舊的」
 *       會被一個「所有人都凍住」的爛實作騙過去（第④種：斷言方向跟缺陷無關）。
 *
 * 每一條都做過突變驗證，紀錄寫在各個 `it` 的註解裡。
 *
 * client 的 vitest 跑 `node` env，所以 render 走 `react-dom/server`，
 * 與 shopStatVisibility.test.ts / MerchantShop.test.ts 同一條路。
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Stat, zeroStats } from "@ggd/shared/sim/stats/statTypes";
import { DEFAULT_COMBAT_ENV, type CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";
import {
  buildIntelRows,
  getBattlefieldIntelConfig,
  intelFreshnessNote,
  intelSourceOf,
  intelStatsOf,
  parseBattlefieldIntelJson,
  recordIntelFrame,
  resetBattlefieldIntelConfig,
  roundIntelLedger,
  setBattlefieldIntelConfigJson,
  SHIPPED_BATTLEFIELD_INTEL,
  type BattlefieldIntelConfig,
  type IntelSeatLike,
} from "./battlefieldIntel";
import { BattlefieldIntelPanel, NO_DATA } from "./BattlefieldIntelPanel";
import { computeStatBlock, computeBaseStatBlock, statContextFromSeat } from "./statPreview";
import { StatPanel, shopTabs, SHOP_TABS, DEFAULT_SHOP_TAB } from "./MerchantShop";

/** 骨架內容集的英雄。刻意不用出貨英雄：這裡驗的是接線，不是某個角色的數值。 */
const CHAMP = "thorne";
const AP_ITEM = "ember-rod"; //   +45 法術強度
const AD_ITEM = "serrated-edge"; // +35 攻擊力
const HP_ITEM = "ironhide-vest"; // +150 生命 / +45 護甲

const MATCH = "m-220";

beforeAll(() => {
  registerSkeletonContent();
});

beforeEach(() => {
  roundIntelLedger.clear();
  resetBattlefieldIntelConfig();
});

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

function seat(over: Partial<IntelSeatLike> & { seatId: number; teamId: number }): IntelSeatLike {
  return {
    displayName: `P${over.seatId}`,
    championId: CHAMP,
    level: 5,
    abilityRanks: [1, 0, 0, 0],
    exAbilityId: "",
    exRank: 0,
    items: ["", "", "", "", "", ""],
    augments: [],
    statCapstonePct: 0,
    maxHp: 0,
    ...over,
  };
}

const SELF = 0;
const ALLY = 1;
const FOE = 5;

/** 一場 2v2：座位 0/1 是本隊，5/6 是敵隊。 */
function roster(foeItems: string[] = ["", "", "", "", "", ""]): IntelSeatLike[] {
  return [
    seat({ seatId: SELF, teamId: 0 }),
    seat({ seatId: ALLY, teamId: 0 }),
    seat({ seatId: FOE, teamId: 1, level: 7, items: foeItems }),
  ];
}

function rowsFor(
  seats: readonly IntelSeatLike[],
  config: BattlefieldIntelConfig = getBattlefieldIntelConfig(),
  env?: CombatEnvMultipliers,
) {
  return buildIntelRows({
    seats,
    localSeatId: SELF,
    config,
    env,
    sealedOf: (id) => roundIntelLedger.sealedSourceOf(id),
  });
}

function renderIntel(
  seats: readonly IntelSeatLike[],
  config: BattlefieldIntelConfig = getBattlefieldIntelConfig(),
  env?: CombatEnvMultipliers,
): string {
  return renderToStaticMarkup(
    createElement(BattlefieldIntelPanel, {
      rows: rowsFor(seats, config, env),
      config,
      sealedRound: roundIntelLedger.sealedRoundNumber(),
    }),
  );
}

// ---------------------------------------------------------------------------
// markup readers — every assertion below reads what the panel PRINTED
// ---------------------------------------------------------------------------

/** 從戰況面板挖出某一列某一欄實際印出來的字。 */
function intelCell(html: string, seatId: number, cell: string): string {
  const rowStart = html.indexOf(`data-intel-seat="${seatId}"`);
  expect(rowStart, `面板上沒有 seat ${seatId} 這一列`).toBeGreaterThanOrEqual(0);
  const nextRow = html.indexOf("data-intel-seat=", rowStart + 1);
  const row = html.slice(rowStart, nextRow < 0 ? html.length : nextRow);
  const m = row.match(new RegExp(`data-intel-cell="${cell}"[^>]*>([^<]*)</span>`));
  expect(m, `seat ${seatId} 那一列沒有 ${cell} 這一格`).not.toBeNull();
  return m![1]!;
}

/**
 * 某一列實際畫出來的裝備格 —— 讀 wrapper 的 `data-intel-item`，也就是玩家滑上去
 * 會看到那個名字的那一格。**不能只讀 GlyphTile**：它整塊 `aria-hidden` 且只畫
 * 一個字元，一個「名字完全沒送到畫面」的實作在它上面照樣全綠。
 */
function intelItems(html: string, seatId: number): string[] {
  const rowStart = html.indexOf(`data-intel-seat="${seatId}"`);
  expect(rowStart, `面板上沒有 seat ${seatId} 這一列`).toBeGreaterThanOrEqual(0);
  const nextRow = html.indexOf("data-intel-seat=", rowStart + 1);
  const row = html.slice(rowStart, nextRow < 0 ? html.length : nextRow);
  return [...row.matchAll(/data-intel-item="([^"]*)"/g)].map((m) => m[1]!);
}

/** 某一格裝備印出來的無障礙名稱（`aria-label`）—— 玩家/讀屏拿到的那個字。 */
function intelItemLabels(html: string, seatId: number): string[] {
  const rowStart = html.indexOf(`data-intel-seat="${seatId}"`);
  const nextRow = html.indexOf("data-intel-seat=", rowStart + 1);
  const row = html.slice(rowStart, nextRow < 0 ? html.length : nextRow);
  return [...row.matchAll(/data-intel-item="[^"]+"[^>]*aria-label="([^"]*)"/g)].map((m) => m[1]!);
}

/** 從商店「英雄全屬性狀態」面板挖出某一列實際印出來的字。 */
function statPanelValue(html: string, label: string): string {
  const m = html.match(new RegExp(`>${label}</span><span[^>]*>([^<]*)</span>`));
  expect(m, `商店屬性面板沒有印出「${label}」`).not.toBeNull();
  return m![1]!;
}

/**
 * 「那個玩家自己看到的」—— 完全照 `MerchantShop.GoodsTab` 掛 `StatPanel` 的方式
 * 掛一次。任何一個參數在這裡與正式路徑不同，這條守衛就會變成自說自話。
 */
function renderOwnStatPanel(s: IntelSeatLike, env?: CombatEnvMultipliers): string {
  const ctx = statContextFromSeat(s, env);
  const block = computeStatBlock(ctx) ?? zeroStats();
  return renderToStaticMarkup(
    createElement(StatPanel, {
      block,
      base: computeBaseStatBlock(ctx),
      preview: null,
      exact: true,
      // 正式路徑餵的是 `HudState.localMaxHp`，而 net/RoomStore 是用同一行
      // `Math.round(es.maxHp)` 同時算出 `SeatView.maxHp` 的 —— 所以這裡餵
      // `s.maxHp` 就是那個玩家自己面板上的權威值。
      authMaxHp: s.maxHp,
      authMaxMana: 0,
      level: s.level,
      statStacks: 0,
      capstonePct: s.statCapstonePct,
      championId: s.championId,
      attrBonus: s.attrBonus,
    }),
  );
}

// ===========================================================================
// A. 同一來源：敵方那幾列 === 該玩家自己看到的
// ===========================================================================

describe("A · 敵方的數字與該玩家自己看到的是同一個字串", () => {
  /**
   * 突變驗證（做過，三次都紅）：
   *   1. `intelStatsOf` 改成 `computeBaseStatBlock`（＝忽略裝備）
   *      → 攻擊力 / 法術強度 兩格對不上，紅。
   *   2. `intelStatsOf` 的 maxHealth 拿掉 `src.authMaxHp > 0` 的釘住
   *      → 生命那一格與商店面板差 1（重建 vs 權威），紅。
   *   3. `BattlefieldIntelPanel` 的 `formatStatValue` 換成 `String(v)`
   *      → 攻速印出 0.7150000000000001 之類，紅。
   */
  it("生命/攻速/法術強度/攻擊力 四格，兩個面板印出同一串字", () => {
    const foe = seat({
      seatId: FOE,
      teamId: 1,
      level: 7,
      items: [AP_ITEM, AD_ITEM, HP_ITEM, "", "", ""],
      maxHp: 2314,
    });
    const seats = [seat({ seatId: SELF, teamId: 0 }), foe];

    // 敵方封存 = 他現在的樣子（戰鬥結束時就是這個 build）
    recordIntelFrame({ matchId: MATCH, phase: "combat", round: 3, seats });
    recordIntelFrame({ matchId: MATCH, phase: "resolution", round: 3, seats });

    const mine = renderIntel(seats);
    const theirs = renderOwnStatPanel(foe);

    for (const [cell, label] of [
      ["health", "生命"],
      ["attackSpeed", "攻擊速度"],
      ["abilityPower", "法術強度"],
      ["attackDamage", "攻擊力"],
    ] as const) {
      expect(
        intelCell(mine, FOE, cell),
        `我看到的敵方 ${label} 與他自己商店面板上的 ${label} 不一致`,
      ).toBe(statPanelValue(theirs, label));
    }
    // …而且不是「兩邊都印 0 所以相等」。
    expect(Number(intelCell(mine, FOE, "attackDamage"))).toBeGreaterThan(0);
    expect(Number(intelCell(mine, FOE, "health"))).toBeGreaterThan(0);
  });

  /**
   * post-multiplier（#125）。突變驗證：`intelStatsOf` 不把 `env` 傳給
   * `statContextFromSeat` → 兩個 env 印出同一個生命值，紅。
   */
  it("數值是 post-multiplier 的最終值，會跟著 combat-env 動", () => {
    const seats = roster();
    recordIntelFrame({ matchId: MATCH, phase: "combat", round: 2, seats });
    recordIntelFrame({ matchId: MATCH, phase: "resolution", round: 2, seats });

    const neutral = renderIntel(seats, getBattlefieldIntelConfig(), DEFAULT_COMBAT_ENV);
    const doubled = renderIntel(seats, getBattlefieldIntelConfig(), {
      ...DEFAULT_COMBAT_ENV,
      abilityPower: DEFAULT_COMBAT_ENV.abilityPower * 4,
    });

    const a = Number(intelCell(neutral, FOE, "abilityPower"));
    const b = Number(intelCell(doubled, FOE, "abilityPower"));
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
  });

  /**
   * 同一支函式的第二個證明：面板上的字必須跟 `intelStatsOf` 走同一條路。
   * 突變驗證：`buildIntelRows` 改成回傳 `computeBaseStatBlock` 的值 → 紅。
   */
  it("裝備真的改變了敵方那一列的數字（不是印一個固定的 base）", () => {
    const bare = [seat({ seatId: SELF, teamId: 0 }), seat({ seatId: FOE, teamId: 1 })];
    recordIntelFrame({ matchId: MATCH, phase: "combat", round: 1, seats: bare });
    recordIntelFrame({ matchId: MATCH, phase: "resolution", round: 1, seats: bare });
    const withoutAp = intelCell(renderIntel(bare), FOE, "abilityPower");

    roundIntelLedger.clear();
    const armed = [
      seat({ seatId: SELF, teamId: 0 }),
      seat({ seatId: FOE, teamId: 1, items: [AP_ITEM, "", "", "", "", ""] }),
    ];
    recordIntelFrame({ matchId: MATCH, phase: "combat", round: 1, seats: armed });
    recordIntelFrame({ matchId: MATCH, phase: "resolution", round: 1, seats: armed });
    const withAp = intelCell(renderIntel(armed), FOE, "abilityPower");

    expect(Number(withAp)).toBeGreaterThan(Number(withoutAp));
  });
});

// ===========================================================================
// B. 敵方 = 上一回合結束的封存，不是即時
// ===========================================================================

describe("B · 敵方資料是上一回合結束的封存", () => {
  /**
   * 這是這個功能最容易被做成「看起來對」的地方。
   *
   * 突變驗證（做過，都紅）：
   *   1. `buildIntelRows` 的 `useSealed` 直接寫死 `false`（＝敵方也讀即時）
   *      → 敵方 AP 跟著中場的購買動了，紅。
   *   2. `useSealed` 寫死 `true`（＝連自己人也凍住）
   *      → 自己那一列的 AP 沒有跟著動，紅（這就是為什麼要同時斷言「自己有動」）。
   */
  it("中場買的東西不會出現在敵方那一列，但會出現在自己那一列", () => {
    const atRoundEnd = roster();
    recordIntelFrame({ matchId: MATCH, phase: "combat", round: 4, seats: atRoundEnd });
    recordIntelFrame({ matchId: MATCH, phase: "resolution", round: 4, seats: atRoundEnd });

    const foeApBefore = intelCell(renderIntel(atRoundEnd), FOE, "abilityPower");
    const selfApBefore = intelCell(renderIntel(atRoundEnd), SELF, "abilityPower");

    // 中場：雙方各買一件 AP 裝。帳沒有再被封存過。
    const shopping: IntelSeatLike[] = [
      seat({ seatId: SELF, teamId: 0, items: [AP_ITEM, "", "", "", "", ""] }),
      seat({ seatId: ALLY, teamId: 0 }),
      seat({ seatId: FOE, teamId: 1, level: 7, items: [AP_ITEM, "", "", "", "", ""] }),
    ];
    recordIntelFrame({ matchId: MATCH, phase: "intermission", round: 5, seats: shopping });
    const html = renderIntel(shopping);

    expect(intelCell(html, FOE, "abilityPower"), "敵方 AP 跟著中場的購買動了 —— 互相偷看的迴圈").toBe(
      foeApBefore,
    );
    expect(
      Number(intelCell(html, SELF, "abilityPower")),
      "自己那一列也被凍住了 —— 那不是快照，那是壞掉",
    ).toBeGreaterThan(Number(selfApBefore));
  });

  /**
   * 突變驗證：`buildIntelRows` 在沒有封存時退回 `intelSourceOf(seat)`
   * → 第一回合就印出敵方的真實等級，紅。
   */
  it("第一回合沒有封存 → 印「—」而不是 0，也不偷偷退回即時值", () => {
    const seats = roster([AP_ITEM, "", "", "", "", ""]);
    const html = renderIntel(seats); // 從來沒有封存過

    expect(intelCell(html, FOE, "level")).toBe(NO_DATA);
    expect(intelCell(html, FOE, "health")).toBe(NO_DATA);
    expect(intelCell(html, FOE, "abilityPower")).toBe(NO_DATA);
    // 自己那一列照樣是真的
    expect(intelCell(html, SELF, "level")).toBe("5");
    // 揭露文字要說沒有資料
    expect(html).toContain("尚無上回合資料");
  });

  /** 封存的回合編號要印在畫面上 —— 玩家不知道範圍就會把它當即時。 */
  it("印出封存的是第幾回合", () => {
    const seats = roster();
    recordIntelFrame({ matchId: MATCH, phase: "combat", round: 6, seats });
    recordIntelFrame({ matchId: MATCH, phase: "resolution", round: 6, seats });
    expect(renderIntel(seats)).toContain("第 6 回合結束時的快照");
    expect(intelFreshnessNote(SHIPPED_BATTLEFIELD_INTEL, 6)).toBe("敵方資料：第 6 回合結束時的快照");
  });

  it("封存是冪等的：seal 走幾次都是同一份", () => {
    const seats = roster([AD_ITEM, "", "", "", "", ""]);
    recordIntelFrame({ matchId: MATCH, phase: "combat", round: 2, seats });
    recordIntelFrame({ matchId: MATCH, phase: "resolution", round: 2, seats });
    const first = roundIntelLedger.sealedSourceOf(FOE);
    // 中場的每一個 seats patch 都會再走一次記錄器
    recordIntelFrame({ matchId: MATCH, phase: "intermission", round: 3, seats: roster() });
    recordIntelFrame({ matchId: MATCH, phase: "intermission", round: 3, seats: roster() });
    expect(roundIntelLedger.sealedSourceOf(FOE)).toEqual(first);
    expect(roundIntelLedger.sealedRoundNumber()).toBe(2);
  });

  it("換一場就丟掉上一場的封存（不會把舊敵人的裝備帶進新的一場）", () => {
    const seats = roster([HP_ITEM, "", "", "", "", ""]);
    recordIntelFrame({ matchId: MATCH, phase: "combat", round: 1, seats });
    recordIntelFrame({ matchId: MATCH, phase: "resolution", round: 1, seats });
    expect(roundIntelLedger.sealedSourceOf(FOE)).not.toBeNull();

    recordIntelFrame({ matchId: "m-other", phase: "intermission", round: 1, seats: roster() });
    expect(roundIntelLedger.sealedSourceOf(FOE)).toBeNull();
    expect(roundIntelLedger.sealedRoundNumber()).toBe(0);
  });

  /**
   * 戰鬥中開商店（陣亡玩家，shopGate 允許）看到的必須也是**上一回合**，不是這一
   * 回合的即時。突變驗證：把 `seal` 改成在 `observeCombat` 裡也做一次 → 紅。
   */
  it("陣亡玩家在戰鬥中開商店，看到的仍是上一回合的封存", () => {
    const r4 = roster();
    recordIntelFrame({ matchId: MATCH, phase: "combat", round: 4, seats: r4 });
    recordIntelFrame({ matchId: MATCH, phase: "resolution", round: 4, seats: r4 });
    const before = intelCell(renderIntel(r4), FOE, "attackDamage");

    // 第 5 回合戰鬥中，敵方帶著新買的 AD 裝在場上
    const r5 = roster([AD_ITEM, "", "", "", "", ""]);
    recordIntelFrame({ matchId: MATCH, phase: "combat", round: 5, seats: r5 });
    expect(intelCell(renderIntel(r5), FOE, "attackDamage")).toBe(before);
  });
});

// ===========================================================================
// 裝備 6 格
// ===========================================================================

describe("裝備欄", () => {
  /**
   * 突變驗證：`buildIntelRows` 的 `items` 改成永遠 `[...EMPTY_SLOTS]`
   * → 敵方那一列不再有道具圖磚，紅。
   */
  it("敵方封存裡的裝備會畫出來，中場新買的不會", () => {
    const atRoundEnd = roster([AP_ITEM, "", "", "", "", ""]);
    recordIntelFrame({ matchId: MATCH, phase: "combat", round: 3, seats: atRoundEnd });
    recordIntelFrame({ matchId: MATCH, phase: "resolution", round: 3, seats: atRoundEnd });

    const shopping = roster([AP_ITEM, AD_ITEM, "", "", "", ""]);
    const html = renderIntel(shopping);

    // 六格都畫出來了，第一格是封存裡那一件，中場才買的第二件不在
    expect(intelItems(html, FOE)).toEqual([AP_ITEM, "", "", "", "", ""]);
    // …而且那一格真的印出了名字（不是一個沒有名字的方塊）
    expect(intelItemLabels(html, FOE)).toEqual(["Ember Rod"]);
  });

  it("永遠 6 格：wire 少給幾格也不會讓那一列縮排", () => {
    const seats = [
      seat({ seatId: SELF, teamId: 0 }),
      seat({ seatId: FOE, teamId: 1, items: [AP_ITEM] }),
    ];
    recordIntelFrame({ matchId: MATCH, phase: "combat", round: 1, seats });
    recordIntelFrame({ matchId: MATCH, phase: "resolution", round: 1, seats });
    const row = rowsFor(seats).find((r) => r.seatId === FOE)!;
    expect(row.items).toHaveLength(6);
    expect(row.items.filter((i) => i !== "")).toEqual([AP_ITEM]);
  });
});

// ===========================================================================
// 排序 / 名單
// ===========================================================================

describe("列的組成與順序", () => {
  it("自己在最上面，然後同隊，最後敵方", () => {
    const seats = [
      seat({ seatId: FOE, teamId: 1 }),
      seat({ seatId: ALLY, teamId: 0 }),
      seat({ seatId: SELF, teamId: 0 }),
    ];
    expect(rowsFor(seats).map((r) => r.seatId)).toEqual([SELF, ALLY, FOE]);
  });

  it("還沒選英雄的空座位不是一列", () => {
    const seats = [seat({ seatId: SELF, teamId: 0 }), seat({ seatId: 9, teamId: 1, championId: "" })];
    expect(rowsFor(seats).map((r) => r.seatId)).toEqual([SELF]);
  });

  it("英雄不在 registry → 那一列印「—」，不是印一個猜的數字", () => {
    const seats = [
      seat({ seatId: SELF, teamId: 0 }),
      seat({ seatId: FOE, teamId: 1, championId: "not-a-champion" }),
    ];
    recordIntelFrame({ matchId: MATCH, phase: "combat", round: 1, seats });
    recordIntelFrame({ matchId: MATCH, phase: "resolution", round: 1, seats });
    expect(intelCell(renderIntel(seats), FOE, "attackDamage")).toBe(NO_DATA);
  });
});

// ===========================================================================
// 第一守則：後台可調
// ===========================================================================

describe("後台可調（第一守則）", () => {
  it("出貨值就是 owner 明說的那一組", () => {
    expect(SHIPPED_BATTLEFIELD_INTEL).toEqual({
      enabled: true,
      showEnemies: true,
      enemyFreshness: "sealed",
      showEnemyItems: true,
      showLevel: true,
      showHealth: true,
      showAttackSpeed: true,
      showAbilityPower: true,
      showAttackDamage: true,
    });
  });

  it("壞掉的 JSON 一律退回出貨值，不是退回全關", () => {
    expect(parseBattlefieldIntelJson("")).toEqual(SHIPPED_BATTLEFIELD_INTEL);
    expect(parseBattlefieldIntelJson("{ not json")).toEqual(SHIPPED_BATTLEFIELD_INTEL);
    expect(parseBattlefieldIntelJson("null")).toEqual(SHIPPED_BATTLEFIELD_INTEL);
    expect(parseBattlefieldIntelJson('{"enemyFreshness":"tomorrow"}').enemyFreshness).toBe("sealed");
    // 認得的欄位才會被吃進去
    expect(parseBattlefieldIntelJson('{"showEnemies":false}').showEnemies).toBe(false);
  });

  it("ambient 單例接得上（未來的 wire 欄位只要呼叫這一支）", () => {
    setBattlefieldIntelConfigJson('{"showEnemyItems":false}');
    expect(getBattlefieldIntelConfig().showEnemyItems).toBe(false);
    // 冪等
    setBattlefieldIntelConfigJson('{"showEnemyItems":false}');
    expect(getBattlefieldIntelConfig().showEnemyItems).toBe(false);
    resetBattlefieldIntelConfig();
    expect(getBattlefieldIntelConfig()).toEqual(SHIPPED_BATTLEFIELD_INTEL);
  });

  /**
   * 「拿不定主意就兩種模式都做」—— `live` 這一支必須真的能跑，不是一個註解。
   * 突變驗證：`buildIntelRows` 的 `useSealed` 拿掉 `config.enemyFreshness` 那半邊
   * → live 模式下敵方仍讀封存，紅。
   */
  it("enemyFreshness: live → 敵方改讀即時", () => {
    const config: BattlefieldIntelConfig = { ...SHIPPED_BATTLEFIELD_INTEL, enemyFreshness: "live" };
    const seats = roster([AP_ITEM, "", "", "", "", ""]);
    // 從來沒有封存過；sealed 模式下這裡會是「—」
    expect(intelCell(renderIntel(seats), FOE, "level")).toBe(NO_DATA);
    expect(intelCell(renderIntel(seats, config), FOE, "level")).toBe("7");
    expect(renderIntel(seats, config)).toContain("敵方資料：即時");
  });

  it("showEnemies: false → 敵方那幾列整個不見，自己人還在", () => {
    const config: BattlefieldIntelConfig = { ...SHIPPED_BATTLEFIELD_INTEL, showEnemies: false };
    expect(rowsFor(roster(), config).map((r) => r.seatId)).toEqual([SELF, ALLY]);
    // …而且揭露文字要改口。還在講「敵方資料：尚無上回合資料」會讓玩家去捲一組
    // 根本不存在的列，然後以為是 bug。
    const html = renderIntel(roster(), config);
    expect(html).toContain("僅顯示我方");
    expect(html).not.toContain("敵方資料：");
  });

  it("showEnemyItems: false → 敵方不露裝備，自己人照露", () => {
    const config: BattlefieldIntelConfig = { ...SHIPPED_BATTLEFIELD_INTEL, showEnemyItems: false };
    const seats: IntelSeatLike[] = [
      seat({ seatId: SELF, teamId: 0, items: [AD_ITEM, "", "", "", "", ""] }),
      seat({ seatId: FOE, teamId: 1, items: [AP_ITEM, "", "", "", "", ""] }),
    ];
    recordIntelFrame({ matchId: MATCH, phase: "combat", round: 1, seats });
    recordIntelFrame({ matchId: MATCH, phase: "resolution", round: 1, seats });
    const html = renderIntel(seats, config);
    expect(intelItemLabels(html, SELF)).toEqual(["Serrated Edge"]); // 自己的照露
    expect(intelItems(html, FOE).filter((i) => i !== "")).toEqual([]); // 敵方的不露
  });

  it("關掉某一欄，那一欄的標題與格子都不佔位", () => {
    const config: BattlefieldIntelConfig = { ...SHIPPED_BATTLEFIELD_INTEL, showAttackSpeed: false };
    const html = renderIntel(roster(), config);
    expect(html).not.toContain('data-intel-cell="attackSpeed"');
    expect(html).toContain('data-intel-cell="attackDamage"');
  });

  it("enabled: false → 面板整個不渲染，商店也不長出那個分頁", () => {
    const config: BattlefieldIntelConfig = { ...SHIPPED_BATTLEFIELD_INTEL, enabled: false };
    expect(renderIntel(roster(), config)).toBe("");
    expect(shopTabs(config).map((t) => t.label)).toEqual(["屬性", "技能"]);
  });
});

// ===========================================================================
// 商店分頁：#122 的合約不能被 #220 撞壞
// ===========================================================================

describe("商店分頁", () => {
  it("戰況是「附加」的：屬性仍是第一個、仍是預設", () => {
    const tabs = shopTabs(SHIPPED_BATTLEFIELD_INTEL);
    expect(tabs.map((t) => t.label)).toEqual(["屬性", "技能", "戰況"]);
    expect(DEFAULT_SHOP_TAB).toBe(SHOP_TABS[0]!.key);
    expect(tabs[0]!.key).toBe(DEFAULT_SHOP_TAB);
  });
});

// ===========================================================================
// 接線：算出來了要真的送到畫面（第②種故障）
// ===========================================================================

/**
 * 走 source-scan 而不是 render，理由與 `roundReportMount.test.ts` 檔頭寫的同一條：
 * HudRoot 會拉進整棵 HUD store 與 Babylon-backed 的東西，在這裡掛起來是在測 harness。
 * 掃描刻意只窄到「這一行 JSX 還在不在」—— 它要抓的就是那一種回歸。
 *
 * 為什麼一定要有這一條：記錄器如果沒有被掛上，`sealedSourceOf` 永遠回傳 null，
 * 敵方那幾列會變成一整排「—」。上面每一條測試都會照樣綠（它們自己呼叫
 * `recordIntelFrame`），而玩家看到的是一個「好像沒做」的面板。
 */
describe("記錄器真的掛在 HudRoot 上", () => {
  const hud = readFileSync(join(__dirname, "..", "HudRoot.tsx"), "utf8");

  it("HudRoot imports 並掛上 <BattlefieldIntelRecorder />", () => {
    expect(hud).toMatch(
      /import\s*\{\s*BattlefieldIntelRecorder\s*\}\s*from\s*"\.\/panels\/useBattlefieldIntel"/,
    );
    expect(hud).toMatch(/<BattlefieldIntelRecorder\s*\/>/);
  });

  it("掛點是活的 JSX（沒有被註解掉、沒有被 {false &&} 關掉）", () => {
    for (const line of hud.split("\n")) {
      if (!line.includes("<BattlefieldIntelRecorder")) continue;
      const t = line.trim();
      expect(t.startsWith("//"), `mount commented out: ${t}`).toBe(false);
      expect(t.startsWith("*"), `mount inside a block comment: ${t}`).toBe(false);
      expect(/\{\s*false\s*&&/.test(line), `mount gated off: ${t}`).toBe(false);
    }
  });

  it("掛在相位分支之外 —— 戰鬥中活著的玩家也要記錄", () => {
    // MerchantShop 在 combat 期間對活著的玩家是 `return null`（shopGate），所以
    // 記錄器一旦被搬進 `{phase === "intermission" && …}` 這種分支，就只剩陣亡的
    // 人會記錄敵方封存。這裡確認它與 <RoundEndVoice /> 一樣在無條件的那一段。
    const at = hud.indexOf("<BattlefieldIntelRecorder");
    const voice = hud.indexOf("<RoundEndVoice />");
    expect(at).toBeGreaterThan(0);
    expect(voice).toBeGreaterThan(0);
    const between = hud.slice(Math.min(at, voice), Math.max(at, voice));
    expect(between).not.toContain("phase ===");
    expect(between).not.toContain("inGame &&");
  });

  it("MerchantShop 掛上戰況面板本身", () => {
    const shop = readFileSync(join(__dirname, "MerchantShop.tsx"), "utf8");
    expect(shop).toMatch(/import\s*\{\s*BattlefieldIntelPanel\s*\}\s*from\s*"\.\/BattlefieldIntelPanel"/);
    expect(shop).toMatch(/<BattlefieldIntelPanel/);
  });
});

// ===========================================================================
// 生命那一格的釘住規則（與 StatPanel 同一條）
// ===========================================================================

describe("生命釘住伺服器權威值", () => {
  /**
   * 突變驗證：`intelStatsOf` 的 `src.authMaxHp > 0 ? … : …` 改成永遠讀重建值
   * → 這條紅（面板印 1234 以外的數字）。
   */
  it("有權威 maxHp 就用它，沒有才用重建值", () => {
    const s = seat({ seatId: FOE, teamId: 1, maxHp: 1234 });
    expect(intelStatsOf(intelSourceOf(s))!.maxHealth).toBe(1234);

    const noEntity = seat({ seatId: FOE, teamId: 1, maxHp: 0 });
    const recon = computeStatBlock(statContextFromSeat(noEntity))![Stat.MaxHealth];
    expect(intelStatsOf(intelSourceOf(noEntity))!.maxHealth).toBeCloseTo(recon, 6);
  });
});
