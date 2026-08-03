// @vitest-environment jsdom
/**
 * vfxDebugPanel.test.ts —— GH#270 診斷面板的**行為**守衛。
 *
 * ── 為什麼是 jsdom + 真的 HudRoot ────────────────────────────────────────
 * 這個面板存在的理由是「說出真話」，所以它的每一種失敗都是「說了假話」，
 * 而這個 repo 已經踩過的三種假話全部在下面被釘住：
 *
 *   ③「可以從渲染樹刪掉但測試還是全綠」—— GH#268 就是這樣：`MobHealthBars`
 *      寫好了、`ENTITY_FLAG` 最後一格都付掉了，而 `HudRoot` 從沒掛它，整包
 *      測試全綠。所以這裡不驗「元件存在」，驗的是**出貨的 `<HudRoot/>` 掛上
 *      之後，DOM 上真的有那些列**。
 *   ⑥「用掃原始碼字串代替行為」—— 一個字串都不掃。
 *   ⑤「被測的不是出貨的那個」—— 走的是出貨的 `settingsStore.patchNetwork`
 *      → `useSettings` → `VfxDebugPanel` → `readVfxEmitters()`，中間沒有一個
 *      是測試自己手寫的替身。假的只有 scene 本身（那是 WebGL，headless 起不來）。
 *
 * ── 為什麼一定要有「關著就什麼都不畫」那一條 ──────────────────────────
 * 這是一個**診斷**面板。它如果預設出現在玩家畫面上，這次改動本身就是缺陷。
 *
 * ── 位置那一欄為什麼是重點 ───────────────────────────────────────────────
 * owner 的截圖裡有一團火焰**在場地外的黑色空間裡**，位置就是唯一的線索。
 * Babylon 的 `emitter` 可以是 `Vector3` **也可以是 `AbstractMesh`**，而 mesh 上
 * 同時有 `position`（本地）與 `absolutePosition`（世界）。下面那隻 mesh 發射器
 * 刻意把 `position` 設成 (0,0,0)、`absolutePosition` 設成場外的 (140, 3, -96)：
 * 讀錯的實作會印 `0.0, 0.0`，也就是把最可能的兇手類別整個藏起來。
 *
 * ── 突變驗證（三步都真的跑過，2026-08-04）──────────────────────────────
 * ① `HudRoot.tsx` 的 `<VfxDebugPanel />` 刪掉
 *    → ★②「開關打開 → 渲染樹上真的有那些列」紅（其餘全綠 ＝ GH#268 的形狀）。
 * ② `vfxDebugBus.emitterPlacement` 的 `absolutePosition` 分支拿掉（讓它直接讀
 *    x/y/z）→ ★③「mesh emitter 讀世界座標」紅，印出 0.0, 0.0。
 * ③ `sampleVfxEmitters` 的 `rows.sort(...)` 刪掉
 *    → ★④「活粒子多的排前面 + 截斷說實話」紅。
 * ④ `VfxDebugPanel` 的 `if (!show …) return null` 改成永遠畫
 *    → ★①「開關關著就什麼都不畫」紅。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { cover } from "@ggd/shared/testkit/cover";
import { hudStore, resetHudStore, type SeatView } from "../net/RoomStore";
import { settingsStore } from "../settings";
import {
  emitterPlacement,
  sampleVfxEmitters,
  setVfxDebugScene,
  type VfxDebugEmitter,
  type VfxDebugScene,
} from "../vfxDebugBus";
import { HudRoot } from "./HudRoot";

const TAG = "vfx-emitter-debug";

/* ══════════════════════════════════════════════════════════════════════════
   假的 scene —— 只有面板真的會讀的那五格，外加「這個面板有沒有動我」的計數器
   ══════════════════════════════════════════════════════════════════════════ */

interface FakeSystem extends VfxDebugEmitter {
  starts: number;
  stops: number;
  disposes: number;
}

