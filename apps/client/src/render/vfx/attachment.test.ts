/**
 * WC3 attachment points → glb joints (task #98, the attachment half).
 *
 * The node names asserted here are NOT invented: they are the real names read
 * out of this repo's own `.glb` files (`Origin Ref` ×158, `Chest Ref` ×155,
 * `Hand Right Ref` ×148, `Bone_Chest` ×126, `Weapon Ref` ×112, `Head - Ref`
 * ×74, `hand.r` ×13, `bone right hand` ×6, `handright` ×6, plus billy.glb's
 * trailing-space `'Hand Right Ref '`). Six naming conventions, one rule.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  attachKey,
  attachmentChain,
  isInvisibleModelPath,
  normalizeAttachName,
  parseAttachField,
  parseAttachFields,
  parseLightningIds,
  resolveAttachment,
  splitModelList,
} from "./attachment";

/** azunyan.glb, verbatim (bones first, attachment points after — as exported). */
const AZUNYAN = [
  "Bone_Foot_R",
  "Bone_Foot_L",
  "Bone_Chest",
  "Bone_Hand_R",
  "Bone_Hand_L",
  "Bone_Head",
  "Foot Right Ref",
  "Foot Left Ref",
  "Chest Ref",
  "Hand Right Ref",
  "Hand Left Ref",
  "Head Ref",
  "Origin Ref",
  "Overhead Ref",
];
/** billy.glb, verbatim — note the trailing spaces and the `OverHead` casing. */
const BILLY = ["Bone_Chest", "Bone_Hand_R", "Hand Right Ref ", "Hand Left Ref ", "Chest Ref", "OverHead Ref ", "Origin Ref "];
/** barbarian.glb — a non-WC3 rig with no attachment points at all. */
const BARBARIAN = ["hand.l", "hand.r", "handslot.l", "handslot.r", "head", "chest", "foot.l", "foot.r", "IK-foot.l", "handIK.r"];

describe("M6: `right,hand` is ONE attachment, not two (w3x-attach-tokens)", () => {
  it("never splits a comma-token attachment into two attachments", () => {
    cover("w3x-attach-tokens");
    // the single most damaging naive step in the whole port
    expect(parseAttachField("right,hand")).toBe("hand right");
    expect(parseAttachField("hand,left")).toBe("hand left");
    expect(parseAttachField("weapon,left")).toBe("left weapon");
    expect(parseAttachField("chest,mount")).toBe("chest mount");
    expect(parseAttachField("sprite,first")).toBe("first sprite");
  });

  it("treats separate COLUMNS as separate attachments (A09O Mirror: both hands)", () => {
    cover("w3x-attach-tokens");
    expect(parseAttachFields(["left,hand", "right,hand"])).toEqual(["hand left", "hand right"]);
    expect(parseAttachFields(["chest", "", null, "chest"])).toEqual(["chest"]);
    expect(parseAttachFields([])).toEqual([]);
  });

  it("normalises all six naming conventions onto one key", () => {
    cover("w3x-attach-tokens");
    for (const name of ["Hand Right Ref", "Hand Right Ref ", "Bone_Hand_R", "hand.r", "bone right hand", "handright", "right,hand", "HandRight"]) {
      expect(attachKey(name)).toBe("hand right");
    }
    expect(normalizeAttachName("Head - Ref")).toEqual(["head"]);
    expect(normalizeAttachName("OverHead Ref ")).toEqual(["overhead"]);
    expect(normalizeAttachName("Bone_Foot_L01")).toEqual(["foot", "left"]);
  });

  it("does NOT collapse look-alike rig helpers onto a real attachment", () => {
    cover("w3x-attach-tokens");
    // `handslot.l` / `IK-foot.l` / `handIK.r` are control bones, not attachments
    expect(attachKey("handslot.l")).not.toBe("hand left");
    expect(attachKey("IK-foot.l")).not.toBe("foot left");
    expect(attachKey("handIK.r")).not.toBe("hand right");
    // and `overhead` must never split into over + head
    expect(attachKey("overhead")).toBe("overhead");
    expect(attachKey("overhead")).not.toBe(attachKey("head"));
  });
});

