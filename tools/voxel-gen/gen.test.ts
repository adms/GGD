/**
 * voxel-gen guard.
 *
 * Two jobs, and they are different in kind:
 *
 * 1. THE OUTPUT IS BYTE-DETERMINISTIC AND THE SHIPPED FILES ARE CURRENT. The
 *    sha256 of each .glb is pinned below, so a regeneration is a reviewable
 *    no-op and an accidental edit to a parameter table cannot land without the
 *    file it produces. (`png.ts` uses stored DEFLATE and `glbWrite.q` quantises
 *    every float precisely so this pin survives a Node/zlib upgrade.)
 *
 * 2. THE CONTRACT THE RENDER LAYER RELIES ON HOLDS, ASSERTED ON THE EMITTED
 *    BYTES rather than on the tables. Most importantly: NO ANIMATION CHANNEL
 *    TARGETS `scale`. The entire per-champion variety design
 *    (`apps/client/src/render/views/voxelSkin.ts`) rests on being able to write
 *    joint scales once at spawn and have them survive every clip; if a future
 *    edit adds a scale channel that silently stops working, and nothing else in
 *    the repo would catch it.
 *
 * The Babylon-side guarantees (loads, stands upright on the floor at 1.8 u,
 * faces +Z, exposes all seven AnimationGroups) are asserted separately in
 * `apps/client/src/render/views/blockyModel.test.ts`, which runs them through
 * the real loader.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { ARCHETYPES } from "./archetypes";
import { BOXES, JOINTS, SLOT, TEX_EDGE } from "./boxman";
import { CLIPS } from "./clips";
import { bakeArchetype, outPath, NATIVE_HEIGHT } from "./gen";

/**
 * sha256 of each generated file. Regenerate with `pnpm voxel:gen` and paste the
 * new values ONLY when the geometry/clips/palette were deliberately changed —
 * these files are what 44 champions render as.
 */
const PINNED: Readonly<Record<string, string>> = {
  mage: "2a1eac756b3b119d8618e5857649b1efafd235c20fbe1e401cf1062104efe5c7",
  knight: "b572e756dcfc88e4e7e234b74f2178bef7ad1b46479dc2eef49aa10eaf6c0810",
  barbarian: "9917f0341ef48f52d1ba521c05150e9ef598c14e053c6102cf60079f26f3af47",
  rogue: "a0c8ac12ddfc824ffcedafc97fff6b6d5cdfab030e9506b44efe1bb6c1c5207f",
  undead: "77ed828a5a5a5be144ead769433eefb1eb557924f479ed6562215b3a453290d3",
};

const baked = ARCHETYPES.map((arch) => ({ arch, ...bakeArchetype(arch) }));

function glbJson(bytes: Buffer): Record<string, any> {
  const jsonLen = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLen).toString("utf8"));
}

describe("voxel-gen output is deterministic and current", () => {
  it("re-baking produces byte-identical output", () => {
    for (const { arch, bytes } of baked) {
      expect(bakeArchetype(arch).bytes.equals(bytes), `blocky-${arch.key} is not deterministic`).toBe(true);
    }
  });

  it("matches the sha256 pinned for each archetype", () => {
    for (const { arch, bytes } of baked) {
      expect(createHash("sha256").update(bytes).digest("hex"), `blocky-${arch.key}`).toBe(PINNED[arch.key]);
    }
  });

  it("the shipped .glb on disk is what the generator produces", () => {
    for (const { arch, bytes } of baked) {
      const file = outPath(arch);
      expect(fs.existsSync(file), `${file} missing — run \`pnpm voxel:gen\``).toBe(true);
      expect(fs.readFileSync(file).equals(bytes), `${file} is stale — run \`pnpm voxel:gen\``).toBe(true);
    }
  });
});

