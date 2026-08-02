// @vitest-environment jsdom
/**
 * ValhallaPanelMount.test — 英靈殿的**接線**守衛（GH#254 試放空間 + GH#256 宣言）。
 *
 * ---------------------------------------------------------------------------
 * 這個檔案存在的理由：對抗複驗量到的一個洞
 * ---------------------------------------------------------------------------
 * 2026-08-02 的複驗把 `<ValhallaSandboxPanel/>` 整段從 `ValhallaPanel.tsx` 刪掉，
 * **48 條測試全綠**。也就是說整個試放空間可以從畫面上消失而沒有任何一條守衛會叫
 * —— CLAUDE.md 的失敗形態 ③（可以從渲染樹刪掉但測試還是全綠）。
 *
 * 原因很單純：`valhallaSandbox.test.ts` 證明的是「引擎會算」，
 * `valhallaDeclaration.test.ts` 證明的是「函式會播」，**沒有一條**證明
 * 「大廳那張卡真的會把它們掛出來」。所以這裡掛的是出貨的 `<ValhallaPanel/>` 本人，
 * 讀的是**真的 DOM**（不是掃原始碼字串 —— 形態 ⑥），按的是它自己畫出來的按鈕。
 *
 * 三件被釘住的事：
 *   ① 按下「⚔ 試放技能」之後，DOM 上真的多出一個 `[data-ggd-valhalla-sandbox]`，
 *     而且掛的是**現在展示中的那一隻**的 id。
 *   ② 引擎算出來的 `dummyHits` 真的變成畫面上的 `data-ggd-sandbox-damage`
 *     （形態 ②「算出來了但從沒送到消費端」）。斷言不是「有個數字」而是
 *     **畫面上的數字總和 = 假人真的掉的血**，所以一個畫死數字的假面板過不了。
 *   ③ 輪播換人的那一刻，宣言真的被呼叫，而且帶的是**新那一隻**的 id（GH#256）。
 *
 * ---------------------------------------------------------------------------
 * 餵給它的是真的東西，只有兩樣被換掉
 * ---------------------------------------------------------------------------
 *   · `StorePreviewCanvas` → 一個 stub div。它是 Babylon/WebGL，jsdom 裡開不起來，
 *     而且這個檔案要驗的不是 3D（那一層由 #129 的守衛與瀏覽器截圖負責）。
 *   · `audio/championVoice` → 一個 spy。真的播聲音會違反 #62（背景 agent 不准
 *     在使用者機器上出聲），而 spy 正好是「宣言帶的是哪一隻的 id」的量尺。
 *
 * 其他全部是出貨的：真的 `SimWorld`（假人、傷害、復活全是真的 sim）、真的
 * `Champions` registry、真的 `useWhitelist` / `useLobbyCombatEnv`（fetch 失敗 →
 * NO_FILTER + 內容預設值，也就是 `pnpm dev` 的那條路）。
 *
 * ⚠️ 用 jsdom + `createRoot` 是因為 `apps/client` 的 vitest 是 `environment: "node"`，
 * UI 測試走 `renderToStaticMarkup` —— 那條路**不執行 useEffect、也不執行 onClick**，
 * 量不到「掛上去了沒」。前例：`ui/hudBoundaryGroup.test.ts`、
 * `ui/panels/champSelectRandomOwnership.test.ts`（`vite.config.ts` 一個字都沒動）。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HttpContentSource } from "@ggd/shared/content";
import { Champions } from "@ggd/shared/sim/content/registry";
import { registerChampion, type AbilityDef, type ChampionDef } from "@ggd/shared/sim";
import type { AbilityId, ChampionId, ItemId } from "@ggd/shared/ids";

// React 18 要這面旗子才會讓 act() 收掉警告橫幅。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── 被換掉的那兩樣 ──────────────────────────────────────────────────────────
vi.mock("../StorePreviewCanvas", async () => {
  const react = await import("react");
  return {
    StorePreviewCanvas: (p: { modelKey: string | null }) =>
      react.createElement("div", { "data-ggd-stub-preview": p.modelKey ?? "none" }),
  };
});

const voiceSpy = vi.fn<(id: string) => Promise<boolean>>();
vi.mock("../../../audio/championVoice", () => ({
  playChampionSelectVoice: (id: string) => voiceSpy(id),
}));

const { ValhallaPanel } = await import("../ValhallaPanel");
const { ensureContentLoaded, __resetContentBoot } = await import("../../../content/bootContent");
const { __resetWhitelistCache } = await import("../../panels/whitelist");
const { __resetLobbyCombatEnv } = await import("../lobbyCombatEnv");

// ── 兩隻測試英雄（兩隻才驗得到「換人」）────────────────────────────────────
const ID_A = "test-valhalla-panel-a" as ChampionId;
const ID_B = "test-valhalla-panel-b" as ChampionId;

/** 一發打得到、打得痛、整數傷害的單體技 —— 整數是為了讓「掉血 = 畫面數字」可以精確比對。 */
function nuke(owner: string): AbilityDef {
  return {
    id: `test.valhallaPanel.${owner}.q` as AbilityId,
    name: "試放用單體技",
    slot: "Q",
    castType: "targeted",
    maxRank: 4,
    cooldown: [1, 1, 1, 1],
    manaCost: [0, 0, 0, 0],
    range: 20,
    targetsEnemies: true,
    effects: [{ kind: "damage", damageType: "true", amount: { flat: 250 } }],
  } as unknown as AbilityDef;
}

