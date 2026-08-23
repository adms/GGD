/**
 * profileScrollContract (#640 「選人畫面左邊技能說明滑不下去」) — the desktop
 * scroll chain of the champ-select profile column. jsdom has no layout engine,
 * so this guards the PURE contract ProfileBlock spreads onto its three nodes;
 * the failure it pins was measured live: `flex:1 minHeight:0` let the fixed
 * stage + identity header squeeze the skills text to a 27px strip.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  profileScrollContract,
  PROFILE_TAB_BODY_MIN_PX,
  PROFILE_STAGE_MIN_PX,
} from "./championProfile";

describe("profileScrollContract (#640)", () => {
  it("desktop: the tab body is a REAL scroll region with a usable floor", () => {
    cover("champselect-profile-scroll");
    const c = profileScrollContract(false);
    // the description must scroll internally — this is the box the wheel (and
    // the #506 pad scroll layer, which needs a genuine overflow box) lands on…
    expect(c.tabBody.overflowY).toBe("auto");
    expect(c.tabBody.flex).toBe(1);
    // …and it may never again collapse to a strip: the floor is the fix.
    expect(c.tabBody.minHeight).toBe(PROFILE_TAB_BODY_MIN_PX);
    expect(PROFILE_TAB_BODY_MIN_PX).toBeGreaterThan(0);
  });

  it("desktop: past the floors the COLUMN scrolls — no window height can strand the text", () => {
    cover("champselect-profile-scroll");
    const c = profileScrollContract(false);
    // the stage yields first (same trade the phone layout makes)…
    expect(c.stage.flexShrink).toBe(1);
    expect(c.stage.minHeight).toBe(PROFILE_STAGE_MIN_PX);
    expect(PROFILE_STAGE_MIN_PX).toBeGreaterThan(0);
    expect(PROFILE_STAGE_MIN_PX).toBeLessThan(300); // a real yield off the 300px desktop stage
    // …then the root column itself becomes the scroll box of last resort.
    expect(c.root.overflowY).toBe("auto");
    expect(c.root.height).toBe("100%");
  });

  it("compact (phone): NO inner scroll — the outer stacked column owns the one scrollbar", () => {
    cover("champselect-profile-scroll");
    const c = profileScrollContract(true);
    expect(c.tabBody.overflowY).toBeUndefined();
    expect(c.root.overflowY).toBeUndefined();
    expect(c.root.height).toBeUndefined(); // flows at natural height (#107)
    expect(c.stage.flexShrink).toBe(0); // the phone stage is already pre-shrunk
  });
});
