import { describe, expect, it } from "vitest";
import { SKILL_TYPE_PRESETS } from "./skillTypePresets";
import { diagnoseSkillTiers } from "./skillReasonableness";

describe("鑄技工坊級距合理性守衛", () => {
  it("標出高傷害、低耗魔、短冷卻的無代價組合", () => {
    expect(diagnoseSkillTiers({
      damage: "極大", mana: "極小", cooldown: "小", castTime: "極小",
    }).map((row) => row.code)).toContain("HIGH_DAMAGE_LOW_COST");
  });

  it("標出遠距大範圍卻沒有成本的組合", () => {
    expect(diagnoseSkillTiers({
      damage: "中", range: "大", radius: "極大", mana: "中", cooldown: "小",
    }).map((row) => row.code)).toContain("LONG_WIDE_CHEAP");
  });

  it("標出高位移爆發循環", () => {
    expect(diagnoseSkillTiers({
      damage: "大", travel: "大", cooldown: "中", mana: "中",
    }).map((row) => row.code)).toContain("MOBILITY_BURST_LOOP");
  });

  it("內建 14 種 recipe 都有明確結果，且警告不會偷偷修改原值", () => {
    for (const preset of SKILL_TYPE_PRESETS) {
      const before = JSON.stringify(preset.tierDefaults);
      const result = diagnoseSkillTiers(preset.tierDefaults, preset);
      expect(result.length, preset.id).toBeGreaterThan(0);
      expect(JSON.stringify(preset.tierDefaults), preset.id).toBe(before);
    }
  });
});
