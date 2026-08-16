/**
 * 暫時下架 — the CLIENT half of #261.
 *
 * owner: 「除了能力屬性強化、及傳說寶玉外，其他武器道具先全部暫時下架無法選擇，
 * 但隨機三選一仍然可以隨機到」.
 *
 * The sim half (`buyItem` refuses, the draft path does not) is guarded in
 * packages/shared/src/sim/economy/shopShelf.test.ts. THIS file guards the two
 * things only the client can get wrong:
 *
 *   1. the SHELF the player actually reads — `shopCatalogue`, the exact call
 *      MerchantShop makes, with its real default argument list;
 *   2. the REFUSAL SENTENCE — a `shelf-closed` rejection must say 暫時下架 and
 *      not fall through to the generic 「無法完成交易」, which would leave a
 *      player clicking a button that answers nothing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import {
  LEGENDARY_ORB_ITEM_ID,
  STAT_TICK_ITEM_ID,
} from "@ggd/shared/sim/economy/itemTiers";
import { WEAPON_SHELF_OPEN } from "@ggd/shared/sim/economy/shopShelf";
import { shopCatalogue, NO_FILTER, whitelistFromDoc } from "./champSelectFilter";
import { rejectToast, REJECT_TEXT } from "./shopFeedback";

const EFFECT = [{ stat: "ad", op: "flat", value: 10 }];
const CATALOGUE = [
  { id: "godie-i05t", craftRole: "final", cost: 300, modifiers: EFFECT },
  { id: "swift-boots", craftRole: "final", cost: 1200, modifiers: EFFECT },
  { id: STAT_TICK_ITEM_ID as string, cost: 375 },
  { id: LEGENDARY_ORB_ITEM_ID as string, cost: 2400 },
];

describe("the shop shelf is 暫時下架 (#261)", () => {
  it("MerchantShop's own call lists ONLY the two services", () => {
    cover("client-shelf-closed");
    // No third argument — exactly how MerchantShop calls it, so this is the
    // shelf a player sees rather than a hypothetical one.
    expect(WEAPON_SHELF_OPEN).toBe(false);
    expect(shopCatalogue(CATALOGUE, NO_FILTER).map((i) => i.id).sort()).toEqual(
      [LEGENDARY_ORB_ITEM_ID as string, STAT_TICK_ITEM_ID as string].sort(),
    );
  });

  it("holds even when an operator whitelist enables every weapon", () => {
    cover("client-shelf-closed");
    // The whitelist NARROWS; it must never widen past the shelf flag. A
    // mis-curated (or fully-open) whitelist cannot put the weapons back.
    const wl = whitelistFromDoc({ items: CATALOGUE.map((i) => i.id) });
    expect(shopCatalogue(CATALOGUE, wl).map((i) => i.id).sort()).toEqual(
      [LEGENDARY_ORB_ITEM_ID as string, STAT_TICK_ITEM_ID as string].sort(),
    );
  });

  it("holds on the skeleton fallback branch too", () => {
    cover("client-shelf-closed");
    // The `no final-role item loaded` fallback (bare `pnpm dev`, unit tests)
    // used to return the whole content box. With the shelf closed it must still
    // come back services-only — otherwise the one branch nobody looks at is the
    // one that re-lists every weapon.
    const skeletonOnly = [
      { id: "ember-rod", cost: 300 },
      { id: STAT_TICK_ITEM_ID as string, cost: 375 },
    ];
    expect(shopCatalogue(skeletonOnly, NO_FILTER).map((i) => i.id)).toEqual([
      STAT_TICK_ITEM_ID as string,
    ]);
  });

  it("opening the flag re-lists everything — it is a switch, not a deletion", () => {
    cover("client-shelf-closed");
    expect(shopCatalogue(CATALOGUE, NO_FILTER, true).map((i) => i.id).sort()).toEqual(
      CATALOGUE.map((i) => i.id).sort(),
    );
  });

  it("answers a blocked buy with 暫時下架, never the generic line", () => {
    cover("client-shelf-closed");
    const toast = rejectToast("shelf-closed", "恐龍之斧");
    expect(toast.tone).toBe("deny");
    expect(toast.text).toContain("暫時下架");
    // …and it says what IS still available, plus that the cards still roll it
    expect(REJECT_TEXT["shelf-closed"]).toContain("能力屬性強化");
    expect(REJECT_TEXT["shelf-closed"]).toContain("傳說寶玉");
    // ⭐ owner 2026-08-16：武器那一層改講「寶具／顯現」，⛔ 不再講「三選一」。
    expect(REJECT_TEXT["shelf-closed"]).toContain("顯現");
    expect(REJECT_TEXT["shelf-closed"]).not.toContain("武器道具");
  });

  it("the SHOP really calls the shelf-filtered catalogue (not a raw Items.all())", () => {
    cover("client-shelf-closed");
    // A pure-function guard cannot see a caller that stopped using it. This is
    // the one structural check that keeps `shopCatalogue` on the shipped path:
    // MerchantShop must build its rows from it, with no shelf override.
    const src = readFileSync(fileURLToPath(new URL("./MerchantShop.tsx", import.meta.url)), "utf8");
    expect(src).toContain("shopCatalogue(Items.all(), whitelist)");
  });
});
