/**
 * rr-10..rr-14 (round-report-layout, task #265): the round report's PIXELS.
 *
 * The expensive failure this project keeps hitting is a feature that is written,
 * tested and then covers something — or is covered by something — on the one
 * screen the owner actually looks at. So the card's box is a pure function and
 * this file proves, on every viewport in the #107 guard set and on BOTH pointer
 * kinds, that it:
 *
 *   • covers no HUD corner (so it needs no `hudLayout` panel row and displaces
 *     no chrome — `hudCornerAnchor` is the same predicate `hudPanelCovers` uses)
 *   • never enters the reserved build-stamp band (#245)
 *   • never touches Ready up or the prep clock (the two centre-bottom surfaces
 *     the intermission cannot afford to lose)
 *   • never touches the chrome that IS painted in the right column — the ☰
 *     relocated there by the left-docked shop, the gold readout and the
 *     equipment bar
 *   • stays inside the viewport
 *
 * …and that the ONE band it borrows is really free: the minimap's, which
 * `ui/hud/Minimap.tsx` does not paint during the intermission. That is a
 * cross-file assumption, so the last test READS that file. Delete the clause
 * and this goes red instead of the card silently landing on a live map.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { hudClusterRects } from "../hud/hudBottomCluster";
import {
  HUD_CORNERS,
  HUD_EDGE,
  HUD_STAMP_BAND,
  hudCornerAnchor,
  hudDisplacedRect,
  hudRectsOverlap,
  hudSlotRect,
  hudStampBandRect,
  type HudRect,
  type HudViewport,
} from "../hud/hudLayout";
import { PILL_FULL, PREP_CLOCK_BOTTOM, READY_BLOCK_BOTTOM, READY_BLOCK_HEIGHT } from "./prepCountdown";
import {
  MIN_RENDER_H,
  MIN_RENDER_W,
  ROUND_REPORT_DOCK_FREE_PHASE,
  ROUND_REPORT_DOCK_SLOT,
  ROUND_REPORT_MAX_W,
  SHOP_CARD_W_FRACTION,
  SHOP_CARD_W_MAX,
  roundReportPlacement,
  shopCardWidthPx,
} from "./roundReportLayout";

// One beacon per TODO row (docs/todo/round-report.md).
const CORNERS = "round-report-clears-corners";
const CHROME = "round-report-clears-chrome";
const RIGHT_COL = "round-report-clears-right-column";
const DOCK = "round-report-dock";
const BORROWED = "round-report-borrowed-band";

const readUi = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

/** The same viewport set the #107 / build-stamp guards use. */
const VIEWPORTS: readonly HudViewport[] = [
  { width: 375, height: 667 },
  { width: 667, height: 375 },
  { width: 812, height: 375 },
  { width: 852, height: 393 },
  { width: 844, height: 390 },
  { width: 780, height: 360 },
  { width: 1280, height: 720 },
  { width: 1546, height: 900 },
  { width: 1920, height: 1080 },
];

/** Ready up's block: centred, `bottom: READY_BLOCK_BOTTOM`, ~60px tall. */
function readyRect(vp: HudViewport): HudRect {
  const w = 180; // button + 「n/m ready」 counter, generous
  return {
    x: (vp.width - w) / 2,
    y: vp.height - READY_BLOCK_BOTTOM - READY_BLOCK_HEIGHT,
    w,
    h: READY_BLOCK_HEIGHT,
  };
}

/** The prep countdown pill in its NON-drafting position (centred, bottom 262). */
function clockRect(vp: HudViewport): HudRect {
  return {
    x: (vp.width - PILL_FULL.w) / 2,
    y: vp.height - PREP_CLOCK_BOTTOM - PILL_FULL.h,
    w: PILL_FULL.w,
    h: PILL_FULL.h,
  };
}

/**
 * The local champion's HP/MP plate — RESOLVED, not re-stated. It used to be a
 * hand-copy of `bottom: 128 / width: 260`; the plate now has no `bottom` of its
 * own (it is a flex row of ui/hud/BottomCluster), so this asks the same resolver
 * the shipped HUD lays out with. That is what stops the guard proving the card
 * clears a rectangle nothing paints.
 */
function barsRect(vp: HudViewport, touch = false): HudRect {
  return hudClusterRects(vp, touch, { resources: true, abilities: !touch }).resources!;
}

function inViewport(r: HudRect, vp: HudViewport): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= vp.width && r.y + r.h <= vp.height;
}

