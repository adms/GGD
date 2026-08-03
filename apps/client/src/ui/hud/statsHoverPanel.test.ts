// @vitest-environment jsdom
/**
 * statsHoverPanel.test.ts —— 「滑鼠移到右下角 角色頭圖等級金幣區域時 可以顯示
 * 全部屬性能力出來」的**行為**守衛。
 *
 * ── 為什麼這一支要在 jsdom 裡掛真的 HudRoot ──────────────────────────────
 *
 * 這個功能有三個獨立的斷點，而只有最後一個是玩家看得到的：
 *   ① 面板算得出數字        （純模型，node 就驗得到）
 *   ② 面板被掛進出貨的樹裡  （**掃原始碼證明不了**：`hudSurfacePaint.test.ts`
 *      的檔頭記著一次「原始碼還在、掃描全綠、功能整個撤銷」的前科，
 *      `...voicePlayOptions(mix)` 那次是 3,563 條測試全綠）
 *   ③ 滑鼠移過去它真的打開  （沒有 DOM 就沒有 mousemove，`renderToStaticMarkup`
 *      連 `useEffect` 都不執行，所以那條路徑結構上驗不到這件事）
 *
 * 所以下面每一條 ★ 都是：真的 `createRoot` 掛出貨的 `<HudRoot/>` → 真的對
 * `window` 送一個座標落在 `gold-level` 槽位矩形裡的 `mousemove` → 從 DOM 讀
 * **畫面上那個數字的字串**。做法照抄 `hud/hookOrder.test.ts` 與
 * `ui/hudBoundaryGroup.test.ts`（同一個 repo 已經證明可行的那條路）。
 *
 * ── 斷言的是「玩家拿得到的數字」，不是「有呼叫某個函式」 ────────────────
 *
 * 期望值是**手算**的，不是再跑一次 `championSheetRows`（那會讓實作與期望一起
 * 錯 —— 失敗形態 ④）。這一場的設定是：
 *
 *   卡面 maxHealth 500，每級 +40，英雄 3 級   → 基礎 = 500 + 40×2 = **580**
 *   combat-env maxHealth ×3、基礎加成 +300     → 戰鬥實際 = 580×3 + 300 = **2040**
 *
 * 這一對數字同時釘死四件事，每一件都是真的會出錯的方向：
 *   · 讀等級（拿掉 level → 印 500，而玩家是 3 級）
 *   · 倍率在加成之前（寫成 (580+300)×3 → 2640）
 *   · 加成沒被吃掉（寫成 580×3 → 1740）
 *   · 數字真的進了 DOM（面板從樹上拿掉 → 兩個都找不到）
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { cover } from "@ggd/shared/testkit/cover";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { AbilityDef, ChampionDef } from "@ggd/shared/sim/content/defs";
import type { AbilityId, ChampionId } from "@ggd/shared/ids";
import type { CoreAbilitySlot } from "@ggd/shared/sim/intents";
import { DEFAULT_COMBAT_ENV, normalizeCombatEnv } from "@ggd/shared/sim/combatEnv";
import { normalizeBaseBonus } from "@ggd/shared/sim/baseBonus";
import { DEFAULT_STAT_CAPS } from "@ggd/shared/sim/statCaps";
import { DEFAULT_BODY_SCALE_RULES } from "@ggd/shared/sim/bodyScale";
import { zeroAttrBonus } from "@ggd/shared/sim/stats/attributes";
import { HudRoot } from "../HudRoot";
import { hudStore, resetHudStore, type SeatView } from "../../net/RoomStore";
import { resetDisplayEnv } from "../displayFinal";
import { resetDisplayBaseBonus } from "../displayBaseBonus";
import {
  HUD_STATS_FIELDS,
  SHIPPED_HUD_STATS,
  STATS_HOVER_ANCHOR,
  applyHudStatsOverride,
  hudStatsTuning,
  insideStatsAnchor,
  resolveStatsTuning,
  statsHoverModel,
  type HudStatsTuning,
  type StatsHoverSeat,
} from "./StatsHoverPanel";
import {
  HUD_EDGE,
  hudRectInViewport,
  hudRectsOverlap,
  hudSlotBand,
  hudSlotPanelMaxHeight,
  hudSlotPanelOffset,
  hudSlotPanelRect,
  hudSlotRect,
  hudStackEnd,
} from "./hudLayout";

const TAG = "client-hud-stats-hover";

/* ═══════════════════════════════════════════════════════════════════════════
   出貨 HudRoot 的餵食（形狀照抄 ui/hudBoundaryGroup.test.ts）
   ══════════════════════════════════════════════════════════════════════════ */

