/**
 * model-facing-measured — THE guard that re-derives every champion model's yaw
 * offset FROM THE SHIPPED .glb BYTES and checks the offset the game actually
 * applies against it.
 *
 * WHY THIS FILE EXISTS (CLAUDE.md 第二守則, 失敗形態 ⑦)
 * ---------------------------------------------------------------------------
 * `glbFacing.test.ts` next door asserts the CONSTANTS ("NATIVE is 0",
 * "IMPORTED is π/2", "IMPORTED − NATIVE is π/2"). Those five cases were all
 * GREEN throughout the incident glbFacing.ts's own header confesses to — the
 * pass where both families rendered 180° backward — because adding 180° to both
 * constants keeps every one of those equalities true. A test that only reads
 * back the number under test cannot notice the number is wrong.
 *
 * So this file never mentions a constant. It opens each real .glb, measures
 * which way the mesh is actually built, computes the offset that geometry
 * REQUIRES, and compares that with what `glbYawOffset()` returns for the
 * shipped doc. Break the offset, break the doc override, or re-export a model
 * with a different bake, and this goes red naming the file.
 *
 * THE LAW BEING CHECKED
 * ---------------------------------------------------------------------------
 *   required offset ≡ φ (mod 360°),  φ = atan2(forward.x, forward.z) on disk
 *
 * derived in glbFacing.ts's header from Babylon's `__root__` (180° about Y
 * combined with scaling.z = −1 ⇒ a pure X mirror) and anchored on two shipped
 * families that disagree by exactly 90°, so it cannot be satisfied by a single
 * global rotation and cannot be fitted to one model.
 *
 * HOW "FORWARD" IS MEASURED WITHOUT TRUSTING NAMES
 * ---------------------------------------------------------------------------
 * A biped's left/right bone pair gives the RIGHT vector, and in a right-handed
 * Y-up frame forward = up × right = (right.z, 0, −right.x). That is sign-exact
 * — but only if the source labelled L and R correctly, and several shipped
 * models DO NOT:
 *
 *   • every WC3 「… Left Ref」/「… Right Ref」 ATTACHMENT node measured here is
 *     mirrored relative to the skeleton in Hblm/H021/goku, so attachment nodes
 *     are excluded outright and only `Bone_*`-style skeleton pairs are used;
 *   • `imported.heropika`'s whole skeleton is L/R-swapped (`Bone_Ear_L` sits on
 *     the geometric right), which is why the chirality cue alone would flag it
 *     as flipped when its tail — and a tail points backwards — puts its forward
 *     squarely at +X with the rest of its family.
 *
 * So a verdict needs BOTH agreement across ≥3 skeleton pairs AND a second,
 * name-independent cue. `heroryuk` is the calibration: it is the one model the
 * retired hardcoded set already called flipped, and the method reproduces that
 * from geometry rather than being fitted to it.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { glbYawOffset, familyGlbYawOffset } from "./glbFacing";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../../..");
const CONTENT = path.join(REPO, "content");
const MODELS_DIR = path.join(CONTENT, "models");

// ---------------------------------------------------------------------------
// minimal GLB reader (no deps, no Babylon): JSON chunk + node hierarchy
// ---------------------------------------------------------------------------

interface Glb {
  json: {
    nodes?: { name?: string; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[];
    skins?: { joints: number[] }[];
  };
}

function readGlb(file: string): Glb | null {
  const buf = fs.readFileSync(file);
  if (buf.length < 12 || buf.readUInt32LE(0) !== 0x46546c67) return null;
  let off = 12;
  let json: Glb["json"] | null = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(buf.subarray(off + 8, off + 8 + len))) as Glb["json"];
    off += 8 + len;
    off += (4 - (off % 4)) % 4;
  }
  return json ? { json } : null;
}

type M16 = number[];
/** Indexed reads on plain arrays: the workspace runs noUncheckedIndexedAccess. */
const mi = (m: M16, i: number): number => m[i] ?? 0;
function mul(a: M16, b: M16): M16 {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += mi(a, k * 4 + r) * mi(b, c * 4 + k);
      o[c * 4 + r] = s;
    }
  return o;
}
function localMatrix(n: NonNullable<Glb["json"]["nodes"]>[number]): M16 {
  if (n.matrix) return [...n.matrix];
  const t = n.translation ?? [0, 0, 0];
  const r4 = n.rotation ?? [0, 0, 0, 1];
  const x = r4[0] ?? 0, y = r4[1] ?? 0, z = r4[2] ?? 0, w = r4[3] ?? 1;
  const s = n.scale ?? [1, 1, 1];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  const m = new Array<number>(16).fill(0);
  const s0 = s[0] ?? 1, s1 = s[1] ?? 1, s2 = s[2] ?? 1;
  m[0] = (1 - 2 * (yy + zz)) * s0; m[1] = 2 * (xy + wz) * s0;   m[2] = 2 * (xz - wy) * s0;
  m[4] = 2 * (xy - wz) * s1;       m[5] = (1 - 2 * (xx + zz)) * s1; m[6] = 2 * (yz + wx) * s1;
  m[8] = 2 * (xz + wy) * s2;       m[9] = 2 * (yz - wx) * s2;     m[10] = (1 - 2 * (xx + yy)) * s2;
  m[12] = t[0] ?? 0; m[13] = t[1] ?? 0; m[14] = t[2] ?? 0; m[15] = 1;
  return m;
}
function worldMatrices(g: Glb): M16[] {
  const nodes = g.json.nodes ?? [];
  const parent = new Array<number>(nodes.length).fill(-1);
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => (parent[c] = i)));
  const W: (M16 | null)[] = new Array(nodes.length).fill(null);
  const calc = (i: number): M16 => {
    const done = W[i];
    if (done) return done;
    const node = nodes[i];
    if (!node) return new Array<number>(16).fill(0);
    const l = localMatrix(node);
    const pi = parent[i] ?? -1;
    const m = pi < 0 ? l : mul(calc(pi), l);
    W[i] = m;
    return m;
  };
  nodes.forEach((_, i) => calc(i));
  return W as M16[];
}

