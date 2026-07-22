/**
 * settle-scroll-center / settle-scroll-skip / settle-scroll-timeline /
 * settle-scroll-cancel / settle-scroll-reduced / settle-scroll-once:
 * the post-match auto-scroll (task #36). Node env, no DOM — the hook is a thin
 * shell over these, so the centering math, end clamping, skip-when-visible,
 * hold→ease timeline, cancel-on-input and the once-per-match guard are all
 * exercised as pure functions / an injected-clock driver.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  AutoScrollRun,
  DEFAULT_MAX_DURATION_MS,
  DEFAULT_MIN_DURATION_MS,
  LEADERBOARD_MAX_DURATION_MS,
  OnceGuard,
  centeredScrollTop,
  easeInOutCubic,
  isRowFullyVisible,
  isScrollCancelKey,
  maxScrollTop,
  planRowAutoScroll,
  runAutoScroll,
  scrollDurationMs,
  shouldCancelForEvent,
  type AnimateScrollPlan,
  type AutoScrollTarget,
  type RowScrollGeometry,
  type ScrollEventListener,
} from "./autoScroll";

// A 12-player settlement board: 36px rows in a 200px window (≈5.5 rows visible).
const ROW_H = 36;
const ROWS = 12;
const VIEW_H = 200;

function boardGeometry(rowIndex: number, over: Partial<RowScrollGeometry> = {}): RowScrollGeometry {
  return {
    rowTop: rowIndex * ROW_H,
    rowHeight: ROW_H,
    viewportHeight: VIEW_H,
    contentHeight: ROWS * ROW_H,
    ...over,
  };
}

// ------------------------------------------------------------------ fakes ---

/** Structural stand-in for the scrollable <div> (and for `window`). */
class FakeList implements AutoScrollTarget {
  scrollTop = 0;
  readonly listeners = new Map<string, Set<ScrollEventListener>>();

  addEventListener(type: string, listener: ScrollEventListener): void {
    const set = this.listeners.get(type) ?? new Set<ScrollEventListener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: ScrollEventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: unknown = {}): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event as Event);
  }

  get listenerCount(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }
}

interface Harness {
  list: FakeList;
  keys: FakeList;
  /** run the animation forward to `t` ms, stepping one frame every 16 ms */
  advanceTo(t: number): void;
  arrived: () => number;
  cancelled: () => number;
  stop: () => void;
}

function drive(plan: AnimateScrollPlan): Harness {
  const list = new FakeList();
  const keys = new FakeList();
  let now = 0;
  let pending: ((t: number) => void) | null = null;
  let handle = 0;
  let arrived = 0;
  let cancelled = 0;

  const stop = runAutoScroll(list, plan, {
    now: () => now,
    requestFrame: (cb) => {
      pending = cb;
      return ++handle;
    },
    cancelFrame: () => {
      pending = null;
    },
    keyTarget: keys,
    onArrive: () => {
      arrived += 1;
    },
    onCancel: () => {
      cancelled += 1;
    },
  });

  return {
    list,
    keys,
    advanceTo(t: number) {
      while (now < t) {
        now = Math.min(t, now + 16);
        const cb = pending;
        pending = null;
        cb?.(now);
      }
    },
    arrived: () => arrived,
    cancelled: () => cancelled,
    stop,
  };
}

// --------------------------------------------------------------- centering ---

