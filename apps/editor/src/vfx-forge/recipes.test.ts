import { describe, expect, it } from "vitest";
import { zVfxScriptSegment } from "@ggd/shared/content/schema/vfxScript";
import { CLASSIC_BEAM_MODEL_KEY, abilityUsesModel, buildVfxForgeRecipe } from "./recipes";

describe("VFX Forge editor-side recipes", () => {
  it.each(["classic-beam-fire", "classic-beam-blue"] as const)("%s expands into an MDL body plus bounded helpers", (id) => {
    const segments = buildVfxForgeRecipe(id);
    expect(segments.every((segment) => zVfxScriptSegment.safeParse(segment).success)).toBe(true);
    expect(segments.filter((segment) => segment.kind === "modelFx" && segment.modelKey === CLASSIC_BEAM_MODEL_KEY)).toHaveLength(1);
    const particles = segments.filter((segment) => segment.kind === "vfx");
    expect(particles).toHaveLength(8);
    expect(Math.max(...particles.map((segment) => segment.atMs ?? 0))).toBe(815);
  });

  it("omits the body when ability JSON already owns the same model brick", () => {
    const ability = { effects: [{ kind: "spawnModelFx", modelKey: CLASSIC_BEAM_MODEL_KEY }] };
    expect(abilityUsesModel(ability, CLASSIC_BEAM_MODEL_KEY)).toBe(true);
    expect(buildVfxForgeRecipe("classic-beam-fire", { includeModelCore: false }).some((segment) => segment.kind === "modelFx")).toBe(false);
  });
});
