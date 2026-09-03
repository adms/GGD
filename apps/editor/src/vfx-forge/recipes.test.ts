import { describe, expect, it } from "vitest";
import { zVfxScriptSegment } from "@ggd/shared/content/schema/vfxScript";
import { CLASSIC_BEAM_MODEL_KEY, abilityUsesModel, buildVfxForgeRecipe } from "./recipes";

const activeRecipe = (id: Parameters<typeof buildVfxForgeRecipe>[0], options: Omit<Parameters<typeof buildVfxForgeRecipe>[1], "activationMode"> = {}) =>
  buildVfxForgeRecipe(id, { ...options, activationMode: "active" });

describe("VFX Forge editor-side recipes", () => {
  it.each(["classic-beam-fire", "classic-beam-blue"] as const)("%s defaults to transparent-safe bounded helpers without the white-card MDL", (id) => {
    const segments = activeRecipe(id);
    expect(segments.every((segment) => zVfxScriptSegment.safeParse(segment).success)).toBe(true);
    expect(segments.filter((segment) => segment.kind === "modelFx" && segment.modelKey === CLASSIC_BEAM_MODEL_KEY)).toHaveLength(0);
    const particles = segments.filter((segment) => segment.kind === "vfx");
    expect(particles).toHaveLength(6);
    expect(Math.max(...particles.map((segment) => segment.atMs ?? 0))).toBe(650);
    expect(Math.max(...particles.map((segment) => segment.w3xScale ?? 0))).toBeLessThanOrEqual(3.2);
    expect(Math.max(...particles.map((segment) => segment.alpha ?? 0))).toBeLessThanOrEqual(0.72);
    expect(particles.filter((segment) => segment.vfxId.includes("beam")).every((segment) => segment.timeScale === 1)).toBe(true);
  });

  it.each([
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
    expect(rider.filter((segment) => segment.kind === "vfx")).toHaveLength(6);
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
