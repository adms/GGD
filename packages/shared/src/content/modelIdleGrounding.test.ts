/**
 * IDLE-GROUNDING guard (task #162) — a champion must not fly up while standing.
 *
 * ChampionView.tryUpgradeToGlb grounds every imported rig ONCE, in BIND pose:
 * it height-normalises the model, measures the skinned bounding box, and shifts
 * `glbRoot.y = -min.y` so the feet sit on the arena floor (y=0). It THEN plays
 * the idle clip (looping). Grounding therefore assumes the idle pose ≈ the bind
 * pose. If the idle clip carries a SKELETON-ROOT translation whose Y climbs
 * above the bind value, the whole figure lifts off the floor the moment the clip
 * starts — the reported「站立時飛上天」.
 *
 * 黑崎一護 (imported.heroichigo) was the case: its root joint `bone_waist`
 * (node 39, parent of the legs/chest/arms/head) has bind Y = +1.1460, but the
 * four STAND-POSE clips pinned it to a single corrupt keyframe at +6.3865 — a
 * +5.24 native-unit lift (≈ +4.85 WORLD units at the model's ~0.925 normalise
 * scale). tools/w3x-import/flatten_root_float.py restored those keyframes to the
 * grounded bind translation. A roster-wide sweep (float_sweep_162.py) confirmed
 * heroichigo was the ONLY champion with this defect.
 *
 * This suite reads the shipped .glb bytes directly (GLB container + JSON + BIN
 * chunk — no Babylon) and, for every stand/idle clip, reads the root joint's
 * translation track and pins its Y to the grounded bind value (no net upward
 * drift beyond a small epsilon). It also pins the structural invariants a
 * re-bake must preserve (node/animation/mesh counts, the root joint, the
 * clipMap-resolved clip). A future re-bake that reintroduces the float — or
 * drops the fix — fails loudly here.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const GLB_DIR = join(CONTENT_DIR, "assets/models/imported");
const MODELS_DIR = join(CONTENT_DIR, "models");

interface GlbAccessor {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
}
interface GlbBufferView {
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}
interface GlbChannel {
  sampler: number;
  target: { node: number; path: string };
}
interface GlbSampler {
  input: number;
  output: number;
}
interface GlbAnimation {
  name?: string;
  channels: GlbChannel[];
  samplers: GlbSampler[];
}
interface GlbJson {
  nodes: { name?: string; translation?: number[]; children?: number[] }[];
  meshes?: unknown[];
  skins?: { joints: number[] }[];
  accessors: GlbAccessor[];
  bufferViews: GlbBufferView[];
  animations?: GlbAnimation[];
}

/** Parse a GLB into its JSON dict plus the byte offset where BIN data starts. */
function readGlb(file: string): { json: GlbJson; buf: Buffer; binStart: number } {
  const buf = readFileSync(join(GLB_DIR, file));
  let off = 12; // 12-byte header
  let json: GlbJson | null = null;
  let binStart = -1;
  const len = buf.readUInt32LE(8);
  while (off < len) {
    const chunkLen = buf.readUInt32LE(off);
    const chunkType = buf.readUInt32LE(off + 4);
    const dataStart = off + 8;
    if (chunkType === 0x4e4f534a) {
      json = JSON.parse(buf.subarray(dataStart, dataStart + chunkLen).toString("utf-8"));
    } else if (chunkType === 0x004e4942) {
      binStart = dataStart;
    }
    off = dataStart + chunkLen;
  }
  if (!json || binStart < 0) throw new Error(`bad GLB ${file}`);
  return { json, buf, binStart };
}

/** Read a VEC3-float accessor's keyframe values from the BIN chunk. */
function readVec3(g: { json: GlbJson; buf: Buffer; binStart: number }, accIdx: number): number[][] {
  const acc = g.json.accessors[accIdx]!;
  expect(acc.type).toBe("VEC3");
  expect(acc.componentType).toBe(5126); // FLOAT
  const bv = g.json.bufferViews[acc.bufferView]!;
  const base = g.binStart + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = bv.byteStride ?? 12;
  const out: number[][] = [];
  for (let i = 0; i < acc.count; i++) {
    const o = base + i * stride;
    out.push([g.buf.readFloatLE(o), g.buf.readFloatLE(o + 4), g.buf.readFloatLE(o + 8)]);
  }
  return out;
}

