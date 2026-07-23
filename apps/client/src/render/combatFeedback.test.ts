/**
 * combat-juice pure math (client): camera-shake magnitude / decay / duration,
 * the hitstop window derived from a damage amount, the hit-flash colour per
 * damage type, and the quality-tier gates that keep the fps baseline. All pure
 * — no Babylon, no DOM.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  SHAKE_MAX_AMP,
  FLASH_MS,
  FLASH_ALPHA,
  flashColorFor,
  asImpactProfile,
  planImpactFeedback,
  tierWeight,
  type ImpactProfile,
  type ImpactTier,
  impactShakeAmp,
  shakeDurationMs,
  shakeDecayEnvelope,
  heavyPostFxEnabled,
  cameraShakeScaleFor,
  hitstopShiver,
  HITSTOP_SHIVER_AMP,
  HITSTOP_SHIVER_TAPER_MS,
} from "./combatFeedback";

/** Client mirror of the sim's per-tier cosmetic defaults (test helper). */
const SHAKE_BY_TIER: Record<ImpactTier, number> = { light: 0.35, medium: 0.6, heavy: 0.85, crit: 1.0 };
const CAMKICK_BY_TIER: Record<ImpactTier, number> = { light: 0.15, medium: 0.3, heavy: 0.5, crit: 0.65 };
const FLASHMS_BY_TIER: Record<ImpactTier, number> = { light: 90, medium: 120, heavy: 160, crit: 200 };

/** A minimal well-formed profile for a given tier + hitstop (test helper). */
const profileOf = (tier: ImpactTier, hitstopTicks: number, over: Partial<ImpactProfile> = {}): ImpactProfile => ({
  tier,
  hitstopTicks,
  hitstunTicks: hitstopTicks + 2,
  knockbackDir: { x: 1, z: 0 },
  knockbackMag: 0,
  isEX: false,
  isBlock: false,
  shakeMag: SHAKE_BY_TIER[tier],
  shakeStyle: tier === "crit" ? "omni" : "directional",
  sparkKind: tier === "heavy" || tier === "crit" ? "heavy" : "hit",
  flashColor: [1, 0.25, 0.2],
  flashMs: FLASHMS_BY_TIER[tier],
  camKick: CAMKICK_BY_TIER[tier],
  exFreeze: 0,
  ...over,
});

describe("shake impulse decay math (juice-shake)", () => {
  it("envelope is 1 at birth, 0 at/after the end, and monotonically decreasing", () => {
    cover("juice-shake");
    expect(shakeDecayEnvelope(0, 300)).toBe(1);
    expect(shakeDecayEnvelope(300, 300)).toBe(0);
    expect(shakeDecayEnvelope(400, 300)).toBe(0); // past the end clamps to 0
    let prev = Infinity;
    for (let age = 0; age <= 300; age += 30) {
      const v = shakeDecayEnvelope(age, 300);
      expect(v).toBeLessThanOrEqual(prev);
      expect(v).toBeGreaterThanOrEqual(0);
      prev = v;
    }
  });

  it("guards a zero/negative duration", () => {
    cover("juice-shake");
    expect(shakeDecayEnvelope(0, 0)).toBe(1);
    expect(shakeDecayEnvelope(5, 0)).toBe(0);
  });

  it("impactShakeAmp grows with damage, is bigger on crit/kill, and clamps", () => {
    cover("juice-shake");
    const base = impactShakeAmp({ amount: 50, taken: true });
    expect(base).toBeGreaterThan(0);
    expect(impactShakeAmp({ amount: 100, taken: true })).toBeGreaterThan(base);
    expect(impactShakeAmp({ amount: 50, taken: true, crit: true })).toBeGreaterThan(base);
    expect(impactShakeAmp({ amount: 50, taken: true, killingBlow: true })).toBeGreaterThan(
      impactShakeAmp({ amount: 50, taken: true, crit: true }),
    );
    // taking a hit shakes harder than landing your own
    expect(impactShakeAmp({ amount: 60, taken: true })).toBeGreaterThan(
      impactShakeAmp({ amount: 60, taken: false }),
    );
    // never exceeds the cap even for a huge crit killing blow
    expect(impactShakeAmp({ amount: 99999, taken: true, crit: true, killingBlow: true })).toBe(
      SHAKE_MAX_AMP,
    );
    expect(impactShakeAmp({ amount: 0, taken: true })).toBe(0);
  });

  it("shakeDurationMs grows with amplitude and stays CRISP-bounded (收尾精準)", () => {
    cover("juice-shake");
    // retuned crisp: a heavy hit rings ≤260ms (was 460), a light ~120ms
    expect(shakeDurationMs(0)).toBeCloseTo(120, 0);
    expect(shakeDurationMs(SHAKE_MAX_AMP)).toBeCloseTo(260, 0);
    expect(shakeDurationMs(2)).toBeLessThanOrEqual(260); // clamps beyond max amp
    expect(shakeDurationMs(SHAKE_MAX_AMP / 2)).toBeGreaterThan(shakeDurationMs(0));
  });

  it("cubic decay dies HARDER than the old quadratic tail (crisp settle)", () => {
    cover("juice-shake");
    // at 70% of the window the cubic tail is ~2.7%, well under the old ~9%
    expect(shakeDecayEnvelope(210, 300)).toBeCloseTo(0.3 ** 3, 6);
    expect(shakeDecayEnvelope(210, 300)).toBeLessThan(0.3 ** 2); // strictly harder than quadratic
  });
});

