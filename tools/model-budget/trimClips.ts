/**
 * trimClips — the ANIMATION-PRUNE stage of the offline optimiser.
 *
 * ─ WHY THIS EXISTS ───────────────────────────────────────────────────────────
 * The four generic KayKit stand-ins are the heaviest art in the project
 * (knight/rogue/barbarian/mage = 14,478,324 B), and the intuitive lever —
 * "fewer polygons" — is the WRONG one. Measured composition of knight.glb:
 *
 *     animation ......... 3,279,235 B  89.61%   (939,450 B of animations JSON +
 *                                                579,381 accessors + 439,789
 *                                                bufferViews + 1,331,056 BIN)
 *     geometry .......... 339,000 B     9.26%
 *     texture ........... 14,172 B      0.39%
 *     skin IBM .......... 2,624 B       0.07%
 *
 * These meshes are ALREADY low-poly: 5,683–6,952 tris against the champion
 * gate's 16,000 warn / 28,000 limit (limits.ts). Decimating all four by 75%
 * would recover 899,420 B (6.21%) and visibly degrade the models 42 of 114
 * champions wear. Dropping the clips the game never asks for recovers ~10 MB
 * with geometry, rig, materials and texture bytes PROVABLY UNCHANGED.
 *
 * This is the same operation that already produced `guardian_skeleton.glb`
 * (95 clips → 15, 4,814,296 B → 1,036,516 B); CREDITS.md records that
 * precedent. This module makes it repeatable, derived and verified instead of
 * a one-off script.
 *
 * ─ THE KEEP-SET IS DERIVED, NEVER HARDCODED ─────────────────────────────────
 * A naive "just keep the clipMap" trim is a trap: `reactionClip.ts` deliberately
 * does NOT consult clipMap — it regex-matches the RAW AnimationGroup names to
 * pick the shop-purchase celebration. Trimming to clipMap alone would silently
 * downgrade every purchase reaction from "Cheer" to an attack swing. So the
 * required set is the union of BOTH mechanisms, computed from the live content
 * docs and the real pure module the client ships:
 *
 *   required(file) = ⋃ clipMap values of every model doc pointing at `file`
 *                  ∪ pickReactionClip(<the file's actual clip names>)
 *
 * plus a small RESERVED table below, each entry carrying the consumer that
 * justifies it. A future clipMap edit therefore cannot ship a champion whose
 * attack clip is no longer in the file — the derivation moves with the content,
 * and `--check` fails loudly when a required clip is missing.
 *
 * ─ SAFETY ────────────────────────────────────────────────────────────────────
 * Like optimize.ts this is a DRY RUN by default and writes to a separate tree
 * under --out. `--in-place` exists for the adoption step and is deliberately a
 * second, explicit flag. Every candidate is verified before it is written:
 *   • every required clip still present, by exact name;
 *   • every geometry / skin / image bufferView byte-identical to the source;
 *   • measureGlb parity on tris, verts, meshes, materials, skins, joints and
 *     texture bytes (only `clips` and `fileBytes` are allowed to move).
 * A candidate that fails any of these is REJECTED and not written.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pickReactionClip } from "../../apps/client/src/render/intermission/reactionClip";
import { measureGlb, readGlb, sha256, type Glb } from "./glb";
import { CONTENT, ROOT, contentUrl } from "./roles";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = path.join(HERE, "optimized-out");
const MODEL_DOCS = path.join(CONTENT, "models");

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const pad4 = (n: number): number => (n + 3) & ~3;

/**
 * Clips no clipMap names today but that a SHIPPED, DOCUMENTED consumer needs,
 * or that the near-term roadmap has already committed to. Each line must carry
 * the consumer — an entry with no consumer is dead weight and belongs deleted.
 *
 * Applied to every file in the champion stand-in set so all four keep an
 * IDENTICAL clip roster: they share one 41-bone rig and are swapped between
 * freely (champ-select stand-in, skins), so a clip present in one and missing
 * from another is a landmine.
 */
export interface ReservedClip {
  readonly clip: string;
  readonly why: string;
  /** content-url prefix this entry applies to — never global. */
  readonly scope: string;
}