/** The skeleton root joint = the joint whose subtree contains the most joints. */
function rootJoint(json: GlbJson): number {
  const joints = new Set<number>();
  for (const s of json.skins ?? []) for (const j of s.joints) joints.add(j);
  const parent = new Array(json.nodes.length).fill(-1);
  json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => (parent[c] = i)));
  const children: number[][] = json.nodes.map(() => []);
  parent.forEach((p, i) => p >= 0 && children[p]!.push(i));
  const depth = (i: number) => {
    let d = 0;
    while (parent[i] >= 0) {
      i = parent[i]!;
      d++;
    }
    return d;
  };
  const subtreeJoints = (r: number) => {
    let c = 0;
    const st = [r];
    while (st.length) {
      const x = st.pop()!;
      if (joints.has(x)) c++;
      st.push(...children[x]!);
    }
    return c;
  };
  let best = -1;
  let bestKey = [-1, 1];
  for (const j of joints) {
    const key = [subtreeJoints(j), -depth(j)];
    if (key[0]! > bestKey[0]! || (key[0] === bestKey[0] && key[1]! > bestKey[1]!)) {
      best = j;
      bestKey = key;
    }
  }
  return best;
}

/** The root translation track's Y keyframes for a clip (empty ⇒ node stays at bind). */
function rootYTrack(
  g: { json: GlbJson; buf: Buffer; binStart: number },
  clipName: string,
  root: number,
): number[] {
  const anim = (g.json.animations ?? []).find((a) => a.name === clipName);
  if (!anim) throw new Error(`clip '${clipName}' not found`);
  const ch = anim.channels.find((c) => c.target.path === "translation" && c.target.node === root);
  if (!ch) return []; // no root translation ⇒ stays at bind (grounded)
  const out = readVec3(g, anim.samplers[ch.sampler]!.output);
  return out.map((v) => v[1]!);
}

function idleClipFromDoc(modelId: string): string {
  const doc = JSON.parse(readFileSync(join(MODELS_DIR, `${modelId}.json`), "utf-8"));
  return doc.clipMap.idle as string;
}

/**
 * Every stand/idle-pose clip must hold the skeleton root within a small band of
 * its grounded bind Y — no net upward drift. The corrupt heroichigo float was
 * +5.24 native units above bind, so this epsilon (0.15u) cleanly separates a
 * grounded pose (and a normal idle bob) from the defect.
 */
const EPS = 0.15;

