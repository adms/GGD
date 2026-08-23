// @vitest-environment jsdom
/**
 * 🔴 **GH#620 —— 殭屍血條不可以每幀重跑 React。**
 *
 * > owner 2026-08-23 [優先]：「這版改完還是LAG 一定有地方有問題,
 * >  **到第七回合就很難動作**」
 *
 * `arena-rules.json` 的 `mobWaves.schedule` 在 **R7** 跳到
 * `maxAlivePerZone: 30` × 2 區 = **60 隻同時活著**。
 * 而在 2026-08-23 之前，`sameSpecs` 還比 `sx`/`sy`/`hpPct` —— 那三樣**每幀都在變**
 * （殭屍在走、在挨打）⇒ 每一幀 `setState` ⇒ 整棵 60 個元件 reconcile + diff + commit。
 *
 * ⚠️ 這一條**必須數 commit 次數**，⛔ 不可以只看 DOM：位置改由 rAF 直寫之後，
 * 就算 React 照樣每幀重跑，DOM 上的數字仍然是對的 —— 兩種實作在畫面上一模一樣，
 * 差別只在成本（失敗形態④：斷言方向跟缺陷無關）。⇒ 用 `React.Profiler` 數 commit。
 *
 * ⚠️ 檔名是 `.test.ts` ⛔ 不是 `.tsx`：`apps/client` 的 vitest include 是
 * src 底下的 .test.ts —— 寫成 .tsx 會「沒有任何測試檔」而**不是**紅。
 */
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { frameBus } from "../../frameBus";
import { MobHealthBars } from "./mobHealthBar";

/** 出貨的形狀（`frameBus.mobBars` 是 `MobBarAnchor[]`）。 */
function anchor(
  entityId: number,
  sx: number,
  sy: number,
  hp: number,
): (typeof frameBus.mobBars)[number] {
  return {
    entityId,
    zone: 0,
    hpPct: hp / 800,
    hp,
    maxHp: 800,
    worldX: 1,
    worldZ: 2,
    pose: { sx, sy, visible: true },
  };
}

let host: HTMLDivElement;
let root: Root;
let commits = 0;
const rafs: FrameRequestCallback[] = [];

beforeEach(() => {
  commits = 0;
  rafs.length = 0;
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    rafs.push(cb);
    return rafs.length;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** 跑一幀（把排到的 rAF 全部叫一次）。 */
function frame(): void {
  const due = rafs.splice(0, rafs.length);
  act(() => {
    for (const cb of due) cb(performance.now());
  });
}

function mount(): void {
  act(() => {
    root.render(
      React.createElement(
        React.Profiler,
        { id: "mob", onRender: () => (commits += 1) },
        React.createElement(MobHealthBars),
      ),
    );
  });
}

describe("GH#620 殭屍血條", () => {
  it("★ 殭屍在動 + 在掉血，React **一次都不重跑**，而 DOM 跟著動", () => {
    frameBus.mobBars.length = 0;
    frameBus.mobBars.push(anchor(41, 100, 60, 300));
    mount();
    const node = host.querySelector<HTMLDivElement>('[data-mob-bar="root"]');
    expect(node, "掛載後沒有血條").not.toBeNull();
    const before = commits;

    // 十幀:每一幀都換位置與血量 —— 這正是 R7 那 60 隻在做的事。
    for (let i = 1; i <= 10; i += 1) {
      frameBus.mobBars.length = 0;
      frameBus.mobBars.push(anchor(41, 100 + i * 7, 60 + i * 3, 300 - i * 10));
      frame();
    }

    expect(commits - before, "殭屍只是在動就重跑了 React —— R7 場上有 60 隻").toBe(0);
    expect(host.querySelector('[data-mob-bar="root"]'), "節點被換掉了").toBe(node);
    // 第 10 幀的 sy = 60 + 30 = 90（x 那一半還要扣 width/2,⛔ 這裡不抄那個寬度）。
    expect(node!.style.transform, "位置沒有跟著動（直寫沒接上）").toContain("90px");
    expect(
      host.querySelector<HTMLDivElement>('[data-mob-bar="fill"]')!.style.width,
      "血量沒有跟著動",
    ).toBe("25%"); // ⚠️ jsdom 會把 "25.0%" 正規化掉小數點 —— 讀回來的是 "25%"

  });

  it("名冊變了（多一隻）才重跑 React", () => {
    frameBus.mobBars.length = 0;
    frameBus.mobBars.push(anchor(41, 100, 60, 300));
    mount();
    const before = commits;
    frameBus.mobBars.push(anchor(42, 200, 60, 300));
    frame();
    expect(commits - before, "多一隻殭屍卻沒有重跑 —— 那條血條畫不出來").toBeGreaterThan(0);
    expect(host.querySelectorAll('[data-mob-bar="root"]').length).toBe(2);
  });
});
