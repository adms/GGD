/**
 * audio: the EXPANDED audio cluster's geometry.
 *
 * The regression this locks out is task #42's, one level up: a piece of HUD
 * chrome that grows on interaction and lands on its neighbours. The cluster is
 * <body>-portaled and therefore outside every flex/stacking parent, so the only
 * thing standing between an open slider tray and the scoreboard above it is
 * arithmetic — which is what this file checks.
 *
 * Two properties, at every supported viewport, with the tray FULLY OPEN:
 *   1. the expanded cluster stays inside the vertical band its HUD slot
 *      declares, so it is disjoint from every other slot in the corner (two
 *      rectangles disjoint on one axis are disjoint);
 *   2. it stays inside the viewport — its left edge clears the left safe-area
 *      inset, and its bottom edge clears the viewport height.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  AUDIO_BTN_SIZE,
  AUDIO_CELL_W,
  AUDIO_CLUSTER_BUTTONS,
  audioButtonsWidth,
  audioClusterFits,
  audioClusterGeom,
  audioTrayMaxWidth,
  audioTrayWidth,
  bandsOverlap,
} from "./audioClusterLayout";
import {
  HUD_EDGE,
  HUD_TOUCH_TARGET,
  hudSlotBand,
  hudSlotHeight,
  hudSlotOffset,
  hudSlotsInCorner,
  type HudSlotId,
} from "./hud/hudLayout";

/** Every cell the tray can show: master + music + sfx + cursor size. */
const MAX_CELLS = 4;

interface Viewport {
  name: string;
  vw: number;
  vh: number;
  /** landscape safe-area insets (notch on one side, indicator on the other) */
  insetLeft: number;
  insetRight: number;
  insetTop: number;
  touch: boolean;
}

const VIEWPORTS: Viewport[] = [
  // iPhone SE / 8 landscape — the narrowest supported screen, no insets
  { name: "667x375", vw: 667, vh: 375, insetLeft: 0, insetRight: 0, insetTop: 0, touch: true },
  // iPhone X..13 landscape — 44px notch inset on both sides
  { name: "812x375", vw: 812, vh: 375, insetLeft: 44, insetRight: 44, insetTop: 0, touch: true },
  // iPhone 14/15 Pro landscape — the wider Dynamic Island inset
  { name: "852x393", vw: 852, vh: 393, insetLeft: 59, insetRight: 59, insetTop: 0, touch: true },
  { name: "desktop", vw: 1280, vh: 800, insetLeft: 0, insetRight: 0, insetTop: 0, touch: false },
];

/** The cluster as the component lays it out in a match, for a viewport. */
function expandedGeom(v: Viewport, cells = MAX_CELLS): ReturnType<typeof audioClusterGeom> {
  return audioClusterGeom({
    vw: v.vw,
    top: v.insetTop + hudSlotOffset("audio-toggle", v.touch),
    height: hudSlotHeight("audio-toggle", v.touch),
    right: v.insetRight + HUD_EDGE,
    cells,
  });
}

describe("audio cluster geometry: widths (audio-toggle-panel-layout)", () => {
  it("derives the tray/button widths from the declared cell + button sizes", () => {
    cover("audio-toggle-panel-layout");
    expect(AUDIO_BTN_SIZE).toBe(HUD_TOUCH_TARGET); // the buttons ARE the touch target
    expect(audioButtonsWidth(0)).toBe(0);
    expect(audioButtonsWidth(1)).toBe(AUDIO_BTN_SIZE);
    expect(audioButtonsWidth(3)).toBe(3 * AUDIO_BTN_SIZE + 2 * 6);
    // collapsed = no tray at all
    expect(audioTrayWidth(0)).toBe(0);
    // each extra cell costs exactly one cell + one gap
    expect(audioTrayWidth(4) - audioTrayWidth(3)).toBe(AUDIO_CELL_W + 6);
    expect(audioTrayWidth(4)).toBeGreaterThan(audioTrayWidth(3));
  });

  it("collapsing removes the tray entirely (the cluster is the buttons)", () => {
    cover("audio-toggle-panel-layout");
    const g = expandedGeom(VIEWPORTS[0]!, 0);
    expect(g.trayWidth).toBe(0);
    expect(g.width).toBe(audioButtonsWidth(AUDIO_CLUSTER_BUTTONS));
  });
});

