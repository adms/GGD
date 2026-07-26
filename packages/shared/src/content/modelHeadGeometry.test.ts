/**
 * HEAD-GEOMETRY guard (task #267) — a champion must actually HAVE a head.
 *
 * ---------------------------------------------------------------------------
 * WHY THE OLD GUARDS COULD NOT SEE THIS
 * ---------------------------------------------------------------------------
 * 孫悟空 shipped headless for months while three separate audits called him
 * clean. Every assertion in that area is an ABSENCE assertion — "no `TeamGlow*`
 * material", "no stray primitive", "full bbox under the cap". A missing part
 * makes all of them MORE true. Task #73 was scoped to "sweep un-merged
 * sphere/orb attachment geometry", read `sphere` as "round stray billboard",
 * deleted 36 team-glow quads and closed green; the thing it was meant to find —
 * a body part living in a SECOND FILE (`Gokuhead.mdx`, hung on the body by the
 * object-data `Asph` ability `A0MI`) — was never in any file it looked at.
 *
 * So this suite asserts PRESENCE, from geometry the renderer actually consumes:
 *
 *   H1  head-bone coverage — the fraction of skinned vertices weighted to the
 *       rig's own head bone. Measured across the shipped roster: minimum
 *       `imported.ma` 0.103, median ~0.27, 孫悟空 after the merge 0.257.
 *       孫悟空 BEFORE the merge was 20/866 = 0.023 — only a 37-vertex face
 *       skin, no skull. Floor 0.06 sits 1.7x under the lowest passing model
 *       and 2.6x over the defect.
 *   H2  headroom — how far the mesh reaches ABOVE its own head bone, as a
 *       fraction of model height. A head occupies real height above the joint
 *       it hangs from: roster minimum 0.027 (`imported.herooichi`), median
 *       ~0.17, 孫悟空 after 0.209. 孫悟空 BEFORE was (1.7424−1.7334)/1.745 =
 *       0.005 — the rig said "head here", the geometry stopped at the collar.
 *   H3  the #267 merge itself is pinned by count, by bone and by LOD tier, so
 *       a re-bake that silently drops the attachment fails loudly.
 *
 * Both H1 and H2 are pure geometry — no material names, no file sizes, nothing
 * that a rename or a re-export can quietly satisfy. Verified to BITE: reverting
 * `content/assets/models/imported/goku.glb` to its pre-#267 bytes fails H1
 * (0.023 < 0.06), H2 (0.005 < 0.02) and all three H3 cases.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { cover } from "../../testkit/cover";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");

/** roster + families come from the sibling bbox fixture, so the sets agree */
interface Champ {
  modelKey: string;
  glbPath: string;
  family: string;
  empty: boolean;
}
const fx = JSON.parse(
  readFileSync(join(HERE, "modelBbox.fixture.json"), "utf8"),
) as { champions: Champ[] };
const roster = fx.champions.filter((c) => !c.empty);

/**
 * Rigs whose head rides a bone that is NOT called "head". Each was confirmed to
 * have a real head by the #267 top-slice sweep (the topmost 18% of the mesh is
 * carried by ONE bone that is not a spine/torso bone):
 *   ye-wuqi1  `bone_Box09` 604v · gumdam `Bone02`-family · lgcr `bone_n04` 300v
 *   luffe     `Bone04` 339v
 * Plus two non-character rigs that are props, not champions with faces:
 *   horsehead / heroshanawingsmall (a mount head prop and a wing prop).
 * Listing them EXPLICITLY is the point: a NEW model with no head bone fails
 * instead of being silently skipped, which is exactly how #73 lost 孫悟空.
 */
const NO_HEAD_BONE = new Set([
  "imported.ye-wuqi1",
  "imported.gumdam",
  "imported.lgcr",
  "imported.luffe",
  "imported.horsehead",
  "imported.heroshanawingsmall",
]);

