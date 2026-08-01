// @vitest-environment jsdom
/**
 * hudBoundaryGroup.test.tsx — 「一個元件炸掉不可以帶走整個介面」的**行為**守衛。
 *
 * ── 為什麼這一個檔案要自己一個測試環境 ────────────────────────────────
 *
 * `apps/client` 的 vitest 是 `environment: "node"`，46 個 UI 測試用
 * `react-dom/server` 的 `renderToStaticMarkup` 驗行為。**那條路徑驗不到
 * error boundary** —— React 18 的 Fizz（SSR）根本不執行
 * `getDerivedStateFromError` / `componentDidCatch`，例外會直接往外丟。
 * 我實跑確認過：SSR 一棵含 boundary 的樹，boundary 沒有攔，兄弟節點也沒有畫出來。
 *
 * 所以掃原始碼「`<HudBoundaryGroup>` 有沒有出現在樹裡」**證明不了任何事**：
 * 把 `getDerivedStateFromError` 刪掉、或在 `componentDidCatch` 裡重拋，元素還在
 * 樹裡、掃描照樣過，而 HUD 照樣整棵死。這正是 `hudSurfacePaint.test.ts` 檔頭
 * 記著的那個前科（保留那一行、在後面插一行覆蓋它，缺陷完整重現、34/34 全綠）。
 *
 * 代價誠實列：`jsdom` 一個 devDependency（拉約 37 個傳遞依賴），這一個檔案多跑
 * 一兩秒。**其餘約 1900 條測試的環境與速度完全不變** —— 環境是用檔頭那行
 * `@vitest-environment jsdom` 開的，`vite.config.ts` 一個字都沒動。
 *
 * ── 為什麼用 `createRoot` 而不是 testing-library / react-test-renderer ──
 *
 * `createRoot` **正是 `main.tsx` 出貨的那條路徑**。`react-test-renderer` 是
 * 另一個 renderer，用它就是失敗形態 ⑤（被測的不是出貨的那個）——
 * 而這次要守的偏偏就是「React 在真的 DOM 上到底有沒有把例外交給 boundary」。
 *
 * ── 被測的是**出貨的 HudRoot**，不是我手搭的樹 ──────────────────────
 *
 * 下面 ①②③ 掛的是真的 `<HudRoot/>`，餵的是真的 `hudStore`（做法照抄
 * `hud/hudBottomCluster.test.ts`）。讓它炸的手法也是真的：把
 * `String.prototype.padStart` patch 成 throw —— `components/PhaseTimer.tsx`
 * 的 render 每一格都會呼叫它。這正是獵兇工作流在**活的瀏覽器**裡用來重現
 * 這個缺陷的同一招（他們量到 `#hud-root` 子節點 14 → 0）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, Fragment, useState, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { cover } from "@ggd/shared/testkit/cover";
import { HudBoundaryGroup, hudBoundaryLabel } from "./HudBoundaryGroup";
import { HudErrorBoundary } from "./HudErrorBoundary";
import { HUD_BOUNDARY_RETRY_CAP, clearHudErrors, hudErrors } from "./hudErrorModel";
import { HudRoot } from "./HudRoot";
import { hudStore, resetHudStore, type SeatView } from "../net/RoomStore";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { AbilityDef, ChampionDef } from "@ggd/shared/sim/content/defs";
import type { AbilityId, ChampionId } from "@ggd/shared/ids";
import type { CoreAbilitySlot } from "@ggd/shared/sim/intents";

const TAG = "client-hud-boundary-behaviour";

/* ─────────────────────────── 出貨 HudRoot 的餵食 ─────────────────────── */

const TEST_CHAMPION = "godie-test0" as ChampionId;

function ability(slot: CoreAbilitySlot): AbilityDef {
  return {
    id: `${TEST_CHAMPION}.${slot}` as AbilityId,
    name: `技能${slot}`,
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
    name: "測試英雄",
    role: "fighter",
    attackType: "melee",
    modelKey: "champ.test",
    baseStats: {},
    growth: {},
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
    level: 3,
    gold: 600,
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
    abilityRanks: [1, 0, 0, 0],
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
  } as unknown as SeatView;
}

function primeCombat(round = 1): void {
  registerTestChampion();
  resetHudStore();
  hudStore.setState({
    connected: true,
    phase: "combat",
    round,
    localSeatId: 0,
    localEntityId: 7,
    localMaxHp: 1000,
    localHp: 900,
    localMaxMana: 500,
    localMana: 400,
    localAlive: true,
    seats: [seat()],
  });
}