describe("audio cluster geometry: stays in its HUD band (audio-toggle-panel-layout)", () => {
  it("THE GUARD: the OPEN tray never leaves the audio-toggle slot's band", () => {
    cover("audio-toggle-panel-layout");
    for (const v of VIEWPORTS) {
      const band = hudSlotBand("audio-toggle", v.touch);
      const g = expandedGeom(v);
      expect(g.top, v.name).toBe(band.start + v.insetTop);
      expect(g.bottom - v.insetTop, v.name).toBe(band.end);
      // opening changes the WIDTH only — the band is untouched
      expect(g.bottom - g.top, v.name).toBe(hudSlotHeight("audio-toggle", v.touch));
    }
  });

  it("THE GUARD: the OPEN tray is disjoint from every other top-right slot", () => {
    cover("audio-toggle-panel-layout");
    const clashes: string[] = [];
    for (const v of VIEWPORTS) {
      const g = expandedGeom(v);
      const self = { start: g.top - v.insetTop, end: g.bottom - v.insetTop };
      for (const slot of hudSlotsInCorner("top-right")) {
        if (slot.id === "audio-toggle") continue;
        const other = hudSlotBand(slot.id as HudSlotId, v.touch);
        // vertical disjointness ⇒ the rectangles cannot intersect, whatever
        // width either one grows to
        if (bandsOverlap(self, other)) clashes.push(`${v.name}: audio tray ∩ ${slot.id}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it("sanity-checks the sweep (bandsOverlap really detects a collision)", () => {
    cover("audio-toggle-panel-layout");
    expect(bandsOverlap({ start: 0, end: 10 }, { start: 9, end: 20 })).toBe(true);
    expect(bandsOverlap({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false);
    // …and that the slots we sweep against are really there
    expect(hudSlotsInCorner("top-right").map((s) => s.id)).toContain("scoreboard");
    expect(hudSlotsInCorner("top-right").map((s) => s.id)).toContain("settings");
  });
});

describe("audio cluster geometry: stays in the viewport (audio-toggle-panel-layout)", () => {
  it("the OPEN tray fits every supported viewport, insets included", () => {
    cover("audio-toggle-panel-layout");
    const tooWide: string[] = [];
    for (const v of VIEWPORTS) {
      const g = expandedGeom(v);
      if (!audioClusterFits(g, v.insetLeft)) {
        tooWide.push(`${v.name}: left ${g.left} < inset ${v.insetLeft}`);
      }
      expect(g.bottom, v.name).toBeLessThanOrEqual(v.vh);
      expect(g.right, v.name).toBeGreaterThanOrEqual(v.insetRight);
    }
    expect(tooWide).toEqual([]);
  });

  it("the max-width clamp leaves room for the full tray at every viewport", () => {
    cover("audio-toggle-panel-layout");
    for (const v of VIEWPORTS) {
      const room = audioTrayMaxWidth({
        vw: v.vw,
        right: v.insetRight + HUD_EDGE,
        insetLeft: v.insetLeft,
      });
      expect(room, v.name).toBeGreaterThanOrEqual(audioTrayWidth(MAX_CELLS));
    }
  });

  it("a viewport too narrow for the tray clamps it instead of wrapping", () => {
    cover("audio-toggle-panel-layout");
    // a phone held in PORTRAIT (RotateOverlay is up, but the portal is above it)
    const room = audioTrayMaxWidth({ vw: 375, right: HUD_EDGE, insetLeft: 0 });
    expect(room).toBeLessThan(audioTrayWidth(MAX_CELLS)); // would not fit …
    expect(room).toBeGreaterThan(0); // … so the tray scrolls inside `room`
    // and the clamp can never go negative on an absurdly small viewport
    expect(audioTrayMaxWidth({ vw: 100, right: HUD_EDGE, insetLeft: 0 })).toBe(0);
  });
});
