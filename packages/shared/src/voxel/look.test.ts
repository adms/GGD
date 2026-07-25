/**
 * voxel-look (task #229) — DETERMINISM, which is the single property that makes
 * one shared generator meaningful.
 *
 * The studio previews `lookForChampion(id, archetype)` and the offline bake
 * emits it. If the two ever disagree — a `Math.random`, a `Date`, a
 * locale-sensitive number format, an iteration over an unordered map — the
 * admin page becomes a liar: it shows an operator a character the game will not
 * render, and nothing anywhere fails. So this file pins the outputs as GOLDEN
 * VECTORS. A diff here is not a broken test, it is a warning that every
 * generated champion just changed appearance.
 *
 * The four ids are #226's frozen model docs, which 44 champions resolve to:
 * champ.sela (18), champ.thorne (11), champ.skin.barbarian (9),
 * champ.skin.rogue (6).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { PROP_GROUPS, SLOT, TEX_EDGE } from "./boxman";
import { CLIPS, DRIVEN_ROTATION_JOINTS, sampleClip, findClip, CLIP_STATES } from "./clips";
import { DOC_ARCHETYPE } from "./archetypes";
import {
  ARCHETYPE_KEYS,
  DEFAULT_LOOK,
  archetypeForModelDoc,
  hash32,
  lookForChampion,
  lookFromArchetype,
  SHAPED_JOINTS,
  withPaletteSlot,
  withProp,
  zVoxelLook,
} from "./look";
import { paletteRgba } from "./texture";

const SHIPPED_MODEL_DOCS = [
  "champ.sela",
  "champ.thorne",
  "champ.skin.barbarian",
  "champ.skin.rogue",
  "champ.blocky.undead",
] as const;

describe("hash32 is the reproducible seed source", () => {
  it("is stable, integer, and unsigned", () => {
    cover("voxel-studio-core");
    // FNV-1a 32-bit reference vectors
    expect(hash32("")).toBe(0x811c9dc5);
    expect(hash32("a")).toBe(0xe40c292c);
    expect(hash32("foobar")).toBe(0xbf9cf968);
    for (const s of ["champ.sela", "champ.thorne", ""]) {
      expect(Number.isInteger(hash32(s)), s).toBe(true);
      expect(hash32(s), s).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("lookForChampion is deterministic", () => {
  it("returns byte-identical JSON across repeated calls", () => {
    cover("voxel-studio-core");
    for (const id of SHIPPED_MODEL_DOCS) {
      const key = DOC_ARCHETYPE[id]!;
      const a = JSON.stringify(lookForChampion(id, key));
      for (let i = 0; i < 5; i++) expect(JSON.stringify(lookForChampion(id, key)), id).toBe(a);
    }
  });

  it("GOLDEN VECTOR — the five shipped model docs (a diff here changes every champion)", () => {
    cover("voxel-studio-core");
    const snapshot = SHIPPED_MODEL_DOCS.map((id) => {
      const look = lookForChampion(id, DOC_ARCHETYPE[id]!);
      return `${id} ${look.palette.join(",")} props=${look.props.join("/")} hips=${(
        look.jointScale["hips"] ?? [1, 1, 1]
      ).join(",")}`;
    });
    expect(snapshot).toEqual([
      "champ.sela #d9aa82,#452b77,#5f3f9b,#824ec9,#cda43b,#2f2342,#1a1522,#825d31 props=hat/pack/weapon hips=0.92,0.92,0.92",
      "champ.thorne #eec79f,#45638f,#9fa8ba,#ab3b3a,#cfd5de,#313642,#151a22,#745e43 props=hat/pack/belt/pauldron hips=1.102,1.102,1.102",
      "champ.skin.barbarian #f1b47b,#613514,#bf844f,#cc3811,#bf5e23,#533c2f,#181008,#66451f props=belt/weapon hips=0.905,0.905,0.905",
      "champ.skin.rogue #f1d8b6,#3a473c,#4a494f,#4d7b59,#be9946,#282f34,#101318,#a3afb9 props=hat/pack/weapon hips=0.95,0.95,0.95",
      "champ.blocky.undead #7a9075,#463c2f,#595340,#6a6554,#776544,#20201b,#c8e05a,#b3ab91 props=pauldron hips=1.008,1.008,1.008",
    ]);
  });

  it("keeps every seeded look inside the schema (so a bake can save it)", () => {
    cover("voxel-studio-core");
    for (const id of SHIPPED_MODEL_DOCS) {
      const r = zVoxelLook.safeParse(lookForChampion(id, DOC_ARCHETYPE[id]!));
      expect(r.success, `${id}: ${JSON.stringify(r.error?.issues)}`).toBe(true);
    }
  });

  it("keeps the archetype's silhouette recognisable — scales stay near 1", () => {
    cover("voxel-studio-core");
    for (const id of SHIPPED_MODEL_DOCS) {
      const look = lookForChampion(id, DOC_ARCHETYPE[id]!);
      for (const joint of SHAPED_JOINTS) {
        const s = look.jointScale[joint];
        if (!s) continue;
        // 0 is legal (the undead's collapsed forearm is an archetype decision,
        // not a seeded one); anything the SEED produced must be within spread
        if (s[0] === 0) continue;
        expect(s[0], `${id}/${joint}`).toBeGreaterThan(0.8);
        expect(s[0], `${id}/${joint}`).toBeLessThan(1.2);
      }
    }
  });

  it("maps every shipped doc id to a real archetype", () => {
    cover("voxel-studio-core");
    for (const id of SHIPPED_MODEL_DOCS) {
      const key = archetypeForModelDoc(id);
      expect(key, id).not.toBeNull();
      expect(ARCHETYPE_KEYS).toContain(key!);
    }
    expect(archetypeForModelDoc("imported.awing")).toBeNull();
  });
});

describe("the archetype presets are the shipped characters", () => {
  it("round-trips every archetype through the schema unchanged", () => {
    cover("voxel-studio-core");
    for (const key of ARCHETYPE_KEYS) {
      const look = lookFromArchetype(key);
      const parsed = zVoxelLook.safeParse(look);
      expect(parsed.success, key).toBe(true);
      expect(parsed.success && parsed.data).toEqual(look);
    }
  });

  it("the undead preset is a PARAMETER set, not a special case", () => {
    cover("voxel-studio-core");
    const undead = lookFromArchetype("undead");
    expect(undead.props).toEqual([]);
    expect(undead.clipRate).toBeGreaterThan(1); // shambles
    expect(Object.keys(undead.poseBias).length).toBeGreaterThan(0); // leans
  });
});

describe("the pure edit helpers", () => {
  it("never mutate their input", () => {
    cover("voxel-studio-core");
    const before = JSON.stringify(DEFAULT_LOOK);
    withPaletteSlot(DEFAULT_LOOK, "skin", "#010203");
    withProp(DEFAULT_LOOK, "hat", false);
    expect(JSON.stringify(DEFAULT_LOOK)).toBe(before);
  });

  it("writes a palette slot at its documented index", () => {
    cover("voxel-studio-core");
    const look = withPaletteSlot(DEFAULT_LOOK, "accent", "#0a0b0c");
    expect(look.palette[SLOT.accent]).toBe("#0a0b0c");
    expect(look.palette[SLOT.skin]).toBe(DEFAULT_LOOK.palette[SLOT.skin]);
  });

  it("keeps the prop list in the part table's order, whatever order it is edited in", () => {
    cover("voxel-studio-core");
    let look = lookFromArchetype("barbarian");
    for (const p of ["weapon", "hat", "belt", "pack", "pauldron"] as const) {
      look = withProp(look, p, true);
    }
    expect(look.props).toEqual([...PROP_GROUPS]);
  });
});

describe("clip sampling drives both the preview and the bake", () => {
  it("returns a finite pose for every driven joint of every clip", () => {
    cover("voxel-studio-core");
    for (const clip of CLIPS) {
      for (const f of [0, 0.13, 0.5, 0.87, 1]) {
        const pose = sampleClip(clip, clip.duration * f);
        for (const joint of DRIVEN_ROTATION_JOINTS) {
          const r = pose.rot[joint];
          expect(r.every(Number.isFinite), `${clip.name}@${f}/${joint}`).toBe(true);
        }
        expect(pose.hips.every(Number.isFinite), `${clip.name}@${f}`).toBe(true);
      }
    }
  });

  it("loops wrap and one-shots clamp on their final pose", () => {
    cover("voxel-studio-core");
    const idle = findClip("idle")!;
    expect(sampleClip(idle, 0).hips[1]).toBeCloseTo(sampleClip(idle, idle.duration).hips[1], 9);
    const death = findClip("death")!;
    const last = sampleClip(death, death.duration);
    const wayPast = sampleClip(death, death.duration * 10);
    expect(wayPast.rot["hips"][0]).toBeCloseTo(last.rot["hips"][0], 12);
    expect(last.rot["hips"][0]).toBeCloseTo(-Math.PI / 2, 6);
  });

  it("every clipMap state resolves to a baked clip", () => {
    cover("voxel-studio-core");
    for (const state of CLIP_STATES) expect(findClip(state), state).not.toBeNull();
  });
});

describe("the palette texture", () => {
  it("is 16x16 RGBA and carries every slot colour", () => {
    cover("voxel-studio-core");
    const img = paletteRgba(DEFAULT_LOOK);
    expect(img.width).toBe(TEX_EDGE);
    expect(img.height).toBe(TEX_EDGE);
    expect(img.rgba.length).toBe(TEX_EDGE * TEX_EDGE * 4);
    // slot 0 (skin) at texel (0,0)
    const skin = DEFAULT_LOOK.palette[SLOT.skin]!;
    expect(img.rgba[0]).toBe(parseInt(skin.slice(1, 3), 16));
    expect(img.rgba[3]).toBe(255);
  });

  it("is a Uint8Array, so it runs in the browser as well as the bake", () => {
    cover("voxel-studio-core");
    expect(paletteRgba(DEFAULT_LOOK).rgba).toBeInstanceOf(Uint8Array);
  });
});