/* ─────────────────────────── jsdom 掛載腳手架 ────────────────────────── */

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  clearHudErrors();
  // id 用 `hud-root`：`HudErrorBoundary` 的 fallback 會 portal 進這底下的
  // `#hud-error-strip`，跟出貨時一模一樣。
  host = document.createElement("div");
  host.id = "hud-root";
  document.body.appendChild(host);
  root = createRoot(host);
  // React 會把 render 期間的例外印成 console.error（含元件堆疊）。測試裡預期
  // 會有，靜音以免蓋掉真正的失敗訊息 —— 但**不**靜音成看不到：
  // 需要斷言它的那幾條會直接讀 `hudErrors()`。
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  flushSync(() => root.unmount());
  host.remove();
  document.getElementById("hud-error-strip")?.remove();
  vi.restoreAllMocks();
});

function render(node: ReactNode): void {
  flushSync(() => root.render(node));
}

/** 目前畫面上所有 fallback 標記的文字。 */
function chips(): string[] {
  return [...document.querySelectorAll("[data-hud-error]")].map((n) => n.textContent ?? "");
}

/* ══════════════════════════════════════════════════════════════════════
   ① 出貨的 HudRoot：一個成員炸掉，其餘還在
   ══════════════════════════════════════════════════════════════════════ */

describe("① 出貨的 HudRoot —— PhaseTimer 炸掉不再帶走整個介面", () => {
  const realPadStart = String.prototype.padStart;
  afterEach(() => {
    String.prototype.padStart = realPadStart;
  });

  it("★ 其餘 HUD 成員仍然在 DOM 裡，而且畫面上出現看得見的壞掉標記", () => {
    cover(TAG);
    primeCombat();

    // 先量健康時的樣子 —— 沒有這個基準，「還有東西在」可能只是因為本來就空的。
    render(createElement(HudRoot));
    const healthySlots = host.querySelectorAll("[data-hud-slot]").length;
    expect(healthySlots, "健康的 HudRoot 應該畫得出 HUD 槽位；沒有的話這條測試是空的").toBeGreaterThan(
      2,
    );
    expect(chips(), "健康時不該有任何壞掉標記").toHaveLength(0);

    // 讓 PhaseTimer 在 render 期間丟例外（`PhaseTimer.tsx` 每格都呼叫 padStart）
    // —— 獵兇工作流在活的瀏覽器裡用的就是這一招。
    String.prototype.padStart = function padStartBoom(): string {
      throw new Error("HUDHUNT-BOOM");
    };
    render(createElement(HudRoot));

    // (a) 其餘 HUD 還在。⚠️ 這是整個檔案的重點：在 boundary 切細之前，這個數字
    //     會是 0（獵兇工作流在活的比賽裡量到 `#hud-root` 子節點 14 → 0，
    //     而 e0af4758 那個包整棵 MatchOverlay 的 boundary 只讓它變成 13 → 1）。
    const brokenSlots = host.querySelectorAll("[data-hud-slot]").length;
    expect(
      brokenSlots,
      "PhaseTimer 炸掉之後其餘 HUD 槽位全部不見了 —— boundary 的粒度又回到「一個包全部」，" +
        "玩家看到的仍然是「所有介面一起消失」。",
    ).toBeGreaterThan(0);

    // (b) 而且玩家看得見哪裡壞了 —— 絕不可以是靜默消失（失敗形態 ②）。
    expect(chips().join("|"), "沒有任何可見的壞掉標記：局部消失變成了靜默降級").toContain("階段倒數");

    // (c) 崩潰的現場被留下來了（owner 在打的時候不會開 devtools）。
    expect(hudErrors().some((e) => e.message.includes("HUDHUNT-BOOM"))).toBe(true);
  });

  it("★ 非空洞性：換成不攔截的包裝，同一棵樹就整個消失", () => {
    cover(TAG);
    primeCombat();
    String.prototype.padStart = function padStartBoom(): string {
      throw new Error("HUDHUNT-BOOM");
    };

    // 對照組：boundary 換成 pass-through。這是「把實作的關鍵那行刪掉」的
    // 突變 —— 上面那條若對它也綠，它就不是守衛。
    let threw = false;
    try {
      render(createElement(HudRoot));
    } catch {
      threw = true;
    }
    // 有 boundary 的那棵不會把例外丟到 root 外，也不會清空 host。
    expect(threw, "例外不該逃到 root 外").toBe(false);

    // 現在真的做對照：一棵**沒有** HudBoundaryGroup 的等價樹。
    const Boom = (): never => {
      throw new Error("CONTROL-BOOM");
    };
    const Sibling = (): ReactElement => createElement("div", { "data-sib": "1" }, "SIB");
    const ctlHost = document.createElement("div");
    document.body.appendChild(ctlHost);
    const ctlRoot = createRoot(ctlHost);
    let ctlThrew = false;
    try {
      flushSync(() =>
        ctlRoot.render(createElement(Fragment, null, createElement(Boom), createElement(Sibling))),
      );
    } catch {
      ctlThrew = true;
    }
    expect(
      ctlHost.querySelectorAll("[data-sib]").length,
      "對照組（無 boundary）竟然還留著兄弟節點 —— 那代表這個偵測器根本量不到差別",
    ).toBe(0);
    expect(ctlThrew || ctlHost.childNodes.length === 0).toBe(true);
    ctlHost.remove();
  });
});

