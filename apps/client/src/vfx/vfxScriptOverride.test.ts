import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

describe("vfx-script composes with ability presentation", () => {
  it("does not use script presence as a blanket suppression rule", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "VfxSystem.ts"), "utf8");
    expect(src).not.toContain("this.scriptPlayer.hasScript(");
    expect(src).not.toContain("abilityIdOfAuthoredOrigin(");
  });

  it("keeps explicit ability particle, model, screen and text payload consumers", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "VfxSystem.ts"), "utf8");
    const between = (start: string, end: string): string => {
      const from = src.indexOf(start);
      return src.slice(from, src.indexOf(end, from + start.length));
    };
    const vfxSpawn = between('case "vfxSpawn"', 'case "modelFxSpawn"');
    const screenCues = between('case "screenFlash"', 'case "floatingText"');
    const floatingText = between('case "floatingText"', 'case "chainLightning"');
    const modelFx = between('case "modelFxSpawn"', 'case "screenFlash"');
    expect(vfxSpawn).toContain("this.play(");
    expect(modelFx).toContain("this.modelFx.spawn(p)");
    expect(screenCues).toContain("this.screenFx.flash(");
    expect(floatingText).toContain("this.floatingText.spawn(");

    const cueEmitter = readFileSync(join(here, "../../../../packages/shared/src/sim/effects/clientCues.ts"), "utf8");
    const vfxEmitter = readFileSync(join(here, "../../../../packages/shared/src/sim/effects/spawnVfx.ts"), "utf8");
    expect(cueEmitter.match(/origin: ctx\.origin/g)?.length).toBeGreaterThanOrEqual(3);
    expect(vfxEmitter).toContain("origin: ctx.origin");
  });

});
