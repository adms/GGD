/**
 * The shared build-stamp badge core (task #66 / #245).
 *
 * These are the rules three separately-built apps depend on, so they are tested
 * once here rather than three times: how a stamp degrades when nothing injected
 * one, which stamp wins when a dev server reports a fresher one, and the box the
 * badge is allowed to paint in.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../testkit/cover";
import {
  BUILD_STAMP_FALLBACK,
  LIVE_STAMP_MAX_LEN,
  LIVE_STAMP_POLL_MS,
  LIVE_STAMP_ROUTE,
  VERSION_BADGE_APP_ATTR,
  VERSION_BADGE_ATTR,
  VERSION_BADGE_BAND_PX,
  VERSION_BADGE_Z,
  isPlausibleLiveStamp,
  preferLiveStamp,
  resolveStamp,
  versionBadgeStyle,
} from "./versionBadge";

describe("version badge core (version-badge-core)", () => {
  it("degrades to an honest 'dev', never to blank or 'undefined'", () => {
    cover("version-badge-core");
    expect(BUILD_STAMP_FALLBACK).toBe("dev");
    expect(resolveStamp(undefined)).toBe("dev");
    expect(resolveStamp(null)).toBe("dev");
    expect(resolveStamp("")).toBe("dev");
    expect(resolveStamp("   ")).toBe("dev");
    // and a real stamp passes through verbatim (trimmed), so a screenshot is
    // traceable to the exact commit
    expect(resolveStamp("9f8e7d6 2026-07-26")).toBe("9f8e7d6 2026-07-26");
    expect(resolveStamp("  9f8e7d6-dirty 2026-07-26  ")).toBe("9f8e7d6-dirty 2026-07-26");
  });

  it("a live dev stamp wins; every failure mode keeps the baked literal", () => {
    cover("version-badge-core");
    const baked = "7d1bb37 2026-07-14";
    expect(preferLiveStamp(baked, "49dca64 2026-07-26")).toBe("49dca64 2026-07-26");
    expect(preferLiveStamp(baked, " 49dca64 2026-07-26 ")).toBe("49dca64 2026-07-26");
    expect(preferLiveStamp(baked, null)).toBe(baked); // prod build: no route
    expect(preferLiveStamp(baked, undefined)).toBe(baked); // fetch threw
    expect(preferLiveStamp(baked, "")).toBe(baked); // empty body
    expect(preferLiveStamp(baked, "   ")).toBe(baked); // whitespace body
  });

  it("rejects an SPA index.html fallback as a stamp", () => {
    cover("version-badge-core");
    expect(isPlausibleLiveStamp("49dca64 2026-07-26")).toBe(true);
    expect(isPlausibleLiveStamp("<!doctype html><html>…")).toBe(false);
    expect(isPlausibleLiveStamp("x".repeat(LIVE_STAMP_MAX_LEN + 1))).toBe(false);
    expect(isPlausibleLiveStamp("")).toBe(false);
    expect(isPlausibleLiveStamp(null)).toBe(false);
    // the dev route is clearly namespaced so it can never collide with a screen
    expect(LIVE_STAMP_ROUTE.startsWith("/__")).toBe(true);
    expect(LIVE_STAMP_POLL_MS).toBeGreaterThan(0);
  });

  it("paints above every declared layer, click-through, inside the reserved band", () => {
    cover("version-badge-core");
    const s = versionBadgeStyle();
    // ABOVE the client's tallest declared layer (HUD_Z.modal = 2147483600) and
    // the <body>-portaled audio cluster (Z_TOP = 2147483000). This is the whole
    // #245 fix: at #66's z-index 1 the settlement panel and the shop card
    // painted straight over the badge.
    expect(VERSION_BADGE_Z).toBeGreaterThan(2147483600);
    expect(VERSION_BADGE_Z).toBeLessThanOrEqual(2147483647); // int32 ceiling
    expect(s.zIndex).toBe(VERSION_BADGE_Z);
    // painting on top is only safe because it can never take a click…
    expect(s.pointerEvents).toBe("none");
    // …and because it is confined to the reserved bottom band
    expect(s.position).toBe("fixed");
    expect(s.bottom).toBe(0);
    expect(s.height).toBe(VERSION_BADGE_BAND_PX);
    expect(s.boxSizing).toBe("content-box"); // padding must not grow the height
    expect(s.lineHeight).toBe(`${VERSION_BADGE_BAND_PX}px`);
    // pinned to the BOTTOM, never the top (the top edge is the notch / the
    // ability-description overlay)
    expect(Object.keys(s)).not.toContain("top");
    // and it clears the phone home indicator
    expect(s.marginBottom).toContain("safe-area-inset-bottom");
  });

  it("is legible rather than a faint 0.55-opacity whisper", () => {
    cover("version-badge-core");
    const s = versionBadgeStyle();
    // #66 shipped TEXT_DIM at opacity 0.55 with no backing, which is what made
    // it unreadable over the login artwork and the victory wash. Contrast has
    // to come from the chip, because the band caps the height at 10px.
    expect(s.background).not.toBe("transparent");
    expect(s.textShadow.length).toBeGreaterThan(0);
    expect(s.fontWeight).toBeGreaterThanOrEqual(600);
    expect(Object.keys(s)).not.toContain("opacity");
  });

  it("exposes stable DOM markers for the guards and for screenshot tooling", () => {
    cover("version-badge-core");
    expect(VERSION_BADGE_ATTR).toBe("data-ggd-version-badge");
    expect(VERSION_BADGE_APP_ATTR).toBe("data-ggd-version-badge-app");
  });
});
