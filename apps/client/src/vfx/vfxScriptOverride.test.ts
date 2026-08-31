import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import { VfxScriptPlayer } from "./VfxScriptPlayer";

const DOC: VfxScriptDoc = {
  id: "test.scripted",
  schema: "vfx-script@1",
  abilityId: "test.scripted",
  segments: [{ kind: "floatingText", on: "castStart", text: "SCRIPT" }],
};

function player(enabled: boolean): VfxScriptPlayer {
  return new VfxScriptPlayer({
    scriptFor: (id) => id === DOC.abilityId ? DOC : undefined,
    allScripts: () => [DOC],
    projectileIdsOf: () => new Set(),
    entityPos: () => ({ x: 0, z: 0 }),
    dispatch: () => undefined,
    enabled: () => enabled,
  });
}

describe("vfx-script replaces the default cast presentation", () => {
  it("uses the player's live rollback switch as the single ownership rule", () => {
    expect(player(true).hasScript(DOC.abilityId)).toBe(true);
    expect(player(false).hasScript(DOC.abilityId)).toBe(false);
    expect(player(true).hasScript("test.no-script")).toBe(false);
  });

  it("gates every default family-art branch at the VfxSystem abilityCast seam", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "VfxSystem.ts"), "utf8");
    const start = src.indexOf('case "abilityCast"');
    const end = src.indexOf('case "castBegin"', start);
    const abilityCast = src.slice(start, end);
    expect(abilityCast).toContain("this.scriptPlayer.hasScript(abilityId)");
    expect(abilityCast).toMatch(/if \(!scriptedCast\) \{\s*this\.playCastVfx\(/);
    expect(abilityCast).toMatch(/if \(!scriptedCast\) \{\s*for \(const req of arcCastPlan/);
    expect(abilityCast).toContain("if (!scriptedCast && decal)");
  });

  it("replaces ability-authored inline modelFx while retaining script-synthesized modelFx", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "VfxSystem.ts"), "utf8");
    const start = src.indexOf('case "modelFxSpawn"');
    const end = src.indexOf('case "screenFlash"', start);
    const modelFx = src.slice(start, end);
    expect(modelFx).toContain("abilityIdOfAuthoredOrigin(p.origin)");
    expect(modelFx).toContain("this.scriptPlayer.hasScript(authoredAbilityId)");
    expect(modelFx.indexOf("this.scriptPlayer.hasScript(authoredAbilityId)"))
      .toBeLessThan(modelFx.indexOf("this.modelFx.spawn(p)"));
  });

  it("replaces ability-authored particle and screen-cue payloads by shared provenance", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "VfxSystem.ts"), "utf8");
    const between = (start: string, end: string): string => {
      const from = src.indexOf(start);
      return src.slice(from, src.indexOf(end, from + start.length));
    };
    const vfxSpawn = between('case "vfxSpawn"', 'case "vfxScriptBeam"');
    const screenCues = between('case "screenFlash"', 'case "floatingText"');
    const floatingText = between('case "floatingText"', 'case "chainLightning"');
    for (const branch of [vfxSpawn, screenCues, floatingText]) {
      expect(branch).toContain("abilityIdOfAuthoredOrigin");
      expect(branch).toContain("this.scriptPlayer.hasScript");
    }

    const cueEmitter = readFileSync(join(here, "../../../../packages/shared/src/sim/effects/clientCues.ts"), "utf8");
    const vfxEmitter = readFileSync(join(here, "../../../../packages/shared/src/sim/effects/spawnVfx.ts"), "utf8");
    expect(cueEmitter.match(/origin: ctx\.origin/g)?.length).toBeGreaterThanOrEqual(3);
    expect(vfxEmitter).toContain("origin: ctx.origin");
  });

  it("dispatches a beam segment through the single VfxSystem event seam", () => {
    const dispatched: { type: string; data: Record<string, unknown> }[] = [];
    const doc: VfxScriptDoc = {
      id: "test.beam",
      schema: "vfx-script@1",
      abilityId: "test.beam",
      segments: [{
        kind: "beam",
        on: "castStart",
        lengthU: 9,
        widthU: 1.5,
        heightU: 1,
        pitchDeg: 0,
        travelU: 4,
        durationSec: 0.8,
        colorRgb: [20, 120, 255],
        alpha: 1,
      }],
    };
    const beamPlayer = new VfxScriptPlayer({
      scriptFor: (id) => id === doc.abilityId ? doc : undefined,
      allScripts: () => [doc],
      projectileIdsOf: () => new Set(),
      entityPos: () => ({ x: 2, z: 3 }),
      dispatch: (event) => dispatched.push(event as never),
      enabled: () => true,
    });
    beamPlayer.onEvent({
      type: "abilityCast",
      tick: 1,
      data: { abilityId: doc.abilityId, caster: 7, direction: { x: 1, z: 0 } },
    } as never, 0);
    beamPlayer.update(0);
    expect(dispatched).toEqual([expect.objectContaining({
      type: "vfxScriptBeam",
      data: expect.objectContaining({ x: 2, z: 3, dx: 1, dz: 0, travelU: 4 }),
    })]);
  });
});
