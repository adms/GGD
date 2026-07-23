/**
 * GEOSET-ALPHA guard (task #59) — the effect geometry WC3 hid must stay gone.
 *
 * WC3 MDX animates per-geoset visibility with GEOSET ANIMATION alpha tracks
 * (`GEOA`/`KGAO`). glTF has NO visibility animation channel, so the importer
 * skips GEOA outright — every models_report entry records
 * `skipped MDX chunks: ...GEOA...`. Any geoset WC3 showed for a single
 * sequence therefore shipped as permanently-on, motionless geometry.
 *
 * 索隆 (imported.heromusashimiyamoto) was the visible case: MDX geoset 3
 * (`Textures\Tornado2b.blp`, half-width 223 WC3u ≈ 2.6 world units around a
 * 1.7u hero) carries alpha 1.0 ONLY inside the `Attack Walk Stand Spin`
 * sequence and 0.0 in the other eleven. It is stripped by
 * tools/w3x-import/strip_geoset_prims.py and re-added as a real, rotating,
 * cast-gated effect (apps/client/src/vfx/WhirlwindFx.ts).
 *
 * This suite reads the shipped .glb bytes directly (GLB container + JSON
 * chunk — no Babylon needed) and pins three things a future re-bake must not
 * undo: the tornado primitive is gone, its dedicated texture is gone, and the
 * `whirlWindDummy` attachment node + all 12 animations SURVIVE (the VFX layer
 * parents to that joint).
 *
 * TASK #73 SWEEP — two more of the SAME class, found by the GEOA census
 * (tools/w3x-import/geoset_alpha_report.py) + the effect-geoset sweep and
 * stripped via the same strip_geoset_prims.py:
 *
 *   • 邪眼師 飛影 (imported.herohehi) — the SAME katana rig as 索隆 (shares the
 *     `whirlWindDummy` joint). It carried the IDENTICAL Textures\Tornado2b.blp
 *     20-vertex whirlwind, whose KGAO alpha is 0.0 in EVERY sequence yet ships
 *     permanently-on because GEOA is dropped — the user-reported stationary
 *     whirlwind. Stripped; re-addable as a cast-gated VFX at `whirlWindDummy`
 *     (飛影's 邪王炎殺黑龍波 / 黑龍 cast) exactly like 索隆.
 *   • 時空勇者 林克 (imported.linkstik) — a 41-vertex Textures\gutz.blp ground-gore
 *     splat WC3 showed ONLY in the post-death "Decay Flesh"/"Decay Bone"
 *     sequences the clipMap NEVER plays; GEOA dropped ⇒ it shipped stuck to
 *     Link's feet always. Pure effect, no legitimate on-screen use, no re-add.
 *
 * Both blocks below pin the effect prim gone + its texture gone while the
 * skeleton/attachment nodes and EVERY animation (incl. the never-played Decay
 * clips) survive.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const GLB_DIR = join(CONTENT_DIR, "assets/models/imported");

interface GlbJson {
  nodes?: { name?: string }[];
  meshes?: { primitives: { material?: number; attributes: { POSITION: number } }[] }[];
  materials?: { name?: string }[];
  images?: { bufferView: number }[];
  accessors?: { count: number; min?: number[]; max?: number[] }[];
  animations?: { name?: string }[];
}

function readGlbJson(file: string): GlbJson {
  const buf = readFileSync(join(GLB_DIR, file));
  const jsonLen = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf-8")) as GlbJson;
}

/** Widest |x| or |z| over every primitive's POSITION bbox (baked space). */
function footprintHalfWidth(g: GlbJson): number {
  let w = 0;
  for (const mesh of g.meshes ?? []) {
    for (const prim of mesh.primitives) {
      const acc = g.accessors?.[prim.attributes.POSITION];
      if (!acc?.min || !acc.max) continue;
      w = Math.max(w, Math.abs(acc.min[0]!), Math.abs(acc.max[0]!),
                   Math.abs(acc.min[2]!), Math.abs(acc.max[2]!));
    }
  }
  return w;
}

