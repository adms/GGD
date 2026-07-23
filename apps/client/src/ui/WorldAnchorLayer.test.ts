/**
 * WorldAnchorLayer.probeTextGradientPaints — the runtime feature-detect behind
 * the combat-text fill (task #92 colour-bug fix).
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