describe("target offset math (settle-scroll-center)", () => {
  it("centers the row in the viewport", () => {
    cover("settle-scroll-center");
    // row 6 spans 216..252 in a 200px window → centered at 216+18-100 = 134
    expect(centeredScrollTop(boardGeometry(6))).toBe(134);
    expect(maxScrollTop(boardGeometry(0))).toBe(ROWS * ROW_H - VIEW_H); // 232
  });

  it("clamps at the FIRST row — rank 1 never scrolls above the top", () => {
    cover("settle-scroll-center");
    expect(centeredScrollTop(boardGeometry(0))).toBe(0);
    expect(centeredScrollTop(boardGeometry(1))).toBe(0); // ideal is negative → clamped
  });

  it("clamps at the LAST row — the board never scrolls past its end", () => {
    cover("settle-scroll-center");
    const last = boardGeometry(ROWS - 1);
    expect(centeredScrollTop(last)).toBe(maxScrollTop(last)); // 232, not 314
    // a list that does not overflow has exactly one legal offset
    const short = boardGeometry(2, { contentHeight: VIEW_H - 20 });
    expect(maxScrollTop(short)).toBe(0);
    expect(centeredScrollTop(short)).toBe(0);
  });

  it("scales the duration with distance and clamps both ends", () => {
    cover("settle-scroll-center");
    expect(scrollDurationMs(0)).toBe(DEFAULT_MIN_DURATION_MS);
    expect(scrollDurationMs(60)).toBe(DEFAULT_MIN_DURATION_MS); // short hop → floor
    expect(scrollDurationMs(100000)).toBe(DEFAULT_MAX_DURATION_MS); // huge → ceiling
    const near = scrollDurationMs(700);
    const far = scrollDurationMs(900);
    expect(far).toBeGreaterThan(near); // monotonic in between
    expect(near).toBeGreaterThanOrEqual(DEFAULT_MIN_DURATION_MS);
    expect(far).toBeLessThanOrEqual(DEFAULT_MAX_DURATION_MS);
    // the (much taller) post-match ladder gets a 3 s cap, still bounded
    expect(scrollDurationMs(100000, { maxMs: LEADERBOARD_MAX_DURATION_MS })).toBe(
      LEADERBOARD_MAX_DURATION_MS,
    );
  });

  it("eases in and out (no linear crawl, exact endpoints)", () => {
    cover("settle-scroll-center");
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 6);
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1); // slow start
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9); // slow stop
    expect(easeInOutCubic(-2)).toBe(0); // clamped
    expect(easeInOutCubic(9)).toBe(1);
  });
});

// -------------------------------------------------------- skip when visible ---

describe("skip when the row is already visible (settle-scroll-skip)", () => {
  it("a top-rank row inside the first screenful never scrolls", () => {
    cover("settle-scroll-skip");
    const g = boardGeometry(2); // 72..108, inside 0..200
    expect(isRowFullyVisible(g, 0)).toBe(true);
    const plan = planRowAutoScroll(g);
    expect(plan.kind).toBe("skip");
    expect(plan.kind === "skip" && plan.scrollTop).toBe(0);
  });

  it("a small list that does not overflow never scrolls", () => {
    cover("settle-scroll-skip");
    const g: RowScrollGeometry = { rowTop: 108, rowHeight: ROW_H, viewportHeight: 400, contentHeight: 144 };
    expect(planRowAutoScroll(g).kind).toBe("skip");
  });

  it("a row past the fold DOES scroll (partial visibility is not enough)", () => {
    cover("settle-scroll-skip");
    const partial = boardGeometry(5); // 180..216 — bottom edge is cut off at 200
    expect(isRowFullyVisible(partial, 0)).toBe(false);
    const plan = planRowAutoScroll(partial);
    expect(plan.kind).toBe("animate");
    expect(plan.kind === "animate" && plan.to).toBe(centeredScrollTop(partial));
    expect(plan.kind === "animate" && plan.from).toBe(0); // pinned at rank 1
  });
});

// ------------------------------------------------------------- the timeline ---

