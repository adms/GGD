import { describe, expect, it } from "vitest";
import { createSimPreviewController } from "./PreviewController";
import type { AbilityDef, ChampionDef, EffectDef } from "@ggd/shared/sim";
import type { AbilityId, ChampionId, ItemId } from "@ggd/shared/ids";

const LANDED: readonly EffectDef[] = [
  { kind: "summon", body: "self", count: 1 },
  { kind: "knockback", distance: 3, speed: 6 },
  { kind: "evasion", chance: 0.2, durationSec: 3 },
  { kind: "blink", shape: "single", to: "point", applyTo: "self" },
  {
    kind: "delayed",
    shape: "single",
    delaySec: 1,
    effects: [{ kind: "heal", amount: { flat: 1 } }],
  },
  { kind: "proxyCast", shape: "single", slot: "Q" },
  { kind: "carry", shape: "single", durationSec: 3 },
  { kind: "convertTeam", shape: "single" },
];

function ability(id: string, effect: EffectDef): AbilityDef {
  return {
    id: id as AbilityId,
    name: id,
    slot: "Q",
    castType: "self",
    maxRank: 4,
    cooldown: [1, 1, 1, 1],
    manaCost: [0, 0, 0, 0],
    range: 1,
    effects: [effect],
  };
}

function champion(index: number, q: AbilityDef): ChampionDef {
  const filler = (slot: "W" | "E" | "R"): AbilityDef => ({
    ...q,
    id: `preview-landed-${index}.${slot.toLowerCase()}` as AbilityId,
    name: slot,
    slot,
    effects: [{ kind: "heal", amount: { flat: 1 } }],
  });
  return {
    id: `preview-landed-${index}` as ChampionId,
    name: `Preview ${index}`,
    role: "mage",
    attackType: "ranged",
    modelKey: "champ.thorne",
    baseStats: {
      maxHealth: 500,
      maxMana: 500,
      manaRegen: 0,
      ad: 40,
      armor: 5,
      mr: 20,
      as: 0.5,
      ms: 5,
      range: 5,
    },
    growth: {},
    skillOrder: ["Q", "W", "E", "R"],
    buildPriority: [] as ItemId[],
    abilities: { Q: q, W: filler("W"), E: filler("E"), R: filler("R") },
  } as unknown as ChampionDef;
}

describe("editor preview describes every landed runtime kind as live", () => {
  it.each(LANDED.map((effect, index) => [effect.kind, effect, index] as const))(
    "%s no longer carries a stale unimplemented warning",
    (_kind, effect, index) => {
      const q = ability(`preview-landed-${index}.q`, effect);
      const ctrl = createSimPreviewController();
      const line = ctrl.previewAbility(champion(index, q), "Q").lines.find((row) => row.kind === effect.kind);
      ctrl.dispose();

      expect(line).toBeDefined();
      expect(line!.summary).not.toMatch(/NOT IMPLEMENTED|尚未實作|什麼都不會發生/);
    },
  );
});