const TEST_CHAMPION = "godie-stathover" as ChampionId;

/** 手算期望值用的三個常數 —— 底下的斷言不可以改成「再跑一次實作」。 */
const CARD_MAX_HEALTH = 500;
const CARD_HP_GROWTH = 40;
const SEAT_LEVEL = 3;
const ENV_MAX_HEALTH = 3;
const BONUS_MAX_HEALTH = 300;
/** 500 + 40×(3−1) */
const EXPECT_BASE = CARD_MAX_HEALTH + CARD_HP_GROWTH * (SEAT_LEVEL - 1);
/** 580×3 + 300 —— 倍率在前、加成在後、上限最後（sim/baseBonus.finalizeStat） */
const EXPECT_FINAL = EXPECT_BASE * ENV_MAX_HEALTH + BONUS_MAX_HEALTH;

function ability(slot: CoreAbilitySlot): AbilityDef {
  return {
    id: `${TEST_CHAMPION}.${slot}` as AbilityId,
    name: `92-0${"QWER".indexOf(slot) + 1} 測試技能${slot}`,
    slot,
    castType: "self",
    maxRank: 5,
    cooldown: [8, 8, 8, 8, 8],
    manaCost: [50, 50, 50, 50, 50],
    range: 5,
    effects: [],
  } as AbilityDef;
}

function registerTestChampion(): void {
  Champions.register(TEST_CHAMPION, {
    id: TEST_CHAMPION,
    name: "測試英雄·懸停",
    role: "fighter",
    attackType: "melee",
    modelKey: "champ.test",
    // 刻意**沒有** `attributes`：期望值就變成純粹的 卡面 + 每級成長，
    // 手算得出來，而且不依賴 ATTR_STAT_SOURCE 的係數。
    baseStats: { maxHealth: CARD_MAX_HEALTH, ad: 10, armor: 2, ms: 5.8 },
    growth: { maxHealth: CARD_HP_GROWTH },
    abilities: { Q: ability("Q"), W: ability("W"), E: ability("E"), R: ability("R") },
  } as ChampionDef);
}

function seat(): SeatView {
  return {
    seatId: 0,
    teamId: 0,
    displayName: "me",
    connected: true,
    driver: "human",
    championId: TEST_CHAMPION,
    entityId: 7,
    level: SEAT_LEVEL,
    gold: 640,
    xp: 0,
    hp: 900,
    maxHp: 1000,
    mana: 400,
    maxMana: 500,
    shield: 0,
    alive: true,
    zone: 0,
    ready: false,
    unspentPoints: 0,
    items: [],
    augments: [],
    abilityRanks: [2, 1, 0, 0],
    cooldowns: [0, 0, 0, 0],
    exAbilityId: "",
    exRank: 0,
    exCooldown: 0,
    passiveCooldown: 0,
    statStacks: 0,
    statCapstonePct: 0,
    undoDepth: 0,
    roundKills: 0,
    roundDeaths: 0,
    coinsLeft: 0,
    kills: 0,
    deaths: 0,
    offers: [],
  } as unknown as SeatView;
}

