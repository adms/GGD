/**
 * victoryPresentation (task #93) — the two victory beats must stay two DIFFERENT
 * beats. These pin the PARAMETERS of a purely visual feature: which tint, which
 * firework module, which VO pool, and the timings — all things a screenshot
 * could never regress-test.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  MATCH_PANEL_HOLD_MS,
  MATCH_QUOTE_DELAY_MS,
  MATCH_TAUNT_DELAY_MS,
  ROUND_PRESENT_MS,
  ROUND_TAUNT_DELAY_MS,
  ROUND_WASH_FADE_MS,
  ROUND_WASH_Z,
  matchCardHeld,
  victoryPresentation,
} from "./victoryPresentation";
import { FOCUS_FADE_OUT_MS } from "./deathFocus";
import { CHICKEN_TIMELINE, CHICKEN_TOTAL_MS, SMALL_VOLLEY_MS } from "../vfx/fireworkMath";

describe("victoryPresentation (task #93)", () => {
  it("ROUND WIN = 灰色底 + the SMALL firework + the round taunt", () => {
    cover("client-victory-round-spec");
    const s = victoryPresentation("round");
    expect(s.tier).toBe("round");
    expect(s.tint).toBe("grey");
    expect(s.firework).toBe("small");
    expect(s.voice).toBe("roundTaunt");
    // the wash actually desaturates (that is what 灰色 means here)
    expect(s.backdropFilter).toMatch(/grayscale\(0\.8/);
    expect(s.holdMs).toBe(ROUND_PRESENT_MS);
    expect(s.fireworkMs).toBe(SMALL_VOLLEY_MS);
  });

  it("MATCH WIN = 暗色底 + the GIANT chicken + the savage taunt", () => {
    cover("client-victory-match-spec");
    const s = victoryPresentation("match");
    expect(s.tier).toBe("match");
    expect(s.tint).toBe("dark");
    expect(s.firework).toBe("chicken");
    expect(s.voice).toBe("matchTaunt");
    // dark, not grey: it dims rather than draining colour
    expect(s.backdropFilter).toMatch(/brightness\(0\.5/);
    expect(s.backdropFilter).not.toMatch(/grayscale/);
    expect(s.fireworkMs).toBe(CHICKEN_TOTAL_MS);
  });

  it("the two beats never cross-fire (no shared tint / firework / voice)", () => {
    cover("client-victory-no-crossfire");
    const round = victoryPresentation("round");
    const match = victoryPresentation("match");
    expect(round.tint).not.toBe(match.tint);
    expect(round.firework).not.toBe(match.firework);
    expect(round.voice).not.toBe(match.voice);
    expect(round.background).not.toBe(match.background);
    expect(round.backdropFilter).not.toBe(match.backdropFilter);
  });

  it("REUSES the shipped firework timelines rather than re-typing them", () => {
    cover("client-victory-reuses-fx");
    // the settlement hold IS the shell's launch → break → expand → hold
    expect(MATCH_PANEL_HOLD_MS).toBe(
      CHICKEN_TIMELINE.launchMs + CHICKEN_TIMELINE.expandMs + CHICKEN_TIMELINE.holdMs,
    );
    // and the savage line lands just after the shell breaks, on the bird
    expect(MATCH_TAUNT_DELAY_MS).toBeGreaterThan(CHICKEN_TIMELINE.launchMs);
    expect(MATCH_TAUNT_DELAY_MS).toBeLessThan(MATCH_PANEL_HOLD_MS);
  });

  it("sequences the two VO clips on each beat instead of stacking them", () => {
    cover("client-victory-vo-order");
    // round: the 名言 fires at t=0 (ui/RoundEndVoice) — the taunt waits, but is
    // still heard while the winner is on screen
    expect(ROUND_TAUNT_DELAY_MS).toBeGreaterThan(1000);
    expect(ROUND_TAUNT_DELAY_MS).toBeLessThan(ROUND_PRESENT_MS);
    // match: savage taunt FIRST (on the bird), then the local 名言 after reveal
    expect(MATCH_QUOTE_DELAY_MS).toBeGreaterThan(MATCH_TAUNT_DELAY_MS);
    expect(MATCH_QUOTE_DELAY_MS).toBeGreaterThanOrEqual(MATCH_PANEL_HOLD_MS);
  });

  it("keeps the grey wash under the winner's model card and over the HP bars", () => {
    cover("client-victory-wash-stacking");
    expect(ROUND_WASH_Z).toBeGreaterThanOrEqual(5); // >= #anchor-layer
    expect(ROUND_WASH_Z).toBeLessThan(6); // < the winner-model overlay canvas
  });

  it("holds the settlement card only for the WINNER, only for the chicken", () => {
    cover("client-victory-card-hold");
    expect(matchCardHeld(true, 0)).toBe(true);
    expect(matchCardHeld(true, MATCH_PANEL_HOLD_MS - 1)).toBe(true);
    expect(matchCardHeld(true, MATCH_PANEL_HOLD_MS)).toBe(false);
    // a loser watches no celebration and gets the scoreboard immediately
    expect(matchCardHeld(false, 0)).toBe(false);
    // fail OPEN: a broken clock never strands the scoreboard
    expect(matchCardHeld(true, Number.NaN)).toBe(false);
  });

  it("does not dim the giant chicken with the very wash it is held for", () => {
    cover("client-victory-held-wash");
    const s = victoryPresentation("match");
    // The card is withheld for MATCH_PANEL_HOLD_MS so the bird can be SEEN.
    // Painting the full 暗色底 over it (0.86-alpha near-black + brightness 0.55)
    // is the joke behind smoked glass, so the HELD wash must be much lighter…
    expect(s.backgroundHeld).not.toBe(s.background);
    expect(s.backdropFilterHeld).not.toMatch(/brightness/); // dimming kills a firework
    // …measurably lighter: every alpha in the held gradient is below every one
    // in the settled gradient.
    const alphas = (css: string): number[] =>
      [...css.matchAll(/rgba\([^)]*?,\s*([\d.]+)\)/g)].map((m) => Number(m[1]));
    const held = alphas(s.backgroundHeld);
    const settled = alphas(s.background);
    expect(held.length).toBeGreaterThan(0);
    expect(Math.max(...held)).toBeLessThan(Math.min(...settled));
    // the round beat holds nothing, so its two variants are the same wash
    const r = victoryPresentation("round");
    expect(r.backgroundHeld).toBe(r.background);
    expect(r.backdropFilterHeld).toBe(r.backdropFilter);
  });

  it("hands the screen over from the #85 death greyscale instead of stacking", () => {
    cover("client-victory-death-grey-precedence");
    // A dead spectator watches the round end through the #85 post-process,
    // which ramps out over FOCUS_FADE_OUT_MS on the same phase edge that mounts
    // this wash. The wash ramps IN over exactly that interval, so the total
    // desaturation stays ~one layer instead of two (RoundWinnerStage mounts it
    // at opacity 0 and raises it).
    expect(ROUND_WASH_FADE_MS).toBe(FOCUS_FADE_OUT_MS);
    expect(ROUND_WASH_FADE_MS).toBeLessThan(ROUND_PRESENT_MS);
  });

  it("the spec table cannot be mutated by a caller (next win stays correct)", () => {
    cover("client-victory-spec-frozen");
    const s = victoryPresentation("round") as { tint: string };
    expect(() => {
      s.tint = "dark";
    }).toThrow();
    expect(victoryPresentation("round").tint).toBe("grey");
  });
});
