/**
 * optimize — the OFFLINE BATCH OPTIMISER. For every model over a budget
 * threshold it resizes/recompresses oversized textures and (optionally,
 * dependency-gated) decimates geometry, and it writes the result to a SEPARATE
 * tree so the originals are never touched.
 *
 *   pnpm budget:optimize <glb-or-dir>... [--role R]            # DRY RUN (default)
 *   pnpm budget:optimize <glb-or-dir>... [--role R] --apply    # write to --out
 *
 * ─ THE ONE RULE THAT IS NOT NEGOTIABLE ──────────────────────────────────────
 * This repo has NO VERSION CONTROL (#65) and a destructive pipeline has already
 * eaten irreplaceable files once (the BGM render overwrote the 魔王魂 originals,
 * task context). So:
 *   • the optimiser NEVER writes in place. Output goes under --out (default
 *     tools/model-budget/optimized-out/), mirroring the content path.
 *   • it is idempotent and resumable: each output carries a `<out>.opt.json`
 *     hash sidecar (sha256 of the source bytes + the exact plan), in the manner
 *     of tools/tts-gen. A rerun skips anything already produced from the same
 *     source with the same plan; --force regenerates.
 *   • adoption is a SEPARATE, human act: review the --out tree and its manifest,
 *     then copy what you accept over the originals yourself. The optimiser does
 *     not, and will not, do that copy.
 *
 * ─ DEPENDENCIES, HONESTLY ────────────────────────────────────────────────────
 * TEXTURE stage — ZERO new dependencies. It resizes with ffmpeg, which the audio
 * pipeline (tools/tts-gen, tools/bgm-gen) already requires and which is
 * arm64-native here. The glb is rebuilt in pure TS (glb.ts) with every geometry,
 * skin and animation byte copied verbatim; `geometryDiff` proves afterwards that
 * only image bytes moved. (This ffmpeg build has no webp ENCODER, so a webp
 * source is re-encoded to png — VRAM, the budget axis, is unaffected by the
 * container; the size change is recorded.)
 *
 * GEOMETRY stage — needs @gltf-transform/core + @gltf-transform/functions +
 * meshoptimizer, which are NOT in the workspace. They are installed in ISOLATION
 * under tools/model-budget/.optvendor (run optimize/bootstrap-geometry.sh); that
 * does NOT touch pnpm-lock.yaml, so concurrent sessions and frozen-lockfile CI
 * are unaffected. meshoptimizer's simplifier is skin-aware — it carries JOINTS_0
 * and WEIGHTS_0 through the decimation — and every decimated candidate is then
 * checked for RIG SURVIVAL (skeleton, joints, clips, channels, weight
 * attributes, bbox drift) and REJECTED if the rig changed. If the deps are
 * absent, the geometry stage prints the bootstrap command and skips. It never
 * falls back to Babylon's simplifier, which cannot preserve skin weights — a
 * decimator that destroys a rig is worse than the oversized model it replaced.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  geometryDiff,
  measureGlb,
  readGlb,
  readImages,
  rebuildGlb,
  sha256,
  vramOf,
  type GlbMetrics,
  type Img,
} from "./glb";
import { CONTENT, ROOT, ROLE_NAMES, contentUrl, gateFor, roleFromReport, type Role } from "./roles";
import { checkRig, type RigCheck } from "./rig";
import { HERO_MODEL_ADOPTION_POLICY } from "../../packages/shared/src/content/modelUpload/budget";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VENDOR = path.join(HERE, ".optvendor");
const DECIMATE_WORKER = path.join(HERE, "optimize", "decimate.mjs");
const ATLAS_WORKER = path.join(HERE, "optimize", "atlas_pack.py");
const MERGE_WORKER = path.join(HERE, "optimize", "merge_prims.py");
const VALIDATE_GLB = path.join(ROOT, "tools/w3x-import/validate_glb.mts");
const DEFAULT_OUT = path.join(HERE, "optimized-out");

// ---- args -------------------------------------------------------------------

interface Args {
  inputs: string[];
  role: Role | null;
  out: string;
  apply: boolean;
  geometry: boolean;
  /** GH#1198/#1175：把「畫起來一樣」的 primitive 接成一塊 —— ⭐ 不改變畫面。 */
  merge: boolean;
  atlas: boolean;
  atlasQuality: number;
  texEdge: number | null;
  trisTarget: number | null;
  lockBlend: boolean;
  force: boolean;
  json: boolean;
  babylonVerify: boolean;
}

