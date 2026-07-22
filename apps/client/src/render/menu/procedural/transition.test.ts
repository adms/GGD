/**
 * Pure math for the login ENTER TRANSITION (task #20): the camera swoop
 * keyframes, the white-flash ramp, the on-island target pose, and the
 * reduced-motion path selector. No Babylon, no DOM.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import type { CameraPose } from "./math";
import {
  easeInOut,
  lerp,
  enterCameraPose,
  enterFlashAlpha,
  islandApproachPose,
  chooseEnterMode,
  returnCameraPose,
  chooseReturnMode,
  DEFAULT_ENTER_TRANSITION,
  DEFAULT_RETURN_TRANSITION,
} from "./transition";

const FROM: CameraPose = { alpha: -Math.PI / 2, beta: 1.05, radius: 40, targetY: 4 };
const TO: CameraPose = { alpha: 0.3, beta: 0.7, radius: 7, targetY: 9 };

describe("easeInOut", () => {
  it("hits the endpoints and is monotone non-decreasing", () => {
    cover("login-enter-keyframe");
    expect(easeInOut(0)).toBeCloseTo(0);
    expect(easeInOut(1)).toBeCloseTo(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    // clamps outside [0,1]
    expect(easeInOut(-3)).toBeCloseTo(0);
    expect(easeInOut(9)).toBeCloseTo(1);
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const e = easeInOut(t);
      expect(e).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = e;
    }
  });
});

describe("enterCameraPose", () => {
  it("interpolates from→to at the endpoints and writes into the out struct", () => {
    cover("login-enter-keyframe");
    const out: CameraPose = { alpha: 0, beta: 0, radius: 0, targetY: 0 };
    // allocation-free: returns the SAME object it wrote
    expect(enterCameraPose(out, 0, FROM, TO)).toBe(out);
    expect(out).toEqual(FROM); // eased(0)=0 → exactly `from`
    enterCameraPose(out, 1, FROM, TO);
    expect(out.alpha).toBeCloseTo(TO.alpha);
    expect(out.beta).toBeCloseTo(TO.beta);
    expect(out.radius).toBeCloseTo(TO.radius);
    expect(out.targetY).toBeCloseTo(TO.targetY);
  });

  it("radius shrinks monotonically across the swoop (a forward zoom-in)", () => {
    cover("login-enter-keyframe");
    const out: CameraPose = { alpha: 0, beta: 0, radius: 0, targetY: 0 };
    let prev = Infinity;
    for (let p = 0; p <= 1.0001; p += 0.1) {
      enterCameraPose(out, p, FROM, TO); // FROM.radius 40 → TO.radius 7
      expect(out.radius).toBeLessThanOrEqual(prev + 1e-9);
      prev = out.radius;
    }
    expect(prev).toBeCloseTo(TO.radius);
  });

  it("lerp is a plain linear blend", () => {
    cover("login-enter-keyframe");
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(2, 6, 0.5)).toBe(4);
  });
});

describe("enterFlashAlpha", () => {
  it("stays transparent until flashStart then ramps to full white by the end", () => {
    cover("login-enter-flash");
    const s = 0.5;
    expect(enterFlashAlpha(0, s)).toBe(0);
    expect(enterFlashAlpha(0.5, s)).toBe(0); // at the start edge → still 0
    expect(enterFlashAlpha(0.75, s)).toBeCloseTo(0.5); // halfway through the flash
    expect(enterFlashAlpha(1, s)).toBeCloseTo(1); // fully white at completion
    // monotone non-decreasing across the whole progress
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const a = enterFlashAlpha(p, s);
      expect(a).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(a).toBeLessThanOrEqual(1 + 1e-9);
      prev = a;
    }
  });

  it("clamps a weird flashStart and out-of-range progress", () => {
    cover("login-enter-flash");
    expect(enterFlashAlpha(-1, 0.5)).toBe(0);
    expect(enterFlashAlpha(2, 0.5)).toBeCloseTo(1);
    // degenerate flashStart >= 1 → only fully-complete is white
    expect(enterFlashAlpha(0.9, 1)).toBe(0);
    expect(enterFlashAlpha(1, 1)).toBe(1);
  });
});

describe("islandApproachPose", () => {
  it("zooms in, pitches down, curves the orbit, and looks at the island", () => {
    cover("login-enter-approach");
    const island = { x: 12, y: 6, z: -8 };
    const to = islandApproachPose(island, FROM);
    // radius collapses to the config approach radius (a big zoom-in from 40)
    expect(to.radius).toBe(DEFAULT_ENTER_TRANSITION.approachRadius);
    expect(to.radius).toBeLessThan(FROM.radius);
    // pitch down onto the island (beta scaled below the start beta)
    expect(to.beta).toBeCloseTo(FROM.beta * DEFAULT_ENTER_TRANSITION.betaScale);
    expect(to.beta).toBeLessThan(FROM.beta);
    // orbit swings toward the island
    expect(to.alpha).toBeCloseTo(FROM.alpha + DEFAULT_ENTER_TRANSITION.alphaSwing);
    // ends looking at the island height
    expect(to.targetY).toBe(island.y);
  });
});

describe("chooseEnterMode", () => {
  it("reduced motion → instant (no swoop, no flash)", () => {
    cover("login-enter-reduced");
    expect(chooseEnterMode(true, true)).toBe("instant");
    expect(chooseEnterMode(true, false)).toBe("instant");
  });

  it("motion allowed → swoop when the WebGL scene is live, else a quick flash", () => {
    cover("login-enter-reduced");
    expect(chooseEnterMode(false, true)).toBe("swoop");
    expect(chooseEnterMode(false, false)).toBe("flash");
  });
});

// --- RETURN transition (task #26: app → login reverse pull-back) ------------

describe("returnCameraPose", () => {
  it("is the inverse of the enter swoop: starts at the enter END, ends at the resting vista", () => {
    cover("login-return-keyframe");
    const island = { x: 12, y: 6, z: -8 };
    const resting = FROM; // the sky-vista drift pose the enter swoop started from
    const approach = islandApproachPose(island, resting); // the enter END-state
    const out: CameraPose = { alpha: 0, beta: 0, radius: 0, targetY: 0 };
    // allocation-free: returns the SAME object it wrote
    expect(returnCameraPose(out, 0, approach, resting)).toBe(out);
    // t=0 → exactly where the enter transition ENDED (on the island)
    expect(out).toEqual(approach);
    expect(out).toEqual(enterCameraPose({ alpha: 0, beta: 0, radius: 0, targetY: 0 }, 1, resting, approach));
    // t=1 → exactly the resting sky vista the enter swoop STARTED from
    returnCameraPose(out, 1, approach, resting);
    expect(out.alpha).toBeCloseTo(resting.alpha);
    expect(out.beta).toBeCloseTo(resting.beta);
    expect(out.radius).toBeCloseTo(resting.radius);
    expect(out.targetY).toBeCloseTo(resting.targetY);
  });

  it("radius grows monotonically across the pull-back (a backward zoom-OUT)", () => {
    cover("login-return-keyframe");
    const island = { x: 12, y: 6, z: -8 };
    const approach = islandApproachPose(island, FROM); // radius 7
    const out: CameraPose = { alpha: 0, beta: 0, radius: 0, targetY: 0 };
    let prev = -Infinity;
    for (let p = 0; p <= 1.0001; p += 0.1) {
      returnCameraPose(out, p, approach, FROM); // 7 → 40
      expect(out.radius).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = out.radius;
    }
    expect(prev).toBeCloseTo(FROM.radius);
  });

  it("uses the same eased interpolation as the enter swoop, endpoints swapped", () => {
    cover("login-return-keyframe");
    const out: CameraPose = { alpha: 0, beta: 0, radius: 0, targetY: 0 };
    const ref: CameraPose = { alpha: 0, beta: 0, radius: 0, targetY: 0 };
    for (let p = 0; p <= 1.0001; p += 0.25) {
      returnCameraPose(out, p, TO, FROM);
      enterCameraPose(ref, p, TO, FROM);
      expect(out).toEqual(ref);
    }
  });

  it("return duration sits in the cinematic ~1.2–1.6 s band", () => {
    cover("login-return-keyframe");
    expect(DEFAULT_RETURN_TRANSITION.durationMs).toBeGreaterThanOrEqual(1200);
    expect(DEFAULT_RETURN_TRANSITION.durationMs).toBeLessThanOrEqual(1600);
  });
});

describe("chooseReturnMode", () => {
  it("reduced motion → skip the pull-back (login shows immediately)", () => {
    cover("login-return-mode");
    expect(chooseReturnMode(true, true)).toBe("skip");
    expect(chooseReturnMode(true, false)).toBe("skip");
  });

  it("motion allowed → swoop only when the WebGL scene is live", () => {
    cover("login-return-mode");
    expect(chooseReturnMode(false, true)).toBe("swoop");
    expect(chooseReturnMode(false, false)).toBe("skip");
  });
});