describe("索隆 heromusashimiyamoto — the always-on whirlwind stays stripped", () => {
  const g = readGlbJson("heromusashimiyamoto.glb");

  it("ships 3 primitives — the 20-vertex Tornado2b cross AND the TeamGlow2 quad are gone", () => {
    expect(g.meshes).toHaveLength(1);
    const prims = g.meshes![0]!.primitives;
    // was 4; task #73 then also stripped the 28-vertex TeamGlow2 ground
    // billboard (redundant with ChampionView's own team ring), leaving
    // body + katana. The tornado (#59) was already gone.
    expect(prims).toHaveLength(3);
    // the tornado was the only 20-vertex primitive in the model
    const counts = prims.map((p) => g.accessors![p.attributes.POSITION]!.count);
    expect(counts).not.toContain(20);
    expect(counts).toEqual([604, 186, 89]);
  });

  it("dropped the tornado's dedicated material + texture with it", () => {
    expect(g.materials).toHaveLength(3); // was 4; TeamGlow2's material also went with #73
    expect(g.images).toHaveLength(2);
    // every surviving material is still referenced by a primitive
    const used = new Set(g.meshes![0]!.primitives.map((p) => p.material));
    expect(used.size).toBe(g.materials!.length);
  });

  it("KEEPS the whirlWindDummy attachment joint — WhirlwindFx parents to it", () => {
    const names = (g.nodes ?? []).map((n) => n.name);
    expect(names).toContain("whirlWindDummy");
    expect(g.nodes).toHaveLength(31); // no node was collaterally pruned
  });

  it("keeps every animation the clipMap resolves", () => {
    const names = (g.animations ?? []).map((a) => a.name);
    expect(names).toHaveLength(12);
    // clipMap: idle→Stand, run→Walk, attack→Attack, cast→Spell, death→Death
    for (const clip of ["Stand", "Walk", "Attack", "Spell", "Death"]) {
      expect(names).toContain(clip);
    }
  });

  it("the visible silhouette no longer bulges to tornado width", () => {
    // pre-strip the model reached ±2.60u (tornado); task #73 then also stripped
    // the TeamGlow2 quad, so only body+katana remain (teamGlow now resolves to
    // -1 and the skip below is a harmless no-op — kept for intent).
    const teamGlow = g.materials!.findIndex((m) => m.name === "TeamGlow2");
    let visibleHalfWidth = 0;
    for (const prim of g.meshes![0]!.primitives) {
      if (prim.material === teamGlow) continue;
      const acc = g.accessors![prim.attributes.POSITION]!;
      visibleHalfWidth = Math.max(
        visibleHalfWidth,
        Math.abs(acc.min![0]!), Math.abs(acc.max![0]!),
        Math.abs(acc.min![2]!), Math.abs(acc.max![2]!),
      );
    }
    // 1.25 is the katana geoset — 索隆's three blades held out in bind pose,
    // which IS his silhouette. The tornado reached 2.61.
    expect(visibleHalfWidth).toBeLessThan(1.3);
    expect(footprintHalfWidth(g)).toBeLessThan(1.8); // was 2.61 with the tornado
  });

  it("stays inside the roster height band", () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const prim of g.meshes![0]!.primitives) {
      const acc = g.accessors![prim.attributes.POSITION]!;
      lo = Math.min(lo, acc.min![1]!);
      hi = Math.max(hi, acc.max![1]!);
    }
    expect(hi - lo).toBeCloseTo(1.7, 1); // modelScale/modelBbox fixtures pin 1.7
  });
});

