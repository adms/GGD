/**
 * VersionBadge (task #66) — the build stamp pinned to the bottom of every
 * screen. Rendered to static markup with react-dom/server (the client vitest
 * runs in a `node` env, and the include glob is *.test.ts), so this stays a .ts
 * suite and uses React.createElement rather than JSX.
 *
 * What matters here:
 *   • the injected stamp renders verbatim (so a screenshot is traceable);
 *   • the badge is position:fixed and pinned to the BOTTOM, click-through, and
 *     never a top badge — it can't cover interactive chrome;
 *   • when no stamp was injected (a build with no git, or vitest, which does not
 *     run vite.config's define) the reader falls back to "dev". `resolveStamp`
 *     is a pure function so this is asserted directly, independent of whatever
 *     `import.meta.env.VITE_BUILD_STAMP` happens to hold in this runtime.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import {
  VersionBadge,
  VersionBadgeView,
  resolveStamp,
  BUILD_STAMP_FALLBACK,
} from "./VersionBadge";

describe("VersionBadge (version-badge)", () => {
  it("renders the injected build stamp verbatim", () => {
    cover("version-badge");
    const stamp = "a1b2c3d 2026-07-22";
    const html = renderToStaticMarkup(createElement(VersionBadgeView, { stamp }));
    expect(html).toContain(stamp);
    expect(html).toContain("data-ggd-version-badge");
  });

  it("is pinned to the BOTTOM: position:fixed, low z, click-through, not a top badge", () => {
    cover("version-badge");
    const html = renderToStaticMarkup(createElement(VersionBadgeView, { stamp: "x" }));
    expect(html).toMatch(/position:fixed/);
    expect(html).toMatch(/bottom:/); // pinned to the bottom edge
    expect(html).not.toMatch(/top:/); // and not the top
    // click-through so it can never swallow input from the chrome beneath it
    expect(html).toMatch(/pointer-events:none/);
    // low z-index (renders under #hud-root, never over interactive chrome)
    expect(html).toMatch(/z-index:1\b/);
  });

  it("falls back to 'dev' when no stamp was injected; passes any real stamp through", () => {
    cover("version-badge");
    expect(BUILD_STAMP_FALLBACK).toBe("dev");
    expect(resolveStamp(undefined)).toBe("dev");
    expect(resolveStamp("")).toBe("dev");
    expect(resolveStamp("   ")).toBe("dev");
    expect(resolveStamp("9f8e7d6 2026-07-22")).toBe("9f8e7d6 2026-07-22");
  });

  it("the default export always renders a non-empty stamp inside the badge", () => {
    cover("version-badge");
    // buildStamp() reads import.meta.env: absent → "dev"; a real build injects a
    // sha+date. Assert the badge carries SOME non-empty stamp either way rather
    // than a literal, so this passes on a git machine and off one alike.
    const html = renderToStaticMarkup(createElement(VersionBadge));
    expect(html).toContain("data-ggd-version-badge");
    const inner = /data-ggd-version-badge[^>]*>([^<]+)</.exec(html)?.[1] ?? "";
    expect(inner.trim().length).toBeGreaterThan(0);
  });
});
