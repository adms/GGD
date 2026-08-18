/**
 * audio/spatial — GEOMETRY assertions, not call assertions.
 *
 * A test that says "playSfx was called with *a* pan" proves nothing: it stays
 * green if the sign is inverted, if the width is 100× too small to hear, or if
 * the whole field is anchored to the wrong entity. Every assertion below pins a
 * SIGN and a MAGNITUDE against a hand-computed number from the real camera
 * geometry (CAMERA_PITCH_RAD = 68°, yaw ≡ 0, closest zoom DOLLY_MIN = 10,
 * arena zones at x = ±40 with boundaryRadius 24).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  spatialMix,
  panForOffset,
  distanceGain,
  depthTilt,
  relationGain,
  spatialPriority,
  farCutoff,
  PAN_MAX,
  SPATIAL_FAR,
  TEXTURE_FAR,
  type SpatialListener,
  type SfxRelation,
  type SfxClass,
} from "./spatial";

/** Listener at the world origin with both anchors coincident (normal combat). */
const AT_ORIGIN: SpatialListener = { levelX: 0, levelZ: 0, dirX: 0, dirZ: 0 };

const ALL_RELATIONS: SfxRelation[] = ["self", "victim", "enemy", "ally", "third"];
const ALL_CLASSES: SfxClass[] = ["focus", "texture"];

describe("spatial pan — left is negative, right is positive, magnitudes pinned", () => {
  it("puts a source on the listener's LEFT at pan ≈ -0.476, its mirror at +0.476", () => {
    cover("audio-spatial-pan-sign");
    // world X is screen X (camera yaw ≡ 0), so -6 u is six units to screen-left.
    // 0.75 * tanh(-6/8) = 0.75 * -0.635149 = -0.476362
    expect(panForOffset(-6)).toBeCloseTo(-0.4764, 3);
    expect(panForOffset(+6)).toBeCloseTo(+0.4764, 3);
    // and the law is odd, so a mirrored pair can never both duck to one side
    for (const dx of [0.5, 2, 4, 7.5, 13, 40]) {
      expect(panForOffset(-dx)).toBeCloseTo(-panForOffset(dx), 12);
    }
  });

  it("puts a source dead ahead (and one dead behind) at pan ≈ 0", () => {
    cover("audio-spatial-pan-sign");
    expect(Math.abs(panForOffset(0))).toBeLessThan(1e-6);
    // pure depth offset, no lateral offset → still centred. 前後 is NOT pan.
    const ahead = spatialMix(AT_ORIGIN, { x: 0, z: 8, cls: "focus", relation: "enemy" })!;
    const behind = spatialMix(AT_ORIGIN, { x: 0, z: -8, cls: "focus", relation: "enemy" })!;
    expect(Math.abs(ahead.pan)).toBeLessThan(1e-6);
    expect(Math.abs(behind.pan)).toBeLessThan(1e-6);
  });

  it("reaches 0.551 at the visible screen edge and never saturates to ±1", () => {
    cover("audio-spatial-pan-sign");
    // at dolly 10 the framed half-width at the target is 7.52 u — the screen edge
    expect(panForOffset(7.5)).toBeCloseTo(0.551, 2);
    // the off-screen band 0.55..0.75 is reserved for "off-screen, that way"
    expect(panForOffset(12)).toBeGreaterThan(panForOffset(7.5));
    expect(panForOffset(20)).toBeGreaterThan(panForOffset(12));
    // ±1 would empty a channel — never allowed, at any offset
    for (const dx of [7.5, 24, 30, 200, 1e6]) {
      expect(Math.abs(panForOffset(dx))).toBeLessThanOrEqual(PAN_MAX);
      expect(Math.abs(panForOffset(dx))).toBeLessThan(1);
    }
  });

  it("is ZOOM-INDEPENDENT: the law takes world units only, so the field cannot breathe", () => {
    cover("audio-spatial-pan-sign");
    // there is no dolly parameter to pass — that IS the guarantee. A source
    // parked 7.5 u right reads identically however far the player zooms out.
    const a = spatialMix(AT_ORIGIN, { x: 7.5, z: 0, cls: "focus", relation: "enemy" })!;
    const b = spatialMix(AT_ORIGIN, { x: 7.5, z: 0, cls: "focus", relation: "enemy" })!;
    expect(a.pan).toBe(b.pan);
    expect(panForOffset.length).toBe(1); // dx only
  });
});

