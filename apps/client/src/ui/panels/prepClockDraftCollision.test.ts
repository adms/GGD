import { describe, it, expect } from "vitest";
import { PREP_CLOCK_BOTTOM, prepClockRect, draftPanelRect, draftCardGridRect } from "./prepCountdown";

/**
 * prep-clock-clears-draft — the guard for 「倒數擋到了」.
 *
 * The countdown pill is deliberately the ONE surface allowed above the 三選一
 * focus scrim (intermissionLayout.ts priority 2), and that call is right: a
 * scrim that hides the deadline demands an answer while hiding how long there
 * is to give it. The mistake was the next sentence — "costs the focus surface
 * nothing: this pill is pointerEvents:none". pointerEvents:none returns the
 * draft's CLICKS. It does not return its PIXELS. Centred at bottom:262 over a
 * vertically-centred 460px panel, the pill covered the middle weapon card's
 * name and description in a real match.
 *
 * Nothing caught it because every check in this area asserted z-order and
 * pointer-events, never geometry. So this one intersects the two rectangles.
 */
const overlaps = (a: ReturnType<typeof prepClockRect>, b: ReturnType<typeof draftPanelRect>) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

// Viewports the family actually plays on, plus the phone-landscape case #151
// established as the tight one.
const VIEWPORTS: ReadonlyArray<readonly [number, number, string]> = [
  [1920, 1080, "desktop 1080p"],
  [1440, 900, "laptop"],
  [1280, 800, "small laptop"],
  [844, 390, "iPhone landscape"],
  [812, 375, "iPhone SE landscape"],
];

// The panel grows with its offer count; the screenshot's silver+weapon double
// row is the tall case. Cover a range rather than one measured number.
const PANEL_HEIGHTS = [240, 320, 420, 460];

describe("prep clock clears the draft panel (prep-clock-clears-draft)", () => {
  for (const [vw, vh, label] of VIEWPORTS) {
    for (const h of PANEL_HEIGHTS) {
      it(`${label} · panel ${h}px: the pill does not cover the cards`, () => {
        const cards = draftCardGridRect(vw, vh, Math.min(h, vh));
        const pill = prepClockRect(vw, vh, true, Math.min(h, vh));
        expect(
          overlaps(pill, cards),
          `pill ${JSON.stringify(pill)} covers the card grid ${JSON.stringify(cards)}`,
        ).toBe(false);
        // and it must still be ON SCREEN — moving it off the top would "fix"
        // the overlap by reintroducing the thing priority 2 forbids.
        expect(pill.top).toBeGreaterThanOrEqual(0);
        expect(pill.bottom).toBeLessThanOrEqual(vh);
      });
    }
  }

  it("the OLD bottom-anchored position really did overlap — the bug was real", () => {
    // Reproduces the reported case rather than trusting the description: same
    // geometry, pill left where it used to be.
    const vw = 1280;
    const vh = 800;
    const cards = draftCardGridRect(vw, vh, 420);
    const old = { top: vh - PREP_CLOCK_BOTTOM - 56, bottom: vh - PREP_CLOCK_BOTTOM, left: (vw - 150) / 2, right: (vw + 150) / 2 };
    expect(overlaps(old, cards), "the old position must cover the cards, or this guard proves nothing").toBe(true);
  });

  it("outside a draft the pill keeps its bottom-centre home", () => {
    const pill = prepClockRect(1280, 800, false);
    expect(pill.bottom).toBe(800 - PREP_CLOCK_BOTTOM);
  });
});