function fail(msg: string): never {
  process.stderr.write(`optimize: ${msg}\n`);
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    inputs: [],
    role: null,
    out: DEFAULT_OUT,
    apply: false,
    geometry: false,
    merge: false,
    atlas: false,
    atlasQuality: 0.45,
    texEdge: null,
    trisTarget: null,
    force: false,
    json: false,
    babylonVerify: false,
    lockBlend: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]!;
    if (t === "--role") {
      const r = argv[++i];
      if (!r || !ROLE_NAMES.includes(r as Role)) fail(`--role must be one of: ${ROLE_NAMES.join(", ")}`);
      a.role = r as Role;
    } else if (t === "--out") a.out = path.resolve(argv[++i] ?? fail("--out needs a dir"));
    else if (t === "--apply") a.apply = true;
    else if (t === "--geometry") a.geometry = true;
    else if (t === "--merge") a.merge = true;
    else if (t === "--lock-blend") a.lockBlend = true;
    else if (t === "--atlas") a.atlas = true;
    else if (t === "--atlas-quality") a.atlasQuality = Number(argv[++i]);
    else if (t === "--tex-edge") a.texEdge = Number(argv[++i]);
    else if (t === "--tris-target") a.trisTarget = Number(argv[++i]);
    else if (t === "--force") a.force = true;
    else if (t === "--json") a.json = true;
    else if (t === "--babylon-verify") a.babylonVerify = true;
    else if (t === "--help" || t === "-h") {
      process.stdout.write(
        "usage: tsx tools/model-budget/optimize.ts <glb-or-dir>... [--role R] [--apply]\n" +
          "  [--merge] [--geometry] [--lock-blend] [--atlas] [--atlas-quality Q] [--out DIR] [--tex-edge N] [--tris-target N] [--force] [--json] [--babylon-verify]\n" +
          "  --merge 把畫法相同的 primitive 接成一塊（⭐ 不改變畫面）；--atlas 才會重排貼圖（⛔ 會改變畫面）\n" +
          `roles: ${ROLE_NAMES.join(", ")}\n` +
          "default is a DRY RUN; nothing is written without --apply, and never in place.\n",
      );
      process.exit(0);
    } else if (t.startsWith("-")) fail(`unknown flag ${t}`);
    else a.inputs.push(t);
  }
  if (a.inputs.length === 0) fail("give at least one .glb file or a directory");
  if (a.texEdge !== null && (!Number.isFinite(a.texEdge) || a.texEdge < 8)) fail("--tex-edge must be ≥ 8");
  if (a.trisTarget !== null && (!Number.isFinite(a.trisTarget) || a.trisTarget < 4)) fail("--tris-target must be ≥ 4");
  return a;
}

// ---- planning ---------------------------------------------------------------

/** Largest power of two ≤ n. */
const floorPow2 = (n: number): number => 1 << Math.floor(Math.log2(Math.max(1, n)));

interface TexAction {
  imageIndex: number;
  bufferView: number;
  from: { w: number; h: number; format: string; bytes: number };
  to: { w: number; h: number; format: string };
  vramBefore: number;
  vramAfter: number;
}

interface GeoAction {
  fromTris: number;
  targetTris: number;
  ratio: number;
  /** GH#1186：半透明（BLEND）的特效薄片不減面，削減量由其餘網格承擔（`--lock-blend`）。 */
  lockBlend?: true;
}

/**
 * ⭐ 圖集 stage 要解的東西 **texture stage 結構上解不掉**：後者把每一張貼圖縮小，
 * ⛔ 它一張都不會**減少** —— 而 draw call 數的是「有幾種畫法」，⛔ 不是貼圖多大。
 * ⇒ 一顆「7 張不同貼圖」的模型不管縮到多小都還是 7 個 draw call。
 *
 * 規劃在 `optimize/atlas_pack.py`（它要真的解 PNG、量 UV 範圍、重排版面）；
 * 這裡只記「要不要跑」與「目標是幾個 draw call」。
 */
interface AtlasAction {
  fromDraws: number;
  targetDraws: number;
  edge: number;
  quality: number;
}

/**
 * ⭐ 合併 stage —— ⛔ 它與圖集**不是同一件事**，差別在**會不會改變畫面**：
 *
 * | stage | 它做什麼 | 畫面 |
 * |---|---|---|
 * | `--merge` | 把**渲染狀態逐位元組相同**的 primitive 接成一塊 | ⭐ **一個像素都不變** |
 * | `--atlas` | 重排貼圖版面、每一格按品質底線縮小 | ⛔ **會變**（所以要人審） |
 *
 * ⇒ ⭐ 合併是「免費」的那一半：它永遠該先跑。⛔ 而在 GH#1198 之前這一支**根本不存在**
 * 於離線批次裡 —— 上游 `merge_glb_prims.py` 是就地寫的，⛔ 指著出貨檔跑就違反了本檔
 * 開頭那條「絕不就地覆蓋」。⇒ worker 先複製再接複本。
 *
 * ⚠️ 半透明（BLEND）**不接** —— 接起來會換掉包圍球中心，而 Babylon 逐塊按中心排
 * 半透明的繪製順序 ⇒ 那就**會**改變畫面。判準住 `glb_draw_state`，⛔ 這裡沒有第二份。
 */
interface MergeAction {
  fromDraws: number;
  targetDraws: number;
  blendPrims: number;
}

interface Plan {
  file: string;
  outFile: string;
  sidecar: string;
  role: string;
  roleSource: "flag" | "report" | "unresolved";
  metrics: GlbMetrics;
  tex: TexAction[];
  geo: GeoAction | null;
  merge: MergeAction | null;
  atlas: AtlasAction | null;
  vramBefore: number;
  vramAfter: number;
  fileBytesBefore: number;
  skip: "" | "no-op" | "up-to-date";
}

function outPathFor(file: string, out: string): string {
  const abs = path.resolve(file);
  const rel = abs.startsWith(CONTENT + path.sep) ? contentUrl(file) : path.basename(abs);
  return path.join(out, rel);
}

