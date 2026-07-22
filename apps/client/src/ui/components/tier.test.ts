/**
 * Task #37 — ranked-tier presentation (pure half of <TierBadge>):
 *
 *   rank-tier-map       — every tier maps to its EXACT Chinese label + a color;
 *                         backend `tier` encodings (english key / 中文 / index)
 *                         all normalise, junk falls back to 未定級
 *   rank-tier-division  — division 1..4 ↔ IV..I roman, loose input coercion,
 *                         formatRank composes "金 II"
 *   rank-tier-apex      — Master/Grandmaster/Challenger are apex → NO division
 *
 * (Client vitest env is node — no DOM — so the crest JSX is exercised through
 * its extracted pure helpers, matching icons.test.ts / exSlot.test.ts.)
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  APEX_TIERS,
  TIER_ORDER,
  divisionRoman,
  formatRank,
  isApex,
  normalizeDivision,
  normalizeTier,
  tierLabel,
  tierVisual,
  type TierKey,
} from "./tier";

const EXACT: Record<TierKey, string> = {
  iron: "鐵",
  bronze: "銅",
  silver: "銀",
  gold: "金",
  emerald: "翡翠",
  diamond: "鑽石",
  master: "大師",
  grandmaster: "宗師",
  challenger: "菁英",
};

describe("tier → label + color mapping (rank-tier-map)", () => {
  it("every tier renders its EXACT Chinese label and a full color set", () => {
    cover("rank-tier-map");
    expect(TIER_ORDER).toHaveLength(9);
    for (const key of TIER_ORDER) {
      expect(tierLabel(key)).toBe(EXACT[key]);
      const v = tierVisual(key);
      expect(v.key).toBe(key);
      expect(v.label).toBe(EXACT[key]);
      // a real palette (not empty / not all-identical placeholder)
      for (const c of [v.colors.from, v.colors.to, v.colors.edge, v.colors.text]) {
        expect(c).toMatch(/^#[0-9a-f]{6}$/i);
      }
      expect(v.colors.from).not.toBe(v.colors.to);
    }
  });

  it("normalises english key / Chinese label / numeric index, rejects junk", () => {
    cover("rank-tier-map");
    expect(normalizeTier("gold")).toBe("gold");
    expect(normalizeTier("GOLD")).toBe("gold");
    expect(normalizeTier("翡翠")).toBe("emerald");
    expect(normalizeTier(0)).toBe("iron");
    expect(normalizeTier(8)).toBe("challenger");
    expect(normalizeTier("6")).toBe("master");
    // junk / out-of-range / absent → null → the "unranked" fallback visual
    expect(normalizeTier("platinum")).toBeNull();
    expect(normalizeTier(99)).toBeNull();
    expect(normalizeTier(null)).toBeNull();
    expect(normalizeTier(undefined)).toBeNull();
    expect(normalizeTier("")).toBeNull();
    const fb = tierVisual("not-a-tier");
    expect(fb.key).toBe("unranked");
    expect(fb.label).toBe("未定級");
    expect(fb.apex).toBe(false);
  });
});

describe("division rendering (rank-tier-division)", () => {
  it("coerces 1..4 / roman / numeric-string; IV is lowest, I highest", () => {
    cover("rank-tier-division");
    expect(divisionRoman(1)).toBe("I");
    expect(divisionRoman(2)).toBe("II");
    expect(divisionRoman(3)).toBe("III");
    expect(divisionRoman(4)).toBe("IV");
    expect(normalizeDivision(4)).toBe(4);
    expect(normalizeDivision("IV")).toBe(4);
    expect(normalizeDivision("iv")).toBe(4);
    expect(normalizeDivision("1")).toBe(1);
    // absent / apex / out-of-range → null (no roman shown)
    expect(normalizeDivision(0)).toBeNull();
    expect(normalizeDivision(5)).toBeNull();
    expect(normalizeDivision(null)).toBeNull();
    expect(normalizeDivision(undefined)).toBeNull();
    expect(normalizeDivision("")).toBeNull();
  });

  it("formatRank composes '<label> <roman>' for divisioned tiers", () => {
    cover("rank-tier-division");
    expect(formatRank("gold", 2)).toBe("金 II");
    expect(formatRank("iron", 4)).toBe("鐵 IV");
    expect(formatRank("diamond", "I")).toBe("鑽石 I");
    // no division supplied → label alone
    expect(formatRank("silver")).toBe("銀");
    expect(formatRank("nonsense", 2)).toBe("未定級");
  });
});

describe("apex tiers have no division (rank-tier-apex)", () => {
  it("Master/Grandmaster/Challenger are apex; others are not", () => {
    cover("rank-tier-apex");
    expect([...APEX_TIERS].sort()).toEqual(["challenger", "grandmaster", "master"]);
    for (const key of ["master", "grandmaster", "challenger"] as TierKey[]) {
      expect(isApex(key)).toBe(true);
      expect(tierVisual(key).apex).toBe(true);
    }
    for (const key of ["iron", "bronze", "silver", "gold", "emerald", "diamond"] as TierKey[]) {
      expect(isApex(key)).toBe(false);
      expect(tierVisual(key).apex).toBe(false);
    }
  });

  it("apex ignores any division passed → label only", () => {
    cover("rank-tier-apex");
    // even if the backend accidentally sends a division on an apex row, it's dropped
    expect(formatRank("challenger", 1)).toBe("菁英");
    expect(formatRank("master", "IV")).toBe("大師");
    expect(formatRank("grandmaster")).toBe("宗師");
  });
});
