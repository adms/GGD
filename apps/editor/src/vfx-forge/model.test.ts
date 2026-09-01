import { describe, expect, it, vi } from "vitest";
import {
  VFX_FORGE_SEGMENT_KINDS,
  newSegment,
  reactionTriggerOf,
  scheduleSimEvents,
  segmentFromAsset,
  timelineDurationMs,
  triggerCuesFromSim,
} from "./model";
import { writeVfxScript } from "./writeback";

describe("VFX Forge authoring core", () => {
  it("takes cast, strike and projectile timing only from the real SimWorld event trace", () => {
    const ability = {
      id: "godie-hart.r",
      effects: [{ kind: "spawnProjectile", projectileId: "projectile.a", onHit: [] }],
    };
    const schedule = scheduleSimEvents([
      { type: "abilityCast", tick: 100, data: { abilityId: ability.id, caster: 1 } },
      { type: "castBegin", tick: 100, data: { abilityId: ability.id, caster: 1 } },
      { type: "projectileSpawn", tick: 102, data: { projectileId: "projectile.a", owner: 1 } },
      { type: "castEnd", tick: 103, data: { abilityId: ability.id, caster: 1 } },
      {
        type: "comboStrike",
        tick: 110,
        data: { origin: `ability:${ability.id}`, index: 1, caster: 1 },
        actorPose: { caster: { x: 1.2, z: 2.4 }, target: { x: 0, z: 3 } },
      },
      { type: "projectileHit", tick: 112, data: { projectileId: "projectile.a", owner: 1 } },
    ], ability.id);
    const cues = triggerCuesFromSim(schedule, ability);
    expect(cues.map((cue) => cue.on)).toEqual([
      "castStart", "projectileSpawn", "castEffect", "strike", "projectileHit",
    ]);
    expect(cues.filter((c) => c.on === "strike").map((c) => [c.strikeIndex, Math.round(c.atMs)])).toEqual([
      [1, 333],
    ]);
    expect(schedule.find(({ event }) => event.type === "comboStrike")?.actorPose?.caster).toEqual({
      x: 1.2,
      z: 2.4,
    });
  });

  it("takes passive reflect and strike timing from a real reaction trace without inventing a cast", () => {
    const ability = {
      id: "godie-e002.ex",
      passive: { ranks: [{ hooks: [{ on: "onReflectSuccess", effects: [] }] }] },
    };
    const schedule = scheduleSimEvents([
      { type: "abilityCast", tick: 100, data: { abilityId: "godie-e002.r", caster: 1 } },
      { type: "reflectSuccess", tick: 130, data: { origin: "ability:godie-e002.ex", reflector: 1 } },
      { type: "comboStrike", tick: 134, data: { origin: "ability:godie-e002.ex", index: 1 } },
    ], ability.id);
    const cues = triggerCuesFromSim(schedule, ability);
    expect(reactionTriggerOf(ability)).toBe("reflectSuccess");
    expect(
      schedule.some(({ event }) => event.type === "abilityCast"),
      "反彈前的啟用技不可以被壓到被動時間軸第 0 幀",
    ).toBe(false);
    expect(cues.map((cue) => [cue.on, Math.round(cue.atMs), cue.strikeIndex])).toEqual([
      ["reflectSuccess", 0, undefined],
      ["strike", 133, 1],
    ]);
  });

  it("turns model and particle drops into schema-valid visual-only segments", () => {
    expect(segmentFromAsset({ collection: "models", id: "w3x.stock.flamestrike1" })).toMatchObject({
      kind: "modelFx",
      modelKey: "w3x.stock.flamestrike1",
    });
    expect(segmentFromAsset({ collection: "vfx", id: "fx.fire" })).toMatchObject({ kind: "vfx", vfxId: "fx.fire" });
    expect(
      segmentFromAsset(
        { collection: "models", id: "model.a" },
        { forwardU: 3.2, sideU: -1.4 },
      ),
    ).toMatchObject({
      on: "castStart",
      anchor: "self",
      offsetForwardU: 3.2,
      offsetSideU: -1.4,
    });
    expect(new Set(VFX_FORGE_SEGMENT_KINDS).size).toBe(VFX_FORGE_SEGMENT_KINDS.length);
    for (const kind of VFX_FORGE_SEGMENT_KINDS) {
      expect(newSegment(kind).kind).toBe(kind);
    }
  });

  it("keeps the timeline alive through the last segment tail", () => {
    const script = {
      id: "x", schema: "vfx-script@1" as const, abilityId: "x",
      segments: [{ kind: "screenFlash" as const, on: "castEffect" as const, colorRgb: [255, 255, 255] as [number, number, number], peakAlpha: 0.5, durationSec: 4 }],
    };
    expect(timelineDurationMs(script, [{ on: "castEffect", atMs: 2000, label: "結算" }])).toBeGreaterThanOrEqual(6250);
  });

  it("has one write destination and validates before calling it", async () => {
    const put = vi.fn(async () => ({ id: "x", hash: "h", collectionHash: "c", contentVersion: "v" }));
    const create = vi.fn(async () => ({ id: "x", hash: "h2", collectionHash: "c", contentVersion: "v" }));
    const assetGuard = { assertScriptSafe: vi.fn(async () => undefined) };
    await writeVfxScript(
      {
        id: "x",
        schema: "vfx-script@1",
        abilityId: "x",
        segments: [{ kind: "floatingText", on: "castStart", text: "x" }],
      },
      assetGuard,
      { put, create },
    );
    expect(put).toHaveBeenCalledWith("vfx-scripts", "x", expect.objectContaining({ abilityId: "x" }));
    await expect(writeVfxScript({ id: "bad" }, assetGuard, { put })).rejects.toThrow();
    expect(put).toHaveBeenCalledTimes(1);
    await writeVfxScript(
      { id: "x", schema: "vfx-script@1", abilityId: "x", segments: [{ kind: "floatingText", on: "castStart", text: "x" }] },
      assetGuard,
      { put, create },
      "create",
    );
    expect(create).toHaveBeenCalledWith("vfx-scripts", "x", expect.anything());
    expect(assetGuard.assertScriptSafe).toHaveBeenCalledTimes(2);
  });
});
