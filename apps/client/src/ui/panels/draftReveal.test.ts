/**
 * hud-draft-reveal: the pure per-card sparkle / legendary roll+win schedule
 * behind the 3-choose-1 draft reveal (#110) and the legendary-orb gacha (#82).
 * Node-testable (no React/store/audio import).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  DRAFT_CARD_REVEAL_SFX,
  LEGENDARY_ROLL_SFX,
  LEGENDARY_WIN_SFX,
  CARD_REVEAL_STAGGER_MS,
  LEGENDARY_ROLL_LEAD_MS,
  AUGMENT_REVEAL_LEAD_MS,
  isLegendaryOffer,
  revealSchedule,
} from "./draftReveal";

describe("draftReveal (hud-draft-reveal)", () => {
  it("pins the three sfx keys distinct from the confirm cue", () => {
    cover("hud-draft-reveal");
    expect(DRAFT_CARD_REVEAL_SFX).toBe("draftCardReveal");
    expect(LEGENDARY_ROLL_SFX).toBe("legendaryRoll");
    expect(LEGENDARY_WIN_SFX).toBe("legendaryWin");
    // the reveal sparkle is NOT the lock-in confirm cue
    expect(DRAFT_CARD_REVEAL_SFX).not.toBe("draftConfirm");
  });

  it("treats the weapon tier as legendary, augment tiers as not", () => {
    cover("hud-draft-reveal");
    expect(isLegendaryOffer("weapon")).toBe(true);
    for (const t of ["silver", "gold", "prismatic", ""]) {
      expect(isLegendaryOffer(t)).toBe(false);
    }
  });

  it("fires draftCardReveal exactly ONCE PER CARD, one distinct index each", () => {
    cover("hud-draft-reveal");
    for (const legendary of [false, true]) {
      const reveals = revealSchedule(3, legendary).filter(
        (s) => s.event === DRAFT_CARD_REVEAL_SFX,
      );
      expect(reveals).toHaveLength(3);
      expect(reveals.map((s) => s.cardIndex)).toEqual([0, 1, 2]);
      // staggered, strictly increasing
      expect(reveals[0]!.atMs).toBeLessThan(reveals[1]!.atMs);
      expect(reveals[1]!.atMs).toBeLessThan(reveals[2]!.atMs);
      expect(reveals[1]!.atMs - reveals[0]!.atMs).toBe(CARD_REVEAL_STAGGER_MS);
    }
  });

  it("an augment round: no roll, no jackpot — only the per-card sparkles", () => {
    cover("hud-draft-reveal");
    const steps = revealSchedule(3, false);
    expect(steps.some((s) => s.event === LEGENDARY_ROLL_SFX)).toBe(false);
    expect(steps.some((s) => s.event === LEGENDARY_WIN_SFX)).toBe(false);
    // first card leads with the short augment lead, not the roll build-up
    expect(steps[0]!.atMs).toBe(AUGMENT_REVEAL_LEAD_MS);
  });

  it("a legendary roll: build-up at t=0, cards after the lead, jackpot last", () => {
    cover("hud-draft-reveal");
    const steps = revealSchedule(3, true);
    // roll starts the instant the offer mounts
    expect(steps[0]).toEqual({ atMs: 0, event: LEGENDARY_ROLL_SFX });
    // the first card holds until the build-up lead has passed
    const firstReveal = steps.find((s) => s.event === DRAFT_CARD_REVEAL_SFX)!;
    expect(firstReveal.atMs).toBe(LEGENDARY_ROLL_LEAD_MS);
    // jackpot is the LAST cue, after the final card lands
    const win = steps[steps.length - 1]!;
    expect(win.event).toBe(LEGENDARY_WIN_SFX);
    const lastReveal = [...steps].reverse().find((s) => s.event === DRAFT_CARD_REVEAL_SFX)!;
    expect(win.atMs).toBeGreaterThan(lastReveal.atMs);
  });

  it("degrades safely on an empty offer (no cards → no cues)", () => {
    cover("hud-draft-reveal");
    expect(revealSchedule(0, true)).toEqual([]);
    expect(revealSchedule(0, false)).toEqual([]);
  });
});
