/**
 * emit_report — the measurement behind 模型預算. Parses every .glb in the tree,
 * traces WHERE each one is used, assembles the SIMULTANEOUS cost of each scene,
 * scores it against tools/model-budget/limits.ts and writes
 * content/assets/model-budget/report.json.
 *
 *   pnpm exec tsx tools/model-budget/emit_report.ts             # write the report
 *   pnpm exec tsx tools/model-budget/emit_report.ts --check     # exit 1 on any OVER
 *   pnpm exec tsx tools/model-budget/emit_report.ts --out <p>   # write elsewhere
 *
 * THE OUTPUT CARRIES NO CLOCK (GH#389). It is a checked-in artefact, so a
 * `generatedAt` made `git status` dirty on every run and diluted the one signal
 * that says "something here needs committing". Its identity is `sourcesDigest`
 * — the hash of the inputs it derived from — which changes iff the inputs do.
 *
 * Consumers: apps/client/public/model-budget.html (the standalone page) and the
 * 後台管理 模型預算 page (task #102), which reads this file and never measures
 * anything itself.
 *
 * WHY IT PARSES THE .glb DIRECTLY. A gltf library would be a dependency and a
 * black box; the GLB container is a 12-byte header plus length-prefixed chunks,
 * and triangles are `indices.count` per primitive interpreted through the
 * primitive's `mode`. Doing it here means the page's numbers can be re-derived
 * by reading 120 lines rather than trusting a version range. The output was
 * cross-checked against two independent parsers and a Babylon NullEngine run of
 * the real builders: all four agree on triangles, materials, texture bytes and
 * file size for all 198 models.
 *
 * WHY IT IMPORTS THE CLIENT'S OWN MODULES. The arena floor, the kerb, the
 * spawn pads and the intermission market are PROCEDURAL — they are not .glb
 * files, no import gate can ever see them, and they are bigger than the
 * authored decor of three of the five arenas. Rather than copy their vertex
 * counts into a constant that would rot, this tool imports the real pure
 * exports (`floorRingRadii`, `ringSegments`, `RIM_PROFILE`, the intermission
 * `layout` module) and derives the triangle counts from the same source the
 * renderer builds from. Verified: the derivation reproduces the NullEngine
 * measurement exactly (ground 14,868/arena; intermission 78 grass + 49 tiles).
 *
 * WHAT IS RECORDED RATHER THAN DERIVED. Two procedural systems (the login
 * scene's islands/magic circles, and post-cull draw counts at specific camera
 * distances) cannot be derived without running Babylon. They are carried in
 * RECORDED below, each with the method that produced it, and the page prints
 * them as measurements with provenance rather than as live numbers.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { RIM_PROFILE, floorRingRadii, ringSegments } from "../../apps/client/src/render/ArenaGround";
import * as ILayout from "../../apps/client/src/render/intermission/layout";
// ⭐ GH#396 —— 散佈規則（GH#362）展開成逐件道具的**出貨那一支函式**。
// ⛔ 這裡刻意 import 而不是在報告裡重算一次 `min(Σcount, maxPerZone)`：
// 那個上限是**按規則順序**砍的，重算一份必然會在某一次改動之後與畫面分岔，
// 而分岔的方向永遠是報告比較小（＝場景悄悄超支）。同 ILayout 的理由。
import { expandSceneryProps } from "../../packages/shared/src/content/schema/arenaScenery";
import { DEFAULT_ARENA_SCENERY_POLICY } from "../../packages/shared/src/content/schema/config";
import {
  C_CHAN_MS,
  C_MESH_MS,
  COMBAT_FRAME_SPLIT,
  DERATE,
  FRAME_MS,
  GATES,
  LINES,
  verdict,
  type Verdict,
} from "./limits";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CONTENT = path.join(ROOT, "content");
const OVERLAY = path.join(ROOT, "data/blizzard-overlay/models");
const OUT_DIR = path.join(CONTENT, "assets/model-budget");
const DEFAULT_OUT = path.join(OUT_DIR, "report.json");

/**
 * `--out <path>` writes somewhere else. ⭐ It exists so a guard can run this
 * generator for real, twice, into a temp dir and diff the bytes — without
 * touching the tree. Reading the committed file instead would only prove the
 * file is stable, not that the GENERATOR is (GH#389, failure mode ⑤).
 */
function outPath(): string {
  const i = process.argv.indexOf("--out");
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (i >= 0 && (v === undefined || v.startsWith("--"))) {
    process.stderr.write("--out needs a path\n");
    process.exit(2);
  }
  return v === undefined ? DEFAULT_OUT : path.resolve(v);
}
/** Accepted-breach ratchet — lives next to the tool, checked into the tree. */
const BASELINE = path.join(HERE, "baseline.json");

// ---------------------------------------------------------------- glb ------

interface Img {
  w: number;
  h: number;
  format: string;
  diskBytes: number;
}

interface Glb {
  /** content-relative URL the renderer asks for, e.g. assets/models/props/pillar.glb */
  path: string;
  group: string;
  name: string;
  shipping: boolean;
  fileBytes: number;
  triangles: number;
  vertices: number;
  /** one Babylon mesh per node×primitive — one draw call each, nothing is instanced */
  meshes: number;
  materials: number;
  skins: number;
  joints: number;
  clips: number;
  /** channels of the single heaviest clip: only one clip plays at a time */
  channelsPerFrame: number;
  images: Img[];
  textureDiskBytes: number;
  /** RGBA8 + full mip chain. Babylon mips everything here (no sampler opts out). */
  vramBytes: number;
  maxTextureEdge: number;
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

function readGlb(file: string): { json: any; bin: Buffer | null; bytes: number } {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`not a glb: ${file}`);
  const total = buf.readUInt32LE(8);
  let off = 12;
  let json: any = null;
  let bin: Buffer | null = null;
  while (off + 8 <= Math.min(total, buf.length)) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const start = off + 8;
    if (type === CHUNK_JSON) json = JSON.parse(buf.subarray(start, start + len).toString("utf8"));
    else if (type === CHUNK_BIN) bin = buf.subarray(start, start + len);
    off = start + len;
    while (off % 4 !== 0) off++;
  }
  return { json, bin, bytes: buf.length };
}

/** glTF primitive modes: 4 TRIANGLES, 5 STRIP, 6 FAN; points/lines draw none. */
function trisFor(mode: number | undefined, elements: number): number {
  const m = mode ?? 4;
  if (m === 4) return Math.floor(elements / 3);
  if (m === 5 || m === 6) return Math.max(0, elements - 2);
  return 0;
}

