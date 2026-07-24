/**
 * padFocusNav — the pure pad-drives-the-menus core (task #197). Spatial pick +
 * the edge/repeat reader, against plain rects and injected fake pads.
 */
import { describe, it, expect } from "vitest";
import type { PadInfo } from "./gamepadDetect";
import {
  focusNavActive,
  initialFocusIndex,
  NAV_ACTIVATE_BTN,
  NAV_BACK_BTN,
  NAV_DPAD,
  NAV_INITIAL_DELAY_MS,
  NAV_REPEAT_MS,
  PadMenuNav,
  pickActiveScope,
  pickSpatial,
  readNavDirection,
  type FocusRect,
} from "./padFocusNav";

const rect = (x: number, y: number, w = 40, h = 20): FocusRect => ({ x, y, w, h });

function pad(axes: number[] = [0, 0, 0, 0], pressed: number[] = []): PadInfo {
  return {
    connected: true,
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })),
    id: "pad",
    mapping: "standard",
    index: 0,
  };
}

describe("pickSpatial — roving focus geometry", () => {
  it("moves to the nearest neighbour in the requested direction", () => {
    // a 2x2 grid, focus at top-left (index 0)
    const grid = [rect(0, 0), rect(100, 0), rect(0, 100), rect(100, 100)];
    expect(pickSpatial(grid[0]!, grid, "right")).toBe(1);
    expect(pickSpatial(grid[0]!, grid, "down")).toBe(2);
    expect(pickSpatial(grid[3]!, grid, "left")).toBe(2);
    expect(pickSpatial(grid[3]!, grid, "up")).toBe(1);
  });

  it("returns -1 when nothing lies that way (edge of the grid)", () => {
    const row = [rect(0, 0), rect(100, 0), rect(200, 0)];
    expect(pickSpatial(row[0]!, row, "left")).toBe(-1);
    expect(pickSpatial(row[2]!, row, "right")).toBe(-1);
    expect(pickSpatial(row[0]!, row, "up")).toBe(-1);
  });

  it("prefers the same row over a closer element in another row", () => {
    const from = rect(0, 100);
    // a slightly-closer element one row up vs the true right-neighbour in-row
    const candidates = [rect(60, 40), rect(80, 100)];
    expect(pickSpatial(from, candidates, "right")).toBe(1); // in-row wins
  });

  it("never picks the element it started on", () => {
    const from = rect(0, 0);
    expect(pickSpatial(from, [from], "right")).toBe(-1);
  });
});

describe("focusNavActive — menu-vs-champion ownership of the pad", () => {
  it("owns the pad on every non-match screen", () => {
    for (const screen of ["auth", "lobby", "boot"]) {
      expect(focusNavActive({ screen, phase: "combat", hasScope: false })).toBe(true);
    }
  });

  it("stays OUT of live combat so the pad drives the champion", () => {
    expect(focusNavActive({ screen: "match", phase: "combat", hasScope: false })).toBe(false);
    expect(focusNavActive({ screen: "match", phase: "resolution", hasScope: false })).toBe(false);
  });

  it("owns the pad in menu-shaped match phases", () => {
    for (const phase of ["champSelect", "intermission", "matchEnd"]) {
      expect(focusNavActive({ screen: "match", phase, hasScope: false })).toBe(true);
    }
  });

  it("a modal/overlay scope captures the pad even mid-combat (pause/settings)", () => {
    expect(focusNavActive({ screen: "match", phase: "combat", hasScope: true })).toBe(true);
  });
});

describe("pickActiveScope — the top-most modal wins", () => {
  it("returns -1 when no modal scope is present", () => {
    expect(pickActiveScope([])).toBe(-1);
  });

  it("prefers the highest priority, breaking ties by document order (last on top)", () => {
    expect(pickActiveScope([{ priority: 0, order: 0 }, { priority: 10, order: 1 }])).toBe(1);
    // a later-painted sibling at equal priority is the one on top
    expect(pickActiveScope([{ priority: 5, order: 3 }, { priority: 5, order: 9 }])).toBe(1);
  });
});