function primeCombat(): void {
  registerTestChampion();
  resetHudStore();
  resetDisplayEnv();
  resetDisplayBaseBonus();
  hudStore.setState({
    connected: true,
    phase: "combat",
    round: 3,
    localSeatId: 0,
    localEntityId: 7,
    localMaxHp: 1000,
    localHp: 900,
    localMaxMana: 500,
    localMana: 400,
    localAlive: true,
    seats: [seat()],
    // 這一場的權威表 —— 面板必須讀這兩份（不是內容檔、不是出貨預設）。
    combatEnvJson: JSON.stringify({ maxHealth: ENV_MAX_HEALTH }),
    baseBonusJson: JSON.stringify({ maxHealth: BONUS_MAX_HEALTH }),
    statCapsJson: "",
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   jsdom 掛載腳手架
   ══════════════════════════════════════════════════════════════════════════ */

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  applyHudStatsOverride(null); // 每一條都從出貨值開始
  host = document.createElement("div");
  host.id = "hud-root";
  document.body.appendChild(host);
  root = createRoot(host);
  // HudRoot 的其他成員在 jsdom 裡會噴一些 warning（沒有 canvas / 沒有 audio）。
  // 靜音以免蓋掉真正的失敗訊息；本檔案的斷言全部讀 DOM，不讀 console。
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  flushSync(() => root.unmount());
  host.remove();
  document.getElementById("hud-error-strip")?.remove();
  vi.restoreAllMocks();
});

function render(): void {
  flushSync(() => root.render(createElement(HudRoot)));
}

/** 視窗大小 —— jsdom 預設 1024×768，明講出來讓底下的座標可讀。 */
const VP = { width: 1024, height: 768 };

function moveMouseTo(x: number, y: number): void {
  flushSync(() => {
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true }));
  });
}

/** 畫面上那個抽屜，或 null。 */
function drawer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-hud-drawer="stats-hover"]');
}

