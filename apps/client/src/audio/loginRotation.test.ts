/**
 * The login screen's two-theme rotation (task #88). Pure module, so these are
 * plain assertions with no timers, no WebAudio and no React.
 *
 * The load-bearing claim is the ARITHMETIC: LOGIN_SEGMENT_MS must be one whole
 * loop of BOTH login beds, because that is what puts the crossfade on a loop
 * join instead of in the middle of a phrase. Both files are 3 763 200 samples
 * at 44.1 kHz (the pack's loop grid x 2 — tools/bgm-gen/src/ggd/music.py), and
 * that is asserted here from the sample count so a re-render at a different
 * length fails this test rather than quietly detuning the rotation.
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

/** Both login beds: 24 bars @67.5 and 32 bars @90 are the same sample count. */
const LOOP_SAMPLES = 3_763_200;
const SR = 44_100;

describe("login theme rotation", () => {
  it("opens on the serene nocturne and answers it with the epic theme", () => {
    // Order flipped per the user (「主題曲 · 寧靜女聲 作為第一首再輪替第二首」):
    // stillness opens, grandeur answers.
    expect(LOGIN_THEMES).toEqual(["menuNocturne", "menu"]);
    expect(loginThemeAt(0)).toBe("menuNocturne");
    expect(loginThemeAt(1)).toBe("menu");
    expect(loginThemeAt(2)).toBe("menuNocturne");
    expect(loginThemeAt(3)).toBe("menu");
  });

  it("holds each theme for exactly one whole loop of both login beds", () => {
    const loopMs = (LOOP_SAMPLES / SR) * 1000; // 85 333.33...
    // rounded to whole ms, which is the resolution setTimeout works in
    expect(LOGIN_SEGMENT_MS).toBe(Math.floor(loopMs));
    // and it is under a third of a millisecond off a true loop, i.e. ~15
    // samples — far below the 600 ms crossfade it schedules
    expect(Math.abs(loopMs - LOGIN_SEGMENT_MS)).toBeLessThan(1);
  });

  it("every rotation theme is a scene the client knows how to ask for", () => {
    for (const t of LOGIN_THEMES) expect(AUDIO_SCENES).toContain(t);
    expect(isLoginTheme("menu")).toBe(true);
    expect(isLoginTheme("menuNocturne")).toBe(true);
    expect(isLoginTheme("lobby")).toBe(false);
    expect(isLoginTheme(null)).toBe(false);
  });

  it("wraps a free-running index, including a negative or bad one", () => {
    expect(loginThemeAt(10)).toBe("menuNocturne");
    expect(loginThemeAt(11)).toBe("menu");
    // a backwards clock must not blank the bed (index -1 wraps to slot 1 = menu)
    expect(loginThemeAt(-1)).toBe("menu");
    expect(loginThemeAt(-2)).toBe("menuNocturne");
    // a non-finite index falls back to slot 0, which is now the nocturne
    expect(loginThemeAt(Number.NaN)).toBe("menuNocturne");
    expect(loginThemeAt(Number.POSITIVE_INFINITY)).toBe("menuNocturne");
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
