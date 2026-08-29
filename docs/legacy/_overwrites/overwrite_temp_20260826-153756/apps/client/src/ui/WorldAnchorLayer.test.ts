// @vitest-environment jsdom
/**
 * WorldAnchorLayer — ① 頭頂血條的**顏色**真的畫在 DOM 上（GH#728）
 *                    ② `probeTextGradientPaints` 的執行期偵測（task #92）
 *
 * ⚠️ 這一支檔在 **jsdom** 底下跑，因為①要掛出貨的 `<WorldAnchorLayer/>` 本人並讀
 * 最終節點的 `background`（⛔ 不是一個中間 model，也⛔ 不是自己造一份 payload 餵給
 * `makeChampionNode` —— 那是失敗形態⑤「被測的不是出貨的那個」，而這次壞掉的正是
 * **呼叫端**那一行）。②因此改成把「沒有 DOM」明著造出來：在 jsdom 底下省略參數會
 * 落回**真的** `document`／`getComputedStyle`，那就量不到原本要量的那條分支了。
 *
 * ① 守的 bug：中立錨點（守護塔／治療花）的 `teamId` 是 -1，`teamCss(-1)` 繞回
 * `TEAM_CSS[3]` = 金色 ⇒ 它們的頭頂血條被畫成第四隊，而小地圖一直是對的 ⇒ 同一個
 * 物件在兩個 HUD 上兩種顏色。
 *
 * ② 守的 bug：floating damage numbers rendered BLACK because the
 * text-clipped gradient fill did not actually paint (an in-app browser / iOS
 * WKWebView reporting `background-clip:text` support via `CSS.supports` yet
 * dropping it on the real element), leaving a transparent glyph whose only ink
 * was the black outline ring. The old check trusted `CSS.supports`; this one
 * stamps the real CSS on a real node and reads back the COMPUTED result, so a
 * faked support claim resolves to the solid-hue fallback instead of black text.
 *
 * ②的 probe deps 一律**注入**：一個 fake `document` + `getComputedStyle` 逐條驅動 —
 *   painted  → gradient (true)
 *   dropped  → solid    (false)
 *
 * 突變紀錄（2026-08-26 · GH#728）：把 frame loop 的 `anchor.color ??` 拿掉
 * （退回 `teamCss(anchor.teamId)`）⇒ ①的第一條紅：守護塔的 hp 背景變成
 * `rgb(242, 198, 55)` 金色而不是 `#c99a5c`。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { cover } from "@ggd/shared/testkit/cover";
import { frameBus, type ChampionAnchor } from "../frameBus";
import { GUARDIAN_BAR_COLOR, NEUTRAL_BAR_COLOR } from "../render/overheadAnchors";
import { probeTextGradientPaints, WorldAnchorLayer } from "./WorldAnchorLayer";
import { teamCss } from "./theme";

/** A computed-style stub keyed by property name. */
function computedFrom(values: Record<string, string>): (el: Element) => CSSStyleDeclaration {
  return () =>
    ({
      getPropertyValue: (name: string): string => values[name] ?? "",
    }) as unknown as CSSStyleDeclaration;
}

/** A throwaway `document` that records whether the probe cleaned up after itself. */
function fakeDoc(): { doc: Document; removed: () => boolean } {
  let removeCalls = 0;
  const el = {
    style: { cssText: "" },
    textContent: "",
    remove: () => {
      removeCalls++;
    },
  };
  const doc = {
    createElement: () => el as unknown as HTMLElement,
    body: { appendChild: vi.fn() } as unknown as HTMLElement,
  };
  return { doc: doc as unknown as Document, removed: () => removeCalls > 0 };
}

// computed style of an engine that TRULY painted the treatment
const PAINTED = computedFrom({
  "-webkit-background-clip": "text",
  "background-clip": "text",
  "-webkit-text-fill-color": "rgba(0, 0, 0, 0)",
  "background-image": "linear-gradient(180deg, rgb(255, 217, 217) 0%, rgb(255, 0, 0) 100%)",
});

// computed style of an engine that DROPPED it (WKWebView / in-app browser): the
// clip falls back to border-box and the fill falls back to the solid colour
const DROPPED = computedFrom({
  "-webkit-background-clip": "border-box",
  "background-clip": "border-box",
  "-webkit-text-fill-color": "rgb(255, 0, 0)",
  "background-image": "none",
});

