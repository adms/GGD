#!/usr/bin/env tsx
/**
 * RUNTIME PROBE (diagnostic, not a test) for MODEL SIZING — "is the champion
 * the same size in the arena and in the shop?" (GH#368)
 *
 * owner 2026-08-18:「多拉A夢在商店依然是巨大支，你是不是沒改到正常遊戲大小
 * （其他英雄也是?）」
 *
 * The arena height-normalizes every adopted .glb to TARGET_HEIGHT × the
 * champion's `relativeScale` (`ChampionView.tryUpgradeToGlb`, #150/GH#31). The
 * preview scenes — 商店 / 英靈殿 / 選擇英雄 / 回合勝者卡 (`StorePreview.show`)
 * and the 補給站 stall (`IntermissionScene.setChampion`) — used the model doc's
 * raw `scale` instead, which for an overlay doc is the hard-coded
 * `OVERLAY_MODEL_SCALE = 1` and for a shipped doc is whatever the importer
 * baked. This probe MEASURES both numbers off the real .glb bytes so the gap is
 * a table, not an opinion.
 *
 * It also reports which clip each scene RESTS in, because the second half of
 * GH#368 —「英靈殿許多英雄 3d model 並不是站直，下半身是傾斜」— is a clip
 * choice, not a transform: `ClipAnimator.resolveClips` falls back to the FIRST
 * group whose name contains "stand", and WC3 rigs concatenate families into one
 * name ("Attack Walk Stand Spin"), so a walk composite wins and the hero rests
 * mid-stride. `intermission/idlePerform.pickIdleClip` already solved exactly
 * this for the stall (犬妖-殺生丸 resting in "Stand - 2").
 *
 *   pnpm --filter @ggd/client exec tsx scripts/probeModelSizing.ts
 *   pnpm --filter @ggd/client exec tsx scripts/probeModelSizing.ts --json
 *
 * Reads: content/models/*.json, content/champions/*.json,
 *        content/models/_standin-overrides.json, the real .glb bytes on disk,
 *        and data/blizzard-overlay/MANIFEST.json when it is present (the
 *        overlay tree is git-ignored; without it the 40 stand-in champions are
 *        reported on their shipped stand-in doc, exactly as a build without
 *        VITE_GGD_FULL_ASSETS renders them).
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { resolveClips } = await import("../src/render/ClipAnimator");
const { pickIdleClip } = await import("../src/render/intermission/idlePerform");
const { TARGET_HEIGHT } = await import("../src/render/views/modelSizing");

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../..");
const CONTENT_DIR = process.env.GGD_CONTENT_DIR ?? join(REPO, "content");
const OVERLAY_DIR = process.env.GGD_OVERLAY_DIR ?? join(REPO, "data/blizzard-overlay");
const OVERLAY_URL_PREFIX = "assets/blizzard-local/";
const STOCK_CHAMPION_GLB_PREFIX = "assets/models/champions/";
const AS_JSON = process.argv.includes("--json");

/* --------------------------------------------------------------- glb geometry */

interface GlbJson {
  animations?: { name?: string }[];
  scenes?: { nodes?: number[] }[];
  scene?: number;
  nodes?: {
    mesh?: number;
    children?: number[];
    matrix?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
  }[];
  meshes?: { primitives?: { attributes?: Record<string, number> }[] }[];
  accessors?: { min?: number[]; max?: number[] }[];
}

function glbJson(buf: Buffer): GlbJson {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("not a glb");
  const chunkLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a) throw new Error("first chunk is not JSON");
  return JSON.parse(buf.subarray(20, 20 + chunkLen).toString("utf8")) as GlbJson;
}

type Mat4 = number[]; // column-major, glTF convention

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
      o[c * 4 + r] = s;
    }
  return o;
}

function trs(t: number[], q: number[], s: number[]): Mat4 {
  const [x, y, z, w] = q as [number, number, number, number];
  const [sx, sy, sz] = s as [number, number, number];
  const m: Mat4 = [
    (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    t[0]!, t[1]!, t[2]!, 1,
  ];
  return m;
}

function apply(m: Mat4, p: [number, number, number]): [number, number, number] {
  const [x, y, z] = p;
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  ];
}

/**
 * World-space bounding box of a .glb's rest pose, the same quantity Babylon's
 * `getHierarchyBoundingVectors` reports right after `instantiateModelsToScene`
 * (before any clip has played): every primitive's POSITION accessor min/max —
 * the 8 corners — pushed through its node's world matrix.
 */
