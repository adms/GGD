import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HERO_MODEL_ADOPTION_POLICY } from "../../../../packages/shared/src/content/modelUpload/budget";
import { measureGlb } from "../../../../tools/model-budget/glb";
import { gateFor, scoreAgainst } from "../../../../tools/model-budget/roles";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");
const WORKSPACE = path.dirname(ROOT);
const SOURCE = path.join(
  WORKSPACE,
  "GGD-Asset-Library/intake/public-models-20260910/psp-cloud-native-motion-batch4/converted/cloud-native-13-motions.glb",
);
const OUT = path.join(
  ROOT,
  "materials/hero-model-library/source-inventories/playstation-platform-sources-v1/cloud-policy-audit.json",
);
const CHECK = process.argv.includes("--check");

function sha256(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const metrics = measureGlb(SOURCE);
const gate = gateFor("champion");
if (!gate) throw new Error("champion model policy gate is missing");
const score = scoreAgainst(metrics, gate);
const adoptionEligible = metrics.triangles <= HERO_MODEL_ADOPTION_POLICY.decimateWhenTrianglesAbove;
const result = {
  schema: "ggd.playstation-cloud-policy-audit@1",
  sourceId: "psp-cloud-native-motion-batch4",
  candidateId: "psp-gmo-cloud-native-13-motions-batch4",
  sourceGame: "unknown",
  platform: "PSP",
  sourcePath: SOURCE,
  bytes: fs.statSync(SOURCE).size,
  sha256: sha256(SOURCE),
  generatedFrom: {
    adoptionPolicy: "packages/shared/src/content/modelUpload/adoptionPolicy.json",
    adoptionPolicySha256: sha256(path.join(ROOT, "packages/shared/src/content/modelUpload/adoptionPolicy.json")),
    runtimeBudget: "packages/shared/src/content/modelUpload/budget.ts",
    runtimeBudgetSha256: sha256(path.join(ROOT, "packages/shared/src/content/modelUpload/budget.ts")),
    roleGate: "tools/model-budget/roles.ts",
    roleGateSha256: sha256(path.join(ROOT, "tools/model-budget/roles.ts")),
    glbMeasurement: "tools/model-budget/glb.ts",
    glbMeasurementSha256: sha256(path.join(ROOT, "tools/model-budget/glb.ts")),
  },
  metrics: {
    triangles: metrics.triangles,
    vertices: metrics.vertices,
    meshes: metrics.meshes,
    materials: metrics.materials,
    skins: metrics.skins,
    joints: metrics.joints,
    clips: metrics.clips,
    channelsPerFrame: metrics.channelsPerFrame,
    maxTextureEdge: metrics.maxTextureEdge,
    imageCount: metrics.images.length,
    textureDiskBytes: metrics.textureDiskBytes,
    vramBytes: metrics.vramBytes,
  },
  formalAdoption: {
    eligibleByTriangleRule: adoptionEligible,
    decimateWhenTrianglesAbove: HERO_MODEL_ADOPTION_POLICY.decimateWhenTrianglesAbove,
    decimatedTargetTrianglesMax: HERO_MODEL_ADOPTION_POLICY.decimatedTargetTrianglesMax,
  },
  runtimeGate: {
    role: gate.role,
    worst: score.worst,
    axes: score.axes,
  },
  readiness: {
    sourceIdentityVerified: false,
    semanticClipMappingVerified: false,
    metricScaleVerified: false,
    backendPlaybackVerified: false,
    runtimeReady: false,
    productionDeployed: false,
    note: "Capacity measurement does not establish the exact source game, clip semantics, scale, backend playback or deployment.",
  },
};

const text = JSON.stringify(result, null, 2) + "\n";
if (CHECK) {
  if (!fs.existsSync(OUT) || fs.readFileSync(OUT, "utf8") !== text) {
    throw new Error(`stale generated audit: ${path.relative(ROOT, OUT)}`);
  }
  process.stdout.write(`Cloud candidate policy audit is current (${score.worst})\n`);
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, text);
  process.stdout.write(`wrote ${path.relative(ROOT, OUT)}\n`);
}