describe("hold at rank 1 → eased travel → centered (settle-scroll-timeline)", () => {
  it("holds at the top, then eases down and lands exactly centered", () => {
    cover("settle-scroll-timeline");
    const plan = planRowAutoScroll(boardGeometry(ROWS - 1), { holdMs: 900 });
    expect(plan.kind).toBe("animate");
    if (plan.kind !== "animate") return;
    expect(plan.holdMs).toBe(900);
    expect(plan.durationMs).toBeGreaterThanOrEqual(DEFAULT_MIN_DURATION_MS);
    expect(plan.durationMs).toBeLessThanOrEqual(DEFAULT_MAX_DURATION_MS);

    const h = drive(plan);
    expect(h.list.scrollTop).toBe(plan.from); // pinned before the first frame

    h.advanceTo(500); // still inside the hold
    expect(h.list.scrollTop).toBe(plan.from);
    expect(h.arrived()).toBe(0);

    h.advanceTo(plan.holdMs + plan.durationMs / 2); // mid-travel
    expect(h.list.scrollTop).toBeGreaterThan(plan.from);
    expect(h.list.scrollTop).toBeLessThan(plan.to);

    h.advanceTo(plan.holdMs + plan.durationMs + 32); // arrived
    expect(h.list.scrollTop).toBe(plan.to);
    expect(h.arrived()).toBe(1);
    expect(h.list.listenerCount).toBe(0); // listeners released
    expect(h.keys.listenerCount).toBe(0);

    h.advanceTo(20000); // nothing keeps running afterwards
    expect(h.arrived()).toBe(1);
    expect(h.list.scrollTop).toBe(plan.to);
  });

  it("the run reports its phases and ignores frames after it is over", () => {
    cover("settle-scroll-timeline");
    const run = new AutoScrollRun({ kind: "animate", from: 0, to: 100, holdMs: 100, durationMs: 200 });
    expect(run.phase).toBe("idle");
    expect(run.frame(0)).toBeNull(); // not started
    run.start(1000);
    run.start(1000); // idempotent
    expect(run.totalMs).toBe(300);
    expect(run.frame(1050)).toBe(0);
    expect(run.phase).toBe("holding");
    const mid = run.frame(1200);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
    expect(run.frame(1300)).toBe(100);
    expect(run.arrived).toBe(true);
    expect(run.frame(1400)).toBeNull();
    run.cancel(); // cancelling after arrival does not rewrite history
    expect(run.phase).toBe("arrived");
  });
});

// ------------------------------------------------------------ user agency ---

describe("manual input cancels instantly (settle-scroll-cancel)", () => {
  const plan = (): AnimateScrollPlan => ({ kind: "animate", from: 0, to: 232, holdMs: 900, durationMs: 1600 });

  it.each([
    ["wheel", undefined],
    ["touchstart", undefined],
    ["touchmove", undefined],
    ["pointerdown", undefined],
    ["mousedown", undefined],
  ])("%s stops the animation and detaches every listener", (type) => {
    cover("settle-scroll-cancel");
    const h = drive(plan());
    h.advanceTo(1200); // mid-travel
    const at = h.list.scrollTop;
    expect(at).toBeGreaterThan(0);

    h.list.emit(type);
    expect(h.cancelled()).toBe(1);
    expect(h.list.listenerCount).toBe(0);
    expect(h.keys.listenerCount).toBe(0);

    h.advanceTo(6000); // the list stays exactly where the player left it
    expect(h.list.scrollTop).toBe(at);
    expect(h.arrived()).toBe(0);
  });

  it("scroll keys cancel; ordinary typing does not", () => {
    cover("settle-scroll-cancel");
    expect(isScrollCancelKey("ArrowDown")).toBe(true);
    expect(isScrollCancelKey("PageUp")).toBe(true);
    expect(isScrollCancelKey("Home")).toBe(true);
    expect(isScrollCancelKey(" ")).toBe(true);
    expect(isScrollCancelKey("a")).toBe(false);
    expect(shouldCancelForEvent("keydown", "End")).toBe(true);
    expect(shouldCancelForEvent("keydown", "Shift")).toBe(false);
    expect(shouldCancelForEvent("keydown")).toBe(false);
    expect(shouldCancelForEvent("click")).toBe(false); // clicking a row is not a scroll
    expect(shouldCancelForEvent("wheel")).toBe(true);

    const h = drive(plan());
    h.advanceTo(1200);
    h.keys.emit("keydown", { key: "q" }); // unrelated key → keeps scrolling
    expect(h.cancelled()).toBe(0);
    const before = h.list.scrollTop;
    h.advanceTo(1400);
    expect(h.list.scrollTop).toBeGreaterThan(before);

    h.keys.emit("keydown", { key: "ArrowDown" });
    expect(h.cancelled()).toBe(1);
    const at = h.list.scrollTop;
    h.advanceTo(6000);
    expect(h.list.scrollTop).toBe(at);
    expect(h.arrived()).toBe(0);
  });

  it("a second input (or a late unmount) is a no-op", () => {
    cover("settle-scroll-cancel");
    const h = drive(plan());
    h.advanceTo(1000);
    h.list.emit("wheel");
    h.list.emit("wheel");
    h.stop();
    h.stop();
    expect(h.cancelled()).toBe(1);
    expect(h.arrived()).toBe(0);
  });

  it("input during the HOLD cancels before any movement happens", () => {
    cover("settle-scroll-cancel");
    const h = drive(plan());
    h.advanceTo(300);
    h.list.emit("touchstart");
    h.advanceTo(9000);
    expect(h.list.scrollTop).toBe(0);
    expect(h.arrived()).toBe(0);
  });
});

