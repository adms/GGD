/**
 * combat-juice pure math (client): camera-shake magnitude / decay / duration,
 * the hitstop window derived from a damage amount, the hit-flash colour per
 * damage type, and the quality-tier gates that keep the fps baseline. All pure
 * — no Babylon, no DOM.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import {
  SHAKE_MAX_AMP,
  FLASH_MS,
  FLASH_ALPHA,
  flashColorFor,
  legibleFlashColor,
  FLASH_MIN_SPREAD,
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
  hasImpactProfile,
  batchCarriesImpactProfile,
  planCameraReaction,
  shakeCrowdingScale,
  SHAKE_MAX_PER_FRAME,
  KICK_MAX_MAG,
  EX_PUNCH_MIN_INTERVAL_MS,
  type CameraReactionCtx,
} from "./combatFeedback";

/** Client mirror of the sim's per-tier cosmetic defaults (test helper). */
const SHAKE_BY_TIER: Record<ImpactTier, number> = { light: 0.35, medium: 0.6, heavy: 0.85, crit: 1.0 };
const CAMKICK_BY_TIER: Record<ImpactTier, number> = { light: 0.15, medium: 0.3, heavy: 0.5, crit: 0.65 };
/**
 * A minimal well-formed profile for a given tier + hitstop (test helper).
 * NOTE it carries NO flashColor / flashMs — that is the normal shape of a hit
 * from an un-authored source (every basic attack, every ability without a
 * `hitFeel.flashColor`), which is the majority case and the one whose flash
 * must keep reading as the DAMAGE TYPE. Tests that want the authored path pass
 * the fields explicitly through `over`.
 */
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

    // ABSENT (old replay) → tier-derived defaults, never undefined …
    const old = asImpactProfile({ tier: "heavy", hitstopTicks: 5 })!;
    expect(old.shakeMag).toBe(0.85); // heavy default
    expect(old.shakeStyle).toBe("directional");
    expect(old.sparkKind).toBe("hit");
    expect(old.camKick).toBe(0.5);
    // … EXCEPT the flash pair, which is authored-or-absent by design. Backfilling
    // it here would make every hit look authored and permanently disable the
    // damage-type default (the bug this contract exists to prevent).
    expect(old.flashColor).toBeUndefined();
    expect(old.flashMs).toBeUndefined();
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