describe("impact profile narrowing (juice-profile)", () => {
  it("narrows a well-formed wire payload and rejects malformed ones", () => {
    cover("juice-profile");
    const p = asImpactProfile({
      tier: "heavy",
      hitstopTicks: 5,
      hitstunTicks: 8,
      knockbackDir: { x: 1, z: 0 },
      knockbackMag: 2,
      isEX: false,
      isBlock: true,
    });
    expect(p).not.toBeNull();
    expect(p!.tier).toBe("heavy");
    expect(p!.hitstopTicks).toBe(5);
    expect(p!.isBlock).toBe(true);

    // absent / malformed → null (never throws on an unknown wire payload)
    expect(asImpactProfile(undefined)).toBeNull();
    expect(asImpactProfile(null)).toBeNull();
    expect(asImpactProfile({})).toBeNull(); // no tier
    expect(asImpactProfile({ tier: "bogus", hitstopTicks: 3 })).toBeNull();
    expect(asImpactProfile({ tier: "light" })).toBeNull(); // no hitstopTicks
    // a missing knockbackDir defaults to {0,0} rather than throwing
    const q = asImpactProfile({ tier: "light", hitstopTicks: 2 })!;
    expect(q.knockbackDir).toEqual({ x: 0, z: 0 });
  });

  it("narrows the 7 cosmetic hints, and backfills a pre-#133 payload from the tier", () => {
    cover("juice-profile-cosmetics");
    // present → carried verbatim (the client mirror consumes them for spark/camera)
    const full = asImpactProfile({
      tier: "crit",
      hitstopTicks: 8,
      shakeMag: 1.3,
      shakeStyle: "omni",
      sparkKind: "counter",
      flashColor: [1, 0.2, 0.15],
      flashMs: 200,
      camKick: 0.7,
      exFreeze: 8,
      isEX: true,
    })!;
    expect(full.shakeMag).toBe(1.3);
    expect(full.shakeStyle).toBe("omni");
    expect(full.sparkKind).toBe("counter");
    expect(full.flashColor).toEqual([1, 0.2, 0.15]);
    expect(full.camKick).toBe(0.7);
    expect(full.exFreeze).toBe(8);

    // ABSENT (old replay) → tier-derived defaults, never undefined
    const old = asImpactProfile({ tier: "heavy", hitstopTicks: 5 })!;
    expect(old.shakeMag).toBe(0.85); // heavy default
    expect(old.shakeStyle).toBe("directional");
    expect(old.sparkKind).toBe("hit");
    expect(old.flashMs).toBe(160);
    expect(old.camKick).toBe(0.5);
    expect(old.exFreeze).toBe(0);
    // a bogus sparkKind is rejected to the safe default, not passed through
    expect(asImpactProfile({ tier: "light", hitstopTicks: 2, sparkKind: "sword" })!.sparkKind).toBe("hit");
    // EX with no explicit fields defaults to omni + a cosmetic freeze
    const ex = asImpactProfile({ tier: "medium", hitstopTicks: 3, isEX: true })!;
    expect(ex.shakeStyle).toBe("omni");
    expect(ex.exFreeze).toBeGreaterThan(0);
  });
});

describe("shake request carries the directional-kick cosmetics (juice-shake-directional)", () => {
  it("plan.shake exposes amp (from shakeMag), style, kb dir + a tier-scaled camKick", () => {
    cover("juice-shake-directional");
    const heavy = planImpactFeedback(
      profileOf("heavy", 5, { shakeMag: 0.85, shakeStyle: "directional", camKick: 0.5, knockbackDir: { x: 0, z: -1 } }),
      { tickMs: 33.3 },
    );
    expect(heavy.shake.style).toBe("directional");
    expect(heavy.shake.camKick).toBeCloseTo(0.5, 6);
    expect(heavy.shake.dir).toEqual({ x: 0, z: -1 });
    // amp follows shakeMag (× the world-unit cap), clamped
    expect(heavy.shake.amp).toBeGreaterThan(0);
    expect(heavy.shake.amp).toBeLessThanOrEqual(SHAKE_MAX_AMP);
    // an EX/crit omni hit reports omni + a bigger kick than a light hit
    const omni = planImpactFeedback(profileOf("crit", 8, { shakeStyle: "omni", camKick: 0.65 }), { tickMs: 33.3 });
    expect(omni.shake.style).toBe("omni");
    expect(omni.shake.camKick).toBeGreaterThan(
      planImpactFeedback(profileOf("light", 2, { camKick: 0.15 }), { tickMs: 33.3 }).shake.camKick,
    );
  });
});

