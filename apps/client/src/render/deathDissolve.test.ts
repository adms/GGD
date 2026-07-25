/**
 * revive-dissolve-timing (playtest directive #220): the corpse-dissolve clock.
 * Babylon-free — this is the module that decides WHEN a body lies, rises and
 * vanishes, and the symptom the directive reported (「倒在地上」 forever) is a
 * timing bug, not a shader one.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  DISSOLVE_LIE_MS,
  DISSOLVE_RISE_MS,
  DISSOLVE_RISE_UNITS,
  dissolveFrame,
  isVanished,
} from "./deathDissolve";

describe("deathDissolve (#220 corpse clock)", () => {
  it("lies flat and fully opaque for exactly 3 seconds", () => {
    cover("revive-dissolve-timing");
    expect(DISSOLVE_LIE_MS).toBe(3000); // the owner's number, not a tunable guess
    for (const t of [0, 1, 500, 1500, 2999, DISSOLVE_LIE_MS]) {
      const f = dissolveFrame(t);
      expect(f.phase).toBe("lying");
      expect(f.riseY).toBe(0);
      expect(f.visibility).toBe(1); // opaque: no fade has started
      expect(isVanished(t)).toBe(false);
    }
  });

  it("rises monotonically while fading monotonically once the 3 s is up", () => {
    cover("revive-dissolve-timing");
    let prevY = -1;
    let prevVis = 2;
    for (let i = 1; i < 40; i++) {
      const t = DISSOLVE_LIE_MS + (DISSOLVE_RISE_MS * i) / 40;
      const f = dissolveFrame(t);
      expect(f.phase).toBe("rising");
      expect(f.riseY).toBeGreaterThan(prevY); // 飛上天
      expect(f.visibility).toBeLessThan(prevVis); // 半透明
      expect(f.visibility).toBeGreaterThan(0);
      expect(f.visibility).toBeLessThan(1); // < 1 is what turns alpha blending on
      prevY = f.riseY;
      prevVis = f.visibility;
    }
  });

  it("reaches EXACTLY zero visibility (a 'nearly invisible' corpse never leaves)", () => {
    cover("revive-dissolve-timing");
    const end = DISSOLVE_LIE_MS + DISSOLVE_RISE_MS;
    const f = dissolveFrame(end);
    expect(f.phase).toBe("vanished");
    expect(f.visibility).toBe(0);
    expect(f.riseY).toBe(DISSOLVE_RISE_UNITS);
    expect(isVanished(end)).toBe(true);
    // and it STAYS vanished for any later sample (a long frame hitch, a body
    // that was culled for ten seconds and came back)
    const late = dissolveFrame(end + 60_000);
    expect(late.phase).toBe("vanished");
    expect(late.visibility).toBe(0);
    expect(late.riseY).toBe(DISSOLVE_RISE_UNITS);
  });

  it("tolerates a negative/zero elapsed (clock skew) as 'still lying'", () => {
    cover("revive-dissolve-timing");
    for (const t of [-5000, -1, 0, Number.NaN]) {
      const f = dissolveFrame(t);
      expect(f.phase).toBe("lying");
      expect(f.visibility).toBe(1);
      expect(f.riseY).toBe(0);
    }
  });
});
