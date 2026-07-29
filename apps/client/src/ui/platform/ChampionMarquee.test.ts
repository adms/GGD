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
import { revealedPortraitCount } from "./ChampionMarquee";
import { isAlternateForm } from "@ggd/shared/content";

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
    // real champion that other screens still show. (godie-o02n is the BASE unit
    // O02N; its 天下號令 form godie-o02o is excluded as a transform, below.)
    const CAOCAO: MarqueeChampion = {
      id: "godie-o02n",
      name: "曹操孟德 - 阿瞞大人",
      icon: "assets/icons/champions/godie-o02n.png",
      tags: ["godie"],
      modelKey: "champ.skin.rogue",
      abilities: { Q: { name: "87-01 亂世奸雄" } },
    };
    expect(isSelectableChampion(CAOCAO)).toBe(true);
  });

  // ── task #249: FORM decides visibility, PORTRAIT BYTES do not ─────────────
  it("excludes 變身 forms by the w3x form link, not by a shared portrait", () => {
    cover("champ-marquee-form-exclusion");
    // 妙蛙花 has its OWN portrait, so the icon-dedup pass never touched it — it
    // sat on the roster as a pickable hero. The form link is what removes it.
    const BULBA_ALT: MarqueeChampion = {
      id: "godie-h02r",
      name: "種子神奇寶貝 - 妙蛙花",
      icon: "assets/icons/champions/godie-h02r.webp",
      modelKey: "imported.bulbasaur",
      abilities: { Q: { name: "90-01 飛葉快刀" } },
    };
    const BULBA_BASE: MarqueeChampion = { ...BULBA_ALT, id: "godie-hgam", name: "種子神奇寶貝 - 妙蛙種子" };
    expect(isSelectableChampion(BULBA_ALT), "妙蛙花 is a transformed body").toBe(false);
    expect(isSelectableChampion(BULBA_BASE), "妙蛙種子 is the hero").toBe(true);
    // …and the same for 草泥馬's lying-down 臥 body (w3x move speed 0).
    const ALPACA_ALT: MarqueeChampion = {
      id: "godie-h02u",
      name: "看似憂鬱的神獸 - 草泥馬",
      icon: "assets/icons/champions/godie-h02u.webp",
      modelKey: "imported.horse",
      abilities: { Q: { name: "92-01 臥草泥馬" } },
    };
    expect(isSelectableChampion(ALPACA_ALT)).toBe(false);
    expect(isSelectableChampion({ ...ALPACA_ALT, id: "godie-h02v" })).toBe(true);
    // A champion in NO form pair is untouched, however similar it looks.
    expect(isSelectableChampion({ ...BULBA_ALT, id: "godie-e00q", name: "英靈-亞瑟王 - 黑化Saber" })).toBe(
      true,
    );
  });

  it("keeps the SIX non-transform icon-dedup groups (they are a different bug)", () => {
    cover("champ-marquee-icon-groups-survive");
    // SHARED_PORTRAIT_GROUPS is an icon-BYTES table pinned to disk, NOT a
    // transform table. Deriving it from the form link would delete these six,
    // every one of which is two genuinely unrelated champions the extractor
    // handed one PNG. This is the regression guard for that mistake.
    const NON_TRANSFORM_GROUPS = [
      ["godie-o00l", "godie-o02s"], // 傑洛士 / 涼宮八ㄦ匕
      ["godie-emfr", "godie-h022"], // 涅吉 / 白色之翼
      ["godie-h02y", "godie-o02p"], // 志志雄 / 初音
      ["godie-h021", "godie-hblm"], // 阿強一號 / 賈修貝爾
      // 皇者 + 金居福 / 鄭先生 — and since #249, 鄭先生's own 26-04 洨者聖臨
      // body (h00w), which inherited the borrowed bitmap along with everything
      // else. See PARTLY_TRANSFORM below: this group is now a MIXED one.
      ["godie-e00j", "godie-e015", "godie-h00w", "godie-harf"],
      ["godie-o02l", "godie-o02n", "godie-o02o", "godie-ofar"], // 皮卡丘 ×2 + 曹操 ×2
    ];
    const declared = new Set(SHARED_PORTRAIT_GROUPS.map((g) => [...g].sort().join(",")));
    for (const g of NON_TRANSFORM_GROUPS) {
      expect(declared.has([...g].sort().join(",")), `icon group ${g.join("/")} survives`).toBe(true);
    }
    // …and the ones below contain NO form pair at all, which is exactly why the
    // two tables cannot be merged: derive this table from the form link and
    // every id here loses its dedup.
    //
    // TWO of the six are MIXED — they contain both a borrowed-icon pair AND a
    // real form pair — which is the strongest argument of all for keeping the
    // concerns apart, since neither table alone can express them:
    //   · 皮卡丘/曹操 — o02l and o02o ARE alternate forms, ofar and o02n are not;
    //   · 皇者/金居福/鄭先生 — h00w IS harf's alternate form, e00j and e015 are
    //     unrelated champions that merely inherited the same PNG (#249).
    const PARTLY_TRANSFORM = new Set(["godie-e00j,godie-e015,godie-h00w,godie-harf"]);
    let purelyBorrowed = 0;
    for (const g of NON_TRANSFORM_GROUPS) {
      const key = [...g].sort().join(",");
      if (PARTLY_TRANSFORM.has(key) || key.includes("godie-o02l")) continue;
      purelyBorrowed++;
      for (const id of g) expect(isAlternateForm(id), `${id} is not a transform form`).toBe(false);
    }
    // the filter above must not have swallowed the whole list (⑥掃字串 guard)
    expect(purelyBorrowed, "purely-borrowed groups actually checked").toBe(4);
    // and each MIXED group really does hold at least one of each kind
    for (const g of NON_TRANSFORM_GROUPS) {
      const key = [...g].sort().join(",");
      if (!PARTLY_TRANSFORM.has(key) && !key.includes("godie-o02l")) continue;
      expect(g.some((id) => isAlternateForm(id)), `${key} holds a form`).toBe(true);
      expect(g.some((id) => !isAlternateForm(id)), `${key} holds a non-form`).toBe(true);
    }
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

// ---------------------------------------------------------------------------
// THE REGRESSION THAT MADE TASK #18 NEVER ACTUALLY HAPPEN
// ---------------------------------------------------------------------------
// The band read the champion registry once inside `useMemo(…, [])`. AuthScreen
// mounts ~50 ms into boot, long before the background content load populates
// that registry, so the memo captured [] and the component returned null for
// the whole page session — zero <img> in a real browser, forever. These cases
// render the ACTUAL component (react-dom/server, same trick AudioToggle.test
// uses) against an empty and then a populated registry, so "renders portraits
// once content arrives" is asserted, not assumed.
describe("ChampionMarquee renders once the registry fills (#18)", () => {
  it("renders nothing on an empty registry and portraits on a full one", async () => {
    cover("champ-marquee-subscribes-to-content-ready");
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { Champions } = await import("@ggd/shared/sim/content/registry");
    const { ensureContentLoaded } = await import("../../content/bootContent");
    const { ChampionMarquee } = await import("./ChampionMarquee");

    // BEFORE: this is the state AuthScreen actually mounts in.
    Champions.clear();
    expect(renderToStaticMarkup(createElement(ChampionMarquee))).toBe("");

    // Settle the content-boot signal (no server here → the skeleton fallback
    // path, which still flips the phase to "ready" — that flip is the fix's
    // dependency), then put a real roster in the registry.
    await ensureContentLoaded();
    Champions.clear();
    for (let i = 0; i < 40; i++) {
      Champions.register(`fix-${i}` as never, {
        id: `fix-${i}`,
        name: `英雄${i}`,
        icon: `assets/icons/champions/godie-e001.png`,
        tags: ["godie"],
        modelKey: `model-${i}`,
        abilities: { Q: { name: `${i}-01 技` } },
      } as never);
    }

    const html = renderToStaticMarkup(createElement(ChampionMarquee));
    const imgs = html.match(/<img /g) ?? [];
    expect(imgs.length).toBeGreaterThan(0);
    // …and NOT all 40: the reveal window is what keeps the login screen from
    // pulling every portrait at once (see revealedPortraitCount below).
    expect(imgs.length).toBeLessThan(80);
  });

  it("reveals portraits in scroll order instead of all at once", () => {
    cover("champ-marquee-progressive-reveal");
    // 81 portraits × ~9 KB. A 1280px window at 78px/tile with a 240px
    // lookahead reaches 20 tiles up front, and the strip's own 26 px/s adds
    // one roughly every 3 s — so a 15 s login costs ~25, not 81.
    const at = (elapsedSec: number): number =>
      revealedPortraitCount({ elapsedSec, viewportPx: 1280, stepPx: 78, pxPerSec: 26 });
    expect(at(0)).toBe(20);
    expect(at(15)).toBe(25);
    expect(at(0)).toBeLessThan(81);
    // monotonic, and it does eventually cover the whole roster
    expect(at(600)).toBeGreaterThan(81);
    expect(at(30)).toBeGreaterThanOrEqual(at(0));
    // degenerate inputs never produce 0 (that would blank the band again)
    expect(
      revealedPortraitCount({
        elapsedSec: -5,
        viewportPx: 0,
        stepPx: 0,
        pxPerSec: -10,
        lookaheadPx: 0,
      }),
    ).toBe(1);
  });
});