const MIN_HEAD_WEIGHT_FRACTION = 0.06;
const MIN_HEADROOM_FRACTION = 0.02;

// ---------------------------------------------------------------------------
// minimal GLB reader (JSON + BIN chunk) — no Babylon, no loaders
// ---------------------------------------------------------------------------
interface Accessor {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
}
interface Gltf {
  nodes?: { name?: string; translation?: number[]; children?: number[] }[];
  meshes?: { primitives: { attributes: Record<string, number>; indices?: number }[] }[];
  accessors?: Accessor[];
  bufferViews?: { byteOffset?: number; byteLength: number; byteStride?: number }[];
  skins?: { joints: number[] }[];
}

function readGlb(rel: string): { gltf: Gltf; bin: Buffer } {
  const buf = readFileSync(join(CONTENT_DIR, rel));
  let off = 12;
  let gltf: Gltf | null = null;
  let bin = Buffer.alloc(0);
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    off += 8 + len;
    if (type === 0x4e4f534a) gltf = JSON.parse(chunk.toString("utf8")) as Gltf;
    else if (type === 0x004e4942) bin = chunk;
  }
  if (!gltf) throw new Error(`${rel}: no JSON chunk`);
  return { gltf, bin };
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** Read an accessor as numbers (handles the byte widths these glbs use). */
function readAccessor(g: Gltf, bin: Buffer, index: number): number[] {
  const acc = g.accessors![index]!;
  const view = g.bufferViews![acc.bufferView]!;
  const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const n = COMPONENTS[acc.type]!;
  const out: number[] = [];
  const size =
    acc.componentType === 5126 || acc.componentType === 5125
      ? 4
      : acc.componentType === 5122 || acc.componentType === 5123
        ? 2
        : 1;
  const stride = view.byteStride && view.byteStride > 0 ? view.byteStride : size * n;
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < n; c++) {
      const at = start + i * stride + c * size;
      if (acc.componentType === 5126) out.push(bin.readFloatLE(at));
      else if (acc.componentType === 5125) out.push(bin.readUInt32LE(at));
      else if (acc.componentType === 5123) out.push(bin.readUInt16LE(at));
      else if (acc.componentType === 5122) out.push(bin.readInt16LE(at));
      else out.push(bin.readUInt8(at));
    }
  }
  return out;
}

/** the rig's head BONE — never the "Head - Ref"/"OverHead Ref" attach markers */
function isHeadBone(name: string | undefined): boolean {
  const n = (name ?? "").toLowerCase();
  if (n.includes("ref") || n.includes("overhead")) return false;
  return n.includes("head") || n.includes("helmet");
}

/** bind-pose world Y of every node (these rigs are pure translation chains) */
function worldY(g: Gltf): number[] {
  const nodes = g.nodes ?? [];
  const parent = new Map<number, number>();
  nodes.forEach((n, i) => n.children?.forEach((c) => parent.set(c, i)));
  const out = new Array<number>(nodes.length).fill(Number.NaN);
  const solve = (i: number, depth = 0): number => {
    if (!Number.isNaN(out[i]!)) return out[i]!;
    const t = nodes[i]!.translation?.[1] ?? 0;
    const p = parent.get(i);
    out[i] = t + (p !== undefined && depth < 64 ? solve(p, depth + 1) : 0);
    return out[i]!;
  };
  for (let i = 0; i < nodes.length; i++) solve(i);
  return out;
}

interface HeadFacts {
  headBone: string | null;
  headWeightFraction: number | null;
  headroomFraction: number | null;
  meshTopY: number;
  meshBottomY: number;
  primitives: { verts: number; tris: number; topY: number; ridesHeadBone: boolean }[];
}

