/**
 * 連殺 COMBO — the DISPLAY half.
 *
 * The sim already proves the number is right (packages/shared/src/sim/combat/
 * killCombo.test.ts). What can still go wrong here is this repo's #1 failure —
 * 「做了但玩家拿不到」 — and it has five shapes, so there are five families of
 * guard below, each one written so that REMOVING the thing it guards turns it
 * red:
 *
 *   ① drawn off-screen / on top of something    → `where it lands`
 *   ② computed but never delivered to the HUD   → `the wire → the store`
 *   ③ deletable from the render tree, still green → `it is actually mounted`
 *   ④ asserted in the wrong direction            → every expiry test asserts
 *                                                  the NULL, not the value
 *   ⑤ testing something that is not the thing    → the view is RENDERED with
 *                                                  renderToStaticMarkup and the
 *                                                  digits are read back out
 *
 * The mutations actually run against this file are listed in the commit body.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  KILL_COMBO_EVENT,
  KILL_COMBO_WINDOW_MS,
  KILL_COMBO_MIN_SHOWN,
} from "@ggd/shared/sim/combat/killCombo";
import {
  KILL_COMBO_EXIT_MS,
  KILL_COMBO_MIN_H,
  KILL_COMBO_MIN_W,
  killComboCollisions,
  killComboDisplay,
  killComboRect,
  killComboText,
  killComboTier,
  type KillComboState,
} from "./killComboModel";
import {
  hudStore,
  localKillComboCount,
  recordKillComboEvent,
  resetHudStore,
} from "../../net/RoomStore";
import { KillComboView } from "./KillCombo";
import { hudRectInViewport } from "./hudLayout";

const clientSrc = (p: string): string => readFileSync(join(__dirname, "..", "..", p), "utf8");

/**
 * The guard viewports, mirrored from `hudLayout.test.ts`'s own list — a 375px
 * tall window is a phone in landscape, so it is exercised with `touch: true`,
 * and the desktop sizes with `touch: false`. Getting that pairing wrong is how
 * a layout test comes to "prove" a configuration nobody ever ships.
 */
const VIEWPORTS = [
  { width: 667, height: 375, touch: true },
  { width: 780, height: 360, touch: true },
  { width: 812, height: 375, touch: true },
  { width: 852, height: 393, touch: true },
  { width: 375, height: 667, touch: true },
  { width: 1280, height: 720, touch: false },
  { width: 1546, height: 900, touch: false },
  { width: 1920, height: 1080, touch: false },
];

/**
 * SQUEEZED windows, where the centre corridor really is contested.
 *
 * These exist because the guard above would otherwise be VACUOUS about half the
 * placement logic: at every shipping viewport a 260px box centred in the middle
 * of the screen clears the corner stacks whether or not the side-scan runs, so
 * deleting the scan changes nothing and a green tick would certify code that
 * does nothing. Resize a desktop browser to a 500-square and the top-left
 * enemy-team panel (10..194 wide, 168..324 down) reaches straight into the
 * counter's band — the scan is what turns that into "no room" instead of a
 * number painted over the enemy HP bars.
 *
 * A null answer is expected and fine here; a COLLISION is not.
 */
const SQUEEZED = [
  { width: 500, height: 500, touch: false },
  { width: 560, height: 520, touch: false },
  { width: 420, height: 560, touch: false },
];

const state = (count: number, atMs = 0, seq = 1): KillComboState => ({ count, atMs, seq });

