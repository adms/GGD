/**
 * THE #235 GATE — "does the player actually see the victory firework?"
 *
 * ---------------------------------------------------------------------------
 * WHY THIS TEST EXISTS
 * ---------------------------------------------------------------------------
 * Task #93's fireworks were unit-tested seven ways: the silhouette reads, the
 * timeline holds, the framing fits every aspect, the volley is short, the gate
 * edge-detects, the shell lifecycle is clean, the facade routes. All seven were
 * green and the owner has never seen a round firework.
 *
 * Every one of those tests asked a question the effect could answer while being
 * invisible. The question none of them asked is the only one that matters:
 *
 *      THROUGH THE CAMERA THE GAME ACTUALLY SHIPS, DOES IT REACH THE SCREEN?
 *
 * It did not. The volley was placed `SMALL_REF_DISTANCE` (22 u) straight down
 * the view axis — and the shipped combat camera (68° pitch, eye 9.27 u) points
 * that axis into the ground, so every shell of every volley lived 9–10.4 u
 * BELOW an opaque, depth-writing arena floor. Perfectly framed in NDC. Zero
 * pixels. Confirmed independently by a frame-stepped headless capture through
 * the real rig: 0 changed pixels versus the same frame with the effect off.
 *
 * This gate re-derives the shells' WORLD positions from the shipped placement
 * math and fails if any of them is off-frame or behind the floor. `takes the
 * pre-#235 placement and FAILS it` is the regression proof: the gate is not
 * vacuous, it really does catch the bug it was written for.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  checkVisibility,
  combatCameraPose,
  settlementFramingPose,
  type EffectSample,
  type FramingPose,
} from "../render/effectFraming";
import {
  SMALL_REF_DISTANCE,
  SMALL_SCREEN_GAIN,
  SMALL_SKY_Y,
  framePoint,
  skyPlacement,
  smallVolley,
} from "./fireworkMath";
import { CHICKEN_DISTANCE, CHICKEN_RISE } from "./ChickenFireworkFx";

const ASPECT = 16 / 9;
const FOV = 0.8;

/** Where the SHIPPED code puts each shell of a volley, in world space. */
function volleyWorldSamples(pose: FramingPose, round: number): EffectSample[] {
  return smallVolley(round).map((shot, i) => {
    const place = skyPlacement(shot.v, FOV, pose.eye.y, pose.fwd.y, pose.up.y);
    const fp = framePoint(shot.u, shot.v, FOV, ASPECT, place.distance);
    return {
      x: pose.eye.x + pose.fwd.x * place.distance + pose.right.x * fp.x + pose.up.x * fp.y,
      y: pose.eye.y + pose.fwd.y * place.distance + pose.right.y * fp.x + pose.up.y * fp.y,
      z: pose.eye.z + pose.fwd.z * place.distance + pose.right.z * fp.x + pose.up.z * fp.y,
      label: `round${round}/shell${i}`,
    };
  });
}

/** Where the PRE-#235 code put them: a fixed distance down the view axis. */
function legacyVolleyWorldSamples(pose: FramingPose, round: number): EffectSample[] {
  return smallVolley(round).map((shot, i) => {
    const fp = framePoint(shot.u, shot.v, FOV, ASPECT, SMALL_REF_DISTANCE);
    return {
      x: pose.eye.x + pose.fwd.x * SMALL_REF_DISTANCE + pose.right.x * fp.x + pose.up.x * fp.y,
      y: pose.eye.y + pose.fwd.y * SMALL_REF_DISTANCE + pose.right.y * fp.x + pose.up.y * fp.y,
      z: pose.eye.z + pose.fwd.z * SMALL_REF_DISTANCE + pose.right.z * fp.x + pose.up.z * fp.y,
      label: `legacy-round${round}/shell${i}`,
    };
  });
}

