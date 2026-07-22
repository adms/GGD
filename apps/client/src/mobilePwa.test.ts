/**
 * mobile-13/14: PWA + layout wiring gate (file-scan, in the spirit of
 * architecture.test.ts) — the web-app manifest (standalone / landscape /
 * icons on disk), the apple-touch-icon + iOS meta tags in index.html, NO
 * service worker (deliberately deferred), and the mobile stylesheet's
 * safe-area insets + >=44px platform touch targets + gesture opt-outs.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";

const ROOT = join(__dirname, "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

describe("PWA manifest + iOS meta (mobile-13)", () => {
  it("manifest: standalone landscape app named 去死團的逆襲 with real icons", () => {
    cover("mobile-pwa-manifest");
    const manifest = JSON.parse(read("public/manifest.webmanifest")) as {
      short_name: string;
      display: string;
      orientation: string;
      background_color: string;
      theme_color: string;
      icons: { src: string; sizes: string; type: string }[];
    };
    expect(manifest.short_name).toBe("去死團的逆襲");
    expect(manifest.display).toBe("standalone");
    expect(manifest.orientation).toBe("landscape");
    expect(manifest.background_color).toMatch(/^#/);
    expect(manifest.theme_color).toMatch(/^#/);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toContain("180x180");
    expect(sizes).toContain("512x512");
    for (const icon of manifest.icons) {
      expect(existsSync(join(ROOT, "public", icon.src))).toBe(true);
      expect(icon.type).toBe("image/png");
    }
  });

  it("index.html: manifest + apple-touch-icon + iOS standalone meta", () => {
    cover("mobile-pwa-manifest");
    const html = read("index.html");
    expect(html).toContain('rel="manifest"');
    expect(html).toContain("/manifest.webmanifest");
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="theme-color"');
    expect(existsSync(join(ROOT, "public/icons/apple-touch-icon.png"))).toBe(true);
  });

  it("NO service worker yet (offline cache is deliberately future work)", () => {
    cover("mobile-pwa-manifest");
    expect(read("index.html")).not.toContain("serviceWorker");
    expect(read("src/main.tsx")).not.toContain("serviceWorker");
  });
});

describe("safe-area + touch layout stylesheet (mobile-14)", () => {
  it("viewport-fit=cover + no-zoom viewport and gesture opt-outs", () => {
    cover("mobile-safe-area");
    const html = read("index.html");
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain("user-scalable=no");
    expect(html).toMatch(/#game-canvas[\s\S]*?touch-action:\s*none/);
    expect(html).toContain("overscroll-behavior: none");
  });

  it("mobile.css: safe-area insets on HUD edges, scoped to coarse pointers", () => {
    cover("mobile-safe-area");
    const css = read("src/ui/mobile.css");
    expect(css).toContain("@media (pointer: coarse)");
    for (const edge of ["left", "right", "top", "bottom"]) {
      expect(css).toContain(`env(safe-area-inset-${edge}`);
    }
    expect(css).toMatch(/#game-canvas[\s\S]*?touch-action:\s*none/);
  });

  it("mobile.css: >=44px touch targets + 16px inputs on platform screens", () => {
    cover("mobile-safe-area");
    const css = read("src/ui/mobile.css");
    expect(css).toMatch(/\.ggd-platform button[\s\S]*?min-height:\s*44px/);
    expect(css).toMatch(/\.ggd-platform input[\s\S]*?min-height:\s*44px/);
    expect(css).toMatch(/font-size:\s*16px/); // stops iOS focus auto-zoom
    // the platform screens actually opt in to the scope class
    expect(read("src/ui/platform/AppRoot.tsx")).toContain('className="ggd-platform"');
  });
});
