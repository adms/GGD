import { describe, expect, it } from "vitest";
import { zVfxScriptSegment } from "@ggd/shared/content/schema/vfxScript";
import {
  CLASSIC_BEAM_CORE_MODEL_KEY,
  CLASSIC_BEAM_MODEL_KEY,
  VFX_FORGE_RECIPES,
  VFX_FORGE_RECIPE_FAMILIES,
  abilityUsesModel,
  buildVfxForgeRecipe,
} from "./recipes";

const activeRecipe = (id: Parameters<typeof buildVfxForgeRecipe>[0], options: Omit<Parameters<typeof buildVfxForgeRecipe>[1], "activationMode"> = {}) =>
  buildVfxForgeRecipe(id, { ...options, activationMode: "active" });

describe("VFX Forge editor-side recipes", () => {
  it("offers stable semantic variants instead of numeric landed ids or slider-only authoring", () => {
    const keys = VFX_FORGE_RECIPES.map((recipe) => `${recipe.familyId}/${recipe.variantId}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(VFX_FORGE_RECIPES.every((recipe) => !/^type\d+$/i.test(recipe.variantId))).toBe(true);
    expect(VFX_FORGE_RECIPE_FAMILIES.flatMap((family) => family.recipes)).toHaveLength(VFX_FORGE_RECIPES.length);
    const beamTypes = VFX_FORGE_RECIPE_FAMILIES.find((family) => family.id === "classic-horizontal-beam")?.recipes;
    expect(beamTypes).toHaveLength(10);
    expect(beamTypes?.map((recipe) => recipe.variantId)).toEqual([
      "fire-continuous", "blue-continuous", "holy-gold-blue", "void-purple", "inferno-red-orange",
      "electric-cyan", "lightning-thin", "lightning-wide", "holy-wide", "void-wide",
    ]);
    expect(VFX_FORGE_RECIPE_FAMILIES.find((family) => family.id === "defense-reaction")?.recipes)
      .toHaveLength(3);
  });

  it.each([
    "classic-beam-fire", "classic-beam-blue", "classic-beam-holy",
    "classic-beam-void", "classic-beam-inferno", "classic-beam-electric",
  ] as const)("%s defaults to the source-faithful locust model pair", (id) => {
    const segments = activeRecipe(id);
    expect(segments.every((segment) => zVfxScriptSegment.safeParse(segment).success)).toBe(true);
    expect(segments.filter((segment) => segment.kind === "modelFx").map((segment) => segment.modelKey)).toEqual([
      CLASSIC_BEAM_MODEL_KEY,
      CLASSIC_BEAM_CORE_MODEL_KEY,
    ]);
    for (const model of segments.filter((segment) => segment.kind === "modelFx")) {
      expect(model.path).toBe("static");
      expect(model.scaleAxis?.[2]).toBeGreaterThan(2);
      expect(model.alpha).toBeLessThan(1);
      expect(model.spinDegPerSec).not.toBe(0);
      expect(model.offsetForwardU).toBe(2.75);
    }
    const particles = segments.filter((segment) => segment.kind === "vfx");
    expect(particles).toHaveLength(1);
    expect(Math.max(...particles.map((segment) => segment.atMs ?? 0))).toBe(650);
    expect(Math.max(...particles.map((segment) => segment.w3xScale ?? 0))).toBeLessThanOrEqual(1.05);
    expect(Math.max(...particles.map((segment) => segment.alpha ?? 0))).toBeLessThanOrEqual(0.72);
  });

  it.each([
    "energy-beam-lightning-thin", "energy-beam-lightning-wide",
    "energy-beam-holy-wide", "energy-beam-void-wide",
    "line-blast-fire", "dash-slash-void", "shockwave-dash-light", "combo-slash-holy",
    "reflect-counter-open", "avalon-counter-chain", "rider-dash-beam-blue",
    "avalon-guard-window", "chain-lightning-storm", "bankai-transform", "perfect-parry",
  ] as const)(
    "%s expands only into shipped script bricks",
    (id) => {
      const segments = activeRecipe(id);
      expect(segments.length).toBeGreaterThan(0);
      expect(segments.every((segment) => zVfxScriptSegment.safeParse(segment).success)).toBe(true);
    },
  );

  it("offers primitive-only beam types when authors do not want the classic model family", () => {
    for (const id of [
      "energy-beam-lightning-thin", "energy-beam-lightning-wide",
      "energy-beam-holy-wide", "energy-beam-void-wide",
    ] as const) {
      const segments = activeRecipe(id);
      expect(segments.some((segment) => segment.kind === "modelFx"), id).toBe(false);
      expect(segments.some((segment) => segment.kind === "vfx" && segment.at === "self"), id).toBe(true);
      expect(segments.some((segment) => segment.kind === "vfx" && segment.at === "target"), id).toBe(true);
    }
  });

  it("line blast travels as safe additive pulses and explodes only after its measured flight time", () => {
    const segments = activeRecipe("line-blast-fire");
    expect(segments.some((segment) => segment.kind === "modelFx")).toBe(false);
    const travel = segments.flatMap((segment) =>
      segment.kind === "vfx" && segment.vfxId === "fx.prim.fire.bolt" ? [segment] : []);
    expect(travel).toHaveLength(6);
    expect(travel.map((segment) => segment.offsetForwardU)).toEqual([1.2, 3.2, 5.2, 7.2, 9.2, 11.2]);
    expect(Math.max(...travel.map((segment) => segment.atMs ?? 0))).toBeLessThan(500);
    const arrival = segments.filter((segment) => segment.kind === "vfx" && segment.vfxId !== "fx.prim.fire.bolt");
    expect(arrival.every((segment) => (segment.atMs ?? 0) >= 500)).toBe(true);
    expect(arrival).toContainEqual(expect.objectContaining({
      vfxId: "fx.prim.fire.explosion-lg",
      w3xScale: 2.2,
      offsetForwardU: 12.8,
    }));
  });

  it("void dash moves the real caster and never spawns the unsafe Lina model clone", () => {
    const segments = activeRecipe("dash-slash-void");
    expect(segments.some((segment) => segment.kind === "modelFx" || segment.kind === "hideBody")).toBe(false);
    expect(segments).toContainEqual(expect.objectContaining({
      kind: "bodyMove", at: "caster", mode: "arc",
      offset: { x: 0.35, y: 0.2, z: 4.5 }, durationMs: 560,
    }));
    expect(segments).toContainEqual(expect.objectContaining({
      kind: "anim", at: "caster", pulse: "attack",
    }));
    expect(segments.filter((segment) =>
      segment.kind === "vfx" && segment.vfxId.endsWith(".arc"),
    )).toHaveLength(1);
    expect(segments).toContainEqual(expect.objectContaining({
      kind: "vfx", vfxId: "fx.prim.void.pulse-sm", at: "target",
    }));
  });

  it("active sword combos take over the opening with an attack clip instead of unsafe generic cast art", () => {
    const active = activeRecipe("combo-slash-holy");
    expect(active).toContainEqual(expect.objectContaining({
      kind: "anim", on: "castStart", at: "caster", pulse: "attack",
      replaces: "caster.action",
    }));
    expect(active.some((segment) =>
      segment.kind === "anim" && segment.on === "castStart" && segment.pulse === "cast",
    )).toBe(false);
    expect(active.filter((segment) =>
      segment.kind === "vfx" && segment.on === "strike" && segment.strikeIndex === undefined,
    )).toEqual([expect.objectContaining({
      vfxId: "fx.prim.holy.arc", at: "target", w3xScale: 1.6,
    })]);
    const finalColumns = active.flatMap((segment) =>
      segment.kind === "vfx" && segment.on === "strike" && segment.strikeIndex === 7
        ? [segment]
        : [],
    );
    expect(finalColumns).toHaveLength(2);
    expect(finalColumns.map((segment) => segment.offsetSideU ?? 0)).toEqual([0, 0]);
    expect(finalColumns.map((segment) => segment.offsetForwardU ?? 0)).toEqual([0, 0]);
    expect(finalColumns[0]?.w3xScale).toBeGreaterThan(finalColumns[1]?.w3xScale ?? 0);

    const passive = buildVfxForgeRecipe("avalon-counter-chain", { activationMode: "passive" });
    expect(passive.some((segment) => segment.on === "castStart" || segment.on === "castEffect")).toBe(false);
  });

  it("reflect opening is impossible to trigger from cast or block", () => {
    const passive = buildVfxForgeRecipe("reflect-counter-open", { activationMode: "passive" });
    expect(passive).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "vfx",
        on: "reflectSuccess",
        vfxId: "fx.prim.holy.pulse-sm",
      }),
      expect.objectContaining({ kind: "anim", on: "reflectSuccess", at: "caster", pulse: "guard" }),
    ]));
    expect(passive.some(
      (segment) => segment.kind === "vfx" && segment.vfxId === "fx.avalon.reflect-spark",
    )).toBe(false);
    expect(passive.some((segment) => segment.on === "castStart" || segment.on === "castEffect")).toBe(false);
    expect(activeRecipe("reflect-counter-open")).toContainEqual(expect.objectContaining({
      kind: "anim", on: "castStart", at: "caster", pulse: "cast",
    }));
  });

  it("shockwave dash keeps both stages in one reusable recipe without moving authority", () => {
    const segments = activeRecipe("shockwave-dash-light");
    expect(segments).toContainEqual(expect.objectContaining({
      kind: "vfx", vfxId: "fx.prim.lightning.beam-flat",
    }));
    expect(segments.some((segment) =>
      segment.kind === "vfx" && segment.vfxId === "fx.prim.lightning.beam-flat" && segment.facingDeg !== undefined,
    )).toBe(false);
    expect(segments.some((segment) => segment.kind === "modelFx" || segment.kind === "hideBody")).toBe(false);
    expect(segments.some((segment) => segment.kind === "bodyMove")).toBe(false);
    expect(segments).toContainEqual(expect.objectContaining({
      kind: "anim", at: "caster", pulse: "attack", atMs: 330,
    }));
  });

  it("can still explicitly omit the legacy body when ability JSON owns it", () => {
    const ability = { effects: [{ kind: "spawnModelFx", modelKey: CLASSIC_BEAM_MODEL_KEY }] };
    expect(abilityUsesModel(ability, CLASSIC_BEAM_MODEL_KEY)).toBe(true);
    expect(activeRecipe("classic-beam-fire", { includeModelCore: false }).some((segment) => segment.kind === "modelFx")).toBe(false);
  });

  it("exposes the two multi-stage acceptance scenes as true from-blank composite cards", () => {
    const avalon = buildVfxForgeRecipe("avalon-counter-chain", { activationMode: "passive" });
    expect(avalon.some((segment) => segment.on === "reflectSuccess")).toBe(true);
    expect(avalon.filter((segment) => segment.kind === "bodyMove" && segment.on === "strike")).toHaveLength(6);
    expect(avalon.filter((segment) => segment.on === "strike" && segment.strikeIndex === 7).length).toBeGreaterThanOrEqual(2);

    const rider = activeRecipe("rider-dash-beam-blue");
    expect(rider).toContainEqual(expect.objectContaining({ kind: "bodyMove", at: "caster", mode: "arc" }));
    expect(rider.filter((segment) => segment.kind === "modelFx")).toHaveLength(2);
    expect(rider.filter((segment) => segment.kind === "vfx")).toHaveLength(1);
  });

  it("exposes Main's remaining strict scenes as event-addressed reusable recipes", () => {
    expect(activeRecipe("avalon-guard-window")).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "anim", on: "castStart", pulse: "cast" }),
      expect.objectContaining({ kind: "anim", on: "reflectSuccess", pulse: "guard" }),
    ]));
    expect(activeRecipe("chain-lightning-storm").filter((segment) =>
      segment.kind === "vfx" && segment.vfxId.includes("lightning"),
    ).length).toBeGreaterThanOrEqual(6);
    expect(activeRecipe("bankai-transform")).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "anim", at: "caster", pulse: "cast" }),
      expect.objectContaining({ kind: "vfx", vfxId: "fx.prim.void.summon" }),
    ]));
    expect(activeRecipe("perfect-parry")).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "anim", on: "reflectSuccess", at: "caster", pulse: "guard" }),
      expect.objectContaining({ kind: "bodyMove", on: "reflectSuccess", at: "target" }),
    ]));
  });
});
