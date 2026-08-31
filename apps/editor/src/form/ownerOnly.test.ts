import { describe, expect, it } from "vitest";
import { ownerOnlyEntries, ownerOnlyReasons } from "./ownerOnly";

describe("generated owner-only config policy", () => {
  it("keeps all 39 owner knobs visible but non-editable", () => {
    const entries = ownerOnlyEntries();
    const reasons = ownerOnlyReasons("config.combat-env@1");
    expect(entries).toHaveLength(39);
    expect(reasons.size).toBe(39);
    expect(reasons.get("multipliers.maxHealth")).toMatch(/owner/);
    expect(reasons.get("multipliers.abilityDamage")).toMatch(/owner/);
  });

  it("does not protect a same-named field owned by another config schema", () => {
    expect(ownerOnlyReasons("config.other@1").size).toBe(0);
  });
});
