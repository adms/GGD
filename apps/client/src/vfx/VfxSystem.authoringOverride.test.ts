import { afterEach, describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import type { VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import { VfxSystem } from "./VfxSystem";

let scene: Scene | null = null;
let engine: NullEngine | null = null;

afterEach(() => {
  scene?.dispose();
  engine?.dispose();
  scene = null;
  engine = null;
});

describe("VfxSystem authoring script override", () => {
  it("renders the unsaved Forge draft instead of requiring the registered script", () => {
    engine = new NullEngine();
    scene = new Scene(engine);
    const draft: VfxScriptDoc = {
      id: "forge.unsaved",
      schema: "vfx-script@1",
      abilityId: "forge.unsaved",
      segments: [
        {
          kind: "floatingText",
          on: "castStart",
          text: "UNSAVED-DRAFT",
          durationSec: 1,
        },
      ],
    };
    const vfx = new VfxSystem(scene, {
      entityPos: () => ({ x: 0, z: 0 }),
      vfxScriptFor: (id) => id === draft.abilityId ? draft : undefined,
      allVfxScripts: () => [draft],
    });

    vfx.handleEvent({
      type: "abilityCast",
      tick: 0,
      data: { abilityId: draft.abilityId, caster: 1 },
    }, 0);
    vfx.update(0);

    const active = (vfx.floatingTextEntries as readonly { active: boolean; text: string }[])
      .filter((entry) => entry.active);
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ text: "UNSAVED-DRAFT" });
    vfx.dispose();
  });
});