// ---------------------------------------------------------------------------
// cue 1 — left/right skeleton chirality (attachment "Ref" nodes excluded)
// ---------------------------------------------------------------------------

const isRefNode = (n: string) => /\bRef\s*$/i.test(n);
const looksLeft = (n: string) =>
  /Left/i.test(n) || /_L(?=$|[^a-zA-Z])/.test(n) || /^L[A-Z]/.test(n) || /\bL\d*$/.test(n);

function mirrorCandidates(name: string): string[] {
  const out = new Set<string>();
  const add = (s: string) => { if (s !== name) out.add(s); };
  if (/Left/i.test(name)) { add(name.replace(/Left/g, "Right")); add(name.replace(/left/g, "right")); }
  add(name.replace(/_L(?=$|[^a-zA-Z])/g, "_R"));
  add(name.replace(/\bL(?=\d*$)/g, "R"));
  add(name.replace(/^L(?=[A-Z])/, "R"));
  return [...out];
}

interface Chirality { yawDeg: number; n: number; coherence: number }

function chiralityForward(g: Glb): Chirality | null {
  const nodes = g.json.nodes ?? [];
  const W = worldMatrices(g);
  const byName = new Map<string, number>();
  nodes.forEach((n, i) => { if (n.name) byName.set(n.name, i); });
  const samples: { dx: number; dz: number }[] = [];
  const seen = new Set<string>();
  for (const [name, i] of byName) {
    if (isRefNode(name) || !looksLeft(name)) continue;
    for (const rn of mirrorCandidates(name)) {
      const j = byName.get(rn);
      if (j === undefined || j === i) continue;
      const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
      if (seen.has(key)) break;
      const wj = W[j], wi = W[i];
      if (!wj || !wi) break;
      const dx = mi(wj, 12) - mi(wi, 12);
      const dz = mi(wj, 14) - mi(wi, 14);
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) break;
      seen.add(key);
      samples.push({ dx: dx / len, dz: dz / len });
      break;
    }
  }
  if (!samples.length) return null;
  // forward = up × right = (right.z, 0, -right.x)
  let fx = 0, fz = 0;
  for (const s of samples) { fx += s.dz; fz += -s.dx; }
  const n = Math.hypot(fx, fz);
  if (n < 1e-9) return null;
  fx /= n; fz /= n;
  let coh = 0;
  for (const s of samples) coh += s.dz * fx + -s.dx * fz;
  return { yawDeg: (Math.atan2(fx, fz) * 180) / Math.PI, n: samples.length, coherence: coh / samples.length };
}