describe("spatial distance — twice as far is quantifiably quieter", () => {
  it("halves a focus sound at double distance (1/d, NEAR = 4)", () => {
    cover("audio-spatial-distance-curve");
    expect(distanceGain(4, "focus")).toBeCloseTo(1.0, 6); // inside NEAR → unattenuated
    expect(distanceGain(8, "focus")).toBeCloseTo(0.5, 6); // 2× further → −6.0 dB
    expect(distanceGain(16, "focus")).toBeCloseTo(0.25, 6); // 4× → −12.0 dB
    expect(distanceGain(6, "focus")).toBeCloseTo(0.6667, 4);
    expect(distanceGain(24, "focus")).toBeCloseTo(0.1667, 4);
    // exactly the 1/d law: the ratio of two distances IS the inverse gain ratio
    expect(distanceGain(8, "focus") / distanceGain(16, "focus")).toBeCloseTo(2, 6);
  });

  it("drops texture far faster than focus, so chatter clears out of the way", () => {
    cover("audio-spatial-distance-curve");
    expect(distanceGain(3, "texture")).toBeCloseTo(1.0, 6);
    expect(distanceGain(6, "texture")).toBeCloseTo(0.2872, 3); // −10.8 dB
    expect(distanceGain(8, "texture")).toBeCloseTo(0.1712, 3); // −15.3 dB
    // the owner's question: a footstep at your feet vs one 8 u away, both
    // through the authored footstep gain of 0.22
    expect(0.22 * distanceGain(0.2, "texture")).toBeCloseTo(0.22, 4);
    expect(0.22 * distanceGain(8, "texture")).toBeCloseTo(0.0377, 3);
    // and at every distance texture is quieter than focus (never the reverse)
    for (const d of [4, 6, 8, 10, 13]) {
      expect(distanceGain(d, "texture")).toBeLessThan(distanceGain(d, "focus"));
    }
  });

  it("is monotonic — moving away can never get LOUDER", () => {
    cover("audio-spatial-distance-curve");
    for (const cls of ALL_CLASSES) {
      let prev = Infinity;
      for (let d = 0.25; d <= farCutoff(cls); d += 0.25) {
        const g = distanceGain(d, cls);
        expect(g).toBeLessThanOrEqual(prev + 1e-12);
        prev = g;
      }
    }
  });
});

describe("spatial range cutoff — beyond max distance is INAUDIBLE, not faint", () => {
  it("returns null (never play) past the class cutoff, on both sides of the edge", () => {
    cover("audio-spatial-far-cutoff");
    const near = spatialMix(AT_ORIGIN, { x: SPATIAL_FAR - 0.01, z: 0, cls: "focus", relation: "enemy" });
    const far = spatialMix(AT_ORIGIN, { x: SPATIAL_FAR + 0.01, z: 0, cls: "focus", relation: "enemy" });
    expect(near).not.toBeNull();
    expect(far).toBeNull();
    // 31 u — the brief's number
    expect(spatialMix(AT_ORIGIN, { x: 31, z: 0, cls: "focus", relation: "enemy" })).toBeNull();
    // texture cuts much earlier
    expect(spatialMix(AT_ORIGIN, { x: TEXTURE_FAR - 0.01, z: 0, cls: "texture", relation: "enemy" })).not.toBeNull();
    expect(spatialMix(AT_ORIGIN, { x: TEXTURE_FAR + 0.01, z: 0, cls: "texture", relation: "enemy" })).toBeNull();
  });

  it("cuts on distance from the BODY anchor, not from the camera", () => {
    cover("audio-spatial-far-cutoff");
    // free-pan: the camera has wandered 25 u away from the champion. A hit
    // landing ON the champion must stay fully audible.
    const panned: SpatialListener = { levelX: 0, levelZ: 0, dirX: 25, dirZ: 0 };
    const onMe = spatialMix(panned, { x: 0, z: 0, cls: "focus", relation: "victim" })!;
    expect(onMe).not.toBeNull();
    expect(onMe.volume).toBeCloseTo(1, 6); // distance 0, victim, no depth
    // ...and it is panned to where the camera shows it (25 u to screen-left)
    expect(onMe.pan).toBeLessThan(0);
    expect(onMe.pan).toBeCloseTo(panForOffset(-25), 6);
  });

  it("silences the OTHER duel zone as a property, not as a special case", () => {
    cover("audio-spatial-cross-zone");
    // zones centred at x = ±40, boundaryRadius 24 → min cross-zone gap = 32 u.
    // Sample both discs on a lattice; every pair must be null for BOTH classes.
    let pairs = 0;
    for (let lx = -64; lx <= -16; lx += 4) {
      for (let lz = -24; lz <= 24; lz += 4) {
        if ((lx + 40) ** 2 + lz ** 2 > 24 ** 2) continue;
        for (let sx = 16; sx <= 64; sx += 4) {
          for (let sz = -24; sz <= 24; sz += 4) {
            if ((sx - 40) ** 2 + sz ** 2 > 24 ** 2) continue;
            pairs++;
            for (const cls of ALL_CLASSES) {
              expect(
                spatialMix({ levelX: lx, levelZ: lz, dirX: lx, dirZ: lz }, { x: sx, z: sz, cls, relation: "third" }),
              ).toBeNull();
            }
          }
        }
      }
    }
    expect(pairs).toBeGreaterThan(1000); // the lattice actually covered the discs
    // and the margin itself, stated: raising SPATIAL_FAR past 32 breaks this
    expect(SPATIAL_FAR).toBeLessThan(32);
  });
});