/* ═══════════════════════════════════════════════════════════════════════════
 * ① / ④  LIFETIME — the 5-second window, seen from the screen
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("how long it stays up", () => {
  it("uses the SIM's window, not a second opinion", () => {
    // Imported, not restated. If the sim's 5 s ever moves, this moves with it —
    // which is the whole reason the constant is exported from shared.
    expect(KILL_COMBO_WINDOW_MS).toBe(5000);
  });

  it("is up through the whole window", () => {
    expect(killComboDisplay(state(4), 0)?.count).toBe(4);
    expect(killComboDisplay(state(4), 4999)?.phase).toBe("live");
    expect(killComboDisplay(state(4), KILL_COMBO_WINDOW_MS)?.phase).toBe("live");
  });

  it("plays an exit, then GOES AWAY", () => {
    // ⚠️ THE MUTATION: delete the `age > WINDOW + EXIT` line in
    // `killComboDisplay` (or make the window infinite) and the last assertion
    // fails — the final combo of the round would otherwise sit on screen for
    // the rest of the match.
    const mid = killComboDisplay(state(9), KILL_COMBO_WINDOW_MS + KILL_COMBO_EXIT_MS / 2);
    expect(mid?.phase).toBe("out");
    expect(mid!.opacity).toBeGreaterThan(0);
    expect(mid!.opacity).toBeLessThan(1);
    expect(killComboDisplay(state(9), KILL_COMBO_WINDOW_MS + KILL_COMBO_EXIT_MS + 1)).toBeNull();
    expect(killComboDisplay(state(9), 99_999)).toBeNull();
  });

  it("shows nothing without a chain, and nothing at all for no state", () => {
    expect(KILL_COMBO_MIN_SHOWN).toBe(2);
    expect(killComboDisplay(state(1), 0)).toBeNull(); // one kill is not a combo
    expect(killComboDisplay(state(2), 0)).not.toBeNull();
    expect(killComboDisplay(null, 0)).toBeNull();
  });

  it("a clock that ran backwards shows nothing, never a stuck number", () => {
    expect(killComboDisplay(state(7, 5000), 4000)).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * DECISION 2 — a big number must not look like a small one
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("tiers (owner: 50 連殺的字級跟 3 連殺不該一樣)", () => {
  it("steps at 2 / 5 / 10 / 20 / 50", () => {
    expect(killComboTier(2)).toBe(1);
    expect(killComboTier(4)).toBe(1);
    expect(killComboTier(5)).toBe(2);
    expect(killComboTier(9)).toBe(2);
    expect(killComboTier(10)).toBe(3);
    expect(killComboTier(19)).toBe(3);
    expect(killComboTier(20)).toBe(4);
    expect(killComboTier(49)).toBe(4);
    expect(killComboTier(50)).toBe(5);
  });

  it("every step is strictly bigger and differently named", () => {
    const seen = [2, 5, 10, 20, 50].map((n) => killComboDisplay(state(n), 0)!);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!.fontSize).toBeGreaterThan(seen[i - 1]!.fontSize);
      expect(seen[i]!.label).not.toBe(seen[i - 1]!.label);
      expect(seen[i]!.color).not.toBe(seen[i - 1]!.color);
    }
    // 「越高越醒目」: the loudest treatments belong to the top tiers only.
    expect(seen[0]!.glow).toBe(false);
    expect(seen[4]!.glow).toBe(true);
    expect(seen[4]!.shake).toBe(true);
  });

  it("has NO ceiling — the owner's 不設上限", () => {
    // Round 9 is 20 mobs a wave with 60 alive per zone; a sweep goes somewhere
    // absurd and the absurd number is the point.
    const huge = killComboDisplay(state(137), 0)!;
    expect(huge.count).toBe(137);
    expect(huge.tier).toBe(5);
    expect(killComboText(137)).toBe("137 連殺");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ① WHERE IT LANDS — #107 safe-area contract
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("where it lands", () => {
  it("never covers ANY persistent chrome, at any guard viewport", () => {
    // ⚠️ THE MUTATION: bottom-anchor it one band higher (drop the
    // `ability-cluster` obstacle, or make the corridor start at the top edge)
    // and this names the slot it landed on.
    for (const vp of VIEWPORTS) {
      const hits = killComboCollisions(vp, { touch: vp.touch, legendUp: false });
      expect(`${vp.width}x${vp.height}: ${hits.join(",")}`).toBe(`${vp.width}x${vp.height}: `);
    }
  });

  it("the side-scan is NOT decoration — a squeezed window proves it bites", () => {
    // ⚠️ THE MUTATION: drop the corner slots from `killComboObstacles` (so the
    // placement stops measuring what reaches into its band) and the counter
    // lands on the top-left enemy-team panel here. Nothing in the shipping
    // viewport list would notice — which is exactly why these are in the file.
    for (const vp of SQUEEZED) {
      const hits = killComboCollisions(vp, { touch: vp.touch, legendUp: false });
      expect(`${vp.width}x${vp.height}: ${hits.join(",")}`).toBe(`${vp.width}x${vp.height}: `);
    }
    // and the scan really is the thing deciding it — a 500-square has no room
    expect(killComboRect(SQUEEZED[0]!, { touch: false, legendUp: false })).toBeNull();
  });

  it("stays inside the viewport — nothing is drawn off-screen", () => {
    for (const vp of VIEWPORTS) {
      const rect = killComboRect(vp, { touch: vp.touch, legendUp: false });
      expect(rect, `${vp.width}x${vp.height}`).not.toBeNull();
      expect(hudRectInViewport(rect!, vp), `${vp.width}x${vp.height}`).toBe(true);
    }
  });

  it("is legible everywhere it appears at all", () => {
    for (const vp of VIEWPORTS) {
      const rect = killComboRect(vp, { touch: vp.touch, legendUp: false })!;
      expect(rect.w, `${vp.width}x${vp.height} width`).toBeGreaterThanOrEqual(KILL_COMBO_MIN_W);
      expect(rect.h, `${vp.width}x${vp.height} height`).toBeGreaterThanOrEqual(KILL_COMBO_MIN_H);
    }
  });

  it("is horizontally CENTRED (an off-centre combo number reads as a bug)", () => {
    for (const vp of VIEWPORTS) {
      const rect = killComboRect(vp, { touch: vp.touch, legendUp: false })!;
      expect(Math.abs(rect.x + rect.w / 2 - vp.width / 2)).toBeLessThanOrEqual(1);
    }
  });

  it("YIELDS to the round-1 control legend instead of painting over it", () => {
    // #107 precedence: the legend teaches a first-timer the controls and is
    // dismissible; the counter is juice. On desktop both fit — the counter
    // simply docks below the strip. On a landscape phone the corridor is ~70px
    // and cannot hold both, so the counter stands down entirely.
    for (const vp of VIEWPORTS) {
      const opts = { touch: vp.touch, legendUp: true };
      const hits = killComboCollisions(vp, opts);
      expect(`${vp.width}x${vp.height}: ${hits.join(",")}`).toBe(`${vp.width}x${vp.height}: `);
    }
    // and the yield is real, not vacuous: it IS null on the short phones…
    expect(killComboRect({ width: 812, height: 375 }, { touch: true, legendUp: true })).toBeNull();
    // …while the same phone shows it happily once the legend is gone (round 2+,
    // which is also the first round that can have zombies at all).
    expect(
      killComboRect({ width: 812, height: 375 }, { touch: true, legendUp: false }),
    ).not.toBeNull();
    // …and desktop keeps it in BOTH states.
    expect(killComboRect({ width: 1546, height: 900 }, { touch: false, legendUp: true })).not.toBeNull();
  });

  it("says no rather than squeeze — a viewport with no corridor gets nothing", () => {
    // A 240px-tall window has no room between the top cluster and the ability
    // bar. Null is the answer; a counter over the player's own HP bar is not.
    expect(killComboRect({ width: 900, height: 240 }, { touch: false, legendUp: false })).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ② THE WIRE → THE STORE
 * ═══════════════════════════════════════════════════════════════════════════ */

