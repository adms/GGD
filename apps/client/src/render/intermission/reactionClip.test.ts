/**
 * reactionClip — the purchase-reaction preference order, unit-tested against the
 * REAL clip inventories the roster ships (measured from the .glbs):
 *
 *   • KayKit stand-ins: 76 clips incl. "Cheer" → victory (the user's 1st choice)
 *   • heropikachu / herosasuke / heroryuk: no cheer, an "Attack …" → attack
 *   • an import with only an idle (task #69): nothing legible → null (caller pops)
 *
 * The whole point is that ONE rule serves both the KayKit and the imported
 * families without consulting the model's six-key clipMap (which has no
 * "victory" key), so these fixtures are the two families side by side.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { pickReactionClip } from "./reactionClip";

// verbatim from the shipped .glbs (see the audit in the task notes)
const KAYKIT = ["Idle", "1H_Melee_Attack_Chop", "Cheer", "Death_A", "Hit_A", "Block", "Dodge_Forward"];
const PIKACHU = ["Stand - 1", "Walk", "Attack - 1", "Spell Throw", "Attack - 2", "Death", "Dissipate"];
const SASUKE = ["Portrait", "Walk", "Stand", "Stand Ready", "Death", "Attack", "Spell Throw", "Spell"];

describe("reactionClip (purchase reaction)", () => {
  it("prefers a VICTORY clip when the rig has one (KayKit 'Cheer' beats its attacks)", () => {
    cover("intermission-champion-reaction-pick");
    const pick = pickReactionClip(KAYKIT);
    expect(pick).toEqual({ clip: "Cheer", kind: "victory" });
  });

  it("falls back to an ATTACK when there is no victory clip (皮卡丘 → 'Attack - 1')", () => {
    cover("intermission-champion-reaction-pick");
    const pick = pickReactionClip(PIKACHU);
    expect(pick?.kind).toBe("attack");
    expect(pick?.clip).toBe("Attack - 1");
  });

  it("resolves an attack for other imports too (佐助 → 'Attack')", () => {
    cover("intermission-champion-reaction-pick");
    expect(pickReactionClip(SASUKE)).toEqual({ clip: "Attack", kind: "attack" });
  });

  it("prefers a spell/cast only after victory and attack are both absent", () => {
    cover("intermission-champion-reaction-pick");
    expect(pickReactionClip(["Stand", "Walk", "Spell", "Death"])).toEqual({ clip: "Spell", kind: "cast" });
  });

  it("NEVER picks an idle/walk/death/hurt pose as a celebration", () => {
    cover("intermission-champion-reaction-pick");
    // an import that ships only resting + death states → nothing legible
    expect(pickReactionClip(["Stand - 1", "Walk", "Death", "Dissipate"])).toBeNull();
    // a hit/lie/block reaction must never read as a win even if a tier could match
    expect(pickReactionClip(["Idle", "Hit_A", "Lie_Idle", "Block_Attack"])).toBeNull();
  });

  it("returns null for an empty inventory (caller degrades to a procedural pop)", () => {
    cover("intermission-champion-reaction-pick");
    expect(pickReactionClip([])).toBeNull();
    expect(pickReactionClip(["Stand"])).toBeNull();
  });
});