/** Pixel dimensions straight out of the container header — no decode, no deps. */
function sniff(b: Buffer): Img | null {
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) {
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), format: "png", diskBytes: b.length };
  }
  if (b.length >= 16 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const kind = b.toString("ascii", 12, 16);
    if (kind === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3), format: "webp", diskBytes: b.length };
    if (kind === "VP8L") {
      const bits = b.readUInt32LE(21);
      return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff), format: "webp", diskBytes: b.length };
    }
    if (kind === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, format: "webp", diskBytes: b.length };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1]!;
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5), format: "jpeg", diskBytes: b.length };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** RGBA8 (Babylon decodes every compressed source to RGBA8) × 4/3 for mips. */
function vramOf(img: Img): number {
  return Math.round(img.w * img.h * 4 * (4 / 3));
}

function analyse(file: string, url: string, group: string, shipping: boolean): Glb {
  const { json: g, bin, bytes } = readGlb(file);
  const acc: any[] = g.accessors ?? [];
  const meshes: any[] = g.meshes ?? [];
  const nodes: any[] = g.nodes ?? [];

  // how many scene-graph nodes reference each mesh — a mesh used twice costs twice
  const refs = new Array<number>(meshes.length).fill(0);
  for (const n of nodes) if (typeof n.mesh === "number") refs[n.mesh]! += 1;

  let triangles = 0;
  let vertices = 0;
  let meshCount = 0;
  const mats = new Set<number>();
  meshes.forEach((m: any, mi: number) => {
    const uses = refs[mi] ?? 0;
    if (uses === 0) return; // an unreferenced mesh is never built
    for (const p of m.primitives ?? []) {
      const posIdx = p.attributes?.POSITION;
      const vcount = typeof posIdx === "number" ? (acc[posIdx]?.count ?? 0) : 0;
      const elements = typeof p.indices === "number" ? (acc[p.indices]?.count ?? 0) : vcount;
      triangles += trisFor(p.mode, elements) * uses;
      vertices += vcount * uses;
      meshCount += uses;
      if (typeof p.material === "number") mats.add(p.material);
    }
  });

  // one clip plays at a time (ClipAnimator), so the per-frame cost is the max
  const clips: any[] = g.animations ?? [];
  let channelsPerFrame = 0;
  for (const a of clips) channelsPerFrame = Math.max(channelsPerFrame, (a.channels ?? []).length);

  const views: any[] = g.bufferViews ?? [];
  const images: Img[] = [];
  for (const im of (g.images ?? []) as any[]) {
    if (typeof im.bufferView !== "number" || !bin) continue;
    const v = views[im.bufferView];
    if (!v) continue;
    const slice = bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
    const s = sniff(slice);
    images.push(s ?? { w: 0, h: 0, format: String(im.mimeType ?? "?"), diskBytes: slice.length });
  }

  const skins: any[] = g.skins ?? [];
  return {
    path: url,
    group,
    name: path.basename(file, ".glb"),
    shipping,
    fileBytes: bytes,
    triangles,
    vertices,
    meshes: meshCount,
    materials: mats.size,
    skins: skins.length,
    joints: skins.reduce((n, s) => n + (s.joints?.length ?? 0), 0),
    clips: clips.length,
    channelsPerFrame,
    images,
    textureDiskBytes: images.reduce((n, i) => n + i.diskBytes, 0),
    vramBytes: images.reduce((n, i) => n + vramOf(i), 0),
    maxTextureEdge: images.reduce((n, i) => Math.max(n, i.w, i.h), 0),
  };
}

/**
 * A generated LOD tier (task #115), e.g. `mage-mid.glb` / `mage-small.glb`.
 * These are DERIVED variants of a .glb already counted, not models of their
 * own: counting them would inflate the corpus from 203 to 377 rows, and since
 * nothing references them by path they would every one be classified
 * role="unused" — turning the 模型預算 page's "unused" list, the thing it exists
 * to make actionable, into noise. The saving they represent belongs in a
 * per-model tier column (a #99 enhancement), not in a new row.
 */
const LOD_TIER_GLB = /-(mid|small)\.glb$/;

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".glb") && !LOD_TIER_GLB.test(e.name)) out.push(p);
  }
  return out;
}

// ------------------------------------------------------------ content ------

const readJson = (p: string): any => JSON.parse(fs.readFileSync(p, "utf8"));
const listDocs = (dir: string): any[] =>
  fs.existsSync(path.join(CONTENT, dir))
    ? fs
        .readdirSync(path.join(CONTENT, dir))
        .filter((f) => f.endsWith(".json") && f !== "_index.json")
        .map((f) => readJson(path.join(CONTENT, dir, f)))
    : [];

interface Use {
  scene: string;
  label: string;
  /** simultaneous copies in that scene */
  count: number;
  detail?: string;
}

// ---------------------------------------------------------- procedural -----

/**
 * Arena geometry the renderer builds from code, derived from the SAME pure
 * exports ArenaGround/ArenaScene build from:
 *   floor  = segments × (1 + 2 × (rings − 2))       (centre fan + quad bands)
 *   rim    = segments × (RIM_PROFILE − 1) × 2       (swept kerb profile)
 *   pillar = 96 tris   (CreateCylinder tessellation 24 → 4t)
 *   wall   = 12 tris   (CreateBox)
 *   pad    = 80 tris   (CreateCylinder tessellation 20)
 *   blob   = 140 tris  (contact shadow disc, 20 segments × 5 rings)
 * ArenaScene disposes ALL procedural pillars when the arena's decor contains a
 * model whose path contains "pillar" — the props represent the obstacles — so
 * castle/colosseum/skeleton pay 0 for pillars and dota/godie pay full price.
 */
const PILLAR_TRIS = 96;
const WALL_TRIS = 12;
const PAD_TRIS = 80;
const BLOB_TRIS = 140;

interface Procedural {
  label: string;
  triangles: number;
  meshes: number;
  note: string;
}

