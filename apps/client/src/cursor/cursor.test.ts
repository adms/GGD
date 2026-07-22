/**
 * cursor: the JRPG mouse cursor + its size setting (task #54a).
 *
 * Four gates, one per way this feature can silently stop working:
 *   • the size setting persists and round-trips (and a corrupt / future blob
 *     degrades to the default instead of leaving the player with no cursor);
 *   • every (variant × size) pair resolves to a file that ACTUALLY EXISTS in
 *     public/cursors/ with an in-bounds hotspot — a 404 or an out-of-range
 *     hotspot both make the engine drop the declaration and silently restore
 *     the OS arrow, which no visual test would catch;
 *   • applying a size really does change the resolved CSS, reaches a root
 *     element through the store subscription, and is wired into the entry point;
 *   • cursor.css cannot touch a coarse-pointer device: every rule in the file
 *     is proven to live inside `(hover: hover) and (pointer: fine)`.
 *
 * Env note: the client vitest runs in `node` (no DOM), which is exactly why the
 * DOM-touching helpers take a structural `CursorRoot` — they are exercised here
 * against a recording fake, and their real no-DOM behaviour is asserted too.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import {
  CURSOR_DESIGN_UNITS,
  CURSOR_HOTSPOT_DESIGN,
  CURSOR_SIZES,
  CURSOR_SIZE_OPTIONS,
  CURSOR_SIZE_PX,
  CURSOR_VARIANTS,
  cursorAssetFile,
  cursorAssetUrl,
  cursorCssValue,
  cursorCssVar,
  cursorHotspot,
  cursorSvgFile,
  isCursorSize,
} from "./cursorTheme";
import {
  CURSOR_SETTINGS_VERSION,
  CURSOR_STORAGE_KEY,
  CursorSettingsStore,
  DEFAULT_CURSOR_PREFS,
  clampCursorPrefs,
} from "./cursorSettings";
import {
  CURSOR_ROOT_ATTR,
  CURSOR_SIZE_ATTR,
  CURSOR_VARIANT_ATTR,
  applyCursorSize,
  initCursor,
  resolveCursorVars,
  setCursorVariant,
} from "./applyCursor";

const PUBLIC_CURSORS = join(__dirname, "..", "..", "public", "cursors");
const CSS_FILE = join(__dirname, "cursor.css");
const MAIN_TSX = join(__dirname, "..", "main.tsx");

interface FakeStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  data: Record<string, string>;
}

function fakeStorage(seed: Record<string, string> = {}): FakeStorage {
  const data = { ...seed };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

/** Recording stand-in for <html> (the client test env has no DOM). */
function fakeRoot(): {
  props: Record<string, string>;
  attrs: Record<string, string>;
  style: { setProperty(n: string, v: string): void };
  setAttribute(n: string, v: string): void;
  removeAttribute(n: string): void;
} {
  const props: Record<string, string> = {};
  const attrs: Record<string, string> = {};
  return {
    props,
    attrs,
    style: {
      setProperty(n, v) {
        props[n] = v;
      },
    },
    setAttribute(n, v) {
      attrs[n] = v;
    },
    removeAttribute(n) {
      delete attrs[n];
    },
  };
}

