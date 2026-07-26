/**
 * voxel-gen guard.
 *
 * Three jobs, and they are different in kind:
 *
 * 1. THE OUTPUT IS BYTE-DETERMINISTIC AND THE SHIPPED FILES ARE CURRENT. The
 *    sha256 of each .glb is pinned below, so a regeneration is a reviewable
 *    no-op and an accidental edit to a parameter table cannot land without the
 *    file it produces. (`pngWrite.ts` uses stored DEFLATE and `glbWrite.q`
 *    quantises every float precisely so this pin survives a Node upgrade.)
 *
 *    THE PINS ARE ALSO WHAT PROVED TASK #229's MOVE. The emitter used to live
 *    here and wrote node `Buffer`s; it now lives in `@ggd/shared/voxel` and
 *    writes `Uint8Array`s, so it can run inside the admin bundle. Not one of
 *    the five hashes below changed — that is the whole argument that the port
 *    was a move and not a rewrite, and it is checked rather than claimed.
 *
 * 2. THE TWO ENTRY POINTS CANNOT DIVERGE. `bakeArchetype` (what the CLI ships)
 *    is literally `bakeLook(key, lookFromArchetype(key))` (what the 後台 page
 *    calls), and the test below re-derives the archetype bake through the LOOK
 *    path and demands byte equality. That is the owner's 「不要 fork 第二個產生
 *    器」 requirement expressed as an assertion instead of a comment.
 *
 * 3. THE CONTRACT THE RENDER LAYER RELIES ON HOLDS, ASSERTED ON THE EMITTED
 *    BYTES rather than on the tables. Most importantly: NO ANIMATION CHANNEL
 *    TARGETS `scale`. The entire per-champion variety design
 *    (`apps/client/src/render/views/voxelSkin.ts`) rests on being able to write
 *    joint scales once at spawn and have them survive every clip.
 *
 * The Babylon-side guarantees (loads, stands upright on the floor at 1.8 u,
 * faces +Z, exposes all seven AnimationGroups) are asserted separately in
 * `apps/client/src/render/views/blockyModel.test.ts`, which runs them through
 * the real loader.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  ARCHETYPES,
  BOXES,
  CLIPS,
  JOINTS,
  SLOT,
  TEX_EDGE,
  bakeArchetype,
  bakeLook,
  lookFromArchetype,
  sha256Hex,
} from "@ggd/shared/voxel";
import { outPath, NATIVE_HEIGHT } from "./gen";

/**
 * sha256 of each generated file. Regenerate with `pnpm voxel:gen` and paste the
 * new values ONLY when the geometry/clips/palette were deliberately changed —
 * these files are what 43 champions render as.
 */
const PINNED: Readonly<Record<string, string>> = {
  mage: "2a1eac756b3b119d8618e5857649b1efafd235c20fbe1e401cf1062104efe5c7",
  knight: "b572e756dcfc88e4e7e234b74f2178bef7ad1b46479dc2eef49aa10eaf6c0810",
  barbarian: "9917f0341ef48f52d1ba521c05150e9ef598c14e053c6102cf60079f26f3af47",
  rogue: "a0c8ac12ddfc824ffcedafc97fff6b6d5cdfab030e9506b44efe1bb6c1c5207f",
  undead: "77ed828a5a5a5be144ead769433eefb1eb557924f479ed6562215b3a453290d3",
};

const baked = ARCHETYPES.map((arch) => ({ arch, ...bakeArchetype(arch) }));