describe("hitstop micro-jitter math (juice-hitstop-shiver)", () => {
  it("buzzes WHILE frozen, is sub-1px, snaps to zero at the window end (收尾精準)", () => {
    cover("juice-hitstop-shiver");
    const end = 10_000;
    // inside the window → a small non-zero offset, bounded by the peak amp
    const s = hitstopShiver(9_800, end, 0);
    expect(Math.hypot(s.x, s.z)).toBeGreaterThan(0);
    expect(Math.abs(s.x)).toBeLessThanOrEqual(HITSTOP_SHIVER_AMP + 1e-9);
    expect(Math.abs(s.z)).toBeLessThanOrEqual(HITSTOP_SHIVER_AMP + 1e-9);
    // at / past the end there is ZERO offset — no lingering settle tail
    expect(hitstopShiver(end, end, 0)).toEqual({ x: 0, z: 0 });
    expect(hitstopShiver(end + 5, end, 0)).toEqual({ x: 0, z: 0 });
    // amplitude tapers DOWN over the last slice so the release is clean: at
    // half the taper window (remain = TAPER/2) each axis is capped at HALF the
    // peak, so the vector magnitude cannot exceed (0.5·amp)·√2.
    const halfTaper = hitstopShiver(end - HITSTOP_SHIVER_TAPER_MS / 2, end, 0.3);
    expect(Math.abs(halfTaper.x)).toBeLessThanOrEqual(HITSTOP_SHIVER_AMP * 0.5 + 1e-9);
    expect(Math.abs(halfTaper.z)).toBeLessThanOrEqual(HITSTOP_SHIVER_AMP * 0.5 + 1e-9);
    // two different phases don't move in lock-step
    expect(hitstopShiver(9_800, end, 0)).not.toEqual(hitstopShiver(9_800, end, 1.5));
  });
});

describe("planImpactFeedback orchestrator (juice-hitstop / juice-orchestrator)", () => {
  it("freeze is AUTHORITATIVE — from profile.hitstopTicks, never re-derived from damage", () => {
    cover("juice-hitstop");
    // a chip hit that the sim did NOT freeze (hitstopTicks 0) → no client freeze,
    // regardless of tier. This is the fix: the client stops re-deriving a curve.
    expect(planImpactFeedback(profileOf("light", 0), { tickMs: 33.3 }).freezeMs).toBe(0);
    // heavier sim freeze → longer client window, exactly ticks × tickMs
    const p = planImpactFeedback(profileOf("heavy", 5), { tickMs: 33.3 });
    expect(p.freezeTicks).toBe(5);
    expect(p.freezeMs).toBeCloseTo(5 * 33.3, 5);
  });

  it("a FULLY-BLOCKED hit (dmg 0) still freezes both bodies when the sim froze", () => {
    cover("juice-hitstop");
    // dmg is irrelevant to the plan — a blocked hit carries a real hitstopTicks.
    const plan = planImpactFeedback(profileOf("medium", 3, { isBlock: true }), { tickMs: 33.3 });
    expect(plan.isBlock).toBe(true);
    expect(plan.freezeMs).toBeGreaterThan(0); // still freezes, unlike the old amount-driven curve
  });

  it("every channel scales by the SAME tier (weight monotonic light→crit)", () => {
    cover("juice-orchestrator");
    const tiers: ImpactTier[] = ["light", "medium", "heavy", "crit"];
    const weights = tiers.map((t) => tierWeight(t));
    for (let i = 1; i < weights.length; i++) expect(weights[i]!).toBeGreaterThan(weights[i - 1]!);

    // flash strength + duration + shake amp all grow with the tier
    const plans = tiers.map((t) => planImpactFeedback(profileOf(t, 3), { tickMs: 33.3 }));
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i]!.victimFlash.alpha).toBeGreaterThan(plans[i - 1]!.victimFlash.alpha);
      expect(plans[i]!.victimFlash.ms).toBeGreaterThanOrEqual(plans[i - 1]!.victimFlash.ms);
      expect(plans[i]!.attackerFlash.alpha).toBeGreaterThan(plans[i - 1]!.attackerFlash.alpha);
      expect(plans[i]!.shake.amp).toBeGreaterThan(plans[i - 1]!.shake.amp);
    }
    // flashes stay crisp — even a crit clears well under 200 ms (收尾精準)
    expect(plans[3]!.victimFlash.ms).toBeLessThan(200);
    // shake amp never exceeds the cap
    expect(plans[3]!.shake.amp).toBeLessThanOrEqual(SHAKE_MAX_AMP);
  });

  it("victim flash colour follows dmgType; attacker pop is white; shake carries the kb dir", () => {
    cover("juice-orchestrator");
    const magic = planImpactFeedback(profileOf("medium", 3, { knockbackDir: { x: 0, z: -1 } }), {
      dmgType: "magic",
      tickMs: 33.3,
    });
    expect(magic.victimFlash.rgb).toEqual(flashColorFor("magic"));
    expect(magic.attackerFlash.rgb).toEqual([1, 1, 1]); // "I connected" white pop
    expect(magic.shake.dir).toEqual({ x: 0, z: -1 }); // knockback vector forwarded for the camera wave

    const phys = planImpactFeedback(profileOf("medium", 3), { dmgType: "physical", tickMs: 33.3 });
    expect(phys.victimFlash.rgb).toEqual(flashColorFor("physical"));
  });
});

