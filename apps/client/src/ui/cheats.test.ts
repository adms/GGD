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
  parseSpawnCount,
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

/**
 * 生怪數量輸入框（owner 2026-08-18「一鍵呼喚 **N 個**⋯」）。
 *
 * ⭐ 承重的是 `undefined`：它代表「不要送 count，用後台 `config.practice@1` 的
 * 預設」。⛔ 這一格壞掉的樣子是**清空輸入框後按鈕靜默失效**（`Number("")` 是 0，
 * 送出去就是「生 0 隻」，畫面上什麼都不會發生）。
 */
describe("生怪數量（GH#343 · owner 2026-08-18）", () => {
  it("★ 空白／空白字元 ⇒ undefined（＝交給後台預設，⛔ 不是 0）", () => {
    expect(parseSpawnCount("")).toBeUndefined();
    expect(parseSpawnCount("   ")).toBeUndefined();
  });

  it("★ 0 與負數也是 undefined —— ⛔ 不可以送出「生 0 隻」", () => {
    expect(parseSpawnCount("0")).toBeUndefined();
    expect(parseSpawnCount("-3")).toBeUndefined();
  });

  it("正常數字直接用，小數取整，非數字退回 undefined", () => {
    expect(parseSpawnCount("5")).toBe(5);
    expect(parseSpawnCount("2.9")).toBe(2);
    expect(parseSpawnCount("abc")).toBeUndefined();
  });

  it("上界只防手滑；⛔ 真正的上限由伺服器夾", () => {
    expect(parseSpawnCount("99999")).toBe(99);
  });

  it("送出去的 Cheat：省略 vs 帶上 count", () => {
    expect(cheat.spawnMob("boss", parseSpawnCount(""))).toEqual({ kind: "spawnMob", what: "boss" });
    expect(cheat.spawnMob("boss", parseSpawnCount("4"))).toEqual({
      kind: "spawnMob",
      what: "boss",
      count: 4,
    });
  });
});
