/**
 * Guard tests for the LATENCY CONSTANTS PAIRING.
 *
 * SNAPSHOT_HZ and INTERP_DELAY_MS are not independent knobs. The client's
 * InterpolationBuffer clamps (freezes the remote) rather than extrapolating
 * when the render clock outruns the newest sample, so the delay has to cover at
 * least two whole snapshot intervals for one late or dropped packet to pass
 * unnoticed. Lowering the delay WITHOUT raising the broadcast rate — or raising
 * the rate later and "tidying up" the delay — reintroduces remote stutter, and
 * on a phone over wifi that is a real packet-loss path, not a theoretical one.
 *
 * These assertions exist so that regression fails a test instead of shipping.
 */
import { describe, it, expect } from "vitest";
import {
  TICK_HZ,
  TICK_MS,
  SNAPSHOT_HZ,
  SNAPSHOT_MS,
  INTERP_DELAY_MS,
  INTERP_INTERVALS_OF_HEADROOM,
} from "./constants";

describe("latency constants pairing", () => {
  it("the interpolation buffer keeps ~2 snapshot intervals of headroom", () => {
    expect(INTERP_INTERVALS_OF_HEADROOM).toBe(INTERP_DELAY_MS / SNAPSHOT_MS);
    // 2.0 is the target; 66 ms against 33.33 ms is 1.98, which is the approved
    // rounding. Anything meaningfully below this is a stutter regression.
    expect(INTERP_INTERVALS_OF_HEADROOM).toBeGreaterThanOrEqual(1.95);
    // and more than ~3 intervals is just latency we are not buying anything with
    expect(INTERP_INTERVALS_OF_HEADROOM).toBeLessThanOrEqual(3);
  });

  it("never broadcasts faster than the sim can produce new state", () => {
    // Above TICK_HZ we would serialize the same tick twice and pay bandwidth
    // for zero new information.
    expect(SNAPSHOT_HZ).toBeLessThanOrEqual(TICK_HZ);
    // and never so slow that a bracket spans more than 2 sim ticks
    expect(TICK_HZ / SNAPSHOT_HZ).toBeLessThanOrEqual(2);
  });

  it("the felt presentation chain is under the pre-change budget", () => {
    // INTERP_DELAY + one snapshot interval + one sim tick, before RTT. The
    // pre-change chain was 100 + 50 + 33.3 = 183.3 ms.
    const chainMs = INTERP_DELAY_MS + SNAPSHOT_MS + TICK_MS;
    expect(chainMs).toBeLessThan(183.3);
    expect(chainMs).toBeCloseTo(132.7, 1);
  });

  it("derived ms values stay consistent with their Hz", () => {
    expect(SNAPSHOT_MS).toBeCloseTo(1000 / SNAPSHOT_HZ, 9);
    expect(TICK_MS).toBeCloseTo(1000 / TICK_HZ, 9);
  });
});