function headFacts(rel: string): HeadFacts {
  const { gltf: g, bin } = readGlb(rel);
  const ys = worldY(g);
  const joints = g.skins?.[0]?.joints ?? [];
  const headJointSlots = new Set<number>();
  let headBone: string | null = null;
  let headBoneY = -Infinity;
  joints.forEach((nodeIndex, slot) => {
    const name = g.nodes?.[nodeIndex]?.name;
    if (!isHeadBone(name)) return;
    headJointSlots.add(slot);
    if (ys[nodeIndex]! > headBoneY) {
      headBoneY = ys[nodeIndex]!;
      headBone = name ?? null;
    }
  });

  let top = -Infinity;
  let bottom = Infinity;
  let totalVerts = 0;
  let headVerts = 0;
  const primitives: HeadFacts["primitives"] = [];
  for (const mesh of g.meshes ?? []) {
    for (const prim of mesh.primitives) {
      const pos = g.accessors![prim.attributes["POSITION"]!]!;
      const pTop = pos.max?.[1] ?? -Infinity;
      top = Math.max(top, pTop);
      bottom = Math.min(bottom, pos.min?.[1] ?? Infinity);
      let rides = false;
      if (prim.attributes["JOINTS_0"] !== undefined && headJointSlots.size > 0) {
        const js = readAccessor(g, bin, prim.attributes["JOINTS_0"]!);
        const ws = readAccessor(g, bin, prim.attributes["WEIGHTS_0"]!);
        totalVerts += pos.count;
        for (let v = 0; v < pos.count; v++) {
          for (let k = 0; k < 4; k++) {
            if (headJointSlots.has(js[v * 4 + k]!) && ws[v * 4 + k]! > 0.01) {
              headVerts++;
              rides = true;
              break;
            }
          }
        }
      }
      primitives.push({
        verts: pos.count,
        tris: prim.indices === undefined ? 0 : g.accessors![prim.indices]!.count / 3,
        topY: pTop,
        ridesHeadBone: rides,
      });
    }
  }
  const height = top - bottom;
  return {
    headBone,
    headWeightFraction: totalVerts > 0 ? headVerts / totalVerts : null,
    headroomFraction: headBone !== null && height > 0 ? (top - headBoneY) / height : null,
    meshTopY: top,
    meshBottomY: bottom,
    primitives,
  };
}

// ---------------------------------------------------------------------------