const ev = (over: Record<string, unknown> = {}, type = KILL_COMBO_EVENT) => ({
  type,
  tick: 10,
  data: { killer: 7, killerSeatId: 2, victim: 9, victimKind: "mob", count: 3, ...over },
});

describe("the wire → the store", () => {
  // The store lives in net/RoomStore because `architecture.test.ts` (client-08)
  // allows zustand setState in exactly one file — see the comment there.
  beforeEach(() => {
    resetHudStore();
    hudStore.setState({ localSeatId: 2 });
  });

  it("takes MY combo", () => {
    expect(localKillComboCount(ev(), 2)).toBe(3);
    recordKillComboEvent(ev(), 1000);
    expect(hudStore.getState().killCombo).toEqual({ count: 3, atMs: 1000, seq: 1 });
  });

  it("drops SOMEONE ELSE's combo — the number must be yours", () => {
    // Asserted in the failing direction: a teammate's zombie sweep showing up as
    // your own chain is the defect, so the assertion is that the store is UNSET.
    expect(localKillComboCount(ev({ killerSeatId: 5 }), 2)).toBeNull();
    recordKillComboEvent(ev({ killerSeatId: 5 }), 1000);
    expect(hudStore.getState().killCombo).toBeNull();
  });

  it("drops a spectator's (no local seat) and every non-combo event", () => {
    expect(localKillComboCount(ev(), null)).toBeNull();
    expect(localKillComboCount(ev({}, "mobSlain"), 2)).toBeNull();
    expect(localKillComboCount(ev({}, "death"), 2)).toBeNull();
  });

  it("rejects a malformed payload rather than rendering NaN", () => {
    expect(localKillComboCount(ev({ count: "3" }), 2)).toBeNull();
    expect(localKillComboCount(ev({ count: Number.NaN }), 2)).toBeNull();
    expect(localKillComboCount(ev({ count: 0 }), 2)).toBeNull();
    expect(localKillComboCount(ev({ killerSeatId: -1 }), 2)).toBeNull();
  });

  it("bumps `seq` on every credit so 5→6 gets its own beat", () => {
    recordKillComboEvent(ev({ count: 5 }), 1000);
    recordKillComboEvent(ev({ count: 6 }), 1200);
    expect(hudStore.getState().killCombo).toEqual({ count: 6, atMs: 1200, seq: 2 });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ③ IT IS ACTUALLY MOUNTED, AND ACTUALLY FED
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("it is actually on screen", () => {
  it("HudRoot imports AND renders it", () => {
    const src = clientSrc("ui/HudRoot.tsx");
    expect(src).toContain('from "./hud/KillCombo"');
    expect(src).toMatch(/<KillCombo\s*\/>/);
  });

  it("the mount is not disabled", () => {
    // The three shapes that leave a component in the tree while showing nothing.
    const src = clientSrc("ui/HudRoot.tsx");
    expect(src).not.toMatch(/\{\s*false\s*&&\s*<KillCombo/);
    expect(src).not.toMatch(/\/\/\s*<KillCombo/);
    expect(src).not.toMatch(/\{\s*\/\*[^*]*<KillCombo/);
  });

  it("GameApp's event drain really calls the recorder", () => {
    // ⚠️ THE MUTATION: delete `recordKillComboEvent(ev)` from GameApp's drain
    // loop and this goes red. Without it the sim counts perfectly and no screen
    // in the game ever hears about it — the exact 「算出來但沒送到端點」 shape.
    const src = clientSrc("GameApp.ts");
    expect(src).toContain("recordKillComboEvent,");
    expect(src).toMatch(/recordKillComboEvent\(ev, nowMs\)/);
  });

  it("the server really fans the event out — no silent whitelist drop", () => {
    // `eventFanout.ts` is a hard allowlist and a missing name fails SILENTLY.
    const fanout = readFileSync(
      join(__dirname, "../../../../game-server/src/net/eventFanout.ts"),
      "utf8",
    );
    // Anchored on the DECLARATIONS, not on the first mention: both names also
    // appear in the module's prose, and a scrape that silently grabbed the
    // comment instead of the set would certify nothing.
    const from = fanout.indexOf("export const FANNED_OUT_EVENT_TYPES");
    const to = fanout.indexOf("export const SERVER_ONLY_EVENT_TYPES");
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const fannedOut = fanout.slice(from, to);
    // sanity-bound the scrape: it must have found a real list, not two lines
    expect(fannedOut.split("\n").length).toBeGreaterThan(20);
    expect(fannedOut).toContain(`"${KILL_COMBO_EVENT}"`);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ⑤ THE VIEW, ACTUALLY RENDERED
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("the rendered counter", () => {
  const rect = killComboRect({ width: 1546, height: 900 }, { touch: false, legendUp: false })!;
  const html = (count: number, nowMs = 0): string =>
    renderToStaticMarkup(
      createElement(KillComboView, { rect, view: killComboDisplay(state(count), nowMs)! }),
    );

  it("puts the DIGITS in the DOM at the derived offsets", () => {
    // Not "the model returned 12" — the markup a browser would paint contains
    // the string a player reads, at the rectangle the layout proved is free.
    const out = html(12);
    expect(out).toContain("12 連殺");
    expect(out).toContain("血洗");
    expect(out).toContain(`left:${rect.x}px`);
    expect(out).toContain(`top:${rect.y}px`);
    expect(out).toContain(`width:${rect.w}px`);
  });

  it("a bigger combo really renders bigger type", () => {
    const small = html(3).match(/font-size:(\d+)px;line-height/)?.[1];
    const big = html(60).match(/font-size:(\d+)px;line-height/)?.[1];
    expect(Number(big)).toBeGreaterThan(Number(small));
  });

  it("never lets the glyph outgrow the box the layout proved is free", () => {
    // A 96px 天災 glyph inside a 66px corridor on a 780x360 phone would spill
    // straight onto the ability bar — the one thing the rect exists to stop.
    const phone = killComboRect({ width: 780, height: 360 }, { touch: true, legendUp: false })!;
    const out = renderToStaticMarkup(
      createElement(KillComboView, { rect: phone, view: killComboDisplay(state(99), 0)! }),
    );
    const size = Number(out.match(/font-size:(\d+)px;line-height/)?.[1]);
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThanOrEqual(phone.h);
  });

  it("swallows no clicks", () => {
    expect(html(5)).toContain("pointer-events:none");
  });

  it("the exit visibly fades", () => {
    const out = html(5, KILL_COMBO_WINDOW_MS + KILL_COMBO_EXIT_MS / 2);
    expect(out).toContain('data-kill-combo-phase="out"');
    expect(out).toMatch(/opacity:0\.\d/);
  });

  it("keeps the number for a player who asked for less motion", () => {
    expect(html(30)).toContain("prefers-reduced-motion");
  });
});
