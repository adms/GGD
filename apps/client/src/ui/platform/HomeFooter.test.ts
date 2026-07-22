/**
 * Home-page footer on the login screen — renders the © notice, the community
 * 「討論區」 link, and the MANDATORY CC-BY 4.0 attribution for the login dragon,
 * all as real, correctly-targeted external links that don't block the form.
 *
 * The 魔王魂 assertion that used to live here is gone: no 魔王魂 music ships any
 * more. The replacement test is deliberately stricter than the one it replaces —
 * CC-BY 4.0 requires title, author AND licence, so all three are asserted, and a
 * regression that silently drops one is a licence violation, not a cosmetic bug.
 * Rendered
 * to static markup with react-dom/server (no DOM needed), so this stays a .ts
 * suite (the vitest include glob is *.test.ts). React.createElement avoids JSX.
 *
 * HomeFooter is a standalone React-only module (not the full AuthScreen) so the
 * platform store / settings singleton never loads here.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import { HomeFooter } from "./HomeFooter";
import { CREDITS } from "./creditsData";

describe("HomeFooter", () => {
  const html = renderToStaticMarkup(createElement(HomeFooter));

  it("renders the © notice line", () => {
    cover("login-footer");
    expect(html).toContain("© 2026 Moriyamouse/Adms 糟糕騎士團");
  });

  it("links 「討論區」 to the exact forum group, opened safely in a new tab", () => {
    cover("login-footer");
    expect(html).toContain("「討論區」");
    expect(html).toContain('href="https://www.facebook.com/groups/142111353010"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("links to the credits page instead of printing the licence over the art", () => {
    cover("login-footer");
    // 「版權宣告頁應該是一個連結…而非直接在登入頁直接列出來一長串」
    expect(html).toContain("版權聲明");
    expect(html).toContain('href="#credits"');
    // the wall of text is gone from the footer itself
    expect(html).not.toContain("Animated Dragon Three Motion Loops");
  });

  it("the linked page still carries the mandatory CC-BY 4.0 dragon attribution", () => {
    cover("login-footer");
    // The obligation moved, it did not disappear. CC-BY 4.0 wants title, author
    // and licence, and the footer link is only compliant because they are all
    // one click away — so assert them where they now live.
    const dragon = CREDITS.find((c) => c.title.includes("Animated Dragon"));
    expect(dragon, "the dragon credit must exist somewhere").toBeDefined();
    expect(dragon!.mandatory).toBe(true);
    expect(dragon!.author).toContain("LasquetiSpice");
    expect(dragon!.license).toBe("CC-BY 4.0");
    expect(dragon!.licenseUrl).toBe("https://creativecommons.org/licenses/by/4.0/");
    expect(dragon!.sourceUrl).toContain("sketchfab.com");
  });

  it("keeps the 効果音ラボ usage terms visible somewhere a reader can find them", () => {
    cover("login-footer");
    const lab = CREDITS.find((c) => c.title.includes("効果音ラボ"));
    expect(lab?.terms).toContain("AI");
    expect(lab?.terms).toContain("裁切");
  });

  it("no longer credits 魔王魂 — none of that music ships", () => {
    cover("login-footer");
    // Crediting a licence you don't rely on misstates provenance. All eleven BGM
    // tracks now render from tools/bgm-gen; bgm/MANIFEST.json lists
    // generator.stillThirdParty as empty.
    expect(html).not.toContain("魔王魂");
    expect(html).not.toContain("maou.audio");
  });

  it("does not block the form: the footer container is pointer-events:none", () => {
    cover("login-footer");
    // the <footer> wrapper opts out of pointer events; only its links re-enable them
    expect(html).toMatch(/<footer[^>]*pointer-events:none/);
  });
});
