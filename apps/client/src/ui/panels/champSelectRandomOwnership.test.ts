// @vitest-environment jsdom
/**
 * champSelectRandomOwnership.test — owner 2026-08-02「隨機選角的時候，只能隨機到
 * 自己有解鎖的角色」的**接線**守衛。
 *
 * ── 為什麼不能只測 champselect/randomPickGate ──────────────────────────────
 * 那個檔案證明「決策是對的」，證明不了「有人叫它」。把 ChampSelectPanel 裡
 * `planRandomPick(...)` 整段刪掉、換回 `pickRandomId(whitelistedIds)`，
 * randomPickGate.test 的 10 條會**全部照樣綠**（失敗形態 ③）。所以這裡掛的是
 * 真的 `<ChampSelectPanel/>`，按的是它自己畫出來的那顆 🎲，量的是
 * `hudActions.selectChampion` 到底有沒有被呼叫、帶著什麼 id。
 *
 * ── 為什麼要 jsdom + createRoot ────────────────────────────────────────────
 * `apps/client` 的 vitest 是 `environment: "node"`，UI 測試走
 * `renderToStaticMarkup` —— 那條路**不會執行 onClick**，量不到按鈕行為。
 * `createRoot` 是 `main.tsx` 出貨的那條 renderer，前例是
 * `ui/hudBoundaryGroup.test.ts`（同一行 `@vitest-environment jsdom`，
 * `vite.config.ts` 一個字都沒動）。
 *
 * ── 餵給它的是真的東西 ────────────────────────────────────────────────────
 * 真的 `Champions` registry、真的 `hudStore`、真的 `useWalletMeta`（它的網路層
 * 被換掉：`platform/api` 是唯一被 mock 的模組，模擬「有 session、但平台掛了」）。
 * 白名單走真的 `useWhitelist`，只是 `fetch` 讓它失敗 → NO_FILTER（全開），
 * 所以白名單這一層不會替 ownership 閘做事。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionDef } from "@ggd/shared/sim/content/defs";
import type { ChampionId } from "@ggd/shared/ids";

// 唯一被替換的模組：平台 HTTP 客戶端。`hasSession` 與 `request` 是
// champselect/walletMeta 的 defaultDeps 唯一碰的兩樣東西。
// React 18 wants this flag before `act()` will suppress its warning banner.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiState = { hasSession: true, fail: true, owned: [] as string[], prices: [] as { id: string; price: number }[] };
vi.mock("../platform/api", () => ({
  api: {
    get hasSession() {
      return apiState.hasSession;
    },
    request: async (path: string) => {
      if (apiState.fail) throw new Error("platform unreachable");
      if (path === "/wallet") {
        return { crystal: 0, crystalUnlockCost: 300, ownedChampions: apiState.owned, favourites: [] };
      }
      return { champions: apiState.prices };
    },
  },
}));

const selected: string[] = [];
vi.mock("../actions", async (orig) => {
  const real = (await orig()) as { hudActions: Record<string, unknown> };
  return {
    ...real,
    hudActions: {
      ...real.hudActions,
      selectChampion: (id: string) => void selected.push(id),
    },
  };
});

const { ChampSelectPanel } = await import("./ChampSelectPanel");
const { hudStore, resetHudStore } = await import("../../net/RoomStore");

const IDS = ["rp-free", "rp-paid-a", "rp-paid-b"] as const;

function champ(id: string): ChampionDef {
  return {
    id: id as ChampionId,
    name: id,
    role: "fighter",
    tags: [],
    modelKey: "voxel-basic",
    base: {},
    abilities: [],
  } as unknown as ChampionDef;
}

let host: HTMLDivElement;
let root: Root;

function render(): void {
  act(() => {
    root.render(createElement(ChampSelectPanel));
  });
}

/** 找出畫面上那顆 🎲 並真的點它。找不到就直接失敗（按鈕被改名也要紅）。 */
function pressDice(): void {
  const btn = [...host.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("🎲"));
  if (!btn) throw new Error("🎲 button not rendered");
  act(() => {
    btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
}

/** 讓 useWalletMeta 的 mount effect（一個 promise 鏈）跑完。 */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  selected.length = 0;
  apiState.hasSession = true;
  apiState.fail = true;
  apiState.owned = [];
  apiState.prices = [];
  // 白名單 fetch 失敗 → NO_FILTER（全開），所以擋下來的一定是 ownership。
  vi.stubGlobal("fetch", async () => {
    throw new Error("no platform");
  });
  resetHudStore();
  Champions.clear();
  for (const id of IDS) Champions.register(id as ChampionId, champ(id));
  hudStore.setState({
    phase: "champSelect",
    phaseSecondsLeft: 40,
    matchId: `m-${Math.random()}`,
    localSeatId: 0,
    seats: [{ seatId: 0, teamId: 0, championId: "", displayName: "me", isBot: false } as never],
  } as never);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("🎲 隨機選角的擁有權閘（出貨面板，真的按鈕）", () => {
  it("★ 有登入但平台掛掉 → 🎲 一支都不送出（這正是舊版 fail-open 的那個分支）", async () => {
    render();
    await settle();
    pressDice();
    // 舊版行為：`meta.available` 是 false → 跳過 ownership 過濾 → 抽整個白名單，
    // selected 會有一個 id。現在必須是空的。
    expect(selected).toEqual([]);
    // 而且要**說話**，不能只是安靜地不動。
    expect(host.textContent ?? "").toContain("無法隨機選角");
  });

  it("★ 錢包還在飛的那幾幀按 🎲 → 也不能抽（載入視窗一樣是 fail-open 的洞）", () => {
    // 平台是好的，只是還沒回來。選角一開場正是玩家最會亂按的時候。
    apiState.fail = false;
    apiState.owned = ["rp-paid-b"];
    apiState.prices = [
      { id: "rp-free", price: 0 },
      { id: "rp-paid-a", price: 300 },
      { id: "rp-paid-b", price: 300 },
    ];
    render(); // 刻意不 settle()：mount effect 的 promise 還沒解
    pressDice();
    expect(selected).toEqual([]);
  });

  it("★ 錢包讀得到 → 只抽得到已解鎖的那一支，連按 40 次都不會漏", async () => {
    apiState.fail = false;
    apiState.owned = ["rp-paid-b"];
    apiState.prices = [
      { id: "rp-free", price: 0 },
      { id: "rp-paid-a", price: 300 },
      { id: "rp-paid-b", price: 300 },
    ];
    render();
    await settle();
    for (let i = 0; i < 40; i++) pressDice();
    expect(selected.length).toBe(40);
    expect(new Set(selected)).toEqual(new Set(["rp-free", "rp-paid-b"]));
    expect(selected).not.toContain("rp-paid-a"); // 付費且未解鎖
  });

  it("沒有 session（本機 pnpm dev）→ 🎲 照常可用，不會變成死按鈕", async () => {
    apiState.hasSession = false;
    render();
    await settle();
    pressDice();
    expect(selected.length).toBe(1);
    expect(IDS as readonly string[]).toContain(selected[0]!);
  });
});
