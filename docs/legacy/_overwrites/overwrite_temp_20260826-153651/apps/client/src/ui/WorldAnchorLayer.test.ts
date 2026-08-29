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
 * The bug this guards: floating damage numbers rendered BLACK because the
 * text-clipped gradient fill did not actually paint (an in-app browser / iOS
 * WKWebView reporting `background-clip:text` support via `CSS.supports` yet
 * dropping it on the real element), leaving a transparent glyph whose only ink
 * was the black outline ring. The old check trusted `CSS.supports`; this one
 * stamps the real CSS on a real node and reads back the COMPUTED result, so a
 * faked support claim resolves to the solid-hue fallback instead of black text.
 *
 * The test runner is `environment: "node"` (no DOM), so the probe's deps are
 * injected: a fake `document` + `getComputedStyle` drive each branch —
 *   painted  → gradient (true)
 *   dropped  → solid    (false)
 */
import { describe, it, expect, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { probeTextGradientPaints } from "./WorldAnchorLayer";

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
    expect(probeTextGradientPaints(undefined, undefined)).toBe(false);
    // a document but no getComputedStyle is still unsafe
    expect(probeTextGradientPaints(fakeDoc().doc, undefined)).toBe(false);
  });

  it("returns FALSE (never throws) when the probe blows up mid-flight", () => {
    cover("combat-text-legibility");
    const throwing = (): CSSStyleDeclaration => {
      throw new Error("getComputedStyle exploded");
    };
    expect(probeTextGradientPaints(fakeDoc().doc, throwing)).toBe(false);
  });
});
