/**
 * valhalla — the 英靈殿 rotation + layout rules (task #258).
 *
 * These are the three claims that, if wrong, make the showcase either a liar or
 * invisible: the roster is what a player can actually PLAY, a pass never
 * repeats a champion, and the card never grows tall enough to shove 一鍵開打
 * off a phone in landscape.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  bagIsStale,
  draw,
  EMPTY_ROTATION,
  newBag,
  remainingMs,
  shouldCount,
  shuffle,
  VALHALLA_ROTATION_MS,
  VALHALLA_STRIP_MAX_HEIGHT,
  valhallaLayout,
  type RotationState,
} from "./valhalla";
import { NO_FILTER, whitelistFromDoc } from "../panels/champSelectFilter";
import { whitelistedChampionIds } from "../panels/champSelectFilter";

/** Deterministic rng over a fixed cycle — enough to make shuffles reproducible. */
function stubRng(seq: number[]): () => number {
  let i = 0;
  return () => seq[i++ % seq.length]!;
}

const ROSTER = ["a", "b", "c", "d", "e"];

describe("valhalla rotation bag", () => {
  it("shuffle keeps every element exactly once", () => {
    const out = shuffle(ROSTER, stubRng([0.1, 0.9, 0.4, 0.7, 0.2]));
    expect([...out].sort()).toEqual([...ROSTER].sort());
  });

  it("one pass shows every champion exactly once before any repeat", () => {
    cover("valhalla-bag-pass");
    let state: RotationState = EMPTY_ROTATION;
    let current: string | null = null;
    const seen: string[] = [];
    for (let i = 0; i < ROSTER.length; i++) {
      const next = draw(state, ROSTER, Math.random, current);
      state = next.state;
      current = next.id;
      seen.push(next.id!);
    }
    expect(new Set(seen).size).toBe(ROSTER.length);
    expect([...seen].sort()).toEqual([...ROSTER].sort());
  });

  it("never repeats the same champion back-to-back across a bag boundary", () => {
    cover("valhalla-bag-no-repeat");
    // 200 consecutive draws over the real-ish roster size; the reshuffle happens
    // every 5 draws, which is exactly where a naive bag can repeat.
    let state: RotationState = EMPTY_ROTATION;
    let current: string | null = null;
    for (let i = 0; i < 200; i++) {
      const next = draw(state, ROSTER, Math.random, current);
      expect(next.id).not.toBe(current);
      state = next.state;
      current = next.id;
    }
  });

  it("a single-champion roster is allowed to repeat (there is nothing else)", () => {
    const one = ["solo"];
    const a = draw(EMPTY_ROTATION, one, Math.random, null);
    const b = draw(a.state, one, Math.random, a.id);
    expect(a.id).toBe("solo");
    expect(b.id).toBe("solo");
  });

  it("an empty roster draws null instead of throwing", () => {
    expect(draw(EMPTY_ROTATION, [], Math.random, null)).toEqual({ state: EMPTY_ROTATION, id: null });
  });

  it("a bag built for a different roster is stale and gets re-shuffled", () => {
    cover("valhalla-bag-stale");
    const bag = newBag(ROSTER, stubRng([0.5]));
    expect(bagIsStale(bag, ROSTER)).toBe(false);
    expect(bagIsStale(bag, ["a", "b"])).toBe(true);
    expect(bagIsStale(bag, ["a", "b", "c", "d", "z"])).toBe(true);
    // the whitelist landing late must not leave the panel drawing dead ids
    const next = draw(bag, ["x", "y"], Math.random, null);
    expect(["x", "y"]).toContain(next.id);
  });

  it("newBag keeps the avoided champion off the first slot", () => {
    // an rng that always returns ~0 makes Fisher–Yates a rotation, so the
    // arrangement is deterministic and the avoid-swap is observable
    for (const avoid of ROSTER) {
      const bag = newBag(ROSTER, stubRng([0.999, 0.001, 0.5, 0.25, 0.75]), avoid);
      expect(bag.order[0]).not.toBe(avoid);
      expect([...bag.order].sort()).toEqual([...ROSTER].sort());
    }
  });
});

