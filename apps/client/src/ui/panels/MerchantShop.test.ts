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
import { buildItemRow, itemDisplayName, UNKNOWN_ITEM_LABEL, type RowItem } from "./itemStats";

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
  it("shows exactly when the server says a step is reversible AND the shop is open", () => {
    cover("shop-undo-button");
    // the server's own undo-stack depth (SeatState.undoDepth) is the whole rule
    expect(canUndoShopStep(0, true)).toBe(false);
    expect(canUndoShopStep(1, true)).toBe(true);
    expect(canUndoShopStep(4, true)).toBe(true);
    // once the shop closes the command is refused server-side too — hide it
    expect(canUndoShopStep(1, false)).toBe(false);
    expect(canUndoShopStep(0, false)).toBe(false);
  });

  /**
   * THE REGRESSION THIS PINS. Visibility used to be inferred from the last shop
   * EVENT, which left the button lit over an empty stack (a live third press was
   * a silent no-op) and hid a still-undoable step behind any later rejection.
   * Depth cannot express either mistake: an emptied stack is 0 and a rejection
   * does not change the depth at all.
   */
  it("hides once the stack is drained, and survives a rejection landing on top", () => {
    cover("shop-undo-button");
    // buy, buy, undo, undo → depth 0 → gone, however recently you shopped
    expect(canUndoShopStep(0, true)).toBe(false);
    // a "金幣不足" rejection is not a state change: depth 2 is still 2
    expect(canUndoShopStep(2, true)).toBe(true);
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
    // #261: the 武器貨架 is 暫時下架 by default; these two guards are about SHELF
    // GROUPING and item NAMES, which need stock to group and name. The closed
    // default has its own guard in shopShelfListing.test.ts.
    const catalogue = shopCatalogue(Items.all(), NO_FILTER, true);
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

/**
 * #202 (store-shows-item-name-not-id): the owner reported the shop 「顯示 ID」 —
 * an item printed its raw `godie-i0xx` string instead of a human description.
 * The item DATA is clean; the leak was the render path — every shop surface did
 * `def?.name ?? itemId`, and on a registry MISS (client/server content
 * divergence, an overlay rename, an unregistered id) the fallback painted the
 * raw id as user-facing text. This pins two guarantees:
 *
 *   1. a representative FINAL shop item renders a real NAME and a readable, non-id
 *      effect/description line (what it DOES, judgeable before purchase);
 *   2. NO shop code path can surface a bare id — every display seam routes
 *      through `itemDisplayName`, which degrades a miss (and a name==id
 *      component) to a readable placeholder, never the id.
 */
describe("MerchantShop never shows a raw item id (#202)", () => {
  // A representative FINAL (shop) item, shaped like the real WC3 imports
  // (godie-i00c 風行天衣): a rarity badge, stat modifiers, a 效能 block whose
  // mechanical line survives as the ✦ effect while the stat-claim lines are
  // stripped, and 解說 lore.
  const FINAL_ID = "tp-shop-final-202" as ItemId;
  const FINAL_NAME = "風行天衣";
  const finalItem = (): ItemDef =>
    ({
      id: FINAL_ID,
      name: FINAL_NAME,
      cost: 2100,
      tier: 3,
      modifiers: [
        { stat: "ad", value: 30 },
        { stat: "moveSpeed", value: 40 },
      ],
      description: ["神器", "效能", "攻擊力+30", "移動速度+40", "擴散傷害60%", "解說", "御風而行的天衣。"].join("\n"),
      tags: ["wc3-import"],
    }) as unknown as ItemDef;

  beforeAll(() => {
    Items.register(FINAL_ID, finalItem());
  });

  it("renders a representative final's NAME and a non-id effect/description line", () => {
    cover("store-shows-item-name-not-id");
    const def = Items.tryGet(FINAL_ID)!;

    // NAME: the real name, never the id — the exact text the shelf, the buy
    // toast, the inventory tile and the equipment bar all bind.
    const name = itemDisplayName(def.name, def.id);
    expect(name).toBe(FINAL_NAME);
    expect(name).not.toBe(def.id);

    // DESCRIPTION/EFFECT: a readable ✦ line (the mechanical text the stat chips
    // cannot carry), and it is NOT the raw id — this is the "什麼道具做什麼" the
    // owner could not read. The stat-claim lines (攻擊力+30 …) are stripped, the
    // 擴散傷害60% survives.
    const row = buildItemRow(def as unknown as RowItem, null);
    expect(row.effect).toBe("擴散傷害60%");
    expect(row.effect).not.toBe(def.id);
    expect(row.effect ?? "").not.toContain(def.id);
    // and the collapsed row is not blank even for a pure detail: stat chips describe it
    expect(row.secondary.length).toBeGreaterThan(0);
  });

  it("degrades EVERY id-resolving seam to a readable placeholder — never the id", () => {
    cover("store-shows-item-name-not-id");
    // a registry MISS (stale deploy, overlay rename, the unregistered
    // `legendary-attunement` capstone id) must NOT leak the id.
    expect(itemDisplayName(undefined, "godie-i0xx")).toBe(UNKNOWN_ITEM_LABEL);
    expect(itemDisplayName(undefined, "legendary-attunement")).toBe(UNKNOWN_ITEM_LABEL);
    expect(itemDisplayName(null, "godie-i0xx")).toBe(UNKNOWN_ITEM_LABEL);
    expect(itemDisplayName("", "godie-i0xx")).toBe(UNKNOWN_ITEM_LABEL);
    // a craftRole "component" whose importer left name==id (never on the shelf,
    // but reachable if ever equipped) also degrades — the id is never printed.
    expect(itemDisplayName("godie-i0zz", "godie-i0zz")).toBe(UNKNOWN_ITEM_LABEL);
    // whatever the input, the output is NEVER the id
    for (const id of ["godie-i0xx", "legendary-attunement", "godie-i0zz"]) {
      expect(itemDisplayName(undefined, id)).not.toBe(id);
      expect(itemDisplayName(id, id)).not.toBe(id);
    }
    // a real name always passes through untouched
    expect(itemDisplayName(FINAL_NAME, FINAL_ID)).toBe(FINAL_NAME);
  });

  it("no shelf item in the whole live catalogue resolves to its own id", () => {
    cover("store-shows-item-name-not-id");
    // #261: the 武器貨架 is 暫時下架 by default; these two guards are about SHELF
    // GROUPING and item NAMES, which need stock to group and name. The closed
    // default has its own guard in shopShelfListing.test.ts.
    const catalogue = shopCatalogue(Items.all(), NO_FILTER, true);
    expect(catalogue.length).toBeGreaterThan(0);
    for (const item of catalogue) {
      // the name the shop shows is never the raw id, for every real shelf entry
      expect(itemDisplayName(item.name, item.id)).not.toBe(item.id);
    }
  });
});
