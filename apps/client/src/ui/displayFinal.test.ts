/**
 * hud-display-final (task #125): displayFinal is the ONE canonical
 * post-multiplier number. A base × the matching combat-env factor = the value
 * the sim actually uses, so no tooltip can show a base while combat runs a
 * final. Node-testable: the pure form takes the env table explicitly.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { normalizeCombatEnv, DEFAULT_COMBAT_ENV } from "@ggd/shared/sim/combatEnv";
import {
  displayFinal,
  displayFinalText,
  envFactor,
  isScaled,
  resolveFactorKey,
  getDisplayEnv,
  setDisplayEnv,
  setDisplayEnvJson,
  resetDisplayEnv,
} from "./displayFinal";
import { metaValue, type TooltipMeta } from "./components/Tooltip";

// the live 皮卡丘 playtest table: cooldown runs at 25%
const CD_QUARTER = normalizeCombatEnv({ cooldown: 0.25 });

describe("displayFinal (hud-display-final)", () => {
  beforeEach(() => resetDisplayEnv());

  it("scales a cooldown by the combat-env cooldown factor — 35 @0.25 → 8.75", () => {
    cover("hud-display-final");
    // the exact playtest bug: 皮卡丘 十萬伏特 base 35s, combat runs it at 8.75s
    expect(displayFinal(35, "cooldown", CD_QUARTER)).toBe(8.75);
    // neutral table is a no-op (base unchanged)
    expect(displayFinal(35, "cooldown", DEFAULT_COMBAT_ENV)).toBe(35);
  });

  it("道具冷卻走自己的 key,不是技能冷卻 (#189)", () => {
    cover("hud-display-final");
    // #125 的規則:顯示的數字必須是玩家真正吃到的最終值。#189 把道具冷卻拆成
    // 自己的倍率,所以任何顯示道具內部冷卻的地方都必須走 `itemCooldown` ——
    // 走 `cooldown` 會在兩顆旋鈕不同值時直接說謊。
    const SPLIT = normalizeCombatEnv({ cooldown: 0.25, itemCooldown: 2 });
    expect(resolveFactorKey("itemCooldown")).toBe("itemCooldown");
    expect(displayFinal(1, "itemCooldown", SPLIT)).toBe(2);
    // 拿同一個表用錯 key,得到的是完全不同的數字 —— 這正是這條守衛存在的理由。
    expect(displayFinal(1, "cooldown", SPLIT)).toBe(0.25);
    // 中性表下兩者都不動基底。
    expect(displayFinal(1, "itemCooldown", DEFAULT_COMBAT_ENV)).toBe(1);
  });

  it("maps friendly aliases onto the right env key", () => {
    cover("hud-display-final");
    expect(resolveFactorKey("damage")).toBe("damageDealt");
    expect(resolveFactorKey("hp")).toBe("maxHealth");
    expect(resolveFactorKey("health")).toBe("maxHealth");
    expect(resolveFactorKey("mana")).toBe("maxMana");
    expect(resolveFactorKey("regen")).toBe("healthRegen");
    expect(resolveFactorKey("ad")).toBe("attackDamage");
    expect(resolveFactorKey("ap")).toBe("abilityPower");
    // a canonical key passes through unchanged
    expect(resolveFactorKey("cooldown")).toBe("cooldown");
    // damage scaled by damageDealt
    const half = normalizeCombatEnv({ damageDealt: 2 });
    expect(displayFinal(200, "damage", half)).toBe(400);
  });

  it("scales ability range + AoE by the abilityRange factor — 12 @0.6 → 7.2 (task #136)", () => {
    cover("hud-display-final");
    const RANGE_60 = normalizeCombatEnv({ abilityRange: 0.6 });
    // the task's worked example: a 12-range ability displays 7.2 (0.6 is not
    // binary-exact, so 12×0.6 = 7.199…; the formatter rounds it back to "7.2")
    expect(displayFinal(12, "abilityRange", RANGE_60)).toBeCloseTo(7.2, 6);
    // friendly UI aliases all resolve onto the same env key
    expect(resolveFactorKey("range")).toBe("abilityRange");
    expect(resolveFactorKey("radius")).toBe("abilityRange");
    expect(resolveFactorKey("aoe")).toBe("abilityRange");
    expect(displayFinal(8, "radius", RANGE_60)).toBeCloseTo(4.8, 6);
    expect(displayFinalText(12, "range", { env: RANGE_60 })).toBe("7.2");
    // neutral table leaves the base untouched
    expect(displayFinal(12, "abilityRange", DEFAULT_COMBAT_ENV)).toBe(12);
  });

  it("treats 'none' / unknown factor as unscaled (base passes through)", () => {
    cover("hud-display-final");
    expect(resolveFactorKey("none")).toBeNull();
    expect(displayFinal(40, "none", CD_QUARTER)).toBe(40);
    // a mana COST has no env multiplier: routing it through 'none' keeps the base
    expect(envFactor("none", CD_QUARTER)).toBe(1);
    // a garbage factor never throws and never scales
    expect(displayFinal(40, "bogus" as never, CD_QUARTER)).toBe(40);
  });

  it("passes non-finite bases through and rejects bad multipliers", () => {
    cover("hud-display-final");
    expect(Number.isNaN(displayFinal(NaN, "cooldown", CD_QUARTER))).toBe(true);
    // normalizeCombatEnv already drops negatives/NaN to 1.0 — factor stays neutral
    const bad = normalizeCombatEnv({ cooldown: -3 });
    expect(displayFinal(10, "cooldown", bad)).toBe(10);
  });

  it("formats finals: drops trailing zeros, appends a unit", () => {
    cover("hud-display-final");
    expect(displayFinalText(35, "cooldown", { env: CD_QUARTER, unit: "s" })).toBe("8.75s");
    expect(displayFinalText(36, "cooldown", { env: CD_QUARTER })).toBe("9"); // 36×0.25 = 9 (integer, no ".0")
    expect(displayFinalText(100, "hp", { env: DEFAULT_COMBAT_ENV })).toBe("100");
  });

  it("isScaled tells a chip whether the factor actually moved the number", () => {
    cover("hud-display-final");
    expect(isScaled("cooldown", CD_QUARTER)).toBe(true);
    expect(isScaled("cooldown", DEFAULT_COMBAT_ENV)).toBe(false);
    expect(isScaled("none", CD_QUARTER)).toBe(false);
  });

  it("the singleton mirror drives the 2-arg default form", () => {
    cover("hud-display-final");
    // default is neutral until installed
    expect(displayFinal(35, "cooldown")).toBe(35);
    setDisplayEnv(CD_QUARTER);
    expect(getDisplayEnv()).toBe(CD_QUARTER);
    expect(displayFinal(35, "cooldown")).toBe(8.75);
    // installing from the wire JSON (the shape MatchState.combatEnvJson carries)
    setDisplayEnvJson(JSON.stringify({ cooldown: 0.5 }));
    expect(displayFinal(35, "cooldown")).toBe(17.5);
    // malformed JSON fails safe to neutral
    setDisplayEnvJson("{not json");
    expect(displayFinal(35, "cooldown")).toBe(35);
  });
});

describe("tooltip meta shows the FINAL, not the base (hud-display-final)", () => {
  it("resolves a cooldown chip through the live env to the post-multiplier value", () => {
    cover("hud-display-final");
    // exactly what AbilityBar / the champ-select profile should emit
    const chip: TooltipMeta = { label: "冷卻", base: 35, factor: "cooldown", unit: "s" };
    // the tooltip renders 8.75s under the 0.25 table, 35s under neutral
    expect(metaValue(chip, CD_QUARTER)).toBe("8.75s");
    expect(metaValue(chip, DEFAULT_COMBAT_ENV)).toBe("35s");
    // a literal chip (cast type / un-scaled mana cost) is passed through verbatim
    expect(metaValue({ label: "魔力", value: "40" }, CD_QUARTER)).toBe("40");
    expect(metaValue({ label: "施法", value: "自身" }, CD_QUARTER)).toBe("自身");
  });
});