const CHAMPS = "assets/models/champions/";

export const RESERVED_CLIPS: readonly ReservedClip[] = ([

  { clip: "2H_Melee_Idle", why: "arena.castle 值班鎧甲 (空鎧) idle — CREDITS.md, task #105" },
  { clip: "Hit_A", why: "arena.castle 空鎧 hit reaction — CREDITS.md, task #105" },
  { clip: "Hit_B", why: "arena.castle 空鎧 hit variety — CREDITS.md, task #105" },
  { clip: "Death_A", why: "arena.castle 空鎧 death — CREDITS.md, task #105" },
  { clip: "Death_B", why: "arena.castle 空鎧 death variety — CREDITS.md, task #105" },
  { clip: "Death_A_Pose", why: "death hold-pose (ClipAnimator sticks death on its last frame)" },
  { clip: "Walking_A", why: "intermission/shop staging walk — layout.ts merchant staging, task #146" },
  { clip: "Interact", why: "shop interaction pose — task #146 shop scene" },
  { clip: "Use_Item", why: "item purchase/use reaction — task #121/#146" },
  // ROSTER PARITY across the four stand-ins. They share one 41-bone rig and are
  // swapped between freely (champ-select stand-in, `champ.skin.*` skins, the
  // #119 form-swap), so every clip ANY of the four clipMaps names is kept in ALL
  // four: a clip present in one file and missing from its sibling is a landmine
  // for whoever next repoints a modelKey.
  { clip: "1H_Melee_Attack_Slice_Diagonal", why: "roster parity — champ.thorne / champ.skin.rogue attack" },
  { clip: "2H_Melee_Attack_Spin", why: "roster parity — champ.thorne cast / champ.skin.barbarian attack" },
  { clip: "Spellcast_Shoot", why: "roster parity — champ.sela attack" },
  { clip: "Spellcast_Long", why: "roster parity — champ.sela / barbarian / rogue cast" },
  { clip: "Running_A", why: "roster parity — run, every stand-in clipMap" },
  { clip: "Idle", why: "roster parity — idle, every stand-in clipMap" },
] as const).map((r) => ({ ...r, scope: CHAMPS }));

/** A model doc that points at a .glb, reduced to what this tool needs. */
interface ModelDoc {
  id: string;
  file: string;
  glbPath: string;
  clipMap: Record<string, string>;
}

let docCache: ModelDoc[] | null = null;
function modelDocs(): ModelDoc[] {
  if (docCache) return docCache;
  const out: ModelDoc[] = [];
  if (fs.existsSync(MODEL_DOCS)) {
    for (const e of fs.readdirSync(MODEL_DOCS)) {
      if (!e.endsWith(".json") || e.startsWith("_")) continue;
      const file = path.join(MODEL_DOCS, e);
      let j: any;
      try {
        j = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        continue;
      }
      if (typeof j?.glbPath !== "string") continue;
      out.push({ id: String(j.id ?? e), file, glbPath: j.glbPath, clipMap: j.clipMap ?? {} });
    }
  }
  docCache = out;
  return out;
}

export interface Requirement {
  /** every clip that must survive, sorted */
  clips: string[];
  /** why each clip is required — the audit trail printed in the dry run */
  reasons: Map<string, string[]>;
  /** model docs that point at this file */
  docs: string[];
}

/**
 * The required clip set for one .glb, derived from the live content docs and
 * the client's own reaction picker. `reserved` is applied on top.
 */
