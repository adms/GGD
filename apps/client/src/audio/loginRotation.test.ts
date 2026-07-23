/**
 * The login screen's background theme. SINGLE-THEME since task #134 (the serene
 * nocturne moved to the ranked ladder — see bgmOverride.test.ts), so the rule is
 * now "login always plays the epic `menu` bed". Pure module → plain assertions,
 * no timers, no WebAudio, no React.
 *
 * The still-load-bearing claim is the ARITHMETIC: LOGIN_SEGMENT_MS is one whole
 * loop of the `menu` bed (3 763 200 samples at 44.1 kHz — the pack's loop grid
 * ×2, tools/bgm-gen/src/ggd/music.py), asserted from the sample count so a
 * re-render at a different length fails this test. It no longer times a crossfade
 * (there is nothing to swap to) but stays honest for a future second login bed.
 */
import { describe, it, expect } from "vitest";
import {
  LOGIN_SEGMENT_MS,
  LOGIN_THEMES,
  isLoginTheme,
  loginSegmentRemainingMs,
  loginThemeAt,
} from "./loginRotation";
import { AUDIO_SCENES } from "./types";

/** The `menu` bed: 24 bars @67.5 / 32 bars @90 is this sample count. */
const LOOP_SAMPLES = 3_763_200;
const SR = 44_100;

describe("login theme rotation", () => {
  it("is a single theme: the epic `menu` bed, and only that", () => {
    // task #134: the serene nocturne left the login screen for the ranked ladder,
    // so login plays ONLY the game's identity theme.
    expect(LOGIN_THEMES).toEqual(["menu"]);
    expect(loginThemeAt(0)).toBe("menu");
    expect(loginThemeAt(1)).toBe("menu");
    expect(loginThemeAt(2)).toBe("menu");
    // the nocturne is explicitly NOT a login theme any more
    expect(LOGIN_THEMES).not.toContain("menuNocturne");
  });

  it("holds the theme for exactly one whole loop of the `menu` bed", () => {
    const loopMs = (LOOP_SAMPLES / SR) * 1000; // 85 333.33...
    // rounded to whole ms, which is the resolution setTimeout works in
    expect(LOGIN_SEGMENT_MS).toBe(Math.floor(loopMs));
    // and it is under a third of a millisecond off a true loop, i.e. ~15
    // samples — far below the 600 ms crossfade it would schedule
    expect(Math.abs(loopMs - LOGIN_SEGMENT_MS)).toBeLessThan(1);
  });

  it("the rotation theme is a scene the client knows how to ask for", () => {
    for (const t of LOGIN_THEMES) expect(AUDIO_SCENES).toContain(t);
    expect(isLoginTheme("menu")).toBe(true);
    // the nocturne is a real scene, but no longer a LOGIN scene
    expect(AUDIO_SCENES).toContain("menuNocturne");
    expect(isLoginTheme("menuNocturne")).toBe(false);
    expect(isLoginTheme("lobby")).toBe(false);
    expect(isLoginTheme(null)).toBe(false);
  });

  it("wraps a free-running index to the single theme, including a bad one", () => {
    expect(loginThemeAt(10)).toBe("menu");
    expect(loginThemeAt(11)).toBe("menu");
    // a backwards clock must not blank the bed
    expect(loginThemeAt(-1)).toBe("menu");
    expect(loginThemeAt(-2)).toBe("menu");
    // a non-finite index falls back to slot 0, which is `menu`
    expect(loginThemeAt(Number.NaN)).toBe("menu");
    expect(loginThemeAt(Number.POSITIVE_INFINITY)).toBe("menu");
  });

  it("counts the remaining segment down from when the BED started", () => {
    expect(loginSegmentRemainingMs(1000, 1000)).toBe(LOGIN_SEGMENT_MS);
    expect(loginSegmentRemainingMs(1000, 1500)).toBe(LOGIN_SEGMENT_MS - 500);
    expect(loginSegmentRemainingMs(0, LOGIN_SEGMENT_MS)).toBe(0);
  });

  it("clamps a stale or future anchor instead of scheduling in the past", () => {
    // a tab suspended for ten minutes: fire now, do not go negative
    expect(loginSegmentRemainingMs(0, 600_000)).toBe(0);
    // a clock that jumped backwards: a full segment, never more
    expect(loginSegmentRemainingMs(5000, 1000)).toBe(LOGIN_SEGMENT_MS);
    expect(loginSegmentRemainingMs(Number.NaN, 1000)).toBe(LOGIN_SEGMENT_MS);
    expect(loginSegmentRemainingMs(1000, Number.NaN)).toBe(LOGIN_SEGMENT_MS);
  });
});
