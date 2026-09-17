#!/usr/bin/env -S node --import tsx
/** Build or verify the bounded Dai support-component batch against live policy. */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { measureGlb } from "../../../model-budget/glb";
import { gateFor, scoreAgainst } from "../../../model-budget/roles";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");
const POINTER = path.join(ROOT, "materials/hero-model-library/priority-evidence/infinity-strash-dai-vearn-av-v1/vfx-source-index.json");
const sourceInput = JSON.parse(fs.readFileSync(POINTER, "utf8")).sourceInput.absolutePath as string;
const marker = `${path.sep}GGD-Asset-Library${path.sep}`;
const split = sourceInput.indexOf(marker);
if (split < 0) throw new Error("source pointer does not identify GGD-Asset-Library");
const LIBRARY = sourceInput.slice(0, split + marker.length - 1);
const CONVERSION = path.join(LIBRARY, "conversions/infinity-strash-dai-vfx-components-v1");
const EVIDENCE = path.join(ROOT, "materials/hero-model-library/priority-evidence/infinity-strash-dai-vfx-components-v1");
const REPORT = path.join(EVIDENCE, "candidates.json");
const POLICY = path.join(EVIDENCE, "policy-check.json");
const PYTHON = path.join(HERE, "build_candidates.py");
const validator = createRequire(path.join(ROOT, "packages/shared/package.json"))("gltf-validator");

function sha256(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function safeReplace(dir: string): void {
  if (!fs.existsSync(dir)) return;
  const manifest = path.join(dir, "source-manifest.json");
  const report = path.join(EVIDENCE, "candidates.json");
  if (dir === CONVERSION && !fs.existsSync(report) && !fs.existsSync(manifest)) {
    throw new Error(`refusing to replace unrecognized directory: ${dir}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

function pngDimensions(file: string): { width: number; height: number } {
  const data = fs.readFileSync(file);
  if (data.length < 24 || data.readUInt32BE(0) !== 0x89504e47) throw new Error(`not PNG: ${file}`);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

async function expectedPolicy(): Promise<any> {
  const report = JSON.parse(fs.readFileSync(REPORT, "utf8"));
  const gate = gateFor("vfx-model");
  if (!gate) throw new Error("live vfx-model gate is absent");
  const textureRows = report.textureComponents.filter((row: any) => row.componentEligible).map((row: any) => {
    const file = path.join(ROOT, row.gitPath);
    const size = pngDimensions(file);
    const maxEdge = Math.max(size.width, size.height);
    return { componentId: row.componentId, gitPath: row.gitPath, bytes: fs.statSync(file).size, sha256: sha256(file), width: size.width, height: size.height, maxEdge, limit: gate.texEdge.limit, verdict: maxEdge > gate.texEdge.limit ? "over" : maxEdge > gate.texEdge.warn ? "warn" : "ok" };
  });
  const meshRows = await Promise.all(report.meshComponents.map(async (row: any) => {
    const file = path.join(ROOT, row.gitPath);
    const metrics = measureGlb(file);
    const scored = scoreAgainst(metrics, gate);
    const khronos = await validator.validateBytes(new Uint8Array(fs.readFileSync(file)), { uri: row.gitPath, maxIssues: 100, writeTimestamp: false, externalResourceFunction: async () => { throw new Error("external GLB resource rejected"); } });
    return { componentId: row.componentId, gitPath: row.gitPath, bytes: fs.statSync(file).size, sha256: sha256(file), metrics, score: scored, khronos: { errors: khronos.issues.numErrors, warnings: khronos.issues.numWarnings, infos: khronos.issues.numInfos, messages: khronos.issues.messages }, hardPass: scored.worst !== "over" && khronos.issues.numErrors === 0 };
  }));
  return {
    schema: "ggd.infinity-strash-dai-vfx-component-policy-check@1",
    sources: {
      limits: { path: "tools/model-budget/limits.ts", sha256: sha256(path.join(ROOT, "tools/model-budget/limits.ts")) },
      roles: { path: "tools/model-budget/roles.ts", sha256: sha256(path.join(ROOT, "tools/model-budget/roles.ts")) },
      glb: { path: "tools/model-budget/glb.ts", sha256: sha256(path.join(ROOT, "tools/model-budget/glb.ts")) },
      report: { path: path.relative(ROOT, REPORT).split(path.sep).join("/"), sha256: sha256(REPORT) },
    },
    role: gate.role,
    liveGate: gate,
    textureRows,
    meshRows,
    summary: {
      texturesChecked: textureRows.length,
      texturesHardPass: textureRows.filter((row: any) => row.verdict !== "over").length,
      meshesChecked: meshRows.length,
      meshesHardPass: meshRows.filter((row: any) => row.hardPass).length,
      meshesBlocked: meshRows.filter((row: any) => !row.hardPass).length,
    },
    states: { completeVfx: false, skillBindingsCreated: 0, runtimeSelectable: false, deployed: false },
  };
}

const write = process.argv.includes("--write");
if (write) {
  safeReplace(CONVERSION);
  for (const relative of ["assets/textures", "assets/meshes"] ) {
    const target = path.join(EVIDENCE, relative);
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  }
  const pythonArgs = [PYTHON, "--max-texture-edge", String(gateFor("vfx-model")!.texEdge.limit)];
  if (process.platform === "darwin") execFileSync("/usr/bin/arch", ["-arm64", "/usr/local/bin/python3", ...pythonArgs], { cwd: ROOT, stdio: "inherit" });
  else execFileSync("python3", pythonArgs, { cwd: ROOT, stdio: "inherit" });
  const policy = await expectedPolicy();
  fs.writeFileSync(POLICY, JSON.stringify(policy, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ status: "written", ...policy.summary }) + "\n");
} else {
  const expected = JSON.stringify(await expectedPolicy(), null, 2) + "\n";
  if (!fs.existsSync(POLICY) || fs.readFileSync(POLICY, "utf8") !== expected) {
    throw new Error("Dai VFX component policy receipt drift; run build.mts --write");
  }
  const policy = JSON.parse(expected);
  if (policy.summary.texturesHardPass !== policy.summary.texturesChecked || policy.summary.meshesBlocked !== 0) {
    throw new Error("one or more support components violate the live vfx-model hard gate");
  }
  process.stdout.write(JSON.stringify({ status: "current", ...policy.summary }) + "\n");
}