export function requiredClips(file: string, names: readonly string[], reserved = RESERVED_CLIPS): Requirement {
  const reasons = new Map<string, string[]>();
  const add = (clip: string, why: string): void => {
    const list = reasons.get(clip) ?? [];
    list.push(why);
    reasons.set(clip, list);
  };

  const url = contentUrl(file);
  const docs = modelDocs().filter((d) => d.glbPath === url);
  for (const d of docs) {
    for (const [state, clip] of Object.entries(d.clipMap)) {
      if (typeof clip === "string" && clip) add(clip, `${d.id}.clipMap.${state}`);
    }
  }

  // the SECOND, independent mechanism: reactionClip regex-matches raw group names
  const pick = pickReactionClip(names);
  if (pick) add(pick.clip, `pickReactionClip → ${pick.kind} (shop purchase reaction)`);

  for (const r of reserved) {
    if (!url.startsWith(r.scope)) continue; // reserved entries are scoped, never global
    // NO `names.includes()` gate here, deliberately. Gating on presence makes
    // the guard unfalsifiable for exactly the clips it exists to protect: once
    // `Cheer` (or `2H_Melee_Idle`, `Hit_B`, `Death_B`, …) has been dropped, a
    // presence-gated derivation simply stops asking for it and `--check`
    // reports "every required clip present". A reserved clip is required
    // BECAUSE the code reaches for it by name at runtime, whether or not it
    // currently exists — so it is stated unconditionally and `--check`'s
    // `req.clips.filter(c => !names.includes(c))` can actually fail.
    // main() filters the prune set back down to clips that exist (see below),
    // so a file that legitimately lacks one is trimmed rather than crashed on.
    add(r.clip, `reserved: ${r.why}`);
  }

  return { clips: [...reasons.keys()].sort(), reasons, docs: docs.map((d) => d.id) };
}

// ---- the prune ---------------------------------------------------------------

export interface TrimResult {
  before: number;
  after: number;
  clipsBefore: number;
  clipsAfter: number;
  bytes: Buffer;
}

/**
 * Rebuild `glb` keeping only the named animations, repacking the accessor and
 * bufferView tables (99.2% of both exist only to serve animation samplers, so
 * repacking them is where most of the JSON chunk goes). Every surviving
 * bufferView's BYTES are copied verbatim; only offsets and indices are rewritten.
 */
