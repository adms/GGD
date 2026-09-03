/**
 * hud-strip-ability-number: the pure ability-name helpers. The roster names
 * carry a hero/skill number tag ("19-01 斷未") that the in-game bar must drop
 * while the tooltip keeps the full name. Node-testable (no DOM/React).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  abilityMetaChips,
  castTypeLabel,
  docDescription,
  stripAbilityNumber,
} from "./abilityText";
import { metaValue } from "./Tooltip";
import { normalizeCombatEnv, DEFAULT_COMBAT_ENV } from "@ggd/shared/sim/combatEnv";

describe("stripAbilityNumber (hud-strip-ability-number)", () => {
  it("drops a 2-digit-hero / 2-digit-skill tag", () => {
    cover("hud-strip-ability-number");
    expect(stripAbilityNumber("19-01 斷未")).toBe("斷未");
    expect(stripAbilityNumber("05-04 巴歐．薩喀爾嘎")).toBe("巴歐．薩喀爾嘎");
  });

  it("drops a 3-digit-skill tag (NN-00X)", () => {
    cover("hud-strip-ability-number");
    expect(stripAbilityNumber("22-002 月光下的決鬥者")).toBe("月光下的決鬥者");
  });

  it("drops a 1-3 digit hero number", () => {
    cover("hud-strip-ability-number");
    expect(stripAbilityNumber("7-01 甲")).toBe("甲");
    expect(stripAbilityNumber("113-01 乙")).toBe("乙");
  });

  it("leaves un-tagged names untouched", () => {
    cover("hud-strip-ability-number");
    expect(stripAbilityNumber("斷未")).toBe("斷未");
    expect(stripAbilityNumber("究極EX招式")).toBe("究極EX招式");
    // single-digit skill number is NOT a tag (skill is 2-3 digits) → unchanged
    expect(stripAbilityNumber("19-1 斷未")).toBe("19-1 斷未");
    // a 4-digit leading number is not a hero tag → unchanged
    expect(stripAbilityNumber("2020-01 紀念")).toBe("2020-01 紀念");
  });

  it("never reduces a name to the empty string (edge)", () => {
    cover("hud-strip-ability-number");
    // a bare tag with nothing after it is left intact rather than emptied
    expect(stripAbilityNumber("19-01 ")).toBe("19-01 ");
    expect(stripAbilityNumber("")).toBe("");
  });
});

describe("docDescription + castTypeLabel (hud-strip-ability-number)", () => {
  it("reads an optional description and collapses empty/absent to undefined", () => {
    cover("hud-strip-ability-number");
    expect(docDescription({ description: "招喚金色雷龍" })).toBe("招喚金色雷龍");
    expect(docDescription({ description: "" })).toBeUndefined();
    expect(docDescription({})).toBeUndefined();
    expect(docDescription(undefined)).toBeUndefined();
  });


  it("maps every cast type to a compact label", () => {
    cover("hud-strip-ability-number");
    expect(castTypeLabel("self")).toBe("自身");
    expect(castTypeLabel("skillshot")).toBe("技能預測");
    expect(castTypeLabel("targeted")).toBe("鎖定");
    expect(castTypeLabel("ground")).toBe("地面指定");
    expect(castTypeLabel("dash")).toBe("位移");
  });
});

// ---------------------------------------------------------------------------
// task #125: shared ability meta chips carry the cooldown as a scaled final
// ---------------------------------------------------------------------------

describe("abilityMetaChips (hud-display-final)", () => {
  const CD_QUARTER = normalizeCombatEnv({ cooldown: 0.25 });

  it("emits cooldown as a scaled {base, factor} chip and mana cost as a literal", () => {
    cover("hud-display-final");
    const chips = abilityMetaChips({ castType: "self", cooldownSec: 35, manaCost: 40 });
    expect(chips).toEqual([
      { label: "施法", value: "自身" },
      { label: "冷卻", base: 35, factor: "cooldown", unit: "s" },
      { label: "魔力", value: "40" },
    ]);
    // rendered through <Tooltip> the cooldown shows the FINAL — 8.75s at 0.25,
    // 35s under a neutral table — while the mana COST is never scaled.
    expect(metaValue(chips[1]!, CD_QUARTER)).toBe("8.75s");
    expect(metaValue(chips[1]!, DEFAULT_COMBAT_ENV)).toBe("35s");
    expect(metaValue(chips[2]!, CD_QUARTER)).toBe("40");
  });

  it("prefers a pre-built castLabel (EX) and drops a zero/absent mana row", () => {
    cover("hud-display-final");
    const chips = abilityMetaChips({ castLabel: "位移", cooldownSec: 12, manaCost: 0 });
    expect(chips).toEqual([
      { label: "施法", value: "位移" },
      { label: "冷卻", base: 12, factor: "cooldown", unit: "s" },
    ]);
    // no cast + no mana → just the cooldown chip
    expect(abilityMetaChips({ cooldownSec: 8 })).toEqual([
      { label: "冷卻", base: 8, factor: "cooldown", unit: "s" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// task #114: description colour markup → semantic roles
// ---------------------------------------------------------------------------

/**
 * EVERY distinct RRGGBB the source war3map.wts actually uses in a `|cAARRGGBB`
 * colour span (extracted from tools/w3x-import/out/**, alpha dropped). The
 * parser test asserts each maps to a KNOWN role — never "unknown" — which is
 * the task's normalisation guarantee: no source colour is left unclassified.
 */
const SOURCE_COLORS = [
  "0080ff", "ff8000", "00c800", "c0c0c0", "008000", "ffcc00", "8ad080", "00c000",
  "ff0000", "ffdead", "fe890d", "ff8c00", "8b00ff", "ff1400", "ffd000", "e4576a",
  "842ee1", "00c0c0", "ffd080", "00ff00", "c3dbff", "ffff00", "af5cff", "eff000",
  "ff2020", "ff3400", "20c000", "ffcc01", "235cff", "ff2400", "fffc01", "ff5400",
  "ff4400", "ff0303", "fe7b52", "e55bb0", "dd0925", "959697", "7ebff1", "540081",
  "4e2a04", "1ce6b9", "106246", "0080f4", "0042ff", "ac8052",
] as const;