function planFile(file: string, args: Args): Plan {
  const metrics = measureGlb(file);

  let role: string | null = args.role;
  let roleSource: Plan["roleSource"] = args.role ? "flag" : "unresolved";
  if (!role) {
    const fr = roleFromReport(file);
    if (fr && fr.role !== "unused") {
      role = fr.role;
      roleSource = "report";
    }
  }
  const gate = role ? gateFor(role) : undefined;

  // texture target: --tex-edge, else the role's warn edge floored to a power of two
  const texTarget = args.texEdge ?? (gate ? floorPow2(gate.texEdge.warn) : 0);
  const tex: TexAction[] = [];
  if (texTarget > 0) {
    for (const im of metrics.images) {
      const edge = Math.max(im.w, im.h);
      if (edge <= texTarget || edge === 0) continue;
      const scale = texTarget / edge;
      const nw = Math.max(1, Math.round(im.w * scale));
      const nh = Math.max(1, Math.round(im.h * scale));
      const outFmt = im.format === "png" || im.format === "jpeg" ? im.format : "png"; // no webp encoder
      tex.push({
        imageIndex: im.index,
        bufferView: im.bufferView,
        from: { w: im.w, h: im.h, format: im.format, bytes: im.diskBytes },
        to: { w: nw, h: nh, format: outFmt },
        vramBefore: vramOf(im.w, im.h),
        vramAfter: vramOf(nw, nh),
      });
    }
  }

  // geometry target: only when asked. Hero adoption has its own owner-set
  // trigger (>10k) and target (<=8k), independent of the wider runtime budget.
  let geo: GeoAction | null = null;
  if (args.geometry) {
    const heroAdoption = role === "champion" && args.trisTarget === null;
    const trisTarget = args.trisTarget ?? (heroAdoption
      ? HERO_MODEL_ADOPTION_POLICY.decimatedTargetTrianglesMax
      : (gate ? gate.tris.warn : 0));
    const trigger = heroAdoption
      ? HERO_MODEL_ADOPTION_POLICY.decimateWhenTrianglesAbove
      : trisTarget;
    if (trisTarget > 0 && metrics.triangles > trigger && metrics.skins >= 0) {
      geo = {
        fromTris: metrics.triangles, targetTris: trisTarget, ratio: trisTarget / metrics.triangles,
        ...(args.lockBlend ? { lockBlend: true as const } : {}),
      };
    }
  }

  // merge target: only when asked. ⭐ ⛔ 沒有 gate 條件 —— 合併不改變畫面，所以
  // 「有沒有超過上限」⛔ 不是它該問的問題；能接就是純賺。⚠️ 但**能不能接**只有
  // worker 答得出來（判準住上游），⇒ 只在有兩塊以上時才花那一次 exec。
  let merge: MergeAction | null = null;
  if (args.merge && metrics.meshes >= 2) {
    const probe = probeMerge(file);
    if (probe.mergeable) {
      merge = { fromDraws: probe.beforeDraws, targetDraws: probe.afterDraws, blendPrims: probe.blendPrims ?? 0 };
    }
  }

  // atlas target: only when asked, and only for models the mesh gate actually blocks.
  // ⛔ 圖集**會改變畫面**（貼圖被重排、每一格被縮小），所以它⛔ 不是「順便做一下」——
  // 沒有超過 draw call 上限的模型不跑它。
  let atlas: AtlasAction | null = null;
  if (args.atlas && gate && metrics.meshes > gate.meshes.limit) {
    atlas = { fromDraws: metrics.meshes, targetDraws: gate.meshes.limit, edge: floorPow2(gate.texEdge.limit), quality: args.atlasQuality };
  }

  // ⛔ 圖集跑的時候**不要**再跑 texture stage：圖集自己就夾在 `--edge` 內，
  //   而先 512→256 再 256→128 是**兩次**重取樣 —— 同一個結果，多糊一次。
  if (atlas) tex.length = 0;

  const vramBefore = metrics.vramBytes;
  const vramSaved = tex.reduce((n, t) => n + (t.vramBefore - t.vramAfter), 0);
  const outFile = outPathFor(file, args.out);
  const plan: Plan = {
    file,
    outFile,
    sidecar: `${outFile}.opt.json`,
    role: role ?? "(unresolved)",
    roleSource,
    metrics,
    tex,
    geo,
    merge,
    atlas,
    vramBefore,
    vramAfter: vramBefore - vramSaved,
    fileBytesBefore: metrics.fileBytes,
    skip: tex.length === 0 && !geo && !merge && !atlas ? "no-op" : "",
  };
  return plan;
}

/** Stable idempotence key: source bytes + the plan that would be applied. */
function planKey(file: string, plan: Plan): string {
  const src = sha256(fs.readFileSync(file));
  const shape = {
    src,
    tex: plan.tex.map((t) => ({ i: t.imageIndex, to: t.to })),
    geo: plan.geo ? { t: plan.geo.targetTris, ...(plan.geo.lockBlend ? { lb: 1 } : {}) } : null,
    // ⭐ 合併只在**規劃到的時候**才進指紋 —— ⛔ 不是無條件加一格 `merge: null`：
    //   後者會讓**每一份**既有側車的 key 都變掉（＝全部重跑一次），而它們的產物
    //   一個位元組都沒變。⇒ 只有真的要接的那幾顆需要新的 key。
    ...(plan.merge ? { merge: { d: plan.merge.targetDraws } } : {}),
    atlas: plan.atlas ? { d: plan.atlas.targetDraws, e: plan.atlas.edge, q: plan.atlas.quality } : null,
    tool: TOOL_VERSION,
  };
  return sha256(Buffer.from(JSON.stringify(shape)));
}
// @3（GH#1198）：圖集 stage 會烘 tile／整格平移、同圖 emissive 一起搬 ⇒ 同一份來源的產物變了，舊側車不可以再算「up-to-date」。
const TOOL_VERSION = "model-budget/optimize@3";

