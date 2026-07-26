/**
 * VersionBadge (task #66, repaired by #245) — the build stamp on every screen
 * of the game client. Rendered to static markup with react-dom/server (the
 * client vitest runs in a `node` env, and the include glob is *.test.ts), so
 * this stays a .ts suite and uses React.createElement rather than JSX. In that
 * env `document` is absent, so `VersionBadge`'s <body> portal falls back to
 * inline rendering and the markup is still assertable.
 *
 * What matters here:
 *   • the injected stamp renders verbatim (so a screenshot is traceable);
 *   • the badge paints ABOVE everything and is pinned to the BOTTOM band —
 *     #245's fix. At #66's `z-index: 1` it was covered by the settlement panel
 *     and the shop card, i.e. invisible on the screens most screenshotted;
 *   • it is click-through, which is the property that makes painting on top
 *     safe at any z-index;
 *   • when no stamp was injected (vitest, which does not run vite.config's
 *     define) the reader falls back to "dev" — honest, never blank, never
 *     "undefined".
 *
 * The per-SURFACE claims ("visible on the lobby / battle / shop / settlement")
 * live in ./versionBadgeSurfaces.test.ts; the band reservation lives in
 * ./hud/versionBadgeBand.test.ts. This file is the component itself.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import {
  VERSION_BADGE_APP_ATTR,
  VERSION_BADGE_ATTR,
  VERSION_BADGE_BAND_PX,
  VERSION_BADGE_Z,
} from "@ggd/shared/versionBadge";
import {
  VersionBadge,
  VersionBadgeView,
  resolveStamp,
  preferLiveStamp,
  BUILD_STAMP_FALLBACK,
  LIVE_STAMP_ROUTE,
} from "./VersionBadge";

describe("VersionBadge (version-badge)", () => {
  it("renders the injected build stamp verbatim, tagged as the CLIENT app", () => {
    cover("version-badge");
    const stamp = "a1b2c3d 2026-07-26";
    const html = renderToStaticMarkup(createElement(VersionBadgeView, { stamp }));
    expect(html).toContain(stamp);
    expect(html).toContain(VERSION_BADGE_ATTR);
    // client / admin / editor are three separately-built dists in one image; a
    // bare sha does not say which front-end a screenshot came from
    expect(html).toContain(`${VERSION_BADGE_APP_ATTR}="client"`);
  });

  it("paints ABOVE everything, pinned to the bottom band, click-through", () => {
    cover("version-badge");
    const html = renderToStaticMarkup(createElement(VersionBadgeView, { stamp: "x" }));
    expect(html).toMatch(/position:fixed/);
    expect(html).toMatch(/bottom:0/); // flush with the bottom edge
    expect(html).not.toMatch(/top:/); // and never a top badge
    // click-through so it can never swallow input from the chrome beneath it —
    // this is what makes the high z-index safe
    expect(html).toMatch(/pointer-events:none/);
    // #245: the WHOLE point. At z-index 1 (what #66 shipped) the settlement
    // panel (z 40, inset:0, opaque wash) and the shop card (z 40, full height)
    // painted straight over the badge.
    expect(html).toContain(`z-index:${VERSION_BADGE_Z}`);
    // and it stays inside the reserved 10px band, so it cannot cover a control
    expect(html).toContain(`height:${VERSION_BADGE_BAND_PX}px`);
  });

  it("falls back to 'dev' when no stamp was injected; passes any real stamp through", () => {
    cover("version-badge");
    expect(BUILD_STAMP_FALLBACK).toBe("dev");
    expect(resolveStamp(undefined)).toBe("dev");
    expect(resolveStamp("")).toBe("dev");
    expect(resolveStamp("   ")).toBe("dev");
    expect(resolveStamp("9f8e7d6 2026-07-22")).toBe("9f8e7d6 2026-07-22");
  });

  it("a live dev stamp WINS over the frozen literal — the P8 staleness fix", () => {
    cover("version-badge");
    // The regression: a dev server booted at 7d1bb37 keeps substituting that sha
    // via `define` no matter how far HEAD moves, so the badge lied about which
    // build a screenshot came from. The live dev route is the fresher fact.
    expect(preferLiveStamp("7d1bb37 2026-07-14", "49dca64 2026-07-24")).toBe("49dca64 2026-07-24");
    expect(preferLiveStamp("7d1bb37 2026-07-14", " 49dca64 2026-07-24 ")).toBe("49dca64 2026-07-24");
  });

  it("every live-stamp failure mode falls back to the baked literal, never to blank", () => {
    cover("version-badge");
    const baked = "7d1bb37 2026-07-14";
    expect(preferLiveStamp(baked, null)).toBe(baked); // no route (prod build) / fetch failed
    expect(preferLiveStamp(baked, "")).toBe(baked); // empty body
    expect(preferLiveStamp(baked, "   ")).toBe(baked); // whitespace body
    // and the route is a dev-only, clearly-namespaced path — never a real screen
    expect(LIVE_STAMP_ROUTE.startsWith("/__")).toBe(true);
  });

  it("the default export always renders a non-empty stamp inside the badge", () => {
    cover("version-badge");
    // buildStamp() reads import.meta.env: absent → "dev"; a real build injects a
    // sha+date. Assert the badge carries SOME non-empty stamp either way rather
    // than a literal, so this passes on a git machine and off one alike.
    const html = renderToStaticMarkup(createElement(VersionBadge));
    expect(html).toContain(VERSION_BADGE_ATTR);
    const inner = /data-ggd-version-badge[^>]*>([^<]+)</.exec(html)?.[1] ?? "";
    expect(inner.trim().length).toBeGreaterThan(0);
    expect(inner).not.toContain("undefined");
  });
});