export function pruneAnimations(glb: Glb, keep: readonly string[]): Buffer {
  const json = glb.json;
  const bin = glb.bin;
  if (!bin) throw new Error("glb has no BIN chunk");

  // FAIL LOUD ON CONSTRUCTS THIS REPACKER DOES NOT REMAP.
  // The repack rewrites accessor and bufferView INDICES, so anything that holds
  // such an index somewhere this code does not look at would be silently
  // repointed at the wrong data — corruption that loads fine and renders wrong.
  // Three known cases: sparse accessors (`sparse.indices/values.bufferView`),
  // bufferView `extensions`/`extras` (dropped by the copy), and node-level
  // extensions that reference accessors (e.g. EXT_mesh_gpu_instancing).
  // Swept across all 163 .glb under content/assets/models on 2026-07-23: ZERO
  // of each, so this throws on nothing today — it exists so that a FUTURE
  // import that does use them stops the tool instead of quietly breaking a model.
  const sparse = (json.accessors ?? []).filter((a: any) => a?.sparse).length;
  const bvExt = (json.bufferViews ?? []).filter((v: any) => v?.extensions || v?.extras).length;
  const nodeExt = (json.nodes ?? []).filter((n: any) => n?.extensions).length;
  if (sparse > 0 || bvExt > 0 || nodeExt > 0) {
    throw new Error(
      `unsupported glTF constructs for animation pruning ` +
        `(sparse accessors: ${sparse}, bufferView extensions/extras: ${bvExt}, node extensions: ${nodeExt}) ` +
        `— this repacker rewrites accessor/bufferView indices and does not remap them`,
    );
  }
  const wanted = new Set(keep);
  const anims: any[] = (json.animations ?? []).filter((a: any) => wanted.has(a.name));
  const missing = keep.filter((n) => !(json.animations ?? []).some((a: any) => a.name === n));
  if (missing.length > 0) throw new Error(`missing clips: ${missing.join(", ")}`);

  const needAcc = new Set<number>();
  for (const m of json.meshes ?? []) {
    for (const p of m.primitives ?? []) {
      for (const a of Object.values(p.attributes ?? {})) needAcc.add(a as number);
      if (typeof p.indices === "number") needAcc.add(p.indices);
      for (const t of p.targets ?? []) for (const a of Object.values(t as any)) needAcc.add(a as number);
    }
  }
  for (const s of json.skins ?? []) if (typeof s.inverseBindMatrices === "number") needAcc.add(s.inverseBindMatrices);
  for (const a of anims) for (const s of a.samplers ?? []) { needAcc.add(s.input); needAcc.add(s.output); }

  const accList = [...needAcc].sort((a, b) => a - b);
  const accMap = new Map(accList.map((old, i) => [old, i]));

  const needBv = new Set<number>();
  for (const oi of accList) {
    const bv = json.accessors[oi].bufferView;
    if (typeof bv === "number") needBv.add(bv);
  }
  for (const im of json.images ?? []) if (typeof im.bufferView === "number") needBv.add(im.bufferView);
  const bvList = [...needBv].sort((a, b) => a - b);
  const bvMap = new Map(bvList.map((old, i) => [old, i]));

  const parts: Buffer[] = [];
  let offset = 0;
  const newBv = bvList.map((oi) => {
    const v = json.bufferViews[oi];
    const start = v.byteOffset ?? 0;
    parts.push(bin.subarray(start, start + v.byteLength));
    const at = offset;
    offset += v.byteLength;
    const padded = pad4(offset);
    if (padded > offset) {
      parts.push(Buffer.alloc(padded - offset));
      offset = padded;
    }
    const out: any = { buffer: 0, byteOffset: at, byteLength: v.byteLength };
    if (v.byteStride !== undefined) out.byteStride = v.byteStride;
    if (v.target !== undefined) out.target = v.target;
    return out;
  });

  const remapAttrs = (o: Record<string, number>): Record<string, number> =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, accMap.get(v)!]));

  const out: any = { ...json };
  out.accessors = accList.map((oi) => {
    const a = { ...json.accessors[oi] };
    if (typeof a.bufferView === "number") a.bufferView = bvMap.get(a.bufferView)!;
    return a;
  });
  out.bufferViews = newBv;
  out.buffers = [{ byteLength: offset }];
  out.meshes = (json.meshes ?? []).map((m: any) => ({
    ...m,
    primitives: (m.primitives ?? []).map((p: any) => {
      const q: any = { ...p, attributes: remapAttrs(p.attributes ?? {}) };
      if (typeof p.indices === "number") q.indices = accMap.get(p.indices)!;
      if (p.targets) q.targets = p.targets.map((t: any) => remapAttrs(t));
      return q;
    }),
  }));
  out.skins = (json.skins ?? []).map((s: any) =>
    typeof s.inverseBindMatrices === "number" ? { ...s, inverseBindMatrices: accMap.get(s.inverseBindMatrices)! } : { ...s },
  );
  out.images = (json.images ?? []).map((im: any) =>
    typeof im.bufferView === "number" ? { ...im, bufferView: bvMap.get(im.bufferView)! } : { ...im },
  );
  out.animations = anims.map((a: any) => ({
    ...a,
    samplers: a.samplers.map((s: any) => ({ ...s, input: accMap.get(s.input)!, output: accMap.get(s.output)! })),
  }));

  const jsonStr = Buffer.from(JSON.stringify(out), "utf8");
  const jsonChunk = Buffer.concat([jsonStr, Buffer.alloc(pad4(jsonStr.length) - jsonStr.length, 0x20)]);
  const newBin = Buffer.concat(parts);
  const binChunk = Buffer.concat([newBin, Buffer.alloc(pad4(newBin.length) - newBin.length, 0)]);
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const head = Buffer.alloc(12);
  head.writeUInt32LE(GLB_MAGIC, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jsonChunk.length, 0);
  jh.writeUInt32LE(CHUNK_JSON, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(binChunk.length, 0);
  bh.writeUInt32LE(CHUNK_BIN, 4);
  return Buffer.concat([head, jh, jsonChunk, bh, binChunk]);
}

/**
 * The invariant a clip prune promises: NOTHING that describes shape, skinning
 * or texture changed. Compares measureGlb on every axis except clips/fileBytes,
 * and then the actual BYTES of every non-animation bufferView (matched by the
 * accessor that owns it, since indices are repacked). Returns null when clean.
 */
