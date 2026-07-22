/**
 * mobile-09/10: touch-device detection ('ontouchstart' + coarse pointer, plus
 * the __ggdForceTouch dev seam) gating the touch layout, and the portrait →
 * rotate-to-landscape overlay logic. Pure predicates, node-run.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  isTouchDevice,
  detectQuality,
  shouldShowRotateOverlay,
  showTouchControls,
  readTouchEnv,
} from "./mobileDetect";

describe("touch detection + layout gating (mobile-09)", () => {
  it("requires BOTH touch events and a coarse pointer", () => {
    cover("mobile-detect-layout");
    expect(isTouchDevice({ hasTouchStart: true, coarsePointer: true, forced: false })).toBe(true);
    // desktop with a touchscreen but a mouse primary pointer → not touch UI
    expect(isTouchDevice({ hasTouchStart: true, coarsePointer: false, forced: false })).toBe(false);
    expect(isTouchDevice({ hasTouchStart: false, coarsePointer: true, forced: false })).toBe(false);
    expect(isTouchDevice({ hasTouchStart: false, coarsePointer: false, forced: false })).toBe(false);
  });

  it("the __ggdForceTouch dev seam forces touch mode (browser-pane emulation)", () => {
    cover("mobile-detect-layout");
    expect(isTouchDevice({ hasTouchStart: false, coarsePointer: false, forced: true })).toBe(true);
    const g = globalThis as { __ggdForceTouch?: boolean };
    g.__ggdForceTouch = true;
    expect(readTouchEnv().forced).toBe(true);
    expect(isTouchDevice(readTouchEnv())).toBe(true);
    delete g.__ggdForceTouch;
    expect(readTouchEnv().forced).toBe(false);
  });

  it("touch controls render only in-game, single local player, on touch", () => {
    cover("mobile-detect-layout");
    expect(showTouchControls({ touch: true, inGame: true, couch: false })).toBe(true);
    expect(showTouchControls({ touch: false, inGame: true, couch: false })).toBe(false);
    expect(showTouchControls({ touch: true, inGame: false, couch: false })).toBe(false);
    expect(showTouchControls({ touch: true, inGame: true, couch: true })).toBe(false);
  });
});

describe("rotate-to-landscape overlay (mobile-10)", () => {
  it("shows only on touch devices in portrait", () => {
    cover("mobile-rotate-overlay");
    expect(shouldShowRotateOverlay({ touch: true, width: 375, height: 812 })).toBe(true);
    expect(shouldShowRotateOverlay({ touch: true, width: 812, height: 375 })).toBe(false);
    expect(shouldShowRotateOverlay({ touch: false, width: 375, height: 812 })).toBe(false);
    // square-ish split views stay playable
    expect(shouldShowRotateOverlay({ touch: true, width: 800, height: 800 })).toBe(false);
  });
});

describe("quality tier auto-detect (mobile-11)", () => {
  it("touch devices and <=4-core CPUs get the mobile tier", () => {
    cover("mobile-quality-tier");
    expect(detectQuality({ touch: true, hardwareConcurrency: 8 })).toBe("mobile");
    expect(detectQuality({ touch: false, hardwareConcurrency: 4 })).toBe("mobile");
    expect(detectQuality({ touch: false, hardwareConcurrency: 2 })).toBe("mobile");
    expect(detectQuality({ touch: false, hardwareConcurrency: 8 })).toBe("desktop");
  });
});
