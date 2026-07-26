/**
 * TASK #247 follow-up — the editor's LIVE PREVIEW knows what a leap is.
 *
 * #247 added `leap` to the shared EffectDef union but not to
 * `PreviewController.effectLines`, so an ability whose only effect is a leap —
 * which is exactly 蒼月潮 07-03 (godie-hpb1.e), the ability the task was
 * commissioned for — previewed as an EMPTY effect list. The designer's whole
 * contract with this panel is 「表單看到的 == 遊戲跑的」, and a silently missing
 * line breaks it in the one direction nobody notices: nothing is displayed, so
 * nothing looks wrong.
 *
 * The switch is now exhaustive (`never` in the default arm), so the compiler
 * catches the NEXT kind. This suite catches the one that already slipped.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { createSimPreviewController } from "./PreviewController";
import { Stat, type ChampionDef, type AbilityDef } from "@ggd/shared/sim";
import type { AbilityId, ChampionId, ItemId } from "@ggd/shared/ids";

/** The shipped 蒼月潮 07-03 arc, verbatim from content/abilities/godie-hpb1.e.json. */
const LEAP_E: AbilityDef = {
  id: "test.leap.e" as AbilityId,
  name: "07-03 列、在、前",
  slot: "E",
  castType: "ground",
  maxRank: 4,
  cooldown: [65, 65, 65, 65],
  manaCost: [220, 250, 280, 310],
  range: 14,
  radius: 6.05,
  targetsEnemies: true,
  effects: [
    {
      kind: "leap",
      applyTo: "self",
      mode: "toPoint",
      apexHeight: 11,
      durationSec: 1.44,
      landRadius: 6.05,
      onLand: [
        {
          kind: "damage",
          damageType: "physical",
          amount: { perRank: [450, 550, 650, 750], ratios: [{ stat: Stat.AttackDamage, coeff: 0.5 }] },
        },
      ],
    },
  ],
};

const filler = (slot: "Q" | "W" | "R"): AbilityDef => ({
  id: `test.leap.${slot.toLowerCase()}` as AbilityId,
  name: slot,
  slot,
  castType: "self",
  maxRank: 4,
  cooldown: [1, 1, 1, 1],
  manaCost: [0, 0, 0, 0],
  range: 1,
  effects: [{ kind: "heal", amount: { flat: 1 } }],
});

const CHAMP: ChampionDef = {
  id: "test-leaper" as ChampionId,
  name: "Test Leaper",
  role: "fighter",
  attackType: "melee",
  modelKey: "champ.thorne",
  baseStats: {
    maxHealth: 660,
    healthRegen: 1.7,
    maxMana: 500,
    manaRegen: 1.36,
    ad: 40,
    ap: 0,
    armor: 5,
    mr: 28,
    as: 0.53,
    ms: 5.8,
    critChance: 0,
    critDamage: 1.75,
    cdr: 0,
    lifesteal: 0,
    range: 1.6,
  },
  growth: {},
  skillOrder: ["Q", "W", "E", "R"],
  buildPriority: [] as ItemId[],
  abilities: { Q: filler("Q"), W: filler("W"), E: LEAP_E, R: filler("R") },
} as unknown as ChampionDef;

describe("#247 — editor preview renders the leap", () => {
  it("a leap-only ability previews as a real line, not an empty list", () => {
    cover("leap-editor-preview");
    const ctrl = createSimPreviewController();
    const preview = ctrl.previewAbility(CHAMP, "E");
    ctrl.dispose();

    // THE REGRESSION: this array was length 0 before the fix.
    expect(preview.lines.length).toBeGreaterThan(0);

    const leap = preview.lines.find((l) => l.kind === "leap");
    expect(leap, "the leap must produce its own line").toBeTruthy();
    expect(leap!.depth).toBe(0);
    // the numbers a designer is actually tuning are on the line
    expect(leap!.summary).toContain("11"); // apex, GGD units
    expect(leap!.summary).toContain("1.44"); // flight seconds
    expect(leap!.summary).toContain("6.05"); // landing AoE
    expect(leap!.summary).toContain("self"); // who flies

    // the LANDING PAYLOAD recurses and resolves per rank through the real
    // statPipeline — a leap whose damage did not show would be just as blind.
    const dmg = preview.lines.find((l) => l.kind === "damage");
    expect(dmg, "onLand damage must be listed").toBeTruthy();
    expect(dmg!.depth).toBe(1); // indented under the leap
    expect(dmg!.perRank).toHaveLength(4);
    // 450 + 0.5 x AD at rank 1, and strictly rising per rank
    expect(dmg!.perRank![0]).toBeGreaterThan(450);
    expect(dmg!.perRank![3]).toBeGreaterThan(dmg!.perRank![0]!);
  });
});