describe("the round report's box (rr-10..rr-14)", () => {
  it("covers no HUD corner on any viewport — so it needs no panel-registry row", () => {
    cover(CORNERS);
    const problems: string[] = [];
    for (const vp of VIEWPORTS) {
      for (const touch of [false, true]) {
        const { rect, dock, visible } = roundReportPlacement(vp, touch);
        if (!visible) continue;
        for (const corner of HUD_CORNERS) {
          const a = hudCornerAnchor(corner, vp);
          const hits = a.x >= rect.x && a.x <= rect.x + rect.w && a.y >= rect.y && a.y <= rect.y + rect.h;
          if (hits) {
            problems.push(
              `${vp.width}x${vp.height} touch=${touch} (${dock}): the card ${JSON.stringify(rect)} ` +
                `contains the ${corner} anchor — it would have to be declared in hudLayout's ` +
                `PANELS and every slot in that corner would have to yield`,
            );
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("either fits inside the viewport at a legible size, or is not painted at all", () => {
    cover(CORNERS);
    let shown = 0;
    for (const vp of VIEWPORTS) {
      for (const touch of [false, true]) {
        const { rect, dock, visible } = roundReportPlacement(vp, touch);
        if (!visible) continue; // no honest room (portrait) — the card renders null
        shown += 1;
        expect(inViewport(rect, vp), `${vp.width}x${vp.height} touch=${touch} (${dock})`).toBe(true);
        expect(rect.w).toBeGreaterThanOrEqual(MIN_RENDER_W);
        expect(rect.h).toBeGreaterThanOrEqual(MIN_RENDER_H);
      }
    }
    // non-vacuous: "hide it everywhere" must not be a passing answer
    expect(shown).toBeGreaterThanOrEqual(VIEWPORTS.length);
  });

  it("is painted on every LANDSCAPE viewport — hiding is the portrait-only escape", () => {
    cover(CORNERS);
    for (const vp of VIEWPORTS.filter((v) => v.width > v.height)) {
      for (const touch of [false, true]) {
        expect(
          roundReportPlacement(vp, touch).visible,
          `${vp.width}x${vp.height} touch=${touch}: the round report would not paint`,
        ).toBe(true);
      }
    }
    // …and the one case where it legitimately cannot: a 375px PORTRAIT phone,
    // where the shop card, the corner stacks and the champion's own HP bars
    // leave nothing. (That viewport also shows the rotate-me overlay.)
    expect(roundReportPlacement({ width: 375, height: 667 }, true).visible).toBe(false);
  });

  it("never enters the reserved build-stamp band (#245)", () => {
    cover(CHROME);
    for (const vp of VIEWPORTS) {
      for (const touch of [false, true]) {
        const { rect, visible } = roundReportPlacement(vp, touch);
        if (!visible) continue;
        expect(
          hudRectsOverlap(rect, hudStampBandRect(vp)),
          `${vp.width}x${vp.height} touch=${touch}: the card reaches into the build stamp's band`,
        ).toBe(false);
        // …and the gap is real, not a shared edge
        expect(rect.y + rect.h).toBeLessThanOrEqual(vp.height - HUD_STAMP_BAND);
      }
    }
  });

  it("never covers Ready up, the prep countdown or the player's own HP/MP bars", () => {
    cover(CHROME);
    const problems: string[] = [];
    for (const vp of VIEWPORTS) {
      for (const touch of [false, true]) {
        const { rect, dock, visible } = roundReportPlacement(vp, touch);
        if (!visible) continue;
        for (const [name, other] of [
          ["Ready up", readyRect(vp)],
          ["the prep clock", clockRect(vp)],
          // caught live at 844×390: the inset dock shares the lower-centre
          // strip with the champion's own resource bars.
          ["the HP/MP bars", barsRect(vp)],
        ] as const) {
          if (hudRectsOverlap(rect, other)) {
            problems.push(
              `${vp.width}x${vp.height} touch=${touch} (${dock}): the card ${JSON.stringify(rect)} ` +
                `covers ${name} ${JSON.stringify(other)}`,
            );
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("never covers the right-column chrome that IS painted in the intermission", () => {
    cover(RIGHT_COL);
    // The ☰ RELOCATES into the top-right column while the shop is docked left,
    // which makes that column taller here than in any other phase — the exact
    // case an eyeballed offset gets wrong.
    const problems: string[] = [];
    for (const vp of VIEWPORTS) {
      for (const touch of [false, true]) {
        const { rect, dock, visible } = roundReportPlacement(vp, touch);
        if (!visible) continue;
        const painted: ReadonlyArray<readonly [string, HudRect]> = [
          ["the relocated ☰", hudDisplacedRect("menu", vp, touch)],
          ["gold/level", hudSlotRect("gold-level", vp, touch)],
          ["the equipment bar", hudSlotRect("equipment", vp, touch)],
          ["the scoreboard", hudSlotRect("scoreboard", vp, touch)],
        ];
        for (const [name, other] of painted) {
          if (hudRectsOverlap(rect, other)) {
            problems.push(
              `${vp.width}x${vp.height} touch=${touch} (${dock}): the card ${JSON.stringify(rect)} ` +
                `covers ${name} ${JSON.stringify(other)}`,
            );
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("never covers the shop card it sits beside", () => {
    cover(CHROME);
    for (const vp of VIEWPORTS) {
      for (const touch of [false, true]) {
        const { rect, dock, visible } = roundReportPlacement(vp, touch);
        if (!visible) continue;
        const card: HudRect = { x: 0, y: 0, w: shopCardWidthPx(vp.width), h: vp.height };
        expect(
          hudRectsOverlap(rect, card),
          `${vp.width}x${vp.height} touch=${touch} (${dock}): the card overlaps the shop dock`,
        ).toBe(false);
      }
    }
  });

  it("docks at the EDGE on desktop and INSET on a landscape phone", () => {
    cover(DOCK);
    // desktop: the minimap's band is tall enough and low enough
    expect(roundReportPlacement({ width: 1280, height: 720 }, false).dock).toBe("edge");
    expect(roundReportPlacement({ width: 1920, height: 1080 }, false).dock).toBe("edge");
    // phone landscape: on coarse pointers the minimap re-homes to the top-left
    // and the equipment bar to the top-right, so the right EDGE has no hole
    expect(roundReportPlacement({ width: 844, height: 390 }, true).dock).toBe("inset");
    // …and a short DESKTOP window falls back for the same reason
    expect(roundReportPlacement({ width: 1280, height: 500 }, false).dock).toBe("inset");
  });

  it("the edge dock IS the minimap's reserved band, exactly", () => {
    cover(DOCK);
    const vp = { width: 1280, height: 720 };
    const { rect, css } = roundReportPlacement(vp, false);
    const gold = hudSlotRect("gold-level", vp, false);
    const equip = hudSlotRect("equipment", vp, false);
    // between the gold readout below and the equipment bar above
    expect(rect.y + rect.h).toBeLessThanOrEqual(gold.y);
    expect(rect.y).toBeGreaterThanOrEqual(equip.y + equip.h);
    expect(css.right).toBe(HUD_EDGE);
    expect(css.left).toBeUndefined();
  });

  it("the width stays off the champion — capped, never the whole free half", () => {
    cover(DOCK);
    for (const vp of VIEWPORTS) {
      for (const touch of [false, true]) {
        const { rect, visible } = roundReportPlacement(vp, touch);
        if (!visible) continue;
        expect(rect.w).toBeLessThanOrEqual(ROUND_REPORT_MAX_W);
        // the champion's stand projects to ~67 % of the width
        // (render/intermission/layout.ts CHAMPION_STAND); an edge-docked card
        // must start well right of that.
        if (roundReportPlacement(vp, touch).dock === "edge") {
          expect(rect.x).toBeGreaterThan(vp.width * 0.67);
        }
      }
    }
  });

  it("expands only where there is room for the stat chips", () => {
    cover(DOCK);
    expect(roundReportPlacement({ width: 1280, height: 720 }, false).density).toBe("expanded");
    expect(roundReportPlacement({ width: 844, height: 390 }, true).density).toBe("compact");
  });
});

describe("the mirrored constants cannot rot (rr-10..rr-14)", () => {
  it("the shop-card width mirror still matches MerchantShop's CARD_WIDTH", () => {
    cover(BORROWED);
    const src = readUi("./MerchantShop.tsx");
    const m = /CARD_WIDTH\s*=\s*"min\((\d+)vw,\s*(\d+)px\)"/.exec(src);
    expect(m, "MerchantShop.CARD_WIDTH changed shape — re-point this mirror").not.toBeNull();
    expect(Number(m![1]) / 100).toBe(SHOP_CARD_W_FRACTION);
    expect(Number(m![2])).toBe(SHOP_CARD_W_MAX);
    expect(shopCardWidthPx(1000)).toBe(450);
    expect(shopCardWidthPx(2000)).toBe(SHOP_CARD_W_MAX);
  });

  it("GUARD: the borrowed band is really free — the minimap still hides in the intermission", () => {
    cover(BORROWED);
    // The edge dock paints inside the slot the minimap RESERVES. That is only
    // safe because the map is not drawn during the shop phase. Read it, do not
    // assume it: if this clause is ever relaxed the card starts covering a live
    // minimap and nothing else in the suite would notice.
    const src = readUi("../hud/Minimap.tsx");
    const visible = /const\s+visible\s*=[\s\S]{0,240}?;/.exec(src);
    expect(
      visible,
      "could not find Minimap's `visible` gate — re-point this guard rather than deleting it",
    ).not.toBeNull();
    expect(
      visible![0],
      `Minimap no longer excludes the "${ROUND_REPORT_DOCK_FREE_PHASE}" phase, so the ` +
        `"${ROUND_REPORT_DOCK_SLOT}" band the round report borrows is NOT free any more — ` +
        "move the card or re-derive its dock",
    ).toContain(`phase !== "${ROUND_REPORT_DOCK_FREE_PHASE}"`);
  });
});