function restBounds(
  json: GlbJson,
  hidden: ReadonlySet<number> = new Set(),
): { min: number[]; max: number[] } | null {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const nodes = json.nodes ?? [];
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? nodes.map((_, i) => i);
  const walk = (idx: number, parent: Mat4): void => {
    const n = nodes[idx];
    if (!n) return;
    const local = n.matrix
      ? (n.matrix as Mat4)
      : trs(n.translation ?? [0, 0, 0], n.rotation ?? [0, 0, 0, 1], n.scale ?? [1, 1, 1]);
    const world = mul(parent, local);
    if (n.mesh !== undefined) {
      const prims = json.meshes?.[n.mesh]?.primitives ?? [];
      for (let pi = 0; pi < prims.length; pi++) {
        // `hiddenPrimitives` — the same index space `gltfPrimitiveIndexOf` reads
        // off Babylon's `${node}_primitive${i}` mesh names.
        if (prims.length > 1 && hidden.has(pi)) continue;
        const acc = json.accessors?.[prims[pi]!.attributes?.POSITION ?? -1];
        if (!acc?.min || !acc.max) continue;
        for (let corner = 0; corner < 8; corner++) {
          const p: [number, number, number] = [
            (corner & 1 ? acc.max : acc.min)[0]!,
            (corner & 2 ? acc.max : acc.min)[1]!,
            (corner & 4 ? acc.max : acc.min)[2]!,
          ];
          const w = apply(world, p);
          for (let i = 0; i < 3; i++) {
            if (w[i]! < min[i]!) min[i] = w[i]!;
            if (w[i]! > max[i]!) max[i] = w[i]!;
          }
        }
      }
    }
    for (const c of n.children ?? []) walk(c, world);
  };
  for (const r of roots) walk(r, IDENTITY);
  return Number.isFinite(min[1]) ? { min, max } : null;
}

/* ------------------------------------------------------------------- the data */

interface ModelDocLite {
  id: string;
  glbPath: string;
  scale: number;
  clipMap?: Record<string, string>;
}

async function readJson<T>(abs: string): Promise<T> {
  return JSON.parse(await readFile(abs, "utf8")) as T;
}

const modelIndex = await readJson<{ entries?: { id: string; path: string }[] }>(
  join(CONTENT_DIR, "models/_index.json"),
);
const docs = new Map<string, ModelDocLite>();
for (const e of modelIndex.entries ?? []) {
  const d = await readJson<ModelDocLite>(join(CONTENT_DIR, e.path)).catch(() => null);
  if (d?.glbPath) docs.set(d.id, d);
}

const champIndex = await readJson<{ entries?: { id: string; path: string }[] }>(
  join(CONTENT_DIR, "champions/_index.json"),
);
const champs: { id: string; name: string; modelKey: string }[] = [];
for (const e of champIndex.entries ?? []) {
  const c = await readJson<{ id: string; name?: string; modelKey?: string }>(
    join(CONTENT_DIR, e.path),
  ).catch(() => null);
  if (c?.modelKey) champs.push({ id: c.id, name: c.name ?? c.id, modelKey: c.modelKey });
}

const overrides = (
  await readJson<{ overrides?: Record<string, { relativeScale?: number }> }>(
    join(CONTENT_DIR, "models/_standin-overrides.json"),
  )
).overrides ?? {};

/** champId → overlay glb (content-relative), when the git-ignored tree is here. */
const overlay = new Map<string, { glb: string; clipMap?: Record<string, string> }>();
if (existsSync(join(OVERLAY_DIR, "MANIFEST.json"))) {
  const man = await readJson<{
    units?: Record<string, { champId?: string; glb?: string; clipMap?: Record<string, string> }>;
  }>(join(OVERLAY_DIR, "MANIFEST.json"));
  for (const u of Object.values(man.units ?? {})) {
    if (u.champId && u.glb) overlay.set(u.champId, { glb: u.glb, clipMap: u.clipMap });
  }
}

/** Absolute path for a content-relative glb, overlay tree included. */
function glbAbs(rel: string): string {
  return rel.startsWith(OVERLAY_URL_PREFIX)
    ? join(OVERLAY_DIR, rel.slice(OVERLAY_URL_PREFIX.length))
    : join(CONTENT_DIR, rel);
}

/** glbPath → declared gore primitives (overlay sidecar + shipped docs). */
const goreByGlb = new Map<string, readonly number[]>();
{
  const sidecar = await readJson<{
    models?: Record<string, { hiddenPrimitives?: number[] }>;
  }>(join(CONTENT_DIR, "models/_overlay-hidden-geometry.json")).catch(() => ({}) as never);
  for (const [glb, entry] of Object.entries(sidecar.models ?? {})) {
    if (entry.hiddenPrimitives?.length) goreByGlb.set(glb, entry.hiddenPrimitives);
  }
  for (const d of docs.values()) {
    const hp = (d as { hiddenPrimitives?: number[] }).hiddenPrimitives;
    if (hp?.length) goreByGlb.set(d.glbPath, hp);
  }
}

interface Measured {
  /** rest-pose height INCLUDING the gore sheet — what every preview scene measured */
  hAll: number;
  /** rest-pose height of the drawn body only — what the arena measures */
  hBody: number;
  /** lowest point of the whole hierarchy, and of the body (native units) */
  minAll: number;
  minBody: number;
  clips: string[];
  gore: boolean;
}

