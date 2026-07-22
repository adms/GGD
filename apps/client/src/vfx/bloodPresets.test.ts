/**
 * vfx-blood-spray (task #39), pure half: the 濺血 layer is DIRECTIONAL — its
 * cone is derived from the damage vector (attacker → victim), it scales with
 * damage magnitude, it lives inside the 0.12–0.35 s impact band, and it is
 * standard-blend dark red (additive red glows pink and reads as fire, which is
 * exactly how WC3-era "blood" ended up looking like sparks).
 *
 * The ground pool fades to EXACTLY zero and never brightens on the way.
 * The stylized style keeps the shape but drops every drop of red AND the
 * ground pool — energy dissipates, it does not leave a puddle.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { stopsAscending } from "./vfxPresets";
import {
  BLOOD_TINT,
  DECAL_LIFE_MS,
  DEFAULT_SPRAY_DIR,
  MAX_DROPLET_LIFE,
  MIN_DROPLET_LIFE,
  STYLIZED_TINTS,
  bloodRecipe,
  damageScale,
  decalFade,
  severityForHit,
  sprayCone,
  sprayDirection,
  type HitSeverity,
} from "./bloodPresets";

const SEVERITIES: HitSeverity[] = ["light", "heavy", "crit"];

describe("damage vector → spray direction (vfx-blood-spray)", () => {
  it("is the UNIT attacker→victim vector", () => {
    cover("vfx-blood-spray");
    const d = sprayDirection({ x: 0, z: 0 }, { x: 3, z: 4 });
    expect(d.x).toBeCloseTo(0.6, 6);
    expect(d.z).toBeCloseTo(0.8, 6);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1, 6);
  });

  it("points the OTHER way when the attacker is on the other side", () => {
    cover("vfx-blood-spray");
    const a = sprayDirection({ x: 5, z: 0 }, { x: 0, z: 0 });
    const b = sprayDirection({ x: -5, z: 0 }, { x: 0, z: 0 });
    expect(a.x).toBeCloseTo(-1, 6);
    expect(b.x).toBeCloseTo(1, 6);
  });

  it("falls back (never NaN) when the two points coincide or are unknown", () => {
    cover("vfx-blood-spray");
    expect(sprayDirection({ x: 2, z: 2 }, { x: 2, z: 2 })).toEqual(DEFAULT_SPRAY_DIR);
    expect(sprayDirection(null, { x: 1, z: 1 })).toEqual(DEFAULT_SPRAY_DIR);
    expect(sprayDirection({ x: 1, z: 1 }, undefined)).toEqual(DEFAULT_SPRAY_DIR);
    const custom = { x: 1, z: 0 };
    expect(sprayDirection({ x: 0, z: 0 }, { x: 0, z: 0 }, custom)).toBe(custom);
  });

  it("the velocity cone is CENTRED on the damage vector", () => {
    cover("vfx-blood-spray");
    const dir = { x: 0.6, z: -0.8 };
    const { d1, d2 } = sprayCone(dir, 0.5, 0.55);
    // midpoint of the component-wise range == the aim vector (+ up bias)
    expect((d1[0] + d2[0]) / 2).toBeCloseTo(dir.x, 6);
    expect((d1[2] + d2[2]) / 2).toBeCloseTo(dir.z, 6);
    expect((d1[1] + d2[1]) / 2).toBeCloseTo(0.55, 6);
    // and it is a real cone, not a point
    expect(d2[0] - d1[0]).toBeCloseTo(1.0, 6);
  });

  it("a zero spread collapses the cone onto the damage vector exactly", () => {
    cover("vfx-blood-spray");
    const { d1, d2 } = sprayCone({ x: 0, z: 1 }, 0, 0.4);
    expect(d1).toEqual([0, 0.4, 1]);
    expect(d2).toEqual([0, 0.4, 1]);
  });
});

describe("severity + magnitude (vfx-blood-spray)", () => {
  it("crits and killing blows always spray the most", () => {
    cover("vfx-blood-spray");
    expect(severityForHit(3, { crit: true })).toBe("crit");
    expect(severityForHit(3, { killingBlow: true })).toBe("crit");
    expect(severityForHit(200)).toBe("heavy");
    expect(severityForHit(12)).toBe("light");
  });

  it("droplet count grows monotonically with severity", () => {
    cover("vfx-blood-spray");
    const counts = SEVERITIES.map((s) => bloodRecipe("blood", s, 1)!.droplets.count);
    expect(counts[0]!).toBeLessThan(counts[1]!);
    expect(counts[1]!).toBeLessThan(counts[2]!);
  });

  it("damageScale is 0 at no damage and saturates at 1", () => {
    cover("vfx-blood-spray");
    expect(damageScale(0)).toBe(0);
    expect(damageScale(-5)).toBe(0);
    expect(damageScale(30)).toBeGreaterThan(0);
    expect(damageScale(30)).toBeLessThan(1);
    expect(damageScale(999)).toBe(1);
  });
});

describe("blood recipe (vfx-blood-spray)", () => {
  it("style `off` produces NOTHING to fire", () => {
    cover("vfx-blood-spray");
    for (const s of SEVERITIES) expect(bloodRecipe("off", s, 1)).toBeNull();
  });

  it("intensity 0 also produces nothing (the same early-out)", () => {
    cover("vfx-blood-spray");
    expect(bloodRecipe("blood", "crit", 0)).toBeNull();
    expect(bloodRecipe("stylized", "crit", 0)).toBeNull();
  });

  it("intensity scales counts and decal opacity, never below 1 particle", () => {
    cover("vfx-blood-spray");
    const full = bloodRecipe("blood", "heavy", 1)!;
    const half = bloodRecipe("blood", "heavy", 0.5)!;
    const tiny = bloodRecipe("blood", "heavy", 0.02)!;
    expect(half.droplets.count).toBeLessThan(full.droplets.count);
    expect(tiny.droplets.count).toBeGreaterThanOrEqual(1);
    expect(half.decal!.alpha).toBeLessThan(full.decal!.alpha);
  });

  it("lives inside the 0.12–0.35 s impact band at every severity", () => {
    cover("vfx-blood-spray");
    for (const s of SEVERITIES) {
      const r = bloodRecipe("blood", s, 1)!;
      expect(r.droplets.lifetimeSec.min).toBeGreaterThanOrEqual(MIN_DROPLET_LIFE);
      expect(r.droplets.lifetimeSec.max).toBeLessThanOrEqual(MAX_DROPLET_LIFE);
      expect(r.droplets.lifetimeSec.min).toBeLessThanOrEqual(r.droplets.lifetimeSec.max);
      // the mist is even shorter — it is a flash of weight, not a smoke cloud
      expect(r.mist.lifetimeSec.max).toBeLessThan(r.droplets.lifetimeSec.max);
    }
  });

  it("is standard-blend, dark red, gravity-heavy and stretched", () => {
    cover("vfx-blood-spray");
    const r = bloodRecipe("blood", "heavy", 1)!;
    expect(r.droplets.blend).toBe("alpha"); // NOT additive: red additive = fire
    expect(r.droplets.stretched).toBe(true);
    expect(r.droplets.gravityY!).toBeLessThan(-10); // droplets fall harder than sparks
    expect(r.droplets.directed).toBeDefined(); // it is aimed, not a ball
    const first = r.droplets.colorStops[0]![1];
    expect(first[0]).toBeCloseTo(BLOOD_TINT[0], 6);
    expect(first[0]).toBeGreaterThan(first[1] * 4); // unmistakably red
    expect(first[0]).toBeGreaterThan(first[2] * 4);
  });

  it("every gradient is monotonic and ends transparent", () => {
    cover("vfx-blood-spray");
    for (const style of ["blood", "stylized"] as const) {
      for (const s of SEVERITIES) {
        const r = bloodRecipe(style, s, 1)!;
        for (const layer of [r.droplets, r.mist]) {
          expect(stopsAscending(layer.colorStops)).toBe(true);
          expect(stopsAscending(layer.sizeStops)).toBe(true);
          expect(layer.colorStops[layer.colorStops.length - 1]![1][3]).toBe(0);
        }
      }
    }
  });
});

describe("stylized style (vfx-gore-style)", () => {
  it("has NO red and NO ground pool — energy leaves nothing behind", () => {
    cover("vfx-gore-style");
    for (const s of SEVERITIES) {
      const r = bloodRecipe("stylized", s, 1)!;
      expect(r.decal).toBeNull();
      expect(r.droplets.blend).toBe("additive"); // energy, not fluid
      const [red, green, blue] = r.droplets.colorStops[1]![1];
      // the tint stop is the damage-type colour. A warm gold legitimately has
      // a full red channel — what must never appear is BLOOD red, i.e. a hue
      // where red overwhelms both other channels.
      expect(red > green * 2 && red > blue * 2).toBe(false);
      expect([red, green, blue]).not.toEqual([...BLOOD_TINT]);
    }
  });

  it("tints by damage type", () => {
    cover("vfx-gore-style");
    const magic = bloodRecipe("stylized", "heavy", 1, "magic")!;
    const phys = bloodRecipe("stylized", "heavy", 1, "physical")!;
    expect(magic.droplets.colorStops[1]![1].slice(0, 3)).toEqual([...STYLIZED_TINTS.magic]);
    expect(phys.droplets.colorStops[1]![1].slice(0, 3)).toEqual([...STYLIZED_TINTS.physical]);
  });

  it("blood keeps its red whatever the damage type is", () => {
    cover("vfx-gore-style");
    for (const t of ["physical", "magic", "true"] as const) {
      expect(bloodRecipe("blood", "heavy", 1, t)!.droplets.colorStops[0]![1][0]).toBeCloseTo(
        BLOOD_TINT[0],
        6,
      );
    }
  });
});

describe("ground pool fade (vfx-blood-decal)", () => {
  it("holds, then fades to EXACTLY zero, never brightening", () => {
    cover("vfx-blood-decal");
    expect(decalFade(0)).toBe(1);
    expect(decalFade(0.2)).toBe(1);
    expect(decalFade(1)).toBe(0);
    expect(decalFade(5)).toBe(0);
    expect(decalFade(-1)).toBe(1);
    let prev = Infinity;
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const a = decalFade(t);
      expect(a).toBeLessThanOrEqual(prev + 1e-9);
      prev = a;
    }
  });

  it("the pool lingers ~1.5 s — long enough to register, short enough to forget", () => {
    cover("vfx-blood-decal");
    expect(DECAL_LIFE_MS).toBe(1500);
    for (const s of SEVERITIES) {
      expect(bloodRecipe("blood", s, 1)!.decal!.lifeMs).toBe(DECAL_LIFE_MS);
    }
  });

  it("a heavier hit leaves a bigger pool", () => {
    cover("vfx-blood-decal");
    const radii = SEVERITIES.map((s) => bloodRecipe("blood", s, 1)!.decal!.radius);
    expect(radii[0]!).toBeLessThan(radii[1]!);
    expect(radii[1]!).toBeLessThan(radii[2]!);
  });
});