export function pruneDiff(srcFile: string, outFile: string, keep: readonly string[]): string | null {
  const a = measureGlb(srcFile);
  const b = measureGlb(outFile);
  for (const k of ["triangles", "vertices", "meshes", "materials", "skins", "joints", "maxTextureEdge", "textureDiskBytes", "vramBytes"] as const) {
    if (a[k] !== b[k]) return `${k} changed: ${a[k]} → ${b[k]}`;
  }
  if (b.clips !== keep.length) return `clip count is ${b.clips}, expected ${keep.length}`;

  const ga = readGlb(srcFile);
  const gb = readGlb(outFile);
  const names = new Set((gb.json.animations ?? []).map((x: any) => x.name));
  for (const n of keep) if (!names.has(n)) return `required clip missing after prune: ${n}`;

  // Geometry / skin bytes. Accessor and bufferView INDICES are repacked by the
  // prune, so pairs are established by walking the (unchanged) mesh/skin
  // structure of both files in lockstep — never by assuming an index mapping.
  const viewBytes = (g: Glb, accIdx: number): Buffer => {
    const v = g.json.bufferViews[g.json.accessors[accIdx].bufferView];
    return g.bin!.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
  };
  const pairs: [number, number, string][] = [];
  const ma: any[] = ga.json.meshes ?? [];
  const mb: any[] = gb.json.meshes ?? [];
  if (ma.length !== mb.length) return `mesh count changed: ${ma.length} → ${mb.length}`;
  for (let i = 0; i < ma.length; i++) {
    const pa: any[] = ma[i].primitives ?? [];
    const pb: any[] = mb[i].primitives ?? [];
    if (pa.length !== pb.length) return `mesh ${i} primitive count changed`;
    for (let k = 0; k < pa.length; k++) {
      for (const attr of Object.keys(pa[k].attributes ?? {})) {
        if (!(attr in (pb[k].attributes ?? {}))) return `mesh ${i} primitive ${k} lost attribute ${attr}`;
        pairs.push([pa[k].attributes[attr], pb[k].attributes[attr], `mesh ${i}.${k}.${attr}`]);
      }
      if (typeof pa[k].indices === "number") pairs.push([pa[k].indices, pb[k].indices, `mesh ${i}.${k}.indices`]);
      if (pa[k].material !== pb[k].material) return `mesh ${i} primitive ${k} material changed`;
    }
  }
  const sa: any[] = ga.json.skins ?? [];
  const sb: any[] = gb.json.skins ?? [];
  if (sa.length !== sb.length) return `skin count changed`;
  for (let i = 0; i < sa.length; i++) {
    if (JSON.stringify(sa[i].joints) !== JSON.stringify(sb[i].joints)) return `skin ${i} joint list changed`;
    if (typeof sa[i].inverseBindMatrices === "number") pairs.push([sa[i].inverseBindMatrices, sb[i].inverseBindMatrices, `skin ${i}.ibm`]);
  }
  for (const [oldIdx, newIdx, label] of pairs) {
    const acA = { ...ga.json.accessors[oldIdx], bufferView: undefined };
    const acB = { ...gb.json.accessors[newIdx], bufferView: undefined };
    if (JSON.stringify(acA) !== JSON.stringify(acB)) return `${label}: accessor descriptor changed`;
    if (!viewBytes(ga, oldIdx).equals(viewBytes(gb, newIdx))) return `${label}: bytes differ`;
  }
  if (JSON.stringify(ga.json.nodes ?? null) !== JSON.stringify(gb.json.nodes ?? null)) return "node graph changed";
  if (JSON.stringify(ga.json.materials ?? null) !== JSON.stringify(gb.json.materials ?? null)) return "materials changed";
  for (let i = 0; i < (ga.json.images ?? []).length; i++) {
    const va = ga.json.bufferViews[ga.json.images[i].bufferView];
    const vb = gb.json.bufferViews[gb.json.images[i].bufferView];
    const da = ga.bin!.subarray(va.byteOffset ?? 0, (va.byteOffset ?? 0) + va.byteLength);
    const db = gb.bin!.subarray(vb.byteOffset ?? 0, (vb.byteOffset ?? 0) + vb.byteLength);
    if (!da.equals(db)) return `image ${i} bytes differ`;
  }
  return null;
}