function filler(owner: string, slot: "W" | "E" | "R"): AbilityDef {
  return {
    id: `test.valhallaPanel.${owner}.${slot.toLowerCase()}` as AbilityId,
    name: slot,
    slot,
    castType: "self",
    maxRank: 4,
    cooldown: [1, 1, 1, 1],
    manaCost: [0, 0, 0, 0],
    range: 1,
    effects: [{ kind: "heal", amount: { flat: 1 } }],
  } as unknown as AbilityDef;
}

function champ(id: ChampionId, owner: string): ChampionDef {
  return {
    id,
    name: `試放面板測試英雄 ${owner}`,
    description: "測試用描述。",
    role: "fighter",
    attackType: "melee",
    modelKey: "champ.thorne",
    baseStats: {
      maxHealth: 660,
      healthRegen: 1.7,
      maxMana: 500,
      manaRegen: 1.36,
      ad: 40,
      ap: 0,
      armor: 5,
      mr: 28,
      as: 0.53,
      ms: 5.8,
      critChance: 0,
      critDamage: 1.75,
      cdr: 0,
      lifesteal: 0,
      range: 1.6,
    },
    growth: {},
    skillOrder: ["Q", "W", "E", "R"],
    buildPriority: [] as ItemId[],
    abilities: {
      Q: nuke(owner),
      W: filler(owner, "W"),
      E: filler(owner, "E"),
      R: filler(owner, "R"),
    },
  } as unknown as ChampionDef;
}

/** 404 一切 → ContentLoader 走 skeleton fallback，但 readiness 照樣翻成 ready
 *  （和 `ContentGate.test.ts` 同一招）。之後我們把 registry 清掉換成自己的兩隻。 */
