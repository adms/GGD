import { describe, expect, it, vi } from "vitest";
import {
  VFX_FORGE_SEGMENT_KINDS,
  newScript,
  newSegment,
  recommendedEvidenceTimes,
  recommendedRuntimeEvidenceTimes,
  ensureTemporalEvidencePair,
  scriptVisualFocus,
  retypeSegment,
  reactionTriggerOf,
  scheduleSimEvents,
  segmentFromAsset,
  timelineDurationMs,
  triggerCuesFromSim,
} from "./model";
import { submitVfxScriptProposal } from "./writeback";

describe("VFX Forge authoring core", () => {
  it("centres long authored projectiles without moving an ordinary duel", () => {
    const pose = { caster: { x: 0, z: 0 }, target: { x: 0, z: 3 } };
    const long = {
      id: "editor-fixture.long",
      schema: "vfx-script@1" as const,
      abilityId: "hero.q",
      segments: [{ kind: "vfx" as const, on: "castEffect" as const, vfxId: "fx.test", at: "self" as const, offsetForwardU: 12.8 }],
    };
    expect(scriptVisualFocus(long, pose)).toEqual({ x: 0, z: 6.4 });
    expect(scriptVisualFocus({ ...long, segments: [{ ...long.segments[0]!, offsetForwardU: 1 }] }, pose)).toBeNull();
  });

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

  it("seeds passive reaction authoring on the real event instead of castStart/castEffect", () => {
    expect(newScript("godie-e002.ex", "reflectSuccess").segments[0]?.on).toBe("reflectSuccess");
    expect(newSegment("vfx", "reflectSuccess").on).toBe("reflectSuccess");
    expect(segmentFromAsset(
      { collection: "vfx", id: "fx.guard" },
      undefined,
      "reflectSuccess",
    ).on).toBe("reflectSuccess");
  });

  it("changes representation without changing the authored trigger address", () => {
    expect(retypeSegment({
      kind: "bodyMove",
      on: "strike",
      strikeIndex: 4,
      atMs: 375,
      at: "caster",
      mode: "teleport",
      offset: { x: 1, y: 0, z: -1 },
      durationMs: 260,
    }, "vfx")).toMatchObject({
      kind: "vfx",
      on: "strike",
      strikeIndex: 4,
      atMs: 375,
    });
    expect(retypeSegment({
      kind: "vfx",
      on: "reflectSuccess",
      vfxId: "fx.guard",
      at: "self",
      durationSec: 0.25,
    }, "modelFx")).toMatchObject({
      kind: "modelFx",
      on: "reflectSuccess",
    });
  });

  it("keeps the timeline alive through the last segment tail", () => {
    const script = {
      id: "x", schema: "vfx-script@1" as const, abilityId: "x",
      segments: [{ kind: "screenFlash" as const, on: "castEffect" as const, colorRgb: [255, 255, 255] as [number, number, number], peakAlpha: 0.5, durationSec: 4 }],
    };
    expect(timelineDurationMs(script, [{ on: "castEffect", atMs: 2000, label: "結算" }])).toBeGreaterThanOrEqual(6250);
  });

  it("recommends absolute drawable frames after Sim trigger offsets", () => {
    const script = {
      id: "x",
      schema: "vfx-script@1" as const,
      abilityId: "x",
      segments: [
        { kind: "anim" as const, on: "castEffect" as const, at: "caster" as const, pulse: "attack" as const, clipWindowMs: 560 },
        { kind: "vfx" as const, on: "castEffect" as const, atMs: 350, vfxId: "fx.slash", at: "target" as const, durationSec: 0.4 },
        { kind: "vfx" as const, on: "castEffect" as const, atMs: 385, vfxId: "fx.core", at: "target" as const, durationSec: 0.3 },
      ],
    };
    const times = recommendedEvidenceTimes(script, [{ on: "castEffect", atMs: 1000, label: "吟唱完成" }]);
    expect(times[0]!.atMs).toBeGreaterThanOrEqual(1040);
    expect(times.at(-1)!.atMs).toBeGreaterThanOrEqual(1390);
    expect(times.at(-1)!.label).toContain("vfx");
  });

  it("samples runtime presentation after spawn and covers two distinct beats", () => {
    const times = recommendedRuntimeEvidenceTimes([
      { atMs: 0, event: { type: "abilityCast", data: { abilityId: "x" } } as never },
      { atMs: 0, event: { type: "vfxSpawn", data: { vfxId: "fx.open" } } as never },
      { atMs: 700, event: { type: "damage", data: { amount: 100 } } as never },
      { atMs: 700, event: { type: "vfxSpawn", data: { vfxId: "fx.hit" } } as never },
    ], 2);
    expect(times).toHaveLength(2);
    expect(times.map((time) => time.atMs)).toEqual([180, 880]);
  });

  it("one-beat runtime proof uses two distinct times instead of two cameras at one instant", () => {
    const paired = ensureTemporalEvidencePair([{ atMs: 180, label: "真 runtime · abilityCast" }]);
    expect(paired).toEqual([
      { atMs: 180, label: "真 runtime · abilityCast" },
      { atMs: 120, label: "真 runtime · abilityCast · 近景" },
    ]);
    expect(new Set(paired.map((time) => time.atMs)).size).toBe(2);
    expect(ensureTemporalEvidencePair(paired)).toEqual(paired);
  });

  it("keeps both summon lifecycle edges in runtime visual evidence", () => {
    const times = recommendedRuntimeEvidenceTimes([
      { atMs: 0, event: { type: "abilityCast", data: { abilityId: "summon.r" } } as never },
      { atMs: 667, event: { type: "summonSpawn", data: { id: 3 } } as never },
      { atMs: 667, event: { type: "damage", data: { amount: 100 } } as never },
      { atMs: 4_000, event: { type: "basicAttack", data: { source: 3 } } as never },
      { atMs: 8_667, event: { type: "summonDespawn", data: { id: 3, reason: "expired" } } as never },
    ], 8);
    expect(times.map((time) => time.atMs)).toEqual([180, 847, 4180, 8847]);
    expect(times[1]!.label).toContain("summonSpawn");
    expect(times.at(-1)!.label).toContain("summonDespawn");
  });

  it("has one non-live proposal destination and validates before calling it", async () => {
    const submitAiProposal = vi.fn(async (input: { purpose: "production-candidate" | "editor-capability-fixture" }) => ({
      proposal: {
        key: "vfx-scripts:x",
        candidateHash: "candidate-hash",
        reviewHash: "review-hash",
        purpose: input.purpose,
        promotable: input.purpose === "production-candidate",
      },
      status: input.purpose === "production-candidate" ? "pending-review" as const : "fixture-pending" as const,
    }));
    const assetGuard = { assertScriptSafe: vi.fn(async () => undefined) };
    const frameAudit = {
      litShare: 0.1,
      highlightShare: 0.02,
      brightShare: 0.01,
      nearWhiteShare: 0,
      dominantBrightShare: 0,
      dominantNonBackgroundShare: 0,
      localWhiteCardShare: 0,
      diagnosticCheckerShare: 0,
      unsafe: false,
    };
    await submitVfxScriptProposal(
      {
        id: "x",
        schema: "vfx-script@1",
        abilityId: "x",
        segments: [{ kind: "floatingText", on: "castStart", text: "x" }],
      },
      assetGuard,
      "production-candidate",
      { submitAiProposal },
      {
        evidence: ["editor-from-blank:x", "editor-action:1:新增時間軸積木：floatingText"],
        visualEvidence: [{ label: "impact", dataUrl: "data:image/webp;base64,AA==", atMs: 900, view: "side", frameAudit }],
      },
    );
    expect(submitAiProposal).toHaveBeenCalledWith(expect.objectContaining({
      target: { collection: "vfx-scripts", id: "x" },
      purpose: "production-candidate",
      candidate: expect.objectContaining({ abilityId: "x" }),
      evidence: ["editor-from-blank:x", "editor-action:1:新增時間軸積木：floatingText"],
      visualEvidence: [{ label: "impact", dataUrl: "data:image/webp;base64,AA==", atMs: 900, view: "side", frameAudit }],
    }));
    await expect(submitVfxScriptProposal(
      { id: "bad" }, assetGuard, "production-candidate", { submitAiProposal },
    )).rejects.toThrow();
    expect(submitAiProposal).toHaveBeenCalledTimes(1);
    await submitVfxScriptProposal(
      { id: "x", schema: "vfx-script@1", abilityId: "x", segments: [{ kind: "floatingText", on: "castStart", text: "x" }] },
      assetGuard,
      "editor-capability-fixture",
      { submitAiProposal },
    );
    expect(submitAiProposal).toHaveBeenLastCalledWith(expect.objectContaining({ purpose: "editor-capability-fixture" }));
    expect(assetGuard.assertScriptSafe).toHaveBeenCalledTimes(2);
  });
});