function arenaProcedural(doc: any, decorCount: number, hasPillarProp: boolean): Procedural[] {
  const out: Procedural[] = [];
  let groundTris = 0;
  let groundMeshes = 0;
  let pillars = 0;
  let walls = 0;
  let pads = 0;
  for (const z of doc.zones ?? []) {
    const seg = ringSegments(z.boundaryRadius);
    const rings = floorRingRadii(z.boundaryRadius).length;
    groundTris += seg * (1 + 2 * (rings - 2)) + seg * (RIM_PROFILE.length - 1) * 2;
    groundMeshes += 2; // floor + rim
    for (const o of z.obstacles ?? []) (o.kind === "circle" ? pillars++ : walls++);
    for (const side of z.spawns ?? []) pads += side.length;
  }
  out.push({
    label: "地板 + 路緣（buildZoneGround，兩個 zone）",
    triangles: groundTris,
    meshes: groundMeshes,
    note: `ringSegments(24)=${ringSegments(24)}、floorRingRadii 22 環、RIM_PROFILE ${RIM_PROFILE.length} 段 —— 由 ArenaGround 的純函式推導，非硬編碼。`,
  });
  out.push({
    label: "障礙柱 + 牆",
    triangles: (hasPillarProp ? 0 : pillars * PILLAR_TRIS) + walls * WALL_TRIS,
    meshes: (hasPillarProp ? 0 : pillars) + walls,
    note: hasPillarProp
      ? `${pillars} 根程序柱在 dressArena 被 dispose（decor 有 pillar 模型代表障礙），只剩 ${walls} 面牆。`
      : `${pillars} 根 CreateCylinder(tessellation 24) × 96 面 —— 這個競技場沒有 pillar 擺設，所以柱子全留著。`,
  });
  out.push({
    label: "出生台座",
    triangles: pads * PAD_TRIS,
    meshes: pads,
    note: `${pads} 個 CreateCylinder(tessellation 20) × 80 面。`,
  });
  out.push({
    label: "接地陰影（thin instance）",
    triangles: decorCount * BLOB_TRIS,
    meshes: 1,
    note: `${decorCount} 個擺設各一片 140 面的漸層圓盤，thin-instanced → 整座競技場只有 1 個 draw call。`,
  });
  return out;
}

/**
 * RECORDED measurements — things that cannot be derived without running
 * Babylon. Each carries the method that produced it. The page prints them as
 * measurements with provenance, never as live numbers.
 */
const RECORDED = {
  login: {
    method:
      "Babylon 7.54.3 NullEngine，載入真正的 LoginScene builders，逐一計數 mesh 與 getTotalIndices()（task #99）",
    parts: [
      { label: "5 × buildFloatingIsland", meshes: 105, triangles: 31_850 },
      { label: "魔法陣（hub）", meshes: 58, triangles: 15_102 },
      { label: "魔法陣（sigil）", meshes: 57, triangles: 15_054 },
      { label: "天空 / 月 / 光柱 / 雲", meshes: 13, triangles: 2_958 },
    ],
  },
  culling: {
    method:
      "同一個 NullEngine 場景，把相機放在真實的 dolly 距離上再讀 scene.getActiveMeshes()（task #99）",
    combat: [
      { at: "dolly 10（預設最近，#31）", godie: 18, dota: 21 },
      { at: "dolly 25", godie: 105, dota: 125 },
      { at: "dolly 40（活著時的最遠）", godie: 135, dota: 128 },
      { at: "dolly 90（死亡觀戰最遠）", godie: 223, dota: 180 },
      { at: "地圖正中（= 全部常駐，無視錐體剔除）", godie: 328, dota: 249 },
    ],
    login: { loaded: 235, drawn: 167 },
    intermission: { loaded: 187, drawn: 107, shadowRedraw: 78 },
  },
  /**
   * #240. These are the #99 measurements taken on the four KayKit Adventurers
   * champions BEFORE owner directive #226 deleted them. They are kept because
   * they are the evidence FOR the deletion (a 41-joint rig costs 8× a 15-joint
   * one at identical triangle counts) and because c_chan is derived from them —
   * but the labels no longer claim 「現況」, because the models they measured are
   * gone. Re-measuring on the generated box-men would produce a number so small
   * it teaches nothing; the imported-skeleton row is the live comparison.
   */
  animCpu: {
    method:
      "NullEngine，12 份同一支英雄 glb 以 ChampionView 的方式實例化並各播一個 loop clip，600–900 幀後取 p50（Apple M5 Max）",
    samples: [
      { label: "12 隻 KayKit（#226 退場前，41 關節 × 123 通道）", ms: 2.19 },
      { label: "12 隻 KayKit（退場前），關掉 ClipAnimator 的 enableBlending", ms: 1.0 },
      { label: "12 隻 KayKit（退場前），drawDistance 剔除後（root.setEnabled(false)）", ms: 0.49 },
      { label: "12 隻 herosaber（中位 imported 骨架，仍在樹上）", ms: 0.27 },
    ],
  },
} as const;

// ------------------------------------------------------------- assemble ----

function sha256(p: string): string {
  return createHash("sha256").update(fs.readFileSync(p)).digest("hex").slice(0, 16);
}

