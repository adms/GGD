/**
 * voxel-doc (task #229) — a save from the 鑄形工坊 studio must produce a
 * SCHEMA-VALID `model@1` document, every time, for every look.
 *
 * The studio's whole safety story rests on this: it writes JSON through the
 * existing dev-gated content-api, which dry-run validates with these very
 * schemas before a byte reaches disk. If `toModelDoc` could emit something
 * invalid, the operator would meet a 422 he cannot fix from the UI. So the
 * sweep below is deliberately hostile — extreme scales, empty prop masks,
 * seeded champion looks — and asserts the doc parses anyway.
 *
 * It also pins the two things that are invisible until they are wrong:
 *   • the glb path stays OUT of the yaw-offset prefixes (#68/#1);
 *   • the clipMap names all six states, so no clip button can go dead.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { COLLECTIONS } from "../content/schema";
import { zModelDoc } from "../content/schema/model";
import { CLIP_STATES, CLIPS } from "./clips";
import {
  lookFromDoc,
  toModelDoc,
  VOXEL_GLB_DIR,
  voxelGlbPath,
  clipMapFor,
} from "./doc";
import {
  ARCHETYPE_KEYS,
  DEFAULT_LOOK,
  lookForChampion,
  lookFromArchetype,
  SHAPED_JOINTS,
  VOXEL_MATERIAL,
  withJointScale,
  withPaletteSlot,
  withProp,
  zVoxelLook,
} from "./look";

/** The two prefixes glbFacing.ts rotates by 90° — a generated model must miss both. */
const YAW_PREFIXES = ["assets/models/imported/", "assets/blizzard-local/models/"];

describe("a save emits a schema-valid model@1", () => {
  it("validates for every archetype, through the SAME registry the loader uses", () => {
    cover("voxel-studio-save");
    for (const key of ARCHETYPE_KEYS) {
      const doc = toModelDoc(`voxel.${key}`, lookFromArchetype(key));
      const viaSchema = zModelDoc.safeParse(doc);
      expect(viaSchema.success, `${key}: ${JSON.stringify(viaSchema.error?.issues)}`).toBe(true);
      // and through COLLECTIONS.models, which is what the content-api routes to
      expect(COLLECTIONS.models.schema.safeParse(doc).success, key).toBe(true);
    }
  });

  it("survives a hostile sweep of proportion extremes", () => {
    cover("voxel-studio-save");
    for (const joint of SHAPED_JOINTS) {
      for (const s of [0, 0.25, 1, 2.5, 4]) {
        const doc = toModelDoc("voxel.sweep", withJointScale(DEFAULT_LOOK, joint, [s, s, s]));
        const r = zModelDoc.safeParse(doc);
        expect(r.success, `${joint}@${s}: ${JSON.stringify(r.error?.issues)}`).toBe(true);
        expect(doc.scale).toBeGreaterThan(0);
      }
    }
  });

  it("validates with no props at all and with every prop", () => {
    cover("voxel-studio-save");
    let bare = DEFAULT_LOOK;
    let dressed = DEFAULT_LOOK;
    for (const p of ["hat", "pack", "belt", "pauldron", "weapon"] as const) {
      bare = withProp(bare, p, false);
      dressed = withProp(dressed, p, true);
    }
    expect(zModelDoc.safeParse(toModelDoc("voxel.bare", bare)).success).toBe(true);
    expect(zModelDoc.safeParse(toModelDoc("voxel.dressed", dressed)).success).toBe(true);
  });

  it("validates every seeded champion look", () => {
    cover("voxel-studio-save");
    for (const id of ["champ.sela", "champ.thorne", "champ.skin.barbarian", "champ.skin.rogue"]) {
      for (const key of ARCHETYPE_KEYS) {
        const doc = toModelDoc(`voxel.${id}`, lookForChampion(id, key));
        expect(zModelDoc.safeParse(doc).success, `${id}/${key}`).toBe(true);
      }
    }
  });
});

describe("the derived glb path", () => {
  it("lives under assets/models/voxel/ and never under a yaw-offset prefix", () => {
    cover("voxel-studio-save");
    const p = voxelGlbPath("voxel.hero");
    expect(p).toBe(`${VOXEL_GLB_DIR}/voxel.hero.glb`);
    expect(p.startsWith("assets/")).toBe(true);
    for (const prefix of YAW_PREFIXES) expect(p.startsWith(prefix)).toBe(false);
  });
});

describe("the clip map is total by construction", () => {
  it("names all six states, and every name is a real baked clip", () => {
    cover("voxel-studio-save");
    const map = clipMapFor();
    expect(Object.keys(map).sort()).toEqual([...CLIP_STATES].sort());
    const baked = new Set(CLIPS.map((c) => c.name));
    for (const state of CLIP_STATES) {
      expect(baked.has(map[state]), `${state} → ${map[state]}`).toBe(true);
    }
  });
});

describe("team tint", () => {
  it("lists the palette material only when the author asked for it", () => {
    cover("voxel-studio-save");
    expect(toModelDoc("voxel.a", { ...DEFAULT_LOOK, teamTint: false }).teamTintMaterials).toEqual(
      [],
    );
    expect(toModelDoc("voxel.a", { ...DEFAULT_LOOK, teamTint: true }).teamTintMaterials).toEqual([
      VOXEL_MATERIAL,
    ]);
  });
});

describe("round-trip", () => {
  it("lookFromDoc(toModelDoc(look)) === look", () => {
    cover("voxel-studio-save");
    const look = withPaletteSlot(lookForChampion("champ.sela", "mage"), "accent", "#123456");
    const back = lookFromDoc(toModelDoc("voxel.x", look) as unknown as Record<string, unknown>);
    expect(back).not.toBeNull();
    expect(back).toEqual(zVoxelLook.parse(look));
  });

  it("returns null for a doc the generator does not own", () => {
    cover("voxel-studio-save");
    expect(lookFromDoc({ id: "champ.sela", glbPath: "assets/models/imported/heroichigo.glb" })).toBeNull();
    expect(lookFromDoc({ voxel: { archetype: "mage" } })).toBeNull();
  });
});

describe("the schema change is ADDITIVE", () => {
  it("a model doc with no voxel block is still valid", () => {
    cover("voxel-studio-save");
    const legacy = {
      id: "champ.sela",
      schema: "model@1" as const,
      glbPath: "assets/models/imported/heroichigo.glb",
      scale: 0.7727,
      collisionRadius: 0.6,
      clipMap: {
        idle: "Idle",
        run: "Running_A",
        attack: "Spellcast_Shoot",
        cast: "Spellcast_Long",
        hurt: "Hit_A",
        death: "Death_A",
      },
    };
    expect(zModelDoc.safeParse(legacy).success).toBe(true);
  });

  it("still rejects an unknown top-level key (strict is intact)", () => {
    cover("voxel-studio-save");
    const doc = { ...toModelDoc("voxel.a", DEFAULT_LOOK), somethingNew: 1 };
    expect(zModelDoc.safeParse(doc).success).toBe(false);
  });
});
