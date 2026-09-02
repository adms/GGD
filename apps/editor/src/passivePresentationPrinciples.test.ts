import { describe, expect, it } from "vitest";
import { passivePresentationRules } from "./passivePresentationPrinciples";

describe("被動技能演出模板", () => {
  it("不替被動 on-hit 發明施法，改把命中特效放回同一個 hook", () => {
    const rules = passivePresentationRules({
      slot: "PASSIVE",
      passive: { ranks: [{ hooks: [{ on: "onBasicAttack", effects: [{ kind: "damage" }] }] }] },
    });
    expect(rules).toContainEqual(expect.objectContaining({
      kind: "on-hit",
      support: "authorable-inline",
      authoringSurface: "效果鏈",
    }));
  });

  it("辨識已存在的 on-hit VFX，而不重複建議", () => {
    const rules = passivePresentationRules({
      slot: "PASSIVE",
      passive: { ranks: [{ hooks: [{
        on: "onBasicAttack",
        effects: [{ kind: "spawnVfx", vfxId: "fx.hit" }],
      }] }] },
    });
    expect(rules).toContainEqual(expect.objectContaining({ kind: "on-hit", support: "authored" }));
  });

  it("block 使用現有 grant 演出欄位，evasion 誠實回報來源歸屬缺口", () => {
    const rules = passivePresentationRules({
      slot: "PASSIVE",
      passive: { ranks: [{
        block: { chance: 0.3, fraction: 1, vfxId: "fx.guard" },
        effects: [{ kind: "evasion", chance: 0.2 }],
      }] },
    });
    expect(rules).toContainEqual(expect.objectContaining({ kind: "block", support: "authored" }));
    expect(rules).toContainEqual(expect.objectContaining({ kind: "evasion", support: "main-trigger-gap" }));
  });

  it("暴擊沿用攻擊動作，並可在現有 hook 補來源專屬 VFX", () => {
    const rules = passivePresentationRules({
      slot: "Q",
      effects: [],
      passive: { ranks: [{
        critStrike: { chance: 0.2, damageMult: 2 },
        hooks: [{
          on: "onDamageDealt",
          damageCrit: "crit",
          critSource: "thisSource",
          effects: [{ kind: "spawnVfx", vfxId: "fx.crit.owner" }],
        }],
      }] },
    });
    expect(rules).toContainEqual(expect.objectContaining({
      kind: "critical-hit",
      support: "authored",
      authoringSurface: "效果鏈",
    }));
    expect(rules.some((rule) => rule.kind === "critical-hit" && rule.authoringSurface === "Main 接縫")).toBe(false);
  });

  it("非 PASSIVE 槽的純被動與主被動混合技能都會顯示被動演出計畫", () => {
    const pure = passivePresentationRules({
      slot: "EX",
      effects: [],
      passive: { ranks: [{ hooks: [{ on: "onInterval", effects: [{ kind: "heal" }] }] }] },
    });
    const hybrid = passivePresentationRules({
      slot: "R",
      effects: [{ kind: "applyBuff" }],
      passive: { ranks: [{ hooks: [{ on: "onBasicAttack", effects: [{ kind: "damage" }] }] }] },
    });
    expect(pure.some((rule) => rule.kind === "periodic")).toBe(true);
    expect(hybrid.some((rule) => rule.kind === "on-hit")).toBe(true);
  });

  it("主動技能不產生被動模板建議", () => {
    expect(passivePresentationRules({ slot: "Q", effects: [{ kind: "evasion" }] })).toEqual([]);
  });
});
