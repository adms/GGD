/**
 * GH#742 — geosets WC3 swapped out on TRANSFORM ship drawn in BOTH forms.
 *
 * WC3 gates per-geoset visibility with GEOA/KGAO alpha; #59 established that
 * mdx→glb throws that channel away. For a transform model that is not "one
 * stuck prop" but "two whole bodies at once": 黑崎一護 wears his 死霸裝
 * (540v+134v) and his 卍解 斬月+coat (739v, its own material) simultaneously.
 *
 * WHAT THIS GUARD IS FOR. The fix speaks `model@1.hiddenPrimitives`, which is
 * an INDEX list — and the schema comment for that field spells out the cost of
 * indices: "a re-extraction can renumber them, and a wrong index either misses
 * (gore returns) or hits the body (champion vanishes)". So the numbers the
 * content fix will carry have to be pinned against the real shipped bytes, in
 * every LOD tier, before anyone writes them into a doc.
 *
 * Source of the numbers: `tools/w3x-import/geoset_alpha_report.py --fixture`,
 * which derives them from the MDX's KGAO tracks (⛔ not from vertex counts, ⛔
 * not from bbox guesses). Its own two-direction calibration is `--selftest`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const FIXTURE = join(REPO, "tools/w3x-import/geoset_form_gating.fixture.json");
const GLB_DIR = join(REPO, "content/assets/models/imported");

type FormSplit = { base: number[]; alternate: number[]; both: number[] };
type Entry = {
  forms: FormSplit;
  geosets: Record<string, { geoset: number; verts: number; material: number; form: string }>;
  lod_prim_vertex_counts: Record<string, number[]>;
  champion_ids: string[];
};

const fixture = JSON.parse(readFileSync(FIXTURE, "utf-8")) as { models: Record<string, Entry> };

/** POSITION accessor count + material index for every primitive of a .glb. */
function readPrims(file: string): { verts: number; material: number }[] {
  const buf = readFileSync(join(GLB_DIR, file));
  let off = 12;
  let gltf: any;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    off += 8;
    if (type === 0x4e4f534a) {
      gltf = JSON.parse(buf.subarray(off, off + len).toString("utf-8"));
      break;
    }
    off += len;
  }
  return gltf.meshes.flatMap((m: any) =>
    m.primitives.map((p: any) => ({
      verts: gltf.accessors[p.attributes.POSITION].count,
      material: p.material ?? -1,
    })),
  );
}

describe("GH#742 transform models carry two bodies — pin the indices the fix will use", () => {
  const entries = Object.entries(fixture.models);

  it("the census found at least one transform model (⛔ an empty fixture proves nothing)", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)("%s — every shipped LOD tier still has the recorded prims", (_glb, e) => {
    for (const [tier, want] of Object.entries(e.lod_prim_vertex_counts)) {
      expect(readPrims(tier).map((p) => p.verts), `${tier} renumbered/rebaked`).toEqual(want);
    }
  });

  it.each(entries)("%s — the two forms partition the prims, disjoint and complete", (glb, e) => {
    const { base, alternate, both } = e.forms;
    const all = [...base, ...alternate, ...both].sort((a, b) => a - b);
    // disjoint: a primitive belongs to exactly one bucket
    expect(new Set(all).size).toBe(all.length);
    // complete: every primitive the glb actually ships is accounted for
    expect(all).toEqual(readPrims(glb).map((_p, i) => i));
    // non-degenerate: if either side were empty there would be nothing to gate,
    // and `hiddenPrimitives` for the other form would hide the whole champion.
    expect(base.length, "base form has no body").toBeGreaterThan(0);
    expect(alternate.length, "alternate form has no body").toBeGreaterThan(0);
  });

  it.each(entries)("%s — each form-exclusive prim still holds its recorded geometry", (glb, e) => {
    const prims = readPrims(glb);
    for (const [idx, g] of Object.entries(e.geosets)) {
      const prim = prims[Number(idx)];
      expect(prim, `prim[${idx}] of ${glb} vanished`).toBeDefined();
      expect(prim?.verts, `prim[${idx}] of ${glb}`).toBe(g.verts);
      // material is an INDEPENDENT axis from vertex count: 一護's 卍解 body is
      // the only prim on mat1, so a rebake that preserved counts but reordered
      // the prims is still caught here.
      expect(prim?.material, `prim[${idx}] material of ${glb}`).toBe(g.material);
    }
  });

  /**
   * ⭐ The fixture states each prim's form TWICE — once as a bucket in `forms`,
   * once as `geosets[i].form`. Two records of one fact drift (第〇·四守則), and
   * drift here is the expensive kind: `hiddenPrimitives` built from the wrong
   * one hides the form you meant to KEEP, i.e. the champion loses his body.
   *
   * ⚠️ Written because the first version of this file did NOT cross-check them:
   * swapping 一護's base/alternate buckets in the fixture left all four tests
   * green (both records stayed internally consistent). A guard whose mutation
   * does not bite is worse than none.
   */
  it.each(entries)("%s — the two records of 'which form owns this prim' agree", (_glb, e) => {
    for (const [idx, g] of Object.entries(e.geosets)) {
      const bucket = e.forms[g.form as "base" | "alternate"];
      expect(bucket, `geosets[${idx}].form = ${g.form} is not a form bucket`).toBeDefined();
      expect(bucket, `prim[${idx}] is ${g.form} per geosets but not in forms.${g.form}`)
        .toContain(Number(idx));
    }
    // and nothing in a form bucket may be missing its geometry record
    for (const side of ["base", "alternate"] as const) {
      for (const idx of e.forms[side]) {
        expect(e.geosets[String(idx)]?.form, `forms.${side} lists prim[${idx}]`).toBe(side);
      }
    }
  });
});
