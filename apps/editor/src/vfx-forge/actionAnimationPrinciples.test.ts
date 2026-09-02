import { describe, expect, it } from "vitest";
import { zVfxScriptDoc, type VfxScriptSegment } from "@ggd/shared/content/schema/vfxScript";
import {
  actionAnimationIssues,
  completeActionAnimations,
  hasAuthoritativeRapidMultiStrike,
  activationModeForAbility,
} from "./actionAnimationPrinciples";

function doc(segments: VfxScriptSegment[]) {
  return zVfxScriptDoc.parse({ id: "ability.test", schema: "vfx-script@1", abilityId: "ability.test", segments });
}

describe("VFX Forge action-animation principles", () => {
  it("adds cast actions to an otherwise effect-only active recipe", () => {
    const segments = completeActionAnimations([
      { kind: "vfx", on: "castEffect", vfxId: "fx.prim.fire.bolt", at: "self", durationSec: 0.4 },
    ]);
    expect(segments).toContainEqual(expect.objectContaining({ kind: "anim", on: "castStart", at: "caster", pulse: "cast" }));
    expect(segments).toContainEqual(expect.objectContaining({ kind: "anim", on: "castEffect", at: "caster", pulse: "attack" }));
    expect(actionAnimationIssues(doc(segments))).toEqual([]);
  });

  it("adds an action even when the visible effect fires only on castStart", () => {
    const segments = completeActionAnimations([
      { kind: "vfx", on: "castStart", vfxId: "fx.prim.fire.bolt", at: "self", durationSec: 0.4 },
    ]);
    expect(segments).toContainEqual(expect.objectContaining({ kind: "anim", on: "castStart", at: "caster" }));
    expect(actionAnimationIssues(doc(segments))).toEqual([]);
  });

  it("rejects a fan of two crescents in one ordinary strike window", () => {
    const issues = actionAnimationIssues(doc([
      { kind: "anim", on: "strike", at: "caster", pulse: "attack", clipWindowMs: 500 },
      { kind: "vfx", on: "strike", vfxId: "fx.prim.holy.slash", at: "target", durationSec: 0.3, w3xScale: 1.6 },
      { kind: "vfx", on: "strike", atMs: 35, vfxId: "fx.prim.void.slash", at: "target", durationSec: 0.3, w3xScale: 1.4 },
    ]));
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["SLASH_OVERDRAWN", "MULTI_CRESCENT_BRICK"]));
  });

  it("allows three small arcs only when authoritative comboStrikes proves a rapid barrage", () => {
    const candidate = doc([
      { kind: "anim", on: "castEffect", at: "caster", pulse: "attack", clipWindowMs: 700 },
      ...[100, 180, 260].map((atMs) => ({
        kind: "vfx" as const,
        on: "castEffect" as const,
        atMs,
        vfxId: "fx.owner.slash-single",
        at: "target" as const,
        durationSec: 0.2,
        w3xScale: 0.9,
      })),
    ]);
    expect(actionAnimationIssues(candidate).map((issue) => issue.code)).toContain("SLASH_OVERDRAWN");
    expect(actionAnimationIssues(candidate, { allowRapidBarrage: true })).toEqual([]);
    expect(hasAuthoritativeRapidMultiStrike({ effects: [{ kind: "damage" }] })).toBe(false);
    expect(hasAuthoritativeRapidMultiStrike({ effects: [{ kind: "comboStrikes" }] })).toBe(true);
  });

  it("rejects one existing slash primitive because that brick itself emits 26 crescents", () => {
    const issues = actionAnimationIssues(doc([
      { kind: "anim", on: "strike", at: "caster", pulse: "attack", clipWindowMs: 500 },
      { kind: "vfx", on: "strike", vfxId: "fx.prim.holy.slash-lg", at: "target", durationSec: 0.2, w3xScale: 2.4 },
    ]));
    expect(issues.map((issue) => issue.code)).toContain("MULTI_CRESCENT_BRICK");
  });

  it("requires an action window at every strike or movement beat", () => {
    const issues = actionAnimationIssues(doc([
      { kind: "anim", on: "castStart", at: "caster", pulse: "cast" },
      { kind: "bodyMove", on: "strike", strikeIndex: 2, at: "caster", mode: "teleport", offset: { x: 1, y: 0, z: 1 }, durationMs: 220 },
    ]));
    expect(issues.map((issue) => issue.code)).toContain("TIMELINE_ACTION_MISSING");
  });

  it("requires both attacker action and victim reaction for every authoritative strike", () => {
    const candidate = doc([
      { kind: "anim", on: "strike", strikeIndex: 2, at: "caster", pulse: "attack", clipWindowMs: 500 },
      { kind: "vfx", on: "strike", strikeIndex: 2, vfxId: "fx.owner.hit", at: "target", durationSec: 0.2 },
    ]);
    expect(actionAnimationIssues(candidate).map((issue) => issue.code))
      .toContain("TARGET_REACTION_MISSING");

    const completed = completeActionAnimations(candidate.segments);
    expect(completed).toContainEqual(expect.objectContaining({
      kind: "anim",
      on: "strike",
      strikeIndex: 2,
      at: "target",
      pulse: "hurt",
    }));
    expect(actionAnimationIssues(doc(completed))).toEqual([]);
  });

  it("auto-completes separated timeline beats with separate actor actions", () => {
    const segments = completeActionAnimations([
      { kind: "vfx", on: "castEffect", vfxId: "fx.prim.fire.bolt", at: "self", durationSec: 0.3 },
      { kind: "vfx", on: "castEffect", atMs: 1400, vfxId: "fx.prim.fire.explosion-lg", at: "target", durationSec: 0.3 },
      { kind: "vfx", on: "projectileHit", vfxId: "fx.prim.fire.pulse-lg", at: "target", durationSec: 0.3 },
    ]);
    expect(segments).toContainEqual(expect.objectContaining({ kind: "anim", on: "castEffect", atMs: 1400, at: "caster" }));
    expect(segments).toContainEqual(expect.objectContaining({ kind: "anim", on: "projectileHit", at: "target", pulse: "hurt" }));
    expect(actionAnimationIssues(doc(segments))).toEqual([]);
  });

  it("passive effects animate the real reaction event and never receive a fake cast action", () => {
    const segments = completeActionAnimations([
      { kind: "vfx", on: "reflectSuccess", vfxId: "fx.prim.holy.pulse-sm", at: "self", durationSec: 0.2 },
    ], { activationMode: "passive" });
    expect(segments).toContainEqual(expect.objectContaining({ kind: "anim", on: "reflectSuccess", at: "caster" }));
    expect(segments.some((segment) => segment.on === "castStart" || segment.on === "castEffect")).toBe(false);
    expect(actionAnimationIssues(doc(segments), { activationMode: "passive" })).toEqual([]);
    expect(activationModeForAbility({ slot: "PASSIVE" })).toBe("passive");
    expect(activationModeForAbility({ slot: "EX", passive: { ranks: [{}] }, effects: [] })).toBe("passive");
    expect(activationModeForAbility({ slot: "EX", passive: { ranks: [{}] }, effects: [{ kind: "applyBuff" }] })).toBe("active");
    expect(activationModeForAbility({ slot: "Q" })).toBe("active");
  });

  it("blocks cast triggers on a pure passive instead of manufacturing a cast", () => {
    const candidate = doc([
      { kind: "vfx", on: "castEffect", vfxId: "fx.prim.holy.pulse-sm", at: "self", durationSec: 0.2 },
    ]);
    expect(actionAnimationIssues(candidate, { activationMode: "passive" }).map((issue) => issue.code))
      .toContain("PASSIVE_CAST_TRIGGER");
  });
});
