import { describe, expect, it } from "vitest";
import type { AbilityTemplateBinding } from "@ggd/shared/content";
import type { ExpandResult } from "@ggd/shared/content/templates/expand";
import { runtimePreviewDoc } from "./runtimePreviewDoc";

const binding: AbilityTemplateBinding = { ref: "tpl-single-strike", params: {} };
const expansion: ExpandResult = {
  castType: "targeted",
  targetsEnemies: true,
  effects: [{ kind: "damage", damageType: "magic", amount: { flat: 400 } }],
};

describe("Forge runtime preview document", () => {
  it("keeps registerAll-resolved model presets while applying the draft behaviour and VFX layers", () => {
    const authoring = {
      id: "godie-hjai.e",
      vfxLayers: [{ vfxKey: "fx.draft", at: "point" }],
      effects: [{ kind: "spawnModelFx", preset: "tpl-line-blast" }],
    };
    const registered = {
      id: "godie-hjai.e",
      schema: "ability@1",
      slot: "E",
      castType: "point",
      effects: [{
        kind: "spawnModelFx",
        preset: "tpl-line-blast",
        modelKey: "imported.fireblast",
        path: "forward",
        speed: 12,
      }],
      vfxKey: "fx.old",
    };

    const out = runtimePreviewDoc(authoring, registered, expansion, binding);
    expect(out.effects).toEqual([
      expansion.effects[0],
      expect.objectContaining({ modelKey: "imported.fireblast", path: "forward", speed: 12 }),
    ]);
    expect(out.vfxKey).toBeUndefined();
    expect(out.vfxLayers).toEqual(authoring.vfxLayers);
  });
});
