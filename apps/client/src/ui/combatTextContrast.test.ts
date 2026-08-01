import { describe, it, expect } from "vitest";
import { combatTextStyle, combatTextCss } from "./combatText";
import type { CombatTextCategory } from "./combatText";

/**
 * combat-text-legible — the guard for 「傷害數字…看起來是黑色」, reported twice.
 *
 * TWO defects hid behind one symptom.
 *
 * 1. THE FILL WENT TRANSPARENT. The CSS used `background-clip:text` +
 *    `-webkit-text-fill-color:transparent`, gated by a probe that reads
 *    COMPUTED STYLE. Computed style proves the engine ACCEPTED the properties,
 *    never that the compositor PAINTED them — and these nodes carry
 *    `will-change:transform,opacity`, so they live on their own layer where a
 *    browser may accept the clip and not honour it. The text-shadow is NOT
 *    clipped, so what survives is the glyph's black ring alone: a black number,
 *    which is exactly what the screenshot showed.
 *
 * 2. PURE RED WAS NEVER LEGIBLE ON DARK GROUND ANYWAY. Measured against the
 *    real arena grounds, #FF0000 reaches only 2.47:1 on 暗土 — red and black are
 *    both dark, so on dark dirt neither the fill nor the ring separates.
 *    Restoring the fill without fixing the hue would have "fixed" it into a
 *    number that is merely dim instead of black.
 *
 * The model this asserts is the one the ring architecture implies: for every
 * ground, EITHER the fill or the ring must clear 3.0:1 (WCAG AA for large
 * text), and the fill must clear 3.0:1 against its own ring.
 *
 * ⚠️ `RING` BELOW IS A MEASUREMENT INPUT, NOT AN ASSERTION — so it can go stale
 * silently: recolour the emitted ring and every number here keeps being computed
 * against `#000000` while the game draws something else (失敗形態 ⑤, 被測的不是
 * 出貨的那個). Since 2026-08-01 the outline carries a SECOND channel
 * (`config/damage-colors.json` → `outline`, the 「我打人 / 我被打」 band), which
 * makes that mistake reachable, so the last `it` below pins `RING` to the string
 * `combatTextCss` really emits. The band itself is measured in
 * `combatTextOutline.test.ts`; it is deliberately drawn OUTSIDE the black ring
 * precisely so the numbers below stay true — see `combatTextShadow`'s doc for
 * the 土色 measurement that forced that shape.
 */
const GROUNDS: ReadonlyArray<readonly [string, string]> = [
  ["土色", "#6d6250"], // sampled from the owner's screenshot
  ["暗土", "#4a4238"],
  ["石地", "#8a8578"],
  ["白岩", "#ebebeb"], // the skeleton arena's white rock (#187 measured 1.18:1 there)
];
const RING = "#000000";

const srgb = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const lum = (hex: string): number => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * srgb(r!) + 0.7152 * srgb(g!) + 0.0722 * srgb(b!);
};
const ratio = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const CATEGORIES: CombatTextCategory[] = ["taken", "dodge"];

describe("floating combat text stays legible (combat-text-legible)", () => {
  it("never renders a transparent fill — the black-number failure mode", () => {
    for (const cat of CATEGORIES) {
      // BOTH branches: the probe's answer must not be able to make the fill vanish.
      for (const gradient of [true, false]) {
        const css = combatTextCss(combatTextStyle(cat), gradient);
        expect(css, `${cat} (gradient=${gradient}) must not zero its text fill`).not.toMatch(
          /text-fill-color\s*:\s*transparent/i,
        );
        expect(css, `${cat} (gradient=${gradient}) must not clip its background to text`).not.toMatch(
          /background-clip\s*:\s*text/i,
        );
        expect(css, `${cat} (gradient=${gradient}) must set a real colour`).toMatch(/color:#[0-9a-f]{6}/i);
      }
    }
  });

  it("fill or ring separates from EVERY arena ground, and fill separates from ring", () => {
    for (const cat of CATEGORIES) {
      const fill = combatTextStyle(cat).color;
      expect(
        ratio(fill, RING),
        `${cat}: fill ${fill} against its own black ring — below 3.0 the glyph is one dark blob`,
      ).toBeGreaterThanOrEqual(3.0);
      for (const [name, ground] of GROUNDS) {
        const best = Math.max(ratio(fill, ground), ratio(RING, ground));
        expect(
          best,
          `${cat} on ${name} (${ground}): neither fill ${fill} nor the ring clears 3.0:1 — ` +
            `this is the case pure red failed at 2.47:1`,
        ).toBeGreaterThanOrEqual(3.0);
      }
    }
  });

  it("`RING` is the colour the CSS really emits — the measurement above is not stale", () => {
    // Everything in this file is measured against RING. If the emitted ring
    // stops being that colour, the two tests above keep passing while measuring
    // a ring that is not on screen. `#000` and `#000000` are the same colour;
    // the emitter uses the short form.
    const short = `0 ${RING.replace(/^#(.)\1(.)\2(.)\3$/, "#$1$2$3")}`;
    for (const cat of CATEGORIES) {
      const shadow = /text-shadow:([^;]+);/.exec(combatTextCss(combatTextStyle(cat), false))![1]!;
      const hard = shadow
        .split(",")
        .map((s) => s.trim())
        .filter((s) => / 0 #[0-9a-f]{3,6}$/i.test(s));
      // the 8-direction hard ring, in RING, is the first thing painted
      expect(hard.length, `${cat}: no hard ring layers at all`).toBeGreaterThanOrEqual(8);
      expect(
        hard.slice(0, 8).every((l) => l.endsWith(short)),
        `${cat}: the emitted ring is not ${RING} — every ratio in this file is now measuring the wrong colour`,
      ).toBe(true);
    }
  });
});