// ---------------------------------------------------------------------------
// cue 2 — name-independent: a TAIL points backwards; a HEAD leans forwards
// ---------------------------------------------------------------------------

function axialCue(g: Glb): { fx: number; source: string } | null {
  const nodes = g.json.nodes ?? [];
  const W = worldMatrices(g);
  const at = (re: RegExp) => nodes.map((n, i) => [n.name ?? "", i] as const).filter(([n]) => re.test(n) && !isRefNode(n));
  const origin = at(/pelvis|hips|^root$|bone_root/i)[0];
  const originM = origin ? W[origin[1]] : undefined;
  const ox = originM ? mi(originM, 12) : 0;
  for (const [re, sign, label] of [
    [/tail/i, -1, "tail"],
    [/jaw|nose|snout|muzzle/i, +1, "jaw"],
  ] as const) {
    const hits = at(re);
    if (!hits.length) continue;
    let acc = 0;
    for (const [, i] of hits) {
      const m = W[i];
      if (m) acc += mi(m, 12) - ox;
    }
    if (Math.abs(acc) < 1e-3) continue;
    // tail at -X ⇒ forward +X (sign = -1 flips it)
    return { fx: Math.sign(acc) * sign, source: label };
  }
  return null;
}

// ---------------------------------------------------------------------------

const norm360 = (d: number) => ((d % 360) + 360) % 360;
/** Snap a measured yaw to the nearest quarter turn (bakes are axis-aligned). */
const quarter = (d: number) => norm360(Math.round(norm360(d) / 90) * 90);

interface ModelDocLite { id: string; glbPath: string; yawOffsetDeg?: number }

function loadModelDocs(): ModelDocLite[] {
  return fs
    .readdirSync(MODELS_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(MODELS_DIR, f), "utf8")) as ModelDocLite)
    .filter((d) => typeof d.glbPath === "string");
}

/** Docs whose .glb is present AND yields a confident chirality reading. */
function measurable(): { doc: ModelDocLite; chir: Chirality; axial: ReturnType<typeof axialCue> }[] {
  const out: { doc: ModelDocLite; chir: Chirality; axial: ReturnType<typeof axialCue> }[] = [];
  for (const doc of loadModelDocs()) {
    const file = path.join(CONTENT, doc.glbPath);
    if (!fs.existsSync(file)) continue;
    const g = readGlb(file);
    if (!g) continue;
    const chir = chiralityForward(g);
    if (!chir || chir.n < 3 || chir.coherence < 0.99) continue;
    out.push({ doc, chir, axial: axialCue(g) });
  }
  return out;
}

type Measured = { doc: ModelDocLite; chir: Chirality; axial: ReturnType<typeof axialCue> };

/**
 * The yaw a model's own geometry requires — ONE definition, used by every case
 * below so no assertion can quietly disagree with another about what "flipped"
 * means. Chirality fixes the axis; an axial cue (tail/jaw), when the model has
 * one, overrules the sign, because bone NAMES are demonstrably swappable and
 * a tail is not.
 */
function requiredPhi(m: Measured): number {
  const phi = quarter(m.chir.yawDeg);
  if (!m.axial) return phi;
  const chiralFx = Math.sin((phi * Math.PI) / 180);
  if (Math.abs(chiralFx) > 0.5 && Math.sign(chiralFx) !== m.axial.fx) return norm360(phi + 180);
  return phi;
}