const notFound = (() =>
  Promise.resolve({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch;

let host: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  __resetContentBoot();
  await ensureContentLoaded({
    source: new HttpContentSource({ baseUrl: "/content", fetchFn: notFound }),
  });
  Champions.clear();
  registerChampion(champ(ID_A, "a"), { overrideAbilities: true });
  registerChampion(champ(ID_B, "b"), { overrideAbilities: true });
});

beforeEach(() => {
  voiceSpy.mockReset();
  voiceSpy.mockResolvedValue(true);
  __resetWhitelistCache();
  __resetLobbyCombatEnv();
  // 平台掛掉 → 白名單 NO_FILTER（全開）、combat-env 退回內容預設值。
  vi.stubGlobal("fetch", async () => {
    throw new Error("no platform");
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function render(props: { declaimOnRotate?: boolean } = {}): void {
  act(() => {
    root.render(createElement(ValhallaPanel, props));
  });
}

/** 讓 whitelist / combat-env 的 promise 鏈跑完（都是 microtask，不需要假時鐘）。 */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** 真的點畫面上那顆按鈕。找不到就直接爆 —— 按鈕不見了本身就是缺陷。 */
function click(selector: string): void {
  const el = host.querySelector(selector);
  if (!el) throw new Error(`${selector} 沒有被畫出來`);
  act(() => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
}

/** 現在展示中的英雄 id（讀卡片自己公布到 DOM 的那一格）。 */
function onStage(): string {
  const card = host.querySelector("[data-ggd-valhalla]");
  if (!card) throw new Error("英靈殿的卡片沒有被畫出來");
  return card.getAttribute("data-ggd-valhalla") ?? "";
}

function sandboxEl(): Element {
  const el = host.querySelector("[data-ggd-valhalla-sandbox]");
  if (!el) throw new Error("試放空間沒有被掛上去");
  return el;
}

/** 讓面板自己的 30Hz 迴圈真的跑幾拍（真時鐘 —— 那個 interval 是元件自己開的）。 */
async function pump(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

describe("GH#254 試放空間真的掛在英靈殿上（不是只存在於引擎裡）", () => {
  it("★ 按下「⚔ 試放技能」→ DOM 上真的多出試放空間，掛的是現在展示的那一隻", async () => {
    render();
    await settle();

    // 預設關著（開一個真的 SimWorld 是玩家自己按的動作，不是大廳的常駐開銷）
    expect(host.querySelector("[data-ggd-valhalla-sandbox]")).toBeNull();

    const shown = onStage();
    expect([ID_A, ID_B] as string[]).toContain(shown);

    click("[data-ggd-valhalla-sandbox-open]");

    // ⛔ 把 `<ValhallaSandboxPanel/>` 從 ValhallaPanel.tsx 刪掉，這一行就是紅的那一行。
    const sb = sandboxEl();
    expect(sb.getAttribute("data-ggd-valhalla-sandbox")).toBe(shown);
    // 而且掛的是**真的 sandbox**：假人以 owner 明說的 10,000 滿血進場。
    // 一個只畫殼的假面板答不出這個數字。
    expect(sb.getAttribute("data-ggd-sandbox-dummy-hp")).toBe("10000");
    expect(sb.getAttribute("data-ggd-sandbox-dummy-alive")).toBe("1");
    // 六格按鈕也真的在（owner 的 天生技/Q/W/E/R/EX 順序由 #192 的守衛管）
    expect(host.querySelectorAll("[data-ggd-sandbox-slot]").length).toBe(6);
  });

  it("★ 引擎算出來的 dummyHits 真的變成畫面上的 data-ggd-sandbox-damage，而且對得上掉血", async () => {
    render();
    await settle();
    click("[data-ggd-valhalla-sandbox-open]");
    expect(sandboxEl().getAttribute("data-ggd-sandbox-dummy-hp")).toBe("10000");

    // 真的按畫面上的 Q（不是直接呼叫 sandbox.cast —— 那樣就繞過了要驗的那一段）
    click('[data-ggd-sandbox-slot="Q"]');

    // 施法有前搖，所以讓面板自己的 30Hz 迴圈跑到浮動數字出現為止。
    // 一發現就停 —— 浮動數字有 900ms 壽命，跑過頭會把證據沖掉。
    for (let i = 0; i < 40 && host.querySelector("[data-ggd-sandbox-damage]") === null; i++) {
      await pump(40);
    }

    const nodes = [...host.querySelectorAll("[data-ggd-sandbox-damage]")];
    expect(nodes.length).toBeGreaterThan(0);

    const shownTotal = nodes.reduce(
      (sum, n) => sum + Number(n.getAttribute("data-ggd-sandbox-damage")),
      0,
    );
    const hpNow = Number(sandboxEl().getAttribute("data-ggd-sandbox-dummy-hp"));

    // ② 「算出來了但從沒送到消費端」的正面斷言：畫面上的數字不是裝飾，
    //    它等於假人在真的 sim 裡真的少掉的血。
    expect(shownTotal).toBeGreaterThan(0);
    expect(10_000 - hpNow).toBe(shownTotal);
    expect(hpNow).toBeLessThan(10_000);
  });
});

describe("GH#256 英靈殿展示的時候發出該角色自己的語音宣言", () => {
  it("★ 輪播換人 → 宣言被呼叫，而且帶的是**新那一隻**的 id", async () => {
    render();
    await settle();

    const first = onStage();
    // 第一次上台就要出聲（owner 說的是「展示的時候」，不是「換第二次之後」）
    expect(voiceSpy.mock.calls.map((c) => c[0])).toEqual([first]);

    click("[data-ggd-valhalla-next]");
    const second = onStage();
    // 兩隻的 roster，shuffle bag 保證不會連續同一隻
    expect(second).not.toBe(first);

    // ⛔ 把 ValhallaPanel 裡那個 `void playValhallaDeclaration(current)` 刪掉，
    //    這一行就是紅的那一行。傳常數 / 傳上一隻也一樣紅。
    expect(voiceSpy.mock.calls.map((c) => c[0])).toEqual([first, second]);
  });

  it("同一隻停在台上時不會一直重播（宣言掛在換人，不是掛在 render）", async () => {
    render();
    await settle();
    const before = voiceSpy.mock.calls.length;
    // 逼幾次 re-render：滑鼠進出會改 `engaged` state
    for (let i = 0; i < 3; i++) {
      act(() => {
        host
          .querySelector("[data-ggd-valhalla]")!
          .dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true }));
      });
      await pump(10);
    }
    expect(voiceSpy.mock.calls.length).toBe(before);
  });

  it("`declaimOnRotate={false}` 真的關得掉 —— 這一格是開關，不是裝飾", async () => {
    render({ declaimOnRotate: false });
    await settle();
    click("[data-ggd-valhalla-next]");
    expect(voiceSpy).not.toHaveBeenCalled();
  });
});
