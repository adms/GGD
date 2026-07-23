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
import { Champions, Items } from "@ggd/shared/sim/content/registry";
import type { ChampionId, ItemId } from "@ggd/shared/ids";
import type { ChampionDef, ItemDef } from "@ggd/shared/sim/content/defs";
import { SHOP_CARD_SIDE } from "../../render/intermission/layout";
import {
  SHOP_TABS,
  DEFAULT_SHOP_TAB,
  ShopHeroPortrait,
  SHOP_DOCK_SIDE,
  shopDockAnchor,
  shopGoodsSingleScroll,
  UNDO_SHOP_COMMAND_KIND,
  canUndoShopStep,
} from "./MerchantShop";
import { shopCatalogue, NO_FILTER } from "./champSelectFilter";
import { groupCatalogue, type ShelfItem } from "./shopGrouping";

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

/**
 * int-33 (shop-left-dock, task #94): the shop card docks on the LEFT, and it
 * docks there by reading the SAME `SHOP_CARD_SIDE` the intermission scene
 * mirrors the 3D market around — so the panel and the merchant/店員 stage can
 * never end up on the same half of the screen (the bug 「說明頁剛好檔到角色」).
 * `shopDockAnchor` is the pure geometry the component renders from, so a
 * regression to a centred/right card fails here without a DOM.
 */
describe("MerchantShop left dock (#94)", () => {
  it("docks on the LEFT, tied to the intermission scene's SHOP_CARD_SIDE", () => {
    cover("shop-left-dock");
    // one source of truth: the card's side IS the scene's reserved side
    expect(SHOP_DOCK_SIDE).toBe("left");
    expect(SHOP_DOCK_SIDE).toBe(SHOP_CARD_SIDE);

    // the open card hugs the left edge (flush) with its border on the inner edge
    const open = shopDockAnchor(true);
    expect(open.side).toBe("left");
    expect(open.offset).toBe(0);
    expect(open.borderSide).toBe("borderRight");

    // the collapsed rail sits just inside the same edge
    const rail = shopDockAnchor(false);
    expect(rail.side).toBe("left");
    expect(rail.offset).toBeGreaterThan(0);
  });
});

/**
 * int-35 (shop-undo-button, task #121, UI half): the 復原上一步 button is shown
 * ONLY when there is a step to undo, and it dispatches a stable command kind the
 * SIM half reverses the gold on. The gold math itself is the sim's job and is
 * NOT touched here — this pins the two things the UI half owns: visibility and
 * the command-kind contract.
 */
describe("MerchantShop undo button (#121)", () => {
  it("shows only when a successful buy/sell is on record AND the shop is open", () => {
    cover("shop-undo-button");
    // nothing on record → no button
    expect(canUndoShopStep(null, true)).toBe(false);
    // a completed buy or sell is undoable — but only while the shop is interactable
    expect(canUndoShopStep({ kind: "bought" }, true)).toBe(true);
    expect(canUndoShopStep({ kind: "sold" }, true)).toBe(true);
    expect(canUndoShopStep({ kind: "bought" }, false)).toBe(false);
    // a rejection is not a step you can undo
    expect(canUndoShopStep({ kind: "buyRejected" }, true)).toBe(false);
    expect(canUndoShopStep({ kind: "sellRejected" }, true)).toBe(false);
  });

  it("names the undo command kind the sim half reverses gold on", () => {
    cover("shop-undo-button");
    expect(UNDO_SHOP_COMMAND_KIND).toBe("undoLastShopStep");
  });
});

/**
 * Mobile goods-body layout: on a phone-landscape viewport the full-height card
 * is only ~390px, and the fixed 15-stat panel + 6-slot inventory + header/tabs
 * consumed almost all of it — the catalogue (a `flex:1 minHeight:0 overflowY:auto`
 * child) collapsed to a sliver and the buyable items were effectively invisible.
 * `shopGoodsSingleScroll` decides when the whole body scrolls as one column so
 * every item is reachable; desktop keeps the fixed-summary + scrolling-catalogue
 * split. Pure, so the breakpoint is pinned without a DOM.
 */
describe("MerchantShop mobile goods scroll", () => {
  it("scrolls the whole body on touch, whatever the height", () => {
    // phone landscape (short) and a taller touch viewport both single-scroll
    expect(shopGoodsSingleScroll({ touch: true, viewportHeight: 390 })).toBe(true);
    expect(shopGoodsSingleScroll({ touch: true, viewportHeight: 900 })).toBe(true);
  });

  it("also single-scrolls a very short non-touch window (catalogue would collapse)", () => {
    expect(shopGoodsSingleScroll({ touch: false, viewportHeight: 400 })).toBe(true);
  });

  it("keeps the desktop two-region layout on a normal window", () => {
    expect(shopGoodsSingleScroll({ touch: false, viewportHeight: 720 })).toBe(false);
    expect(shopGoodsSingleScroll({ touch: false, viewportHeight: 1080 })).toBe(false);
  });
});

/**
 * int-34 (shop-shelves-real-stock, task #94): the shelves show the ACTUAL
 * purchasable stock — the same pipeline the panel renders — not a decorative
 * placeholder list. A registered, priced, whitelisted item must land on a real
 * shelf with its real id and cost.
 */
describe("MerchantShop shelves list real stock (#94)", () => {
  const SHELF_ITEM = "tp-shop-blade" as ItemId;

  const item = (id: ItemId): ItemDef =>
    ({
      id,
      name: "測試利刃",
      cost: 900,
      tier: 2,
      // an +ad modifier so shelfOf files it under 攻擊 (offense), proving the
      // shelf taxonomy runs over the real item's real data
      modifiers: [{ stat: "ad", value: 25 }],
      tags: ["wc3-import"],
    }) as unknown as ItemDef;

  beforeAll(() => {
    Items.register(SHELF_ITEM, item(SHELF_ITEM));
  });

  it("builds shelves from the Items registry, carrying real ids and prices", () => {
    cover("shop-shelves-real-stock");
    // exactly the pipeline GoodsTab feeds ShelfBlock: registry → catalogue → shelves
    const catalogue = shopCatalogue(Items.all(), NO_FILTER);
    const shelves = groupCatalogue(catalogue as unknown as ShelfItem[]);

    // the shelves are populated from real stock, not empty/decorative
    const allShelved = shelves.flatMap((s) => s.items);
    expect(allShelved.length).toBeGreaterThan(0);

    // our registered blade is on a shelf, with its authored id + cost intact
    const shelved = allShelved.find((i) => i.id === SHELF_ITEM);
    expect(shelved, "the registered item never reached a shelf").toBeTruthy();
    expect(shelved!.cost).toBe(900);
    // and it landed on the offence shelf its +ad data votes for
    const offense = shelves.find((s) => s.id === "offense");
    expect(offense?.items.some((i) => i.id === SHELF_ITEM)).toBe(true);

    // every shelved entry is a genuine registered item (a real purchasable),
    // so nothing on the shelves is a placeholder the buy button can't honour
    for (const s of allShelved) expect(Items.tryGet(s.id as ItemId)).toBeTruthy();
  });
});