describe("voxel-gen honours the render contract", () => {
  it("ships ONE mesh with ONE primitive and ONE material — a single draw call", () => {
    for (const { arch, bytes } of baked) {
      const g = glbJson(bytes);
      expect(g.meshes.length, `blocky-${arch.key}`).toBe(1);
      expect(g.meshes[0].primitives.length).toBe(1);
      expect(g.materials.length).toBe(1);
      expect(g.meshes[0].primitives[0].material).toBe(0);
    }
  });

  it("stays far inside the champion triangle budget", () => {
    // The champion gate (tools/model-budget/limits.ts) warns at 16,000 tris.
    // The four KayKit meshes this replaces measured 5,683–6,952 each.
    for (const { arch, stats } of baked) {
      expect(stats.triangles, `blocky-${arch.key}`).toBe(BOXES.length * 12);
      expect(stats.triangles).toBeLessThanOrEqual(600);
      expect(stats.triangles).toBeGreaterThanOrEqual(100);
    }
  });

  it("keeps the rig small and names every joint from the attachment vocabulary", () => {
    // `apps/client/src/render/vfx/attachment.ts` resolves a WC3 attach string
    // against joint names; these are the canonical nouns it already knows, so
    // `right,hand` / `overhead` / `chest` / `origin` land with no new mapping.
    const names = JOINTS.map((j) => j.name);
    for (const required of ["origin", "chest", "head", "overhead", "handLeft", "handRight", "weapon", "footLeft", "footRight"]) {
      expect(names, `joint ${required} missing`).toContain(required);
    }
    for (const { arch, bytes, stats } of baked) {
      const g = glbJson(bytes);
      expect(g.skins.length, `blocky-${arch.key}`).toBe(1);
      expect(g.skins[0].joints.length).toBe(JOINTS.length);
      expect(stats.joints).toBeLessThanOrEqual(16);
    }
  });

  it("carries every clip the model@1 clipMap names, plus `cheer` for the shop", () => {
    for (const { arch, bytes } of baked) {
      const names = glbJson(bytes).animations.map((a: { name: string }) => a.name);
      for (const state of ["idle", "run", "attack", "cast", "hurt", "death"]) {
        expect(names, `blocky-${arch.key} has no ${state} clip`).toContain(state);
      }
      // reactionClip.pickReactionClip matches raw group names, not the clipMap:
      // without `cheer` a purchase celebration downgrades to the attack swing.
      expect(names, `blocky-${arch.key} has no cheer clip`).toContain("cheer");
      expect(names.length).toBe(CLIPS.length);
    }
  });

  it("NEVER animates scale — the per-champion joint-scale seam depends on it", () => {
    for (const { arch, bytes } of baked) {
      const g = glbJson(bytes);
      for (const anim of g.animations) {
        for (const ch of anim.channels) {
          expect(
            ch.target.path,
            `blocky-${arch.key}/${anim.name} animates ${ch.target.path}; voxelSkin's ` +
              `per-champion joint scaling would be overwritten every frame`,
          ).not.toBe("scale");
          expect(["rotation", "translation"]).toContain(ch.target.path);
        }
      }
    }
  });

  it("drives the same channel set in every clip (no pose residue across transitions)", () => {
    for (const { arch, bytes } of baked) {
      const g = glbJson(bytes);
      const sig = g.animations.map((a: { channels: unknown[] }) => a.channels.length);
      expect(new Set(sig).size, `blocky-${arch.key} clips drive different channel counts`).toBe(1);
      // and each is comfortably under the champion gate's 35-channel warn
      expect(sig[0]).toBeLessThanOrEqual(20);
    }
  });

  it("stands exactly TARGET_HEIGHT tall with its feet on y=0", () => {
    // #150: nativeH == 1.8 makes ChampionView's normalisation factor 1.0 and
    // lets `doc.scale` be an honest 1.0. Props are tucked inside the head/torso
    // envelope on purpose so nothing inflates the hierarchy bbox — the exact
    // failure the old mage.glb had (it measured 3.0028 u because of its staff).
    expect(NATIVE_HEIGHT).toBeCloseTo(1.8, 6);
    for (const { arch, bytes } of baked) {
      const g = glbJson(bytes);
      const pos = g.accessors[g.meshes[0].primitives[0].attributes.POSITION];
      expect(pos.min[1], `blocky-${arch.key} feet`).toBeCloseTo(0, 5);
      expect(pos.max[1], `blocky-${arch.key} head`).toBeCloseTo(1.8, 5);
    }
  });

  it("faces +Z and wears its weapon on the character's right (+X)", () => {
    // Babylon's glTF loader flips X, not Z (measured: the body's world matrix
    // is diag(-1,1,1)). So FORWARD passes through untouched — the face is
    // authored at +z and renders at +z, matching the native/KayKit family that
    // `NATIVE_GLB_YAW_OFFSET = 0` was calibrated against — while LEFT/RIGHT
    // would swap, which is why the emitter mirrors X. `handRight` is therefore
    // authored at design +x and must appear at NEGATIVE x in the file, so that
    // the loader's flip lands it back on the character's own right.
    const face = BOXES.find((b) => b.name === "face")!;
    const pack = BOXES.find((b) => b.name === "pack")!;
    expect(face.center[2], "the face must be authored in FRONT (+z)").toBeGreaterThan(0);
    expect(pack.center[2], "the pack must be authored BEHIND (-z)").toBeLessThan(0);
    const weaponJoint = JOINTS.find((j) => j.name === "weapon")!;
    const handRight = JOINTS.find((j) => j.name === "handRight")!;
    expect(handRight.local[0], "handRight is the character's own right (+x design space)").toBeGreaterThan(0);
    for (const { arch, bytes } of baked) {
      const g = glbJson(bytes);
      const idx = JOINTS.indexOf(handRight);
      // node index 2 + joint index; the mirror must have negated file-space x
      expect(g.nodes[2 + idx].translation[0], `blocky-${arch.key} handRight`).toBeLessThan(0);
      expect(g.nodes[2 + JOINTS.indexOf(weaponJoint)].translation[2]).toBeGreaterThan(0);
    }
  });

  it("embeds a 16x16 NEAREST palette — big enough not to read as a placeholder", () => {
    // packages/shared/src/content/modelTexture.test.ts treats any embedded
    // image <= 8x8 as the importer's unresolved-.blp grey placeholder.
    expect(TEX_EDGE).toBeGreaterThan(8);
    for (const { arch, bytes, stats } of baked) {
      const g = glbJson(bytes);
      expect(stats.texEdge).toBe(TEX_EDGE);
      expect(g.images.length, `blocky-${arch.key}`).toBe(1);
      expect(g.samplers[0].magFilter).toBe(9728); // NEAREST — no palette bleed
      expect(g.materials[0].pbrMetallicRoughness.baseColorFactor).toEqual([1, 1, 1, 1]);
    }
  });

  it("gives every archetype a distinct palette, and the undead its own silhouette", () => {
    const palettes = ARCHETYPES.map((a) => a.palette.join(""));
    expect(new Set(palettes).size).toBe(ARCHETYPES.length);
    const undead = ARCHETYPES.find((a) => a.key === "undead")!;
    expect(undead.props).toHaveLength(0); // bare, no hat/pack/belt/pauldron/weapon
    expect(undead.clipRate).toBeGreaterThan(1); // shamble
    expect(undead.jointScale?.handRight).toBeDefined();
  });

  it("hides a prop by collapsing its OWN joint, never a body joint", () => {
    // A prop bound to `chest` or `handLeft` would make "hide the belt" mean
    // "delete the torso"; each prop therefore carries a dedicated joint.
    const bodyJoints = new Set(["origin", "hips", "chest", "head", "handLeft", "handRight", "footLeft", "footRight"]);
    for (const box of BOXES) {
      if (box.group === "core" || box.group === "face") continue;
      expect(bodyJoints.has(box.joint), `prop ${box.name} rides body joint ${box.joint}`).toBe(false);
    }
    // barbarian wears no hat → the hat joint ships at scale 0
    const barb = baked.find((b) => b.arch.key === "barbarian")!;
    const g = glbJson(barb.bytes);
    const hatNode = g.nodes.find((n: { name: string }) => n.name === "hat");
    expect(hatNode.scale).toEqual([0, 0, 0]);
    const knight = glbJson(baked.find((b) => b.arch.key === "knight")!.bytes);
    expect(knight.nodes.find((n: { name: string }) => n.name === "hat").scale).toBeUndefined();
  });

  it("paints every box from a live palette slot", () => {
    const live = new Set(Object.values(SLOT));
    for (const box of BOXES) expect(live.has(SLOT[box.slot])).toBe(true);
  });
});
