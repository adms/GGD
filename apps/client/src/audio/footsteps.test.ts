/**
 * footstep cadence (juice-footstep): distance-accumulating step trigger for the
 * local champion — one step per STRIDE of travel, silent while standing, and a
 * teleport re-baselines without a stomp. Pure bookkeeping.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { FootstepCadence, FOOTSTEP_STRIDE, FOOTSTEP_MAX_STEP } from "./footsteps";

describe("footstep cadence (juice-footstep)", () => {
  it("first sample never steps (baseline), then steps once per stride", () => {
    cover("juice-footstep");
    const fc = new FootstepCadence();
    expect(fc.advance(0, 0)).toBe(false); // baseline
    // walk STRIDE units in small increments → exactly one step at the crossing
    let steps = 0;
    for (let i = 1; i <= 20; i++) {
      if (fc.advance(i * (FOOTSTEP_STRIDE / 10), 0)) steps++;
    }
    expect(steps).toBe(2); // travelled 2× stride
  });

  it("standing still never steps", () => {
    cover("juice-footstep");
    const fc = new FootstepCadence();
    fc.advance(3, 3);
    for (let i = 0; i < 30; i++) expect(fc.advance(3, 3)).toBe(false);
  });

  it("a teleport (jump beyond FOOTSTEP_MAX_STEP) re-baselines silently", () => {
    cover("juice-footstep");
    const fc = new FootstepCadence();
    fc.advance(0, 0);
    expect(fc.advance(FOOTSTEP_MAX_STEP + 50, 0)).toBe(false); // respawn/teleport
    // and the accumulator was cleared — a fresh partial stride doesn't step
    expect(fc.advance(FOOTSTEP_MAX_STEP + 50 + FOOTSTEP_STRIDE * 0.4, 0)).toBe(false);
  });

  it("reset clears state", () => {
    cover("juice-footstep");
    const fc = new FootstepCadence();
    fc.advance(0, 0);
    fc.advance(FOOTSTEP_STRIDE * 0.9, 0);
    fc.reset();
    expect(fc.advance(10, 10)).toBe(false); // first sample after reset = baseline
  });
});