function makeSystem(opts: {
  name: string;
  emitter: unknown;
  alive: number;
  rate: number;
  started: boolean;
}): FakeSystem {
  return {
    name: opts.name,
    emitRate: opts.rate,
    emitter: opts.emitter,
    isStarted: () => opts.started,
    getActiveCount: () => opts.alive,
    starts: 0,
    stops: 0,
    disposes: 0,
    // 真的 ParticleSystem 有這三支。面板碰了任何一支就是在擾動它在量的東西。
    start(this: FakeSystem) {
      this.starts++;
    },
    stop(this: FakeSystem) {
      this.stops++;
    },
    dispose(this: FakeSystem) {
      this.disposes++;
    },
  } as FakeSystem;
}

/** 一顆固定的 `Vector3` emitter（Babylon 兩種 emitter 的其中一種）。 */
const vec3 = (x: number, y: number, z: number): unknown => ({ x, y, z });

/**
 * 一個 mesh emitter（另一種）。⚠️ `position` 是**本地**座標，故意留在原點；
 * 真正的世界座標只有 `absolutePosition` 說得出來。
 */
function meshAt(name: string, x: number, y: number, z: number): unknown {
  return {
    name,
    position: { x: 0, y: 0, z: 0 },
    absolutePosition: { x, y, z },
  };
}

function sceneOf(...systems: FakeSystem[]): VfxDebugScene {
  return { particleSystems: systems };
}

/* ══════════════════════════════════════════════════════════════════════════
   jsdom 掛載腳手架（做法同 ui/hud/statsHoverPanel.test.ts）
   ══════════════════════════════════════════════════════════════════════════ */

let host: HTMLDivElement;
let root: Root;

/** 一個最小的「連上了、在戰鬥中、活著」的 HUD 狀態 —— HudRoot 要用。 */
function primeCombat(): void {
  resetHudStore();
  hudStore.setState({
    connected: true,
    phase: "combat",
    round: 2,
    localSeatId: 0,
    localEntityId: 7,
    localMaxHp: 1000,
    localHp: 900,
    localAlive: true,
    seats: [{ seatId: 0, teamId: 0, zone: 0, displayName: "me" } as unknown as SeatView],
  });
}

beforeEach(() => {
  primeCombat();
  setVfxDebugScene(null);
  settingsStore.patchNetwork({ showVfxDebug: false });
  host = document.createElement("div");
  host.id = "hud-root";
  document.body.appendChild(host);
  root = createRoot(host);
  // HudRoot 的其他成員在 jsdom 裡會噴 warning（沒有 canvas / audio）。靜音
  // 以免蓋掉真正的失敗訊息；本檔的斷言全部讀 DOM，不讀 console。
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  flushSync(() => root.unmount());
  host.remove();
  document.getElementById("hud-error-strip")?.remove();
  setVfxDebugScene(null);
  settingsStore.patchNetwork({ showVfxDebug: false });
  vi.restoreAllMocks();
});

function render(): void {
  flushSync(() => root.render(createElement(HudRoot)));
}

/** 畫面上那一片，或 null。 */
function panel(): HTMLElement | null {
  return host.querySelector<HTMLElement>('[data-testid="vfx-debug"]');
}

/** 面板上每一列的（名稱, x/z 字串, 還在發射, 活粒子, rate）。 */
function rows(): { name: string; pos: string; emitting: boolean; alive: string; rate: string }[] {
  const p = panel();
  if (p === null) return [];
  const names = [...p.querySelectorAll("[data-vfx-name]")];
  const poss = [...p.querySelectorAll("[data-vfx-pos]")];
  const emits = [...p.querySelectorAll("[data-vfx-emitting]")];
  const alives = [...p.querySelectorAll("[data-vfx-alive]")];
  const rates = [...p.querySelectorAll("[data-vfx-rate]")];
  return names.map((n, i) => ({
    name: n.textContent ?? "",
    pos: poss[i]?.textContent ?? "",
    emitting: emits[i]?.getAttribute("data-vfx-emitting") === "1",
    alive: alives[i]?.textContent ?? "",
    rate: rates[i]?.textContent ?? "",
  }));
}

/* ══════════════════════════════════════════════════════════════════════════
   ① 開關關著就什麼都不畫 —— 沒有這一條，診斷面板會出現在玩家畫面上
   ══════════════════════════════════════════════════════════════════════════ */