describe("#235 gate — the round-win volley reaches the screen", () => {
  it("REGRESSION PROOF: the pre-#235 placement fails this gate, 100% occluded", () => {
    cover("victory-framing-regression");
    const pose = combatCameraPose({ x: 0, z: 0 });
    const r = checkVisibility(legacyVolleyWorldSamples(pose, 1), pose, { aspect: ASPECT });
    expect(r.ok).toBe(false);
    expect(r.onFrameFraction).toBe(1); // it WAS framed — that is the trap
    expect(r.occludedFraction).toBe(1); // …and entirely under the floor
    expect(r.visibleFraction).toBe(0);
    expect(r.reason).toMatch(/behind the arena floor/);
  });

  it("every shell of every round is on-frame AND above the floor at the default dolly", () => {
    cover("victory-framing-visible");
    const pose = combatCameraPose({ x: 0, z: 0 });
    for (let round = 1; round <= 8; round++) {
      const r = checkVisibility(volleyWorldSamples(pose, round), pose, { aspect: ASPECT });
      expect(r.reason ?? "ok").toBe("ok");
      expect(r.visibleFraction).toBe(1);
    }
  });

  it("holds at every dolly the player can reach, and on a 4:3 viewport", () => {
    cover("victory-framing-visible");
    for (const dolly of [10, 16, 24, 40, 90]) {
      const pose = combatCameraPose({ x: 0, z: 0 }, { dolly });
      for (const aspect of [4 / 3, 16 / 9, 21 / 9]) {
        const r = checkVisibility(volleyWorldSamples(pose, 3), pose, { aspect });
        expect(`${dolly}/${aspect.toFixed(2)}: ${r.reason ?? "ok"}`).toMatch(/ok$/);
      }
    }
  });

  it("holds when the camera has panned off the arena centre", () => {
    cover("victory-framing-visible");
    for (const target of [
      { x: 0, z: 0 },
      { x: 9, z: -7 },
      { x: -14, z: 11 },
    ]) {
      const pose = combatCameraPose(target);
      const r = checkVisibility(volleyWorldSamples(pose, 2), pose, {
        aspect: ASPECT,
        floorCenter: { x: 0, z: 0 },
      });
      expect(r.reason ?? "ok").toBe("ok");
    }
  });

  it("bursts in the SKY over the arena, clear of champions and of the prop-height cap", () => {
    cover("victory-framing-visible");
    const pose = combatCameraPose({ x: 0, z: 0 });
    for (const s of volleyWorldSamples(pose, 5)) {
      expect(s.y).toBeCloseTo(SMALL_SKY_Y, 5);
    }
    expect(SMALL_SKY_Y).toBeGreaterThan(2.4); // the #29/#103 prop-height cap
    expect(SMALL_SKY_Y).toBeLessThan(combatCameraPose({ x: 0, z: 0 }).eye.y);
  });

  it("keeps the AUTHORED on-screen framing: the same (u,v) lands at the same NDC", () => {
    cover("victory-framing-authored");
    const pose = combatCameraPose({ x: 0, z: 0 });
    for (const shot of smallVolley(4)) {
      const place = skyPlacement(shot.v, FOV, pose.eye.y, pose.fwd.y, pose.up.y);
      const fp = framePoint(shot.u, shot.v, FOV, ASPECT, place.distance);
      const halfH = Math.tan(FOV / 2) * place.distance;
      expect(fp.y / halfH).toBeCloseTo(shot.v, 6);
      expect(fp.x / (halfH * ASPECT)).toBeCloseTo(shot.u, 6);
    }
  });

  it("scales the burst so it is not a speck: 2.8× the authored on-screen size", () => {
    cover("victory-framing-authored");
    const pose = combatCameraPose({ x: 0, z: 0 });
    const place = skyPlacement(0.4, FOV, pose.eye.y, pose.fwd.y, pose.up.y);
    // measured headroom puts the sky plane ~5 u out, ~4.4× closer than the
    // 22 u the look was authored at; the gain rides on top of that ratio
    expect(place.distance).toBeGreaterThan(4);
    expect(place.distance).toBeLessThan(6);
    expect(place.scale).toBeCloseTo((place.distance / SMALL_REF_DISTANCE) * SMALL_SCREEN_GAIN, 6);
  });

  it("never divides by zero when the view ray cannot reach the sky plane", () => {
    cover("victory-framing-authored");
    // a camera looking straight up, and one exactly level: both fall back
    for (const [fwdY, upY] of [
      [1, 0],
      [0, 1],
    ] as const) {
      const p = skyPlacement(0, FOV, 1.2, fwdY, upY);
      expect(Number.isFinite(p.distance)).toBe(true);
      expect(p.distance).toBeGreaterThan(0);
    }
  });
});

describe("#235 — the match-win chicken was NOT the broken half", () => {
  it("is above the floor and on-frame through the REAL settlement hero shot", () => {
    cover("victory-framing-chicken");
    for (const elapsed of [0, 900, 2400]) {
      const pose = settlementFramingPose({ x: 4, z: -3 }, { x: 0.3, z: 0.95 }, elapsed);
      const rise = Math.tan(FOV / 2) * CHICKEN_DISTANCE * CHICKEN_RISE;
      const centre = {
        x: pose.eye.x + pose.fwd.x * CHICKEN_DISTANCE + pose.up.x * rise,
        y: pose.eye.y + pose.fwd.y * CHICKEN_DISTANCE + pose.up.y * rise,
        z: pose.eye.z + pose.fwd.z * CHICKEN_DISTANCE + pose.up.z * rise,
        label: `chicken@${elapsed}`,
      };
      const r = checkVisibility([centre], pose, { aspect: ASPECT });
      expect(r.reason ?? "ok").toBe("ok");
      expect(centre.y).toBeGreaterThan(0);
    }
  });
});
