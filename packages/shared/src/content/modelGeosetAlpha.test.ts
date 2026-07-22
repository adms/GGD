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

  it("ships 4 primitives — the 20-vertex Tornado2b quad cross is gone", () => {
    expect(g.meshes).toHaveLength(1);
    const prims = g.meshes![0]!.primitives;
    expect(prims).toHaveLength(4);
    // the tornado was the only 20-vertex primitive in the model
    const counts = prims.map((p) => g.accessors![p.attributes.POSITION]!.count);
    expect(counts).not.toContain(20);
    expect(counts).toEqual([604, 186, 28, 89]);
  });

  it("dropped the tornado's dedicated material + texture with it", () => {
    expect(g.materials).toHaveLength(4);
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
    // pre-strip the model reached ±2.60u; the only thing left past the body is
    // the TeamGlow2 quad, which renders fully transparent (baseColorFactor a=0)
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
