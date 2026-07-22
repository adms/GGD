/**
 * Champion-portrait login marquee — the pure tile-list builder (marqueeRoster).
 * Node env, no DOM: the JSX band is a thin view over this, so the roster→tiles
 * logic (form exclusion, icon-less fallback, seamless duplication, stable chip
 * color) is exercised as a pure function with hand-written fixtures.
 *
 * The last two suites are the task #55 regression: the marquee must decide "one
 * tile per CHARACTER" with the shared identity rule and "no visibly duplicate
 * PORTRAIT" as a separate cosmetic pass, so that 黑化Saber — which shares both a
 * mesh and an extracted PNG with 亞瑟王-Saber — is never again erased from the
 * showcase. `SHARED_PORTRAIT_GROUPS` is additionally pinned against the actual
 * PNG bytes on disk, so it shrinks automatically as the icon bug is fixed.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  buildMarqueeTiles,
  firstGlyph,
  hueFromId,
  isSelectableChampion,
  isTestHero,
  SHARED_PORTRAIT_GROUPS,
  tintCssOf,
  withoutDuplicatePortraits,
  type MarqueeChampion,
} from "./marqueeRoster";

const ICONED: MarqueeChampion = {
  id: "godie-e001",
  name: "蟬在叫人壞掉 - 龍宮禮奈",
  icon: "assets/icons/champions/godie-e001.png",
  tags: ["wc3-import", "godie"],
  modelKey: "imported.renaryugu2",
  abilities: { Q: { name: "22-01 鉈亂舞" }, W: { name: "22-02 隱匿" } },
};
const NO_ICON: MarqueeChampion = {
  id: "godie-stock",
  name: "石頭英雄",
  tags: ["godie"],
};
const FORM: MarqueeChampion = {
  id: "godie-alt",
  name: "變身形態",
  icon: "assets/icons/champions/godie-alt.png",
  tags: ["godie", "transform-form"],
};

describe("marqueeRoster.buildMarqueeTiles", () => {
  it("excludes non-selectable transform/alt forms", () => {
    cover("champ-marquee-exclude-forms");
    expect(isSelectableChampion(FORM)).toBe(false);
    expect(isSelectableChampion(ICONED)).toBe(true);

    const tiles = buildMarqueeTiles([ICONED, FORM, NO_ICON], { copies: 2 });
    const ids = new Set(tiles.map((t) => t.id));
    expect(ids.has("godie-alt")).toBe(false); // form dropped
    expect(ids.has("godie-e001")).toBe(true);
    expect(ids.has("godie-stock")).toBe(false); // no portrait → dropped
    // only the 1 hero with a real portrait × 2 copies
    expect(tiles).toHaveLength(2);
  });

  it("drops no-portrait heroes and resolves real portraits to /content", () => {
    cover("champ-marquee-fallback");
    const tiles = buildMarqueeTiles([ICONED, NO_ICON], { copies: 2 });

    const iconed = tiles.find((t) => t.id === "godie-e001")!;
    expect(iconed.iconUrl).toBe("/content/assets/icons/champions/godie-e001.png");
    expect(iconed.tintCss).toBeNull(); // untinted champion → no multiply overlay

    // the portrait-less hero is excluded entirely (no placeholder chip in the showcase)
    expect(tiles.some((t) => t.id === "godie-stock")).toBe(false);
    // firstGlyph stays a safe defensive helper (used only for a runtime 404 chip)
    expect(firstGlyph("蟬在叫人壞掉 - 龍宮禮奈")).toBe("蟬");
    expect(firstGlyph("   ")).toBe("?"); // empty/whitespace name is safe
  });

  it("duplicates the roster for a seamless loop with unique per-copy keys", () => {
    cover("champ-marquee-loop");
    const ICONED2: MarqueeChampion = {
      id: "godie-e002",
      name: "亞瑟王 - Saber",
      icon: "assets/icons/champions/godie-e002.png",
      tags: ["godie"],
      modelKey: "imported.herosaber",
      abilities: { Q: { name: "20-02 感知能力" } },
    };
    const base = [ICONED, ICONED2]; // both have portraits → both featured
    const tiles = buildMarqueeTiles(base, { copies: 2 });

    // copies × distinct heroes
    expect(tiles).toHaveLength(base.length * 2);
    // every rendered tile has a distinct React key
    expect(new Set(tiles.map((t) => t.key)).size).toBe(tiles.length);
    // copy 2 mirrors copy 1 in id order (so translateX(-50%) wraps seamlessly)
    const firstHalf = tiles.slice(0, base.length).map((t) => t.id);
    const secondHalf = tiles.slice(base.length).map((t) => t.id);
    expect(secondHalf).toEqual(firstHalf);
  });

  it("excludes test heroes and folds true duplicates via the shared identity rule", () => {
    cover("champ-marquee-dedup");
    expect(isTestHero("測試英雄 - 索隆")).toBe(true);
    expect(isTestHero("瘋狂假面")).toBe(false); // 假 in a real name is not a test marker

    // Same hero number 22 + same name + same mesh ⇒ the SAME character; the
    // map's own random-hero pick (godie-e001) is the tile that survives.
    const ALT: MarqueeChampion = {
      id: "godie-e00n",
      name: "蟬在叫人壞掉 - 龍宮禮奈",
      icon: "assets/icons/champions/godie-e00n.png",
      tags: ["wc3-import", "godie"],
      modelKey: "imported.renaryugu2",
      abilities: { Q: { name: "22-01 鉈亂舞" }, W: { name: "22-02 隱匿" } },
    };
    const TEST: MarqueeChampion = {
      id: "godie-u01q",
      name: "測試英雄 - 索隆",
      icon: "assets/icons/champions/godie-u01q.png",
      tags: ["wc3-import", "godie"],
    };
    const tiles = buildMarqueeTiles([ICONED, ALT, TEST], { copies: 2 });
    const ids = new Set(tiles.map((t) => t.id));
    expect(ids.has("godie-e001")).toBe(true); // canonical kept
    expect(ids.has("godie-e00n")).toBe(false); // duplicate entry folded
    expect(ids.has("godie-u01q")).toBe(false); // test hero dropped
    expect(tiles).toHaveLength(2); // 1 real hero × 2 copies

    // REGRESSION: "曹操孟德 wears 皮卡丘's PNG" is an icon bug, NOT an identity
    // one. isSelectableChampion must no longer blocklist it by id — it is a
    // real champion that other screens still show.
    const CAOCAO: MarqueeChampion = {
      id: "godie-o02o",
      name: "曹操孟德 - 阿瞞大人",
      icon: "assets/icons/champions/godie-o02o.png",
      tags: ["godie"],
      modelKey: "champ.skin.rogue",
      abilities: { Q: { name: "87-01 亂世奸雄" } },
    };
    expect(isSelectableChampion(CAOCAO)).toBe(true);
  });

  it("stable chip hue, clamps copies, empty roster", () => {
    cover("champ-marquee-misc");
    // chip hue is deterministic + stable per id, and in range
    const h = hueFromId("godie-stock");
    expect(h).toBe(hueFromId("godie-stock"));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);

    // fewer than 2 copies is clamped up (a single copy cannot loop seamlessly)
    expect(buildMarqueeTiles([ICONED], { copies: 1 })).toHaveLength(2);
    // empty roster → empty (the component then renders nothing)
    expect(buildMarqueeTiles([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe("marquee identity vs portraits are separate concerns", () => {
  const SABER: MarqueeChampion = {
    id: "godie-e002",
    name: "亞瑟王 - Saber",
    icon: "assets/icons/champions/godie-e002.png",
    tags: ["godie"],
    modelKey: "imported.herosaber",
    abilities: { Q: { name: "20-02 感知能力" }, W: { name: "20-01 風王結界" } },
  };
  const SABER_TWIN: MarqueeChampion = {
    ...SABER,
    id: "godie-e00l",
    icon: "assets/icons/champions/godie-e00l.png",
  };
  const SABER_ALTER: MarqueeChampion = {
    id: "godie-e00q",
    name: "英靈-亞瑟王 - 黑化Saber",
    icon: "assets/icons/champions/godie-e00q.png",
    tags: ["godie"],
    modelKey: "imported.herosaber", // SAME mesh, SAME extracted PNG as Saber
    abilities: { Q: { name: "69-01 力量強化" }, W: { name: "69-02 黑泥召喚" } },
    tint: [0.2941, 0.2941, 0.2941],
  };

  it("keeps 黑化Saber on its own tile while folding the real Saber twin", () => {
    cover("champ-marquee-saber-alter");
    const ids = new Set(
      buildMarqueeTiles([SABER, SABER_TWIN, SABER_ALTER], { copies: 2 }).map((t) => t.id),
    );
    expect(ids.has("godie-e002")).toBe(true); // canonical Saber
    expect(ids.has("godie-e00l")).toBe(false); // its true duplicate, folded
    expect(ids.has("godie-e00q")).toBe(true); // 黑化Saber SURVIVES (was the bug)

    // …and it is visibly a different portrait: the w3x tint is applied as an
    // exact multiply over the shared bitmap.
    const alter = buildMarqueeTiles([SABER, SABER_ALTER], { copies: 2 }).find(
      (t) => t.id === "godie-e00q",
    );
    expect(alter?.tintCss).toBe("rgb(75, 75, 75)");
    expect(tintCssOf(SABER)).toBeNull();
    expect(tintCssOf({ ...SABER, tint: [1, 1, 1] })).toBeNull(); // white = untinted
  });

  it("hides only the tile, never the champion, when two portraits are the same bitmap", () => {
    // 傑洛士 and 涼宮八ㄦ匕 are DIFFERENT characters (the icon extractor gave
    // them one PNG). The identity rule keeps both; the cosmetic pass shows one.
    const XELLOSS: MarqueeChampion = {
      id: "godie-o00l",
      name: "獸神官 - 傑洛士",
      icon: "assets/icons/champions/godie-o00l.png",
      modelKey: "imported.heroxelloss",
      abilities: { Q: { name: "53-01 獸王牙操彈" } },
    };
    const HARUHI: MarqueeChampion = {
      id: "godie-o02s",
      name: "憂鬱少女 - 涼宮八ㄦ匕",
      icon: "assets/icons/champions/godie-o02s.png",
      modelKey: "imported.lgcr",
      abilities: { Q: { name: "53-02 強化炸彈陣" } },
    };
    expect(isSelectableChampion(HARUHI)).toBe(true); // still a real champion
    const shown = withoutDuplicatePortraits([XELLOSS, HARUHI]).map((c) => c.id);
    expect(shown).toEqual(["godie-o00l"]); // the map's random-pool entry wins

    // A champion in NO portrait group is never touched by this pass.
    expect(withoutDuplicatePortraits([ICONED, NO_ICON]).map((c) => c.id)).toEqual([
      "godie-e001",
      "godie-stock",
    ]);
    // A group with only one member present is a no-op (nothing to collide with).
    expect(withoutDuplicatePortraits([HARUHI]).map((c) => c.id)).toEqual(["godie-o02s"]);
  });
});

describe("SHARED_PORTRAIT_GROUPS matches the PNG bytes on disk", () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const CONTENT_DIR = join(HERE, "../../../../../content");
  const CHAMP_DIR = join(CONTENT_DIR, "champions");

  it("lists exactly the byte-identical portrait groups, and nothing stale", () => {
    cover("champ-marquee-portrait-groups");
    if (!existsSync(CHAMP_DIR)) return; // content tree not checked out

    const byDigest = new Map<string, string[]>();
    const known = new Set<string>();
    for (const file of readdirSync(CHAMP_DIR).sort()) {
      if (!file.endsWith(".json") || file.startsWith("_")) continue;
      const doc = JSON.parse(readFileSync(join(CHAMP_DIR, file), "utf8")) as {
        id: string;
        schema?: string;
        icon?: string;
      };
      if (doc.schema !== "champion@1") continue;
      known.add(doc.id);
      if (!doc.icon) continue;
      const png = join(CONTENT_DIR, doc.icon);
      if (!existsSync(png)) continue;
      const digest = createHash("md5").update(readFileSync(png)).digest("hex");
      byDigest.set(digest, [...(byDigest.get(digest) ?? []), doc.id]);
    }

    const onDisk = [...byDigest.values()]
      .filter((ids) => ids.length > 1)
      .map((ids) => [...ids].sort().join(","))
      .sort();
    const declared = SHARED_PORTRAIT_GROUPS.map((g) => [...g].sort().join(",")).sort();
    // Fixing a mis-assigned icon SHRINKS the table; this fails until the entry
    // is deleted, so the workaround can never outlive the content bug.
    expect(declared).toEqual(onDisk);

    // Every declared id is a real champion (no typos, no stale ids).
    for (const group of SHARED_PORTRAIT_GROUPS) {
      for (const id of group) expect(known.has(id), `${id} exists`).toBe(true);
    }
  });
});
