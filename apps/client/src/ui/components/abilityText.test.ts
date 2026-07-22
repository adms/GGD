/**
 * hud-strip-ability-number: the pure ability-name helpers. The roster names
 * carry a hero/skill number tag ("19-01 斷未") that the in-game bar must drop
 * while the tooltip keeps the full name. Node-testable (no DOM/React).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { castTypeLabel, docDescription, stripAbilityNumber } from "./abilityText";

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
