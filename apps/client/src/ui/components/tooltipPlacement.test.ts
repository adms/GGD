/**
 * hud-tooltip-placement: the pure floating-tooltip math. Asserts the two core
 * guarantees — the box never covers the anchor/cursor (offset onto one side)
 * and it stays inside the viewport (edge-flip + horizontal clamp).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  computeTooltipPlacement,
  TOOLTIP_GAP,
  TOOLTIP_MARGIN,
  type AnchorRect,
  type TooltipPlacement,
} from "./tooltipPlacement";

const VIEWPORT = { width: 1280, height: 800 };
const TIP = { width: 240, height: 90 };

/** the tooltip box must not intersect the anchor's vertical band (cursor-safe). */
function clearsAnchor(p: TooltipPlacement, a: AnchorRect, tipH: number): boolean {
  if (p.side === "top") return p.top + tipH <= a.y; // fully above
  return p.top >= a.y + a.height; // fully below
}

/** the box must sit inside the viewport minus the margin. */
function onScreen(p: TooltipPlacement, tip: { width: number; height: number }): boolean {
  return (
    p.left >= TOOLTIP_MARGIN &&
    p.left + tip.width <= VIEWPORT.width - TOOLTIP_MARGIN &&
    p.top >= TOOLTIP_MARGIN &&
    p.top + tip.height <= VIEWPORT.height - TOOLTIP_MARGIN
  );
}

describe("computeTooltipPlacement (hud-tooltip-placement)", () => {
  it("defaults above the anchor, centered, clear of the cursor", () => {
    cover("hud-tooltip-placement");
    const anchor: AnchorRect = { x: 600, y: 500, width: 52, height: 52 };
    const p = computeTooltipPlacement({ anchor, tooltip: TIP, viewport: VIEWPORT });
    expect(p.side).toBe("top");
    // sits gap-px above the anchor top
    expect(p.top).toBe(anchor.y - TOOLTIP_GAP - TIP.height);
    // centered on the anchor
    expect(p.left).toBeCloseTo(anchor.x + anchor.width / 2 - TIP.width / 2, 6);
    expect(clearsAnchor(p, anchor, TIP.height)).toBe(true);
    expect(onScreen(p, TIP)).toBe(true);
  });

  it("flips below when the anchor hugs the top edge", () => {
    cover("hud-tooltip-placement");
    const anchor: AnchorRect = { x: 600, y: 6, width: 52, height: 52 };
    const p = computeTooltipPlacement({ anchor, tooltip: TIP, viewport: VIEWPORT });
    expect(p.side).toBe("bottom");
    expect(p.top).toBe(anchor.y + anchor.height + TOOLTIP_GAP);
    expect(clearsAnchor(p, anchor, TIP.height)).toBe(true);
    expect(onScreen(p, TIP)).toBe(true);
  });

  it("keeps the preferred top side when it fits even with prefer=bottom flipping", () => {
    cover("hud-tooltip-placement");
    // anchor hugs the BOTTOM edge, caller prefers bottom → must flip up
    const anchor: AnchorRect = { x: 600, y: 748, width: 52, height: 52 };
    const p = computeTooltipPlacement({ anchor, tooltip: TIP, viewport: VIEWPORT, prefer: "bottom" });
    expect(p.side).toBe("top");
    expect(clearsAnchor(p, anchor, TIP.height)).toBe(true);
    expect(onScreen(p, TIP)).toBe(true);
  });

  it("clamps horizontally against the left and right edges", () => {
    cover("hud-tooltip-placement");
    // near the RIGHT edge → clamped so the right side stays on-screen
    const right = computeTooltipPlacement({
      anchor: { x: 1260, y: 500, width: 40, height: 40 },
      tooltip: TIP,
      viewport: VIEWPORT,
    });
    expect(right.left).toBe(VIEWPORT.width - TOOLTIP_MARGIN - TIP.width);
    expect(onScreen(right, TIP)).toBe(true);
    // near the LEFT edge → clamped to the margin
    const left = computeTooltipPlacement({
      anchor: { x: 4, y: 500, width: 40, height: 40 },
      tooltip: TIP,
      viewport: VIEWPORT,
    });
    expect(left.left).toBe(TOOLTIP_MARGIN);
    expect(onScreen(left, TIP)).toBe(true);
  });

  it("never overlaps the anchor even when neither side has full room", () => {
    cover("hud-tooltip-placement");
    // tiny viewport, tall tooltip: neither side fits, but the box still clears
    // the anchor (never under the pointer) on the roomier side.
    const tinyVp = { width: 400, height: 300 };
    const tallTip = { width: 200, height: 260 };
    const anchor: AnchorRect = { x: 180, y: 120, width: 40, height: 40 };
    const p = computeTooltipPlacement({ anchor, tooltip: tallTip, viewport: tinyVp });
    // more room above (120) than below (300-160=140)? below is roomier → bottom
    expect(clearsAnchor(p, anchor, tallTip.height)).toBe(true);
  });
});