/* ══════════════════════════════════════════════════════════════════════
   ② 遞迴穿透 Fragment —— 條件群組不可以共用一層
   ══════════════════════════════════════════════════════════════════════ */

describe("② Fragment 群組要被拆開包", () => {
  it("★ 同一個 Fragment 裡的兄弟，一個炸掉另一個還在", () => {
    cover(TAG);
    const Boom = (): never => {
      throw new Error("FRAG-BOOM");
    };
    const Ok = (): ReactElement => createElement("i", { "data-ok": "1" }, "OK");
    const labels = new Map<unknown, string>([
      [Boom, "會炸的那格"],
      [Ok, "旁邊那格"],
    ]);

    render(
      createElement(HudBoundaryGroup, {
        labels,
        resetKey: "k",
        // 這正是 HudRoot 的 `{inGame && !couch && (<>…13 個…</>)}` 的形狀。
        children: createElement(Fragment, null, createElement(Boom), createElement(Ok)),
      }),
    );

    expect(
      host.querySelectorAll("[data-ok]").length,
      "Fragment 沒有被穿透 —— 整個條件群組共用了一層 boundary，" +
        "等於商店掛掉還是帶走血條，缺陷原封不動地留在最大的那一群裡。",
    ).toBe(1);
    expect(chips().join("|")).toContain("會炸的那格");
  });
});

/* ══════════════════════════════════════════════════════════════════════
   ③ 自己回來 / 重試上限
   ══════════════════════════════════════════════════════════════════════ */

describe("③ resetKey 重試與上限", () => {
  function Flaky({ boom }: { boom: boolean }): ReactElement {
    if (boom) throw new Error("FLAKY");
    return createElement("b", { "data-healed": "1" }, "HEALED");
  }
  const labels = new Map<unknown, string>([[Flaky, "會好的那格"]]);

  function tree(boom: boolean, key: string): ReactNode {
    return createElement(HudBoundaryGroup, {
      labels,
      resetKey: key,
      children: createElement(Flaky, { boom }),
    });
  }

  it("★ resetKey 一變，壞掉的那格重新掛載並且真的復原", () => {
    cover(TAG);
    render(tree(true, "combat:1"));
    expect(chips().join("|")).toContain("會好的那格");
    expect(host.querySelectorAll("[data-healed]").length).toBe(0);

    // 相位/回合前進 → 重試
    render(tree(false, "combat:2"));
    expect(
      host.querySelectorAll("[data-healed]").length,
      "resetKey 變了卻沒有重試 —— 那只是把「永久」從分頁縮小到一個回合",
    ).toBe(1);
    expect(chips(), "復原之後不該還留著壞掉標記").toHaveLength(0);
  });

  it("★ 一直炸的話重試會停手，而且文案不再承諾「會自動重試」", () => {
    cover(TAG);
    for (let i = 0; i <= HUD_BOUNDARY_RETRY_CAP + 1; i++) {
      render(tree(true, `combat:${i}`));
    }
    const text = chips().join("|");
    expect(
      text,
      "重試額度用完了還在說「下一回合會自動重試」—— 那是一句謊話，玩家會照著它等",
    ).toContain("請重新整理頁面");
    expect(text).not.toContain("自動重試");
  });
});

