import { describe, expect, it } from "vitest";
import { zVfxScriptSegment } from "@ggd/shared/content/schema/vfxScript";
import { CLASSIC_BEAM_MODEL_KEY, abilityUsesModel, buildVfxForgeRecipe } from "./recipes";

describe("VFX Forge editor-side recipes", () => {
  it.each(["classic-beam-fire", "classic-beam-blue"] as const)("%s expands into an MDL body plus bounded helpers", (id) => {
    const segments = buildVfxForgeRecipe(id);
    expect(segments.every((segment) => zVfxScriptSegment.safeParse(segment).success)).toBe(true);
    expect(segments.filter((segment) => segment.kind === "modelFx" && segment.modelKey === CLASSIC_BEAM_MODEL_KEY)).toHaveLength(1);
    const body = segments.find((segment) => segment.kind === "modelFx");
    expect(body).toMatchObject({
      path: "static", anchor: "self", scale: 4,
      scaleAxis: [0.9, 0.9, 4.4], offsetForwardU: 0.8,
    });
    const particles = segments.filter((segment) => segment.kind === "vfx");
    expect(particles).toHaveLength(4);
    expect(Math.max(...particles.map((segment) => segment.atMs ?? 0))).toBe(465);
  });

  it.each(["line-blast-fire", "dash-slash-void", "shockwave-dash-light", "combo-slash-holy", "reflect-counter-open", "avalon-counter-chain", "rider-dash-beam-blue"] as const)(
    "%s expands only into shipped script bricks",
    (id) => {
      const segments = buildVfxForgeRecipe(id);
      expect(segments.length).toBeGreaterThan(0);
      expect(segments.every((segment) => zVfxScriptSegment.safeParse(segment).success)).toBe(true);
    },
  );

  it("line blast travels as an MDL and explodes only after its measured flight time", () => {
    const segments = buildVfxForgeRecipe("line-blast-fire");
    expect(segments[0]).toMatchObject({
      kind: "modelFx", modelKey: "imported.fireblast", path: "forward", speed: 27.5, distance: 12,
    });
    const arrival = segments.filter((segment) => segment.kind === "vfx");
    expect(arrival.every((segment) => (segment.atMs ?? 0) >= 430)).toBe(true);
    expect(arrival).toContainEqual(expect.objectContaining({
      vfxId: "fx.prim.fire.explosion-lg",
      w3xScale: 2.2,
      offsetForwardU: 12.8,
    }));
  });

  it("void dash moves the real caster and never spawns the unsafe Lina model clone", () => {
    const segments = buildVfxForgeRecipe("dash-slash-void");
    expect(segments.some((segment) => segment.kind === "modelFx" || segment.kind === "hideBody")).toBe(false);
    expect(segments).toContainEqual(expect.objectContaining({
      kind: "bodyMove", at: "caster", mode: "arc",
      offset: { x: 0.35, y: 0.2, z: 4.5 }, durationMs: 560,
    }));
    expect(segments).toContainEqual(expect.objectContaining({
      kind: "anim", at: "caster", pulse: "attack",
    }));
  });

  it("reflect opening is impossible to trigger from cast or block", () => {
    expect(buildVfxForgeRecipe("reflect-counter-open")).toEqual([
      expect.objectContaining({
        kind: "vfx",
        on: "reflectSuccess",
        vfxId: "fx.prim.holy.pulse-sm",
      }),
    ]);
    expect(buildVfxForgeRecipe("reflect-counter-open").some(
      (segment) => segment.kind === "vfx" && segment.vfxId === "fx.avalon.reflect-spark",
    )).toBe(false);
  });

  it("shockwave dash keeps both stages in one reusable recipe without moving authority", () => {
    const segments = buildVfxForgeRecipe("shockwave-dash-light");
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

  it("omits the body when ability JSON already owns the same model brick", () => {
    const ability = { effects: [{ kind: "spawnModelFx", modelKey: CLASSIC_BEAM_MODEL_KEY }] };
    expect(abilityUsesModel(ability, CLASSIC_BEAM_MODEL_KEY)).toBe(true);
    expect(buildVfxForgeRecipe("classic-beam-fire", { includeModelCore: false }).some((segment) => segment.kind === "modelFx")).toBe(false);
  });

  it("exposes the two multi-stage acceptance scenes as true from-blank composite cards", () => {
    const avalon = buildVfxForgeRecipe("avalon-counter-chain");
    expect(avalon.some((segment) => segment.on === "reflectSuccess")).toBe(true);
    expect(avalon.filter((segment) => segment.kind === "bodyMove" && segment.on === "strike")).toHaveLength(6);
    expect(avalon.filter((segment) => segment.on === "strike" && segment.strikeIndex === 7).length).toBeGreaterThanOrEqual(2);

    const rider = buildVfxForgeRecipe("rider-dash-beam-blue");
    expect(rider).toContainEqual(expect.objectContaining({ kind: "bodyMove", at: "caster", mode: "arc" }));
    expect(rider.filter((segment) => segment.kind === "vfx")).toHaveLength(4);
  });
});
