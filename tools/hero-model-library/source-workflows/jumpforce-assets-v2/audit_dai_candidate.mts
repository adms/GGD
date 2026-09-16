import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HERO_MODEL_ADOPTION_POLICY } from "../../../../packages/shared/src/content/modelUpload/budget";
import { measureGlb } from "../../../model-budget/glb";
import { gateFor, scoreAgainst } from "../../../model-budget/roles";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");

function value(flag: string): string {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing ${flag}`);
  return process.argv[index + 1];
}

function sha256(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const glb = path.resolve(value("--glb"));
const output = path.resolve(value("--output"));
const check = process.argv.includes("--check");
const conversionReceipt = path.join(
  ROOT,
  "materials/hero-model-library/source-inventories/jump-force-steam-dai-v1/conversion-receipt.json",
);
const receipt = JSON.parse(fs.readFileSync(conversionReceipt, "utf8"));
if (receipt.output.path !== glb || receipt.output.sha256 !== sha256(glb) || receipt.output.bytes !== fs.statSync(glb).size) {
  throw new Error("Dai GLB differs from the frozen conversion receipt");
}
const gate = gateFor("champion");
if (!gate) throw new Error("champion gate is missing");
const metrics = measureGlb(glb);
const scored = scoreAgainst(metrics, gate);
const blockingAxes = scored.axes.filter((axis) => axis.verdict === "over").map((axis) => axis.key);
const audit = {
  schema: "ggd.jumpforce-dai-current-policy-audit@1",
  sourceId: "steam-jump-force-priority-original-assets-build-8523149",
  candidateId: "jump-force-native-dai-chr0430-review-v4",
  nativeCharacterId: "chr0430",
  heroIds: ["godie-nbbc", "godie-n01c"],
  glb: { absolutePath: glb, bytes: fs.statSync(glb).size, sha256: sha256(glb) },
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
  currentChampionPolicy: {
    warningValues: Object.fromEntries(scored.axes.map((axis) => [axis.key, axis.warn])),
    limitValues: Object.fromEntries(scored.axes.map((axis) => [axis.key, axis.limit])),
    verdict: scored.worst,
    blockingAxes,
    pass: scored.worst !== "over",
  },
  formalHeroAdoption: {
    sourceTriangleTriggerAbove: HERO_MODEL_ADOPTION_POLICY.decimateWhenTrianglesAbove,
    decimatedCandidateTargetMax: HERO_MODEL_ADOPTION_POLICY.decimatedTargetTrianglesMax,
    requiresDecimatedCandidate: metrics.triangles > HERO_MODEL_ADOPTION_POLICY.decimateWhenTrianglesAbove,
    eligible: false,
  },
  states: {
    structuralGlbReadable: true,
    genericPbrVisualReviewPreviouslyAccepted: true,
    currentHardPolicyPassed: scored.worst !== "over",
    nativeGameplayAnimationsPresent: metrics.clips > 0,
    ggdIntakeAccepted: false,
    backendRegistered: false,
    runtimeSelectable: false,
    productionDeployed: false,
  },
  limitations: [
    "Current-policy measurement does not prove source-game shader parity or gameplay readiness.",
    "No animation clip is present; the candidate cannot satisfy the six-state hero contract.",
    "The local review GLB remains a conversion candidate and is not a Git runtime asset.",
  ],
  generatedFrom: [
    {
      gitPath: path.relative(ROOT, conversionReceipt).split(path.sep).join("/"),
      bytes: fs.statSync(conversionReceipt).size,
      sha256: sha256(conversionReceipt),
    },
    ...[
      "packages/shared/src/content/modelUpload/adoptionPolicy.json",
      "packages/shared/src/content/modelUpload/budget.ts",
      "tools/model-budget/glb.ts",
      "tools/model-budget/limits.ts",
      "tools/model-budget/roles.ts",
    ].map((gitPath) => ({ gitPath, bytes: fs.statSync(path.join(ROOT, gitPath)).size, sha256: sha256(path.join(ROOT, gitPath)) })),
  ],
};
const encoded = JSON.stringify(audit, null, 2) + "\n";
if (check) {
  if (!fs.existsSync(output) || fs.readFileSync(output, "utf8") !== encoded) throw new Error(`stale audit: ${output}`);
  process.stdout.write(`Dai current-policy audit is current (${scored.worst})\n`);
} else {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, encoded);
  process.stdout.write(`wrote ${output} (${scored.worst})\n`);
}
