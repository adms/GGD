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
 *     ⭐ GH#1250：stub 可以（非同步地，跟真的畫布一樣）回報「舞台真的載入的那份模型文件」，
 *     用來驗 🎭 替身徽章有沒有接上 `onModelDoc`。
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
import { HttpContentSource, Models } from "@ggd/shared/content";
import { readShippedModelDocs } from "@ggd/shared/testkit/shippedModelDocs";
import { Champions } from "@ggd/shared/sim/content/registry";
import { registerChampion, type AbilityDef, type ChampionDef } from "@ggd/shared/sim";
import type { AbilityId, ChampionId, ItemId } from "@ggd/shared/ids";

// React 18 要這面旗子才會讓 act() 收掉警告橫幅。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── 被換掉的那兩樣 ──────────────────────────────────────────────────────────
/** GH#1250：stub 要回報的「已載入模型文件」；null ＝ 不回報（舞台停在 loading，與改動前一樣）。 */
let stubLoadedDoc: { glbPath: string } | null = null;
vi.mock("../StorePreviewCanvas", async () => {
  const react = await import("react");
  return {
    StorePreviewCanvas: (p: {
      modelKey: string | null;
      onStatus?: (s: "ready") => void;
      onModelDoc?: (doc: { glbPath: string }) => void;
    }) => {
      const { onStatus, onModelDoc } = p;
      react.useEffect(() => {
        const doc = stubLoadedDoc;
        if (doc === null) return;
        // 非同步 —— 真的畫布是 fetch 之後才回報；同步回報會被父層「換人就重設」的 effect 蓋掉
        const t = setTimeout(() => {
          onModelDoc?.(doc);
          onStatus?.("ready");
        }, 0);
        return () => clearTimeout(t);
      }, [p.modelKey, onStatus, onModelDoc]);
      return react.createElement("div", { "data-ggd-stub-preview": p.modelKey ?? "none" });
    },
  };
});

const voiceSpy = vi.fn<(id: string) => Promise<boolean>>();
vi.mock("../../../audio/championVoice", () => ({
  playChampionSelectVoice: (id: string) => voiceSpy(id),
}));

const { ValhallaPanel } = await import("../ValhallaPanel");
type ValhallaHoverRules = import("./valhallaHoverPop").ValhallaHoverRules;
const { ChampionProfile } = await import("../../panels/champselect/ProfileBlock");
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
    // GH#1258：帶 `NN-0X` 編號 —— 卡片的技能列要印去編號的名字（下面的 DOM 守衛讀它）
    name: "90-01 試放用單體技",
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
    // GH#1258：舊式天生技區塊（帶編號）⇒ 技能列第一格要印「天生」而不是字面 PASSIVE
    passive: { name: "90-00 試放天生" },
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
  // GH#1250：兩位測試英雄穿 `champ.thorne` —— 出貨的那份模型文件（通用身體包）灌進 registry，
  //   徽章在「舞台還沒回報」時的退路才有真的資料可讀。
  Models.register(readShippedModelDocs().get("champ.thorne")!);
  registerChampion(champ(ID_A, "a"), { overrideAbilities: true });
  registerChampion(champ(ID_B, "b"), { overrideAbilities: true });
});

