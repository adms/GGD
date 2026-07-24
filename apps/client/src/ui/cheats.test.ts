/**
 * Offline cheat console — pure logic: availability gating, backtick toggle,
 * level clamp, registry filtering, and the MSG.CHEAT payload shapes.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  CHEAT_TOGGLE_KEY,
  cheat,
  cheatButtonVisible,
  cheatsAvailable,
  clampLevel,
  filterEntries,
  isCheatToggleKey,
} from "./cheats";

describe("cheat console availability (cheat-panel-gating)", () => {
  it("is offered ONLY in offline / single-player mode", () => {
    cover("cheat-panel-gating");
    expect(cheatsAvailable("offline")).toBe(true);
    expect(cheatsAvailable("platform")).toBe(false); // hidden online / logged-in match
    expect(cheatsAvailable(null)).toBe(false);
    expect(cheatsAvailable(undefined)).toBe(false);
  });
});

describe("the 🐞 button is loopback-only (cheat-panel-gating)", () => {
  it("shows on the dev's own machine and NOWHERE else", () => {
    cover("cheat-panel-gating");
    // the developer, on the box running the dev server
    expect(cheatButtonVisible("offline", "localhost")).toBe(true);
    expect(cheatButtonVisible("offline", "127.0.0.1")).toBe(true);
    expect(cheatButtonVisible("offline", "::1")).toBe(true);
    // the family: phone on the wifi, the LAN box, the deployed host. This is
    // the playtest P9 regression — a permanent "cheats" button on a live
    // family screen.
    expect(cheatButtonVisible("offline", "192.168.0.6")).toBe(false);
    expect(cheatButtonVisible("offline", "mac.local")).toBe(false);
    expect(cheatButtonVisible("offline", "ggd.adms.ai")).toBe(false);
    // fail-safe toward hiding when the host cannot be placed at all
    expect(cheatButtonVisible("offline", undefined)).toBe(false);
    expect(cheatButtonVisible("offline", "")).toBe(false);
  });

  it("never overrides the offline gate — a platform match shows nothing anywhere", () => {
    cover("cheat-panel-gating");
    expect(cheatButtonVisible("platform", "localhost")).toBe(false);
    expect(cheatButtonVisible(null, "localhost")).toBe(false);
    expect(cheatButtonVisible(undefined, "127.0.0.1")).toBe(false);
  });

  it("hiding the BUTTON does not disable the console — the backtick is untouched", () => {
    cover("cheat-panel-gating");
    // The console still MOUNTS wherever it is available; only its advertisement
    // is gated. Nothing was deleted, which is the whole point of P9.
    expect(cheatsAvailable("offline")).toBe(true);
    expect(cheatButtonVisible("offline", "ggd.adms.ai")).toBe(false);
    expect(isCheatToggleKey(CHEAT_TOGGLE_KEY)).toBe(true);
  });
});

describe("backtick toggle key (cheat-toggle-key)", () => {
  it("` toggles the console; nothing else does", () => {
    cover("cheat-toggle-key");
    expect(CHEAT_TOGGLE_KEY).toBe("`");
    expect(isCheatToggleKey("`")).toBe(true);
    expect(isCheatToggleKey("Escape")).toBe(false);
    expect(isCheatToggleKey("g")).toBe(false);
    expect(isCheatToggleKey("~")).toBe(false);
  });
});

describe("level clamp (cheat-payload)", () => {
  it("clamps to [1, 18] and floors", () => {
    cover("cheat-payload");
    expect(clampLevel(0)).toBe(1);
    expect(clampLevel(1)).toBe(1);
    expect(clampLevel(18)).toBe(18);
    expect(clampLevel(99)).toBe(18);
    expect(clampLevel(7.9)).toBe(7);
    expect(clampLevel(Number.NaN)).toBe(1);
  });
});

describe("registry filter (cheat-filter)", () => {
  const items = [
    { id: "ember-rod", name: "Ember Rod", tags: ["ap"] },
    { id: "ironhide-vest", name: "Ironhide Vest", tags: ["tank"] },
    { id: "art-excalibur", name: "亞瑟王之劍", tags: ["ad"] },
  ];
  it("substring-filters by name / id / tag including CJK", () => {
    cover("cheat-filter");
    expect(filterEntries(items, "ember").map((i) => i.id)).toEqual(["ember-rod"]);
    expect(filterEntries(items, "TANK").map((i) => i.id)).toEqual(["ironhide-vest"]); // case-insensitive
    expect(filterEntries(items, "亞瑟").map((i) => i.id)).toEqual(["art-excalibur"]); // CJK substring
    expect(filterEntries(items, "")).toHaveLength(3); // empty query = full list
    expect(filterEntries(items, "zzz")).toHaveLength(0);
  });
});

describe("cheat payload shapes (cheat-payload)", () => {
  it("builds the exact objects sent on MSG.CHEAT", () => {
    cover("cheat-payload");
    expect(cheat.setLevel(50)).toEqual({ kind: "setLevel", level: 18 }); // clamped
    expect(cheat.grantGold(1000)).toEqual({ kind: "grantGold", amount: 1000 });
    expect(cheat.grantMCoin(500)).toEqual({ kind: "grantMCoin", amount: 500 });
    expect(cheat.maxAbilities()).toEqual({ kind: "maxAbilities" });
    expect(cheat.rankAbility("R")).toEqual({ kind: "rankAbility", slot: "R" });
    expect(cheat.giveItem("ember-rod")).toEqual({ kind: "giveItem", itemId: "ember-rod" });
    expect(cheat.swapChampion("thorne")).toEqual({ kind: "swapChampion", championId: "thorne" });
    expect(cheat.fullHeal()).toEqual({ kind: "fullHeal" });
    expect(cheat.godMode(true)).toEqual({ kind: "godMode", enabled: true });
    expect(cheat.zeroCooldown(false)).toEqual({ kind: "zeroCooldown", enabled: false });
    expect(cheat.resetCooldowns()).toEqual({ kind: "resetCooldowns" });
    expect(cheat.killEnemies()).toEqual({ kind: "killEnemies" });
    expect(cheat.skipPhase()).toEqual({ kind: "skipPhase" });
    expect(cheat.rerollOffers()).toEqual({ kind: "rerollOffers" });
  });
});