describe("every champion carries real head geometry (model-head-geometry)", () => {
  it("has a roster to check and knows which rigs legitimately lack a head bone", () => {
    cover("model-head-geometry");
    expect(roster.length).toBeGreaterThan(40);
    // no dead exemptions: every listed key is a real champion model
    for (const mk of NO_HEAD_BONE) {
      expect(
        roster.some((c) => c.modelKey === mk),
        `${mk} is exempted from the head-bone check but is not in the roster`,
      ).toBe(true);
    }
  });

  it("weights a real share of every rig's vertices to its head bone", () => {
    cover("model-head-geometry");
    const offenders: string[] = [];
    for (const c of roster) {
      const facts = headFacts(c.glbPath);
      if (facts.headBone === null) {
        if (!NO_HEAD_BONE.has(c.modelKey)) {
          offenders.push(`${c.modelKey}: no head bone in the skin and not on the documented list`);
        }
        continue;
      }
      const f = facts.headWeightFraction ?? 0;
      if (f < MIN_HEAD_WEIGHT_FRACTION) {
        offenders.push(
          `${c.modelKey}: only ${(f * 100).toFixed(1)}% of vertices ride '${facts.headBone}' ` +
            `(floor ${MIN_HEAD_WEIGHT_FRACTION * 100}%) — the head is probably a separate, ` +
            `un-merged file (see tools/w3x-import/merge_sphere_attachments.py, task #267)`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  it("reaches above its own head bone — geometry, not just a rig marker", () => {
    cover("model-head-geometry");
    const offenders: string[] = [];
    for (const c of roster) {
      const facts = headFacts(c.glbPath);
      if (facts.headroomFraction === null) continue;
      if (facts.headroomFraction < MIN_HEADROOM_FRACTION) {
        offenders.push(
          `${c.modelKey}: mesh top ${facts.meshTopY.toFixed(4)} is only ` +
            `${(facts.headroomFraction * 100).toFixed(1)}% of model height above bone ` +
            `'${facts.headBone}' (floor ${MIN_HEADROOM_FRACTION * 100}%) — the rig says a head ` +
            `belongs there and the geometry stops short`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("孫悟空's head stays merged into the body glb (model-head-goku-merge)", () => {
  // Gokuhead.mdx, exactly: 268 vertices / 332 triangles, skinned rigidly to the
  // body's `Head` bone by tools/w3x-import/merge_sphere_attachments.py.
  it("ships the Gokuhead primitive at full resolution, riding the Head bone", () => {
    cover("model-head-goku-merge");
    const facts = headFacts("assets/models/imported/goku.glb");
    expect(facts.headBone).toBe("Head");
    const head = facts.primitives.find((p) => p.verts === 268 && p.tris === 332);
    expect(head, "the 268v/332tri Gokuhead primitive is gone from goku.glb").toBeTruthy();
    expect(head!.ridesHeadBone, "the head primitive is not skinned to `Head`").toBe(true);
    // it must be the TOP of the silhouette, not buried inside the torso
    expect(head!.topY).toBeCloseTo(facts.meshTopY, 5);
    // the pre-#267 file measured 0.023 / 0.005 on these two axes
    expect(facts.headWeightFraction!).toBeGreaterThan(0.2);
    expect(facts.headroomFraction!).toBeGreaterThan(0.15);
  });

  /**
   * The rest of the #267 census stays RECOVERABLE and stays UN-baked. #73 lost
   * 孫悟空 because the evidence it needed lived in files nobody was looking at;
   * these three assertions keep the remaining candidates from evaporating the
   * same way, and keep the one deliberate non-merge from happening by accident.
   */
  it("keeps the un-merged sphere candidates on disk and out of the body", () => {
    cover("model-head-sphere-census");
    // the deferred first-tier candidates still exist with real geometry, so the
    // follow-up (mdl-267d) has something to look at
    for (const [file, minTris] of [
      ["gokuhead", 300],
      ["goku3head", 1200],
      ["herofatezemberform", 400],
      ["1hswd-01", 300],
    ] as const) {
      const facts = headFacts(`assets/models/imported/${file}.glb`);
      const tris = facts.primitives.reduce((n, p) => n + p.tris, 0);
      expect(tris, `${file}.glb lost its geometry`).toBeGreaterThanOrEqual(minTris);
    }
    // …and 超級賽亞人's 1146-vertex head is NOT also baked onto the same body:
    // both A0MI and A0MJ hang off `origin` of goku.mdx, so enabling both would
    // give 孫悟空 two overlapping heads. The SSJ3 form belongs to #119/#249.
    const goku = headFacts("assets/models/imported/goku.glb");
    expect(goku.primitives.some((p) => p.verts === 1146)).toBe(false);
    expect(
      goku.primitives.filter((p) => p.ridesHeadBone).length,
      "goku.glb should carry exactly one head-bone primitive plus its face skin",
    ).toBeLessThanOrEqual(2);
  });

  it("keeps the head in BOTH LOD tiers (#115), so distance never decapitates him", () => {
    cover("model-head-goku-merge");
    for (const tier of ["goku-mid", "goku-small"]) {
      const facts = headFacts(`assets/models/imported/${tier}.glb`);
      const crown = facts.primitives.find((p) => p.topY === facts.meshTopY);
      expect(crown, `${tier}: no primitive reaches the top of the model`).toBeTruthy();
      expect(crown!.ridesHeadBone, `${tier}: the topmost primitive is not on the head bone`).toBe(
        true,
      );
      expect(crown!.tris, `${tier}: the head decimated away to nothing`).toBeGreaterThan(30);
    }
  });
});
