import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HERO_MODEL_ADOPTION_POLICY } from "../../../../packages/shared/src/content/modelUpload/budget";
import { measureGlb } from "../../../model-budget/glb";
import { gateFor, scoreAgainst } from "../../../model-budget/roles";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");
const WORKSPACE = path.dirname(ROOT);
const SOURCE = path.join(ROOT, "materials/hero-model-library/priority-evidence/fateubw-community/native-motion-completion-v2.json");
const OUTPUT = path.join(ROOT, "materials/hero-model-library/source-inventories/fate-assets-v2/current-policy.json");
const CHECK = process.argv.includes("--check");

function sha256(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function pin(file: string) {
  return { gitPath: path.relative(ROOT, file).split(path.sep).join("/"), bytes: fs.statSync(file).size, sha256: sha256(file) };
}

function writeOrCheck(data: unknown): void {
  const rendered = JSON.stringify(data, null, 2) + "\n";
  if (CHECK) {
    if (!fs.existsSync(OUTPUT) || fs.readFileSync(OUTPUT, "utf8") !== rendered) throw new Error("Fate policy audit is stale");
  } else {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, rendered);
  }
}

const completion = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
const gate = gateFor("champion");
if (!gate) throw new Error("champion model gate is missing");
if (completion.sourceGame !== "Fate/Unlimited Block Works" || completion.platform !== "Minecraft Java 1.21.1") {
  throw new Error("FateUBW source identity drift");
}

const rows = completion.candidates.map((candidate: any) => {
  const glb = candidate.body.path as string;
  if (!path.resolve(glb).startsWith(path.join(WORKSPACE, "GGD-Asset-Library") + path.sep)) throw new Error(`unexpected local GLB path: ${glb}`);
  if (!fs.existsSync(glb)) throw new Error(`missing local GLB: ${glb}`);
  if (fs.statSync(glb).size !== candidate.body.bytes || sha256(glb) !== candidate.body.sha256) throw new Error(`GLB bytes differ: ${candidate.candidateId}`);
  const metrics = measureGlb(glb);
  const score = scoreAgainst(metrics, gate);
  const requiresDecimation = metrics.triangles > HERO_MODEL_ADOPTION_POLICY.decimateWhenTrianglesAbove;
  const hardPass = score.worst !== "over";
  return {
    candidateId: candidate.candidateId,
    heroIds: candidate.heroIds,
    sourceGame: completion.sourceGame,
    platform: completion.platform,
    license: completion.license,
    localAbsolutePath: glb,
    bytes: candidate.body.bytes,
    sha256: candidate.body.sha256,
    metrics: {
      triangles: metrics.triangles,
      drawCalls: metrics.meshes,
      maxTextureEdge: metrics.maxTextureEdge,
      channelsPerFrame: metrics.channelsPerFrame,
      skins: metrics.skins,
      joints: metrics.joints,
      clips: metrics.clips,
      embeddedImages: metrics.images.length,
    },
    hardPolicy: {
      pass: hardPass,
      verdict: score.worst,
      blockingAxes: score.axes.filter((axis) => axis.verdict === "over").map((axis) => axis.key),
    },
    formalAdoption: {
      decimateWhenTrianglesAbove: HERO_MODEL_ADOPTION_POLICY.decimateWhenTrianglesAbove,
      decimatedTargetTrianglesMax: HERO_MODEL_ADOPTION_POLICY.decimatedTargetTrianglesMax,
      requiresDecimatedCandidate: requiresDecimation,
      policyEligible: hardPass && !requiresDecimation && metrics.skins > 0,
    },
    convertedClipNames: candidate.convertedClipNames,
    sourceClipCount: candidate.sourceClipCount,
    convertedNativeClipCount: candidate.convertedNativeClipCount,
    retainedNoDurationClipCount: candidate.retainedNoDurationClipCount,
    eventMapComplete: false,
    runtimeSelectable: false,
    productionDeploymentVerified: false,
  };
}).sort((a: any, b: any) => a.candidateId.localeCompare(b.candidateId, "en"));

const output = {
  schema: "ggd-fate-current-policy-audit@1",
  scope: "Current hard-policy measurement of the 14 Fate/Unlimited Block Works Minecraft community conversion candidates. Passing this audit does not grant republication rights, prove source-engine animation parity, complete event mapping, register a backend option, or deploy a model.",
  generatedFrom: [
    pin(SOURCE),
    pin(path.join(ROOT, "packages/shared/src/content/modelUpload/adoptionPolicy.json")),
    pin(path.join(ROOT, "packages/shared/src/content/modelUpload/budget.ts")),
    pin(path.join(ROOT, "tools/model-budget/limits.ts")),
    pin(path.join(ROOT, "tools/model-budget/glb.ts")),
    pin(path.join(ROOT, "tools/model-budget/roles.ts")),
    pin(fileURLToPath(import.meta.url)),
  ],
  policy: {
    formalHeroAdoption: HERO_MODEL_ADOPTION_POLICY,
    runtimeChampionGate: { triangles: gate.tris, drawCalls: gate.meshes, maxTextureEdge: gate.texEdge, channelsPerFrame: gate.channels },
  },
  summary: {
    candidates: rows.length,
    localShaVerified: rows.length,
    hardPolicyPass: rows.filter((row: any) => row.hardPolicy.pass).length,
    formalPolicyEligibleBeforeRightsAndSemantics: rows.filter((row: any) => row.formalAdoption.policyEligible).length,
    rightsApproved: 0,
    eventMapComplete: 0,
    runtimeSelectable: 0,
    productionDeployed: 0,
  },
  candidates: rows,
};

writeOrCheck(output);
console.log(JSON.stringify(output.summary));