describe("黑崎一護 heroichigo — the idle 'stand' clip no longer flies up (task #162)", () => {
  const g = readGlb("heroichigo.glb");
  const root = rootJoint(g.json);
  const bindY = g.json.nodes[root]!.translation![1]!;

  it("root joint is bone_waist with a grounded bind height", () => {
    cover("model-idle-grounded");
    expect(g.json.nodes[root]!.name).toBe("bone_waist");
    expect(bindY).toBeCloseTo(1.146, 2);
  });

  it("clipMap.idle resolves to 'stand', and that clip is grounded", () => {
    cover("model-idle-grounded");
    const idle = idleClipFromDoc("imported.heroichigo");
    expect(idle).toBe("stand");
    const ys = rootYTrack(g, idle, root);
    expect(ys.length).toBeGreaterThan(0);
    for (const y of ys) {
      expect(y - bindY).toBeLessThanOrEqual(EPS); // NO upward drift
      expect(y).toBeCloseTo(bindY, 3); // flattened exactly to the grounded value
    }
    // and nowhere near the corrupt +6.3865 float that shot it into the sky
    expect(Math.max(...ys)).toBeLessThan(2.0);
  });

  it("ALL four stand-pose clips are grounded (idle, hurt, and both alternates)", () => {
    cover("model-idle-grounded");
    for (const clip of ["stand", "stand 2", "stand alternate", "stand alternate 2"]) {
      const ys = rootYTrack(g, clip, root);
      expect(ys.length).toBeGreaterThan(0);
      const peak = Math.max(...ys);
      const trough = Math.min(...ys);
      expect(peak - bindY).toBeLessThanOrEqual(EPS); // no float
      expect(peak - trough).toBeLessThanOrEqual(EPS); // static grounded pose, no net drift
    }
  });

  it("the fix touched ONLY the stand-pose clips — motion clips are unchanged", () => {
    cover("model-idle-grounded");
    // Walk sits forward-crouched at +1.270; death/attacks dip below bind; the
    // 'dissipate' death-poof still rises (intended, and never played as idle).
    expect(Math.max(...rootYTrack(g, "Walk", root))).toBeCloseTo(1.27, 2);
    expect(Math.min(...rootYTrack(g, "death", root))).toBeLessThan(bindY);
    expect(Math.max(...rootYTrack(g, "dissipate", root))).toBeGreaterThan(5); // untouched
  });

  it("keeps every node, skin and animation a re-bake must preserve", () => {
    cover("model-idle-grounded");
    expect(g.json.nodes).toHaveLength(62);
    expect(g.json.meshes).toHaveLength(1);
    expect(g.json.skins).toHaveLength(1);
    const names = (g.json.animations ?? []).map((a) => a.name);
    expect(names).toHaveLength(19);
    // clipMap: idle/hurt→stand, run→Walk, attack/cast→Attack - 1, death→death
    for (const clip of ["stand", "Walk", "Attack - 1", "death"]) {
      expect(names).toContain(clip);
    }
  });
});

/**
 * Roster-wide backstop: NO active champion glb may ship an idle/stand clip whose
 * skeleton root drifts upward off the grounded start. This is the general form of
 * the heroichigo defect — it would catch a future re-import of ANY champion that
 * reintroduced a floating idle. (Effect/projectile/summon models outside the
 * champion roster are excluded — some legitimately float.)
 */
describe("roster idle-grounding sweep (task #162) — no champion floats at rest", () => {
  // imported.* champion model stems (content/champions modelKeys). Stand-ins use
  // procedural voxel blocks (no glb) and cannot float.
  const ROSTER = `bulbasaur cloud collision fox fox2 goku gumdam herobiggon herobuu
    herofate herogirl herohanzouhattori herohehi herohimurakenshin heroichigo
    herokunoichi herokyo herolight herolingtong heromiku heromusashimiyamoto herooichi
    heropikachu herorider herosaber herosasuke herosephiroth heroshana herotoshiiemaeda
    heroxelloss horse hzyn kikyou lgcr linainvers linkstik long lubu luffe ma mfls negi
    niya picacugy pika rabbit renaryugu2 sd2 sesshomaru ye-wuqi1 zy3`
    .split(/\s+/)
    .filter(Boolean);

  // Max NATIVE-unit upward drift a champion root may show at rest. A real idle
  // knee-bend bob is < ~0.3 native units; the heroichigo defect was +5.24. Most
  // champion rigs normalise to ~1.7u tall, so 0.4 native stays well under a
  // visible ~0.4u world float while clearing every legitimate bob.
  const MAX_NATIVE_DRIFT = 0.4;

  for (const stem of ROSTER) {
    it(`${stem} — idle root does not drift up`, () => {
      cover("model-idle-grounded-sweep");
      const g = readGlb(`${stem}.glb`);
      if (!g.json.skins?.length || !g.json.animations?.length) return;
      const root = rootJoint(g.json);
      if (root < 0) return;
      const idle = idleClipFromDoc(`imported.${stem}`);
      const anim = g.json.animations.find((a) => a.name?.toLowerCase() === idle.toLowerCase());
      if (!anim) return; // idle resolved by runtime fuzzy match; skip if no exact clip
      const bindY = g.json.nodes[root]!.translation?.[1] ?? 0;
      const ys = rootYTrack(g, anim.name!, root);
      if (ys.length === 0) return; // no root translation track ⇒ stays at bind (grounded)
      const drift = Math.max(...ys) - Math.min(bindY, ys[0]!);
      expect(drift).toBeLessThan(MAX_NATIVE_DRIFT);
    });
  }
});
