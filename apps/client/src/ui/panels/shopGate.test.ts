/**
 * The shop's UI gate (task #38 requirement 3). The load-bearing claims:
 * prep is open, a LIVING player in combat/resolution gets no shop AT ALL (the
 * surface must not even exist — 「戰鬥的時候商店不會出現」), a player DEFEATED
 * this round gets it back with a distinct label in BOTH of those phases (#289),
 * and the auto-open fires on the phase EDGE exactly once so a re-render can
 * never re-open a card the player closed.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { SHOP_DENY_TEXT, SHOP_DOWNED_LABEL, shopGate, shopPhaseActive, shouldAutoOpen } from "./shopGate";

/** every phase string RoomStore can publish, plus a junk one */
const PHASES = ["champSelect", "intermission", "combat", "resolution", "matchEnd", "connecting"];

describe("shop gate (HUD mirror of the server rule)", () => {
  it("prep opens the shop for everyone", () => {
    cover("shop-ui-gate");
    for (const alive of [true, false]) {
      const g = shopGate("intermission", alive);
      expect(g.open).toBe(true);
      expect(g.mounted).toBe(true);
      expect(g.reason).toBe("");
    }
  });

  // combat 與 resolution 是**同一條**伺服器規則（shopAccess，owner 2026-08-06
  // 「被打倒就可以買，被復活就不行」），所以兩格一起跑：鏡像只跟上其中一格就會紅。
  // ⚠️ 這裡原本把 `resolution` 放進下面的「closed」名單並斷言「現在不是備戰時間」
  // —— 那條斷言是把缺陷釘死（#289），不是守衛。
  for (const phase of ["combat", "resolution"]) {
    it(`${phase} gives a LIVING player no shop surface, with the stated reason`, () => {
      cover("shop-ui-gate");
      const g = shopGate(phase, true);
      expect(g.open).toBe(false);
      expect(g.mounted).toBe(false); // the card force-closes; no tempting button
      expect(g.reason).toBe(SHOP_DENY_TEXT["combat-alive"]);
    });

    it(`a player DOWN this round keeps the shop in ${phase}, labelled as such`, () => {
      cover("shop-ui-gate");
      const g = shopGate(phase, false);
      expect(g.open).toBe(true);
      expect(g.mounted).toBe(true);
      expect(g.label).toBe(SHOP_DOWNED_LABEL);
    });
  }

  it("champ select / match end are closed", () => {
    cover("shop-ui-gate");
    for (const phase of ["champSelect", "matchEnd", "connecting"]) {
      const g = shopGate(phase, true);
      expect(g.open, phase).toBe(false);
      expect(g.mounted, phase).toBe(false);
      expect(g.reason, phase).toBe(SHOP_DENY_TEXT["phase-closed"]);
    }
  });

  // ⭐ 配對式斷言（不是名詞）：HudRoot 的粗閘 `shopPhaseActive` 與細閘 `shopGate`
  // 是兩個獨立的判斷，#289 壞的正是它們之間的**關係** —— 細閘說掛，粗閘那一層卻
  // 連元件都沒 render。分別驗每一半永遠是綠的。
  it("the render-level phase gate never hides a phase the fine gate would mount", () => {
    cover("shop-ui-gate");
    for (const phase of PHASES) {
      for (const alive of [true, false]) {
        if (shopGate(phase, alive).mounted) expect(shopPhaseActive(phase), phase).toBe(true);
      }
    }
  });

  it("a seat with no champion yet gets no shop", () => {
    cover("shop-ui-gate");
    const g = shopGate("intermission", true, false);
    expect(g.open).toBe(false);
    expect(g.mounted).toBe(false);
    expect(g.reason).toBe(SHOP_DENY_TEXT["no-champion"]);
  });
});

describe("shop auto-open", () => {
  it("opens on entering prep, and only on the EDGE", () => {
    cover("shop-ui-autoopen");
    expect(shouldAutoOpen("champSelect", "intermission")).toBe(true);
    expect(shouldAutoOpen("resolution", "intermission")).toBe(true);
    expect(shouldAutoOpen(null, "intermission")).toBe(true); // mount mid-prep
    // a re-render inside the same phase must NOT reopen a closed card
    expect(shouldAutoOpen("intermission", "intermission")).toBe(false);
  });

  it("never auto-opens outside prep", () => {
    cover("shop-ui-autoopen");
    for (const phase of ["combat", "resolution", "champSelect", "matchEnd"]) {
      expect(shouldAutoOpen("intermission", phase), phase).toBe(false);
    }
  });

  it("opens again every ROUND (prep → combat → prep)", () => {
    cover("shop-ui-autoopen");
    const stream = ["champSelect", "intermission", "intermission", "combat", "resolution", "intermission"];
    let opens = 0;
    let prev: string | null = null;
    for (const phase of stream) {
      if (shouldAutoOpen(prev, phase)) opens++;
      prev = phase;
    }
    expect(opens).toBe(2); // round 1's prep and round 2's, never the repeats
  });
});
