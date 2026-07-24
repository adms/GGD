/**
 * HeroReactionBubble (owner ask: the player hero RESPONDS in-character on a
 * purchase, 不只是擺出攻擊動作而已). The pick + per-champion lookup live in the
 * pure render/intermission/purchaseLines module (tested there); this suite pins
 * the presentational box. The client vitest runs in a `node` env and its glob is
 * *.test.ts, so this renders the pure VIEW with react-dom/server (effects — the
 * fetch + fade timer — don't fire under SSR) and asserts the DOM contract.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import { HeroReactionBubbleView } from "./HeroReactionBubble";

describe("HeroReactionBubbleView (hero-reaction-bubble)", () => {
  it("renders the in-character line verbatim", () => {
    cover("hero-reaction-bubble");
    const html = renderToStaticMarkup(
      createElement(HeroReactionBubbleView, { text: "嘿嘿…這個歸我了", seq: 1, visible: true }),
    );
    expect(html).toContain("嘿嘿…這個歸我了");
    expect(html).toContain("data-ggd-hero-reaction");
  });

  it("is display-only (click-through) so it never eats a shop-card click", () => {
    cover("hero-reaction-bubble");
    const html = renderToStaticMarkup(
      createElement(HeroReactionBubbleView, { text: "x", seq: 1, visible: true }),
    );
    expect(html).toMatch(/pointer-events:none/);
  });

  it("anchors on the RIGHT with a tail, so it reads as the hero's own thought", () => {
    cover("hero-reaction-bubble");
    const html = renderToStaticMarkup(
      createElement(HeroReactionBubbleView, { text: "x", seq: 1, visible: true }),
    );
    // anchored to the right edge (hero stands right of the counter, task #146)
    expect(html).toMatch(/right:6%/);
    expect(html).toMatch(/我的英雄/); // speaker label
  });

  it("fades: opacity 1 when visible, 0 when hidden", () => {
    cover("hero-reaction-bubble");
    const shown = renderToStaticMarkup(
      createElement(HeroReactionBubbleView, { text: "x", seq: 1, visible: true }),
    );
    const hidden = renderToStaticMarkup(
      createElement(HeroReactionBubbleView, { text: "x", seq: 1, visible: false }),
    );
    expect(shown).toMatch(/opacity:1/);
    expect(hidden).toMatch(/opacity:0/);
  });
});