// ---- CLI ---------------------------------------------------------------------

interface Args {
  inputs: string[];
  out: string;
  apply: boolean;
  inPlace: boolean;
  check: boolean;
  json: boolean;
}

function fail(msg: string): never {
  process.stderr.write(`trimClips: ${msg}\n`);
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const a: Args = { inputs: [], out: DEFAULT_OUT, apply: false, inPlace: false, check: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]!;
    if (t === "--out") a.out = path.resolve(argv[++i] ?? fail("--out needs a dir"));
    else if (t === "--apply") a.apply = true;
    else if (t === "--in-place") { a.apply = true; a.inPlace = true; }
    else if (t === "--check") a.check = true;
    else if (t === "--json") a.json = true;
    else if (t === "--help" || t === "-h") {
      process.stdout.write(
        "usage: tsx tools/model-budget/trimClips.ts <glb-or-dir>... [--apply|--in-place] [--out DIR] [--check] [--json]\n" +
          "  default is a DRY RUN. --apply writes to --out; --in-place overwrites the source (git is the undo).\n" +
          "  --check verifies the SHIPPED files still contain every derived required clip (exit 1 if not).\n",
      );
      process.exit(0);
    } else if (t.startsWith("-")) fail(`unknown flag ${t}`);
    else a.inputs.push(t);
  }
  if (a.inputs.length === 0) fail("give at least one .glb file or a directory");
  return a;
}