const glbCache = new Map<string, Measured | null>();
async function measure(rel: string): Promise<Measured | null> {
  if (glbCache.has(rel)) return glbCache.get(rel)!;
  let out: Measured | null = null;
  try {
    const json = glbJson(await readFile(glbAbs(rel)));
    const hidden = new Set(goreByGlb.get(rel) ?? []);
    const all = restBounds(json);
    const body = restBounds(json, hidden);
    out =
      all && body
        ? {
            hAll: all.max[1]! - all.min[1]!,
            hBody: body.max[1]! - body.min[1]!,
            minAll: all.min[1]!,
            minBody: body.min[1]!,
            clips: (json.animations ?? []).map((a, i) => a.name ?? `anim-${i}`),
            gore: hidden.size > 0,
          }
        : null;
  } catch {
    out = null;
  }
  glbCache.set(rel, out);
  return out;
}

/* ------------------------------------------------------------------- the sweep */

interface Row {
  champId: string;
  name: string;
  glb: string;
  gore: boolean;
  nativeAll: number;
  nativeBody: number;
  docScale: number;
  relativeScale: number;
  /** ChampionView.tryUpgradeToGlb — 戰鬥 + 結算. The intended size. */
  arenaH: number;
  /** what the preview scenes rendered BEFORE GH#368 (doc.scale, gore included) */
  beforeH: number;
  /** how far off the podium the gore sheet lifted the feet, in rendered units */
  beforeFloat: number;
  ratio: number;
  idleResolved: string | null;
  idlePreferred: string | null;
}

const MIN_NATIVE_HEIGHT = 0.05;
const rows: Row[] = [];
for (const c of champs) {
  const shipped = docs.get(c.modelKey);
  if (!shipped) continue;
  // the resolver the three preview scenes and the arena BOTH go through
  const ov = shipped.glbPath.startsWith(STOCK_CHAMPION_GLB_PREFIX) ? overlay.get(c.id) : undefined;
  const glb = ov?.glb ?? shipped.glbPath;
  const clipMap = (ov ? (ov.clipMap ?? undefined) : shipped.clipMap) as
    | Record<string, string>
    | undefined;
  const docScale = ov ? 1 : shipped.scale; // OVERLAY_MODEL_SCALE
  const m = await measure(glb);
  if (!m) continue;
  const rel = overrides[c.id]?.relativeScale ?? 1;
  const base = m.hBody > MIN_NATIVE_HEIGHT ? TARGET_HEIGHT / m.hBody : docScale;
  const arenaH = m.hBody * base * rel;
  const beforeH = m.hAll * docScale;
  const groups = m.clips.map((name) => ({ name }));
  const resolved = resolveClips(groups, clipMap as never);
  const idleIdx = resolved.get("idle");
  rows.push({
    champId: c.id,
    name: c.name,
    glb,
    gore: m.gore,
    nativeAll: m.hAll,
    nativeBody: m.hBody,
    docScale,
    relativeScale: rel,
    arenaH,
    beforeH,
    beforeFloat: (m.minBody - m.minAll) * docScale,
    ratio: arenaH > 0 ? beforeH / arenaH : Infinity,
    idleResolved: idleIdx === undefined ? null : (m.clips[idleIdx] ?? null),
    idlePreferred: pickIdleClip(m.clips),
  });
}

rows.sort((a, b) => b.ratio - a.ratio);

if (AS_JSON) {
  console.log(JSON.stringify(rows, null, 1));
} else {
  const f = (n: number): string => n.toFixed(2).padStart(7);
  console.log(`# GH#368 model sizing — ${rows.length} champions, TARGET_HEIGHT=${TARGET_HEIGHT}`);
  console.log("# arena_u = 戰鬥/結算 (already right) · before_u = 商店/英靈殿/選人/攤位 BEFORE the fix");
  console.log("# AFTER the fix every preview scene renders arena_u, so ratio becomes 1.00 for all.");
  console.log(
    "ratio  before_u  arena_u  float_u  rel   gore  champion                       idle(resolved) | idle(preferred)",
  );
  for (const r of rows) {
    const flag = Math.abs(r.ratio - 1) > 0.05 ? "!" : " ";
    const clip =
      r.idleResolved === r.idlePreferred
        ? `${r.idleResolved ?? "-"}`
        : `${r.idleResolved ?? "-"} | ${r.idlePreferred ?? "-"}  <VARIANT`;
    console.log(
      `${flag}${f(r.ratio)} ${f(r.beforeH)} ${f(r.arenaH)} ${f(r.beforeFloat)} ${r.relativeScale
        .toFixed(2)
        .padStart(5)}  ${r.gore ? "GORE" : "    "}  ${(r.champId + " " + r.name).padEnd(30).slice(0, 30)} ${clip}`,
    );
  }
  const off = rows.filter((r) => Math.abs(r.ratio - 1) > 0.05);
  const gore = rows.filter((r) => r.gore);
  const variant = rows.filter((r) => r.idleResolved !== r.idlePreferred);
  console.log(
    `\n# ${off.length}/${rows.length} champions rendered a DIFFERENT size in the preview scenes than in the arena`,
  );
  console.log(
    `# ${gore.length}/${rows.length} carry a gore/corpse primitive the preview scenes drew AND measured`,
  );
  console.log(`# ${variant.length}/${rows.length} rest in a clip the shop's picker would NOT choose`);
}
