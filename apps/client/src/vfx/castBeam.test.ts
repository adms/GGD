/**
 * castBeam — the #233 向天光束 planner: how tall the beam may be, and whether
 * the cast it announces can actually be dodged.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { INTERP_DELAY_MS } from "@ggd/shared/constants";
import {
  BEAM_BODY_H,
  BEAM_HEADROOM_USE,
  BEAM_MAX_H,
  BEAM_MIN_H,
  BEAM_TIP_FRACTION,
  COMFORTABLE_SLACK_MS,
  HUMAN_REACTION_MS,
  TELEGRAPH_LEGIBLE_FRACTION,
  TICK_MS,
  beamKnotHeight,
  beamRiseProfile,
  beamTiming,
  beamVerdict,
  castBeamPlan,
} from "./castBeam";
import { PILLAR_HEIGHT, RISE_FRACTION } from "./castPillar";

describe("beam plan — height comes from the frame, not from a constant", () => {
  it("spends the measured headroom and stays wholly inside it", () => {
    cover("cast-beam-plan");
    for (const headroom of [2.0, 3.4, 5.17, 6.0]) {
      const p = castBeamPlan({ headroom });
      expect(p.height).toBeCloseTo(Math.min(BEAM_MAX_H, headroom * BEAM_HEADROOM_USE), 6);
      expect(p.height).toBeLessThanOrEqual(headroom);
      expect(p.onFrameFraction).toBe(1);
      expect(p.degraded).toBe(false);
    }
  });

  it("caps at the #228 authored height however far the camera zooms out", () => {
    cover("cast-beam-plan");
    expect(castBeamPlan({ headroom: 21 }).height).toBe(BEAM_MAX_H);
    expect(BEAM_MAX_H).toBe(PILLAR_HEIGHT); // one definition, not two
  });

  it("never draws a column shorter than the champion casting it", () => {
    cover("cast-beam-plan");
    expect(castBeamPlan({ headroom: 0.4 }).height).toBe(BEAM_MIN_H);
    expect(BEAM_MIN_H).toBe(BEAM_BODY_H);
  });

  it("DEGRADES at the frame edge instead of drawing half a column", () => {
    cover("cast-beam-plan");
    const p = castBeamPlan({ headroom: 1.0 });
    expect(p.bodyFramed).toBe(false);
    expect(p.degraded).toBe(true);
    expect(p.onFrameFraction).toBeLessThan(1);
    // the fairness yardstick: the beam degrades exactly where the caster's own
    // body has already left the frame, never before
    expect(castBeamPlan({ headroom: BEAM_BODY_H }).degraded).toBe(false);
  });

  it("survives a garbage headroom (no camera yet, NaN) without producing NaN", () => {
    cover("cast-beam-plan");
    for (const h of [NaN, -3, Infinity]) {
      const p = castBeamPlan({ headroom: h });
      expect(Number.isFinite(p.height)).toBe(true);
      expect(p.height).toBeGreaterThan(0);
    }
  });
});

describe("beam timing — which casts the telegraph can and cannot help", () => {
  it("budget = window − fade-in − interp delay − reaction − one tick", () => {
    cover("cast-beam-timing");
    const t = beamTiming(600);
    expect(t.legibleAtMs).toBeCloseTo(600 * TELEGRAPH_LEGIBLE_FRACTION, 6);
    expect(t.reactionBudgetMs).toBeCloseTo(
      600 - 600 * TELEGRAPH_LEGIBLE_FRACTION - INTERP_DELAY_MS - HUMAN_REACTION_MS - TICK_MS,
      6,
    );
  });

  it("grades the seven shipped cast-time tiers honestly", () => {
    cover("cast-beam-timing");
    // The content ships EXACTLY these seven values (castTimeFormula's 0.1 s
    // ladder). Anything that says "the telegraph lets you dodge" has to hold up
    // at 0.3 s, and it does not.
    expect(beamVerdict(300)).toBe("notice");
    expect(beamVerdict(400)).toBe("notice");
    expect(beamVerdict(500)).toBe("marginal");
    expect(beamVerdict(600)).toBe("reactable");
    expect(beamVerdict(700)).toBe("reactable");
    expect(beamVerdict(800)).toBe("reactable");
    expect(beamVerdict(900)).toBe("reactable");
  });

  it("an ability with no cast window is `instant` — there is nothing to announce", () => {
    cover("cast-beam-timing");
    for (const v of [0, null, undefined, NaN]) expect(beamVerdict(v as number)).toBe("instant");
  });

  it("`reactable` really does mean COMFORTABLY reactable", () => {
    cover("cast-beam-timing");
    expect(beamTiming(600).reactionBudgetMs).toBeGreaterThanOrEqual(COMFORTABLE_SLACK_MS);
    expect(beamTiming(500).reactionBudgetMs).toBeGreaterThan(0);
    expect(beamTiming(400).reactionBudgetMs).toBeLessThanOrEqual(0);
  });

  it("is monotone: a longer wind-up never grades worse", () => {
    cover("cast-beam-timing");
    const order = { instant: 0, notice: 1, marginal: 2, reactable: 3 };
    let prev = -1;
    for (let ms = 100; ms <= 1200; ms += 25) {
      const v = order[beamVerdict(ms)];
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("the descending impact knot", () => {
  it("touches the floor exactly when the ability resolves", () => {
    cover("cast-beam-knot");
    expect(beamKnotHeight(1, "reactable")).toBeCloseTo(0, 6);
  });

  it("waits at the tip while the beam is still erupting, then falls linearly", () => {
    cover("cast-beam-knot");
    expect(beamKnotHeight(0, "reactable")).toBe(1);
    expect(beamKnotHeight(RISE_FRACTION * 0.5, "reactable")).toBe(1);
    const mid = (1 + RISE_FRACTION) / 2;
    expect(beamKnotHeight(mid, "reactable")).toBeCloseTo(0.5, 6);
    // linear, deliberately: an eased countdown lies about the last 100 ms
    const a = beamKnotHeight(0.5, "reactable")!;
    const b = beamKnotHeight(0.6, "reactable")!;
    const c = beamKnotHeight(0.7, "reactable")!;
    expect(a - b).toBeCloseTo(b - c, 6);
  });

  it("is NOT drawn for a cast nobody can react to — a countdown to an unavoidable hit is a lie", () => {
    cover("cast-beam-knot");
    expect(beamKnotHeight(0.5, "notice")).toBeNull();
    expect(beamKnotHeight(0.5, "instant")).toBeNull();
    expect(beamKnotHeight(0.5, "marginal")).not.toBeNull();
  });

  it("clamps outside 0..1 rather than running past the tip or under the floor", () => {
    cover("cast-beam-knot");
    expect(beamKnotHeight(-5, "reactable")).toBe(1);
    expect(beamKnotHeight(9, "reactable")).toBeCloseTo(0, 6);
  });
});

describe("the vertical brightness profile", () => {
  it("is still brightest at the FOOT — the column erupts from the ground", () => {
    cover("cast-beam-framing");
    expect(beamRiseProfile(0)).toBeGreaterThan(beamRiseProfile(0.5));
  });

  it("has a TIP FLARE so the beam visibly ends instead of dissolving", () => {
    cover("cast-beam-framing");
    const tip = 1 - BEAM_TIP_FRACTION * 0.5;
    expect(beamRiseProfile(tip)).toBeGreaterThan(beamRiseProfile(0.6));
    expect(beamRiseProfile(tip)).toBeGreaterThan(beamRiseProfile(0.5));
  });

  it("never goes dark or negative anywhere on the column", () => {
    cover("cast-beam-framing");
    for (let t = 0; t <= 1.0001; t += 0.02) {
      expect(beamRiseProfile(t)).toBeGreaterThan(0.15);
      expect(beamRiseProfile(t)).toBeLessThan(1.6);
    }
  });
});