describe("valhalla roster = what the player can actually play", () => {
  // the ten alternate-form ids the operator has ENABLED; `marqueeRoster`'s
  // isSelectableChampion would drop every one of them (see valhalla.ts).
  const ALTERNATE_BUT_ENABLED = [
    "godie-e007",
    "godie-h020",
    "godie-h02r",
    "godie-h02u",
    "godie-n00p",
    "godie-n01c",
    "godie-o00x",
    "godie-u00l",
    "godie-u010",
    "godie-u01u",
  ];

  it("keeps exactly the whitelisted ids, alternate forms included", () => {
    cover("valhalla-roster-whitelist");
    const all = [...ALTERNATE_BUT_ENABLED, "godie-e002", "not-enabled"];
    const wl = whitelistFromDoc({ champions: [...ALTERNATE_BUT_ENABLED, "godie-e002"] });
    const out = whitelistedChampionIds(all, wl);
    expect(out).toEqual([...ALTERNATE_BUT_ENABLED, "godie-e002"]);
    for (const id of ALTERNATE_BUT_ENABLED) expect(out).toContain(id);
  });

  it("an unreachable platform (NO_FILTER) shows everything rather than nothing", () => {
    cover("valhalla-roster-degrade");
    expect(whitelistedChampionIds(["a", "b"], NO_FILTER)).toEqual(["a", "b"]);
  });

  it("an enforced-but-empty whitelist yields an empty roster (the honest empty state)", () => {
    expect(whitelistedChampionIds(["a", "b"], whitelistFromDoc({ champions: [] }))).toEqual([]);
  });
});

describe("valhalla layout never buries 一鍵開打", () => {
  it("collapses to one line on a phone in landscape (844x390)", () => {
    cover("valhalla-layout-strip");
    const l = valhallaLayout({ viewportWidth: 844, viewportHeight: 390 });
    expect(l.mode).toBe("strip");
    expect(l.stageHeight).toBe(0);
  });

  it("the strip threshold is inclusive", () => {
    expect(valhallaLayout({ viewportWidth: 1280, viewportHeight: VALHALLA_STRIP_MAX_HEIGHT }).mode).toBe("strip");
    expect(valhallaLayout({ viewportWidth: 1280, viewportHeight: VALHALLA_STRIP_MAX_HEIGHT + 1 }).mode).toBe("full");
  });

  it("gives the stage real room on a desktop viewport, and never more than a third of it", () => {
    cover("valhalla-layout-bounded");
    for (const viewportHeight of [600, 720, 900, 1200]) {
      const l = valhallaLayout({ viewportWidth: 1280, viewportHeight });
      expect(l.mode).toBe("full");
      // owner 2026-07-26, after seeing it live: 「然後英靈殿 3d model 展示也可以縮小」.
      // The floor came down 120 → 96 with him; what it still protects is that the
      // stage never degenerates into a thumbnail — below ~96 px a 1.8 u figure
      // framed head-to-toe is smaller than the portrait fallback beside it, and
      // then the 3D is costing a WebGL context to show LESS than a PNG would.
      expect(l.stageHeight).toBeGreaterThanOrEqual(96);
      // the whole card (stage + chrome) must stay well under half the screen or
      // the bot strip below it starts sliding out of view
      expect(l.stageHeight).toBeLessThan(viewportHeight / 3);
    }
  });

  it("stacks the stage above the text only in the narrow-centre-column band", () => {
    expect(valhallaLayout({ viewportWidth: 800, viewportHeight: 900 }).stacked).toBe(true);
    expect(valhallaLayout({ viewportWidth: 1280, viewportHeight: 900 }).stacked).toBe(false);
    // < 720 the columns are full-width again (ranking.css), so side-by-side fits
    expect(valhallaLayout({ viewportWidth: 390, viewportHeight: 844 }).stacked).toBe(false);
  });

  it("the scrolling body is bounded on every tier (a long 故事 cannot grow the card)", () => {
    for (const viewportHeight of [600, 720, 900, 1400]) {
      const l = valhallaLayout({ viewportWidth: 1280, viewportHeight });
      expect(l.bodyMaxHeight).toBeGreaterThan(0);
      expect(l.stageHeight + l.bodyMaxHeight).toBeLessThan(viewportHeight * 0.62);
    }
  });
});

describe("valhalla clock", () => {
  it("counts only when visible, on-screen and not being read", () => {
    cover("valhalla-clock-pause");
    expect(shouldCount({ hidden: false, offscreen: false, engaged: false })).toBe(true);
    expect(shouldCount({ hidden: true, offscreen: false, engaged: false })).toBe(false);
    expect(shouldCount({ hidden: false, offscreen: true, engaged: false })).toBe(false);
    // owner: 「玩家正在讀的時候不要抽換」 — deferred, not cancelled
    expect(shouldCount({ hidden: false, offscreen: false, engaged: true })).toBe(false);
  });

  it("remaining never goes negative and starts at a full minute", () => {
    expect(remainingMs(0)).toBe(VALHALLA_ROTATION_MS);
    expect(VALHALLA_ROTATION_MS).toBe(60_000);
    expect(remainingMs(VALHALLA_ROTATION_MS + 5_000)).toBe(0);
  });
});