describe("spatial depth (前後) — real, asymmetric, and NOT a distance error", () => {
  it("filters the AWAY source and never the TOWARD one, at equal ground distance", () => {
    cover("audio-spatial-depth-tilt");
    const away = spatialMix(AT_ORIGIN, { x: 0, z: +12, cls: "focus", relation: "enemy" })!;
    const toward = spatialMix(AT_ORIGIN, { x: 0, z: -12, cls: "focus", relation: "enemy" })!;
    // same ground distance → same distance gain; the ONLY difference is depth
    expect(away.lowpassHz).toBeCloseTo(3008.48, 1);
    expect(toward.lowpassHz).toBeNull(); // toward the viewer is NEVER filtered
    // ...and the level difference is present but deliberately small
    expect(away.volume / toward.volume).toBeCloseTo(0.7525, 4);
    // both assertions matter: filter difference AND level difference
    expect(away.volume).toBeLessThan(toward.volume);
  });

  it("skips the filter node entirely for shallow depth (the common melee case)", () => {
    cover("audio-spatial-depth-tilt");
    expect(depthTilt(0).lowpassHz).toBeNull();
    expect(depthTilt(-8).lowpassHz).toBeNull();
    expect(depthTilt(1.5).lowpassHz).toBeNull(); // fc > 15 kHz → not worth a node
    expect(depthTilt(2).lowpassHz).toBeCloseTo(14585.33, 1); // just past the skip knee
    // The GAIN stays continuous across the filter-skip knee — the skip is a
    // node-allocation threshold (an inaudible 15 kHz low-pass is not worth a
    // BiquadFilterNode per one-shot), not a change in the depth law. Snapping
    // the trim to 1 at the knee would put an audible step in the middle of a
    // champion walking away from you.
    expect(depthTilt(1.5).gain).toBeCloseTo(0.96906, 4);
    expect(depthTilt(1.83).gain).toBeLessThan(depthTilt(1.82).gain); // no step
    expect(depthTilt(0).gain).toBe(1); // ...but dead-level really is untrimmed
  });

  it("falls monotonically to the 1.6 kHz floor and saturates there", () => {
    cover("audio-spatial-depth-tilt");
    expect(depthTilt(5.5).lowpassHz).toBeCloseTo(8393, -1); // top of the visible patch
    expect(depthTilt(8).lowpassHz).toBeCloseTo(5657, -1);
    expect(depthTilt(16).lowpassHz).toBeCloseTo(1600, 6);
    expect(depthTilt(60).lowpassHz).toBeCloseTo(1600, 6); // saturated, not inverted
    expect(depthTilt(16).gain).toBeCloseTo(0.67, 6);
    expect(depthTilt(60).gain).toBeCloseTo(0.67, 6);
    let prevFc = Infinity;
    for (let dz = 2; dz <= 20; dz += 0.25) {
      const fc = depthTilt(dz).lowpassHz!;
      expect(fc).toBeLessThanOrEqual(prevFc + 1e-9);
      prevFc = fc;
    }
  });

  it("takes depth from the CAMERA anchor and distance from the BODY anchor", () => {
    cover("audio-spatial-depth-tilt");
    // camera 10 u up-screen of the body; source sitting on the body.
    const l: SpatialListener = { levelX: 0, levelZ: 0, dirX: 0, dirZ: 10 };
    const m = spatialMix(l, { x: 0, z: 0, cls: "focus", relation: "victim" })!;
    expect(m.lowpassHz).toBeNull(); // dz = -10 relative to the camera → toward → clean
    expect(m.volume).toBeCloseTo(1, 6); // distance 0 from the body → full level
  });
});

