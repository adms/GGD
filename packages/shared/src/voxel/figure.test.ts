/**
 * voxel-figure (task #229) — the invariants that let ONE generator serve the
 * admin studio, the offline bake and the game at the same time.
 *
 * These are not "does the function run" tests. Each one pins a property some
 * OTHER task already locked in, which a proportion slider could otherwise
 * silently break:
 *
 *   #150  uniform on-screen height — the doc scale must always normalise to 1.8u
 *   #68/#1 orientation — forward is +Z, and the face box is the witness
 *   #49   team tint — no generated mesh name may end in a reserved suffix
 *   #226  triangle budget + the "honest 1.0" default scale
 *
 * The studio is allowed to make an ugly character. It is not allowed to make
 * one that renders at the wrong height, faces backwards, or refuses to tint.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { BOXES, FIGURE_PX, PROP_GROUPS, PX } from "./boxman";
import { buildFigure, TARGET_HEIGHT } from "./figure";
import {
  ARCHETYPE_KEYS,
  DEFAULT_LOOK,
  lookForChampion,
  lookFromArchetype,
  SHAPED_JOINTS,
  withJointScale,
  withProp,
  type PropKey,
  type VoxelLook,
} from "./look";

/** #49's reserved suffixes (apps/client/src/render/views/modelTint.ts). */
const UNTINTED_MESH_SUFFIXES = ["-teamring", "-shadow"];

describe("the default figure is the character the game already draws", () => {
  it("stands exactly 32 voxel-px = 1.8 u tall, so doc.scale is an honest 1.0", () => {
    cover("voxel-studio-core");
    const f = buildFigure(DEFAULT_LOOK);
    expect(f.height).toBeCloseTo(FIGURE_PX * PX, 9);
    expect(f.height).toBeCloseTo(TARGET_HEIGHT, 9);
    expect(f.docScale).toBeCloseTo(1, 9);
  });

  it("puts the feet on the floor", () => {
    cover("voxel-studio-core");
    const f = buildFigure(DEFAULT_LOOK);
    const minY = Math.min(...f.boxes.map((b) => b.center[1] - b.size[1] / 2));
    expect(minY).toBeCloseTo(0, 9);
  });

  it("keeps ChampionView's 8:12:4 core proportions", () => {
    cover("voxel-studio-core");
    const f = buildFigure(DEFAULT_LOOK);
    const byName = new Map(f.boxes.map((b) => [b.name, b]));
    const px = (v: number): number => v * PX;
    expect(byName.get("torso")?.size).toEqual([px(8), px(12), px(4)]);
    expect(byName.get("head")?.size).toEqual([px(8), px(8), px(8)]);
    expect(byName.get("armLeft")?.size).toEqual([px(4), px(12), px(4)]);
    expect(byName.get("legRight")?.size).toEqual([px(4), px(12), px(4)]);
  });
});

describe("#150: uniform on-screen height survives ANY proportion edit", () => {
  it("normalises every joint-scale combination back to 1.8 u", () => {
    cover("voxel-studio-core");
    // a deliberate sweep of extremes, including the collapse case (0) the
    // undead's missing forearm uses
    for (const joint of SHAPED_JOINTS) {
      for (const s of [0, 0.4, 1, 1.7, 3]) {
        const look = withJointScale(DEFAULT_LOOK, joint, [s, s, s]);
        const f = buildFigure(look);
        expect(f.height, `${joint}@${s}`).toBeGreaterThan(0);
        expect(f.height * f.docScale, `${joint}@${s}`).toBeCloseTo(TARGET_HEIGHT, 6);
        // and the feet are still on the floor, whatever happened above them
        const minY = Math.min(...f.boxes.map((b) => b.center[1] - b.size[1] / 2));
        expect(minY, `${joint}@${s}`).toBeCloseTo(0, 9);
      }
    }
  });

  it("never reports a non-finite or non-positive scale", () => {
    cover("voxel-studio-core");
    for (const key of ARCHETYPE_KEYS) {
      const f = buildFigure(lookFromArchetype(key));
      expect(Number.isFinite(f.docScale), key).toBe(true);
      expect(f.docScale, key).toBeGreaterThan(0);
    }
  });
});