function collect(inputs: string[]): string[] {
  const files: string[] = [];
  const walk = (p: string): void => {
    const st = fs.statSync(p);
    if (st.isDirectory()) for (const e of fs.readdirSync(p)) walk(path.join(p, e));
    else if (p.endsWith(".glb")) files.push(p);
  };
  for (const inp of inputs) {
    if (!fs.existsSync(inp)) fail(`no such path: ${inp}`);
    walk(inp);
  }
  files.sort();
  return files;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const files = collect(args.inputs);
  if (files.length === 0) fail("no .glb files found");

  // ---- --check: the regression guard ----
  if (args.check) {
    let bad = 0;
    for (const f of files) {
      const glb = readGlb(f);
      const names: string[] = (glb.json.animations ?? []).map((a: any) => a.name);
      const req = requiredClips(f, names);
      const missing = req.clips.filter((c) => !names.includes(c));
      if (missing.length > 0) {
        bad++;
        process.stderr.write(`MISSING ${contentUrl(f)}: ${missing.join(", ")}\n`);
      }
    }
    process.stdout.write(bad === 0 ? `ok — ${files.length} model(s), every required clip present\n` : `${bad} model(s) missing required clips\n`);
    process.exit(bad === 0 ? 0 : 1);
  }

  const rows: any[] = [];
  let totalBefore = 0;
  let totalAfter = 0;

  for (const f of files) {
    const glb = readGlb(f);
    const names: string[] = (glb.json.animations ?? []).map((a: any) => a.name);
    const req = requiredClips(f, names);
    // A required clip that this file does not actually have is a CONTENT bug,
    // not a reason to abort the run: content/models/prop.guardian.json clipMaps
    // "idle" onto guardians/guardian_stone.glb, which has zero animations. It
    // is reported as a row (main() exits 1 if any row has `rejected`) and the
    // prune proceeds over the clips that do exist.
    const absent = req.clips.filter((c) => !names.includes(c));
    const keep = req.clips.filter((c) => names.includes(c));
    if (keep.length === 0 || keep.length === names.length) {
      rows.push({
        file: contentUrl(f),
        skip: "no-op",
        clips: names.length,
        ...(absent.length ? { rejected: `missing clips: ${absent.join(", ")}` } : {}),
      });
      continue;
    }

    // Never let one bad file abort a directory run half-applied. `collect()`
    // sorts paths, so champions/ is processed before guardians/ — an unguarded
    // throw on the guardian meant `--in-place content/assets/models` rewrote
    // the four champion files and THEN died, with no summary of what was
    // written. Turning the failure into a row keeps the run atomic-in-reporting
    // and preserves the exit-1 ratchet.
    let bytes: Buffer;
    try {
      bytes = pruneAnimations(glb, keep);
    } catch (e) {
      rows.push({ file: contentUrl(f), clips: names.length, rejected: String((e as Error).message) });
      continue;
    }
    const before = fs.statSync(f).size;
    totalBefore += before;
    totalAfter += bytes.length;

    const outFile = args.inPlace ? f : path.join(args.out, contentUrl(f));
    const row: any = {
      file: contentUrl(f),
      docs: req.docs,
      clipsBefore: names.length,
      clipsAfter: keep.length,
      dropped: names.length - keep.length,
      before,
      after: bytes.length,
      saved: before - bytes.length,
      pct: +((100 * (before - bytes.length)) / before).toFixed(2),
      keep: keep.map((c) => ({ clip: c, why: req.reasons.get(c)! })),
      out: path.relative(ROOT, outFile),
      wrote: false,
      // a required clip this file does not have is surfaced, and exits 1
      rejected: absent.length ? `missing clips: ${absent.join(", ")}` : "",
    };

    if (args.apply) {
      // write to a temp beside the destination, verify, then move into place
      const tmp = `${outFile}.trim-tmp`;
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.writeFileSync(tmp, bytes);
      const diff = pruneDiff(f, tmp, keep);
      if (diff !== null) {
        fs.rmSync(tmp, { force: true });
        row.rejected = `prune altered non-animation data (${diff}) — refusing to write`;
      } else {
        row.sourceSha256 = sha256(fs.readFileSync(f));
        fs.renameSync(tmp, outFile);
        row.outSha256 = sha256(bytes);
        row.wrote = true;
      }
    }
    rows.push(row);
  }

  if (args.json) {
    process.stdout.write(JSON.stringify({ mode: args.inPlace ? "in-place" : args.apply ? "apply" : "dry-run", rows }, null, 2) + "\n");
  } else {
    process.stdout.write(
      args.apply
        ? `APPLIED${args.inPlace ? " IN PLACE (git is the undo)" : ` — output under ${path.relative(ROOT, args.out)}`}\n\n`
        : "DRY RUN — nothing is written without --apply.\n\n",
    );
    for (const r of rows) {
      if (r.skip) {
        process.stdout.write(`  skip  ${r.file} (${r.skip}, ${r.clips} clips)\n`);
        // a skipped file can still carry a content defect (a clipMap naming a
        // clip the .glb does not have) — say so, it is why the run exits 1
        if (r.rejected) process.stdout.write(`        REJECTED: ${r.rejected}\n`);
        continue;
      }
      process.stdout.write(
        `• ${r.file}  [${r.docs.join(", ") || "no model doc"}]\n` +
          `    clips ${r.clipsBefore} → ${r.clipsAfter} (dropped ${r.dropped})\n` +
          `    bytes ${r.before} → ${r.after}  (saved ${r.saved} B, ${r.pct}%)\n`,
      );
      for (const k of r.keep) process.stdout.write(`      keep ${k.clip.padEnd(32)} ${k.why.join(" + ")}\n`);
      // `rejected` and `wrote` are independent: a file whose clipMap names an
      // absent clip is still trimmed over the clips that DO exist, and must
      // report both facts rather than hiding the write behind the complaint.
      if (r.rejected) process.stdout.write(`    REJECTED: ${r.rejected}\n`);
      if (r.wrote) process.stdout.write(`    wrote ${r.out}\n`);
      else if (!r.rejected) process.stdout.write(`    → out: ${r.out}\n`);
    }
    process.stdout.write(`\nTOTAL ${totalBefore} B → ${totalAfter} B (saved ${totalBefore - totalAfter} B)\n`);
  }
  process.exit(rows.some((r) => r.rejected) ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