describe("① 這是診斷面板，預設關", () => {
  it("★ 出貨預設（showVfxDebug=false）下，HudRoot 的渲染樹上一個字都沒有", () => {
    cover(TAG);
    // 場上**真的有**發射器 —— 面板沒畫不可以是因為沒東西可畫
    setVfxDebugScene(
      sceneOf(makeSystem({ name: "torch-flame-3", emitter: vec3(1, 2, 3), alive: 40, rate: 12, started: true })),
    );
    render();

    // 非真空保證：HudRoot 真的畫得出東西（不是整棵樹壞掉才「沒有面板」）
    expect(
      host.querySelectorAll("[data-hud-slot]").length,
      "HudRoot 一個槽位都沒畫出來 —— 這條測試是空的，不是通過",
    ).toBeGreaterThan(2);
    expect(panel(), "開關關著，診斷面板仍然畫在玩家畫面上").toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ② 開關打開 → 真的渲染樹上出現那些列（GH#268 缺的就是這一條）
   ══════════════════════════════════════════════════════════════════════════ */

describe("② 開關打開 → 出貨的 HudRoot 上真的有那些列", () => {
  it("★ 三個發射器 → 三列，名稱/發射中/活粒子/rate 都是 scene 裡真的那些值", () => {
    cover(TAG);
    setVfxDebugScene(
      sceneOf(
        makeSystem({ name: "torch-flame-3", emitter: vec3(12.34, 1, -5.67), alive: 40, rate: 12, started: true }),
        makeSystem({ name: "revive-ring-0", emitter: vec3(0, 0, 0), alive: 7, rate: 0, started: false }),
        makeSystem({ name: "vfx-fire-blast", emitter: null, alive: 3, rate: 90, started: true }),
      ),
    );
    settingsStore.patchNetwork({ showVfxDebug: true });
    render();

    const p = panel();
    expect(p, "開關打開了，HudRoot 的渲染樹上沒有這個面板 —— 它沒有被掛上去（GH#268 的形狀）").not.toBeNull();
    expect(host.contains(p!), "面板不在 #hud-root 那棵樹底下").toBe(true);

    const r = rows();
    expect(r.map((x) => x.name)).toEqual(["torch-flame-3", "revive-ring-0", "vfx-fire-blast"]);
    // 「還在生」與「只是舊粒子還沒消」是兩種缺陷 —— 必須分得出來
    expect(r.map((x) => x.emitting)).toEqual([true, false, true]);
    expect(r.map((x) => x.alive)).toEqual(["40", "7", "3"]);
    expect(r.map((x) => x.rate)).toEqual(["12.0", "0.0", "90.0"]);
    // 沒有位置的那一個要說「沒有」，不可以印成 0,0（那會讀成「在場地正中央」）
    expect(r[2]!.pos, "emitter 是 null 的發射器被印成一個座標了").toBe("—");
    // 總數要說出來
    expect(p!.querySelector("[data-vfx-summary]")?.textContent).toContain("3 個");
  });

  it("★ 沒有註冊過 scene 時明講「沒接上」，不可以畫成一張空表", () => {
    cover(TAG);
    setVfxDebugScene(null);
    settingsStore.patchNetwork({ showVfxDebug: true });
    render();
    // fail-loud：「場上真的什麼都沒有」跟「面板沒接線」不可以長得一樣 ——
    // 這條 issue 被誤判兩次就是因為分不清「量到 0」與「沒量」。
    expect(panel()?.textContent ?? "", "沒有 scene 卻假裝量到了 0 個").toContain("沒有可讀的場景");
    expect(rows()).toHaveLength(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ③ 位置那一欄 —— 這個面板唯一的結案能力
   ══════════════════════════════════════════════════════════════════════════ */

describe("③ 列裡的位置等於 scene 裡發射器的真實位置", () => {
  it("★ Vector3 emitter 印它自己的 x/z；mesh emitter 印**世界**座標，不是本地的 0,0", () => {
    cover(TAG);
    setVfxDebugScene(
      sceneOf(
        // owner 截圖裡那一團：完全在六角地磚範圍外
        makeSystem({ name: "stray-sky-fire", emitter: meshAt("dummy-fx-17", 140, 3, -96), alive: 60, rate: 30, started: true }),
        makeSystem({ name: "torch-flame-1", emitter: vec3(12.34, 1.5, -5.67), alive: 20, rate: 8, started: true }),
      ),
    );
    settingsStore.patchNetwork({ showVfxDebug: true });
    render();

    const r = rows();
    // ⚠️ 這一格就是整支測試的重點。實作若先讀 x/y/z 再讀 absolutePosition，
    // 這裡會是 "0.0, 0.0" —— 而「掛在角色/dummy 身上的特效」正是最可能的兇手類別。
    expect(r[0]!.pos, "mesh emitter 的世界座標沒讀到（讀成本地 position 了）").toBe("140.0, -96.0");
    expect(r[1]!.pos, "Vector3 emitter 的 x/z 印錯").toBe("12.3, -5.7");
    // mesh 掛在誰身上要寫在 title 裡，前綴＋掛點才是「這是誰生的」的完整答案
    const first = panel()!.querySelector("[data-vfx-name]");
    expect(first?.getAttribute("title")).toBe("stray-sky-fire @ dummy-fx-17");
  });

  it("★ emitterPlacement 的分支順序（純函式層，讓上面那條紅的時候知道錯在哪）", () => {
    cover(TAG);
    expect(emitterPlacement(meshAt("m", 5, 6, 7))).toEqual({
      pos: { x: 5, y: 6, z: 7 },
      attach: "mesh",
      attachedTo: "m",
    });
    expect(emitterPlacement(vec3(1, 2, 3))).toEqual({
      pos: { x: 1, y: 2, z: 3 },
      attach: "point",
      attachedTo: null,
    });
    expect(emitterPlacement(null)).toEqual({ pos: null, attach: "none", attachedTo: null });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ④ 排序 + 上界 —— 一眼看到誰佔畫面，而且截斷要說出來
   ══════════════════════════════════════════════════════════════════════════ */

describe("④ 活粒子多的排前面，超過上界不靜默截斷", () => {
  it("★ 34 個發射器 → 畫 30 列（由多到少），並寫出「還有 4 個」", () => {
    cover(TAG);
    const many: FakeSystem[] = [];
    for (let i = 0; i < 34; i++) {
      many.push(
        makeSystem({ name: `ps-${i}`, emitter: vec3(i, 0, i), alive: i, rate: 1, started: true }),
      );
    }
    setVfxDebugScene(sceneOf(...many));
    settingsStore.patchNetwork({ showVfxDebug: true });
    render();

    const r = rows();
    expect(r).toHaveLength(30);
    // 活粒子最多的是 ps-33（33 顆），最少被畫出來的是 ps-4
    expect(r[0]!.name).toBe("ps-33");
    expect(r.at(-1)!.name).toBe("ps-4");
    expect(
      panel()!.querySelector("[data-vfx-hidden]")?.textContent,
      "截掉了 4 個卻沒有說 —— 靜默截斷（CLAUDE.md 明文禁止）",
    ).toContain("還有 4 個");
    // 總數說的是**截斷前**那個數字
    expect(panel()!.querySelector("[data-vfx-summary]")?.textContent).toContain("34 個");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ 面板不可以擾動它在量的東西
   ══════════════════════════════════════════════════════════════════════════ */

describe("⑤ 只讀，不碰", () => {
  it("★ 面板開著渲染一輪之後，沒有任何發射器被 start / stop / dispose 過", () => {
    cover(TAG);
    const systems = [
      makeSystem({ name: "a", emitter: vec3(1, 1, 1), alive: 5, rate: 3, started: true }),
      makeSystem({ name: "b", emitter: meshAt("bone", 2, 2, 2), alive: 1, rate: 0, started: false }),
    ];
    setVfxDebugScene(sceneOf(...systems));
    settingsStore.patchNetwork({ showVfxDebug: true });
    render();
    // 再取樣幾次（面板每 ~3 Hz 會做同一件事）
    sampleVfxEmitters(sceneOf(...systems));
    sampleVfxEmitters(sceneOf(...systems));

    expect(rows()).toHaveLength(2);
    for (const s of systems) {
      expect([s.starts, s.stops, s.disposes], `${s.name} 被面板動到了`).toEqual([0, 0, 0]);
    }
  });
});