describe("#68/#1: the figure faces +Z", () => {
  it("puts the face box on the positive-z side of the head", () => {
    cover("voxel-studio-core");
    const f = buildFigure(DEFAULT_LOOK);
    const face = f.boxes.find((b) => b.name === "face");
    expect(face, "the face box is the orientation witness — it must exist").toBeDefined();
    expect(face!.center[2]).toBeGreaterThan(0);
  });

  it("puts the back pack behind the torso", () => {
    cover("voxel-studio-core");
    const f = buildFigure(withProp(DEFAULT_LOOK, "pack", true));
    const pack = f.boxes.find((b) => b.name === "pack");
    expect(pack!.center[2]).toBeLessThan(0);
  });
});

describe("#49: every generated mesh is tintable", () => {
  it("no box name ends in a reserved untinted suffix", () => {
    cover("voxel-studio-core");
    for (const box of BOXES) {
      for (const suffix of UNTINTED_MESH_SUFFIXES) {
        expect(box.name.endsWith(suffix), box.name).toBe(false);
      }
    }
  });
});

describe("#226: the triangle budget", () => {
  it("stays inside 72..168 triangles for every archetype", () => {
    cover("voxel-studio-core");
    for (const key of ARCHETYPE_KEYS) {
      const f = buildFigure(lookFromArchetype(key));
      // 6 core + 1 face = 7 boxes minimum; 14 boxes fully dressed
      expect(f.triCount, key).toBeGreaterThanOrEqual(7 * 12);
      expect(f.triCount, key).toBeLessThanOrEqual(BOXES.length * 12);
    }
  });

  it("collapsing a prop REMOVES its boxes rather than shrinking them", () => {
    cover("voxel-studio-core");
    const worn = buildFigure(withProp(DEFAULT_LOOK, "hat", true));
    const bare = buildFigure(withProp(DEFAULT_LOOK, "hat", false));
    expect(worn.boxes.some((b) => b.name === "hat")).toBe(true);
    expect(bare.boxes.some((b) => b.name === "hat")).toBe(false);
    expect(bare.triCount).toBeLessThan(worn.triCount);
  });
});

describe("attach points", () => {
  it("emits the four documented points, all finite and above the floor", () => {
    cover("voxel-studio-core");
    const f = buildFigure(DEFAULT_LOOK);
    for (const name of ["rightHand", "leftHand", "chest", "overhead"]) {
      const p = f.attachPoints[name];
      expect(p, name).toBeDefined();
      expect(Number.isFinite(p!.x) && Number.isFinite(p!.y) && Number.isFinite(p!.z), name).toBe(
        true,
      );
      expect(p!.y, name).toBeGreaterThan(0);
    }
    // hands mirror across x, overhead clears the head
    expect(f.attachPoints["rightHand"]!.x).toBeCloseTo(-f.attachPoints["leftHand"]!.x, 6);
    expect(f.attachPoints["overhead"]!.y).toBeGreaterThan(f.height);
  });
});

describe("purity + determinism", () => {
  it("buildFigure never mutates the look it is given", () => {
    cover("voxel-studio-core");
    const before = JSON.stringify(DEFAULT_LOOK);
    buildFigure(DEFAULT_LOOK);
    expect(JSON.stringify(DEFAULT_LOOK)).toBe(before);
  });

  it("is a pure function of its input", () => {
    cover("voxel-studio-core");
    const look: VoxelLook = lookForChampion("champ.thorne", "knight");
    const a = buildFigure(look);
    const b = buildFigure(look);
    expect(JSON.stringify(b.boxes)).toBe(JSON.stringify(a.boxes));
    expect(b.docScale).toBe(a.docScale);
  });

  it("covers every prop group the part table declares", () => {
    cover("voxel-studio-core");
    for (const group of PROP_GROUPS) {
      const f = buildFigure(withProp(DEFAULT_LOOK, group as PropKey, true));
      expect(f.boxes.some((b) => b.group === group), group).toBe(true);
    }
  });
});
