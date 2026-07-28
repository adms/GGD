/**
 * spectateNotice — the camera may not cut away on its own, and the way back
 * must be on screen.
 *
 * owner, 2026-07-27: 「畫面跳到別的隊伍場地的時候要有明顯提示…」
 * owner, 2026-07-28 (#269): 「不要跳去看別人的競技場，但可以跳出按鈕前往/返回」.
 *
 * THREE INDEPENDENT WAYS THIS FEATURE CAN BE 「做了但玩家拿不到」, so three
 * kinds of guard:
 *   1. the decision reads the wrong field and the banner never appears / never
 *      offers the way back  → pure tests over `spectateNotice`;
 *   2. the button is painted but wired to nothing               → `spectateNoticeClick`
 *      is driven with a fake actions object, and it is the SAME function the
 *      component's onClick calls;
 *   3. the component is perfect and simply is not mounted / paints nothing →
 *      the shipped React tree is RENDERED (react-dom/server, which needs no DOM
 *      — this package's vitest runs `environment: "node"`) and the resulting
 *      markup is read back. That is pixels-adjacent rather than a source scan:
 *      deleting the button, blanking the label or returning null all fail.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SPECTATE_BACK_LABEL,
  SPECTATE_GO_LABEL,
  SPECTATE_NOTICE_TEXT,
  SPECTATE_NOTICE_TOP,
  SPECTATE_OFFER_TEXT,
  SpectateNoticeView_,
  spectateNotice,
  spectateNoticeClick,
} from "./SpectateNotice";
import { TOP_CENTRE_BAND_END } from "../controlLegendModel";

const hudRoot = (): string => readFileSync(join(__dirname, "..", "HudRoot.tsx"), "utf8");

const markup = (zone: number | null, offer: number | null): string =>
  renderToStaticMarkup(createElement(SpectateNoticeView_, { view: spectateNotice(zone, offer) }));

describe("the gate", () => {
  it("silent while your own duel is still being fought", () => {
    // no offer and no watch = nothing to say. This is the normal state of every
    // combat second, so a banner here would be permanent clutter.
    expect(spectateNotice(null, null).mode).toBe("hidden");
    expect(markup(null, null)).toBe("");
  });

  it("OFFERS — never announces — a jump the camera has not made", () => {
    // The whole of #269: with an offer up, the camera is still on YOUR arena.
    // `spectateZone` stays null until the player presses the button, and that is
    // exactly what tells these two states apart.
    const v = spectateNotice(null, 1);
    expect(v.mode).toBe("offer");
    expect(v.text).toBe(SPECTATE_OFFER_TEXT);
    expect(v.buttonLabel).toBe(SPECTATE_GO_LABEL);
    expect(v.zone).toBe(1);
  });

  it("fires the offer for zone 0 too — the truthiness trap", () => {
    // A `if (zone)` check would treat the first arena as 「no offer」 and hide the
    // button for a quarter of all spectatable fights.
    expect(spectateNotice(null, 0).mode).toBe("offer");
    expect(spectateNotice(0, null).mode).toBe("watching");
  });

  it("WATCHING wins over OFFER — or the way back would be hidden", () => {
    // `spectateOffer` keeps being published while you are away (the rule that
    // made the trip available has not changed). Ordering the other way would
    // offer a trip you are already on and delete 「返回」.
    const v = spectateNotice(2, 1);
    expect(v.mode).toBe("watching");
    expect(v.zone).toBe(2);
    expect(v.text).toBe(SPECTATE_NOTICE_TEXT);
    expect(v.buttonLabel).toBe(SPECTATE_BACK_LABEL);
  });

  it("names the arena 1-based — 「第 0 競技場」 reads as a bug", () => {
    expect(spectateNotice(null, 0).zoneLabel).toBe("第 1 競技場");
    expect(spectateNotice(3, null).zoneLabel).toBe("第 4 競技場");
  });
});

describe("the button is wired to the game, not to nothing", () => {
  it("前往觀戰 asks for the OFFERED zone (not the watched one, which is null)", () => {
    const actions = { spectateGoTo: vi.fn(), spectateReturn: vi.fn() };
    spectateNoticeClick(spectateNotice(null, 2), actions);
    expect(actions.spectateGoTo).toHaveBeenCalledWith(2);
    expect(actions.spectateReturn).not.toHaveBeenCalled();
  });

  it("返回 goes home and never re-issues a jump", () => {
    const actions = { spectateGoTo: vi.fn(), spectateReturn: vi.fn() };
    spectateNoticeClick(spectateNotice(1, 1), actions);
    expect(actions.spectateReturn).toHaveBeenCalledTimes(1);
    expect(actions.spectateGoTo).not.toHaveBeenCalled();
  });

  it("a hidden banner's dispatch does nothing at all", () => {
    const actions = { spectateGoTo: vi.fn(), spectateReturn: vi.fn() };
    spectateNoticeClick(spectateNotice(null, null), actions);
    expect(actions.spectateGoTo).not.toHaveBeenCalled();
    expect(actions.spectateReturn).not.toHaveBeenCalled();
  });
});

describe("it really paints", () => {
  it("the OFFER state renders the sentence AND a pressable 前往觀戰 button", () => {
    const html = markup(null, 1);
    expect(html).toContain(SPECTATE_OFFER_TEXT);
    expect(html).toContain("第 2 競技場");
    expect(html).toContain(SPECTATE_GO_LABEL);
    // a <button> — not a label somebody would have to guess is clickable
    expect(html).toMatch(/<button[^>]*>/);
  });

  it("the WATCHING state renders 返回自己的競技場", () => {
    const html = markup(0, 1);
    expect(html).toContain(SPECTATE_NOTICE_TEXT);
    expect(html).toContain(SPECTATE_BACK_LABEL);
    expect(html).not.toContain(SPECTATE_GO_LABEL);
  });

  it("the plate is click-through but the button is NOT", () => {
    // The banner sits over the arena during a fight, so the plate must never eat
    // an order; the button is the one part that opts back in. Both facts are in
    // the rendered style attributes, which is where they have to be true.
    const html = markup(null, 1);
    const plate = html.slice(0, html.indexOf("<button"));
    expect(plate).toMatch(/pointer-events:\s*none/);
    const button = html.slice(html.indexOf("<button"));
    expect(button).toMatch(/pointer-events:\s*auto/);
  });

  it("hangs off the top-centre band instead of sitting on the phase clock", () => {
    // v0.9.1 pinned it at `top: 12`, INSIDE PhaseTimer's own 10..62 band. That
    // was survivable for a click-through label and is not survivable now that
    // the banner carries a button the player has to hit.
    expect(SPECTATE_NOTICE_TOP).toBeGreaterThan(TOP_CENTRE_BAND_END);
    expect(markup(null, 1)).toContain(`${SPECTATE_NOTICE_TOP}px`);
  });
});

describe("it is actually on screen", () => {
  it("HudRoot imports AND renders it", () => {
    const src = hudRoot();
    expect(src).toContain('from "./hud/SpectateNotice"');
    expect(src).toMatch(/<SpectateNotice\s*\/>/);
  });

  it("the mount is not disabled", () => {
    // The three shapes that leave a component in the tree while showing nothing.
    const src = hudRoot();
    expect(src).not.toMatch(/\{\s*false\s*&&\s*<SpectateNotice/);
    expect(src).not.toMatch(/\/\/\s*<SpectateNotice/);
    expect(src).not.toMatch(/\{\s*\/\*[^*]*<SpectateNotice/);
  });

  it("reads the SAME fields the camera writes", () => {
    // A second opinion about where the camera is would drift from the camera.
    // `frameBus.spectateZone` is written by GameApp.spectateGoTo/spectateReturn
    // and is what hud/Minimap already follows; `frameBus.spectateOffer` is the
    // pure #208 decision the frame loop publishes.
    const comp = readFileSync(join(__dirname, "SpectateNotice.tsx"), "utf8");
    expect(comp).toContain("frameBus.spectateZone");
    expect(comp).toContain("frameBus.spectateOffer");
  });
});