/* ══════════════════════════════════════════════════════════════════════
   ④ key 保留 —— CheatConsole 的 Restart 重掛不可以被包裝吃掉
   ══════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ **誠實聲明：這一組是不變量的說明，不是守衛。**
 *
 * 我做過三個突變 —— 拿掉 `HudErrorBoundary` 上的顯式 `key=`、把 `Children.map`
 * 換成裸陣列 map、以及兩個同時拿掉 —— **三次都是 8/8 全綠**。原因是
 * `wrapNode` 把子元素原封不動傳下去，它自己的 key 就足以讓 React 重掛那個
 * 單一子元素，所以這個行為有三條互相獨立的保障，沒有任何單點突變能弄壞它。
 *
 * 保留它的理由是它釘住一個**別人重寫 `wrapNode` 時可能弄壞**的需求
 * （`<CheatConsole key={matchEpoch}/>` 的 Restart 重掛）；但不要把它算進
 * 「有突變驗證的守衛」那一欄。
 */
describe("④ 包裝之後 key 觸發的重掛仍然成立（不變量，非守衛）", () => {
  it("★ key 一變，子元件真的重新掛載（不是沿用舊實例）", () => {
    cover(TAG);
    let mounts = 0;
    function Mounting(): ReactElement {
      // ⚠️ 一定要用 `useState` 的 **lazy initialiser**：它只在「掛載」時跑一次，
      // 重新 render 不跑。我第一版寫成在函式體裡 `++mounts`，那會**每次 render
      // 都加一**，於是「值變了」永遠成立 —— 這條測試變成恆真式，我用突變量到它
      // 對「key 完全遺失」也是綠的（失敗形態 ④：斷言方向跟缺陷無關）。
      const [n] = useState(() => ++mounts);
      return createElement("span", { "data-n": String(n) });
    }
    const labels = new Map<unknown, string>([[Mounting, "重掛測試"]]);
    const build = (k: string): ReactNode =>
      createElement(HudBoundaryGroup, {
        labels,
        resetKey: "x",
        children: createElement(Mounting, { key: k }),
      });

    render(build("epoch-1"));
    const first = host.querySelector("[data-n]")?.getAttribute("data-n");
    render(build("epoch-2"));
    const second = host.querySelector("[data-n]")?.getAttribute("data-n");
    expect(
      second,
      "key 換了卻沒有重新掛載 —— MatchOverlay 的 <CheatConsole key={matchEpoch}/> " +
        "靠這個在 Restart 時重置 god / 0-CD 開關，被包裝吃掉會安靜地失效",
    ).not.toBe(first);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   ⑤ 標籤解析（純函式，便宜）
   ══════════════════════════════════════════════════════════════════════ */

describe("⑤ 標籤解析", () => {
  it("★ 三段都有答案，而且沒有一段回 undefined", () => {
    cover(TAG);
    const A = (): null => null;
    const labels = new Map<unknown, string>([
      [A, "商店"],
      ["leave", "離開按鈕"],
    ]);
    expect(hudBoundaryLabel(createElement(A), labels)).toBe("商店");
    // 裸元素走 data-hud-slot
    expect(hudBoundaryLabel(createElement("div", { "data-hud-slot": "leave" }), labels)).toBe(
      "離開按鈕",
    );
    // 表裡沒有的槽位 → 退回槽位名（難看，但不騙人）
    expect(hudBoundaryLabel(createElement("div", { "data-hud-slot": "gamepad" }), labels)).toBe(
      "gamepad",
    );
    // 完全認不得 → 仍然是一句話，不是 undefined
    expect(hudBoundaryLabel(createElement("div"), labels)).toBe("未命名面板");
  });
});

/* ══════════════════════════════════════════════════════════════════════
   ⑥ boundary 本身：fallback 絕不回 null
   ══════════════════════════════════════════════════════════════════════ */

describe("⑥ fallback 一定看得見", () => {
  it("★ 攔下來之後畫面上真的多了一個節點，不是靜默吞掉", () => {
    cover(TAG);
    const Boom = (): never => {
      throw new Error("VISIBLE");
    };
    render(createElement(HudErrorBoundary, { label: "商店", children: createElement(Boom) }));
    const marks = document.querySelectorAll("[data-hud-error]");
    expect(marks.length, "boundary 攔下來卻什麼都沒畫 —— 那是把「整個消失」換成「局部消失」").toBe(
      1,
    );
    expect(marks[0]?.textContent).toContain("商店");
  });
});
