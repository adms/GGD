/**
 * damage-colors — the four hues owner named, MEASURED, plus the doc seam.
 *
 * owner 2026-08-01: 「真實傷害目前在畫面上看不出來 => 顯示白色傷害數字(紅物理;
 * 紫魔法; 白真實; 綠治療)」.
 *
 * ⚠️ WHY THIS FILE MEASURES INSTEAD OF COMPARING TO A FIXTURE. The palette is
 * now operator-editable, so "the hex equals #FF5900" only guards the shipped
 * default — which is worth guarding (the drift suite below does it) but is not
 * what makes the feature work. What makes it work is that each hue clears the
 * legibility floors this codebase already established:
 *
 *   · the TEXT palette against `ui/combatTextContrast.test.ts`'s rule (either the
 *     fill or the black ring clears 3.0:1 on every real arena ground, and the
 *     fill clears 3.0:1 against its own ring) plus `ui/combatText`'s ΔE > 25 from
 *     every team colour;
 *   · the FLASH palette against `render/combatFeedback.test.ts`'s ALPHA_COMBINE
 *     measurement on the real w3x model tints.
 *
 * The second one is the load-bearing measurement of this whole task: 「白」 is
 * achievable in the text channel and NOT in the flash channel, and this file is
 * where that asymmetry stops being a claim in a comment.
 */