// ---- texture resize (ffmpeg) ------------------------------------------------

function haveBin(bin: string): boolean {
  try {
    execFileSync("which", [bin], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Resize one image's raw bytes with ffmpeg. Returns the new encoded bytes. */
function resizeImage(src: Buffer, srcFormat: string, nw: number, nh: number, outFormat: string, tmp: string): Buffer {
  const inExt = srcFormat === "webp" ? "webp" : srcFormat === "jpeg" ? "jpg" : "png";
  const inFile = path.join(tmp, `in.${inExt}`);
  const outFile = path.join(tmp, `out.${outFormat === "jpeg" ? "jpg" : outFormat}`);
  fs.writeFileSync(inFile, src);
  execFileSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-i", inFile, "-vf", `scale=${nw}:${nh}:flags=lanczos`, outFile],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const out = fs.readFileSync(outFile);
  fs.rmSync(inFile, { force: true });
  fs.rmSync(outFile, { force: true });
  return out;
}

// ---- geometry (isolated gltf-transform + meshoptimizer) ---------------------

/**
 * ⭐ 找一個**真的載得動 Pillow** 的 python —— ⛔ 不是「PATH 上第一個 python3」。
 *
 * ⚠️ 這是量到的，⛔ 不是預防性的：這台機器的 node 跑在 **x64（Rosetta）**下，
 * 而 `/usr/local/bin/python3` 是 universal binary ⇒ 它**繼承父行程的架構**，
 * 於是同一條路徑在 shell 裡是 arm64（Pillow 載得動）、被 node spawn 出來卻是
 * x86_64（`incompatible architecture (have 'arm64', need 'x86_64')`）。
 * ⭐ 判準只有一個：**它 import 得動 PIL 嗎** —— ⛔ 不是它叫什麼名字、住在哪裡。
 */
let PY: { cmd: string; pre: string[] } | null = null;
function pythonForAtlas(): { cmd: string; pre: string[] } {
  if (PY) return PY;
  const cands: { cmd: string; pre: string[] }[] = [
    ...(process.env.GGD_PYTHON ? [{ cmd: process.env.GGD_PYTHON, pre: [] as string[] }] : []),
    { cmd: "python3", pre: [] },
    ...(process.platform === "darwin" ? [{ cmd: "arch", pre: ["-arm64", "python3"] }] : []),
    { cmd: "/opt/homebrew/bin/python3", pre: [] },
  ];
  for (const c of cands) {
    try {
      // ⛔ 探針要 import **`PIL.Image`**,⛔ 不是 `PIL` —— 後者只載到純 python 的
      //   `__init__.py`,⭐ 而壞掉的是原生的 `_imaging`。一個只驗到一半的探針會
      //   **在它最需要說話的時候沉默**（它剛剛就這樣放行了一個載不動的 python）。
      execFileSync(c.cmd, [...c.pre, "-c", "from PIL import Image; Image.new('RGBA',(2,2))"], { stdio: "ignore" });
      PY = c;
      return c;
    } catch {
      /* try the next one */
    }
  }
  fail("no python3 on PATH can import Pillow (pip3 install pillow) — required for the atlas stage");
}

/**
 * ⭐ 合併 stage 的 python —— ⛔ 刻意**不用** `pythonForAtlas()`：那一支的探針是
 * 「import 得動 Pillow 嗎」，⭐ 而合併**一張圖都不碰**（它只接幾何）。
 * ⇒ 拿圖集的探針去擋合併，會讓一台沒裝 Pillow 的機器連「免費且不改變畫面」的那一半
 * 都跑不了 —— ⛔ 一個與它要做的事無關的前置條件。
 */
function pythonPlain(): string {
  return process.env.GGD_PYTHON || "python3";
}

/**
 * ⭐ 合併 stage 的「畫面沒變」證據：**每一張貼圖逐位元組相同**。
 *
 * ⚠️ 它是 `geometryDiff` 的**反面** —— 那一支證明「只有圖動了」，這一支證明
 * 「圖**沒**動」。⛔ 兩者都不可以用對方代替：合併本來就會改幾何（那是它的工作），
 * 所以 `geometryDiff` 對它永遠回報 differs；⭐ 而真正要釘住的不變量是**像素**。
 *
 * 回傳 null ＝ 一模一樣；否則回傳第一個差異的描述。
 */
function texturesIdentical(a: string, b: string): string | null {
  const ga = readGlb(a);
  const gb = readGlb(b);
  const ia = readImages(ga);
  const ib = readImages(gb);
  if (ia.length !== ib.length) return `image count ${ia.length} → ${ib.length}`;
  for (let i = 0; i < ia.length; i++) {
    const x = ia[i]!;
    const y = ib[i]!;
    if (x.w !== y.w || x.h !== y.h) return `image #${i} ${x.w}×${x.h} → ${y.w}×${y.h}`;
    const bx = ga.bin!.subarray(
      ga.json.bufferViews[x.bufferView].byteOffset ?? 0,
      (ga.json.bufferViews[x.bufferView].byteOffset ?? 0) + ga.json.bufferViews[x.bufferView].byteLength,
    );
    const by = gb.bin!.subarray(
      gb.json.bufferViews[y.bufferView].byteOffset ?? 0,
      (gb.json.bufferViews[y.bufferView].byteOffset ?? 0) + gb.json.bufferViews[y.bufferView].byteLength,
    );
    if (!bx.equals(by)) return `image #${i} bytes differ`;
  }
  return null;
}

interface MergeProbe {
  beforeDraws: number;
  afterDraws: number;
  mergeable: boolean;
  blendPrims?: number;
  skip?: string;
}

/** 乾跑問 worker「接完剩幾個 draw」—— ⛔ 不寫任何檔。 */
function probeMerge(file: string): MergeProbe {
  try {
    const raw = execFileSync(pythonPlain(), [MERGE_WORKER, file, "--plan"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(raw) as MergeProbe;
  } catch (e) {
    // ⭐ 探針壞掉 ⇒ 回報「不可合併」而⛔ 不是讓整批死掉：合併是加分項，
    //   ⛔ 它不應該擋住 texture／atlas。⚠️ 但**要出聲** —— 靜默的 fail-open 才是缺陷。
    process.stderr.write(`optimize: merge probe failed on ${file}: ${String(e).split("\n")[0]}\n`);
    return { beforeDraws: 0, afterDraws: 0, mergeable: false };
  }
}

function geometryAvailable(): boolean {
  return fs.existsSync(path.join(VENDOR, "node_modules", "@gltf-transform", "functions")) || fs.existsSync(path.join(HERE, "optimize", "node_modules", "@gltf-transform", "functions"));
}

// ---- apply ------------------------------------------------------------------

interface Applied {
  plan: Plan;
  wrote: boolean;
  skipped: "" | "up-to-date";
  texVerify: string | null; // null = passed (geometry untouched); else the diff
  merge: { beforeDraws: number; afterDraws: number; note?: string } | null;
  atlas: { atlases?: number; quality?: number; afterDraws?: number; skip?: string } | null;
  rig: RigCheck | null;
  rejected: string; // non-empty if the candidate was rejected and not written
  outBytes: number;
}

function applyPlan(plan: Plan, args: Args, geomOK: boolean): Applied {
  const res: Applied = { plan, wrote: false, skipped: "", texVerify: null, merge: null, atlas: null, rig: null, rejected: "", outBytes: 0 };
  const key = planKey(plan.file, plan);

  if (!args.force && fs.existsSync(plan.outFile) && fs.existsSync(plan.sidecar)) {
    try {
      const prev = JSON.parse(fs.readFileSync(plan.sidecar, "utf8"));
      if (prev.key === key) {
        res.skipped = "up-to-date";
        res.outBytes = fs.statSync(plan.outFile).size;
        return res;
      }
    } catch {
      /* fall through and regenerate */
    }
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "model-opt-"));
  try {
    let workingFile = plan.file;

    // stage 0: merge same-render-state primitives (⭐ 畫面不變,所以它排在最前面 ——
    // 後面每一個 stage 都受惠於更少的塊數,⛔ 而它自己不欠任何人)
    if (plan.merge) {
      const mergeOut = path.join(tmp, "merge.glb");
      const raw = execFileSync(pythonPlain(), [MERGE_WORKER, workingFile, "--out", mergeOut], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      const rep = JSON.parse(raw) as MergeProbe & { note?: string };
      res.merge = { beforeDraws: rep.beforeDraws, afterDraws: rep.afterDraws, note: rep.note };
      if (!fs.existsSync(mergeOut)) {
        res.rejected = `merge stage produced nothing (${rep.skip ?? "no reason given"}) — candidate rejected`;
        return res;
      }
      const after = measureGlb(mergeOut);
      // ⭐ 三個方向都要驗,⛔ 一個都不能少：
      //   ① draw call **真的**變少了（沒變少的候選不值得採用）
      //   ② rig 一根骨頭、一條通道都沒動,而且**面數一模一樣**（"same"）——
      //      ⛔ 合併掉了一個面就代表它吃掉了幾何,那不是合併
      //   ③ ⭐ **貼圖逐位元組沒動** —— 這一條才是「畫面不變」的證據。
      //      ⛔ 少了它,一個「draw 變少而貼圖被換掉」的產物也會被寫出去,
      //      而它在任何數字上都看不出來（第二守則：只驗名詞的閘對關係失明）。
      res.rig = checkRig(plan.file, mergeOut, "same");
      if (after.meshes >= plan.metrics.meshes) {
        res.rejected = `merge stage left ${after.meshes} draw calls (was ${plan.metrics.meshes}) — candidate rejected`;
        return res;
      }
      if (!res.rig.ok) {
        res.rejected = `merge stage broke the rig (${res.rig.reasons.join("; ")}) — candidate rejected, not written`;
        return res;
      }
      const texDiff = texturesIdentical(plan.file, mergeOut);
      if (texDiff) {
        res.rejected = `merge stage altered textures (${texDiff}) — a merge must not touch pixels, candidate rejected`;
        return res;
      }
      workingFile = mergeOut;
    }

    // stage 1: textures (rebuild in pure TS; geometry bytes copied verbatim)
    // ⚠️ ⭐ 基準線是**這個 stage 的輸入**，⛔ 不是 `plan.file` —— 合併 stage 跑過之後
    //   幾何**本來就**與來源不同（那正是它做的事）。拿來源當基準會把合併的成果誤判成
    //   「texture stage 動了幾何」⇒ 一個正確的候選被拒。⭐ 這一條驗的是「**這一段**
    //   有沒有動幾何」，⛔ 不是「產物跟來源一不一樣」。
    const texStageInput = workingFile;
    const glb = readGlb(workingFile);
    if (plan.tex.length > 0) {
      const replacements = new Map<number, Buffer>();
      for (const t of plan.tex) {
        const img: Img = readImages(glb).find((x) => x.index === t.imageIndex)!;
        const srcBytes = glb.bin!.subarray(
          glb.json.bufferViews[t.bufferView].byteOffset ?? 0,
          (glb.json.bufferViews[t.bufferView].byteOffset ?? 0) + glb.json.bufferViews[t.bufferView].byteLength,
        );
        const resized = resizeImage(srcBytes, img.format, t.to.w, t.to.h, t.to.format, tmp);
        replacements.set(t.bufferView, resized);
        glb.json.images[t.imageIndex].mimeType = `image/${t.to.format}`;
      }
      const rebuilt = rebuildGlb(glb.json, glb.bin!, replacements);
      const texOut = path.join(tmp, "tex.glb");
      fs.writeFileSync(texOut, rebuilt);
      // PROVE the texture stage moved nothing but image bytes
      res.texVerify = geometryDiff(texStageInput, texOut);
      if (res.texVerify !== null) {
        res.rejected = `texture stage altered geometry (${res.texVerify}) — refusing to write`;
        return res;
      }
      workingFile = texOut;
    }

    // stage 2: geometry (optional, dependency-gated, verified)
    if (plan.geo && geomOK) {
      const geoOut = path.join(tmp, "geo.glb");
      const raw = execFileSync(
        process.execPath,
        [DECIMATE_WORKER, workingFile, geoOut, String(plan.geo.targetTris), ...(plan.geo.lockBlend ? ["--lock-blend"] : [])],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      void raw;
      res.rig = checkRig(plan.file, geoOut, "fewer");
      if (!res.rig.ok) {
        res.rejected = `geometry decimation broke the rig (${res.rig.reasons.join("; ")}) — candidate rejected, not written`;
        return res;
      }
      workingFile = geoOut;
    }

    // stage 3: texture atlas (⭐ 唯一能把 draw call 降下來的 stage —— 見 AtlasAction)
    if (plan.atlas) {
      const atlasOut = path.join(tmp, "atlas.glb");
      const py = pythonForAtlas();
      const raw = execFileSync(
        py.cmd,
        [...py.pre, ATLAS_WORKER, workingFile, "--out", atlasOut, "--edge", String(plan.atlas.edge),
          "--max-draws", String(plan.atlas.targetDraws), "--quality", String(plan.atlas.quality)],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      res.atlas = JSON.parse(raw);
      if (!fs.existsSync(atlasOut)) {
        res.rejected = `atlas stage produced nothing (${res.atlas?.skip ?? "no reason given"}) — candidate rejected`;
        return res;
      }
      // ⭐ 兩個方向都要驗：draw call **真的**掉到線內,而且 rig 一根骨頭都沒動。
      //   ⛔ 只驗前者 = 一個「數字好看但模型壞掉」的候選也會被寫出去。
      const after = measureGlb(atlasOut);
      res.rig = checkRig(plan.file, atlasOut, "same");
      if (after.meshes > plan.atlas.targetDraws) {
        res.rejected = `atlas stage left ${after.meshes} draw calls (target ${plan.atlas.targetDraws}) — candidate rejected`;
        return res;
      }
      if (!res.rig.ok) {
        res.rejected = `atlas stage broke the rig (${res.rig.reasons.join("; ")}) — candidate rejected, not written`;
        return res;
      }
      workingFile = atlasOut;
    }

    if (workingFile === plan.file) {
      // nothing was actually produced (no-op)
      return res;
    }

    // write output + sidecar (sidecar last, so a half-write is never trusted)
    fs.mkdirSync(path.dirname(plan.outFile), { recursive: true });
    fs.copyFileSync(workingFile, plan.outFile);
    res.outBytes = fs.statSync(plan.outFile).size;
    const finalMetrics = measureGlb(plan.outFile);
    // ⭐ 收尾的 VRAM 一律**量出來的**：規劃階段只算得出 texture stage 的節省,
    //   ⛔ 圖集要跑完才知道排成幾張。⇒ 摘要行報 plan 的估計值就是在說謊。
    plan.vramAfter = finalMetrics.vramBytes;
    fs.writeFileSync(
      plan.sidecar,
      JSON.stringify(
        {
          tool: TOOL_VERSION,
          key,
          source: contentUrl(plan.file),
          sourceSha256: sha256(fs.readFileSync(plan.file)),
          role: plan.role,
          generatedAt: new Date().toISOString(),
          textures: plan.tex.map((t) => ({ image: t.imageIndex, from: t.from, to: t.to })),
          geometry: plan.geo
            ? { fromTris: plan.geo.fromTris, targetTris: plan.geo.targetTris, ...(plan.geo.lockBlend ? { lockBlend: true } : {}) }
            : null,
          // ⭐ `texturesIdentical` 是合併的驗收證據,⛔ 不是註腳 —— 側車記下它跑過。
          merge: plan.merge
            ? { ...plan.merge, achieved: res.merge?.afterDraws ?? null, texturesByteIdentical: true }
            : null,
          atlas: plan.atlas ? { ...plan.atlas, atlases: res.atlas?.atlases, quality: res.atlas?.quality } : null,
          before: { vramBytes: plan.vramBefore, fileBytes: plan.fileBytesBefore, triangles: plan.metrics.triangles, drawCalls: plan.metrics.meshes },
          after: { vramBytes: finalMetrics.vramBytes, fileBytes: finalMetrics.fileBytes, triangles: finalMetrics.triangles, drawCalls: finalMetrics.meshes },
          rig: res.rig,
          textureStageGeometryIdentical: res.texVerify === null && plan.tex.length > 0 ? true : undefined,
        },
        null,
        2,
      ) + "\n",
    );
    res.wrote = true;
    return res;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- reporting --------------------------------------------------------------

const MB = 1024 * 1024;
const mb = (n: number): string => (n / MB).toFixed(2);

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (!haveBin("ffmpeg")) fail("ffmpeg not found on PATH (brew install ffmpeg) — required for the texture stage");

  const files: string[] = [];
  const walk = (p: string): void => {
    const st = fs.statSync(p);
    if (st.isDirectory()) for (const e of fs.readdirSync(p)) walk(path.join(p, e));
    else if (p.endsWith(".glb")) files.push(p);
  };
  for (const inp of args.inputs) {
    if (!fs.existsSync(inp)) fail(`no such path: ${inp}`);
    walk(inp);
  }
  if (files.length === 0) fail("no .glb files found");
  files.sort();

  const geomOK = geometryAvailable();
  if (args.geometry && !geomOK) {
    process.stderr.write(
      "optimize: --geometry requested but the decimation deps are not installed.\n" +
        "  They live in isolation (workspace lockfile untouched). Bootstrap once:\n" +
        `    bash ${path.relative(process.cwd(), path.join(HERE, "optimize", "bootstrap-geometry.sh"))}\n` +
        "  The texture stage will still run; geometry actions are skipped.\n",
    );
  }

  const plans = files.map((f) => planFile(f, args));
  const actionable = plans.filter((p) => p.skip !== "no-op" && (p.tex.length > 0 || !!p.merge || !!p.atlas || (p.geo && geomOK)));

  // ---- dry run (default) ----
  if (!args.apply) {
    if (args.json) {
      writeJson(plans, geomOK, args, null); // --json is a clean machine contract: no human text
      process.exit(0);
    }
    process.stdout.write(`DRY RUN — ${files.length} model(s) scanned, ${actionable.length} would be processed.\n`);
    process.stdout.write("(nothing is written without --apply, and never in place)\n\n");
    let vSave = 0;
    for (const p of plans) {
      if (p.tex.length === 0 && !p.merge && !p.atlas && !(p.geo && geomOK)) continue;
      const rel = path.relative(process.cwd(), p.file);
      process.stdout.write(`• ${rel}  [role=${p.role}${p.roleSource === "flag" ? "" : ` (${p.roleSource})`}]\n`);
      if (p.merge)
        process.stdout.write(
          `    merge: ${p.merge.fromDraws} → ${p.merge.targetDraws} draw calls （⭐ 畫面不變：同畫法才接、半透明 ${p.merge.blendPrims} 塊不動；貼圖逐位元組比對過才採用）\n`,
        );
      for (const t of p.tex) {
        process.stdout.write(
          `    texture #${t.imageIndex}: ${t.from.w}×${t.from.h} ${t.from.format} → ${t.to.w}×${t.to.h} ${t.to.format}` +
            `   VRAM ${mb(t.vramBefore)}→${mb(t.vramAfter)} MB${t.from.format !== t.to.format ? "  (webp→png: no webp encoder; VRAM unaffected)" : ""}\n`,
        );
      }
      if (p.geo && geomOK)
        process.stdout.write(
          `    geometry: ${p.geo.fromTris} → ≤${p.geo.targetTris} tris (ratio ${p.geo.ratio.toFixed(2)}, skin-aware${p.geo.lockBlend ? ", BLEND 薄片鎖定" : ""}; rig verified before accept)\n`,
        );
      else if (p.geo && !geomOK)
        process.stdout.write(`    geometry: ${p.geo.fromTris} → ≤${p.geo.targetTris} tris  [SKIPPED — deps not installed]\n`);
      if (p.atlas)
        process.stdout.write(
          `    atlas: ${p.atlas.fromDraws} → ≤${p.atlas.targetDraws} draw calls, ${p.atlas.edge}² 圖集 (quality ≥${p.atlas.quality}; 會 tile 的貼圖留在原位; rig 與面數驗過才採用)\n`,
        );
      process.stdout.write(`    → out: ${path.relative(process.cwd(), p.outFile)}\n`);
      vSave += p.vramBefore - p.vramAfter;
    }
    process.stdout.write(
      `\npredicted texture VRAM saving across the set: ${mb(vSave)} MB\n` +
        `to write these (to a separate tree, originals untouched):\n` +
        `    ${process.argv.slice(1).map((s) => path.relative(process.cwd(), s)).join(" ").replace(/^\S+/, "pnpm budget:optimize")} --apply\n`,
    );
    process.exit(0);
  }

  // ---- apply ----
  const applied = actionable.map((p) => applyPlan(p, args, geomOK));
  const wrote = applied.filter((a) => a.wrote);
  const skipped = applied.filter((a) => a.skipped === "up-to-date");
  const rejected = applied.filter((a) => a.rejected);

  let vBefore = 0;
  let vAfter = 0;
  for (const a of wrote) {
    vBefore += a.plan.vramBefore;
    vAfter += a.plan.vramAfter;
  }

  process.stdout.write(`\nAPPLIED — output under ${path.relative(process.cwd(), args.out)} (originals untouched)\n`);
  for (const a of applied) {
    const rel = path.relative(process.cwd(), a.plan.file);
    if (a.skipped) process.stdout.write(`  skip  ${rel} (up to date)\n`);
    else if (a.rejected) process.stdout.write(`  REJECT ${rel}: ${a.rejected}\n`);
    else if (a.wrote) {
      const rigNote = a.rig ? `, rig ok (${a.rig.after.tris} tris, ${a.rig.after.joints} joints)` : "";
      // "byte-identical" is the texture stage's guarantee, and only holds when
      // no geometry stage followed to change the geometry on purpose.
      const texNote = a.plan.tex.length > 0 && !a.plan.geo && !a.plan.merge ? `, geometry byte-identical` : "";
      const mergeNote = a.merge ? `, draws ${a.merge.beforeDraws}→${a.merge.afterDraws} (textures byte-identical)` : "";
      process.stdout.write(
        `  gen   ${rel} → VRAM ${mb(a.plan.vramBefore)}→${mb(a.plan.vramAfter)} MB${mergeNote}${texNote}${rigNote}\n`,
      );
    }
  }

  // manifest for review
  const manifest = {
    tool: TOOL_VERSION,
    generatedAt: new Date().toISOString(),
    out: path.relative(ROOT, args.out),
    role: args.role,
    geometryDepsInstalled: geomOK,
    totals: {
      scanned: files.length,
      written: wrote.length,
      skipped: skipped.length,
      rejected: rejected.length,
      vramBeforeBytes: vBefore,
      vramAfterBytes: vAfter,
      vramSavedBytes: vBefore - vAfter,
    },
    models: applied.map((a) => ({
      source: contentUrl(a.plan.file),
      out: path.relative(ROOT, a.plan.outFile),
      role: a.plan.role,
      wrote: a.wrote,
      skipped: a.skipped || undefined,
      rejected: a.rejected || undefined,
      vramBefore: a.plan.vramBefore,
      vramAfter: a.plan.vramAfter,
      rig: a.rig || undefined,
    })),
  };
  fs.mkdirSync(args.out, { recursive: true });
  const manifestPath = path.join(args.out, "optimize-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  process.stdout.write(
    `\n${wrote.length} written, ${skipped.length} up-to-date, ${rejected.length} rejected.\n` +
      `texture VRAM ${mb(vBefore)}→${mb(vAfter)} MB (saved ${mb(vBefore - vAfter)} MB) on the written set.\n` +
      `manifest: ${path.relative(process.cwd(), manifestPath)}\n`,
  );

  if (args.babylonVerify && wrote.length > 0) {
    process.stdout.write("\nrunning the repo's Babylon loader on the output (validate_glb.mts)…\n");
    try {
      const w3x = path.dirname(VALIDATE_GLB);
      execFileSync(process.execPath, ["--import", "tsx", VALIDATE_GLB, args.out], { cwd: w3x, stdio: "inherit" });
    } catch {
      process.stderr.write("optimize: Babylon validation reported a failure — inspect the output above.\n");
      process.exit(1);
    }
  }

  if (args.json) writeJson(actionable, geomOK, args, applied);
  process.exit(rejected.length > 0 ? 1 : 0);
}

function writeJson(plans: Plan[], geomOK: boolean, args: Args, applied: Applied[] | null): void {
  process.stdout.write(
    JSON.stringify(
      {
        tool: TOOL_VERSION,
        mode: args.apply ? "apply" : "dry-run",
        geometryDepsInstalled: geomOK,
        out: args.out,
        plans: plans.map((p) => ({
          file: p.file,
          role: p.role,
          textures: p.tex,
          geometry: p.geo,
          // ⭐ GH#1198：在此之前這份「機器契約」只講得出 texture 與 geometry
          //   ⇒ 讀它的人（worklist --optimize --json）看不到 draw call 這一條路
          //   **存不存在**。⛔ 一份漏掉整個 stage 的契約，讀起來跟完整的一模一樣。
          merge: p.merge,
          atlas: p.atlas,
          vramBefore: p.vramBefore,
          vramAfter: p.vramAfter,
        })),
        applied: applied?.map((a) => ({ file: a.plan.file, wrote: a.wrote, skipped: a.skipped, rejected: a.rejected, merge: a.merge })) ?? null,
      },
      null,
      2,
    ) + "\n",
  );
}

main();