describe("champion model facing, re-measured from the shipped .glb (model-facing-measured)", () => {
  it("measures a meaningful number of shipped models (the corpus is not silently empty)", () => {
    cover("model-facing-measured");
    // Guards 失敗形態 ⑥/③: if the reader broke, or content moved, every other
    // case here would vacuously pass over an empty list.
    expect(measurable().length).toBeGreaterThanOrEqual(40);
  });

  it("the SHIPPED offset equals the offset each model's own geometry requires", () => {
    cover("model-facing-measured");
    const wrong: string[] = [];
    for (const m of measurable()) {
      const { doc, chir, axial } = m;
      const phi = requiredPhi(m);
      const applied = norm360((glbYawOffset(doc) * 180) / Math.PI);
      if (applied !== phi) {
        wrong.push(
          `${doc.id} (${doc.glbPath}): geometry requires ${phi}°, game applies ${applied}°` +
            ` [chirality ${chir.yawDeg.toFixed(1)}° n=${chir.n} coh=${chir.coherence.toFixed(3)}` +
            `${axial ? `, ${axial.source} cue fx=${axial.fx}` : ", no axial cue"}]`,
        );
      }
    }
    expect(wrong, `models whose rendered facing disagrees with their mesh:\n${wrong.join("\n")}`).toEqual([]);
  });

  it("reproduces the known-flipped model from geometry alone (method calibration)", () => {
    cover("model-facing-measured");
    // imported.heroryuk is the one model the RETIRED hardcoded set already
    // called flipped. The measurement must rediscover that independently —
    // otherwise this whole file is just reading its own answer back.
    const ryuk = measurable().find((m) => m.doc.id === "imported.heroryuk");
    expect(ryuk, "imported.heroryuk must be measurable or the calibration is vacuous").toBeDefined();
    expect(requiredPhi(ryuk!)).toBe(270);
    // and it must NOT be what the path-prefix family rule alone would give
    expect(norm360((familyGlbYawOffset(ryuk!.doc.glbPath) * 180) / Math.PI)).toBe(90);
  });

  it("the flipped models are carried by content, not by client code", () => {
    cover("model-facing-measured");
    // 第一守則: a mis-baked model must be correctable by editing content/ (a
    // live bind-mount), not by rebuilding and redeploying the client image.
    const flipped = measurable().filter((m) => requiredPhi(m) === 270);
    expect(flipped.length).toBeGreaterThan(0);
    for (const m of flipped) {
      expect(m.doc.yawOffsetDeg, `${m.doc.id} must carry its correction in its doc`).toBe(270);
    }
    // and the client source must no longer hold a per-model exception list
    const src = fs.readFileSync(path.join(HERE, "glbFacing.ts"), "utf8");
    expect(src).not.toMatch(/FLIPPED_IMPORTED_MODEL_KEYS\s*[:=]/);
  });

  it("imported.linkstik — 時空勇者 - 林克's mesh — is one of them", () => {
    cover("model-facing-measured");
    // The regression this file was written for: linkstik measures 180° from
    // its family, is shipped on a real champion, and the retired hardcoded set
    // did not list it. Pinned by id so a silent revert cannot pass quietly.
    const link = measurable().find((m) => m.doc.id === "imported.linkstik");
    expect(link, "imported.linkstik must stay measurable").toBeDefined();
    expect(requiredPhi(link!)).toBe(270);
    expect(norm360((glbYawOffset(link!.doc) * 180) / Math.PI)).toBe(270);
  });

  it("heropika keeps the family default despite reading flipped by bone names", () => {
    cover("model-facing-measured");
    // The counter-example that keeps the method honest: heropika's SKELETON is
    // L/R-swapped, so chirality alone says 270. Its tail (tails point backwards)
    // says +X. It must end up on the family default, i.e. no doc override.
    const pika = loadModelDocs().find((d) => d.id === "imported.heropika");
    expect(pika).toBeDefined();
    expect(pika!.yawOffsetDeg).toBeUndefined();
    expect(norm360((glbYawOffset(pika!) * 180) / Math.PI)).toBe(90);
  });
});
