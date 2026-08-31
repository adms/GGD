import { describe, expect, it, vi } from "vitest";
import { deriveTriggerCues, newSegment, segmentFromAsset, timelineDurationMs } from "./model";
import { writeVfxScript } from "./writeback";

describe("VFX Forge authoring core", () => {
  it("derives combo strike timing from ability + config, including the finisher", () => {
    const ability = {
      id: "godie-hart.r",
      effects: [{ kind: "comboStrikes", family: "superff7", perStrike: [], finisher: [{}] }],
    };
    const cues = deriveTriggerCues(ability, {
      families: [{ key: "superff7", steps: [0, 0.9, 1.1], finisherDelaySec: 1.8 }],
    });
    expect(cues.filter((c) => c.on === "strike").map((c) => [c.strikeIndex, Math.round(c.atMs)])).toEqual([
      [1, 0],
      [2, 900],
      [3, 1100],
      [4, 2900],
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
    for (const kind of ["floatingText", "screenFlash", "screenShake", "sound", "anim", "hideBody"] as const) {
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
    await writeVfxScript(
      {
        id: "x",
        schema: "vfx-script@1",
        abilityId: "x",
        segments: [{ kind: "floatingText", on: "castStart", text: "x" }],
      },
      { put, create },
    );
    expect(put).toHaveBeenCalledWith("vfx-scripts", "x", expect.objectContaining({ abilityId: "x" }));
    await expect(writeVfxScript({ id: "bad" }, { put })).rejects.toThrow();
    expect(put).toHaveBeenCalledTimes(1);
    await writeVfxScript(
      { id: "x", schema: "vfx-script@1", abilityId: "x", segments: [{ kind: "floatingText", on: "castStart", text: "x" }] },
      { put, create },
      "create",
    );
    expect(create).toHaveBeenCalledWith("vfx-scripts", "x", expect.anything());
  });
});