/** Byte equality for `Uint8Array` — the `Buffer.equals` this suite used to use. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function glbJson(bytes: Uint8Array): Record<string, any> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLen = dv.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen)));
}

describe("voxel-gen output is deterministic and current", () => {
  it("re-baking produces byte-identical output", () => {
    for (const { arch, bytes } of baked) {
      expect(
        sameBytes(bakeArchetype(arch).bytes, bytes),
        `blocky-${arch.key} is not deterministic`,
      ).toBe(true);
    }
  });

  it("matches the sha256 pinned for each archetype", () => {
    for (const { arch, bytes } of baked) {
      expect(createHash("sha256").update(bytes).digest("hex"), `blocky-${arch.key}`).toBe(
        PINNED[arch.key],
      );
    }
  });

  it("the pure sha256 the admin page shows agrees with node:crypto", () => {
    // The 後台 page has no `node:crypto`, so it digests with the shared pure
    // implementation. If the two ever disagreed, the hash an operator reads off
    // the page would not be the hash this suite pins, and "the file I made is
    // the file that ships" would quietly stop being checkable.
    for (const { arch, bytes, stats } of baked) {
      expect(stats.sha256, `blocky-${arch.key}`).toBe(
        createHash("sha256").update(bytes).digest("hex"),
      );
      expect(sha256Hex(bytes)).toBe(stats.sha256);
    }
  });

  it("the CLI bake and the studio's LOOK bake are the same bytes", () => {
    // The one assertion that makes 「不要 fork 第二個產生器」 enforceable.
    for (const { arch, bytes } of baked) {
      const viaLook = bakeLook(arch.key, lookFromArchetype(arch.key)).bytes;
      expect(sameBytes(viaLook, bytes), `blocky-${arch.key} diverges via lookFromArchetype`).toBe(
        true,
      );
    }
  });

  it("the shipped .glb on disk is what the generator produces", () => {
    for (const { arch, bytes } of baked) {
      const file = outPath(arch);
      expect(fs.existsSync(file), `${file} missing — run \`pnpm voxel:gen\``).toBe(true);
      expect(
        sameBytes(new Uint8Array(fs.readFileSync(file)), bytes),
        `${file} is stale — run \`pnpm voxel:gen\``,
      ).toBe(true);
    }
  });

  it("emits a plain Uint8Array, never a node Buffer", () => {
    // A `Buffer` would still pass every byte assertion here and then fail at
    // `new Blob([bytes])` in the browser. Pin the type, not just the contents.
    for (const { arch, bytes } of baked) {
      expect(bytes, `blocky-${arch.key}`).toBeInstanceOf(Uint8Array);
      expect(
        Object.getPrototypeOf(bytes) === Uint8Array.prototype,
        `blocky-${arch.key} is a Buffer, which apps/admin cannot construct`,
      ).toBe(true);
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

  it("reports the budget numbers #226 exists for, and stays under them", () => {
    // A generator that emits a file without saying what it costs would be
    // reintroducing the blindness this task was raised to end.
    for (const { arch, bytes, stats } of baked) {
      expect(stats.bytes, `blocky-${arch.key} byte count`).toBe(bytes.length);
      // every replaced KayKit character was 0.6–1.6 MB; 64 KB is a ceiling with
      // room to breathe that still fails loudly if the figure grows a texture
      expect(stats.bytes).toBeLessThan(64 * 1024);
      expect(stats.textureBytes).toBeGreaterThan(0);
      expect(stats.textureBytes).toBeLessThan(4 * 1024);
    }
  });

  it("keeps the rig small and names every joint from the attachment vocabulary", () => {
    const names = JOINTS.map((j) => j.name);
    for (const required of [
      "origin",
      "chest",
      "head",
      "overhead",
      "handLeft",
      "handRight",
      "weapon",
      "footLeft",
      "footRight",
    ]) {
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
      expect(sig[0]).toBeLessThanOrEqual(20);
    }
  });

  it("stands exactly TARGET_HEIGHT tall with its feet on y=0", () => {
    expect(NATIVE_HEIGHT).toBeCloseTo(1.8, 6);
    for (const { arch, bytes } of baked) {
      const g = glbJson(bytes);
      const pos = g.accessors[g.meshes[0].primitives[0].attributes.POSITION];
      expect(pos.min[1], `blocky-${arch.key} feet`).toBeCloseTo(0, 5);
      expect(pos.max[1], `blocky-${arch.key} head`).toBeCloseTo(1.8, 5);
    }
  });

  it("faces +Z and wears its weapon on the character's right (+X)", () => {
    const face = BOXES.find((b) => b.name === "face")!;
    const pack = BOXES.find((b) => b.name === "pack")!;
    expect(face.center[2], "the face must be authored in FRONT (+z)").toBeGreaterThan(0);
    expect(pack.center[2], "the pack must be authored BEHIND (-z)").toBeLessThan(0);
    const weaponJoint = JOINTS.find((j) => j.name === "weapon")!;
    const handRight = JOINTS.find((j) => j.name === "handRight")!;
    expect(
      handRight.local[0],
      "handRight is the character's own right (+x design space)",
    ).toBeGreaterThan(0);
    for (const { arch, bytes } of baked) {
      const g = glbJson(bytes);
      const idx = JOINTS.indexOf(handRight);
      // node index 2 + joint index; the mirror must have negated file-space x
      expect(g.nodes[2 + idx].translation[0], `blocky-${arch.key} handRight`).toBeLessThan(0);
      expect(g.nodes[2 + JOINTS.indexOf(weaponJoint)].translation[2]).toBeGreaterThan(0);
    }
  });

  it("embeds a 16x16 NEAREST palette — big enough not to read as a placeholder", () => {
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
    const bodyJoints = new Set([
      "origin",
      "hips",
      "chest",
      "head",
      "handLeft",
      "handRight",
      "footLeft",
      "footRight",
    ]);
    for (const box of BOXES) {
      if (box.group === "core" || box.group === "face") continue;
      expect(bodyJoints.has(box.joint), `prop ${box.name} rides body joint ${box.joint}`).toBe(
        false,
      );
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
