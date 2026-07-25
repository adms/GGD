/**
 * trimClips.test — the guard that makes the animation prune SAFE TO REPEAT.
 *
 * The prune is only defensible because the keep-set is DERIVED. These tests pin
 * the two independent mechanisms that decide it (the model doc's clipMap and
 * reactionClip's regex over raw group names), and then assert the SHIPPED files
 * still satisfy them. Without this, a future clipMap edit would silently ship a
 * champion whose attack animation is no longer in the .glb — the exact landmine
 * a trimmed model creates.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import { measureGlb, readGlb } from "./glb";
import { RESERVED_CLIPS, pruneAnimations, pruneDiff, requiredClips } from "./trimClips";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CHAMPS = path.join(ROOT, "content/assets/models/champions");
const STAND_INS = ["blocky-knight", "blocky-rogue", "blocky-barbarian", "blocky-mage"].map(
  (n) => path.join(CHAMPS, `${n}.glb`),
);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trimclips-test-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const clipNames = (file: string): string[] => (readGlb(file).json.animations ?? []).map((a: any) => a.name);

describe("the keep-set is derived from the content, not hardcoded", () => {
  it("blocky-knight.glb's required set covers every champ.thorne clipMap value", () => {
    const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "content/models/champ.thorne.json"), "utf8"));
    const req = requiredClips(path.join(CHAMPS, "blocky-knight.glb"), clipNames(path.join(CHAMPS, "blocky-knight.glb")));
    for (const clip of Object.values(doc.clipMap) as string[]) expect(req.clips).toContain(clip);
    expect(req.docs).toContain("champ.thorne");
  });

  it("it also covers the SECOND mechanism: reactionClip's own pick (cheer)", () => {
    // reactionClip deliberately ignores clipMap — a clipMap-only trim would drop
    // the celebration and downgrade every shop purchase reaction to an attack
    // swing. The generated bakes name it `cheer` (was KayKit's `Cheer`); the
    // picker is case-insensitive, so the same rule finds both.
    const f = path.join(CHAMPS, "blocky-knight.glb");
    const req = requiredClips(f, clipNames(f));
    expect(req.clips).toContain("cheer");
    expect(req.reasons.get("cheer")!.join(" ")).toMatch(/pickReactionClip/);
  });

  it("reserved entries are SCOPED to the stand-in directory, never global", () => {
    expect(RESERVED_CLIPS.every((r) => r.scope === "assets/models/champions/")).toBe(true);
    // a glb outside that prefix gets no reserved clips, only its own clipMap
    const outside = requiredClips(path.join(ROOT, "content/assets/models/props/guardian_skeleton.glb"), ["Idle", "Hit_A"]);
    expect(outside.clips).not.toContain("cheer");
  });
});

describe("the SHIPPED stand-ins still satisfy every derived requirement", () => {
  it.each(STAND_INS)("%s contains every required clip", (file) => {
    const names = clipNames(file);
    const req = requiredClips(file, names);
    const missing = req.clips.filter((c) => !names.includes(c));
    expect(missing).toEqual([]);
    expect(req.clips.length).toBeGreaterThan(0);
  });

  it("all four keep an IDENTICAL clip roster (one shared rig, freely swapped)", () => {
    const rosters = STAND_INS.map((f) => clipNames(f).slice().sort().join("|"));
    expect(new Set(rosters).size).toBe(1);
  });

  // The EXACT roster, pinned. `toBeLessThan(76)` was too weak to be a guard:
  // it passes at 6 clips, i.e. it would happily accept a trim that had dropped
  // the celebration and every other reserved clip. Pinning the names means a
  // future re-bake that loses one fails HERE, with the clip named, instead of
  // showing up as a champion who silently stops celebrating a purchase.
  //
  // WAS the 16-clip KayKit roster (1H_Melee_Attack_Slice_Diagonal, 2H_Melee_Idle,
  // Death_A_Pose, Walking_A, …). #226 replaced those files with generated
  // box-men that carry exactly the seven clips the game reaches for — the six
  // model@1 states plus the shop celebration — so there is nothing left to trim
  // and the roster IS the requirement.
  const EXPECTED_ROSTER = ["attack", "cast", "cheer", "death", "hurt", "idle", "run"];

  it.each(STAND_INS)("%s ships EXACTLY the pinned 7-clip roster", (file) => {
    expect(clipNames(file).slice().sort()).toEqual(EXPECTED_ROSTER);
  });

  it("carries no clip the game cannot reach (nothing left to prune)", () => {
    for (const f of STAND_INS) {
      const m = measureGlb(f);
      expect(m.clips).toBe(EXPECTED_ROSTER.length);
      // every shipped clip is REQUIRED, so the prune stage is a no-op here —
      // the strongest form of "the trim happened".
      expect(m.clips).toBe(requiredClips(f, clipNames(f)).clips.length);
    }
  });

  it("every clip reactionClip and the reserved table reach for by NAME survives", () => {
    // the two mechanisms that bypass clipMap entirely — the exact blind spot
    // the presence-gated derivation used to hide
    for (const f of STAND_INS) {
      const names = clipNames(f);
      expect(names).toContain("cheer"); // pickReactionClip → victory tier
      expect(names).toContain("idle"); // IntermissionScene shop idle regex
    }
  });
});

describe("the prune moves animation bytes and NOTHING else", () => {
  it("a re-prune of a shipped file is geometry/rig/texture identical", () => {
    const src = path.join(CHAMPS, "blocky-knight.glb");
    const glb = readGlb(src);
    const keep = clipNames(src).filter((n) => n !== "cheer"); // drop one, keep the rest
    const out = path.join(tmp, "reprune.glb");
    fs.writeFileSync(out, pruneAnimations(glb, keep));
    expect(pruneDiff(src, out, keep)).toBeNull();
    expect(fs.statSync(out).size).toBeLessThan(fs.statSync(src).size);
  });

  it("refuses a keep-set naming a clip the file does not have", () => {
    const glb = readGlb(path.join(CHAMPS, "blocky-mage.glb"));
    expect(() => pruneAnimations(glb, ["idle", "No_Such_Clip"])).toThrow(/missing clips: No_Such_Clip/);
  });

  it("pruneDiff catches a candidate that lost a required clip", () => {
    const src = path.join(CHAMPS, "blocky-rogue.glb");
    const glb = readGlb(src);
    const out = path.join(tmp, "short.glb");
    fs.writeFileSync(out, pruneAnimations(glb, ["idle"]));
    // asked to verify against a two-clip contract the candidate cannot satisfy
    expect(pruneDiff(src, out, ["idle", "cheer"])).toMatch(/clip count is 1/);
  });
});
