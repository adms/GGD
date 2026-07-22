/**
 * Pure animation math for the login scene — camera drift, island layout/bob,
 * cloud wrap, glow pulse, analyser level. No Babylon, no GPU.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  cameraDrift,
  writeCameraDrift,
  islandLayout,
  islandBob,
  wrapDrift,
  glowPulse,
  analyserLevel,
  cycleTime,
  staggerOffset,
  shockwaveRadius,
  writeBeamState,
  writeExplosionState,
  writeFlashState,
  writeDragonPoint,
  roarVolume,
  panFromScreenX,
  type CameraDriftConfig,
  type CameraPose,
  type BeamPhaseConfig,
  type BeamState,
  type ExplosionPhaseConfig,
  type ExplosionState,
  type FlashPhaseConfig,
  type FlashState,
  type DragonPathConfig,
  type RoarVolumeConfig,
  type Vec3Like,
} from "./math";

const DRIFT: CameraDriftConfig = {
  baseAlpha: -Math.PI / 2,
  baseBeta: 1.1,
  baseRadius: 30,
  baseTargetY: 3,
  orbitSpeed: 0.02,
  alphaAmp: 0.05,
  alphaSpeed: 0.08,
  betaAmp: 0.06,
  betaSpeed: 0.05,
  radiusAmp: 2,
  radiusSpeed: 0.04,
  targetYAmp: 1,
  targetYSpeed: 0.06,
};

describe("cameraDrift", () => {
  it("at t=0 equals the base pose (all sines vanish)", () => {
    cover("login-camera-drift");
    const p = cameraDrift(0, DRIFT);
    expect(p.alpha).toBeCloseTo(DRIFT.baseAlpha);
    expect(p.beta).toBeCloseTo(DRIFT.baseBeta);
    expect(p.radius).toBeCloseTo(DRIFT.baseRadius);
    expect(p.targetY).toBeCloseTo(DRIFT.baseTargetY);
  });

  it("orbits continuously (alpha grows) while bob axes stay bounded", () => {
    cover("login-camera-drift");
    const a0 = cameraDrift(0, DRIFT).alpha;
    const a100 = cameraDrift(100, DRIFT).alpha;
    // linear orbit term dominates the small alpha sway → monotone over 100 s
    expect(a100).toBeGreaterThan(a0 + DRIFT.orbitSpeed * 100 - DRIFT.alphaAmp * 2);
    for (let t = 0; t <= 200; t += 7) {
      const p = cameraDrift(t, DRIFT);
      expect(Math.abs(p.beta - DRIFT.baseBeta)).toBeLessThanOrEqual(DRIFT.betaAmp + 1e-9);
      expect(Math.abs(p.radius - DRIFT.baseRadius)).toBeLessThanOrEqual(DRIFT.radiusAmp + 1e-9);
      expect(Math.abs(p.targetY - DRIFT.baseTargetY)).toBeLessThanOrEqual(DRIFT.targetYAmp + 1e-9);
    }
  });

  it("writeCameraDrift mutates the out object (allocation-free path)", () => {
    cover("login-camera-drift");
    const out: CameraPose = { alpha: 0, beta: 0, radius: 0, targetY: 0 };
    const ret = writeCameraDrift(out, 5, DRIFT);
    expect(ret).toBe(out);
    expect(out).toEqual(cameraDrift(5, DRIFT));
  });
});

describe("islandLayout", () => {
  it("is deterministic, sized, and spatially distinct", () => {
    cover("login-island-layout");
    const a = islandLayout(5);
    const b = islandLayout(5);
    expect(a).toHaveLength(5);
    expect(a).toEqual(b); // no RNG → identical every boot
    // no two islands share a position
    const keys = new Set(a.map((s) => `${s.x.toFixed(3)},${s.y.toFixed(3)},${s.z.toFixed(3)}`));
    expect(keys.size).toBe(5);
    for (const s of a) {
      expect(s.scale).toBeGreaterThan(0);
      expect(Number.isFinite(s.x + s.y + s.z)).toBe(true);
    }
  });

  it("spins some islands each way (both signs present)", () => {
    cover("login-island-layout");
    const specs = islandLayout(8);
    const signs = new Set(specs.map((s) => Math.sign(s.spinSpeed)));
    expect(signs.has(1)).toBe(true);
    expect(signs.has(-1)).toBe(true);
  });
});

describe("islandBob", () => {
  it("bobs within amplitude around base y and advances rotation", () => {
    cover("login-island-bob");
    const [s] = islandLayout(1);
    expect(s).toBeTruthy();
    for (let t = 0; t <= 40; t += 3) {
      const p = islandBob(t, s!);
      expect(Math.abs(p.y - s!.y)).toBeLessThanOrEqual(s!.bobAmp + 1e-9);
    }
    const r0 = islandBob(0, s!).rotationY;
    const r10 = islandBob(10, s!).rotationY;
    expect(r10).not.toBeCloseTo(r0); // yaw advances over time
    expect(r0).toBeCloseTo(s!.spinPhase);
  });
});

describe("wrapDrift", () => {
  it("advances and folds back into range", () => {
    cover("login-cloud-wrap");
    expect(wrapDrift(0, 1, 1, -10, 10)).toBeCloseTo(1);
    // drifting past max wraps to the low side
    const w = wrapDrift(9.5, 1, 1, -10, 10);
    expect(w).toBeGreaterThanOrEqual(-10);
    expect(w).toBeLessThanOrEqual(10);
    expect(w).toBeCloseTo(-9.5);
  });

  it("stays in range for an arbitrarily large dt (hidden-tab catch-up)", () => {
    cover("login-cloud-wrap");
    for (const dt of [0.016, 1, 60, 100000]) {
      const w = wrapDrift(3, 2.5, dt, -20, 20);
      expect(w).toBeGreaterThanOrEqual(-20);
      expect(w).toBeLessThanOrEqual(20);
    }
  });

  it("is a no-op for a degenerate range", () => {
    cover("login-cloud-wrap");
    expect(wrapDrift(5, 3, 1, 4, 4)).toBe(5);
  });
});

describe("glowPulse", () => {
  it("breathes within [base, base+amp] with no audio", () => {
    cover("login-glow-pulse");
    const cfg = { base: 0.8, amp: 0.3, speed: 1.1, audioBoost: 0.5 };
    for (let t = 0; t <= 20; t += 0.5) {
      const v = glowPulse(t, cfg);
      expect(v).toBeGreaterThanOrEqual(cfg.base - 1e-9);
      expect(v).toBeLessThanOrEqual(cfg.base + cfg.amp + 1e-9);
    }
  });

  it("adds a bounded audio push clamped to 0..1", () => {
    cover("login-glow-pulse");
    const cfg = { base: 0.8, amp: 0.3, speed: 1.1, audioBoost: 0.5 };
    const quiet = glowPulse(2, cfg, 0);
    const loud = glowPulse(2, cfg, 1);
    expect(loud).toBeCloseTo(quiet + cfg.audioBoost);
    // over-range audio is clamped (no runaway glow)
    expect(glowPulse(2, cfg, 9)).toBeCloseTo(loud);
    expect(glowPulse(2, cfg, -9)).toBeCloseTo(quiet);
  });
});

describe("analyserLevel", () => {
  it("normalises the byte mean to 0..1", () => {
    cover("login-analyser-level");
    expect(analyserLevel(new Uint8Array([]))).toBe(0);
    expect(analyserLevel(new Uint8Array([0, 0, 0]))).toBe(0);
    expect(analyserLevel(new Uint8Array([255, 255]))).toBeCloseTo(1);
    expect(analyserLevel(new Uint8Array([128, 0]))).toBeCloseTo(0.251, 2);
  });
});

// ---------------------------------------------------------------------------
// boss-battle FX schedulers
// ---------------------------------------------------------------------------

describe("cameraDrift reveal", () => {
  it("starts pulled back by revealRadius at t=0 and eases back to base", () => {
    cover("login-camera-reveal");
    const cfg: CameraDriftConfig = { ...DRIFT, revealRadius: 12, revealTau: 5 };
    // at t=0 all bob sines vanish → radius = base + full reveal
    expect(cameraDrift(0, cfg).radius).toBeCloseTo(cfg.baseRadius + 12);
    // the reveal decays: much smaller extra after several tau, and monotone-ish down
    const early = cameraDrift(0, cfg).radius - cfg.baseRadius;
    const late = cameraDrift(40, cfg).radius - cfg.baseRadius; // ~8τ → tiny reveal + bob
    expect(late).toBeLessThan(early);
    expect(late).toBeLessThan(cfg.radiusAmp + 0.5); // reveal essentially gone
  });

  it("with no reveal fields is identical to the plain base pose (back-compat)", () => {
    cover("login-camera-reveal");
    expect(cameraDrift(0, DRIFT).radius).toBeCloseTo(DRIFT.baseRadius);
  });
});

describe("cycleTime / staggerOffset", () => {
  it("folds (t+offset) into [0, period)", () => {
    cover("login-cycle-stagger");
    expect(cycleTime(0, 10, 0)).toBe(0);
    expect(cycleTime(3, 10, 0)).toBe(3);
    expect(cycleTime(13, 10, 0)).toBeCloseTo(3);
    expect(cycleTime(0, 10, 4)).toBe(4);
    // negative offset still folds into range
    const c = cycleTime(0, 10, -3);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThan(10);
    expect(c).toBeCloseTo(7);
    expect(cycleTime(5, 0, 0)).toBe(0); // degenerate period
  });

  it("spreads emitters across the period with distinct offsets", () => {
    cover("login-cycle-stagger");
    const offs = [0, 1, 2, 3].map((i) => staggerOffset(i, 4, 12));
    for (const o of offs) {
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThan(12);
    }
    expect(new Set(offs.map((o) => o.toFixed(4))).size).toBe(4); // all distinct
    expect(staggerOffset(0, 0, 12)).toBe(0); // degenerate count
  });
});

describe("shockwaveRadius", () => {
  it("expands from 0 to maxRadius, monotone, clamped outside [0,1]", () => {
    cover("login-shockwave-radius");
    expect(shockwaveRadius(0, 6)).toBeCloseTo(0);
    expect(shockwaveRadius(1, 6)).toBeCloseTo(6);
    expect(shockwaveRadius(-2, 6)).toBeCloseTo(0); // clamp low
    expect(shockwaveRadius(9, 6)).toBeCloseTo(6); // clamp high
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.1) {
      const r = shockwaveRadius(p, 6);
      expect(r).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = r;
    }
  });
});

describe("writeBeamState", () => {
  const cfg: BeamPhaseConfig = { period: 10, charge: 2, fire: 1, shockwave: 0.8, maxRadius: 6 };
  const mk = (): BeamState => ({ charging: false, firing: false, chargeK: 0, beamK: 0, shockK: 0, shockRadius: 0 });

  it("walks charge → fire (+shockwave) → idle deterministically", () => {
    cover("login-beam-schedule");
    const out = mk();
    // charge ramp
    writeBeamState(out, 0, 0, cfg);
    expect(out.charging).toBe(true);
    expect(out.chargeK).toBeCloseTo(0);
    writeBeamState(out, 1, 0, cfg);
    expect(out.charging).toBe(true);
    expect(out.chargeK).toBeCloseTo(0.5);
    // firing + shockwave at mid-fire
    writeBeamState(out, 2.4, 0, cfg);
    expect(out.firing).toBe(true);
    expect(out.beamK).toBeGreaterThan(0.5);
    expect(out.shockRadius).toBeGreaterThan(0);
    expect(out.shockK).toBeGreaterThan(0);
    expect(out.shockRadius).toBeCloseTo(shockwaveRadius(0.5, 6));
    // idle deep in the cooldown → everything off
    writeBeamState(out, 5, 0, cfg);
    expect(out.charging).toBe(false);
    expect(out.firing).toBe(false);
    expect(out.beamK).toBe(0);
    expect(out.shockK).toBe(0);
  });

  it("writes into the caller's struct and is staggered by offset", () => {
    cover("login-beam-schedule");
    const out = mk();
    expect(writeBeamState(out, 0, 0, cfg)).toBe(out);
    const a = mk();
    const b = mk();
    writeBeamState(a, 0, 0, cfg); // charging
    writeBeamState(b, 0, cfg.period / 2, cfg); // half a period out → idle
    expect(a.charging).toBe(true);
    expect(b.charging || b.firing).toBe(false);
  });
});

describe("writeExplosionState", () => {
  const cfg: ExplosionPhaseConfig = { period: 6, duration: 1.4, maxRadius: 3 };
  const mk = (): ExplosionState => ({ active: false, k: 0, radius: 0, coreAlpha: 0, smokeAlpha: 0, flash: 0 });

  it("keeps every channel bounded and fires for some t (deterministic)", () => {
    cover("login-explosion-schedule");
    const out = mk();
    let sawActive = false;
    for (let t = 0; t <= 30; t += 0.05) {
      writeExplosionState(out, t, 0, cfg);
      expect(out.radius).toBeGreaterThanOrEqual(0);
      expect(out.radius).toBeLessThanOrEqual(cfg.maxRadius + 1e-9);
      for (const v of [out.k, out.coreAlpha, out.smokeAlpha, out.flash]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1 + 1e-9);
      }
      if (out.active) sawActive = true;
    }
    expect(sawActive).toBe(true);
    // deterministic: same (t,index) → same snapshot
    const a = mk();
    const bb = mk();
    writeExplosionState(a, 3.3, 2, cfg);
    writeExplosionState(bb, 3.3, 2, cfg);
    expect(bb).toEqual(a);
  });

  it("radius grows across a single blast and sites are staggered", () => {
    cover("login-explosion-schedule");
    const out = mk();
    // find the first frame index 0 is active, then check radius climbs
    let tOn = -1;
    for (let t = 0; t <= 12; t += 0.05) {
      writeExplosionState(out, t, 0, cfg);
      if (out.active) {
        tOn = t;
        break;
      }
    }
    expect(tOn).toBeGreaterThanOrEqual(0);
    const r0 = (writeExplosionState(out, tOn, 0, cfg), out.radius);
    const r1 = (writeExplosionState(out, tOn + 0.1, 0, cfg), out.radius);
    const r2 = (writeExplosionState(out, tOn + 0.2, 0, cfg), out.radius);
    expect(r1).toBeGreaterThan(r0);
    expect(r2).toBeGreaterThan(r1);
    // stagger: two sites are not always active together
    const oa = mk();
    const ob = mk();
    let xorSeen = false;
    for (let t = 0; t <= 60; t += 0.05) {
      writeExplosionState(oa, t, 0, cfg);
      writeExplosionState(ob, t, 1, cfg);
      if (oa.active !== ob.active) {
        xorSeen = true;
        break;
      }
    }
    expect(xorSeen).toBe(true);
  });
});

describe("writeFlashState", () => {
  const cfg: FlashPhaseConfig = { period: 2.4, duration: 0.5 };
  const mk = (): FlashState => ({ active: false, k: 0, alpha: 0, scale: 0 });

  it("pops bounded alpha/scale, fires, and is staggered per point", () => {
    cover("login-flash-schedule");
    const out = mk();
    let sawActive = false;
    for (let t = 0; t <= 20; t += 0.02) {
      writeFlashState(out, t, 0, cfg);
      expect(out.alpha).toBeGreaterThanOrEqual(0);
      expect(out.alpha).toBeLessThanOrEqual(1 + 1e-9);
      if (out.active) {
        expect(out.scale).toBeGreaterThan(0);
        sawActive = true;
      }
    }
    expect(sawActive).toBe(true);
    const oa = mk();
    const ob = mk();
    let xorSeen = false;
    for (let t = 0; t <= 30; t += 0.02) {
      writeFlashState(oa, t, 0, cfg);
      writeFlashState(ob, t, 3, cfg);
      if (oa.active !== ob.active) {
        xorSeen = true;
        break;
      }
    }
    expect(xorSeen).toBe(true);
  });
});

describe("writeDragonPoint", () => {
  const cfg: DragonPathConfig = {
    centerX: 1,
    centerY: 9,
    centerZ: -4,
    radiusX: 24,
    radiusZ: 18,
    height: 5,
    loopSpeed: 0.16,
    weaveSpeed: 0.9,
    phase: 0.3,
  };

  it("writes a bounded, deterministic, moving path into the out vector", () => {
    cover("login-dragon-path");
    const out: Vec3Like = { x: 0, y: 0, z: 0 };
    expect(writeDragonPoint(out, 0, cfg)).toBe(out); // allocation-free path
    for (let t = 0; t <= 120; t += 0.7) {
      writeDragonPoint(out, t, cfg);
      expect(Math.abs(out.x - cfg.centerX)).toBeLessThanOrEqual(cfg.radiusX * 1.2 + 1e-6);
      expect(Math.abs(out.z - cfg.centerZ)).toBeLessThanOrEqual(cfg.radiusZ * 1.2 + 1e-6);
      expect(Math.abs(out.y - cfg.centerY)).toBeLessThanOrEqual(cfg.height * 1.35 + 1e-6);
    }
    // deterministic + actually moves
    const a: Vec3Like = { x: 0, y: 0, z: 0 };
    const b: Vec3Like = { x: 0, y: 0, z: 0 };
    writeDragonPoint(a, 5, cfg);
    writeDragonPoint(b, 5, cfg);
    expect(b).toEqual(a);
    writeDragonPoint(b, 6.5, cfg);
    expect(b.x !== a.x || b.y !== a.y || b.z !== a.z).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// dragon roar volume / pan (login-immersion #20)
// ---------------------------------------------------------------------------

describe("roarVolume", () => {
  const cfg: RoarVolumeConfig = { nearDist: 10, farDist: 60, nearVolume: 1.2, farVolume: 0.4 };

  it("is loud when close, quiet when far, and monotone decreasing between", () => {
    cover("login-roar-volume");
    // clamped at/inside the near edge → full near volume
    expect(roarVolume(0, cfg)).toBeCloseTo(cfg.nearVolume);
    expect(roarVolume(10, cfg)).toBeCloseTo(cfg.nearVolume);
    // clamped at/beyond the far edge → full far volume
    expect(roarVolume(60, cfg)).toBeCloseTo(cfg.farVolume);
    expect(roarVolume(1000, cfg)).toBeCloseTo(cfg.farVolume);
    // midpoint = halfway between near and far
    expect(roarVolume(35, cfg)).toBeCloseTo((cfg.nearVolume + cfg.farVolume) / 2);
    // strictly decreasing across the band
    let prev = Infinity;
    for (let d = 0; d <= 80; d += 5) {
      const v = roarVolume(d, cfg);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      expect(v).toBeGreaterThanOrEqual(cfg.farVolume - 1e-9);
      expect(v).toBeLessThanOrEqual(cfg.nearVolume + 1e-9);
      prev = v;
    }
  });

  it("collapses a degenerate band (farDist ≤ nearDist) to nearVolume", () => {
    cover("login-roar-volume");
    const bad: RoarVolumeConfig = { nearDist: 40, farDist: 40, nearVolume: 0.9, farVolume: 0.2 };
    expect(roarVolume(5, bad)).toBeCloseTo(0.9);
    expect(roarVolume(100, bad)).toBeCloseTo(0.9);
  });
});

describe("panFromScreenX", () => {
  it("maps screen-x across a viewport to a clamped -1..1 pan", () => {
    cover("login-roar-pan");
    expect(panFromScreenX(0, 800)).toBeCloseTo(-1); // far left
    expect(panFromScreenX(400, 800)).toBeCloseTo(0); // centre
    expect(panFromScreenX(800, 800)).toBeCloseTo(1); // far right
    // off-screen projections clamp instead of overshooting the pan range
    expect(panFromScreenX(-500, 800)).toBeCloseTo(-1);
    expect(panFromScreenX(1600, 800)).toBeCloseTo(1);
  });

  it("returns centred (0) for non-finite input or a zero-width viewport", () => {
    cover("login-roar-pan");
    expect(panFromScreenX(NaN, 800)).toBe(0);
    expect(panFromScreenX(Infinity, 800)).toBe(0);
    expect(panFromScreenX(400, 0)).toBe(0);
    expect(panFromScreenX(400, -10)).toBe(0);
  });
});
