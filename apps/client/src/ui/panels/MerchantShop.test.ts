/**
 * int-31 (shop-tab-attributes-portrait, task #122): the shop opens on the hero,
 * not the stock. Two guarantees:
 *
 *   1. The tab strip LEADS with 屬性 (the hero attribute panel) and that lead
 *      tab is the one the shop is default-selected on — the label moved
 *      商品→屬性, and 技能 is kept. The tab KEY is unchanged ("goods"), so this
 *      is a label + default-selection contract, asserted on the exported tab
 *      model rather than a re-typed literal.
 *   2. The hero's portrait renders a REAL <img> beside the tabs when the
 *      champion carries an extracted icon (Blizzard-stock heroes keep the seeded
 *      glyph, which is the GlyphTile contract exercised elsewhere).
 *
 * Client vitest runs in the `node` environment (no DOM), so the portrait is
 * proven by server-rendering the exported <ShopHeroPortrait> to static markup
 * and asserting the <img> + resolved content URL land in the output — the same
 * node-only rendering approach the icon tests use for URL resolution.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import type { ChampionDef } from "@ggd/shared/sim/content/defs";
import { SHOP_TABS, DEFAULT_SHOP_TAB, ShopHeroPortrait } from "./MerchantShop";

const HERO_WITH_ICON = "tp-shop-hero" as ChampionId;
const HERO_NAME = "去死團測試英雄";
const ICON_PATH = "assets/icons/champions/tp-shop-hero.png";

const champion = (id: ChampionId, icon?: string): ChampionDef => {
  const def = {
    id,
    name: HERO_NAME,
    role: "fighter",
    attackType: "melee",
    modelKey: "champ.test",
    baseStats: {},
    growth: {},
    abilities: {},
    skillOrder: [],
    buildPriority: [],
    tags: ["wc3-import"],
  } as unknown as ChampionDef;
  if (icon !== undefined) (def as { icon?: string }).icon = icon;
  return def;
};

beforeAll(() => {
  Champions.register(HERO_WITH_ICON, champion(HERO_WITH_ICON, ICON_PATH));
});

describe("MerchantShop tabs (#122)", () => {
  it("leads with the 屬性 attribute tab, default-selected, keeping 技能", () => {
    // The lead tab is 屬性 (the old 商品 label is gone)…
    expect(SHOP_TABS[0]?.label).toBe("屬性");
    expect(SHOP_TABS.map((t) => t.label)).not.toContain("商品");
    // …and it is exactly the tab the shop opens on.
    expect(DEFAULT_SHOP_TAB).toBe(SHOP_TABS[0]?.key);
    // 技能 is still there, after 屬性.
    expect(SHOP_TABS.map((t) => t.label)).toEqual(["屬性", "技能"]);

    cover("shop-tab-attributes-portrait");
  });

  it("renders the hero portrait as a real <img> when the champion has an icon", () => {
    const html = renderToStaticMarkup(
      createElement(ShopHeroPortrait, { championId: HERO_WITH_ICON, name: HERO_NAME }),
    );
    expect(html).toContain("<img");
    // resolves through championIconUrl → contentAssetUrl → /content/<path>
    expect(html).toContain(`/content/${ICON_PATH}`);
    // labelled with the champion name (alt), so the glyph fallback is meaningful too
    expect(html).toContain(HERO_NAME);

    cover("shop-tab-attributes-portrait");
  });

  it("falls back to the seeded glyph (no <img>) for a stock-art champion", () => {
    const html = renderToStaticMarkup(
      createElement(ShopHeroPortrait, { championId: "tp-no-icon-hero", name: "無圖英雄" }),
    );
    // championIconUrl returns null → IconImg renders nothing, glyph stays.
    expect(html).not.toContain("<img");
  });
});
