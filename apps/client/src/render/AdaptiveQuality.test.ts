/**
 * settings-perf: the adaptive-quality brain — pure fps-meter math, the pure
 * step decision (down / up / hysteresis / dwell) and the ordered degradation
 * ladder (resolution → particles → shadows → draw distance), plus how far that
 * ladder is allowed to pull a FIXED (non-"auto") preset's resolution.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  ADAPTIVE_LADDER,
  AdaptiveManager,
  DEFAULT_ADAPTIVE_CONFIG,
  FIXED_PRESET_RES_FLOOR,
  fixedPresetResolution,
  frameStats,
  initAdaptiveState,
  stepAdaptive,
  type AdaptiveConfig,
  type AdaptiveState,
} from "./AdaptiveQuality";

const cfg = (over: Partial<AdaptiveConfig> = {}): AdaptiveConfig => ({
  targetFps: 60,
  ...DEFAULT_ADAPTIVE_CONFIG,
  ...over,
});

/** Thread the pure step over a (costFps, timeMs) sequence. */
function run(
  seq: readonly [number, number][],
  config: AdaptiveConfig,
  start: AdaptiveState = initAdaptiveState(),
): { state: AdaptiveState; changes: { t: number; change: number; level: number }[] } {
  let state = start;
  const changes: { t: number; change: number; level: number }[] = [];
  for (const [fps, t] of seq) {
    const r = stepAdaptive(state, fps, t, config);
    state = r.state;
    if (r.change !== 0) changes.push({ t, change: r.change, level: state.level });
  }
  return { state, changes };
}

describe("fps-meter math (settings-perf)", () => {
  it("computes avg / p95 / min fps from frame times", () => {
    cover("fps-meter-math");
    const flat = frameStats([10, 10, 10, 10]);
    expect(flat.avgMs).toBe(10);
    expect(flat.avgFps).toBeCloseTo(100);
    expect(flat.minFps).toBeCloseTo(100);
    expect(flat.p95Fps).toBeCloseTo(100);

    const spiky = frameStats([10, 10, 10, 50]);
    expect(spiky.avgMs).toBe(20);
    expect(spiky.avgFps).toBeCloseTo(50);
    expect(spiky.minFps).toBeCloseTo(20); // worst frame = 50ms
    expect(spiky.maxMs).toBe(50);

    expect(frameStats([]).avgFps).toBe(0);
  });
});

describe("adaptive step decision (settings-perf)", () => {
  it("steps DOWN one level after sustained below-target frames", () => {
    cover("adaptive-step-down");
    const c = cfg();
    // 40 fps (< 54 threshold) held across the 1.5s sustain window
    const { state, changes } = run(
      [
        [40, 0],
        [40, 1499],
        [40, 1500],
      ],
      c,
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]!.change).toBe(-1);
    expect(state.level).toBe(1);
  });

  it("does NOT step down before the sustain window elapses", () => {
    cover("adaptive-step-down");
    const { changes } = run(
      [
        [40, 0],
        [40, 500],
        [40, 1000],
      ],
      cfg(),
    );
    expect(changes).toHaveLength(0);
  });

  it("steps UP one level after sustained comfortable headroom", () => {
    cover("adaptive-step-up");
    const c = cfg();
    // 90 fps (> 72 headroom threshold) for the (longer) up sustain window
    const { state, changes } = run(
      [
        [90, 0],
        [90, 3999],
        [90, 4000],
      ],
      c,
      initAdaptiveState(3),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]!.change).toBe(1);
    expect(state.level).toBe(2);
  });

  it("hysteresis: noisy input around target never triggers a change", () => {
    cover("adaptive-hysteresis");
    const noisy: [number, number][] = [];
    for (let i = 0; i < 60; i++) noisy.push([i % 2 === 0 ? 40 : 85, i * 100]);
    const { changes } = run(noisy, cfg());
    expect(changes).toHaveLength(0);
  });

  it("dwell: a second change waits out the minimum dwell time", () => {
    cover("adaptive-hysteresis");
    // fast sustain (100ms) but a 1000ms dwell floor between changes
    const c = cfg({ downSustainMs: 100, dwellMs: 1000 });
    const { changes } = run(
      [
        [40, 0],
        [40, 100], // first step down
        [40, 300], // sustain met again, but dwell (200ms) blocks it
        [40, 1100], // dwell satisfied → second step down
      ],
      c,
    );
    expect(changes.map((c) => c.t)).toEqual([100, 1100]);
    expect(changes.map((c) => c.level)).toEqual([1, 2]);
  });

  it("never steps past the ladder bounds", () => {
    cover("adaptive-step-down");
    const c = cfg();
    // pin at the worst level and keep starving it
    const seq: [number, number][] = [];
    for (let i = 0; i < 40; i++) seq.push([10, i * 1600]);
    const { state } = run(seq, c, initAdaptiveState(c.maxLevel));
    expect(state.level).toBe(c.maxLevel);
  });
});