describe("probeTextGradientPaints — a real paint probe, not a support string (ct-c05)", () => {
  it("returns TRUE only when the clip, the transparent fill and the gradient all survived", () => {
    cover("combat-text-legibility");
    const { doc, removed } = fakeDoc();
    expect(probeTextGradientPaints(doc, PAINTED)).toBe(true);
    // the throwaway probe node is always removed, even on the success path
    expect(removed()).toBe(true);
  });

  it("returns FALSE when the engine dropped background-clip:text (the WKWebView case)", () => {
    cover("combat-text-legibility");
    const { doc, removed } = fakeDoc();
    // this is the reported bug's environment: support is claimed but nothing
    // paints — the probe must NOT enable the transparent-fill gradient here
    expect(probeTextGradientPaints(doc, DROPPED)).toBe(false);
    expect(removed()).toBe(true);
  });

  it("returns FALSE on PARTIAL support — half a treatment still yields a blank glyph", () => {
    cover("combat-text-legibility");
    // clip survived but the fill did not go transparent: the gradient would be
    // hidden behind an opaque fill, so gradient mode is pointless — stay solid
    const clipOnly = computedFrom({
      "-webkit-background-clip": "text",
      "background-clip": "text",
      "-webkit-text-fill-color": "rgb(255, 0, 0)",
      "background-image": "linear-gradient(180deg, rgb(255, 217, 217) 0%, rgb(255, 0, 0) 100%)",
    });
    // fill went transparent but the clip was dropped: THIS is the black-number
    // trap — a transparent glyph with no clip to reveal the gradient
    const fillOnly = computedFrom({
      "-webkit-background-clip": "border-box",
      "background-clip": "border-box",
      "-webkit-text-fill-color": "rgba(0, 0, 0, 0)",
      "background-image": "linear-gradient(180deg, rgb(255, 217, 217) 0%, rgb(255, 0, 0) 100%)",
    });
    expect(probeTextGradientPaints(fakeDoc().doc, clipOnly)).toBe(false);
    expect(probeTextGradientPaints(fakeDoc().doc, fillOnly)).toBe(false);
  });

  it("returns FALSE with no DOM (SSR / the node unit env) — the safe default is solid", () => {
    cover("combat-text-legibility");
    // ⚠️ 明著傳 `null`，⛔ 不是省略參數：這一支檔跑在 jsdom 底下，而 `undefined`
    //    會觸發預設值落回**真的** document/getComputedStyle ⇒ 量到的就不是這條分支了。
    expect(probeTextGradientPaints(null as never, null as never)).toBe(false);
    // a document but no getComputedStyle is still unsafe
    expect(probeTextGradientPaints(fakeDoc().doc, null as never)).toBe(false);
  });

  it("returns FALSE (never throws) when the probe blows up mid-flight", () => {
    cover("combat-text-legibility");
    const throwing = (): CSSStyleDeclaration => {
      throw new Error("getComputedStyle exploded");
    };
    expect(probeTextGradientPaints(fakeDoc().doc, throwing)).toBe(false);
  });
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** rAF 換成手動步進 —— ⛔ 不睡覺等瀏覽器的 16ms（那是 flake 的來源）。 */
let pending: FrameRequestCallback | null = null;
globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => ((pending = cb), 1)) as never;
globalThis.cancelAnimationFrame = (() => (pending = null)) as never;
const step = (): void => {
  const cb = pending;
  pending = null;
  act(() => cb?.(performance.now()));
};

/** 一顆出貨形狀的錨點（`GameApp` 建的就是這個物件）。 */
function anchorAt(id: number, color: string | undefined): ChampionAnchor {
  return {
    entityId: id,
    name: "",
    teamId: -1, // ⭐ 中立錨點真的是 -1（GameApp: `isNeutral ? -1 : …`）
    championId: "",
    isLocal: false,
    alive: true,
    hpPct: 1,
    shieldPct: 0,
    manaPct: 1,
    worldX: 0,
    worldZ: 0,
    pose: { sx: 100, sy: 100, visible: true },
    cast: null,
    color,
  };
}

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  frameBus.champions.clear();
});

/** 掛出貨的 layer、跑一幀，回傳那顆錨點的最終 DOM 節點。 */
function mountAndStep(host: HTMLDivElement): void {
  root = createRoot(host);
  act(() => root!.render(createElement(WorldAnchorLayer)));
  step();
}
const hpBg = (host: HTMLElement): string =>
  (host.querySelector('[data-role="hp"]') as HTMLElement).style.background;
/** jsdom 把 `#rrggbb` 正規化成 `rgb(r, g, b)` —— 換算走同一條路，⛔ 不抄字面值。 */
const asCss = (color: string): string => {
  const probe = document.createElement("div");
  probe.style.background = color;
  return probe.style.background;
};

describe("頭頂血條的顏色讀 anchor.color，⛔ 不是 teamCss(-1) 的金色 (#728)", () => {
  it("守護塔與治療花畫成自己的中立色；英雄仍走隊色（逐位元不變）", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    frameBus.champions.set(1, anchorAt(1, GUARDIAN_BAR_COLOR));
    mountAndStep(host);

    // ⛔ 讀最終 DOM，不是中間 model
    expect(hpBg(host), "守護塔被畫成第四隊金色").toBe(GUARDIAN_BAR_COLOR);
    expect(hpBg(host)).not.toBe(teamCss(-1));
    expect((host.querySelector('[data-role="name"]') as HTMLElement).style.color).toBe(
      GUARDIAN_BAR_COLOR,
    );

    // 沒有 color 的錨點（＝英雄，`anchorColorFor` 回 undefined）仍然是隊色
    frameBus.champions.set(2, { ...anchorAt(2, undefined), teamId: 1 });
    step();
    const bars = [...host.querySelectorAll<HTMLElement>('[data-role="hp"]')];
    expect(bars.map((b) => b.style.background)).toEqual([GUARDIAN_BAR_COLOR, teamCss(1)]);
  });

  it("pooled 節點換 kind ⇒ 顏色跟著換（⛔ 不殘留上一種的色）", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    frameBus.champions.set(9, anchorAt(9, GUARDIAN_BAR_COLOR));
    mountAndStep(host);
    expect(hpBg(host)).toBe(GUARDIAN_BAR_COLOR);

    // 同一個 entity id 被回收給治療花（GameApp 的 refresh 區重寫 anchor.color）
    frameBus.champions.get(9)!.color = NEUTRAL_BAR_COLOR;
    step();
    expect(hpBg(host), "pooled 節點殘留舊色").toBe(NEUTRAL_BAR_COLOR);
  });
});