describe("initialFocusIndex — where the first nudge lands", () => {
  it("picks the top-most, then left-most element", () => {
    const rects = [rect(200, 200), rect(0, 0), rect(100, 0)];
    expect(initialFocusIndex(rects)).toBe(1); // (0,0) beats (100,0) on x, and both beat (200,200)
  });
});

describe("readNavDirection — stick + d-pad, dominant axis", () => {
  it("reads the left stick past the deadzone", () => {
    expect(readNavDirection(pad([0.9, 0, 0, 0]))).toBe("right");
    expect(readNavDirection(pad([-0.9, 0, 0, 0]))).toBe("left");
    expect(readNavDirection(pad([0, 0.9, 0, 0]))).toBe("down");
    expect(readNavDirection(pad([0, -0.9, 0, 0]))).toBe("up");
    expect(readNavDirection(pad([0.2, 0.1, 0, 0]))).toBeNull(); // inside deadzone
  });

  it("reads the d-pad even with a dead stick (non-standard-mapping resilience)", () => {
    expect(readNavDirection(pad([0, 0, 0, 0], [NAV_DPAD.down]))).toBe("down");
    expect(readNavDirection(pad([0, 0, 0, 0], [NAV_DPAD.left]))).toBe("left");
  });

  it("resolves a diagonal to the larger axis", () => {
    expect(readNavDirection(pad([0.9, 0.6, 0, 0]))).toBe("right");
    expect(readNavDirection(pad([0.6, 0.9, 0, 0]))).toBe("down");
  });
});

describe("PadMenuNav — edges + auto-repeat", () => {
  it("A is one activate per press, not one per frame", () => {
    const nav = new PadMenuNav();
    expect(nav.read([pad([0, 0], [NAV_ACTIVATE_BTN])], 0)).toEqual(["activate"]);
    expect(nav.read([pad([0, 0], [NAV_ACTIVATE_BTN])], 16)).toEqual([]); // still held
    expect(nav.read([pad([0, 0])], 32)).toEqual([]); // released
    expect(nav.read([pad([0, 0], [NAV_ACTIVATE_BTN])], 48)).toEqual(["activate"]); // re-press
  });

  it("B emits back on its own edge", () => {
    const nav = new PadMenuNav();
    expect(nav.read([pad([0, 0], [NAV_BACK_BTN])], 0)).toEqual(["back"]);
    expect(nav.read([pad([0, 0], [NAV_BACK_BTN])], 16)).toEqual([]);
  });

  it("a held direction fires once, waits the initial delay, then repeats", () => {
    const nav = new PadMenuNav();
    expect(nav.read([pad([0, 0.9])], 0)).toEqual(["down"]); // fresh press: immediate
    expect(nav.read([pad([0, 0.9])], 100)).toEqual([]); // inside the initial delay
    expect(nav.read([pad([0, 0.9])], NAV_INITIAL_DELAY_MS)).toEqual(["down"]); // first repeat
    expect(nav.read([pad([0, 0.9])], NAV_INITIAL_DELAY_MS + 10)).toEqual([]);
    expect(nav.read([pad([0, 0.9])], NAV_INITIAL_DELAY_MS + NAV_REPEAT_MS)).toEqual(["down"]);
  });

  it("changing direction re-fires immediately (no leftover delay)", () => {
    const nav = new PadMenuNav();
    expect(nav.read([pad([0, 0.9])], 0)).toEqual(["down"]);
    expect(nav.read([pad([0.9, 0])], 50)).toEqual(["right"]); // new dir, immediate
  });

  it("releasing the stick clears the repeat latch", () => {
    const nav = new PadMenuNav();
    nav.read([pad([0, 0.9])], 0);
    expect(nav.read([pad([0, 0])], 20)).toEqual([]); // centred → nothing
    expect(nav.read([pad([0, 0.9])], 40)).toEqual(["down"]); // fresh press again
  });

  it("no pad → no events, and state resets", () => {
    const nav = new PadMenuNav();
    nav.read([pad([0, 0], [NAV_ACTIVATE_BTN])], 0);
    expect(nav.read([null], 16)).toEqual([]);
    // after a gap, a held A reads as a fresh press again
    expect(nav.read([pad([0, 0], [NAV_ACTIVATE_BTN])], 32)).toEqual(["activate"]);
  });
});