describe("飛影 herohehi — the same Tornado2b whirlwind is stripped (task #73)", () => {
  const g = readGlbJson("herohehi.glb");

  it("ships 3 primitives — the 20-vertex Tornado2b whirlwind is gone", () => {
    expect(g.meshes).toHaveLength(1);
    const prims = g.meshes![0]!.primitives;
    // was 4 (body + katana + 20v tornado + 89v). Same katana rig as 索隆; the
    // tornado (the only 20-vertex prim) is stripped, leaving body + katana.
    expect(prims).toHaveLength(3);
    const counts = prims.map((p) => g.accessors![p.attributes.POSITION]!.count);
    expect(counts).not.toContain(20);
    expect(counts).toEqual([604, 186, 89]);
  });

  it("dropped the Tornado2b material + texture with it", () => {
    expect(g.materials).toHaveLength(3); // was 4
    expect(g.images).toHaveLength(2); // was 3 — the Tornado2b image was swept
    // every surviving material is still referenced by a primitive
    const used = new Set(g.meshes![0]!.primitives.map((p) => p.material));
    expect(used.size).toBe(g.materials!.length);
  });

  it("KEEPS the whirlWindDummy attachment joint (re-addable cast VFX) + all nodes", () => {
    const names = (g.nodes ?? []).map((n) => n.name);
    expect(names).toContain("whirlWindDummy");
    expect(g.nodes).toHaveLength(30); // no node was collaterally pruned
  });

  it("keeps every animation the clipMap resolves", () => {
    const names = (g.animations ?? []).map((a) => a.name);
    expect(names).toHaveLength(9);
    // clipMap: idle→Stand, run→Walk, attack→Attack, cast→Spell, death→Death
    for (const clip of ["Stand", "Walk", "Attack", "Spell", "Death"]) {
      expect(names).toContain(clip);
    }
  });

  it("the visible silhouette no longer bulges to tornado width", () => {
    // pre-strip the model reached ±2.57u (the same Tornado2b as 索隆); only
    // body + katana remain, the katana being the widest surviving geoset.
    expect(footprintHalfWidth(g)).toBeLessThan(1.3); // was 2.57 with the tornado
  });

  it("stays inside the roster height band", () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const prim of g.meshes![0]!.primitives) {
      const acc = g.accessors![prim.attributes.POSITION]!;
      lo = Math.min(lo, acc.min![1]!);
      hi = Math.max(hi, acc.max![1]!);
    }
    expect(hi - lo).toBeCloseTo(1.7, 1); // fullHeight unchanged (tornado sat inside the body Y)
  });
});

describe("林克 linkstik — the always-on decay-gore splat is stripped (task #73)", () => {
  const g = readGlbJson("linkstik.glb");

  it("ships 6 primitives — the 41-vertex gutz decay-gore quad is gone", () => {
    expect(g.meshes).toHaveLength(1);
    const prims = g.meshes![0]!.primitives;
    // was 7; the gutz gore (the only 41-vertex prim) is stripped. Link's held
    // sword (a ~1.05u-wide opaque geoset) is NOT an effect and stays.
    expect(prims).toHaveLength(6);
    const counts = prims.map((p) => g.accessors![p.attributes.POSITION]!.count);
    expect(counts).not.toContain(41);
    expect(counts).toEqual([196, 105, 12, 25, 154, 24]);
  });

  it("dropped the gutz material + texture with it", () => {
    expect(g.materials).toHaveLength(4); // was 5
    expect(g.images).toHaveLength(3); // was 4 — the gutz image was swept
    const used = new Set(g.meshes![0]!.primitives.map((p) => p.material));
    expect(used.size).toBe(g.materials!.length);
  });

  it("KEEPS every node + EVERY animation, including the never-played Decay clips", () => {
    expect(g.nodes).toHaveLength(41); // skeleton/attach nodes untouched
    const names = (g.animations ?? []).map((a) => a.name);
    expect(names).toHaveLength(10);
    // the clipMap-resolved clips survive...
    for (const clip of ["Stand - 1", "Walk", "Attack - 1", "Death", "Stand Hit"]) {
      expect(names).toContain(clip);
    }
    // ...and so do the Decay sequences whose geometry we removed: stripping a
    // primitive must not delete the animation channels that referenced its rig.
    for (const clip of ["Decay Flesh", "Decay Bone"]) {
      expect(names).toContain(clip);
    }
  });

  it("keeps the roster height band (fullHeight unchanged — gore sat at the feet)", () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const prim of g.meshes![0]!.primitives) {
      const acc = g.accessors![prim.attributes.POSITION]!;
      lo = Math.min(lo, acc.min![1]!);
      hi = Math.max(hi, acc.max![1]!);
    }
    expect(hi - lo).toBeCloseTo(1.7, 1); // modelScale/modelBbox fixtures pin 1.7
  });
});