describe("spatial relation — the mixer ONLY attenuates", () => {
  it("never returns a volume above 1, for any relation, class, or geometry", () => {
    cover("audio-spatial-never-amplifies");
    let n = 0;
    for (const relation of ALL_RELATIONS) {
      for (const cls of ALL_CLASSES) {
        for (let x = -30; x <= 30; x += 1.5) {
          for (let z = -30; z <= 30; z += 3) {
            const m = spatialMix(AT_ORIGIN, { x, z, cls, relation });
            if (!m) continue;
            n++;
            expect(m.volume).toBeLessThanOrEqual(1);
            expect(m.volume).toBeGreaterThan(0);
            expect(Math.abs(m.pan)).toBeLessThanOrEqual(PAN_MAX);
          }
        }
      }
    }
    expect(n).toBeGreaterThan(2000);
  });

  it("keeps your own body at full level and ducks everybody else", () => {
    cover("audio-spatial-never-amplifies");
    expect(relationGain("victim")).toBe(1);
    expect(relationGain("self")).toBe(1);
    expect(relationGain("enemy")).toBeLessThan(1);
    expect(relationGain("ally")).toBeLessThan(relationGain("enemy"));
    expect(relationGain("third")).toBeLessThan(relationGain("ally"));
  });
});

describe("spatial priority — relation band first, nearer wins inside a band", () => {
  it("ranks your own cast above a third party's, however early theirs arrived", () => {
    cover("audio-spatial-priority");
    const mine = spatialPriority("self", 0);
    const theirs = spatialPriority("third", 20);
    expect(mine).toBeGreaterThan(theirs);
    // a hit landing on YOU outranks even your own action
    expect(spatialPriority("victim", 0)).toBeGreaterThan(mine);
    // inside one band, closer wins
    expect(spatialPriority("enemy", 2)).toBeGreaterThan(spatialPriority("enemy", 18));
    // THE BANDS MUST NOT TOUCH. The worst-placed victim still beats the
    // best-placed self; otherwise a tie at the extremes falls back to arrival
    // order, which is exactly the lottery this sort exists to remove.
    expect(spatialPriority("victim", SPATIAL_FAR)).toBeGreaterThan(spatialPriority("self", 0));
    expect(spatialPriority("self", SPATIAL_FAR)).toBeGreaterThan(spatialPriority("enemy", 0));
    expect(spatialPriority("enemy", SPATIAL_FAR)).toBeGreaterThan(spatialPriority("ally", 0));
    expect(spatialPriority("ally", SPATIAL_FAR)).toBeGreaterThan(spatialPriority("third", 0));
    // ...and beyond the cutoff the distance term saturates instead of inverting
    expect(spatialPriority("third", 1e6)).toBe(spatialPriority("third", SPATIAL_FAR));
  });
});

describe("spatial hardening — bad input can never reach an AudioParam", () => {
  it("returns null on a non-finite source or listener coordinate", () => {
    cover("audio-spatial-nan-guard");
    expect(spatialMix(AT_ORIGIN, { x: NaN, z: 0, cls: "focus", relation: "enemy" })).toBeNull();
    expect(spatialMix(AT_ORIGIN, { x: 0, z: Infinity, cls: "focus", relation: "enemy" })).toBeNull();
    expect(
      spatialMix({ levelX: NaN, levelZ: 0, dirX: 0, dirZ: 0 }, { x: 0, z: 0, cls: "focus", relation: "enemy" }),
    ).toBeNull();
    expect(
      spatialMix({ levelX: 0, levelZ: 0, dirX: NaN, dirZ: 0 }, { x: 0, z: 0, cls: "focus", relation: "enemy" }),
    ).toBeNull();
  });

  it("produces only finite numbers for every mix it DOES return", () => {
    cover("audio-spatial-nan-guard");
    for (const relation of ALL_RELATIONS) {
      for (const cls of ALL_CLASSES) {
        for (let x = -30; x <= 30; x += 2.5) {
          const m = spatialMix(AT_ORIGIN, { x, z: x / 2, cls, relation });
          if (!m) continue;
          expect(Number.isFinite(m.volume)).toBe(true);
          expect(Number.isFinite(m.pan)).toBe(true);
          expect(Number.isFinite(m.priority)).toBe(true);
          if (m.lowpassHz !== null) expect(Number.isFinite(m.lowpassHz)).toBe(true);
        }
      }
    }
  });
});