// ------------------------------------------------------------ reduced motion ---

describe("prefers-reduced-motion (settle-scroll-reduced)", () => {
  it("renders already-scrolled to the centered offset, with no animation", () => {
    cover("settle-scroll-reduced");
    const g = boardGeometry(ROWS - 1);
    const plan = planRowAutoScroll(g, { reducedMotion: true });
    expect(plan.kind).toBe("jump");
    expect(plan.kind === "jump" && plan.scrollTop).toBe(centeredScrollTop(g));
    // same offset the animation would have finished on — just without the travel
    const animated = planRowAutoScroll(g, { reducedMotion: false });
    expect(animated.kind === "animate" && animated.to).toBe(
      plan.kind === "jump" ? plan.scrollTop : -1,
    );
  });

  it("still jumps for a mid-list row, and stays at 0 when nothing overflows", () => {
    cover("settle-scroll-reduced");
    expect(planRowAutoScroll(boardGeometry(6), { reducedMotion: true })).toEqual({
      kind: "jump",
      scrollTop: 134,
    });
    const short: RowScrollGeometry = { rowTop: 0, rowHeight: ROW_H, viewportHeight: 400, contentHeight: 144 };
    expect(planRowAutoScroll(short, { reducedMotion: true })).toEqual({ kind: "jump", scrollTop: 0 });
  });
});

// ---------------------------------------------------------- once per match ---

describe("fires exactly once per match (settle-scroll-once)", () => {
  it("claims a match key once, no matter how often the view re-renders", () => {
    cover("settle-scroll-once");
    const guard = new OnceGuard();
    expect(guard.claim("match-a")).toBe(true);
    expect(guard.claim("match-a")).toBe(false);
    expect(guard.claim("match-a")).toBe(false);
    expect(guard.held).toBe("match-a");
  });

  it("a cancelled run never re-triggers for that match, but the NEXT match re-arms", () => {
    cover("settle-scroll-once");
    const guard = new OnceGuard();
    expect(guard.claim("match-a")).toBe(true);
    // user cancelled → the panel re-renders → still refused for match-a
    expect(guard.claim("match-a")).toBe(false);
    // leaving the settlement screen disarms (runKey → null), the next match runs
    expect(guard.claim(null)).toBe(false);
    expect(guard.held).toBeNull();
    expect(guard.claim("match-b")).toBe(true);
    expect(guard.claim("match-b")).toBe(false);
    // and a return to match-a after a disarm is a brand new run
    expect(guard.claim(null)).toBe(false);
    expect(guard.claim("match-a")).toBe(true);
  });
});
