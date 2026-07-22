/**
 * The roast chicken's acceptance criterion is "can a player tell it is a roast
 * chicken?", and that is not a thing a unit test can assert — it was settled by
 * rendering the cloud and looking at it, over seven iterations.
 *
 * What these tests DO assert is every structural property that, when it was
 * absent, made the silhouette fail. The shape was REDESIGNED after three blind
 * judges unanimously read the first version as "a cat/fox face with two ears";
 * these assertions now pin the corrected pose so the ears cannot come back:
 *
 *   • two DISTINCT drumsticks (mass on both sides) over a CONVEX breast that
 *     fills the centre — a concave valley there was the forehead that made it
 *     a face; the bone tips still stay separate at the very top
 *   • two bone knuckles on top, and them being the highest points
 *   • the dish: below everything, WIDER than the bird, and COOL against the
 *     bird's warm gold, so it reads as a platter
 *   • the TIGHT-V splay window (~17°): near-vertical, close-together clubs read
 *     as trussed drumsticks; widen past ~28° and the ears return
 *   • no wing and no tail — the first version had both and read as a bat
 *   • the thigh/breast creases
 *
 * So a future edit that "tidies up" one of these gets a failing test naming
 * the joke it broke, instead of silently shipping a face with ears.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  CHICKEN_BOUNDS,
  CHICKEN_DEFAULTS,
  chickenLegGroups,
  partHistogram,
  sampleChickenSilhouette,
  sdChicken,
  type SilhouettePoint,
} from "./chickenSilhouette";

const pts = sampleChickenSilhouette();
const of = (f: (p: SilhouettePoint) => boolean): SilhouettePoint[] => pts.filter(f);
const maxY = (a: SilhouettePoint[]): number => Math.max(...a.map((p) => p.y));
const maxAbsX = (a: SilhouettePoint[]): number => Math.max(...a.map((p) => Math.abs(p.x)));
const mean = (a: SilhouettePoint[], k: "r" | "g" | "b"): number =>
  a.reduce((s, p) => s + p[k], 0) / a.length;

describe("roast-chicken silhouette", () => {
  it("samples a dense, bounded, deterministic cloud", () => {
    cover("firework-chicken-shape");
    expect(pts.length).toBeGreaterThan(1200); // enough to read at full screen
    expect(pts.length).toBeLessThanOrEqual(CHICKEN_DEFAULTS.maxPoints);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(CHICKEN_BOUNDS.minX - 0.01);
      expect(p.x).toBeLessThanOrEqual(CHICKEN_BOUNDS.maxX + 0.01);
      expect(p.y).toBeGreaterThanOrEqual(CHICKEN_BOUNDS.minY - 0.01);
      expect(p.y).toBeLessThanOrEqual(CHICKEN_BOUNDS.maxY + 0.01);
    }
    const again = sampleChickenSilhouette();
    expect(again.length).toBe(pts.length);
    expect(again[0]).toEqual(pts[0]);
    expect(again[pts.length - 1]).toEqual(pts[pts.length - 1]);
  });

  it("puts every point on or inside the shape (no strays in the void)", () => {
    // the rim pass projects with 2 Newton steps, so allow a hair of overshoot
    const worst = Math.max(...pts.map((p) => sdChicken(p.x, p.y)));
    expect(worst).toBeLessThan(0.02);
  });

  it("reads as two distinct drumsticks, not one blob and not a face", () => {
    cover("firework-chicken-shape");
    // real mass on BOTH sides at leg height — two limbs, not one lump
    expect(of((p) => p.y > 0.35 && p.x < -0.18).length).toBeGreaterThan(30);
    expect(of((p) => p.y > 0.35 && p.x > 0.18).length).toBeGreaterThan(30);
    // the two BONE tips stay separate at the very top: a clear gap on the
    // centreline up where the knuckles are, so it never fuses into one horn
    expect(of((p) => p.y > 0.52 && Math.abs(p.x) < 0.08)).toHaveLength(0);
  });

  it("shows a CONVEX breast between the legs (not a forehead-valley)", () => {
    // the centre column has to climb up between the legs, so the eye reads one
    // plump body with two things on top. A concave dip here was the forehead
    // that made three judges call the whole thing a cat's head.
    const centre = of((p) => Math.abs(p.x) < 0.1);
    expect(maxY(centre)).toBeGreaterThan(0.28);
  });

  it("caps each leg with a bone knuckle, and the knuckles are the highest points", () => {
    cover("firework-chicken-shape");
    const knuckles = of((p) => p.part === "knuckle");
    expect(knuckles.length).toBeGreaterThan(40);
    expect(of((p) => p.part === "knuckle" && p.x < 0).length).toBeGreaterThan(15);
    expect(of((p) => p.part === "knuckle" && p.x > 0).length).toBeGreaterThan(15);
    expect(maxY(knuckles)).toBeCloseTo(maxY(pts), 5); // nothing is above the bone
    // bone is white, meat is not: this survives the droop when shape does not
    expect(mean(knuckles, "b")).toBeGreaterThan(0.7);
    expect(mean(of((p) => p.part === "body"), "b")).toBeLessThan(0.35);
  });

  it("holds the drumsticks in a TIGHT near-vertical V (not splayed like ears)", () => {
    // The rejected version splayed 49°: two things pointing up-and-out from a
    // round mass is an ears/horns silhouette. The fix is a tight V — the legs
    // stand up close and near-vertical, so they read as trussed drumsticks.
    // ABOVE ~28° the ears come back; measured from the leg's body attach.
    for (const [side, sign] of [["left", -1], ["right", 1]] as const) {
      const k = of((p) => p.part === "knuckle" && Math.sign(p.x) === sign);
      const cx = k.reduce((s, p) => s + Math.abs(p.x), 0) / k.length;
      const cy = k.reduce((s, p) => s + p.y, 0) / k.length;
      const deg = (Math.atan2(cx - 0.19, cy - 0.075) * 180) / Math.PI;
      expect(deg, `${side} drumstick splay`).toBeGreaterThan(8);
      expect(deg, `${side} drumstick splay`).toBeLessThan(28);
    }
  });

  it("sets the bird on a dish that is lower, wider and COOLER than it", () => {
    cover("firework-chicken-shape");
    const plate = of((p) => p.part === "plate");
    const body = of((p) => p.part === "body");
    expect(plate.length).toBeGreaterThan(150);
    // entirely below the body — a dish under the bird, not a belt around it
    expect(maxY(plate)).toBeLessThan(-0.4);
    // wider than the bird, so it reads as a platter and not as the bird's base
    expect(maxAbsX(plate)).toBeGreaterThan(maxAbsX(body) * 1.2);
    // the ONE cold value in the effect
    expect(mean(plate, "b")).toBeGreaterThan(mean(plate, "r"));
    expect(mean(body, "r")).toBeGreaterThan(mean(body, "b") * 3);
  });

  it("has NO wing and NO tail (they made it read as a bat)", () => {
    const h = partHistogram(pts);
    expect(h.wing).toBe(0);
    expect(h.tail).toBe(0);
  });

  it("draws a crease where each thigh disappears into the breast", () => {
    // rim points STRICTLY inside the union = the leg's own contour, followed a
    // short way past where the body swallows it
    const creases = of((p) => p.rim && sdChicken(p.x, p.y) < -0.012);
    expect(creases.length).toBeGreaterThan(15);
    // ...but only a short way: following it all the way traces the buried
    // thigh bulge as a full RING, and two rings on a face-shaped mass read as
    // goggles (measurably worse than having no crease at all)
    const deepest = Math.min(...creases.map((p) => sdChicken(p.x, p.y)));
    expect(deepest).toBeGreaterThan(-0.13);
  });

  it("outlines the shape as well as filling it", () => {
    const rim = of((p) => p.rim);
    expect(rim.length).toBeGreaterThan(300);
    expect(rim.length).toBeLessThan(pts.length * 0.6); // an outline, not a wireframe
  });

  it("exposes the two legs as separate groups for the crease pass", () => {
    const groups = chickenLegGroups();
    expect(groups).toHaveLength(2);
    for (const g of groups) expect(g.length).toBeGreaterThanOrEqual(4);
    // mirrored: same parts, opposite sides
    expect(groups[0]!.map((p) => p.part)).toEqual(groups[1]!.map((p) => p.part));
  });

  it("scales density with the sampling pitch without losing any body part", () => {
    cover("firework-chicken-shape");
    // the quality tiers coarsen the pitch; a low tier must still be a WHOLE
    // bird, because a chicken missing a drumstick is not a cheaper chicken
    const coarse = sampleChickenSilhouette({
      fillSpacing: CHICKEN_DEFAULTS.fillSpacing * 2,
      rimSpacing: CHICKEN_DEFAULTS.rimSpacing * 1.6,
    });
    expect(coarse.length).toBeLessThan(pts.length);
    const h = partHistogram(coarse);
    expect(h.plate).toBeGreaterThan(0);
    expect(h.body).toBeGreaterThan(0);
    expect(h.thigh).toBeGreaterThan(0);
    expect(h.shank).toBeGreaterThan(0);
    expect(h.knuckle).toBeGreaterThan(0);
  });
});
