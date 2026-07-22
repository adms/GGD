/**
 * icon-ui-glyph-fallback (docs/todo/icons.md icons-16).
 *
 * The icon-less path is not an edge case in this project — 768 of 881 content
 * docs have no art and some never will (tools/icon-gen drops them on purpose).
 * So the FALLBACK is a shipped feature and gets pinned like one.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { glyphFor, glyphTileColors, seedHash } from "./glyphTileStyle";

describe("missing-icon glyph tile", () => {
  it("is stable for an id and independent of the runtime", () => {
    cover("icon-ui-glyph-fallback");
    // Same id ⇒ same tile, forever. A player must not see an item change
    // colour between sessions, and the hash must not depend on the engine.
    expect(seedHash("godie-i002")).toBe(seedHash("godie-i002"));
    expect(glyphTileColors("godie-i002")).toEqual(glyphTileColors("godie-i002"));
    // FNV-1a is fully specified, so this is a real regression pin, not a
    // snapshot of whatever the implementation happened to do.
    expect(seedHash("")).toBe(0x811c9dc5);
    expect(seedHash("a")).toBe(0xe40c292c);
  });

  it("gives neighbouring entries DIFFERENT tiles — the whole point", () => {
    cover("icon-ui-glyph-fallback");
    // The bug this replaced: every icon-less row rendered the same flat grey
    // box, so a shop list of thirty items was thirty identical squares.
    const ids = ["godie-i001", "godie-i002", "godie-i003", "godie-i004", "godie-i005"];
    const hues = new Set(ids.map((id) => glyphTileColors(id).hue));
    expect(hues.size).toBeGreaterThan(1);
    // and every hue is a real, in-range degree
    for (const id of ids) {
      const { hue } = glyphTileColors(id);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it("lets a caller's meaningful colour win over the hash", () => {
    cover("icon-ui-glyph-fallback");
    // An ability-slot or rarity colour carries information; a hash does not.
    expect(glyphTileColors("anything", 200).hue).toBe(200);
  });

  it("draws one CODE POINT, never half a surrogate pair", () => {
    cover("icon-ui-glyph-fallback");
    expect(glyphFor("鬼隱之擊")).toBe("鬼");
    expect(glyphFor("swift boots")).toBe("S");
    expect(glyphFor("  padded  ")).toBe("P");
    // `s[0]` here would emit a lone high surrogate and render as a tofu box.
    // Author-supplied content names will contain emoji sooner or later.
    expect(glyphFor("🔥 flame")).toBe("🔥");
    expect(glyphFor("")).toBe("?");
    expect(glyphFor(null)).toBe("?");
    expect(glyphFor(undefined, "·")).toBe("·");
  });

  it("keeps the tile dark enough to sit under a real icon's art direction", () => {
    cover("icon-ui-glyph-fallback");
    // The generated icons are painted on a near-black void (#0B0E16). A bright
    // fallback next to them would read as broken, not as a placeholder.
    const { background, border, color } = glyphTileColors("godie-i002");
    expect(background).toContain("#0b0e16");
    // rim and glyph must still be legible against that pool
    expect(border).toMatch(/hsl\(\d+ 45% 42%\)/);
    expect(color).toMatch(/hsl\(\d+ 62% 82%\)/);
  });
});
