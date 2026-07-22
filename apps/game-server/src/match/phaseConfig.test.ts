/**
 * Phase durations come from CONTENT, not a constant (task #38). The regression
 * this pins is the one that existed for months: `config.match@1` declared
 * `intermissionSec` and nothing read it, so editing the doc changed nothing.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { TICK_HZ } from "@ggd/shared/constants";
import { DEFAULT_PHASE_CONFIG } from "./PhaseMachine";
import { phaseConfigFromSeconds } from "./phaseConfig";

describe("phaseConfig", () => {
  it("converts an authored seconds block into tick counts", () => {
    cover("phase-config-content");
    const cfg = phaseConfigFromSeconds({
      champSelectSec: 30,
      intermissionSec: 60,
      combatMaxSec: 90,
      resolutionSec: 6,
    });
    expect(cfg.champSelectTicks).toBe(30 * TICK_HZ);
    expect(cfg.intermissionTicks).toBe(60 * TICK_HZ);
    expect(cfg.combatMaxTicks).toBe(90 * TICK_HZ);
    expect(cfg.resolutionTicks).toBe(6 * TICK_HZ);
  });

  it("the SHIPPED prep window is 60 s and the doc is what sets it", () => {
    cover("phase-config-prep-window");
    // The content doc is the authority; the fallback constant must agree with
    // it so a skeleton boot and a content boot never disagree on prep length.
    expect(DEFAULT_PHASE_CONFIG.intermissionTicks).toBe(60 * TICK_HZ);
    // …and a DIFFERENT authored value actually takes effect (the bug: it didn't).
    expect(phaseConfigFromSeconds({ intermissionSec: 45 }).intermissionTicks).toBe(45 * TICK_HZ);
  });

  it("falls back per-field on a missing / nonsense duration, never to 0 ticks", () => {
    cover("phase-config-fallback");
    const cfg = phaseConfigFromSeconds({ intermissionSec: 45, combatMaxSec: 0, resolutionSec: -3 });
    expect(cfg.intermissionTicks).toBe(45 * TICK_HZ);
    expect(cfg.champSelectTicks).toBe(DEFAULT_PHASE_CONFIG.champSelectTicks); // absent
    expect(cfg.combatMaxTicks).toBe(DEFAULT_PHASE_CONFIG.combatMaxTicks); // zero
    expect(cfg.resolutionTicks).toBe(DEFAULT_PHASE_CONFIG.resolutionTicks); // negative
    // a duration that would round to nothing still advances normally
    expect(phaseConfigFromSeconds({ intermissionSec: 0.001 }).intermissionTicks).toBeGreaterThan(0);
  });
});