beforeEach(() => {
  stubLoadedDoc = null;
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

function render(props: { declaimOnRotate?: boolean; hoverPop?: Partial<ValhallaHoverRules> } = {}): void {
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

describe("GH#1258 / GH#1250 卡片上印的字與徽章真的接到畫面（DOM 級，⛔ 不是只驗純函式）", () => {
  // 審查 2026-09-15：四個接線點（出身行 render 條件、技能列印 chip.key、兩處 onModelDoc）改壞，
  // 純函式閘 45/45 全綠。這一組讀的是**畫出來的 DOM**。
  const OVERLAY = { glbPath: "assets/blizzard-local/H000.glb" };
  const STOCK = { glbPath: "assets/models/champions/blocky-knight.glb" };

  it("★ 出身行在沒填 playstyle／pitch 的英雄上照樣畫", async () => {
    render();
    await settle();
    const pitch = host.querySelector("[data-ggd-valhalla-pitch]");
    // ⛔ 把 render 條件改回「playstyle 或 pitch 有值才畫」⇒ 這一行紅（夾具兩者都沒填，下一行是前提）
    expect(pitch, "出身行沒有畫出來").not.toBeNull();
    expect(pitch!.children.length, "夾具前提：playstyle／pitch 都沒填").toBe(1);
    expect(pitch!.textContent!.trim()).not.toBe("");
  });

  it("★ 技能列印「天生」與去編號的名字", async () => {
    render();
    await settle();
    const chips = [...host.querySelectorAll("[data-ggd-valhalla-skill]")].map((el) => [
      el.querySelector("b")?.textContent,
      el.querySelector("span")?.textContent,
    ]);
    // ⛔ 技能列改印 chip.key（`PASSIVE-90-00 …`）或 rawName ⇒ 這一行紅
    expect(chips).toEqual([["天生", "試放天生"], ["Q", "試放用單體技"], ["W", "W"], ["E", "E"], ["R", "R"]]);
  });

  it("★ 英靈殿徽章看舞台回報的那份模型文件：通用身體 ⇒ 亮；overlay 換成原作 ⇒ 熄", async () => {
    stubLoadedDoc = STOCK;
    render();
    await settle();
    await pump(20);
    expect(host.querySelector("[data-ggd-valhalla-standin]"), "量尺自證：徽章亮得起來").not.toBeNull();
    act(() => root.unmount());
    root = createRoot(host);
    stubLoadedDoc = OVERLAY;
    render();
    await settle();
    await pump(20);
    // ⛔ 拿掉 ValhallaStage 的 onModelDoc ⇒ 退回出貨 modelKey（通用身體）⇒ 徽章照亮 ⇒ 這一行紅
    expect(host.querySelector("[data-ggd-valhalla-standin]")).toBeNull();
  });

  it("★ 選人畫面徽章同一條：overlay 換成原作 ⇒ 熄；通用身體 ⇒ 亮", async () => {
    stubLoadedDoc = OVERLAY;
    act(() => root.render(createElement(ChampionProfile, { championId: ID_A })));
    await pump(20);
    // ⛔ 拿掉 ProfileStageModel 的 onModelDoc ⇒ 這一行紅
    expect(host.querySelector("[data-ggd-profile-standin]")).toBeNull();
    act(() => root.unmount());
    root = createRoot(host);
    stubLoadedDoc = STOCK;
    act(() => root.render(createElement(ChampionProfile, { championId: ID_A })));
    await pump(20);
    expect(host.querySelector("[data-ggd-profile-standin]"), "量尺自證：徽章亮得起來").not.toBeNull();
  });
});

describe("GH#1264 hover 放大 —— 讀畫出來的 DOM（⛔ 不是只驗幾何純函式）", () => {
  /** 大廳量級的舞台框。jsdom 沒有排版引擎 ⇒ 這一格就是「瀏覽器量到的尺寸」。 */
  const SLOT = { x: 56, y: 150, width: 240, height: 168 };
  let realRect: () => DOMRect;

  beforeEach(() => {
    realRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
      if (!this.hasAttribute("data-ggd-valhalla-stage-slot")) return realRect.call(this);
      return { ...SLOT, left: SLOT.x, top: SLOT.y, right: SLOT.x + SLOT.width, bottom: SLOT.y + SLOT.height, toJSON: () => ({}) } as DOMRect;
    };
  });
  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = realRect;
  });

  const stage = (): HTMLElement => {
    const el = host.querySelector<HTMLElement>("[data-ggd-valhalla-stage]");
    if (!el) throw new Error("3D 舞台沒有被畫出來");
    return el;
  };
  const hover = async (name: "pointerover" | "pointerout"): Promise<void> => {
    act(() => {
      stage().dispatchEvent(new window.MouseEvent(name, { bubbles: true }));
    });
    await pump(10);
  };

  it("★ 滑鼠移入 ⇒ 舞台容器的 width/height 真的變大（⛔ 不是 transform: scale，那會糊）", async () => {
    render({ hoverPop: { hoverDelayMs: 0 } });
    await settle();
    expect(stage().getAttribute("data-ggd-valhalla-pop"), "量尺自證：一開始沒放大").toBe("idle");

    await hover("pointerover");

    const el = stage();
    expect(el.getAttribute("data-ggd-valhalla-pop")).toBe("on");
    // ⛔ 改用 `transform: scale()` ⇒ 下面三行一起紅（width/height 是空字串、transform 非空）。
    //    而那正是缺陷本人：transform 不改排版尺寸 ⇒ StorePreview 的 ResizeObserver 不會響
    //    ⇒ engine.resize() 不會被呼叫 ⇒ 玩家看到的是放大的低解析度點陣圖。
    expect(el.style.transform, "⛔ 放大不可以用 CSS transform").toBe("");
    expect(parseFloat(el.style.width)).toBeGreaterThan(SLOT.width);
    expect(parseFloat(el.style.height)).toBeGreaterThan(SLOT.height);
    // 跳出卡片（fixed）才不會被舞台自己的 overflow:hidden 裁掉；底邊不動 ⇒ 蓋不到「一鍵開打」
    expect(el.style.position).toBe("fixed");
    expect(parseFloat(el.style.top) + parseFloat(el.style.height)).toBeCloseTo(SLOT.y + SLOT.height, 3);
    // ⭐ 只有**一個** Babylon 畫布，從頭到尾（放大沒有再掛第二個 StorePreviewCanvas）
    expect(host.querySelectorAll("[data-ggd-stub-preview]").length).toBe(1);

    await hover("pointerout");
    expect(stage().getAttribute("data-ggd-valhalla-pop"), "移開之後要收回原位").toBe("idle");
    expect(stage().style.position).toBe("absolute");
    expect(stage().style.width).toBe("");
  });

  it("★ 後台那一格關掉就真的不放大（`enabled: false`＝一鍵 rollback）", async () => {
    render({ hoverPop: { hoverDelayMs: 0, enabled: false } });
    await settle();
    expect(stage().getAttribute("data-ggd-valhalla-pop")).toBe("off");
    await hover("pointerover");
    expect(stage().getAttribute("data-ggd-valhalla-pop")).toBe("off");
    expect(stage().style.position).toBe("absolute");
  });
});
