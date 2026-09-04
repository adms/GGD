import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zVfxScriptDoc, type VfxScriptSegment } from "@ggd/shared/content/schema/vfxScript";
import {
  actionAnimationIssues,
  activationConflictForAbility,
  completeActionAnimations,
  hasAutoCompletableActionIssue,
  hasAuthoritativeRapidMultiStrike,
  activationModeForAbility,
} from "./actionAnimationPrinciples";
import { completePresentationReplacements } from "./presentationContract";

function doc(segments: VfxScriptSegment[]) {
  return zVfxScriptDoc.parse({
    id: "ability.test",
    schema: "vfx-script@1",
    abilityId: "ability.test",
    segments: completePresentationReplacements(segments),
  });
}

function legacyDoc(segments: VfxScriptSegment[]) {
  return zVfxScriptDoc.parse({ id: "ability.test", schema: "vfx-script@1", abilityId: "ability.test", segments });
}

describe("VFX Forge action-animation principles", () => {
  it("auto-stamps actor channel takeovers and reports legacy unstamped actions", () => {
    const legacy = legacyDoc([
      { kind: "anim", on: "castStart", at: "caster", pulse: "cast" },
      { kind: "anim", on: "projectileHit", at: "target", pulse: "hurt" },
    ]);
    expect(actionAnimationIssues(legacy).map((issue) => issue.code))
      .toContain("ACTION_REPLACEMENT_MISSING");

    const completed = completeActionAnimations([
      { kind: "vfx", on: "projectileHit", at: "target", vfxId: "fx.prim.fire.arc" },
    ]);
    expect(completed).toContainEqual(expect.objectContaining({
      kind: "anim", on: "castStart", at: "caster", replaces: "caster.action",
    }));
    expect(completed).toContainEqual(expect.objectContaining({
      kind: "anim", on: "projectileHit", at: "target", replaces: "target.reaction",
    }));
    expect(actionAnimationIssues(doc(completed))).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "ACTION_REPLACEMENT_MISSING" }),
    ]));
  });

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

  it("does not mistake a later strike or target reaction for the active cast action", () => {
    const strikeOnly = doc([
      { kind: "anim", on: "strike", at: "caster", pulse: "attack" },
      { kind: "anim", on: "strike", at: "target", pulse: "hurt" },
    ]);
    expect(actionAnimationIssues(strikeOnly).map((issue) => issue.code))
      .toContain("CAST_ACTION_MISSING");

    const completed = completeActionAnimations(strikeOnly.segments);
    expect(completed).toContainEqual(expect.objectContaining({
      kind: "anim",
      on: "castStart",
      at: "caster",
      pulse: "cast",
    }));
    expect(actionAnimationIssues(doc(completed))).toEqual([]);
  });

  it("gives an active reflect scene a real cast before its later reaction", () => {
    const completed = completeActionAnimations([
      { kind: "anim", on: "reflectSuccess", at: "caster", pulse: "cast" },
    ]);
    expect(completed[0]).toEqual(expect.objectContaining({
      kind: "anim",
      on: "castStart",
      at: "caster",
      pulse: "cast",
    }));
    expect(actionAnimationIssues(doc(completed))).toEqual([]);
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

  it("accepts one receipted single-arc and still enforces its actor action", () => {
    const candidate = doc([
      { kind: "anim", on: "castStart", at: "caster", pulse: "cast" },
      { kind: "anim", on: "strike", at: "caster", pulse: "attack", clipWindowMs: 500 },
      { kind: "anim", on: "strike", at: "target", pulse: "hurt", clipWindowMs: 500 },
      { kind: "vfx", on: "strike", vfxId: "fx.prim.holy.arc", at: "target", durationSec: 0.2 },
    ]);
    expect(actionAnimationIssues(candidate)).toEqual([]);
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
    expect(segments).toContainEqual(expect.objectContaining({
      kind: "anim", on: "reflectSuccess", at: "caster", pulse: "guard",
    }));
    expect(segments.some((segment) => segment.on === "castStart" || segment.on === "castEffect")).toBe(false);
    expect(actionAnimationIssues(doc(segments), { activationMode: "passive" })).toEqual([]);
    expect(activationModeForAbility({ slot: "PASSIVE" })).toBe("passive");
    expect(activationModeForAbility({ slot: "PASSIVE", innateKind: "active" })).toBe("active");
    // Main's schema forbids innateKind outside PASSIVE. Even malformed input
    // must not let that stray field hide an otherwise castable learned skill.
    expect(activationModeForAbility({ slot: "Q", innateKind: "passive", effects: [{}] })).toBe("active");
    expect(activationModeForAbility({ slot: "EX", passive: { ranks: [{}] }, effects: [] })).toBe("passive");
    expect(activationModeForAbility({ slot: "EX", passive: { ranks: [{}] }, effects: [{ kind: "applyBuff" }] })).toBe("active");
    expect(activationModeForAbility({ slot: "Q" })).toBe("active");
  });

  it("mirrors Main's castability predicates for every shipped ability", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../../../content/abilities");
    const abilities = readdirSync(root)
      .filter((file) => file.endsWith(".json") && !file.startsWith("_"))
      .map((file) => JSON.parse(readFileSync(join(root, file), "utf8")) as Record<string, unknown>);
    expect(abilities).toHaveLength(421);
    expect(abilities.filter((ability) => ability.slot === "PASSIVE" && ability.innateKind === "active")).toHaveLength(34);
    for (const ability of abilities) {
      // Mirrors innateCastBlock() followed by isPassiveOnly() in Main's
      // abilitySystem cast ladder. This is deliberately structural: prose and
      // skill names are never allowed to change runtime castability.
      const expected = ability.slot === "PASSIVE"
        ? ability.innateKind === "active" ? "active" : "passive"
        : typeof ability.passive === "object" && ability.passive !== null &&
            Array.isArray(ability.effects) && ability.effects.length === 0
          ? "passive"
          : "active";
      expect(activationModeForAbility(ability), String(ability.id)).toBe(expected);
    }
  });

  it("fails closed on explicit description/runtime activation conflicts without guessing legacy tags", () => {
    expect(activationConflictForAbility({
      slot: "EX",
      effects: [{ kind: "applyBuff" }],
      description: "**[被動][普攻時]**\n\n強化普通攻擊。",
    })).toEqual(expect.objectContaining({
      code: "ABILITY_ACTIVATION_CONFLICT",
      descriptionMode: "passive",
      runtimeMode: "active",
    }));
    expect(activationConflictForAbility({
      slot: "PASSIVE",
      innateKind: "active",
      effects: [{ kind: "spawnVfx" }],
      description: "[主動][範圍]\n\n施放特效。",
    })).toBeNull();
    expect(activationConflictForAbility({
      slot: "EX",
      effects: [{ kind: "applyBuff" }],
      passive: { ranks: [{}] },
      description: "[主動][被動][變身]\n\n主被動混合。",
    })).toBeNull();
    expect(activationConflictForAbility({
      slot: "Q",
      effects: [{ kind: "damage" }],
      description: "[主動攻擊]\n\n舊格式沒有精確[主動]標籤。",
    })).toBeNull();
  });

  it("surfaces every shipped explicit activation conflict instead of silently changing prose", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../../../content/abilities");
    const conflicts = readdirSync(root)
      .filter((file) => file.endsWith(".json") && !file.startsWith("_"))
      .map((file) => JSON.parse(readFileSync(join(root, file), "utf8")) as Record<string, unknown>)
      .map((ability) => ({ id: String(ability.id), issue: activationConflictForAbility(ability) }))
      .filter((entry) => entry.issue !== null);
    expect(conflicts).toHaveLength(27);
    expect(conflicts.map((entry) => entry.id)).toContain("godie-o030.ex");
  });

  it("blocks cast triggers on a pure passive instead of manufacturing a cast", () => {
    const candidate = doc([
      { kind: "vfx", on: "castEffect", vfxId: "fx.prim.holy.pulse-sm", at: "self", durationSec: 0.2 },
    ]);
    const issues = actionAnimationIssues(candidate, { activationMode: "passive" });
    expect(issues.map((issue) => issue.code)).toContain("PASSIVE_CAST_TRIGGER");
    expect(hasAutoCompletableActionIssue(issues)).toBe(false);
  });

  it("offers safe auto-completion only for missing actor pulses", () => {
    expect(hasAutoCompletableActionIssue([{
      code: "CAST_ACTION_MISSING",
      message: "missing",
      segmentIndexes: [0],
    }])).toBe(true);
    expect(hasAutoCompletableActionIssue([{
      code: "SLASH_OVERDRAWN",
      message: "manual",
      segmentIndexes: [0, 1],
    }, {
      code: "MULTI_CRESCENT_BRICK",
      message: "main brick",
      segmentIndexes: [2],
    }])).toBe(false);
  });

  it("uses real SimWorld strike cues to catch an invisible combo beat", () => {
    const castOnly = doc([
      { kind: "anim", on: "castStart", at: "caster", pulse: "cast" },
      { kind: "floatingText", on: "castStart", text: "七連斬" },
    ]);
    const requiredTimelineCues = [
      { on: "strike" as const, strikeIndex: 1 },
      { on: "strike" as const, strikeIndex: 2 },
    ];
    const issues = actionAnimationIssues(castOnly, { requiredTimelineCues });
    expect(issues.map((issue) => issue.code)).toEqual([
      "TIMELINE_ACTION_MISSING",
      "TARGET_REACTION_MISSING",
      "TIMELINE_ACTION_MISSING",
      "TARGET_REACTION_MISSING",
    ]);

    const completed = completeActionAnimations(castOnly.segments, { requiredTimelineCues });
    expect(completed).toContainEqual(expect.objectContaining({
      kind: "anim", on: "strike", at: "caster", pulse: "attack",
    }));
    expect(completed).toContainEqual(expect.objectContaining({
      kind: "anim", on: "strike", at: "target", pulse: "hurt",
    }));
    // Generic strike pulses fire on both authoritative indexes without
    // manufacturing fourteen near-identical segments.
    expect(completed.filter((segment) => segment.kind === "anim" && segment.on === "strike")).toHaveLength(2);
    expect(actionAnimationIssues(doc(completed), { requiredTimelineCues })).toEqual([]);
  });

  it("requires a target reaction for a real projectileHit even without impact VFX", () => {
    const candidate = doc([
      { kind: "anim", on: "castStart", at: "caster", pulse: "cast" },
      { kind: "sound", on: "projectileSpawn", soundKey: "ability.launch" },
    ]);
    const cues = [{ on: "projectileHit" as const }];
    expect(actionAnimationIssues(candidate, { requiredTimelineCues: cues }).map((issue) => issue.code))
      .toEqual(["TARGET_REACTION_MISSING"]);
    const completed = completeActionAnimations(candidate.segments, { requiredTimelineCues: cues });
    expect(completed).toContainEqual(expect.objectContaining({
      kind: "anim", on: "projectileHit", at: "target", pulse: "hurt",
    }));
    expect(actionAnimationIssues(doc(completed), { requiredTimelineCues: cues })).toEqual([]);
  });
});
