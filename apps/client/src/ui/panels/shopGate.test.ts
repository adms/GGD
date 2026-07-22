/**
 * The shop's UI gate (task #38 requirement 3). The load-bearing claims:
 * prep is open, a LIVING player in combat gets no shop AT ALL (the surface must
 * not even exist — 「戰鬥的時候商店不會出現」), a player DEFEATED this round
 * gets it back with a distinct label, and the auto-open fires on the phase EDGE
 * exactly once so a re-render can never re-open a card the player closed.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { SHOP_DENY_TEXT, SHOP_DOWNED_LABEL, shopGate, shouldAutoOpen } from "./shopGate";

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

  it("combat gives a LIVING player no shop surface, with the stated reason", () => {
    cover("shop-ui-gate");
    const g = shopGate("combat", true);
    expect(g.open).toBe(false);
    expect(g.mounted).toBe(false); // the card force-closes; no tempting button
    expect(g.reason).toBe("戰鬥中無法使用商店");
    expect(g.reason).toBe(SHOP_DENY_TEXT["combat-alive"]);
  });

  it("a player DOWN this round keeps the shop, labelled as such", () => {
    cover("shop-ui-gate");
    const g = shopGate("combat", false);
    expect(g.open).toBe(true);
    expect(g.mounted).toBe(true);
    expect(g.label).toBe(SHOP_DOWNED_LABEL);
  });

  it("champ select / resolution / match end are closed", () => {
    cover("shop-ui-gate");
    for (const phase of ["champSelect", "resolution", "matchEnd", "connecting"]) {
      const g = shopGate(phase, true);
      expect(g.open, phase).toBe(false);
      expect(g.mounted, phase).toBe(false);
      expect(g.reason, phase).toBe(SHOP_DENY_TEXT["phase-closed"]);
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