describe("resolving against a real model (w3x-attach-tokens)", () => {
  it("prefers the authored attachment point over the deforming bone", () => {
    cover("w3x-attach-tokens");
    // `Bone_Hand_R` is listed FIRST in the export; `Hand Right Ref` is the one
    // the artist positioned for a held object, so it must win anyway.
    const r = resolveAttachment("right,hand", AZUNYAN);
    expect(r.node).toBe("Hand Right Ref");
    expect(r.exact).toBe(true);
  });

  it("copes with trailing spaces and casing", () => {
    cover("w3x-attach-tokens");
    expect(resolveAttachment("right,hand", BILLY).node).toBe("Hand Right Ref ");
    expect(resolveAttachment("overhead", BILLY).node).toBe("OverHead Ref ");
    expect(resolveAttachment("origin", BILLY).node).toBe("Origin Ref ");
  });

  it("resolves on a non-WC3 rig that has no attachment points", () => {
    cover("w3x-attach-tokens");
    expect(resolveAttachment("right,hand", BARBARIAN).node).toBe("hand.r");
    expect(resolveAttachment("chest", BARBARIAN).node).toBe("chest");
  });

  it("reproduces WC3's SILENT fallback to origin for a nonsense attachment", () => {
    cover("w3x-attach-tokens");
    // A05B / A05C / A0EZ really carry `targetAttach = "cheat"` — a typo for
    // `chest`. WC3 renders them at the origin. Reproducing the typo's OUTCOME
    // is the faithful port; "fixing" it to chest is not.
    const r = resolveAttachment("cheat", AZUNYAN);
    expect(r.node).toBe("Origin Ref");
    expect(r.exact).toBe(false);
    expect(r.matched).toBe("origin");
  });

  it("walks the documented fallback chain when a specific point is missing", () => {
    cover("w3x-attach-tokens");
    // azunyan has no weapon point at all → weapon falls back to the right hand
    const w = resolveAttachment("weapon", AZUNYAN);
    expect(w.node).toBe("Hand Right Ref");
    expect(w.exact).toBe(false);
    expect(w.reason).toContain("falls back");
    // `weapon,left` prefers a plain Weapon Ref when one exists
    expect(resolveAttachment("weapon,left", ["Weapon Ref", "Origin Ref"]).node).toBe("Weapon Ref");
    // head → overhead → chest → origin
    expect(attachmentChain("head")).toEqual(["head", "overhead", "chest", "origin"]);
    expect(attachmentChain("")).toEqual(["origin"]);
  });

  it("returns null (parent to the model root) when even origin is absent", () => {
    cover("w3x-attach-tokens");
    const r = resolveAttachment("chest", ["Mesh_0", "Armature"]);
    expect(r.node).toBeNull();
    expect(r.reason).toContain("model root");
  });
});

describe("model-path idioms (w3x-attach-tokens)", () => {
  it("recognises a DELIBERATELY invisible model and never repairs it", () => {
    cover("w3x-attach-tokens");
    for (const p of ["none.mdl", "None.MDL", "", "   ", " .mdl", null, undefined]) {
      expect(isInvisibleModelPath(p)).toBe(true);
    }
    expect(isInvisibleModelPath("wuqi.MDX")).toBe(false);
  });

  it("splits a multi-model art field without breaking on attach strings", () => {
    cover("w3x-attach-tokens");
    expect(splitModelList("wuqi.MDX,Abilities\\Weapons\\Phoenix\\Phoenix_Missile.mdl")).toEqual([
      "wuqi.MDX",
      "Abilities\\Weapons\\Phoenix\\Phoenix_Missile.mdl",
    ]);
    // an attach string that reached here by mistake yields NOTHING, rather than
    // two bogus models — the mirror image of the M6 trap
    expect(splitModelList("right,hand")).toEqual([]);
    expect(splitModelList("a.mdl,none.mdl")).toEqual(["a.mdl"]);
  });

  it("keeps repeated lightning ids — the repetition IS the effect", () => {
    cover("w3x-attach-tokens");
    // 41-01 吸血鬼之吻 is `AFOD,AFOD,AFOD`: three stacked parallel bolts
    expect(parseLightningIds("AFOD,AFOD,AFOD")).toEqual(["AFOD", "AFOD", "AFOD"]);
    expect(parseLightningIds("DRAB,DRAL,DRAM")).toEqual(["DRAB", "DRAL", "DRAM"]);
    expect(parseLightningIds("")).toEqual([]);
  });
});