/** cursor.css with block comments removed. */
function cssSource(): string {
  return readFileSync(CSS_FILE, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("cursor: size setting persists + round-trips (cursor-size-persist)", () => {
  it("defaults to M, round-trips a pick through localStorage, and reloads it", () => {
    cover("cursor-size-persist");
    const storage = fakeStorage();

    const a = new CursorSettingsStore(storage);
    expect(a.getSize()).toBe("m"); // conspicuous by default — the whole request
    expect(a.getSize()).toBe(DEFAULT_CURSOR_PREFS.size);
    expect(storage.data[CURSOR_STORAGE_KEY]).toBeUndefined(); // reading persists nothing

    a.setSize("xl");
    const blob = JSON.parse(storage.data[CURSOR_STORAGE_KEY]!) as Record<string, unknown>;
    expect(blob.size).toBe("xl");
    expect(blob.version).toBe(CURSOR_SETTINGS_VERSION);

    // a fresh store on the same storage reloads the pick verbatim
    expect(new CursorSettingsStore(storage).getSize()).toBe("xl");

    // ...and every step survives the trip
    for (const size of CURSOR_SIZES) {
      a.setSize(size);
      expect(new CursorSettingsStore(storage).getSize()).toBe(size);
    }
  });

  it("notifies subscribers on a real change and stays quiet on a repeat", () => {
    cover("cursor-size-persist");
    const store = new CursorSettingsStore(fakeStorage());
    const seen: string[] = [];
    const off = store.subscribe((p) => seen.push(p.size));

    store.setSize("l");
    store.setSize("l"); // same value — a picker may fire this on every render
    store.setSize("s");
    expect(seen).toEqual(["l", "s"]);

    off();
    store.setSize("xl");
    expect(seen).toEqual(["l", "s"]); // unsubscribed
    expect(store.getSize()).toBe("xl"); // ...but the store still changed
  });

  it("degrades a corrupt, partial or future-version blob to the default", () => {
    cover("cursor-size-persist");
    const garbage = new CursorSettingsStore(fakeStorage({ [CURSOR_STORAGE_KEY]: "{not json" }));
    expect(garbage.getSize()).toBe(DEFAULT_CURSOR_PREFS.size);

    // written by a hypothetical later build that added an "xxl" step
    const future = new CursorSettingsStore(
      fakeStorage({ [CURSOR_STORAGE_KEY]: JSON.stringify({ version: 99, size: "xxl" }) }),
    );
    expect(future.getSize()).toBe(DEFAULT_CURSOR_PREFS.size);

    expect(clampCursorPrefs({}).size).toBe(DEFAULT_CURSOR_PREFS.size);
    expect(clampCursorPrefs(null).size).toBe(DEFAULT_CURSOR_PREFS.size);
    expect(clampCursorPrefs({ size: 48 }).size).toBe(DEFAULT_CURSOR_PREFS.size);
    expect(isCursorSize("m")).toBe(true);
    expect(isCursorSize("xxl")).toBe(false);

    // a store that cannot reach storage at all still works in memory
    const noStorage = new CursorSettingsStore(null);
    noStorage.setSize("s");
    expect(noStorage.getSize()).toBe("s");
  });
});

describe("cursor: every size maps to a real asset + valid hotspot (cursor-asset-hotspot)", () => {
  it("ships a raster for every variant × size, with an in-bounds hotspot", () => {
    cover("cursor-asset-hotspot");
    expect(CURSOR_VARIANTS.length).toBeGreaterThan(0);
    expect(CURSOR_SIZES.length).toBe(4);

    for (const variant of CURSOR_VARIANTS) {
      // the vector master is checked in beside the ladder
      expect(existsSync(join(PUBLIC_CURSORS, cursorSvgFile(variant)))).toBe(true);

      for (const size of CURSOR_SIZES) {
        const px = CURSOR_SIZE_PX[size];
        const file = cursorAssetFile(variant, size);
        expect(existsSync(join(PUBLIC_CURSORS, file))).toBe(true);

        const hot = cursorHotspot(variant, size);
        // integral and addressable — a fractional or out-of-range hotspot makes
        // the whole `cursor` declaration invalid and the OS arrow comes back
        expect(Number.isInteger(hot.x)).toBe(true);
        expect(Number.isInteger(hot.y)).toBe(true);
        expect(hot.x).toBeGreaterThanOrEqual(0);
        expect(hot.y).toBeGreaterThanOrEqual(0);
        expect(hot.x).toBeLessThan(px);
        expect(hot.y).toBeLessThan(px);

        // ...and it tracks the design coordinate rather than being a magic number
        const scale = px / CURSOR_DESIGN_UNITS;
        const want = CURSOR_HOTSPOT_DESIGN[variant];
        expect(hot.x).toBe(Math.min(px - 1, Math.round(want.x * scale)));
        expect(hot.y).toBe(Math.min(px - 1, Math.round(want.y * scale)));

        // the CSS value points at that same file with that same hotspot
        expect(cursorCssValue(variant, size)).toBe(
          `url("${cursorAssetUrl(variant, size)}") ${hot.x} ${hot.y}`,
        );
        expect(cursorAssetUrl(variant, size)).toBe(`/cursors/${file}`);
      }
    }
  });

  it("offers exactly the four steps, ascending, to a size picker", () => {
    cover("cursor-asset-hotspot");
    expect(CURSOR_SIZE_OPTIONS.map((o) => o.value)).toEqual([...CURSOR_SIZES]);
    expect(CURSOR_SIZE_OPTIONS.map((o) => o.px)).toEqual([32, 48, 64, 96]);
    expect(CURSOR_SIZE_OPTIONS.map((o) => o.label)).toEqual(["S", "M", "L", "XL"]);
    for (const o of CURSOR_SIZE_OPTIONS) expect(o.px).toBe(CURSOR_SIZE_PX[o.value]);
    // XL stays under the ~128px cursor-image cap every engine enforces
    expect(Math.max(...CURSOR_SIZE_OPTIONS.map((o) => o.px))).toBeLessThanOrEqual(128);
  });
});

describe("cursor: applying a size changes the resolved CSS (cursor-apply-live)", () => {
  it("resolves a distinct image value per variant, and a distinct set per size", () => {
    cover("cursor-apply-live");
    const small = resolveCursorVars("s");
    const large = resolveCursorVars("xl");

    for (const variant of CURSOR_VARIANTS) {
      const name = cursorCssVar(variant);
      expect(small[name]).toBe(cursorCssValue(variant, "s"));
      expect(large[name]).toBe(cursorCssValue(variant, "xl"));
      expect(small[name]).not.toBe(large[name]); // the size actually reaches CSS
      expect(small[name]).toContain("-32.png");
      expect(large[name]).toContain("-96.png");
    }
    // and the three variants never collapse onto one image
    expect(new Set(Object.values(small)).size).toBe(CURSOR_VARIANTS.length);
  });

  it("writes the variables + attributes onto a root element", () => {
    cover("cursor-apply-live");
    const root = fakeRoot();
    applyCursorSize("l", root);

    expect(root.attrs[CURSOR_ROOT_ATTR]).toBe("on"); // arms cursor.css
    expect(root.attrs[CURSOR_SIZE_ATTR]).toBe("l");
    for (const variant of CURSOR_VARIANTS) {
      expect(root.props[cursorCssVar(variant)]).toBe(cursorCssValue(variant, "l"));
    }

    applyCursorSize("s", root); // instant swap — same element, new values
    expect(root.attrs[CURSOR_SIZE_ATTR]).toBe("s");
    expect(root.props[cursorCssVar("default")]).toBe(cursorCssValue("default", "s"));
  });

  it("drives the root from a store change, and toggles the combat variant", () => {
    cover("cursor-apply-live");
    const store = new CursorSettingsStore(fakeStorage());
    const root = fakeRoot();
    // exactly the wiring initCursor performs, minus the document lookup
    applyCursorSize(store.getSize(), root);
    const off = store.subscribe((p) => applyCursorSize(p.size, root));

    expect(root.props[cursorCssVar("pointer")]).toBe(cursorCssValue("pointer", "m"));
    store.setSize("xl");
    expect(root.props[cursorCssVar("pointer")]).toBe(cursorCssValue("pointer", "xl"));
    expect(root.attrs[CURSOR_SIZE_ATTR]).toBe("xl");
    off();

    // combat variant is an attribute flip — and DOM-safe without a document
    expect(() => setCursorVariant("attack")).not.toThrow();
    expect(() => setCursorVariant(null)).not.toThrow();
    expect(typeof document).toBe("undefined"); // guard: this env really has no DOM
    expect(() => initCursor()()).not.toThrow();
  });

  it("is actually wired into the app entry point", () => {
    cover("cursor-apply-live");
    // the whole feature is invisible if main.tsx forgets either half
    const main = readFileSync(MAIN_TSX, "utf8");
    expect(main).toMatch(/initCursor\(\)/);
    expect(main).toMatch(/cursor\/cursor\.css/);
  });
});

describe("cursor: pointer-only, never a touch-device regression (cursor-touch-safe)", () => {
  it("keeps every cursor.css rule inside (hover: hover) and (pointer: fine)", () => {
    cover("cursor-touch-safe");
    const css = cssSource().trim();

    // one media query, opened first and closed last: nothing can escape it
    expect(css.startsWith("@media (hover: hover) and (pointer: fine) {")).toBe(true);
    expect(css.endsWith("}")).toBe(true);

    let depth = 0;
    for (let i = 0; i < css.length; i++) {
      const ch = css[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        // depth 0 before the final char would mean a rule sits OUTSIDE the query
        expect(depth === 0 && i !== css.length - 1).toBe(false);
      }
    }
    expect(depth).toBe(0);

    // every `cursor:` declaration falls back to the native keyword it replaces,
    // so an unfetched PNG degrades to the stock cursor rather than to nothing
    const decls = css.match(/cursor:[^;]+;/g) ?? [];
    expect(decls.length).toBeGreaterThan(3);
    for (const d of decls) {
      expect(d).toMatch(/(auto|default|pointer|text|crosshair)\s*(!important)?\s*;$/);
    }
  });

  it("never touches gestures, touch targets or the canvas's touch-action", () => {
    cover("cursor-touch-safe");
    const css = cssSource();
    // `cursor` is a pointer-only property; this file must not smuggle in any
    // layout/gesture declaration that could reach a phone through the cascade
    for (const forbidden of [
      "touch-action",
      "pointer-events",
      "min-width",
      "min-height",
      "user-select",
      "display:",
      "position:",
    ]) {
      expect(css).not.toContain(forbidden);
    }
    // the ONLY canvas rule is the in-combat reticle, and it is variant-scoped
    const canvasRules = css.match(/[^{}]*#game-canvas[^{]*\{/g) ?? [];
    expect(canvasRules).toHaveLength(1);
    expect(canvasRules[0]).toContain(`[${CURSOR_VARIANT_ATTR}="attack"]`);
  });
});
