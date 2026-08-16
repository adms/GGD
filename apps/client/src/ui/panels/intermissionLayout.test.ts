/**
 * The intermission's ATTENTION contract (task #107, playtest P2:
 * 「SILVER AUGMENT 三選一卡片直接蓋住商人提示框；同時還有商店清單、備戰倒數、
 * Ready up。四件事同時要注意力。」).
 *
 * Two faults, so two blocks of tests:
 *
 *   GEOMETRY — the draft panel declared `edge: "center"` in the #107 registry
 *   but pinned `top: 90`, so the guard was proving corner-clearance for a rect
 *   the panel never occupied, and at top:90 the card stack landed on the
 *   merchant tip box's band. These tests pin the panel to the SAME centring its
 *   registry row resolves, and prove the centred rect clears the tip band on
 *   every viewport that has the room for it.
 *
 *   PRIORITY — geometry alone cannot fix "four at once" on a 375px-tall phone.
 *   These tests lock the order (focus > deadline > panel > ambient > persistent
 *   chrome), and the two things that keep it from becoming a trap: the clock
 *   stays above the scrim, and the ambient surfaces fade rather than unmount.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { HUD_Z, hudPanel, hudPanelRect } from "../hud/hudLayout";
import {
  AMBIENT_TIP_BAND,
  AMBIENT_TIP_LEFT,
  AMBIENT_TIP_TOP,
  focusHint,
  INTERMISSION_PHASE,
  INTERMISSION_Z,
  PERSISTENT_CHROME_Z,
  centredPanelClearsTipBand,
  intermissionFocus,
  intermissionSurfaces,
} from "./intermissionLayout";

const UI_DIR = join(__dirname, "..");

/** strip comments so prose about a forbidden pattern cannot trip a source scan */
function readUi(rel: string): string {
  return readFileSync(join(UI_DIR, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

/** Landscape phone (rotate-locked), desktop, and one portrait — as hudLayout uses. */
const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 667, height: 375 },
  { width: 812, height: 375 },
  { width: 852, height: 393 },
  { width: 1280, height: 720 },
  { width: 1546, height: 900 },
  { width: 1920, height: 1080 },
] as const;

describe("intermission attention order (hud-panel-cover)", () => {
  it("orders the four surfaces, and keeps ALL of them under the persistent chrome", () => {
    cover("hud-panel-cover");
    // the shop card paints at INTERMISSION_Z.panel; every focus band out-ranks
    // it, and the panel band itself out-ranks the corner slots it covers.
    expect(INTERMISSION_Z.panel).toBeGreaterThan(HUD_Z.slot);
    expect(INTERMISSION_Z.panel).toBeGreaterThan(HUD_Z.expanded);
    expect(INTERMISSION_Z.panel).toBeLessThan(INTERMISSION_Z.focusScrim);
    expect(INTERMISSION_Z.focusScrim).toBeGreaterThan(0);
    expect(INTERMISSION_Z.focusScrim).toBeLessThan(INTERMISSION_Z.focus);
    expect(INTERMISSION_Z.focus).toBeLessThan(INTERMISSION_Z.deadline);
    // a focus surface out-ranks a screen-level sheet …
    expect(INTERMISSION_Z.focusScrim).toBeGreaterThan(HUD_Z.screen);
    // … but is NOT a blocking modal: #107's invariant is that no PERSISTENT
    // chrome may be covered, and the audio cluster is the persistent chrome.
    expect(INTERMISSION_Z.deadline).toBeLessThan(PERSISTENT_CHROME_Z);
    expect(PERSISTENT_CHROME_Z).toBeLessThan(HUD_Z.modal);
    // the market canvas stays below #hud-root (z 10), as its own doc claims
    expect(INTERMISSION_Z.stage).toBeLessThan(10);
  });

  it("mirrors AudioToggle's real Z_TOP — the mirror cannot rot", () => {
    cover("hud-panel-cover");
    // AudioToggle does not export it and is another task's file, so the number
    // is mirrored. Scan the source so a change there fails HERE.
    expect(readUi("AudioToggle.tsx")).toContain(`Z_TOP = ${PERSISTENT_CHROME_Z}`);
  });

  it("the #107 registry row and the module agree on the focus layer", () => {
    cover("hud-panel-cover");
    expect(hudPanel("augment-draft").z).toBe(INTERMISSION_Z.focus);
    expect(HUD_Z.focus).toBe(INTERMISSION_Z.focus);
    expect(HUD_Z.screen).toBeLessThan(HUD_Z.focus);
    expect(HUD_Z.focus).toBeLessThan(HUD_Z.modal);
    // …and on the PANEL layer, which the shop row declares and (since #106/#107)
    // the shop component actually paints at.
    expect(hudPanel("shop").z).toBe(INTERMISSION_Z.panel);
  });

  /**
   * The row used to be a "mild fiction": `z: HUD_Z.screen` declared, no `zIndex`
   * anywhere in MerchantShop.tsx. That is not cosmetic — `hudSlotStyle()` gives
   * every managed slot a real `zIndex: HUD_Z.slot`, so the card painted UNDER
   * the chrome it claims to cover, and the #107 guard (which proves RECTANGLES
   * clear, never paint order) could not see it. Scan the sources.
   */
  it("the shop and ready-up really PAINT in the panel band, not just declare it", () => {
    cover("hud-panel-cover");
    const shop = readUi("panels/MerchantShop.tsx");
    // both roots: the open card AND the collapsed rail (the rail is the control
    // that brings the card back, and the shop claims the corners either way)
    expect(shop.match(/zIndex:\s*INTERMISSION_Z\.panel/g) ?? []).toHaveLength(2);
    expect(readUi("panels/ReadyButton.tsx")).toContain("zIndex: INTERMISSION_Z.panel");
  });

  it("an un-answered offer takes focus; nothing else does", () => {
    cover("hud-panel-cover");
    expect(intermissionFocus({ phase: INTERMISSION_PHASE, offerCount: 1 })).toBe("draft");
    expect(intermissionFocus({ phase: INTERMISSION_PHASE, offerCount: 3 })).toBe("draft");
    expect(intermissionFocus({ phase: INTERMISSION_PHASE, offerCount: 0 })).toBe("shop");
    // a stale offer must not dim a screen the intermission does not own
    for (const phase of ["combat", "champSelect", "resolution", "matchEnd"]) {
      expect(intermissionFocus({ phase, offerCount: 2 }), phase).toBe("shop");
    }
  });

  it("applies the order: the shop yields its CLICKS, the ambient band yields its PIXELS", () => {
    cover("hud-panel-cover");
    const drafting = intermissionSurfaces("draft");
    expect(drafting).toEqual({ scrim: true, shopInteractive: false, ambientMuted: true });
    // and it all comes straight back — nothing here is one-way
    const browsing = intermissionSurfaces("shop");
    expect(browsing).toEqual({ scrim: false, shopInteractive: true, ambientMuted: false });
  });
});

describe("intermission focus geometry (hud-panel-cover)", () => {
  it("the draft panel really CENTRES — the pinned top:90 that caused P2 is gone", () => {
    cover("hud-panel-cover");
    const src = readUi("panels/AugmentDraftPanel.tsx");
    // its registry row says `edge: "center"`, which hudPanelRect resolves on
    // BOTH axes; the panel must actually do that.
    expect(hudPanel("augment-draft").edge).toBe("center");
    expect(src).toContain('top: "50%"');
    expect(src).toContain('transform: "translate(-50%, -50%)"');
    expect(src).not.toMatch(/top:\s*90\b/);
  });

  it("the centred draft rect clears the merchant tip band wherever there is room", () => {
    cover("hud-panel-cover");
    const roomy = VIEWPORTS.filter((v) => v.height >= 600);
    expect(roomy.length).toBeGreaterThan(0);
    for (const vp of roomy) {
      const h = hudPanelRect("augment-draft", vp).h;
      expect(centredPanelClearsTipBand(vp.height, h), `${vp.width}x${vp.height}`).toBeGreaterThan(0);
    }
    // REGRESSION PROOF: the old pin did NOT clear it — at 900px tall the tip
    // band starts at 90 and the panel started at 90 too, dead on top of it.
    const tipTop = 900 * AMBIENT_TIP_BAND.top;
    expect(tipTop).toBe(90);
    // and the short landscape phones are exactly why the priority order exists
    const cramped = VIEWPORTS.filter((v) => v.height < 400);
    expect(cramped.length).toBeGreaterThan(0);
    for (const vp of cramped) {
      const h = hudPanelRect("augment-draft", vp).h;
      expect(centredPanelClearsTipBand(vp.height, h), `${vp.width}x${vp.height}`).toBeLessThan(0);
      // …so on those viewports the tip box MUST be the one that yields
      expect(intermissionSurfaces("draft").ambientMuted).toBe(true);
    }
  });

  it("the tip box takes its band from the contract, not from inline magic numbers", () => {
    cover("hud-panel-cover");
    const src = readUi("MerchantTipBox.tsx");
    expect(src).toContain("AMBIENT_TIP_TOP");
    expect(src).toContain("AMBIENT_TIP_LEFT");
    expect(AMBIENT_TIP_TOP).toBe("10%");
    expect(AMBIENT_TIP_LEFT).toBe("46%");
    // it is right of the shop's left dock (at most 45vw) on every viewport
    for (const vp of VIEWPORTS) {
      expect(vp.width * AMBIENT_TIP_BAND.left, `${vp.width}`).toBeGreaterThan(
        Math.min(vp.width * 0.45, 560),
      );
    }
  });
});

describe("intermission focus surfaces are wired (hud-panel-cover)", () => {
  it("the draft paints a click-blocking scrim and says what to do first", () => {
    cover("hud-panel-cover");
    const src = readUi("panels/AugmentDraftPanel.tsx");
    expect(src).toContain("INTERMISSION_Z.focusScrim");
    expect(src).toContain("INTERMISSION_Z.focus");
    expect(src).toContain("focusHint");
    // a dimmed-but-clickable card still invites the click — the scrim eats it
    expect(src).toMatch(/pointerEvents:\s*"auto"/);
    // the hint has to name the thing that is coming back, or it is just noise
    expect(focusHint()).toContain("商店");
  });

  it("the countdown is the ONE surface lifted over the scrim", () => {
    cover("hud-panel-cover");
    const clock = readUi("panels/PrepClock.tsx");
    expect(clock).toContain("INTERMISSION_Z.deadline");
    // and it stays non-interactive, which is what makes that free
    expect(clock).toMatch(/pointerEvents:\s*"none"/);
    // Ready is deliberately NOT lifted OVER THE SCRIM: readying with an
    // unanswered offer throws the augment away, which is the #130 family of
    // trap. It now names the band it DOES live in (panel, with the shop — the
    // priority order has always said so), so the assertion has to be about the
    // scrim-crossing bands specifically rather than "mentions the module".
    const ready = readUi("panels/ReadyButton.tsx");
    expect(ready).not.toContain("INTERMISSION_Z.deadline");
    expect(ready).not.toContain("INTERMISSION_Z.focus");
    expect(ready).toContain("INTERMISSION_Z.panel");
    expect(INTERMISSION_Z.panel).toBeLessThan(INTERMISSION_Z.focusScrim);
  });

  it("the tip box FADES under a focus surface and never unmounts", () => {
    cover("hud-panel-cover");
    const src = readUi("MerchantTipBox.tsx");
    // opacity, not an early return: the 5s rotation keeps its cadence + history
    expect(src).toMatch(/opacity:\s*muted\s*\?\s*0\s*:\s*1/);
    expect(src).not.toMatch(/if\s*\(\s*muted\s*\)\s*return/);
    // and IntermissionStage feeds it from the shared rule, not a second one
    const stage = readUi("IntermissionStage.tsx");
    expect(stage).toContain("intermissionSurfaces(intermissionFocus(");
    expect(stage).toContain("muted={surfaces.ambientMuted}");
    // the hero reaction bubble is untouched by the focus rule (it only fires on
    // a purchase, and purchases are blocked while the scrim is up)
    expect(stage).toContain("<HeroReactionBubble");
  });
});