describe("ordered degradation ladder (settings-perf)", () => {
  it("degrades resolution → particles → shadows → draw distance", () => {
    cover("adaptive-ordered-degradation");
    // monotonic non-increasing cost across every dimension
    for (let i = 1; i < ADAPTIVE_LADDER.length; i++) {
      const prev = ADAPTIVE_LADDER[i - 1]!;
      const cur = ADAPTIVE_LADDER[i]!;
      expect(cur.resolutionScale).toBeLessThanOrEqual(prev.resolutionScale);
      expect(cur.particleDensity).toBeLessThanOrEqual(prev.particleDensity);
      expect(Number(cur.shadows)).toBeLessThanOrEqual(Number(prev.shadows));
      expect(cur.drawDistance).toBeLessThanOrEqual(prev.drawDistance);
    }

    const first = (pred: (i: number) => boolean): number =>
      ADAPTIVE_LADDER.findIndex((_, i) => pred(i));
    const firstResDrop = first((i) => ADAPTIVE_LADDER[i]!.resolutionScale < ADAPTIVE_LADDER[0]!.resolutionScale);
    const firstParticleDrop = first((i) => ADAPTIVE_LADDER[i]!.particleDensity < 1);
    const firstShadowOff = first((i) => ADAPTIVE_LADDER[i]!.shadows === false);
    const firstDrawDrop = first(
      (i) => ADAPTIVE_LADDER[i]!.drawDistance < ADAPTIVE_LADDER[0]!.drawDistance,
    );

    // resolution is sacrificed first, draw distance last
    expect(firstResDrop).toBeLessThan(firstParticleDrop);
    expect(firstParticleDrop).toBeLessThan(firstShadowOff);
    expect(firstShadowOff).toBeLessThan(firstDrawDrop);
    // resolution reaches its floor before particles begin to drop
    expect(ADAPTIVE_LADDER[firstParticleDrop - 1]!.resolutionScale).toBe(
      ADAPTIVE_LADDER[firstParticleDrop]!.resolutionScale,
    );
  });
});

describe("AdaptiveManager rolling window (settings-perf)", () => {
  it("steps down once the rolling frame-cost window shows sustained overrun", () => {
    cover("adaptive-step-down");
    const m = new AdaptiveManager(60);
    let changed = false;
    // feed 40ms frames (25fps capability) for >1.5s worth of samples
    for (let i = 0; i < 120; i++) {
      if (m.sample(40, i * 40)) changed = true;
    }
    expect(changed).toBe(true);
    expect(m.level).toBeGreaterThan(0);
  });
});

/**
 * sp-15. A FIXED preset is a deliberate statement about image quality, so the
 * ladder may nudge its resolution down one rung but must never drag it to the
 * ladder's 0.6 floor — on a DPR-2 display that is a 1.2x-CSS backbuffer that
 * reads as visibly soft. Task #43 context: this is LATENT-RISK hardening, not
 * the walking-judder fix. The judder was measured with resolutionScale pinned
 * at 1.0 and AA on; the instrumented run never stressed the ladder, so this
 * closes the one blind spot that measurement could not rule out on real
 * GPU-bound hardware.
 */
describe("fixed-preset resolution floor (settings-perf)", () => {
  it("never drags a fixed preset below the floor, at any ladder rung", () => {
    cover("fixed-preset-res-floor");
    for (const rung of ADAPTIVE_LADDER) {
      expect(fixedPresetResolution(1.0, rung.resolutionScale)).toBeGreaterThanOrEqual(
        FIXED_PRESET_RES_FLOOR,
      );
    }
    // the bottom of the ladder used to hand 0.6 straight back — the regression
    const bottom = ADAPTIVE_LADDER[ADAPTIVE_LADDER.length - 1]!.resolutionScale;
    expect(bottom).toBeLessThan(FIXED_PRESET_RES_FLOOR); // "auto" still degrades fully
    expect(fixedPresetResolution(1.0, bottom)).toBe(FIXED_PRESET_RES_FLOOR);
  });

  it("still lets the ladder protect fps down to the floor", () => {
    cover("fixed-preset-res-floor");
    expect(fixedPresetResolution(1.0, 1.0)).toBe(1.0); // rung 0: no pull
    expect(fixedPresetResolution(1.0, 0.85)).toBe(0.85); // rung 1: honoured in full
  });

  it("never raises resolution ABOVE the user's own base", () => {
    cover("fixed-preset-res-floor");
    // a user who deliberately picked a low scale keeps it — the floor must not
    // become a way of overriding their choice upward
    expect(fixedPresetResolution(0.5, 1.0)).toBe(0.5);
    expect(fixedPresetResolution(0.5, 0.6)).toBe(0.5);
    expect(fixedPresetResolution(0.7, 0.6)).toBe(0.7);
  });

  it("is monotonic in the ladder rung (never inverts the degradation order)", () => {
    cover("fixed-preset-res-floor");
    const out = [1.0, 0.85, 0.7, 0.6].map((r) => fixedPresetResolution(1.0, r));
    for (let i = 1; i < out.length; i++) expect(out[i]!).toBeLessThanOrEqual(out[i - 1]!);
  });
});
