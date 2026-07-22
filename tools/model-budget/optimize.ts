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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VENDOR = path.join(HERE, ".optvendor");
const DECIMATE_WORKER = path.join(HERE, "optimize", "decimate.mjs");
const VALIDATE_GLB = path.join(ROOT, "tools/w3x-import/validate_glb.mts");
const DEFAULT_OUT = path.join(HERE, "optimized-out");

// ---- args -------------------------------------------------------------------

interface Args {
  inputs: string[];
  role: Role | null;
  out: string;
  apply: boolean;
  geometry: boolean;
  texEdge: number | null;
  trisTarget: number | null;
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
    texEdge: null,
    trisTarget: null,
    force: false,
    json: false,
    babylonVerify: false,
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
    else if (t === "--tex-edge") a.texEdge = Number(argv[++i]);
    else if (t === "--tris-target") a.trisTarget = Number(argv[++i]);
    else if (t === "--force") a.force = true;
    else if (t === "--json") a.json = true;
    else if (t === "--babylon-verify") a.babylonVerify = true;
    else if (t === "--help" || t === "-h") {
      process.stdout.write(
        "usage: tsx tools/model-budget/optimize.ts <glb-or-dir>... [--role R] [--apply]\n" +
          "  [--geometry] [--out DIR] [--tex-edge N] [--tris-target N] [--force] [--json] [--babylon-verify]\n" +
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

  // geometry target: only when asked; --tris-target, else the role's warn tris
  let geo: GeoAction | null = null;
  if (args.geometry) {
    const trisTarget = args.trisTarget ?? (gate ? gate.tris.warn : 0);
    if (trisTarget > 0 && metrics.triangles > trisTarget && metrics.skins >= 0) {
      geo = { fromTris: metrics.triangles, targetTris: trisTarget, ratio: trisTarget / metrics.triangles };
    }
  }

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
    vramBefore,
    vramAfter: vramBefore - vramSaved,
    fileBytesBefore: metrics.fileBytes,
    skip: tex.length === 0 && !geo ? "no-op" : "",
  };
  return plan;
}

/** Stable idempotence key: source bytes + the plan that would be applied. */
function planKey(file: string, plan: Plan): string {
  const src = sha256(fs.readFileSync(file));
  const shape = {
    src,
    tex: plan.tex.map((t) => ({ i: t.imageIndex, to: t.to })),
    geo: plan.geo ? { t: plan.geo.targetTris } : null,
    tool: TOOL_VERSION,
  };
  return sha256(Buffer.from(JSON.stringify(shape)));
}
const TOOL_VERSION = "model-budget/optimize@1";

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

function geometryAvailable(): boolean {
  return fs.existsSync(path.join(VENDOR, "node_modules", "@gltf-transform", "functions")) || fs.existsSync(path.join(HERE, "optimize", "node_modules", "@gltf-transform", "functions"));
}

// ---- apply ------------------------------------------------------------------

interface Applied {
  plan: Plan;
  wrote: boolean;
  skipped: "" | "up-to-date";
  texVerify: string | null; // null = passed (geometry untouched); else the diff
  rig: RigCheck | null;
  rejected: string; // non-empty if the candidate was rejected and not written
  outBytes: number;
}

function applyPlan(plan: Plan, args: Args, geomOK: boolean): Applied {
  const res: Applied = { plan, wrote: false, skipped: "", texVerify: null, rig: null, rejected: "", outBytes: 0 };
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
    // stage 1: textures (rebuild in pure TS; geometry bytes copied verbatim)
    const glb = readGlb(plan.file);
    let workingFile = plan.file;
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
      res.texVerify = geometryDiff(plan.file, texOut);
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
        [DECIMATE_WORKER, workingFile, geoOut, String(plan.geo.targetTris)],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      void raw;
      res.rig = checkRig(plan.file, geoOut);
      if (!res.rig.ok) {
        res.rejected = `geometry decimation broke the rig (${res.rig.reasons.join("; ")}) — candidate rejected, not written`;
        return res;
      }
      workingFile = geoOut;
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
          geometry: plan.geo ? { fromTris: plan.geo.fromTris, targetTris: plan.geo.targetTris } : null,
          before: { vramBytes: plan.vramBefore, fileBytes: plan.fileBytesBefore, triangles: plan.metrics.triangles },
          after: { vramBytes: finalMetrics.vramBytes, fileBytes: finalMetrics.fileBytes, triangles: finalMetrics.triangles },
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
  const actionable = plans.filter((p) => p.skip !== "no-op" && (p.tex.length > 0 || (p.geo && geomOK)));

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
      if (p.tex.length === 0 && !(p.geo && geomOK)) continue;
      const rel = path.relative(process.cwd(), p.file);
      process.stdout.write(`• ${rel}  [role=${p.role}${p.roleSource === "flag" ? "" : ` (${p.roleSource})`}]\n`);
      for (const t of p.tex) {
        process.stdout.write(
          `    texture #${t.imageIndex}: ${t.from.w}×${t.from.h} ${t.from.format} → ${t.to.w}×${t.to.h} ${t.to.format}` +
            `   VRAM ${mb(t.vramBefore)}→${mb(t.vramAfter)} MB${t.from.format !== t.to.format ? "  (webp→png: no webp encoder; VRAM unaffected)" : ""}\n`,
        );
      }
      if (p.geo && geomOK)
        process.stdout.write(
          `    geometry: ${p.geo.fromTris} → ≤${p.geo.targetTris} tris (ratio ${p.geo.ratio.toFixed(2)}, skin-aware; rig verified before accept)\n`,
        );
      else if (p.geo && !geomOK)
        process.stdout.write(`    geometry: ${p.geo.fromTris} → ≤${p.geo.targetTris} tris  [SKIPPED — deps not installed]\n`);
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
      const texNote = a.plan.tex.length > 0 && !a.plan.geo ? `, geometry byte-identical` : "";
      process.stdout.write(
        `  gen   ${rel} → VRAM ${mb(a.plan.vramBefore)}→${mb(a.plan.vramAfter)} MB${texNote}${rigNote}\n`,
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
      execFileSync("npx", ["tsx", VALIDATE_GLB, args.out], { cwd: w3x, stdio: "inherit" });
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
          vramBefore: p.vramBefore,
          vramAfter: p.vramAfter,
        })),
        applied: applied?.map((a) => ({ file: a.plan.file, wrote: a.wrote, skipped: a.skipped, rejected: a.rejected })) ?? null,
      },
      null,
      2,
    ) + "\n",
  );
}

main();
