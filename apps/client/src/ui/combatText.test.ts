/**
 * Floating combat text (task #92) — the pure model.
 *
 * Four suites, one per contract row:
 *   ct-c01 combat-text-category   — the four requested categories exist and split correctly
 *   ct-c02 combat-text-palette    — fixed size, team-safe hues, crit/kill keep their hue
 *   ct-c03 combat-text-motion     — RO's lob + linear fade + short fade-in
 *   ct-c05 combat-text-legibility — the outline/gradient treatment that carries 清晰
 *
 * `juice-damage-number` (combat-juice cj-c06) is re-covered here: this module
 * SUPERSEDES ui/damageNumberStyle, and the row's claims were rewritten to match.
 */
import { afterEach, describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { DEFAULT_DAMAGE_COLORS } from "@ggd/shared/content";
import { applyDamageColorsDoc } from "../render/damagePalette";
import { TEAM_CSS } from "./theme";
import { HUD_SLOTS, hudSlotRect } from "./hud/hudLayout";
import {
  BASE_LIFT_PX,
  CHROME_ALPHA_MULT,
  chromeAlphaMult,
  hudReservedRects,
  COMBAT_TEXT_CATEGORIES,
  CRIT_SIZE_MULT,
  FADE_IN_MS,
  KILL_LIFE_BONUS_MS,
  KILL_SIZE_MULT,
  combatTextAlpha,
  combatTextCategory,
  combatTextCss,
  combatTextDrift,
  combatTextLabel,
  combatTextLane,
  combatTextLift,
  combatTextScale,
  combatTextShadow,
  combatTextStyle,
  combatTextStyleKey,
  scopeAllows,
  type CombatTextCategory,
  type CombatTextEvent,
} from "./combatText";

const ev = (over: Partial<CombatTextEvent> = {}): CombatTextEvent => ({
  kind: "damage",
  amount: 40,
  sourceRel: "enemy",
  targetRel: "self",
  crit: false,
  blocked: false,
  killingBlow: false,
  ...over,
});

// ---------------------------------------------------------------- colour math
const srgbToLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const parseHex = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};
const toLab = (hex: string): [number, number, number] => {
  const [r, g, b] = parseHex(hex).map(srgbToLinear) as [number, number, number];
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
/** CIE76 ΔE. Below ~25 two colours are confusable at a glance. */
const deltaE = (a: string, b: string): number => {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};
const relLum = (hex: string): number => {
  const [r, g, b] = parseHex(hex).map(srgbToLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

// The palette is module state in `render/damagePalette` (ContentDb pushes the
// operator's doc into it at boot). Any test that flips `textAxis` has to put it
// back, or every later test in this file silently measures the other mode.
afterEach(() => {
  applyDamageColorsDoc(null); // null = 出貨預設, never "no palette"
});

// ---------------------------------------------------------------------------
describe("combat text: the four requested categories (ct-c01)", () => {
  it("造成傷害 and 受到傷害 are the SAME event split by who you are", () => {
    cover("combat-text-category");
    // one `damage` event, two categories, decided only by the local player's role
    expect(combatTextCategory(ev({ targetRel: "self", sourceRel: "enemy" }))).toBe("taken");
    expect(combatTextCategory(ev({ targetRel: "enemy", sourceRel: "self" }))).toBe("dealt");
  });

  it("補血 and 補魔 each have their own category", () => {
    cover("combat-text-category");
    expect(combatTextCategory(ev({ kind: "heal", targetRel: "self" }))).toBe("heal");
    expect(combatTextCategory(ev({ kind: "mana", targetRel: "self" }))).toBe("mana");
    // all four the request names are distinct and drawable
    const four = new Set<CombatTextCategory | null>([
      combatTextCategory(ev({ targetRel: "self" })),
      combatTextCategory(ev({ targetRel: "enemy", sourceRel: "self" })),
      combatTextCategory(ev({ kind: "heal", targetRel: "self" })),
      combatTextCategory(ev({ kind: "mana", targetRel: "self" })),
    ]);
    expect(four).toEqual(new Set(["taken", "dealt", "heal", "mana"]));
  });

  it("taking damage wins over dealing it when you hit yourself", () => {
    cover("combat-text-category");
    // recoil / sacrifice costs read as damage TAKEN — that is the number that
    // decides whether you retreat
    expect(combatTextCategory(ev({ sourceRel: "self", targetRel: "self" }))).toBe("taken");
  });

  it("a fully absorbed hit on YOU reads as guard; on anyone else it is dropped", () => {
    cover("combat-text-category");
    expect(combatTextCategory(ev({ amount: 0, blocked: true, targetRel: "self" }))).toBe("guard");
    expect(combatTextCategory(ev({ amount: 0, blocked: true, targetRel: "ally" }))).toBeNull();
    expect(combatTextCategory(ev({ amount: 0, blocked: false, targetRel: "self" }))).toBeNull();
    expect(combatTextLabel("guard", 0)).toBe("GUARD");
  });

  it("an enemy topping up mana is never drawn, at any scope", () => {
    cover("combat-text-category");
    expect(combatTextCategory(ev({ kind: "mana", targetRel: "enemy" }))).toBeNull();
    expect(combatTextCategory(ev({ kind: "mana", targetRel: "unknown" }))).toBeNull();
  });

  it("scope gates third-party text but never the player's own", () => {
    cover("combat-text-category");
    for (const c of ["taken", "dealt", "heal", "mana", "guard"] as CombatTextCategory[]) {
      expect(scopeAllows("off", c)).toBe(false);
      expect(scopeAllows("self", c)).toBe(true);
      expect(scopeAllows("team", c)).toBe(true);
      expect(scopeAllows("all", c)).toBe(true);
    }
    expect(scopeAllows("self", "allyTaken")).toBe(false);
    expect(scopeAllows("team", "allyTaken")).toBe(true);
    expect(scopeAllows("team", "other")).toBe(false);
    expect(scopeAllows("all", "other")).toBe(true);
  });

  it("restore categories are signed, damage is not", () => {
    cover("combat-text-category");
    expect(combatTextLabel("heal", 37)).toBe("+37");
    expect(combatTextLabel("mana", 12)).toBe("+12");
    expect(combatTextLabel("taken", 37)).toBe("37");
    expect(combatTextLabel("dealt", 37)).toBe("37");
  });
});

// ---------------------------------------------------------------------------
describe("combat text palette (ct-c02)", () => {
  it("size is CONSTANT per category — it never scales with the amount", () => {
    cover("combat-text-palette");
    cover("juice-damage-number");
    // the old rule was clamp(11 + amount*0.14, 11, 30), which put a chip hit at
    // 11px. Magnitude is carried by the digits; size means importance.
    for (const c of COMBAT_TEXT_CATEGORIES) {
      const a = combatTextStyle(c);
      const b = combatTextStyle(c);
      expect(a.fontSize).toBe(b.fontSize);
      expect(a.fontSize).toBeGreaterThanOrEqual(15);
    }
    // and the categories the player must not miss are the biggest
    expect(combatTextStyle("taken").fontSize).toBeGreaterThan(combatTextStyle("dealt").fontSize);
    expect(combatTextStyle("dealt").fontSize).toBeGreaterThan(combatTextStyle("other").fontSize);
  });

  it("no hue is confusable with a team colour (measured, not asserted)", () => {
    cover("combat-text-palette");
    for (const c of COMBAT_TEXT_CATEGORIES) {
      const { color, tint } = combatTextStyle(c);
      for (const team of TEAM_CSS) {
        expect(deltaE(color, team)).toBeGreaterThan(25);
        expect(deltaE(tint, team)).toBeGreaterThan(25);
      }
    }
  });

  it("魔法傷害 overlay: only the SOFT halo moves on taken/allyTaken, only the fill moves on dealt/other/guard, and both stay violet-family and team-safe", () => {
    cover("combat-text-palette");
    // ⚠️ This is the `textAxis: "relation"` path — the PRE-2026-08-01 behaviour,
    // now selectable from 後台 → 傷害數字配色 rather than compiled in. It has to
    // stay guarded: an alternative nobody tests is an alternative that is broken
    // the first time the operator picks it.
    applyDamageColorsDoc({ ...DEFAULT_DAMAGE_COLORS, textAxis: "relation" });
    const RED_BASED: CombatTextCategory[] = ["taken", "allyTaken"];
    const PALE_BASED: CombatTextCategory[] = ["dealt", "other", "guard"];
    for (const c of RED_BASED) {
      const plain = combatTextStyle(c);
      const magic = combatTextStyle(c, { crit: false, killingBlow: false, dmgType: "magic" });
      // the fill is the thing #FF5900 was searched 833 candidates to protect —
      // magic damage may NOT touch it, on pain of drifting back toward team red.
      expect(magic.color, `${c}: fill must stay exactly the base hue`).toBe(plain.color);
      expect(magic.haloRgb, `${c}: the halo is the only legal overlay channel`).toBeDefined();
      expect(magic.haloRgb).not.toBe(plain.haloRgb);
      const [r, g, b] = magic.haloRgb!.split(",").map(Number);
      const haloHex = `#${[r, g, b].map((v) => v!.toString(16).padStart(2, "0")).join("")}`;
      for (const team of TEAM_CSS) expect(deltaE(haloHex, team)).toBeGreaterThan(25);
    }
    for (const c of PALE_BASED) {
      const plain = combatTextStyle(c);
      const magic = combatTextStyle(c, { crit: false, killingBlow: false, dmgType: "magic" });
      expect(magic.color, `${c}: the pale fill IS the legal overlay channel`).not.toBe(plain.color);
      expect(magic.haloRgb, `${c}: halo must stay untouched here`).toBe(plain.haloRgb);
      for (const team of TEAM_CSS) expect(deltaE(magic.color, team)).toBeGreaterThan(25);
    }
  });

  it("魔法傷害 changes a pooled node's cache key on damage categories, not on heal/mana", () => {
    cover("combat-text-palette");
    const mods = { crit: false, killingBlow: false };
    expect(combatTextStyleKey("taken", { ...mods, dmgType: "magic" })).not.toBe(
      combatTextStyleKey("taken", { ...mods, dmgType: "physical" }),
    );
    expect(combatTextStyleKey("dealt", { ...mods, dmgType: "magic" })).not.toBe(
      combatTextStyleKey("dealt", { ...mods, dmgType: "physical" }),
    );
    // dmgType is meaningless off a damage event — it must not fragment the
    // heal/mana pool into cache misses that never happen in practice.
    expect(combatTextStyleKey("heal", { ...mods, dmgType: "magic" })).toBe(
      combatTextStyleKey("heal", { ...mods, dmgType: "physical" }),
    );
  });

  it("魔法傷害 overlay never reaches a non-damage category (heal/mana/dodge)", () => {
    cover("combat-text-palette");
    for (const c of ["heal", "mana", "dodge", "allyHeal", "allyMana", "allyDodge"] as CombatTextCategory[]) {
      const plain = combatTextStyle(c);
      const magic = combatTextStyle(c, { crit: false, killingBlow: false, dmgType: "magic" });
      expect(magic.color).toBe(plain.color);
      expect(magic.haloRgb).toBe(plain.haloRgb);
    }
  });

  /**
   * REWRITTEN by owner's 2026-08-01 ruling. It used to read
   * `["taken", "dealt", "heal", "mana"]` — the WHO axis — and it cannot: under
   * the shipped `textAxis: "damageType"` a physical 受到傷害 and a physical
   * 造成傷害 share a fill BY DESIGN. The four things that must now be mutually
   * unmistakable are owner's four: 紅物理 / 紫魔法 / 白真實 / 綠治療. The
   * separation the old assertion protected (taken vs dealt) has not been
   * dropped — it moved to the non-colour channels asserted right below.
   */
  it("owner's four are mutually unmistakable: 紅物理 / 紫魔法 / 白真實 / 綠治療", () => {
    cover("combat-text-palette");
    const mods = { crit: false, killingBlow: false } as const;
    const four = [
      combatTextStyle("dealt", { ...mods, dmgType: "physical" }).color,
      combatTextStyle("dealt", { ...mods, dmgType: "magic" }).color,
      combatTextStyle("dealt", { ...mods, dmgType: "true" }).color,
      combatTextStyle("heal").color,
    ];
    for (let i = 0; i < four.length; i++) {
      for (let j = i + 1; j < four.length; j++) {
        expect(deltaE(four[i]!, four[j]!), `${four[i]} vs ${four[j]}`).toBeGreaterThan(40);
      }
    }
  });

  it("受到傷害 vs 造成傷害 still separate WITHOUT colour (what the type axis costs)", () => {
    cover("combat-text-palette");
    const mods = { crit: false, killingBlow: false, dmgType: "physical" } as const;
    const taken = combatTextStyle("taken", mods);
    const dealt = combatTextStyle("dealt", mods);
    // the honest part: on the shipped axis they DO share a hue
    expect(taken.color).toBe(dealt.color);
    // …so every other channel has to carry the split, and does
    expect(taken.fontSize).toBeGreaterThan(dealt.fontSize);
    expect(taken.fontWeight).toBeGreaterThan(dealt.fontWeight);
    expect(taken.anchorY).not.toBe(dealt.anchorY);
    expect(Math.sign(taken.driftPx)).toBe(-Math.sign(dealt.driftPx));
    expect(taken.rank).toBeLessThan(dealt.rank);
  });

  it("heal and mana separate WITHOUT colour (the pair tritanopia collapses)", () => {
    cover("combat-text-palette");
    const heal = combatTextStyle("heal");
    const mana = combatTextStyle("mana");
    expect(mana.italic).toBe(true);
    expect(heal.italic).toBe(false);
    expect(heal.fontWeight).toBeGreaterThan(mana.fontWeight);
    expect(heal.anchorY).not.toBe(mana.anchorY); // different world height
    expect(Math.sign(heal.driftPx)).toBe(-Math.sign(mana.driftPx)); // opposite drift
  });

  it("crit and killing blow change SIZE and POP, never the hue (RO does not recolour)", () => {
    cover("combat-text-palette");
    cover("juice-damage-number");
    const plain = combatTextStyle("taken");
    const crit = combatTextStyle("taken", { crit: true, killingBlow: false });
    const kill = combatTextStyle("taken", { crit: false, killingBlow: true });
    expect(crit.color).toBe(plain.color);
    expect(kill.color).toBe(plain.color);
    expect(crit.fontSize).toBe(Math.round(plain.fontSize * CRIT_SIZE_MULT));
    expect(kill.fontSize).toBe(Math.round(plain.fontSize * KILL_SIZE_MULT));
    expect(crit.popScale).toBeGreaterThan(plain.popScale);
    expect(kill.popScale).toBeGreaterThan(crit.popScale);
    expect(kill.lifeMs).toBe(plain.lifeMs + KILL_LIFE_BONUS_MS);
  });

  it("crit and killing blow do not COMPOUND into a screen-eating glyph", () => {
    cover("combat-text-palette");
    const plain = combatTextStyle("taken").fontSize;
    const both = combatTextStyle("taken", { crit: true, killingBlow: true }).fontSize;
    // the larger multiplier wins; multiplying them would give 30x1.3x1.45 = 57px
    expect(both).toBe(Math.round(plain * KILL_SIZE_MULT));
    expect(both).toBeLessThan(Math.round(plain * CRIT_SIZE_MULT * KILL_SIZE_MULT));
  });

  it("even the LARGEST possible number clears the health bar above it", () => {
    cover("combat-text-palette");
    // closest zoom (task #31a DOLLY_MIN = 10), pitch 55 deg, Babylon fov 0.8,
    // 1080p: a VERTICAL world offset projects at 1080 / (2*10*tan(0.4)) px/u.
    const PX_PER_UNIT = 1080 / (2 * 10 * Math.tan(0.8 / 2));
    const BAR_ANCHOR_Y = 2.45; // render/overheadAnchors.anchorHeightFor(champion)
    const BAR_BLOCK_BOTTOM_PX = 11; // the bar block hangs ~11px below its anchor
    for (const c of COMBAT_TEXT_CATEGORIES) {
      const st = combatTextStyle(c, { crit: true, killingBlow: true });
      const gapPx = (BAR_ANCHOR_Y - st.anchorY) * PX_PER_UNIT;
      // worst case: the glyph at the top of its arc, measured to its own top edge
      const peakPx = BASE_LIFT_PX + st.arcPx;
      const glyphTopBelowBar = gapPx - peakPx - st.fontSize / 2 - BAR_BLOCK_BOTTOM_PX;
      expect(glyphTopBelowBar).toBeGreaterThan(0);
    }
  });

  it("admission rank orders by what the player must not miss", () => {
    cover("combat-text-palette");
    const r = (c: CombatTextCategory): number => combatTextStyle(c).rank;
    expect(r("taken")).toBeLessThan(r("heal"));
    expect(r("heal")).toBeLessThan(r("mana"));
    expect(r("mana")).toBeLessThan(r("dealt"));
    expect(r("dealt")).toBeLessThan(r("allyTaken"));
    expect(r("allyTaken")).toBeLessThan(r("other"));
    // a crit outranks a plain hit of its own category but never the tier above
    const critDealt = combatTextStyle("dealt", { crit: true, killingBlow: false }).rank;
    expect(critDealt).toBeLessThan(r("dealt"));
    expect(critDealt).toBeGreaterThan(r("mana"));
  });

  it("third-party text recedes instead of competing", () => {
    cover("combat-text-palette");
    expect(combatTextStyle("allyTaken").alpha).toBeLessThan(combatTextStyle("taken").alpha);
    expect(combatTextStyle("other").alpha).toBeLessThan(combatTextStyle("allyTaken").alpha);
    expect(combatTextStyle("other").fontSize).toBeLessThan(combatTextStyle("taken").fontSize);
  });

  it("every category clears the health bar it belongs to", () => {
    cover("combat-text-palette");
    // bars project from y = 2.45 (render/overheadAnchors.anchorHeightFor).
    // A number that covers the HP readout is worse than no number.
    for (const c of COMBAT_TEXT_CATEGORIES) {
      expect(combatTextStyle(c).anchorY).toBeLessThan(2.0);
    }
  });
});

// ---------------------------------------------------------------------------
describe("combat text motion — RO's curve (ct-c03)", () => {
  const ARC = 36;

  it("lobs: peaks at t=1/3, back at spawn height at 2/3, BELOW spawn at t=1", () => {
    cover("combat-text-motion");
    const peak = combatTextLift(1 / 3, ARC);
    expect(peak).toBeCloseTo(BASE_LIFT_PX + ARC, 5);
    expect(combatTextLift(2 / 3, ARC)).toBeCloseTo(BASE_LIFT_PX, 5);
    // the tell: it comes back DOWN through the body, it does not park overhead
    expect(combatTextLift(1, ARC)).toBeCloseTo(BASE_LIFT_PX - ARC, 5);
    expect(combatTextLift(1, ARC)).toBeLessThan(0);
  });

  it("rises for the first third and falls for the last two thirds", () => {
    cover("combat-text-motion");
    let prev = combatTextLift(0, ARC);
    for (let t = 0.02; t <= 1 / 3; t += 0.02) {
      const v = combatTextLift(t, ARC);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
    for (let t = 1 / 3 + 0.02; t <= 1; t += 0.02) {
      const v = combatTextLift(t, ARC);
      expect(v).toBeLessThan(prev);
      prev = v;
    }
  });

  it("fades in briefly then decays LINEARLY to zero (淡入出, RO's 1-perc)", () => {
    cover("combat-text-motion");
    const life = 1150;
    const fi = FADE_IN_MS / life;
    expect(combatTextAlpha(0, life)).toBe(0); // 淡入 starts from nothing
    expect(combatTextAlpha(fi, life)).toBeCloseTo(1, 5); // peak at the fade-in end
    expect(combatTextAlpha(1, life)).toBeCloseTo(0, 5); // 淡出 reaches nothing
    // strictly decreasing after the peak — no hold plateau
    let prev = 1;
    for (let t = fi + 0.01; t <= 1; t += 0.01) {
      const a = combatTextAlpha(t, life);
      expect(a).toBeLessThan(prev + 1e-9);
      prev = a;
    }
  });

  it("total ink matches RO's linear fade (integral = 0.5), not a hold-then-drop", () => {
    cover("combat-text-motion");
    const life = 1150;
    let sum = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) sum += combatTextAlpha((i + 0.5) / N, life) / N;
    // a design that holds alpha 1.0 for 65% of life integrates to ~0.85 — that
    // is the 光污染 the user rejected. RO's `1 - perc` integrates to exactly 0.5.
    expect(sum).toBeCloseTo(0.5, 2);
  });

  it("never reverses direction — the pop settles once and stops", () => {
    cover("combat-text-motion");
    let prev = combatTextScale(0, 1.32);
    expect(prev).toBeCloseTo(1.32, 5);
    for (let ms = 5; ms <= 400; ms += 5) {
      const s = combatTextScale(ms, 1.32);
      expect(s).toBeLessThanOrEqual(prev + 1e-9);
      prev = s;
    }
    expect(prev).toBeCloseTo(1, 5);
  });

  it("drifts monotonically outward and fans stacked numbers apart", () => {
    cover("combat-text-motion");
    expect(combatTextDrift(0, 24)).toBeCloseTo(0, 5);
    expect(combatTextDrift(1, 24)).toBeCloseTo(24, 5);
    expect(combatTextDrift(0.5, -24)).toBeLessThan(0);
    // lanes must clear a 3-digit glyph (~55px at closest zoom), not 26px
    const lanes = [0, 1, 2, 3, 4].map(combatTextLane);
    expect(Math.abs(lanes[1]! - lanes[0]!)).toBeGreaterThanOrEqual(30);
    expect(Math.abs(lanes[2]! - lanes[1]!)).toBeGreaterThanOrEqual(60);
    expect(combatTextLane(0)).toBe(combatTextLane(7)); // wraps, never runs away
  });
});

// ---------------------------------------------------------------------------
describe("combat text legibility treatment (ct-c05)", () => {
  it("the outline is a hard 8-direction RING, not a blur", () => {
    cover("combat-text-legibility");
    const shadow = combatTextShadow(2, 0);
    const layers = shadow.split(",");
    expect(layers).toHaveLength(8);
    // every ring layer has a ZERO blur radius — a blurred shadow smears at
    // small sizes and adds nothing over a bright ground
    for (const l of layers) expect(l.trim().endsWith("0 #000")).toBe(true);
    // and it surrounds the glyph: offsets in all four quadrants
    expect(shadow).toContain("2px 0px 0 #000");
    expect(shadow).toContain("-2px 0px 0 #000");
    expect(shadow).toContain("0px 2px 0 #000");
    expect(shadow).toContain("0px -2px 0 #000");
  });

  it("the black ring is what actually carries contrast on every real background", () => {
    cover("combat-text-legibility");
    // measured backgrounds a number is really born on
    const flash = "#cf5f5f"; // combatFeedback red hit-flash over a body
    const sand = "#8d8d8d"; // brightest #80 ground
    for (const c of ["taken", "dealt", "heal", "mana"] as CombatTextCategory[]) {
      const st = combatTextStyle(c);
      // the fill alone does NOT clear 3:1 everywhere — this is the honest state
      // of the world, and the reason the treatment exists
      expect(st.outlinePx).toBeGreaterThanOrEqual(1.5);
      // the ring does, against the fill it wraps
      expect(contrast(st.color, "#000000")).toBeGreaterThan(2.5);
      // and the gradient's top stop keeps luminance headroom on both
      expect(contrast(st.tint, flash)).toBeGreaterThan(2.5);
      expect(contrast(st.tint, sand)).toBeGreaterThan(2.5);
    }
  });

  it("the taken category gets the strongest dark halo — it is born ON the red flash", () => {
    cover("combat-text-legibility");
    const taken = combatTextStyle("taken");
    expect(taken.haloPx).toBeGreaterThan(combatTextStyle("other").haloPx);
    expect(combatTextShadow(taken.outlinePx, taken.haloPx)).toContain("rgba(0,0,0,");
  });

  it("digits are tabular so a number never reflows its own width", () => {
    cover("combat-text-legibility");
    expect(combatTextCss(combatTextStyle("taken"), true)).toContain(
      "font-variant-numeric:tabular-nums",
    );
  });

  it("the fill ALWAYS resolves to a visible hue — a transparent glyph is impossible", () => {
    cover("combat-text-legibility");
    // This used to REQUIRE `-webkit-background-clip:text` — i.e. it pinned the
    // very mechanism that produced the owner's black numbers. background-clip
    // with a transparent text-fill is unclipped-shadow-only whenever the
    // compositor declines the clip, and these nodes carry will-change so they
    // always have their own layer. The test's NAME was right and its assertion
    // was backwards.
    //
    // What it guards now is the name: whatever the probe answers, the emitted
    // CSS names a real colour and never zeroes the fill.
    for (const c of COMBAT_TEXT_CATEGORIES) {
      for (const gradient of [true, false]) {
        const css = combatTextCss(combatTextStyle(c), gradient);
        expect(css, `${c}/${gradient}`).toMatch(/(^|;)color:#[0-9a-f]{6}/i);
        expect(css, `${c}/${gradient}`).not.toMatch(/text-fill-color\s*:\s*transparent/i);
        expect(css, `${c}/${gradient}`).not.toMatch(/background-clip\s*:\s*text/i);
      }
    }
  });

  it("the ring thickens with the glyph so a crit is not left unoutlined", () => {
    cover("combat-text-legibility");
    const small = combatTextStyle("other");
    const big = combatTextStyle("taken", { crit: true, killingBlow: true });
    expect(big.fontSize).toBeGreaterThan(40);
    expect(big.outlinePx).toBeGreaterThan(small.outlinePx);
  });
});

// ---------------------------------------------------------------------------
describe("combat text vs HUD chrome (ct-c06)", () => {
  const VIEWPORT = { width: 1920, height: 1080 };

  it("consumes task #42's registry rather than claiming a corner of its own", () => {
    cover("combat-text-chrome");
    // Floating text is world-anchored and moves; reserving a corner for it
    // would be a lie. What it MUST do is know where the chrome is.
    const rects = hudReservedRects(VIEWPORT);
    expect(rects.length).toBeGreaterThan(4);
    for (const r of rects) {
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    }
    // no combat-text category is registered as a HUD slot
    expect(HUD_SLOTS.some((s) => s.id.includes("combat-text"))).toBe(false);
  });

  it("damps a number that drifts under a panel instead of leaving it as mud", () => {
    cover("combat-text-chrome");
    const rects = hudReservedRects(VIEWPORT);
    const menu = hudSlotRect("menu", VIEWPORT);
    const overChrome = { x: menu.x + 2, y: menu.y + 2, w: 20, h: 20 };
    const clearAir = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2, w: 40, h: 24 };
    expect(chromeAlphaMult(overChrome, rects)).toBe(CHROME_ALPHA_MULT);
    expect(chromeAlphaMult(clearAir, rects)).toBe(1);
    expect(CHROME_ALPHA_MULT).toBeLessThan(0.5); // damped, but the motion still reads
  });

  it("a dev-only overlay never changes how the game looks", () => {
    cover("combat-text-chrome");
    // the settings-gated perf panel is `transient` — it must not start damping
    // combat text just because someone opened it
    const transient = HUD_SLOTS.filter((s) => s.transient).map((s) => s.id);
    expect(transient.length).toBeGreaterThan(0);
    const rects = hudReservedRects(VIEWPORT);
    for (const id of transient) {
      const r = hudSlotRect(id as never, VIEWPORT);
      expect(rects.some((x) => x.x === r.x && x.y === r.y && x.w === r.w && x.h === r.h)).toBe(
        false,
      );
    }
  });
});