// ---------------------------------------------------------------------------
// hitFeel.flashColor / .flashMs — the OVERRIDE that used to be dropped
// ---------------------------------------------------------------------------
// These fields were schema-accepted, sim-replicated, decoded into ImpactProfile
// and then discarded, because planImpactFeedback rebuilt the flash from
// flashColorFor + TIER_FX unconditionally. 31 ability docs shipped dead
// content. If someone "simplifies" resolveVictimFlash back to the tier tables,
// the first three tests here go red.
describe("authored hitFeel flash override (juice-flash-override)", () => {
  const AUTHORED_GOLD: [number, number, number] = [1, 0.92, 0.6]; // godie-e007.r 神聖
  const AUTHORED_FIRE: [number, number, number] = [1, 0.52, 0.22]; // godie-udre.q 炎

  it("an authored flashColor reaches victimFlash instead of the damage-type default", () => {
    cover("juice-flash-override");
    const authored = planImpactFeedback(
      profileOf("heavy", 4, { flashColor: AUTHORED_FIRE, flashMs: 178 }),
      { dmgType: "magic", tickMs: 33.3 },
    );
    // fire orange already clears the legibility floor → author's value, verbatim
    expect(authored.victimFlash.rgb).toEqual(AUTHORED_FIRE);
    expect(authored.victimFlash.ms).toBe(178);
    // and it is genuinely DIFFERENT from what the un-authored hit would show
    const plain = planImpactFeedback(profileOf("heavy", 4), { dmgType: "magic", tickMs: 33.3 });
    expect(plain.victimFlash.rgb).toEqual(flashColorFor("magic"));
    expect(plain.victimFlash.rgb).not.toEqual(authored.victimFlash.rgb);
  });

  it("the damage-type read SURVIVES: nothing authored → the measured palette, always", () => {
    cover("juice-flash-default-survives");
    // This is the layering guarantee. No champion doc authors a flash, so every
    // BASIC ATTACK takes this branch and physical-vs-magic keeps reading.
    for (const tier of ["light", "medium", "heavy", "crit"] as ImpactTier[]) {
      const magic = planImpactFeedback(profileOf(tier, 2), { dmgType: "magic", tickMs: 33.3 });
      const phys = planImpactFeedback(profileOf(tier, 2), { dmgType: "physical", tickMs: 33.3 });
      expect(magic.victimFlash.rgb).toEqual(flashColorFor("magic"));
      expect(phys.victimFlash.rgb).toEqual(flashColorFor("physical"));
      expect(magic.victimFlash.rgb).not.toEqual(phys.victimFlash.rgb);
      expect(magic.victimFlash.ms).toBe(phys.victimFlash.ms); // tier default, both
    }
  });

  it("alpha is NEVER authorable — it stays the tier's hit-weight", () => {
    cover("juice-flash-alpha-not-authorable");
    const a = planImpactFeedback(profileOf("light", 1, { flashColor: AUTHORED_GOLD }), { tickMs: 33.3 });
    const b = planImpactFeedback(profileOf("light", 1), { tickMs: 33.3 });
    expect(a.victimFlash.alpha).toBe(b.victimFlash.alpha);
  });

  it("legibility guard: a washed-out authored hue is saturated, not recoloured", () => {
    cover("juice-flash-legibility");
    // gold: spread 0.40 < 0.65 → boosted. Hue ORDER must survive (r > g > b),
    // the max channel must be untouched, and it must not become red/magenta.
    const gold = legibleFlashColor(AUTHORED_GOLD);
    expect(gold[0]).toBe(1); // max channel preserved
    expect(gold[0]).toBeGreaterThan(gold[1]!);
    expect(gold[1]).toBeGreaterThan(gold[2]!); // still warm gold, not red
    expect(gold[0]! - gold[2]!).toBeCloseTo(FLASH_MIN_SPREAD, 6);

    // pale azure (godie-u00j.q / godie-hart.r): spread 0.15 → the worst case in
    // the shipped set; it must come out BLUE-dominant, not washed white.
    const azure = legibleFlashColor([0.85, 0.92, 1.0]);
    expect(azure[2]).toBe(1);
    expect(azure[2]).toBeGreaterThan(azure[1]!);
    expect(azure[1]).toBeGreaterThan(azure[0]!);
    expect(azure[2]! - azure[0]!).toBeCloseTo(FLASH_MIN_SPREAD, 6);

    // already-chromatic colours are passed through untouched (no gratuitous churn)
    expect(legibleFlashColor(AUTHORED_FIRE)).toEqual(AUTHORED_FIRE);
    expect(legibleFlashColor(flashColorFor("magic"))).toEqual(flashColorFor("magic"));

    // a greyscale authored colour has no hue to saturate → the measured red,
    // because a white flash is a measured NO-OP on a pale model.
    expect(legibleFlashColor([1, 1, 1])).toEqual([1, 0.15, 0.15]);
    expect(legibleFlashColor([0.4, 0.4, 0.4])).toEqual([1, 0.15, 0.15]);
  });

  it("every SHIPPED authored flash colour clears the legibility floor after the guard", () => {
    cover("juice-flash-legibility");
    // the distinct hues actually authored across the 31 ability docs today
    const shipped: [number, number, number][] = [
      [1.0, 0.92, 0.6], [0.65, 0.8, 1.0], [1.0, 0.72, 0.34], [1.0, 0.9, 0.8],
      [0.9, 0.72, 0.48], [0.85, 0.92, 1.0], [1.0, 0.66, 0.3], [0.62, 0.45, 0.85],
      [1.0, 0.95, 0.72], [1.0, 0.52, 0.22], [0.7, 0.85, 1.0], [0.8, 0.88, 1.0],
      [0.6, 0.82, 1.0], [1.0, 0.6, 0.26],
    ];
    for (const rgb of shipped) {
      const out = legibleFlashColor(rgb);
      expect(Math.max(...out) - Math.min(...out)).toBeGreaterThanOrEqual(FLASH_MIN_SPREAD - 1e-9);
      for (const c of out) expect(c).toBeGreaterThanOrEqual(0);
      for (const c of out) expect(c).toBeLessThanOrEqual(1);
      // the guard preserves WHICH channel dominates — i.e. the author's hue family
      expect(out.indexOf(Math.max(...out))).toBe(rgb.indexOf(Math.max(...rgb)));
    }
  });

  // ------------------------------------------------------- REAL SHIPPED CONTENT
  // Fixtures prove the function; this proves the GAME. It walks the actual
  // content/abilities/*.json on disk, pushes each authored hitFeel through the
  // real decode (`asImpactProfile`, exactly what the wire hands the client) and
  // the real orchestrator, and asserts the authored hue is what would be handed
  // to ChampionView.flash(). This is the test that would have caught the
  // original bug: before the fix EVERY row here came back as the generic
  // damage-type colour, and nothing anywhere went red.
  it("every authored ability doc on disk actually reaches victimFlash", () => {
    cover("juice-flash-docs-reach-victim");
    const dir = fileURLToPath(new URL("../../../../content/abilities/", import.meta.url));
    const docs = readdirSync(dir).filter((f) => f.endsWith(".json"));
    let authored = 0;
    for (const file of docs) {
      const hf = (JSON.parse(readFileSync(join(dir, file), "utf8")) as {
        hitFeel?: { flashColor?: [number, number, number]; flashMs?: number };
      }).hitFeel;
      if (!hf?.flashColor) continue;
      authored++;
      // the wire shape the sim emits for this ability's hit
      const profile = asImpactProfile({
        tier: "heavy",
        hitstopTicks: 4,
        flashColor: hf.flashColor,
        ...(hf.flashMs === undefined ? {} : { flashMs: hf.flashMs }),
      })!;
      const plan = planImpactFeedback(profile, { dmgType: "magic", tickMs: 33.3 });
      expect(plan.victimFlash.rgb, file).toEqual(legibleFlashColor(hf.flashColor));
      // it must NOT be the generic default — that equality WAS the bug
      expect(plan.victimFlash.rgb, file).not.toEqual(flashColorFor("magic"));
      if (hf.flashMs !== undefined) expect(plan.victimFlash.ms, file).toBe(hf.flashMs);
    }
    // guard the guard: if curation ever strips every authored doc this test
    // would silently pass on an empty loop.
    expect(authored).toBeGreaterThanOrEqual(30);
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

  it("prefers-reduced-motion zeroes the scale on EVERY tier", () => {
    cover("juice-quality-gate");
    expect(cameraShakeScaleFor("desktop", true)).toBe(0);
    expect(cameraShakeScaleFor("mobile", true)).toBe(0);
    // and the default stays "motion allowed" so no existing caller changes
    expect(cameraShakeScaleFor("desktop")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// the CAMERA WAVE — planCameraReaction / resolveCameraKick. These are the
// tests that prove the ShakeRequest is CONSUMED (it used to be computed and
// dropped) and that a profiled hit reaches the rig exactly once.
// ---------------------------------------------------------------------------

const LOCAL = 7;
const ENEMY = 9;

/** A wire-shaped hitImpact carrying a real ImpactProfile. */
const hitImpactEv = (over: Partial<ImpactProfile> = {}, data: Record<string, unknown> = {}) => ({
  type: "hitImpact",
  data: {
    source: ENEMY,
    target: LOCAL,
    dmgType: "physical",
    amount: 80,
    profile: profileOf("medium", 4, over) as unknown as Record<string, unknown>,
    ...data,
  },
});

const damageEv = (data: Record<string, unknown> = {}) => ({
  type: "damage",
  data: { source: ENEMY, target: LOCAL, amount: 80, dmgType: "physical", ...data },
});

const castEv = (data: Record<string, unknown> = {}) => ({
  type: "abilityCast",
  data: { caster: LOCAL, slot: "EX", abilityId: "ex.demo", ...data },
});

const ctxOf = (over: Partial<CameraReactionCtx> = {}): CameraReactionCtx => ({
  localId: LOCAL,
  scale: 1,
  crowdIndex: 0,
  batchProfiled: true,
  sinceExPunchMs: Infinity,
  tickMs: 33.3,
  ...over,
});

describe("directional camera kick wiring (juice-camera-directional)", () => {
  it("a profiled hitImpact on the local player resolves a DIRECTIONAL kick along the hit vector", () => {
    cover("juice-camera-directional");
    const r = planCameraReaction(
      hitImpactEv({ knockbackDir: { x: 0, z: 1 }, shakeStyle: "directional" }),
      ctxOf(),
    );
    expect(r.exPunch).toBe(false);
    const kick = r.kick!;
    expect(kick).not.toBeNull();
    expect(kick.style).toBe("directional");
    // the ShakeRequest's dir survives to the rig, normalized
    expect(kick.dir).toEqual({ x: 0, z: 1 });
    expect(kick.kick).toBeGreaterThan(0);
    expect(kick.amp).toBeGreaterThan(0);
    expect(kick.amp).toBeLessThanOrEqual(SHAKE_MAX_AMP);
    expect(kick.durationMs).toBe(shakeDurationMs(kick.amp));
  });

  it("normalizes a non-unit knockback vector and keeps its bearing", () => {
    cover("juice-camera-directional");
    const kick = planCameraReaction(
      hitImpactEv({ knockbackDir: { x: 3, z: 4 }, shakeStyle: "directional" }),
      ctxOf(),
    ).kick!;
    expect(Math.hypot(kick.dir.x, kick.dir.z)).toBeCloseTo(1, 6);
    expect(kick.dir.x).toBeCloseTo(0.6, 6);
    expect(kick.dir.z).toBeCloseTo(0.8, 6);
  });

  it("an OMNI profile (crit/EX) drops the ground kick and rings radially", () => {
    cover("juice-camera-directional");
    const kick = planCameraReaction(
      hitImpactEv({ shakeStyle: "omni", knockbackDir: { x: 0, z: 1 } }),
      ctxOf(),
    ).kick!;
    expect(kick.style).toBe("omni");
    expect(kick.kick).toBe(0);
    expect(kick.dir).toEqual({ x: 0, z: 0 });
  });

  it("a directional profile with NO shove resolved degrades to the radial ring (never NaN)", () => {
    cover("juice-camera-directional");
    const kick = planCameraReaction(
      hitImpactEv({ shakeStyle: "directional", knockbackDir: { x: 0, z: 0 } }),
      ctxOf(),
    ).kick!;
    expect(kick.style).toBe("omni");
    expect(Number.isFinite(kick.dir.x)).toBe(true);
    expect(Number.isFinite(kick.dir.z)).toBe(true);
    expect(kick.kick).toBe(0);
  });

  it("TAKING a hit kicks harder than LANDING the same hit", () => {
    cover("juice-camera-directional");
    const taken = planCameraReaction(hitImpactEv(), ctxOf()).kick!;
    const dealt = planCameraReaction(
      hitImpactEv({}, { source: LOCAL, target: ENEMY }),
      ctxOf(),
    ).kick!;
    expect(taken.amp).toBeGreaterThan(dealt.amp);
    expect(taken.kick).toBeGreaterThan(dealt.kick);
  });

  it("a THIRD PARTY's hit never moves the local camera", () => {
    cover("juice-camera-directional");
    const r = planCameraReaction(hitImpactEv({}, { source: 20, target: 21 }), ctxOf());
    expect(r.kick).toBeNull();
    // …and neither does any hit before the local seat resolves
    expect(planCameraReaction(hitImpactEv(), ctxOf({ localId: null })).kick).toBeNull();
  });

  it("a malformed / pre-#133 hitImpact yields no kick instead of throwing", () => {
    cover("juice-camera-directional");
    expect(
      planCameraReaction({ type: "hitImpact", data: { source: ENEMY, target: LOCAL } }, ctxOf())
        .kick,
    ).toBeNull();
    expect(hasImpactProfile(undefined)).toBe(false);
    expect(hasImpactProfile({ tier: "heavy", hitstopTicks: 3 })).toBe(true);
    expect(hasImpactProfile({ tier: "bogus", hitstopTicks: 3 })).toBe(false);
  });

  it("clamps the kick and the amplitude so the biggest hit still respects the ceiling", () => {
    cover("juice-camera-directional");
    const kick = planCameraReaction(
      hitImpactEv({ tier: "crit", shakeMag: 9, camKick: 9, shakeStyle: "directional" }),
      ctxOf(),
    ).kick!;
    expect(kick.amp).toBe(SHAKE_MAX_AMP);
    expect(kick.kick).toBe(KICK_MAX_MAG);
  });
});

describe("no double-shake: the legacy scalar path stands down (juice-camera-directional)", () => {
  it("SUPPRESSES the legacy `damage` shake on a batch that carries profiles", () => {
    cover("juice-camera-directional");
    // the sim emits damage + hitImpact for the SAME hit; only one may shake
    const batch = [damageEv(), hitImpactEv()];
    expect(batchCarriesImpactProfile(batch)).toBe(true);
    const ctx = ctxOf({ batchProfiled: true });
    const fired = batch.map((ev) => planCameraReaction(ev, ctx)).filter((r) => r.kick !== null);
    expect(fired).toHaveLength(1); // exactly one shake for one hit
    expect(fired[0]!.kick!.style).toBe("directional"); // and it is the profiled one
  });

  it("KEEPS the legacy shake for a pre-#133 batch with no profile anywhere", () => {
    cover("juice-camera-directional");
    const batch = [damageEv()];
    expect(batchCarriesImpactProfile(batch)).toBe(false);
    const kick = planCameraReaction(batch[0]!, ctxOf({ batchProfiled: false })).kick!;
    expect(kick).not.toBeNull();
    expect(kick.style).toBe("omni"); // undirected — the old feel, unchanged
    expect(kick.kick).toBe(0);
  });

  it("a hitImpact whose profile failed to parse does not arm the batch suppression", () => {
    cover("juice-camera-directional");
    expect(batchCarriesImpactProfile([{ type: "hitImpact", data: { profile: { tier: "x" } } }])).toBe(
      false,
    );
  });
});

describe("teamfight crowding guard (juice-camera-directional)", () => {
  it("thins the 2nd/3rd impulse of a batch and drops the rest", () => {
    cover("juice-camera-directional");
    expect(shakeCrowdingScale(0)).toBe(1);
    expect(shakeCrowdingScale(1)).toBeLessThan(1);
    expect(shakeCrowdingScale(2)).toBeLessThan(shakeCrowdingScale(1));
    expect(shakeCrowdingScale(SHAKE_MAX_PER_FRAME)).toBe(0);
    const amps = [0, 1, 2, 3].map(
      (crowdIndex) => planCameraReaction(hitImpactEv(), ctxOf({ crowdIndex })).kick?.amp ?? 0,
    );
    expect(amps[0]).toBeGreaterThan(amps[1]!);
    expect(amps[1]).toBeGreaterThan(amps[2]!);
    expect(amps[3]).toBe(0); // the 4th simultaneous hit never reaches the rig
  });
});

describe("EX cinematic punch-in trigger (juice-camera-expunch)", () => {
  it("the LOCAL player's EX cast asks for the punch-in — exactly once", () => {
    cover("juice-camera-expunch");
    const r = planCameraReaction(castEv(), ctxOf());
    expect(r.exPunch).toBe(true);
    expect(r.kick).toBeNull(); // the cast itself never shakes
    // a second cast inside the guard window does NOT restart the beat
    expect(planCameraReaction(castEv(), ctxOf({ sinceExPunchMs: 10 })).exPunch).toBe(false);
    expect(
      planCameraReaction(castEv(), ctxOf({ sinceExPunchMs: EX_PUNCH_MIN_INTERVAL_MS })).exPunch,
    ).toBe(true);
  });

  it("a NORMAL ability never punches in, and neither does someone else's EX", () => {
    cover("juice-camera-expunch");
    for (const slot of ["Q", "W", "E", "R"]) {
      expect(planCameraReaction(castEv({ slot }), ctxOf()).exPunch).toBe(false);
    }
    expect(planCameraReaction(castEv({ caster: ENEMY }), ctxOf()).exPunch).toBe(false);
    expect(planCameraReaction(castEv(), ctxOf({ localId: null })).exPunch).toBe(false);
  });

  it("EX damage TICKS never punch in — only the cast does", () => {
    cover("juice-camera-expunch");
    // three hitImpacts from one EX: they kick the camera, none punches in
    for (let i = 0; i < 3; i++) {
      const r = planCameraReaction(hitImpactEv({ isEX: true }), ctxOf({ crowdIndex: 0 }));
      expect(r.exPunch).toBe(false);
    }
  });
});

describe("prefers-reduced-motion suppresses the whole camera wave (juice-quality-gate)", () => {
  it("scale 0 kills the kick, the legacy shake AND the EX punch-in", () => {
    cover("juice-quality-gate");
    const reduced = ctxOf({ scale: cameraShakeScaleFor("desktop", true) });
    expect(reduced.scale).toBe(0);
    expect(planCameraReaction(hitImpactEv(), reduced).kick).toBeNull();
    expect(planCameraReaction(damageEv(), ctxOf({ scale: 0, batchProfiled: false })).kick).toBeNull();
    expect(planCameraReaction(castEv(), reduced).exPunch).toBe(false);
  });

  it("the mobile tier still kicks, just softer than desktop", () => {
    cover("juice-quality-gate");
    const desktop = planCameraReaction(hitImpactEv(), ctxOf({ scale: cameraShakeScaleFor("desktop") })).kick!;
    const mobile = planCameraReaction(hitImpactEv(), ctxOf({ scale: cameraShakeScaleFor("mobile") })).kick!;
    expect(mobile.amp).toBeGreaterThan(0);
    expect(mobile.amp).toBeLessThan(desktop.amp);
  });
});
