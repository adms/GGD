/**
 * client-27 (hud-surface-overlap): the SURFACE half of the #107 contract.
 *
 * THE THREE BUGS THIS LOCKS OUT — all reported by the owner on 2026-07-30, all
 * the same root cause (a box that is neither a corner slot nor an edge panel,
 * so nothing could see it):
 *
 *   ① 「你的競技場已分出勝負」 painted over the round 評價 card AND over the
 *      「Round over」 pill — three centred/right boxes, three files, zero shared
 *      geometry.
 *   ② the scoreboard's expanded K/D list grew down through the `audio-toggle`
 *      slot, which is `portal: true` and therefore CANNOT yield.
 *   ③ the 戰績變化 charts sat below the fold of a `maxHeight: 92vh` card.
 *
 * FOUR LAYERS OF PROTECTION, because a clipping resolver would otherwise make
 * its own guard vacuous:
 *   1. registry integrity (ids, owners, orders, RESERVED rows);
 *   2. THE GUARD — no two simultaneously-visible surfaces overlap, and no
 *      managed surface overlaps a slot painted at the same time, on every
 *      landscape viewport × pointer type × scene;
 *   3. VISIBILITY — each surface still really resolves where it has to, so
 *      "return null everywhere" cannot pass layer 2;
 *   4. REGRESSION — the PRE-FIX rectangles, rebuilt from the coordinates the
 *      components used to hard-code, really do collide.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import {
  HUD_EDGE,
  HUD_GAP,
  HUD_Z,
  hudPanel,
  hudRectsOverlap,
  hudRectInViewport,
  hudSlot,
  hudSlotBand,
  hudSlotRect,
  type HudRect,
  type HudViewport,
} from "./hudLayout";
import {
  HUD_PHASES,
  HUD_SURFACES,
  MATCH_END_CARD_MIN_W,
  PROGRESS_CHART_W,
  freeIntervals,
  hudCornerColumnWidth,
  hudResolvedSurfaces,
  hudScenes,
  hudSurface,
  hudSurfaceCollisions,
  hudSurfaceRect,
  hudSurfaceStyle,
  matchEndCardCap,
  matchEndCardWidth,
  matchEndReserveRight,
  panelsForPhase,
  type HudPhase,
  type HudScene,
  type HudSurfaceId,
} from "./hudSurfaces";
import { TOP_CENTRE_BAND_END } from "../controlLegendModel";

const UI_DIR = join(__dirname, "..");

/** strip comments so prose about a forbidden pattern cannot trip a scan */
function readUi(rel: string): string {
  return readFileSync(join(UI_DIR, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

/**
 * LANDSCAPE ONLY, deliberately. The in-match HUD is rotate-locked
 * (ui/RotateOverlay) and `panels/roundReportLayout` states the same rule: a
 * 375-wide PORTRAIT viewport has the shop on the left, the corner stacks on the
 * right and the champion's own bars across the middle, so there is no honest
 * arrangement there and the HUD is not in use anyway.
 */
const VIEWPORTS: readonly HudViewport[] = [
  // 568×320 is an iPhone SE / 5s in landscape — the narrowest viewport the game
  // is really played on, and the one that finally makes the spectate banner's
  // COMPACT tier reachable by a guard (measured: the banner is 316 px there, and
  // SPECTATE_COMPACT_W is 320). Before it was added the narrowest banner any
  // guard viewport produced was 415 px, so the whole tier was dead code —
  // `const compact = false` left all 1894 `src/ui` tests green.
  { width: 568, height: 320 },
  { width: 667, height: 375 },
  { width: 780, height: 360 },
  { width: 812, height: 375 },
  { width: 844, height: 390 },
  { width: 852, height: 393 },
  { width: 1280, height: 720 },
  { width: 1546, height: 900 },
  { width: 1920, height: 1080 },
];

const DESKTOP: HudViewport = { width: 1280, height: 720 };
const PHONE: HudViewport = { width: 812, height: 375 };

/**
 * REALISTIC (viewport, pointer) pairs, used ONLY by the visibility layer.
 *
 * The collision guard above sweeps every combination — a wrong rectangle is a
 * bug whatever the pointer is. But "must be visible" cannot be asserted for a
 * 667×375 window driven by a MOUSE: those sizes are phone landscape,
 * `input/mobileDetect` is what picks the layout, and at 667 wide with a fine
 * pointer the desktop minimap alone (208 px, bottom-right, reaching y 85→293)
 * leaves 173 px of centre corridor. Demanding a banner there would force either
 * an unreadable 173 px box or a fake number in the registry.
 */
function realisticPairs(): { vp: HudViewport; touch: boolean }[] {
  const out: { vp: HudViewport; touch: boolean }[] = [];
  for (const vp of VIEWPORTS) {
    out.push({ vp, touch: true });
    if (vp.width >= 1024) out.push({ vp, touch: false });
  }
  return out;
}

const scene = (phase: HudPhase, withPanels = false): HudScene => ({
  phase,
  panels: withPanels ? panelsForPhase(phase) : [],
});

describe("HUD surface registry (client-27)", () => {
  it("declares unique ids, real owner files, and RESERVED notes on unmanaged rows", () => {
    cover("hud-panel-cover");
    const ids = HUD_SURFACES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of HUD_SURFACES) {
      expect(existsSync(join(UI_DIR, s.owner.replace(/^ui\//, ""))), s.owner).toBe(true);
      expect(s.phases.length, s.id).toBeGreaterThan(0);
      for (const p of s.phases) expect(HUD_PHASES, s.id).toContain(p);
      expect(s.z, s.id).toBeGreaterThanOrEqual(HUD_Z.slot);
      if (!s.managed) expect(s.note ?? "", s.id).toMatch(/RESERVED/);
    }
  });

  it("the top-centre column has a unique order per surface", () => {
    cover("hud-panel-cover");
    const orders = HUD_SURFACES.filter((s) => s.place.kind === "top-centre").map(
      (s) => (s.place as { order: number }).order,
    );
    expect(orders.length).toBeGreaterThan(1); // the column really is a stack
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("hudSurface throws on an unknown id", () => {
    cover("hud-panel-cover");
    expect(() => hudSurface("nope" as HudSurfaceId)).toThrow(/unknown HUD surface/);
  });

  it("CROSS-CHECK: TOP_CENTRE_BAND_END really clears every reserved top band", () => {
    cover("hud-panel-cover");
    // controlLegendModel's constant is the number three other modules hang off.
    // It is only true because of the boxes declared here — so prove it here.
    const bands = HUD_SURFACES.filter((s) => s.place.kind === "top-band").map(
      (s) => s.place as { top: number; height: number },
    );
    expect(bands.length).toBeGreaterThan(0);
    for (const b of bands) {
      expect(b.top + b.height, "TOP_CENTRE_BAND_END is above a declared band").toBeLessThanOrEqual(
        TOP_CENTRE_BAND_END,
      );
    }
  });

  it("freeIntervals: an obstacle carves the band out WITH breathing room", () => {
    cover("hud-panel-cover");
    const vp = { width: 1000, height: 800 };
    const band = { top: 100, bottom: 200 };
    // an obstacle outside the band changes nothing
    expect(freeIntervals(band, [{ x: 400, y: 0, w: 100, h: 50 }], vp)).toEqual([
      { start: HUD_EDGE, end: 990 },
    ]);
    // one inside splits it, and each side is pushed back by a full HUD_GAP
    expect(freeIntervals(band, [{ x: 400, y: 150, w: 100, h: 50 }], vp)).toEqual([
      { start: HUD_EDGE, end: 400 - HUD_GAP },
      { start: 500 + HUD_GAP, end: 990 },
    ]);
    // overlapping obstacles merge instead of producing a negative interval
    expect(
      freeIntervals(
        band,
        [
          { x: 100, y: 150, w: 300, h: 10 },
          { x: 200, y: 150, w: 300, h: 10 },
        ],
        vp,
      ),
    ).toEqual([{ start: HUD_EDGE, end: 100 - HUD_GAP }, { start: 500 + HUD_GAP, end: 990 }]);
  });
});

// ── LAYER 2: THE GUARD ───────────────────────────────────────────────────────
describe("HUD surface overlap guard (client-27)", () => {
  it("GUARD: no two simultaneously-visible surfaces overlap, and none lands on a painted slot", () => {
    cover("hud-panel-cover");
    const problems: string[] = [];
    for (const vp of VIEWPORTS) {
      for (const touch of [false, true]) {
        for (const sc of hudScenes()) {
          const rects = hudResolvedSurfaces(vp, touch, sc);
          for (const hit of hudSurfaceCollisions(vp, touch, sc, rects)) {
            problems.push(`${vp.width}x${vp.height}${touch ? " touch" : ""} ${sc.phase}${sc.panels.length ? "+panels" : ""}: ${hit}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  /**
   * The rule the free-interval sweep alone CANNOT express, and the reason
   * `resolveInward` computes a `far` edge at all.
   *
   * A corner column is only as TALL as its slots. Below the last one the sweep
   * reports the whole width as free — so a 340px card starting at y 210 on a
   * 1546×900 desktop would happily take x 1196→1536, i.e. the audio cluster's
   * own lane, one browser resize (or one new slot) away from a real collision.
   * Deleting the `- colW - HUD_GAP` term passes every other test in this file
   * and fails this one.
   */
  it("GUARD: an inward surface never enters its corner column's lane", () => {
    cover("hud-panel-cover");
    const problems: string[] = [];
    for (const vp of VIEWPORTS) {
      for (const touch of [false, true]) {
        for (const sc of hudScenes()) {
          for (const s of HUD_SURFACES) {
            if (s.place.kind !== "inward") continue;
            const rect = hudSurfaceRect(s.id as HudSurfaceId, vp, touch, sc);
            if (!rect) continue;
            const colW = hudCornerColumnWidth(s.place.corner, touch, sc, s.z);
            const lane = vp.width - HUD_EDGE - colW - HUD_GAP;
            if (rect.x + rect.w > lane) {
              problems.push(
                `${vp.width}x${vp.height}${touch ? " touch" : ""} ${sc.phase}: ${s.id} ends at ${rect.x + rect.w}, past the column lane at ${lane}`,
              );
            }
          }
        }
      }
    }
    expect(problems).toEqual([]);
    // non-vacuous: the top-right column really does reserve width in-match
    expect(hudCornerColumnWidth("top-right", false, scene("combat"), HUD_Z.expanded)).toBeGreaterThan(0);
  });

  it("GUARD: every resolved surface is inside the viewport and above the build-stamp band", () => {
    cover("hud-panel-cover");
    const problems: string[] = [];
    for (const vp of VIEWPORTS) {
      for (const touch of [false, true]) {
        for (const sc of hudScenes()) {
          for (const s of hudResolvedSurfaces(vp, touch, sc)) {
            if (!hudRectInViewport(s.rect, vp)) {
              problems.push(`${vp.width}x${vp.height} ${sc.phase}: ${s.id} escapes the viewport`);
            }
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

// ── LAYER 3: VISIBILITY (the guard is not satisfied by hiding everything) ────
describe("HUD surfaces still really paint (client-27)", () => {
  it("the three reported surfaces resolve on the viewports they have to work on", () => {
    cover("hud-panel-cover");
    const missing: string[] = [];
    /**
     * `from` is the narrowest viewport a surface is REQUIRED on, and each
     * number is a measured limit rather than a preference:
     *   · the 評價 card and the drawer fit every landscape phone;
     *   · the CENTRED banners do not, during `resolution`. On a 812×375 phone
     *     the 評價 card (340) plus the two corner columns plus the 340-wide
     *     觀戰中 pill leave under 200px of centre corridor, and the contract's
     *     answer to "no room" is to drop the LOWER-priority surface, not to
     *     paint it over the 評價 the owner asked to be able to read. In COMBAT,
     *     where no card is up, the banner resolves everywhere.
     *
     * The two 5xx floors were MEASURED with a 1-px sweep on 2026-07-30 (heights
     * 320 / 360 / 375, touch), not chosen: they are the exact width at which the
     * surface first resolves, so lowering a `minWidth` or slimming the top-right
     * column moves them and this list has to be re-measured with it.
     */
    const CASES: ReadonlyArray<readonly [HudSurfaceId, HudPhase, number]> = [
      // 596: below this the top-right column plus the centred stack leave under
      // the card's own minWidth (220) on a 568×320 phone, and the contract's
      // answer to "no room" is to drop the surface, not to squeeze it.
      ["round-victory", "resolution", 596],
      // 556: the drawer's minWidth is 180 and the touch column is 150 wide.
      ["scoreboard-list", "combat", 556],
      ["spectate-notice", "combat", 0],
      ["spectate-notice", "resolution", 1024],
      ["round-over", "resolution", 1024],
    ];
    for (const { vp, touch } of realisticPairs()) {
      for (const [id, phase, from] of CASES) {
        if (vp.width < from) continue;
        if (!hudSurfaceRect(id, vp, touch, scene(phase))) {
          missing.push(`${vp.width}x${vp.height}${touch ? " touch" : ""}: ${id}@${phase}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("the scoreboard drawer survives an open shop too (its lower `tops` rungs)", () => {
    cover("hud-panel-cover");
    // a DEFEATED player keeps shopping through combat, and the ☰ relocates into
    // the top-right column while that card is docked left — the scene the
    // drawer has the least room in.
    //
    // 648 is measured, not chosen: the shop docks min(45vw, 560) on the left,
    // so below that width the strip left over is narrower than the drawer's own
    // minWidth of 180 and the drawer correctly declines to open.
    const SHOP_DRAWER_FROM = 648;
    const missing: string[] = [];
    for (const { vp, touch } of realisticPairs()) {
      if (vp.width < SHOP_DRAWER_FROM) continue;
      if (!hudSurfaceRect("scoreboard-list", vp, touch, scene("combat", true))) {
        missing.push(`${vp.width}x${vp.height}${touch ? " touch" : ""}`);
      }
    }
    expect(missing).toEqual([]);
    // …and it really is a floor rather than a blanket exemption: one pixel
    // above it, on the narrowest guard viewport's height, the drawer is back.
    expect(
      hudSurfaceRect("scoreboard-list", { width: SHOP_DRAWER_FROM, height: 320 }, true, scene("combat", true)),
    ).not.toBeNull();
    expect(
      hudSurfaceRect("scoreboard-list", { width: SHOP_DRAWER_FROM - 1, height: 320 }, true, scene("combat", true)),
    ).toBeNull();
  });

  it("the drawer really uses BOTH rungs of its ladder (the fallback is not dead code)", () => {
    cover("hud-panel-cover");
    // desktop: aligned with its own button …
    const desk = hudSurfaceRect("scoreboard-list", DESKTOP, false, scene("combat"))!;
    expect(desk.y).toBe(hudSlotBand("scoreboard", false).start);
    // … phone landscape: the centred phase cluster and the spectate banner
    // split the free interval at the button's row, so it drops down the ladder
    // instead of vanishing — and lands clear of the banner, not on it.
    const phone = hudSurfaceRect("scoreboard-list", PHONE, true, scene("combat"))!;
    expect(phone.y).toBeGreaterThan(hudSlotBand("scoreboard", true).start);
    expect(phone.y).toBeGreaterThan(TOP_CENTRE_BAND_END);
    const banner = hudSurfaceRect("spectate-notice", PHONE, true, scene("combat"))!;
    expect(hudRectsOverlap(phone, banner)).toBe(false);
  });

  it("the 戰績變化 card docks right on a desktop and leaves the settlement card usable", () => {
    cover("hud-panel-cover");
    const chart = hudSurfaceRect("progress-chart", DESKTOP, false, scene("matchEnd", true))!;
    expect(chart.w).toBe(PROGRESS_CHART_W);
    const card = matchEndCardWidth(DESKTOP, false, true);
    expect(card).not.toBeNull();
    expect(card!).toBeGreaterThanOrEqual(MATCH_END_CARD_MIN_W);
    // the reserve really shifts the card clear of the chart …
    const reserve = matchEndReserveRight(DESKTOP, false, true);
    const cardRect: HudRect = {
      x: MATCH_END_PAD_LEFT + (DESKTOP.width - MATCH_END_PAD_LEFT - reserve - card!) / 2,
      y: 0,
      w: card!,
      h: DESKTOP.height,
    };
    expect(hudRectsOverlap(cardRect, chart)).toBe(false);
    // … and with the chart closed nothing changes at all
    expect(matchEndCardWidth(DESKTOP, false, false)).toBe(matchEndCardCap(DESKTOP));
    expect(matchEndReserveRight(DESKTOP, false, false)).toBe(MATCH_END_PAD_LEFT);
  });

  it("a viewport too narrow for two columns says so instead of squeezing the ranking", () => {
    cover("hud-panel-cover");
    // ⚠️ This used to be commented 「the chart falls back INSIDE the card, where
    // it used to be」. That was FALSE and is corrected here: a null card width
    // selects OVERLAY — the settlement keeps its whole width and the chart card
    // paints on top of it. The in-card fallback is a different predicate
    // (`progressChartSurfaceStyle` returning null, below 428 px) and all three
    // modes are asserted in hudSurfacePaint.test.ts.
    const narrow = { width: 780, height: 360 };
    expect(matchEndCardWidth(narrow, true, true)).toBeNull();
    expect(matchEndReserveRight(narrow, true, true)).toBe(MATCH_END_PAD_LEFT);
    // the chart is still DOCKED here (overlay), not in the card's flow
    expect(hudSurfaceRect("progress-chart", narrow, true, scene("matchEnd", true))).not.toBeNull();
  });
});

const MATCH_END_PAD_LEFT = 16;

// ── LAYER 4: REGRESSIONS (proof the guard is not vacuous) ────────────────────
describe("REGRESSION: the pre-fix geometry really collided (client-27)", () => {
  it("① the spectate banner sat on 「Round over」 AND on the 評價 card", () => {
    cover("hud-panel-cover");
    const vp = { width: 1024, height: 720 };
    // What v0.9.12 shipped, rebuilt from the numbers the three files pinned:
    //   SpectateNotice  top: TOP_CENTRE_BAND_END + HUD_GAP (=106), centred, ~366 wide
    //   「Round over」   top: 120, centred, ~150 wide            (HudRoot)
    //   RoundVictory    top: topRightClear({gap:8}) (=130 in-match), right: 16,
    //                   width min(340, 34vw)                    (RoundVictoryPanel)
    const banner: HudRect = { x: vp.width / 2 - 183, y: 106, w: 366, h: 44 };
    const roundOver: HudRect = { x: vp.width / 2 - 75, y: 120, w: 150, h: 42 };
    const victoryW = Math.min(340, vp.width * 0.34);
    const victory: HudRect = { x: vp.width - 16 - victoryW, y: 130, w: victoryW, h: 400 };

    expect(hudRectsOverlap(banner, roundOver), "banner ∩ Round over").toBe(true);
    expect(hudRectsOverlap(banner, victory), "banner ∩ 評價 card").toBe(true);
    // the old card also painted over the ⚙ settings slot, which nothing noticed
    expect(hudRectsOverlap(victory, hudSlotRect("settings", vp, false))).toBe(true);

    // …and the shipped surfaces clear all three.
    const sc = scene("resolution");
    const b = hudSurfaceRect("spectate-notice", vp, false, sc)!;
    const o = hudSurfaceRect("round-over", vp, false, sc)!;
    const v = hudSurfaceRect("round-victory", vp, false, sc)!;
    expect(hudRectsOverlap(b, o)).toBe(false);
    expect(hudRectsOverlap(b, v)).toBe(false);
    expect(hudRectsOverlap(v, hudSlotRect("settings", vp, false))).toBe(false);
    // the banner is BELOW the pill now — that is the phase-filtered stack
    expect(b.y).toBeGreaterThan(o.y + o.h);
    // …and in combat, where the pill is absent, it takes the top row back
    expect(hudSurfaceRect("spectate-notice", vp, false, scene("combat"))!.y).toBe(o.y);
  });

  it("② the scoreboard drawer grew straight through the portal-ed audio cluster", () => {
    cover("hud-panel-cover");
    const vp = DESKTOP;
    // the old list: flow content inside the 26px slot, `marginTop: 6`,
    // `minWidth: 220`, right-anchored at HUD_EDGE — i.e. it opened DOWNWARD in
    // the same column, under every slot below it.
    const band = hudSlotBand("scoreboard", false);
    const old: HudRect = { x: vp.width - HUD_EDGE - 220, y: band.end + 6, w: 220, h: 280 };
    const audio = hudSlotRect("audio-toggle", vp, false);
    expect(hudRectsOverlap(old, audio), "old drawer ∩ audio cluster").toBe(true);
    expect(hudRectsOverlap(old, hudSlotRect("settings", vp, false))).toBe(true);
    expect(hudRectsOverlap(old, hudSlotRect("cheats", vp, false))).toBe(true);

    // THE REASON A Z-INDEX COULD NEVER HAVE FIXED IT: the cluster is declared
    // `portal`, i.e. it rides above every panel and never yields.
    expect(hudSlot("audio-toggle").portal).toBe(true);

    // shipped: the drawer docks INSIDE the column and touches nothing.
    const fixed = hudSurfaceRect("scoreboard-list", vp, false, scene("combat"))!;
    expect(hudRectsOverlap(fixed, audio)).toBe(false);
    expect(fixed.x + fixed.w).toBeLessThanOrEqual(audio.x - HUD_GAP);
  });

  it("③ the 戰績變化 charts opened below the fold of a 92vh card", () => {
    cover("hud-panel-cover");
    const vp = DESKTOP;
    // The card is min(760,96vw) × maxHeight 92vh with `overflowY: auto`, and the
    // charts were its LAST child, under the 返回大廳 row. Everything above them
    // — grade splash, stat grid, reflections, team points, the ranking list —
    // measures well past a 92vh window, so the panel's own top started below it.
    const cardH = 0.92 * vp.height; // 662
    const ABOVE_THE_CHARTS = 700; // splash 100 + stats 120 + hints 90 + points 90 + ranking 252 + buttons 48
    expect(ABOVE_THE_CHARTS).toBeGreaterThan(cardH); // ⇒ scroll required to reach them

    // shipped: its own card beside the settlement, starting at the top edge.
    const chart = hudSurfaceRect("progress-chart", vp, false, scene("matchEnd", true))!;
    expect(chart.y).toBe(HUD_EDGE);
    expect(chart.h).toBeGreaterThanOrEqual(400);
    // it clears the one slot that cannot yield on the settlement screen …
    expect(hudRectsOverlap(chart, hudSlotRect("audio-toggle", vp, false))).toBe(false);
    // … and the terminal panel it lives inside is the ONLY panel it may cover
    expect(hudSurface("progress-chart").over).toEqual(["match-end"]);
    expect(hudPanel("match-end").edge).toBe("full");
  });
});

// ── the contract stays true for surfaces nobody has written yet ──────────────
describe("HUD surface sources (client-27)", () => {
  /**
   * ⛔ THE GUARD THAT USED TO LIVE HERE WAS VACUOUS, and is deliberately not
   * re-added. It scanned each owner's SOURCE for `hudSurfaceStyle("<id>"` —
   * failure shape ⑥. Measured refutation, 2026-07-30: KEEP that exact line in
   * `SpectateNotice.tsx` and append
   *     top: SPECTATE_NOTICE_TOP, left: "50%", transform: "translateX(-50%)"
   * one line below it. A later key wins in an object literal, so the banner is
   * pinned back to y 106 — the reported bug, reproduced — and the scan was
   * still satisfied: 34/34 green.
   *
   * Its replacement is `hudSurfacePaint.test.ts`, which RENDERS every managed
   * surface's shipped view and reads the resulting `left`/`top`/`width` back
   * off the markup. The same mutation makes that file red. This test only
   * checks that the replacement still covers every row, so deleting a case
   * there cannot go unnoticed from here.
   */
  it("every managed surface has a RENDERED placement case in hudSurfacePaint.test.ts", () => {
    cover("hud-panel-cover");
    const paint = readFileSync(join(__dirname, "hudSurfacePaint.test.ts"), "utf8");
    const missing = HUD_SURFACES.filter((s) => s.managed)
      .map((s) => s.id)
      .filter((id) => !paint.includes(`"${id}": {`));
    expect(missing, "add a PAINT row for these in hudSurfacePaint.test.ts").toEqual([]);
    // …and that file must really assert on the rendered style, not import-and-forget
    expect(paint).toContain("renderToStaticMarkup");
    expect(paint).toContain("rootStyle(");
  });

  /**
   * THE SYSTEMIC GUARD, and the half that covers panels nobody has written yet:
   * a file that paints an in-match surface may not pin itself to a corner with
   * literal coordinates. Identical in shape to `hudLayout.test.ts`'s scan — a
   * positioned style that sets BOTH a non-zero vertical and a non-zero
   * horizontal numeric literal — but pointed at the SURFACE-bearing files,
   * which that scan never covered. Centred boxes (`left: "50%"`), full-bleed
   * layers (`inset: 0`) and percentage offsets are unaffected.
   */
  it("GUARD: no surface-bearing file hard-codes a corner position", () => {
    cover("hud-panel-cover");
    /**
     * Files that legitimately still pin themselves. Each MUST have a RESERVED
     * row in the registry, so its box is at least declared for everyone else.
     */
    const ALLOW = new Map<string, string>([
      // HudRoot pins the 觀戰中 pill at `left:"50%"; top:64` — centred, so the
      // scan below cannot see it anyway; the RESERVED row is what matters.
      ["HudRoot.tsx", "spectator-hint"],
      ["components/PhaseTimer.tsx", "phase-timer"],
    ]);

    const FILES = [
      "HudRoot.tsx",
      "components/PhaseTimer.tsx",
      "components/Scoreboard.tsx",
      "hud/SpectateNotice.tsx",
      "hud/RoundOverPill.tsx",
      "panels/RoundVictoryPanel.tsx",
      "panels/ProgressChartPanel.tsx",
      "panels/MatchEndPanel.tsx",
    ];

    const V = /\b(top|bottom):\s*(-?\d+)\b/g;
    const H = /\b(left|right):\s*(-?\d+)\b/g;
    const offenders: string[] = [];
    for (const rel of FILES) {
      const src = readUi(rel);
      for (const m of src.matchAll(/position:\s*"(absolute|fixed)"/g)) {
        const win = src.slice(m.index ?? 0, (m.index ?? 0) + 320);
        const v = [...win.matchAll(V)].find((x) => Number(x[2]) !== 0);
        const h = [...win.matchAll(H)].find((x) => Number(x[2]) !== 0);
        if (v && h) offenders.push(`${rel}: ${v[0]} + ${h[0]}`);
      }
    }
    const unexpected = offenders.filter((o) => !ALLOW.has(o.split(":")[0]!));
    expect(unexpected).toEqual([]);
    // the allowlist may not rot: every entry is still a REAL registry row
    for (const [, surfaceId] of ALLOW) {
      expect(HUD_SURFACES.some((s) => s.id === surfaceId)).toBe(true);
    }
  });

  it("hudSurfaceStyle hands back the declared layer, not a magic number", () => {
    cover("hud-panel-cover");
    const rect = hudSurfaceRect("round-victory", DESKTOP, false, scene("resolution"))!;
    const style = hudSurfaceStyle("round-victory", rect);
    expect(style).toMatchObject({ position: "absolute", left: rect.x, top: rect.y, width: rect.w });
    expect(style.zIndex).toBe(hudSurface("round-victory").z);
    expect(HUD_Z.expanded).toBeLessThan(HUD_Z.screen);
  });
});
