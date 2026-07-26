/**
 * THE #233 GATE — "is the 向天光束 actually on the player's screen?"
 *
 * Same discipline as the #235 gate next door, aimed at the other half of the
 * same disease. #228 shipped a 6.4 u light column for every cast in the game
 * and nobody ever asked whether 6.4 u FITS. It does not: measured over the
 * ground positions the shipped combat camera can see, the whole column is
 * inside the frame at 6% of them. Everywhere else its top — the part that makes
 * a column read as a beam to the sky — is off-screen.
 *
 * This gate walks the REAL visible ground patch, plans a beam at every position
 * with the shipped `castBeamPlan`, and requires the WHOLE beam to be framed
 * wherever the caster's own body is framed. The `PILLAR_HEIGHT` case is the
 * regression proof: it fails.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  checkVisibility,
  combatCameraPose,
  sampleVerticalSegment,
  verticalHeadroom,
  visibleGroundSamples,
} from "../render/effectFraming";
import { BEAM_BODY_H, BEAM_DEFAULT_HEADROOM, castBeamPlan } from "./castBeam";
import { PILLAR_HEIGHT } from "./castPillar";

const ASPECT = 16 / 9;

/** Ground positions the camera can actually see, at the default dolly. */
function framedGround(dolly = 10): { x: number; z: number }[] {
  const pose = combatCameraPose({ x: 0, z: 0 }, { dolly });
  return visibleGroundSamples(pose, { aspect: ASPECT, steps: 25 }).map((s) => ({ x: s.x, z: s.z }));
}

describe("#233 gate — the beam is on screen", () => {
  it("REGRESSION PROOF: the shipped 6.4 u constant fits at ~1 visible ground position in 10", () => {
    cover("cast-beam-framing-regression");
    const pose = combatCameraPose({ x: 0, z: 0 });
    const ground = framedGround();
    expect(ground.length).toBeGreaterThan(10);
    let fits = 0;
    for (const g of ground) {
      const r = checkVisibility(sampleVerticalSegment(g, 0, PILLAR_HEIGHT), pose, { aspect: ASPECT });
      if (r.ok) fits++;
    }
    // 6–10% depending on the sampling grid; the point is that it is a rounding
    // error, not a design.
    expect(fits / ground.length).toBeLessThanOrEqual(0.12);
  });

  it("the PLANNED beam is wholly framed at every position where the caster's body is", () => {
    cover("cast-beam-framing");
    const pose = combatCameraPose({ x: 0, z: 0 });
    for (const g of framedGround()) {
      const headroom = verticalHeadroom(pose, g, { aspect: ASPECT });
      const plan = castBeamPlan({ headroom });
      if (plan.degraded) {
        // the beam is suppressed here — and it is only suppressed where the
        // champion's own head has already left the frame
        expect(headroom).toBeLessThan(BEAM_BODY_H);
        continue;
      }
      const r = checkVisibility(sampleVerticalSegment(g, 0, plan.height), pose, { aspect: ASPECT });
      expect(`(${g.x.toFixed(1)}, ${g.z.toFixed(1)}) h=${plan.height.toFixed(2)}: ${r.reason ?? "ok"}`).toMatch(
        /ok$/,
      );
    }
  });

  it("holds at every dolly the player can reach", () => {
    cover("cast-beam-framing");
    for (const dolly of [10, 16, 24, 40, 90]) {
      const pose = combatCameraPose({ x: 0, z: 0 }, { dolly });
      for (const g of framedGround(dolly)) {
        const plan = castBeamPlan({ headroom: verticalHeadroom(pose, g, { aspect: ASPECT }) });
        if (plan.degraded) continue;
        const r = checkVisibility(sampleVerticalSegment(g, 0, plan.height), pose, { aspect: ASPECT });
        expect(`dolly ${dolly}: ${r.reason ?? "ok"}`).toMatch(/ok$/);
      }
    }
  });

  it("the TIP — the part that makes it read as a beam — is on screen, not just the base", () => {
    cover("cast-beam-framing-regression");
    const pose = combatCameraPose({ x: 0, z: 0 });
    let tipsShown = 0;
    let considered = 0;
    for (const g of framedGround()) {
      const plan = castBeamPlan({ headroom: verticalHeadroom(pose, g, { aspect: ASPECT }) });
      if (plan.degraded) continue;
      considered++;
      const tip = checkVisibility(sampleVerticalSegment(g, plan.height * 0.82, plan.height), pose, {
        aspect: ASPECT,
      });
      if (tip.ok) tipsShown++;
    }
    expect(considered).toBeGreaterThan(5);
    expect(tipsShown).toBe(considered); // 100%, against 6% for the old constant
  });

  it("BEAM_DEFAULT_HEADROOM still matches the real camera (the #161 rot-guard)", () => {
    cover("cast-beam-headroom-guard");
    // The fallback constant used when no camera is available. If a future rig
    // change moves the pitch, the dolly or the fov, THIS fails — which is the
    // alarm nobody had when #161 raised 55° → 68° and quietly invalidated every
    // framing decision #93 had made.
    const measured = verticalHeadroom(combatCameraPose({ x: 0, z: 0 }), { x: 0, z: 0 }, {
      aspect: ASPECT,
    });
    expect(BEAM_DEFAULT_HEADROOM).toBeCloseTo(measured, 2);
  });
});