/** 落在 `gold-level` 槽位矩形正中央的螢幕座標。 */
function anchorCentre(): { x: number; y: number } {
  const r = hudSlotRect(STATS_HOVER_ANCHOR, VP, false);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/* ══════════════════════════════════════════════════════════════════════
   ① 出貨的 HudRoot：滑到右下角 → 面板出現，而且上面是玩家真的拿到的數字
   ══════════════════════════════════════════════════════════════════════ */

describe("① 懸停右下角頭像/等級/金錢區 → 全部屬性能力出現在畫面上", () => {
  it("★ 一開始沒有面板；滑鼠移進錨點矩形之後，面板帶著 580 / 2040 出現", () => {
    cover(TAG);
    primeCombat();
    render();

    // 沒有這個基準，「面板出現了」可能只是它從一開始就常駐。
    expect(drawer(), "還沒有把滑鼠移過去，面板就已經在畫面上了").toBeNull();
    // 非真空保證：HudRoot 真的畫得出東西（不是整棵樹壞掉才「沒有面板」）。
    expect(
      host.querySelectorAll("[data-hud-slot]").length,
      "HudRoot 一個槽位都沒畫出來 —— 這條測試是空的，不是通過",
    ).toBeGreaterThan(2);

    const c = anchorCentre();
    moveMouseTo(c.x, c.y);

    const panel = drawer();
    expect(panel, "滑鼠已經在 gold-level 槽位的矩形正中央，面板卻沒有出現").not.toBeNull();

    const row = panel!.querySelector<HTMLElement>('[data-stats-hover-row="maxHealth"]');
    expect(row, "面板裡沒有生命上限這一列 —— 「全部屬性」少了最基本的那一條").not.toBeNull();
    const text = row!.textContent ?? "";

    // 基礎欄 = 這個座位**當前等級**的值。印 500 = 只讀了卡面（型錄視角）。
    expect(text, `生命上限那一列讀到「${text}」，裡面應該有 3 級的基礎值 ${EXPECT_BASE}`).toContain(
      String(EXPECT_BASE),
    );
    expect(text, "印的是卡面 500 —— 面板沒有讀這個座位的等級").not.toContain(
      String(CARD_MAX_HEALTH),
    );

    // 戰鬥實際欄 = 倍率之後再加基礎加成，再夾上限（sim 的 finalizeStat）。
    const final = panel!.querySelector<HTMLElement>('[data-stats-hover-final="maxHealth"]');
    expect(final?.textContent, "戰鬥實際那一格不是玩家真的拿到的數字").toBe(String(EXPECT_FINAL));
    // 明確排除另外兩種讀法，否則任何「大一點的合理數字」都會過。
    expect(final?.textContent).not.toBe(String(EXPECT_BASE * ENV_MAX_HEALTH)); // 加成被吃掉
    expect(final?.textContent).not.toBe(
      String((EXPECT_BASE + BONUS_MAX_HEALTH) * ENV_MAX_HEALTH), // 加成被倍率放大
    );
  });

  it("★ 「能力」那一半也在畫面上：六格技能的名字真的印出來了", () => {
    cover(TAG);
    primeCombat();
    render();
    const c = anchorCentre();
    moveMouseTo(c.x, c.y);

    const panel = drawer();
    expect(panel).not.toBeNull();
    const slots = [...panel!.querySelectorAll("[data-stats-hover-ability]")].map(
      (n) => n.getAttribute("data-stats-hover-ability") ?? "",
    );
    expect(slots, "owner 要的是「屬性**能力**」，技能那一半整個不見了").toEqual(
      expect.arrayContaining(["Q", "W", "E", "R"]),
    );
    // 名字要是**去掉 NN-0X 編號之後**的真名（skillRows 的既有行為，重用不重寫）
    expect(panel!.textContent).toContain("測試技能Q");
    expect(panel!.textContent).not.toContain("92-01 測試技能Q");
    // 等級來自這個座位的 abilityRanks（Q=2/5），不是寫死的
    const q = panel!.querySelector<HTMLElement>('[data-stats-hover-ability="Q"]');
    expect(q?.textContent, "技能等級沒有跟著這個座位走").toContain("2/5");
  });

  it("★ 滑鼠離開錨點矩形 → 面板收回去（不是卡在畫面上）", () => {
    cover(TAG);
    primeCombat();
    render();
    const c = anchorCentre();
    moveMouseTo(c.x, c.y);
    expect(drawer()).not.toBeNull();

    // 螢幕正中央 —— 離右下角那一格很遠
    moveMouseTo(VP.width / 2, VP.height / 2);
    expect(drawer(), "滑鼠已經移開，面板還黏在畫面上").toBeNull();
  });

  it("★ 它從來不吃指標事件 —— 右下角那一格按下去仍然是給戰場的", () => {
    cover(TAG);
    primeCombat();
    render();
    const c = anchorCentre();
    moveMouseTo(c.x, c.y);
    const panel = drawer();
    expect(panel).not.toBeNull();
    // 這一條擋的是「用一層透明接收層做 hover」那個很自然但很貴的做法：
    // 那樣整場比賽在右下角按右鍵都不會移動，而且沒有任何東西會紅。
    expect(panel!.style.pointerEvents, "面板會攔截點擊 —— 右下角在戰鬥中就變成死區").toBe(
      "none",
    );
  });

  it("★ 後台把它關掉 → 滑過去什麼都不會出現", () => {
    cover(TAG);
    primeCombat();
    // 第一守則：這是一個欄位，不是寫死的行為。
    expect(applyHudStatsOverride({ enabled: false })).toEqual([]);
    render();
    const c = anchorCentre();
    moveMouseTo(c.x, c.y);
    expect(drawer(), "enabled:false 之下面板還是開了 —— 那個欄位是裝飾品").toBeNull();
  });

  it("★ 後台改「顯示哪些區塊」→ 畫面上真的少那一塊", () => {
    cover(TAG);
    primeCombat();
    applyHudStatsOverride({ sections: ["stats"] });
    render();
    const c = anchorCentre();
    moveMouseTo(c.x, c.y);
    const panel = drawer();
    expect(panel).not.toBeNull();
    expect(panel!.querySelector('[data-stats-hover-row="maxHealth"]')).not.toBeNull();
    expect(
      panel!.querySelectorAll("[data-stats-hover-ability]").length,
      "sections 只留了 stats，技能區塊還是畫出來了",
    ).toBe(0);
  });

  it("★ 後台關掉「戰鬥實際」那一欄 → 那一欄從畫面上消失（其他欄還在）", () => {
    cover(TAG);
    primeCombat();
    applyHudStatsOverride({ showBattleFinal: false });
    render();
    const c = anchorCentre();
    moveMouseTo(c.x, c.y);
    const panel = drawer();
    expect(panel).not.toBeNull();
    expect(panel!.querySelector('[data-stats-hover-final="maxHealth"]')).toBeNull();
    expect(panel!.querySelector('[data-stats-hover-row="maxHealth"]')?.textContent).toContain(
      String(EXPECT_BASE),
    );
  });

  it("★ hiddenStats 真的把那一列拿掉", () => {
    cover(TAG);
    primeCombat();
    applyHudStatsOverride({ hiddenStats: ["maxHealth"] });
    render();
    const c = anchorCentre();
    moveMouseTo(c.x, c.y);
    const panel = drawer();
    expect(panel).not.toBeNull();
    expect(panel!.querySelector('[data-stats-hover-row="maxHealth"]')).toBeNull();
    expect(
      panel!.querySelector('[data-stats-hover-row="armor"]'),
      "hiddenStats 把整張表都殺掉了 —— 它應該只拿掉指名的那幾條",
    ).not.toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════
   ② 純模型：讀的是這個座位的等級與買到的三圍，不是型錄
   ══════════════════════════════════════════════════════════════════════ */

function tables(tuning: HudStatsTuning = SHIPPED_HUD_STATS) {
  return {
    env: normalizeCombatEnv({ maxHealth: ENV_MAX_HEALTH }),
    baseBonus: normalizeBaseBonus({ maxHealth: BONUS_MAX_HEALTH }),
    caps: DEFAULT_STAT_CAPS,
    bodyScaleRules: DEFAULT_BODY_SCALE_RULES,
    tuning,
  };
}

function modelSeat(over: Partial<StatsHoverSeat> = {}): StatsHoverSeat {
  return { ...(seat() as unknown as StatsHoverSeat), ...over };
}

describe("② statsHoverModel —— 面板的內容是這個座位的現況", () => {
  it("★ 等級越高，基礎值跟著長（型錄視角會停在 500）", () => {
    cover(TAG);
    registerTestChampion();
    const at = (level: number): number =>
      statsHoverModel(modelSeat({ level }), tables())!.stats.find((r) => r.key === "maxHealth")!
        .base as number;
    expect(at(1)).toBe(CARD_MAX_HEALTH);
    expect(at(3)).toBe(EXPECT_BASE);
    expect(at(5)).toBe(CARD_MAX_HEALTH + CARD_HP_GROWTH * 4);
  });

  it("★ 沒選英雄 / 註冊表裡沒有這個 id → null（是狀態，不是錯誤）", () => {
    cover(TAG);
    registerTestChampion();
    expect(statsHoverModel(modelSeat({ championId: "" }), tables())).toBeNull();
    expect(statsHoverModel(modelSeat({ championId: "godie-nope" }), tables())).toBeNull();
  });

  it("★ 這一場買到的三圍會顯示，而且沒有三圍區塊的英雄也算得到", () => {
    cover(TAG);
    registerTestChampion();
    // 這張卡刻意沒有 attributes；#260 之後買到的點仍然是這個實體的事實。
    const none = statsHoverModel(modelSeat(), tables())!;
    expect(none.attributes, "沒買也沒有三圍區塊 → 不畫那一行").toEqual([]);

    const bought = statsHoverModel(modelSeat({ attrBonus: [6, 0, 0] }), tables())!;
    const str = bought.attributes.find((a) => a.key === "str");
    expect(str, "買了 6 點力量，三圍那一行整個不見了").toBeDefined();
    expect(str!.total).toBe(6);
    expect(str!.bought).toBe(6);
  });

  it("★ maxAbilityRows 是上界，不是建議", () => {
    cover(TAG);
    registerTestChampion();
    const { tuning } = resolveStatsTuning({ maxAbilityRows: 2 });
    expect(statsHoverModel(modelSeat(), tables(tuning))!.abilities).toHaveLength(2);
    expect(statsHoverModel(modelSeat(), tables())!.abilities.length).toBeGreaterThan(2);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   ③ 欄位表：上下界都在，而且被夾的時候會**說出來**（#279）
   ══════════════════════════════════════════════════════════════════════ */

describe("③ HUD_STATS_FIELDS / resolveStatsTuning", () => {
  it("★ 每一個數字欄位同時有 min 與 max", () => {
    cover(TAG);
    const numeric = HUD_STATS_FIELDS.filter((f) => f.min !== undefined || f.max !== undefined);
    expect(numeric.length, "一個數字欄位都沒有 —— 這條掃描壞了").toBeGreaterThan(2);
    for (const f of numeric) {
      expect(f.min, `${f.key} 沒有下界`).toBeTypeOf("number");
      // 上界才是真正常被漏掉的那一半：50 打成 500 會過後台，然後在下游被靜默夾掉。
      expect(f.max, `${f.key} 沒有上界 —— 320 打成 3200 會蓋住整個戰場`).toBeTypeOf("number");
      expect(f.max!).toBeGreaterThan(f.min!);
    }
  });

  it("★ 每一個欄位都在 HudStatsTuning 上，而且出貨值合法", () => {
    cover(TAG);
    const keys = HUD_STATS_FIELDS.map((f) => f.key).sort();
    expect(keys).toEqual((Object.keys(SHIPPED_HUD_STATS) as (keyof HudStatsTuning)[]).sort());
    // 出貨值餵回去必須零投訴，否則出貨的那一份本身就是違規的。
    expect(resolveStatsTuning(SHIPPED_HUD_STATS).problems).toEqual([]);
    expect(resolveStatsTuning(SHIPPED_HUD_STATS).tuning).toEqual(SHIPPED_HUD_STATS);
  });

  it("★ 超界會被夾住，而且回報夾了什麼（不是靜默吞掉）", () => {
    cover(TAG);
    const { tuning, problems } = resolveStatsTuning({ widthPx: 3200, holdMs: 1 });
    expect(tuning.widthPx).toBe(560);
    expect(tuning.holdMs).toBe(120);
    expect(problems.map((p) => p.key).sort()).toEqual(["holdMs", "widthPx"]);
    expect(problems.find((p) => p.key === "widthPx")!.used).toBe(560);
  });

  it("★ 認不得的值退回出貨值並回報，不會把面板變成壞掉的樣子", () => {
    cover(TAG);
    const { tuning, problems } = resolveStatsTuning({
      desktopTrigger: "telepathy" as never,
      sections: ["stats", "nope"] as never,
      openFrom: "sideways" as never,
    });
    expect(tuning.desktopTrigger).toBe(SHIPPED_HUD_STATS.desktopTrigger);
    expect(tuning.sections).toEqual(SHIPPED_HUD_STATS.sections);
    expect(tuning.openFrom).toBe(SHIPPED_HUD_STATS.openFrom);
    expect(problems.map((p) => p.key).sort()).toEqual(["desktopTrigger", "openFrom", "sections"]);
  });

  it("★ applyHudStatsOverride(null) 回到出貨值", () => {
    cover(TAG);
    applyHudStatsOverride({ widthPx: 240 });
    expect(hudStatsTuning().widthPx).toBe(240);
    applyHudStatsOverride(null);
    expect(hudStatsTuning()).toEqual(SHIPPED_HUD_STATS);
  });

  it("★ 觸控出貨是關的 —— 右下角在手機上是技能弧", () => {
    cover(TAG);
    // 這是一個**被記錄下來的決定**，不是忘了做：長按的實作在，欄位在，
    // 出貨值選 off 的理由寫在 StatsHoverPanel 的檔頭 ③。
    expect(SHIPPED_HUD_STATS.touchTrigger).toBe("off");
    expect(HUD_STATS_FIELDS.find((f) => f.key === "touchTrigger")?.values).toContain("hold");
    expect(SHIPPED_HUD_STATS.desktopTrigger).toBe("hover"); // owner 要的是滑鼠
  });
});

/* ══════════════════════════════════════════════════════════════════════
   ④ 幾何：抽屜留在畫面裡、不擠壓右下角那一欄
   ══════════════════════════════════════════════════════════════════════ */

const GUARD_VIEWPORTS = [
  { width: 1546, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 812, height: 375 },
  { width: 780, height: 360 },
] as const;

describe("④ 抽屜的幾何（hudLayout.hudSlotPanel*）", () => {
  it("★ 它不是槽位：右下角的槽位清單一個字都沒變", () => {
    cover(TAG);
    // 加進 HUD_SLOTS 會直接讓 hudLayout.test.ts 的「gold-level / minimap /
    // equipment」那條紅掉，而且會把裝備列擠出 780×360 的畫面。
    expect(hudStackEnd("bottom-right", false)).toBe(hudSlotBand("equipment", false).end);
  });

  it("★ 從錨點展開：起點就在頭像框上緣再一個間距，永遠有位置", () => {
    cover(TAG);
    expect(hudSlotPanelOffset(STATS_HOVER_ANCHOR, false, "anchor")).toBe(
      hudSlotBand(STATS_HOVER_ANCHOR, false).end + 8,
    );
    for (const vp of GUARD_VIEWPORTS) {
      expect(
        hudSlotPanelMaxHeight(STATS_HOVER_ANCHOR, vp, false, "anchor"),
        `${vp.width}x${vp.height} 連一行都放不下`,
      ).toBeGreaterThan(80);
    }
  });

  it("★ 「不蓋任何東西」那個模式在矮螢幕上真的沒有位置 —— 所以它不是預設", () => {
    cover(TAG);
    // 這一條把檔頭裡的理由變成量到的事實：780×360 之下 stack 模式剩不到一行，
    // 拿它當預設就等於「做了但玩家永遠看不到」。
    expect(
      hudSlotPanelMaxHeight(STATS_HOVER_ANCHOR, { width: 780, height: 360 }, false, "stack"),
    ).toBeLessThan(20);
    expect(SHIPPED_HUD_STATS.openFrom).toBe("anchor");
  });

  it("★ 每個守衛視窗:抽屜完整留在畫面裡,而且不碰錨點自己那一格", () => {
    cover(TAG);
    const want = { w: SHIPPED_HUD_STATS.widthPx, h: SHIPPED_HUD_STATS.maxHeightPx };
    for (const vp of GUARD_VIEWPORTS) {
      const r = hudSlotPanelRect(STATS_HOVER_ANCHOR, vp, want, false, "anchor");
      expect(hudRectInViewport(r, vp), `${vp.width}x${vp.height}: 抽屜跑出畫面 ${JSON.stringify(r)}`).toBe(
        true,
      );
      expect(
        hudRectsOverlap(r, hudSlotRect(STATS_HOVER_ANCHOR, vp, false)),
        `${vp.width}x${vp.height}: 抽屜蓋住了它自己的錨點 —— 玩家會看不到金錢/等級`,
      ).toBe(false);
      expect(r.x, "右邊界沒有貼齊 HUD_EDGE").toBe(vp.width - HUD_EDGE - r.w);
    }
  });

  it("★ 命中測試讀的是槽位登錄表的矩形（錨點搬家，命中區跟著搬）", () => {
    cover(TAG);
    const r = hudSlotRect(STATS_HOVER_ANCHOR, VP, false);
    expect(insideStatsAnchor(r.x + 1, r.y + 1, VP, false)).toBe(true);
    expect(insideStatsAnchor(r.x + r.w / 2, r.y + r.h / 2, VP, false)).toBe(true);
    expect(insideStatsAnchor(r.x - 2, r.y + 2, VP, false)).toBe(false);
    expect(insideStatsAnchor(VP.width / 2, VP.height / 2, VP, false)).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   ⑤ 非真空:期望值真的是「手算的」而不是抄實作
   ══════════════════════════════════════════════════════════════════════ */

describe("⑤ 這一組期望值本身是對的", () => {
  it("★ 580 / 2040 的三個輸入都不是預設值（否則上面每一條都在驗恆等式）", () => {
    cover(TAG);
    expect(SEAT_LEVEL).toBeGreaterThan(1);
    expect(ENV_MAX_HEALTH).not.toBe(DEFAULT_COMBAT_ENV.maxHealth);
    expect(BONUS_MAX_HEALTH).toBeGreaterThan(0);
    expect(EXPECT_BASE).toBe(580);
    expect(EXPECT_FINAL).toBe(2040);
    // 三種錯誤讀法各自給不同的數字 —— 這是上面 not.toBe 有意義的前提。
    expect(new Set([EXPECT_FINAL, EXPECT_BASE * ENV_MAX_HEALTH, (EXPECT_BASE + 300) * 3]).size).toBe(
      3,
    );
    expect(zeroAttrBonus()).toEqual({ str: 0, agi: 0, int: 0 });
  });
});
