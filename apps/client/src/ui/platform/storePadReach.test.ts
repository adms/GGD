/**
 * #516 / #517 / #522 — 買不起的貨架，手把還走得到、看得懂、捲得動。
 *
 * ONE BEARING LINE, asserted on the markup a player would actually get: a shelf
 * where the wallet is EMPTY, i.e. the state almost every player is in (M幣 is
 * admin-granted, see currency.ts). The pre-fix markup put the row's only
 * focusable node inside a `disabled` button and the only explanation inside a
 * `title` — one is invisible to a stick, the other to anything without hover.
 *
 * ⛔ WHAT "FOCUSABLE" AND "SCROLLABLE" MEAN IS NOT RE-TYPED HERE. Both are read
 * out of ui/PadFocusNav.tsx, the file that really decides them, so narrowing
 * that layer breaks this guard instead of quietly un-fixing the store.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { StoreChampionGroup, STORE_LIST_SCROLL } from "./StoreScreen";
import { CURRENCY_LABEL, shortfallHint } from "./currency";
import type { ChampionRow, SkinRow } from "./catalog";
import type { Wallet } from "./types";

const PAD_NAV = readFileSync(
  fileURLToPath(new URL("../PadFocusNav.tsx", import.meta.url)),
  "utf8",
);

const BROKE: Wallet = { mcoin: 0, crystal: 0, ownedChampions: [], ownedSkins: [], equippedSkins: {} };

const SKIN: SkinRow = {
  id: "sk-1",
  championId: "ch-1",
  price: 5,
  modelKey: "mk-1",
  owned: false,
  equipped: false,
  name: "測試造型",
  description: "測試造型說明",
  currency: "mcoin",
};

const CHAMP: ChampionRow = {
  id: "ch-1",
  price: 300,
  owned: false,
  currency: "crystal",
  name: "測試英雄",
  title: "測試稱號",
  fullName: "測試英雄",
  blurb: "",
  named: true,
  skins: [SKIN],
};

const shelf = (): string =>
  renderToStaticMarkup(
    createElement(StoreChampionGroup, {
      champ: CHAMP,
      wallet: BROKE,
      shownSkinId: SKIN.id,
      onSelect: () => undefined,
      onBuy: () => undefined,
      onEquip: () => undefined,
    }),
  );

describe("a shelf nobody can afford is still reachable on a pad", () => {
  it("both rows carry a focusable node of their own, not just the dead buy button", () => {
    const html = shelf();
    // non-vacuous: this really is the 買不起 case both tickets describe
    expect(html).toContain("disabled");
    // the attribute PadFocusNav accepts — quoted from the real selector list,
    // ⛔ not from the prose around it
    const selectors = /const FOCUSABLE_SELECTOR\s*=\s*\[([\s\S]*?)\]\s*\.join/.exec(PAD_NAV)?.[1];
    expect(selectors, "could not find FOCUSABLE_SELECTOR in ui/PadFocusNav.tsx").toBeTruthy();
    expect(selectors!).toContain("[data-pad-focusable]");
    // …and #505's half must stay removed, or disabled rows vanish again
    expect(selectors!).not.toContain(":not([disabled])");
    // champion heading + skin row: two nodes the stick can land on with the
    // buy buttons inert. One is not enough — an owned champion renders no
    // button at all, and an unaffordable skin's row is the only way to preview it.
    expect(html.match(/data-pad-focusable/g) ?? []).toHaveLength(2);
  });

  it("the reason is DRAWN, not hidden in a hover tooltip (#517)", () => {
    const html = shelf();
    expect(html).toContain(`${CURRENCY_LABEL[CHAMP.currency]}不足`);
    // the selected row spells the whole sentence out
    expect(html).toContain(shortfallHint(SKIN.currency));
  });

  it("the list pane declares an overflow the pad's scroll layer accepts (#522)", () => {
    // the exact set `overflowsAlong` tests against, read from that function
    const accepted = /overflowsAlong[\s\S]*?\/\^\(([^)]*)\)\$\//.exec(PAD_NAV)?.[1];
    expect(accepted, "could not find overflowsAlong's overflow test").toBeTruthy();
    expect(accepted!.split("|")).toContain(STORE_LIST_SCROLL.overflowY);
  });
});