function sha256Of(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

function main(): void {
  const check = process.argv.includes("--check");

  // ---- 1. every .glb in the tree
  const glbs: Glb[] = [];
  for (const f of walk(path.join(CONTENT, "assets/models"))) {
    const url = path.relative(CONTENT, f).split(path.sep).join("/");
    glbs.push(analyse(f, url, url.split("/")[2] ?? "?", true));
  }
  for (const f of walk(OVERLAY)) {
    const url = `assets/blizzard-local/models/${path.basename(f)}`;
    glbs.push(analyse(f, url, "blizzard-overlay", false));
  }
  const byPath = new Map(glbs.map((g) => [g.path, g]));

  // ---- 2. where each one is used
  const uses = new Map<string, Use[]>();
  const addUse = (glbPath: string, u: Use): void => {
    const list = uses.get(glbPath) ?? [];
    list.push(u);
    uses.set(glbPath, list);
  };

  const modelDocs = listDocs("models");
  const docById = new Map<string, any>(modelDocs.map((d) => [d.id, d]));
  const champs = listDocs("champions");
  const skins = listDocs("skins");

  const champByModel = new Map<string, string[]>();
  for (const c of champs) {
    const list = champByModel.get(c.modelKey) ?? [];
    list.push(c.name);
    champByModel.set(c.modelKey, list);
  }
  for (const [modelKey, names] of champByModel) {
    const doc = docById.get(modelKey);
    if (!doc) continue;
    addUse(doc.glbPath, {
      scene: "COMBAT",
      label: "英雄",
      count: 12,
      detail: `${names.length} 位英雄使用：${names.join("、")}`,
    });
  }
  for (const s of skins) {
    const doc = docById.get(s.modelKey);
    if (doc) addUse(doc.glbPath, { scene: "COMBAT", label: "造型（skin）", count: 12, detail: s.id });
  }

  // arena decor
  //
  // ⭐ GH#396 —— **`doc.decor` 只是一半。** GH#362 之後每張圖還有一個 `scenery.props`
  // 散佈規則區塊，`ArenaScene.buildArena` 把它展開成逐件的 `DecorDef` **再併進
  // 同一個 decor 陣列**（那條路上的註解逐字寫著「這條規則是 decor 的產生器，
  // 不是第二條渲染路徑」）。這支報告只讀 `doc.decor`，於是每一張圖都少算了
  // 「每區的散佈件數 × 分區數」—— godie 少了 66 件，而它當時報 232 draws / 上限 240。
  //
  // ⛔ 修法是呼叫**同一支** `expandSceneryProps`，⛔ 不是在這裡重算
  // `min(Σcount, maxPerZone)`：那個上限按規則順序砍，一份抄出來的算術遲早會與
  // 畫面分岔，而分岔的方向永遠是報告比較小。
  //
  // ⚠️ 政策讀**出貨的那一份** `content/config/ambient-vfx.json`（`enabled` 關掉時
  // 客戶端一件都不長，報告也就不該算），讀不到才退回 `DEFAULT_ARENA_SCENERY_POLICY`
  // —— 跟 `buildArena` 的預設參數同一個值、同一個方向。
  const scenery = ((): typeof DEFAULT_ARENA_SCENERY_POLICY => {
    try {
      const doc = readJson(path.join(CONTENT, "config/ambient-vfx.json"));
      return { ...DEFAULT_ARENA_SCENERY_POLICY, ...(doc?.scenery ?? {}) };
    } catch {
      return DEFAULT_ARENA_SCENERY_POLICY;
    }
  })();
  const arenas = listDocs("arenas");
  const arenaDecor = new Map<string, Map<string, number>>();
  for (const a of arenas) {
    const per = new Map<string, number>();
    for (const d of a.decor ?? []) per.set(d.model, (per.get(d.model) ?? 0) + 1);
    const scattered = scenery.enabled
      ? expandSceneryProps(a.scenery, a.zones ?? [], scenery.maxPropsPerZone)
      : [];
    for (const d of scattered) per.set(d.model, (per.get(d.model) ?? 0) + 1);
    arenaDecor.set(a.id, per);
    for (const [m, n] of per) addUse(m, { scene: `COMBAT:${a.id}`, label: `競技場擺設 · ${a.name}`, count: n });
  }

  // intermission market — counted off the REAL layout module
  const interCounts = new Map<string, number>();
  const bump = (m: string, n = 1): void => {
    interCounts.set(m, (interCounts.get(m) ?? 0) + n);
  };
  bump(ILayout.STALL.model);
  bump(ILayout.CART.model);
  bump(ILayout.MERCHANT.model);
  for (const t of ILayout.TORCHES) bump(t.model);
  for (const d of ILayout.DRESSING) bump(d.model);
  for (const s of ILayout.silhouettes()) bump(s.model);
  bump(ILayout.bannerFor(0).model);
  bump("assets/models/props/floor_tile_large.glb", ILayout.pavingTiles().length);
  bump("assets/models/hex/hex_grass.glb", ILayout.grassRing().length);
  for (const [m, n] of interCounts) addUse(m, { scene: "INTERMISSION", label: "中場市集", count: n });

  addUse("assets/models/menu/dragon2.glb", { scene: "LOGIN", label: "登入巨龍", count: 2 });
  addUse("assets/models/hex/waterlily.glb", { scene: "COMBAT", label: "治療花（prop.flower）", count: 4 });

  // The Blizzard overlay is DEV-ONLY, gitignored runtime state (see
  // .gitignore `/data/**`): it exists on the owner's machine and on the family
  // host, and never in CI or a fresh clone. Reading it unconditionally made
  // this whole report — which is otherwise about shipped assets — fail with
  // ENOENT wherever the optional overlay is absent, which is everywhere that
  // matters for a build gate. Absent overlay simply contributes no DEV-ONLY
  // rows; that is the correct reading, not a degraded one.
  const overlayManifest = path.join(ROOT, "data/blizzard-overlay/MANIFEST.json");
  const overlayUnits = fs.existsSync(overlayManifest)
    ? (readJson(overlayManifest).units ?? {})
    : {};
  for (const u of Object.values<any>(overlayUnits)) {
    addUse(u.glb, {
      scene: "DEV-ONLY",
      label: "Blizzard 覆蓋層（本機開發，不出貨）",
      count: 12,
      detail: u.champId,
    });
  }

  // ---- 3. scenes
  interface SceneBuild {
    id: string;
    label: string;
    note: string;
    models: { path: string; count: number }[];
    procedural: Procedural[];
    /** extra per-frame animation channels not carried by a model row */
    extraChannels?: number;
    /** extra draw submissions that are not a resident mesh (shadow re-draws) */
    extraDraws?: { count: number; why: string };
    /** texture that lives outside any .glb (ground sets, icon sheets) */
    extraVram?: { bytes: number; why: string };
    /** per-scene budget overrides, with the reason the split differs */
    overrides?: { key: string; limit: number; warn: number; why: string }[];
    /**
     * COMBAT only: the champion slot is 12 seats and the roster spread is 7×,
     * so one number is a lie. `alt` re-costs the same scene with a median and a
     * best-case draft; the verdict is taken on the worst case (that is what a
     * budget is for) and the page prints all three side by side.
     */
    alt?: { id: string; label: string; models: { path: string; count: number }[] }[];
  }

  // the worst legal 12 picks: duplicates are allowed, so it is 12 copies of the
  // single heaviest champion model on each axis, not 12 distinct ones
  const champModels = [...champByModel.keys()]
    .map((k) => docById.get(k)?.glbPath)
    .filter((p): p is string => typeof p === "string" && byPath.has(p))
    .filter((p, i, a) => a.indexOf(p) === i);
  const worstBy = (f: (g: Glb) => number): Glb =>
    champModels.map((p) => byPath.get(p)!).sort((a, b) => f(b) - f(a))[0]!;
  const worstTriChamp = worstBy((g) => g.triangles);
  const sortedChamps = champModels.map((p) => byPath.get(p)!).sort((a, b) => a.triangles - b.triangles);
  const medianChamp = sortedChamps[Math.floor(sortedChamps.length / 2)]!;
  const bestChamp = sortedChamps.find((g) => g.triangles > 0)!;
  // texture does NOT dedupe across distinct glbs, so its worst case is the 12
  // heaviest DISTINCT champion models
  const worstTexDraft = champModels
    .map((p) => byPath.get(p)!)
    .sort((a, b) => b.vramBytes - a.vramBytes)
    .slice(0, 12);

  const scenes: SceneBuild[] = [];

  scenes.push({
    id: "login",
    label: "登入畫面",
    note: "每個玩家看到的第一幀，而且是在自適應畫質還沒有任何量測資料之前跑的。3D 部分只有 1 支 .glb，其餘全是程序生成 —— 只看 .glb 的預算會漏掉 233 個 mesh 與 64,964 面。",
    models: [{ path: "assets/models/menu/dragon2.glb", count: 2 }],
    procedural: RECORDED.login.parts.map((p) => ({
      label: p.label,
      triangles: p.triangles,
      meshes: p.meshes,
      note: RECORDED.login.method,
    })),
    overrides: [
      {
        key: "animChannels",
        limit: 1120,
        warn: 780,
        why: "登入畫面沒有 sim tick、沒有 netcode、沒有 HUD 重繪，所以那 3 ms 可以讓給動畫：5.0 ms ÷ (c_chan × 3) = 1,126。",
      },
      {
        key: "drawCalls",
        limit: 280,
        warn: 196,
        why: "同理，mesh 這一段可以拿到 7.0 ms；但它要付一整條 DefaultRenderingPipeline（bloom kernel 96 + FXAA + tonemap），所以只多給一點。",
      },
    ],
  });

  // The icon set is TWO populations with DIFFERENT decoded sizes, and VRAM is
  // driven by pixels, not by file bytes:
  //   - legacy w3x extracts, 64² PNG   (tools/w3x-import/extract_icons.py)
  //   - AI-generated set,   128² WebP  (tools/icon-gen/convert-webp.mjs)
  // Counting only `.png` — as this did before the WebP migration — silently
  // dropped the entire AI set from the budget and understated this scene by
  // 169 icons. Counting them all at 64² would understate it again, because a
  // 128² image decodes to 4× the RGBA8 of a 64² one however small the file is.
  // So: count each extension at its real edge. `.filter(Boolean)` is not enough
  // here — an unknown extension must not be silently priced at zero, so anything
  // that is neither .png nor .webp is left out of the count AND out of the prose.
  const ICON_EDGE: Record<string, number> = { ".png": 64, ".webp": 128 };
  const iconCounts = new Map<string, number>();
  for (const dir of ["champions", "abilities", "items"]) {
    const d = path.join(CONTENT, "assets/icons", dir);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      const ext = path.extname(f).toLowerCase();
      if (ICON_EDGE[ext] === undefined) continue;
      iconCounts.set(ext, (iconCounts.get(ext) ?? 0) + 1);
    }
  }
  const iconCount = [...iconCounts.values()].reduce((a, b) => a + b, 0);
  // ×4/3 for the mip chain, same convention as every other texture in this report.
  const iconVram = Math.round(
    // `!` is sound: line 557 only admits an ext into iconCounts once ICON_EDGE
    // has an entry for it, which TS cannot narrow across the Map.
    [...iconCounts].reduce((sum, [ext, n]) => sum + n * ICON_EDGE[ext]! ** 2 * 4, 0) * (4 / 3),
  );
  const iconBreakdown = [...iconCounts]
    .sort((a, b) => b[1] - a[1])
    .map(([ext, n]) => `${n} 張 ${ICON_EDGE[ext]}² ${ext.slice(1).toUpperCase()}`)
    .join(" + ");
  scenes.push({
    id: "champ-select",
    label: "選角畫面",
    note: "沒有任何 3D，沒有 Babylon。整頁只有 <img> 圖示，是全遊戲最便宜的一頁 —— 列在這裡是為了證明它被量過，而不是被忘記。",
    models: [],
    procedural: [],
    extraVram: {
      bytes: iconVram,
      why: `${iconCount} 張圖示（英雄/技能/道具）：${iconBreakdown}，瀏覽器解成 RGBA8。`,
    },
  });

  const interModels = [...interCounts].map(([p, count]) => ({ path: p, count }));
  // the local player's own champion stands at the counter
  interModels.push({ path: worstTriChamp.path, count: 1 });
  scenes.push({
    id: "intermission",
    label: "中場市集",
    note: "注意：中場是「自己的 Babylon scene 疊在競技場上」，GameApp 只跳過 arena 的 scene.render()，競技場的 mesh 與貼圖全部仍然常駐（GameApp.ts renderSuppressed）。所以一場比賽裡 VRAM 的最高點在這裡，不在戰鬥。",
    models: interModels,
    procedural: [{ label: "地台圓盤", triangles: 64, meshes: 1, note: "IntermissionScene 的程序地盤。" }],
    extraDraws: {
      count: RECORDED.culling.intermission.shadowRedraw,
      why: "唯一開 ShadowGenerator(1024) 的場景：78 個投影物件會被再畫一次到陰影貼圖，所以送出的 draw 是常駐 mesh 數再加 78。",
    },
    extraVram: {
      bytes: 1024 * 1024 * 4,
      why: "1024² 陰影貼圖本身。",
    },
  });

  for (const a of arenas) {
    const per = arenaDecor.get(a.id)!;
    const decorCount = [...per.values()].reduce((n, v) => n + v, 0);
    // ⚠️ GH#396 —— 這一格刻意**只看手擺的 `doc.decor`**，⛔ 不看散佈出來的那些。
    // 它問的是「這張圖有沒有用 pillar 擺設代替程序柱」，是一個**作者的意圖**，
    // 而不是「場上有沒有任何一個檔名含 pillar 的東西」。把散佈算進來的話，
    // 一條隨手擺柱子的裝飾規則會讓報告**少算**整組程序柱 —— 錯的方向。
    const hasPillar = (a.decor ?? []).some((d: { model: string }) => d.model.includes("pillar"));
    const decor = [...per].map(([p, count]) => ({ path: p, count }));
    scenes.push({
      id: `combat-${a.id.replace("arena.", "")}`,
      label: `戰鬥 · ${a.name}`,
      note: `12 名英雄以最壞合法陣容計（12 份 ${worstTriChamp.name}.glb —— champ select 與 MatchRoom 都沒有禁止重複選角）。dressArena 無條件擺滿兩個 zone，且預設 drawDistance 140 > 兩個 zone 的最大距離 128u，所以沒有東西會被 drawDistance 剔除。`,
      models: [...decor, { path: worstTriChamp.path, count: 12 }],
      procedural: arenaProcedural(a, decorCount, hasPillar),
      alt: [
        {
          id: "median",
          label: `中位陣容（12 隻 ${medianChamp.name} —— 名冊面數中位數）`,
          models: [...decor, { path: medianChamp.path, count: 12 }],
        },
        {
          id: "best",
          label: `面數最輕陣容（12 隻 ${bestChamp.name}）—— 注意它的動畫通道比中位陣容還多，軸與軸之間並不相關`,
          models: [...decor, { path: bestChamp.path, count: 12 }],
        },
      ],
    });
  }

  const dota = arenas.find((a) => a.id === "arena.dota");
  if (dota) {
    const per = arenaDecor.get("arena.dota")!;
    scenes.push({
      id: "settlement",
      label: "結算畫面",
      note: "沒有載入任何新資產：沿用剛才那座競技場的場景，只換相機（settlementCamera）並加上煙火粒子系統。這裡以最重的 dota 計，所以它的數字就是戰鬥的數字 —— 它沒有自己的資產預算，只有自己的相機。",
      models: [...[...per].map(([p, count]) => ({ path: p, count })), { path: worstTriChamp.path, count: 12 }],
      procedural: arenaProcedural(dota, [...per.values()].reduce((n, v) => n + v, 0), false),
    });
  }

  // ---- 4. score
  const line = (key: string) => LINES.find((l) => l.key === key)!;

  interface Cost {
    triangles: number;
    drawCalls: number;
    animChannels: number;
    textureBytes: number;
    vramBytes: number;
  }

  /** Cost one composition. Texture uploads ONCE per distinct .glb: AssetManager
   *  caches one AssetContainer per path, so 12 copies of one model are 12 lots
   *  of geometry and animation but ONE texture upload. */
  const cost = (s: SceneBuild, models: { path: string; count: number }[], worstCase = false): Cost => {
    let triangles = 0;
    let drawCalls = s.extraDraws?.count ?? 0;
    let animChannels = s.extraChannels ?? 0;
    let textureBytes = 0;
    let vramBytes = s.extraVram?.bytes ?? 0;
    const seen = new Set<string>();
    for (const m of models) {
      const g = byPath.get(m.path);
      if (!g) continue;
      triangles += g.triangles * m.count;
      drawCalls += g.meshes * m.count;
      animChannels += g.channelsPerFrame * m.count;
      if (!seen.has(g.path)) {
        seen.add(g.path);
        textureBytes += g.textureDiskBytes;
        vramBytes += g.vramBytes;
      }
    }
    for (const p of s.procedural) {
      triangles += p.triangles;
      drawCalls += p.meshes;
    }
    if (s.id.startsWith("combat-") || s.id === "settlement") {
      // the ground set is 4 × 512² PNG per style and lives in no .glb at all
      vramBytes += 4 * 512 * 512 * 4 * (4 / 3);
      // ⚠️⚠️ THIS PARAGRAPH DESCRIBES A CLIENT DEFECT THAT IS NOW FIXED, and the
      // arithmetic below has NOT yet been updated to match — GH#382. Until it is,
      // every `vramBytes` this file prints is an OVER-COUNT, and the 13 scene
      // entries in baseline.json's accepted list are that over-count, not debt.
      //
      // What was true, and why: byte-identical atlases in two .glb used to be two
      // GPU uploads. Babylon dedupes InternalTextures by `url`, but the glTF
      // loader builds `data:<rootUrl><file>#image<n>` — unique per .glb — so a
      // hit was structurally impossible. Measured: KayKit's one 15.4 KB
      // `dungeon_texture` is embedded in TWELVE shipping props at 5.33 MB VRAM
      // each. `apps/client/src/render/textureDedup.ts` now re-points duplicates
      // at one InternalTexture by CONTENT digest, so the real cost is per
      // distinct IMAGE, not per distinct .glb. Correcting the sum below drops
      // every combat scene by 26–48 MB and clears 11 of the 13 accepted entries.
      //
      // ⛔ Not done here because regenerating report.json writes outside this
      // lane's fence; the reasons in baseline.json name this ticket. The
      // draft that maximises texture is therefore NOT the one that maximises
      // draft that maximises texture is therefore NOT the one that maximises
      // geometry: 12 copies of one model is one upload, 12 distinct models is
      // twelve. Only the worst-case row swaps in the 12 heaviest distinct
      // champion models; the median/best rows keep their own honest cost.
      if (worstCase) {
        const distinct = worstTexDraft.reduce((n, g) => n + g.vramBytes, 0);
        vramBytes += distinct - (byPath.get(models[models.length - 1]!.path)?.vramBytes ?? 0);
      }
    }
    return { triangles, drawCalls, animChannels, textureBytes, vramBytes: Math.round(vramBytes) };
  };

  const sceneRows = scenes.map((s) => {
    const main = cost(s, s.models, true);
    const lineFor = (key: string): { warn: number; limit: number; why: string; overridden: boolean } => {
      const o = s.overrides?.find((x) => x.key === key);
      const base = line(key);
      return o
        ? { warn: o.warn, limit: o.limit, why: o.why, overridden: true }
        : { warn: base.warn, limit: base.limit, why: base.why, overridden: false };
    };
    const score = (c: Cost): Record<string, Verdict> => ({
      triangles: verdict(c.triangles, lineFor("triangles").warn, lineFor("triangles").limit),
      drawCalls: verdict(c.drawCalls, lineFor("drawCalls").warn, lineFor("drawCalls").limit),
      animChannels: verdict(c.animChannels, lineFor("animChannels").warn, lineFor("animChannels").limit),
      vramBytes: verdict(c.vramBytes, lineFor("vramBytes").warn, lineFor("vramBytes").limit),
    });
    return {
      id: s.id,
      label: s.label,
      note: s.note,
      models: s.models.map((m) => ({ id: m.path, count: m.count })),
      procedural: s.procedural,
      extraDraws: s.extraDraws ?? null,
      extraVram: s.extraVram ?? null,
      ...main,
      limits: ["triangles", "drawCalls", "animChannels", "vramBytes"].map((k) => ({
        key: k,
        label: line(k).label,
        unit: line(k).unit,
        ...lineFor(k),
      })),
      verdicts: score(main),
      variants: (s.alt ?? []).map((v) => {
        const c = cost(s, v.models);
        return { id: v.id, label: v.label, ...c, verdicts: score(c) };
      }),
    };
  });

  // ---- 5. per-model rows, classified
  const glbToDoc = new Map<string, any>();
  for (const d of modelDocs) glbToDoc.set(d.glbPath, d);

  const rows = glbs.map((g) => {
    const doc = glbToDoc.get(g.path);
    const u = uses.get(g.path) ?? [];
    /**
     * An asset nothing references is NOT judged against the tightest gate —
     * that would manufacture 40 breaches out of files that cost the game
     * nothing because they never load. It is classified `unused`, which is its
     * own (larger) problem and is counted separately.
     */
    /**
     * ⭐ 成員判準寫在 gate 上（`pathPrefix`），⛔ 不是這裡的一個 if：擺放數守衛
     * （`placement.test.ts`）讀的是同一格，所以報告頁與守衛不可能對「這個檔案是
     * 哪一條 gate」有兩種答案（GH#386 ①）。
     */
    const byPath = GATES.find((x) => x.pathPrefix && g.path.startsWith(x.pathPrefix));
    const role =
      u.length === 0
        ? "unused"
        : byPath
          ? byPath.role
          : u.some((x) => x.label === "英雄" || x.label === "造型（skin）" || x.scene === "DEV-ONLY")
            ? "champion"
            : g.group === "shop" || g.group === "menu"
              ? "hero-prop"
              : u.some((x) => x.scene.startsWith("COMBAT:"))
                ? "arena-decor"
                : u.some((x) => x.scene === "INTERMISSION")
                  ? "intermission-prop"
                  : "vfx-model";
    const gate = GATES.find((x) => x.role === role);
    const broken = g.triangles === 0 ? "zero-geometry" : g.triangles <= 30 ? "near-zero" : "";
    const worstCount = Math.max(1, ...u.map((x) => x.count));
    return {
      id: doc?.id ?? g.path,
      path: g.path,
      group: g.group,
      shipping: g.shipping,
      role,
      triangles: g.triangles,
      vertices: g.vertices,
      drawCalls: g.meshes,
      materials: g.materials,
      skins: g.skins,
      joints: g.joints,
      clips: g.clips,
      animChannels: g.channelsPerFrame,
      textureCount: g.images.length,
      textureBytes: g.textureDiskBytes,
      vramBytes: g.vramBytes,
      maxTextureEdge: g.maxTextureEdge,
      textures: g.images,
      fileBytes: g.fileBytes,
      worstCount,
      usedBy: u.map((x) => ({ kind: x.scene, label: x.label, count: x.count, detail: x.detail ?? "" })),
      broken,
      verdicts: (gate
        ? {
            triangles: verdict(g.triangles, gate.tris.warn, gate.tris.limit),
            drawCalls: verdict(g.meshes, gate.meshes.warn, gate.meshes.limit),
            maxTextureEdge: verdict(g.maxTextureEdge, gate.texEdge.warn, gate.texEdge.limit),
            animChannels: verdict(g.channelsPerFrame, gate.channels.warn, gate.channels.limit),
          }
        : {}) as Record<string, Verdict>,
      note: broken
        ? broken === "zero-geometry"
          ? "0 個 primitive —— mdx 粒子發射器沒有轉出任何幾何（#98）。它不是便宜的資產，它是壞的。"
          : "幾何近乎為零，但仍然吃掉 draw call 與材質 —— 純開銷（#98）。"
        : u.length === 0
          ? "沒有任何 champion / arena / 場景引用它 —— 它不會被載入，所以不佔任何一幀的預算；但它也不該留在出貨樹裡。"
          : "",
    };
  });

  // ---- 6. emit
  const sources = [
    "content/models/_index.json",
    "content/arenas/_index.json",
    "content/champions/_index.json",
    "apps/client/src/render/ArenaGround.ts",
    "apps/client/src/render/intermission/layout.ts",
    "tools/model-budget/limits.ts",
  ]
    .filter((p) => fs.existsSync(path.join(ROOT, p)))
    .map((p) => {
      const abs = path.join(ROOT, p);
      // ⛔ 沒有 mtime（GH#389）。`git checkout` / 部署會把每一個檔的 mtime 重設，
      //    所以它既不是內容也不是版本 —— 而它會讓這份進版控的產物憑空產生 diff。
      //    `sha256` 已經精確回答了「是不是同一份輸入」。
      return { path: p, sha256: sha256(abs), bytes: fs.statSync(abs).size };
    });

  const report = {
    schema: "model-budget@1",
    /**
     * ⭐ GH#389 —— 這裡本來是 `generatedAt: new Date()`，於是這份**進版控的產物**
     * 每跑一次就髒一次，把「有沒有東西該 commit」這個訊號稀釋掉。
     * ⛔ 產物的身分要從**輸入**推導，不是從時鐘：這一格是 `sources[]`（每一份輸入的
     * sha256）的雜湊 ⇒ 輸入變了它才變，重跑一百次都一樣。
     * ⚠️ 頁面上的「這份報告還準不準」也**不是**靠時間比大小（部署會把 mtime 全部
     * 重設成部署時間，任何「比模型舊」的判斷都會把正確部署的版本誤判成過期）——
     * 那件事由 `roles.ts::reportFreshness()` 逐份比 sha256、由頁面比 Content-Length 回答。
     */
    sourcesDigest: sha256Of(JSON.stringify(sources)),
    generatedBy: "tools/model-budget/emit_report.ts (task #99)",
    sources,
    limits: LINES,
    gates: GATES,
    costModel: { frameMs: FRAME_MS, cMeshMs: C_MESH_MS, cChanMs: C_CHAN_MS, derate: DERATE },
    frameSplit: COMBAT_FRAME_SPLIT,
    screens: sceneRows,
    models: rows,
    recorded: RECORDED,
    totals: {
      files: glbs.length,
      shipping: glbs.filter((g) => g.shipping).length,
      triangles: glbs.reduce((n, g) => n + g.triangles, 0),
      shippingTriangles: glbs.filter((g) => g.shipping).reduce((n, g) => n + g.triangles, 0),
      textureBytes: glbs.reduce((n, g) => n + g.textureDiskBytes, 0),
      vramBytes: glbs.reduce((n, g) => n + g.vramBytes, 0),
      zeroGeometry: rows.filter((r) => r.broken === "zero-geometry").length,
      nearZero: rows.filter((r) => r.broken === "near-zero").length,
      unused: rows.filter((r) => r.usedBy.length === 0).length,
    },
  };

  const out = outPath();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
  process.stdout.write(`wrote ${path.relative(ROOT, out)} — ${glbs.length} models, ${sceneRows.length} screens\n`);

  for (const s of sceneRows) {
    process.stdout.write(
      `  ${s.id.padEnd(20)} tris ${String(s.triangles).padStart(7)} · draws ${String(s.drawCalls).padStart(4)} · vram ${(s.vramBytes / 1048576).toFixed(1).padStart(6)} MB · chan ${String(s.animChannels).padStart(5)}  ${Object.entries(s.verdicts).filter(([, v]) => v !== "ok").map(([k, v]) => `${k}:${v}`).join(" ") || "ok"}\n`,
    );
  }

  /**
   * THE GATE IS A RATCHET, NOT AN ALARM.
   *
   * The project's worst-case combat frame is already over three lines today —
   * but that worst case requires an all-stand-in draft (itself tracked debt,
   * #81) and is derated by an ASSUMED 3× nobody has measured on a real device.
   * Making CI scream about that on every commit is precisely the "guard rail
   * that reports a fake emergency" the brief said is worse than none.
   *
   * So `--check` fails only when TODAY'S breaches are a SUPERSET of an accepted
   * baseline — i.e. a NEW import pushed a scene over a line it was not over
   * before, or a new shipping model breaks an import gate. Known debt stays
   * quiet; regressions do not. `--update-baseline` records the current state as
   * accepted (a deliberate, reviewable act).
   *
   * ⛔⛔ EXCEPT IT WAS NOT A DELIBERATE ACT — GH#382, and this is the fix.
   *
   * `--update-baseline` used to write `accepted: current` WHOLESALE: every
   * breach in the tree became a bare string, with one shared `note` for all of
   * them and NOT ONE WORD about why any individual line was tolerable. So the
   * price of accepting a new defect forever was one command and one line of
   * JSON, and afterwards nothing in the repository could tell "reviewed and
   * genuinely fine" from "regenerated blindly". The list reached 20 entries.
   *
   * That is the same shape CLAUDE.md keeps re-recording: a claim defended by
   * prose (here, `note`'s "must be a reviewed decision") outlives the prose's
   * expiry date and NOTHING GOES RED. So the reason is now DATA, not prose:
   *   • every accepted key must have a `reasons[key]` that is not the sentinel;
   *   • `--check` fails and NAMES the un-reasoned keys — regenerating the
   *     baseline therefore does not buy silence, which is the whole point;
   *   • `--update-baseline` PRESERVES the reasons already written, stamps new
   *     entries with the sentinel, and exits non-zero telling you to write one.
   * `accepted` keeps its exact old shape, so every existing reader still works.
   */
  const sceneBreaches = sceneRows.flatMap((s) =>
    Object.entries(s.verdicts)
      .filter(([, v]) => v === "over")
      .map(([k]) => `scene:${s.id}/${k}`),
  );
  const modelBreaches = rows
    .filter((r) => r.shipping)
    .flatMap((r) =>
      Object.entries(r.verdicts)
        .filter(([, v]) => v === "over")
        .map(([k]) => `model:${r.id}/${k}`),
    );
  const current = [...sceneBreaches, ...modelBreaches].sort();

  const readBaseline = (): { accepted: string[]; reasons: Record<string, string> } => {
    const b = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : {};
    return { accepted: b.accepted ?? [], reasons: b.reasons ?? {} };
  };
  /** An entry carrying this (or nothing) has not been reviewed — `--check` names it. */
  const UNREASONED = "⛔ 未填理由";
  const unreasoned = (keys: string[], reasons: Record<string, string>): string[] =>
    keys.filter((k) => !reasons[k] || reasons[k].trim() === "" || reasons[k].startsWith(UNREASONED));

  if (process.argv.includes("--update-baseline")) {
    const prior = readBaseline().reasons;
    // ⭐ Carry forward what a human already wrote; only NEW keys get the sentinel.
    const reasons: Record<string, string> = {};
    for (const k of current) reasons[k] = prior[k] ?? UNREASONED;
    fs.writeFileSync(
      BASELINE,
      `${JSON.stringify(
        {
          note: "Accepted budget breaches (task #99 · GH#382). ⛔ Every key needs a reasons[] entry — a bare key does not buy silence; --check names it.",
          updatedAt: new Date().toISOString(),
          accepted: current,
          reasons,
        },
        null,
        1,
      )}\n`,
    );
    const blank = unreasoned(current, reasons);
    process.stdout.write(`updated baseline — ${current.length} accepted breaches\n`);
    if (blank.length > 0) {
      process.stderr.write(
        `⛔ ${blank.length} accepted breach(es) have no reason — write one in baseline.json "reasons":\n` +
          blank.map((r) => `  ${r}`).join("\n") +
          `\n⭐ A reason must be REFUTABLE ("the 1024² atlas is shared by 12 props and the client now dedupes it"), ⛔ not "not got to it yet".\n`,
      );
      process.exit(1);
    }
    return;
  }

  if (check) {
    const { accepted, reasons } = readBaseline();
    const acceptedSet = new Set(accepted);
    const regressions = current.filter((c) => !acceptedSet.has(c));
    const fixed = accepted.filter((c) => !current.includes(c));
    if (fixed.length > 0)
      process.stdout.write(`✓ ${fixed.length} previously-accepted breach(es) are now fixed: ${fixed.join(", ")}\n  (run --update-baseline to tighten the ratchet)\n`);
    if (regressions.length > 0) {
      process.stderr.write(
        `NEW BUDGET REGRESSION (${regressions.length}) — a change pushed these over a line they were not over before:\n` +
          regressions.map((r) => `  ${r}`).join("\n") +
          `\nIf this is intended, run: pnpm exec tsx tools/model-budget/emit_report.ts --update-baseline\n`,
      );
      process.exit(1);
    }
    // ⭐ GH#382 — "accepted" without a written reason is the defect, not the debt.
    const blank = unreasoned(accepted, reasons);
    if (blank.length > 0) {
      process.stderr.write(
        `UNREASONED ACCEPTED BREACH (${blank.length}) — these sit in the ratchet with no stated reason:\n` +
          blank.map((r) => `  ${r}`).join("\n") +
          `\nWrite a refutable reason into baseline.json "reasons" for each. ⛔ Re-running --update-baseline will NOT silence this.\n`,
      );
      process.exit(1);
    }
    process.stdout.write(`✓ no new budget regressions (${current.length} breaches, all accepted AND reasoned)\n`);
  }
}

main();