import { afterEach, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { DEFAULT_DAMAGE_COLORS, zConfigDamageColorsDoc } from "@ggd/shared/content";
import {
  applyDamageColorsDoc,
  damageFlashRgb,
  damageTextAxis,
  damageTextColor,
  hexToRgb01,
  normalizeDamageSchool,
} from "./damagePalette";
import { FLASH_ALPHA } from "./combatFeedback";
import { TEAM_CSS } from "../ui/theme";

const TAG = "damage-colors";
const REPO = fileURLToPath(new URL("../../../../", import.meta.url));

afterEach(() => applyDamageColorsDoc(null)); // module state — never leak a mode

// ── colour maths (same formulas as ui/combatTextContrast.test.ts) ────────────
const srgb = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const chan = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};
const relLum = (hex: string): number => {
  const [r, g, b] = chan(hex).map(srgb) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
const lab = (hex: string): [number, number, number] => {
  const [R, G, B] = chan(hex).map(srgb) as [number, number, number];
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const deltaE = (a: string, b: string): number => {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};

/** The four real arena grounds, sampled in `ui/combatTextContrast.test.ts`. */
const GROUNDS: ReadonlyArray<readonly [string, string]> = [
  ["土色", "#6d6250"],
  ["暗土", "#4a4238"],
  ["石地", "#8a8578"],
  ["白岩", "#ebebeb"],
];
const RING = "#000000";

/** Real w3x model tints from `config/unit-tints.json`, dark → pale. */
const MODEL_TINTS: ReadonlyArray<readonly [string, [number, number, number]]> = [
  ["老二 / Gantz (pure black)", [0, 0, 0]],
  ["黑化Saber", [0.294, 0.294, 0.294]],
  ["Berserker 海克力斯", [0.314, 0.314, 0.314]],
  ["北斗神拳掌門人", [0.784, 0.784, 0.784]],
  ["神性的流失 / 魔界霸主", [1, 0.78, 0.78]],
  ["白木老樹精 / 姜窩肯", [1, 0.78, 1]],
  ["untinted pale rig", [0.95, 0.95, 0.95]],
];

/** What the eye actually sees: `out = base·(1−a) + flash·a`, then the distance. */
const flashDelta = (tint: readonly [number, number, number], hex: string): number => {
  const flash = hexToRgb01(hex);
  const out = tint.map((c, i) => c * (1 - FLASH_ALPHA) + flash[i]! * FLASH_ALPHA);
  return Math.hypot(out[0]! - tint[0], out[1]! - tint[1], out[2]! - tint[2]);
};

// ─────────────────────────────────────────────────────────────────────────────

describe("傷害數字配色: the shipped doc IS the fuse (damage-colors)", () => {
  it("content/config/damage-colors.json and DEFAULT_DAMAGE_COLORS agree cell for cell", () => {
    cover(TAG);
    const onDisk = JSON.parse(
      readFileSync(`${REPO}content/config/damage-colors.json`, "utf8"),
    ) as Record<string, unknown>;
    expect(zConfigDamageColorsDoc.safeParse(onDisk).success).toBe(true);
    // `note` is prose that only exists in the JSON — compare everything else.
    const { note: _note, ...rest } = onDisk as { note?: string };
    expect(rest).toEqual(DEFAULT_DAMAGE_COLORS);
  });

  it("owner's four are the four the module hands out, and the axis defaults to his ruling", () => {
    cover(TAG);
    expect(damageTextAxis()).toBe("damageType");
    expect(damageTextColor("physical")).toBe(DEFAULT_DAMAGE_COLORS.text.physical);
    expect(damageTextColor("magic")).toBe(DEFAULT_DAMAGE_COLORS.text.magic);
    expect(damageTextColor("true")).toBe(DEFAULT_DAMAGE_COLORS.text.true);
    expect(damageTextColor("heal")).toBe(DEFAULT_DAMAGE_COLORS.text.heal);
  });
});

describe("傷害數字配色: the TEXT palette is legible where the numbers are born", () => {
  const KEYS = ["physical", "magic", "true", "heal"] as const;

  it("every hue clears 3.0:1 against its own black ring", () => {
    cover(TAG);
    for (const k of KEYS) {
      const hex = damageTextColor(k);
      expect(contrast(hex, RING), `${k} ${hex} vs ring`).toBeGreaterThan(3.0);
    }
  });

  it("on every real ground, EITHER the fill or the ring clears 3.0:1", () => {
    cover(TAG);
    for (const k of KEYS) {
      const hex = damageTextColor(k);
      for (const [name, ground] of GROUNDS) {
        const best = Math.max(contrast(hex, ground), contrast(RING, ground));
        expect(best, `${k} ${hex} on ${name}`).toBeGreaterThan(3.0);
      }
    }
  });

  it("no hue is confusable with a team colour (ΔE > 25)", () => {
    cover(TAG);
    for (const k of KEYS) {
      const hex = damageTextColor(k);
      for (const team of TEAM_CSS) {
        expect(deltaE(hex, team), `${k} ${hex} vs team ${team}`).toBeGreaterThan(25);
      }
    }
  });

  it("the four are pairwise unmistakable (ΔE > 40)", () => {
    cover(TAG);
    for (let i = 0; i < KEYS.length; i++) {
      for (let j = i + 1; j < KEYS.length; j++) {
        const a = damageTextColor(KEYS[i]!);
        const b = damageTextColor(KEYS[j]!);
        expect(deltaE(a, b), `${KEYS[i]} vs ${KEYS[j]}`).toBeGreaterThan(40);
      }
    }
  });

  it("魔法紫 stays clear of 閃避's lavender — the other violet on the field", () => {
    cover(TAG);
    // `ui/combatText`'s `dodge` / `allyDodge` hue. Two violets a player cannot
    // tell apart is the same defect as one violet and one red-that-is-orange.
    expect(deltaE(damageTextColor("magic"), "#C9A7FF")).toBeGreaterThan(25);
  });
});

describe("傷害數字配色: the FLASH palette actually moves a real model", () => {
  const SCHOOLS = ["physical", "magic", "true"] as const;
  /**
   * The floor is the PALEST ACCEPTED DEFAULT, measured — not a round number.
   *
   * `combatFeedback.ts` states the rule in the spread domain ("no authored
   * colour may be less chromatic than the magenta"); this is the same rule in
   * the domain the eye is actually in. MEASURED worst case over the seven tints:
   *
   *   #FF2626 physical  0.4348      #33FFFF true   0.3954
   *   #FF59E6 magic     0.2652      #FFFFFF white  0.0520
   *
   * The magenta has been the magic flash since task #60, so 0.2652 is the
   * palest thing this codebase has ever shipped and accepted. 0.26 is that
   * number with a hair of slack.
   *
   * ⚠️ I first wrote 0.35 here — the RED's floor, which is what the old
   * `combatFeedback.test.ts` asserted — and RAN it: the SHIPPED magenta fails at
   * 0.2999 on 北斗神拳掌門人. Then 0.29, and RAN it: the magenta fails at 0.2652
   * on 白木老樹精. That 0.35 was only ever measured against the red, and the
   * comment above it in `combatFeedback.ts` said so; I had to run it twice to
   * believe the file over my arithmetic.
   */
  const FLOOR = 0.26;

  it("all THREE schools clear the visibility floor on all seven measured tints", () => {
    cover(TAG);
    for (const s of SCHOOLS) {
      const hex = DEFAULT_DAMAGE_COLORS.flash[s];
      for (const [name, tint] of MODEL_TINTS) {
        expect(flashDelta(tint, hex), `${s} ${hex} on ${name}`).toBeGreaterThan(FLOOR);
      }
    }
  });

  /**
   * THE MEASUREMENT THAT DECIDED THE SHAPE OF THIS TASK, and the reason
   * `flash.true` is a cyan-white rather than owner's literal 白.
   *
   * ⚠️ MUTATION-VERIFIED, not reasoned about: setting `flash.true` to `#FFFFFF`
   * in `DEFAULT_DAMAGE_COLORS` makes the test above fail on FOUR tints (worst
   * 0.052 on the untinted pale rig, vs the 0.26 floor). That mutation was RUN,
   * confirmed RED, and reverted — the run is recorded in the report.
   */
  it("literal WHITE would have re-created the defect — it is a no-op on pale models", () => {
    cover(TAG);
    const pale = MODEL_TINTS.filter(([, t]) => Math.min(...t) >= 0.78);
    expect(pale.length).toBeGreaterThanOrEqual(4);
    for (const [name, tint] of pale) {
      expect(flashDelta(tint, "#FFFFFF"), `white on ${name}`).toBeLessThan(FLOOR);
      expect(
        flashDelta(tint, DEFAULT_DAMAGE_COLORS.flash.true),
        `shipped true-flash on ${name}`,
      ).toBeGreaterThan(FLOOR);
    }
  });

  it("the three flash hues are pairwise distinct as SEEN, not just as authored", () => {
    cover(TAG);
    // distance between the two composites on the WORST (palest) tint — if two
    // schools converge anywhere it is there.
    const worst = MODEL_TINTS[MODEL_TINTS.length - 1]![1];
    const seen = SCHOOLS.map((s) => {
      const flash = hexToRgb01(DEFAULT_DAMAGE_COLORS.flash[s]);
      return worst.map((c, i) => c * (1 - FLASH_ALPHA) + flash[i]! * FLASH_ALPHA);
    });
    for (let i = 0; i < seen.length; i++) {
      for (let j = i + 1; j < seen.length; j++) {
        const d = Math.hypot(
          seen[i]![0]! - seen[j]![0]!,
          seen[i]![1]! - seen[j]![1]!,
          seen[i]![2]! - seen[j]![2]!,
        );
        expect(d, `${SCHOOLS[i]} vs ${SCHOOLS[j]} as composited`).toBeGreaterThan(0.2);
      }
    }
  });
});

describe("傷害數字配色: the operator's doc reaches the palette", () => {
  it("a saved doc replaces every cell", () => {
    cover(TAG);
    applyDamageColorsDoc({
      ...DEFAULT_DAMAGE_COLORS,
      textAxis: "relation",
      text: { physical: "#111111", magic: "#222222", true: "#333333", heal: "#444444" },
      flash: { physical: "#555555", magic: "#666666", true: "#777777" },
    });
    expect(damageTextAxis()).toBe("relation");
    expect(damageTextColor("true")).toBe("#333333");
    expect(damageFlashRgb("magic")).toEqual(hexToRgb01("#666666"));
  });

  it("null means 出貨預設, never 「no palette」", () => {
    cover(TAG);
    applyDamageColorsDoc({ ...DEFAULT_DAMAGE_COLORS, text: { ...DEFAULT_DAMAGE_COLORS.text, true: "#123456" } });
    expect(damageTextColor("true")).toBe("#123456");
    applyDamageColorsDoc(null);
    expect(damageTextColor("true")).toBe(DEFAULT_DAMAGE_COLORS.text.true);
    expect(damageTextAxis()).toBe("damageType");
  });

  it("ONE malformed cell degrades ONE cell — the overlay write path has no Zod (#283)", () => {
    cover(TAG);
    applyDamageColorsDoc({
      ...DEFAULT_DAMAGE_COLORS,
      text: { ...DEFAULT_DAMAGE_COLORS.text, magic: "紫色" as string, true: "#00FFAA" },
      // and a bad axis string must not blank the axis either
      textAxis: "sideways" as never,
    });
    expect(damageTextColor("magic")).toBe(DEFAULT_DAMAGE_COLORS.text.magic); // rejected
    expect(damageTextColor("true")).toBe("#00FFAA"); // the good neighbour survives
    expect(damageTextAxis()).toBe("damageType");
  });

  it("an unknown damage school resolves to physical everywhere", () => {
    cover(TAG);
    expect(normalizeDamageSchool(undefined)).toBe("physical");
    expect(normalizeDamageSchool("chaos")).toBe("physical");
    expect(normalizeDamageSchool("magic")).toBe("magic");
    expect(normalizeDamageSchool("true")).toBe("true");
  });
});