describe("hit flash colour (juice-flash)", () => {
  it("RED on every damage type, with a distinguishable magic variant", () => {
    cover("juice-flash");
    for (const type of ["physical", "true", undefined]) {
      const c = flashColorFor(type);
      expect(c[0]).toBe(1); // full red channel
      expect(c[1]).toBeLessThan(0.4); // green pulled down
      expect(c[2]).toBeLessThan(0.4); // blue pulled down
    }
    const magic = flashColorFor("magic");
    expect(magic[0]).toBe(1);
    expect(magic).not.toEqual(flashColorFor("physical")); // type still reads
    // long enough to survive a frame hitch, short enough not to smear
    expect(FLASH_MS).toBeGreaterThanOrEqual(100);
    expect(FLASH_MS).toBeLessThanOrEqual(200);
  });

  it("stays legible on DARK and PALE champion tints alike (white does not)", () => {
    cover("juice-flash");
    // The overlay draws with ALPHA_COMBINE: out = base·(1−a) + flash·a.
    const composite = (
      base: [number, number, number],
      flash: [number, number, number],
    ): [number, number, number] => [
      base[0] * (1 - FLASH_ALPHA) + flash[0] * FLASH_ALPHA,
      base[1] * (1 - FLASH_ALPHA) + flash[1] * FLASH_ALPHA,
      base[2] * (1 - FLASH_ALPHA) + flash[2] * FLASH_ALPHA,
    ];
    const delta = (a: [number, number, number], b: [number, number, number]): number =>
      Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

    // real w3x tints from content/config/unit-tints.json, dark → pale
    const tints: [number, number, number][] = [
      [0, 0, 0], // 老二 / Gantz — pure black
      [0.294, 0.294, 0.294], // 黑化Saber
      [0.314, 0.314, 0.314], // Berserker 海克力斯
      [0.784, 0.784, 0.784], // 北斗神拳掌門人
      [1, 0.78, 0.78], // 神性的流失 / 魔界霸主
      [1, 0.78, 1], // 白木老樹精 / 姜窩肯
      [0.95, 0.95, 0.95], // untinted pale rig
    ];
    const red = flashColorFor("physical");
    for (const tint of tints) {
      expect(delta(composite(tint, red), tint)).toBeGreaterThan(0.35);
    }
    // and it beats white precisely where white fails — the pale models, where
    // a white overlay can only push already-high channels toward the ceiling
    const white: [number, number, number] = [1, 1, 1];
    for (const tint of tints.slice(4)) {
      const dWhite = delta(composite(tint, white), tint);
      const dRed = delta(composite(tint, red), tint);
      expect(dWhite).toBeLessThan(0.2); // white barely moves a pale model
      expect(dRed).toBeGreaterThan(0.5);
      expect(dRed).toBeGreaterThan(dWhite * 2.5);
    }
    // White wins only in the one place it cannot lose (pure black), and even
    // there red still clears the legibility floor asserted above — so red is
    // the colour that works across the WHOLE roster, which white does not.
    expect(delta(composite([0, 0, 0], red), [0, 0, 0])).toBeGreaterThan(0.5);
  });
});

describe("quality-tier gating disables heavy fx (juice-quality-gate)", () => {
  it("heavy post-fx OFF on the mobile/low tier, ON on desktop", () => {
    cover("juice-quality-gate");
    expect(heavyPostFxEnabled("mobile")).toBe(false);
    expect(heavyPostFxEnabled("desktop")).toBe(true);
  });

  it("camera-shake scales down (not off) on mobile", () => {
    cover("juice-quality-gate");
    expect(cameraShakeScaleFor("desktop")).toBe(1);
    expect(cameraShakeScaleFor("mobile")).toBeGreaterThan(0);
    expect(cameraShakeScaleFor("mobile")).toBeLessThan(1);
  });
});
