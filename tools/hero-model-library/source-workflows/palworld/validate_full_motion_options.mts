import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { HERO_MODEL_ADOPTION_POLICY, HERO_MODEL_BUDGET } from "../../../../packages/shared/src/content/modelUpload/budget";
import { heroModelBudgetIssues } from "../../../../packages/shared/src/content/modelUpload/heroModel";
import { inspectModelUpload } from "../../../../packages/shared/src/content/modelUpload/inspect";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const OUTPUT = join(ROOT, "materials/hero-model-library/priority-evidence/palworld-full-motion-options-v1/validation.json");
const WRITE = process.argv.includes("--write");
const sha = (bytes: Uint8Array | Buffer) => createHash("sha256").update(bytes).digest("hex");

const specs = [
  {
    componentId: "opgg-palworld-jetragon.material-bound-256-v1",
    path: "content/assets/models/community/894e7aaa153116876a7c0159f4659374003f0f8f911c8c637a3c6b708f9f71a8.glb",
    sha256: "894e7aaa153116876a7c0159f4659374003f0f8f911c8c637a3c6b708f9f71a8",
    bytes: 4_297_580, clips: 29,
  },
  {
    componentId: "palworld-cattiva-opgg-materials-256-v1",
    path: "content/assets/models/community/b404c9a9593e9c5f742eb929ff78f707fa6bc262f2d8cbefa311b653599dc0a5.glb",
    sha256: "b404c9a9593e9c5f742eb929ff78f707fa6bc262f2d8cbefa311b653599dc0a5",
    bytes: 2_148_052, clips: 33,
  },
] as const;

const codeFiles = [
  "packages/shared/src/content/modelUpload/adoptionPolicy.json",
  "packages/shared/src/content/modelUpload/budget.ts",
  "packages/shared/src/content/modelUpload/heroModel.ts",
  "packages/shared/src/content/modelUpload/inspect.ts",
  "packages/shared/src/content/modelUpload/glb.ts",
  "packages/shared/src/content/schema/model.ts",
];

const validator = createRequire(join(ROOT, "packages/shared/package.json"))("gltf-validator");
const rows = [];
for (const spec of specs) {
  const bytes = new Uint8Array(readFileSync(join(ROOT, spec.path)));
  if (bytes.length !== spec.bytes || sha(bytes) !== spec.sha256) throw new Error(`Changed GLB: ${spec.componentId}`);
  const inspection = await inspectModelUpload(bytes);
  const budget = heroModelBudgetIssues(inspection);
  if (budget.errors.length) throw new Error(`${spec.componentId}: ${budget.errors.join("; ")}`);
  if (inspection.clips.length !== spec.clips) throw new Error(`${spec.componentId}: expected ${spec.clips} clips, got ${inspection.clips.length}`);
  const khronos = await validator.validateBytes(bytes, { uri: spec.path, maxIssues: 0, writeTimestamp: false });
  if (khronos.issues.numErrors !== 0 || khronos.issues.truncated) throw new Error(`${spec.componentId}: Khronos validation failed`);
  rows.push({
    componentId: spec.componentId,
    file: { gitPath: spec.path, bytes: bytes.length, sha256: inspection.sha256 },
    metrics: {
      triangles: inspection.triangles,
      meshes: inspection.meshes,
      textureCount: inspection.textures.length,
      maxTextureEdge: Math.max(...inspection.textures.flatMap((texture) => [texture.width, texture.height])),
      skins: inspection.skins,
      skinnedPrimitives: inspection.skinnedPrimitives,
      joints: inspection.json.skins?.map((skin) => skin.joints.length) ?? [],
      clips: inspection.clips.length,
      maxClipChannels: Math.max(...inspection.clips.map((clip) => clip.channels)),
      maxClipSeconds: Math.max(...inspection.clips.map((clip) => clip.duration)),
    },
    budget,
    khronos: {
      errors: khronos.issues.numErrors, warnings: khronos.issues.numWarnings,
      infos: khronos.issues.numInfos, hints: khronos.issues.numHints, truncated: khronos.issues.truncated,
    },
    formalAdoptionEligible: inspection.triangles <= HERO_MODEL_ADOPTION_POLICY.decimateWhenTrianglesAbove,
  });
}

const receipt = {
  schema: "ggd-palworld-full-motion-option-validation@1",
  currentPolicy: { adoption: HERO_MODEL_ADOPTION_POLICY, runtimeBudget: HERO_MODEL_BUDGET },
  codeInputs: codeFiles.map((path) => {
    const bytes = readFileSync(join(ROOT, path));
    return { gitPath: path, bytes: bytes.length, sha256: sha(bytes) };
  }),
  rows,
  summary: {
    checked: rows.length,
    budgetPassed: rows.filter((row) => row.budget.errors.length === 0).length,
    khronosPassed: rows.filter((row) => row.khronos.errors === 0 && !row.khronos.truncated).length,
    formalAdoptionEligible: rows.filter((row) => row.formalAdoptionEligible).length,
  },
};
const rendered = JSON.stringify(receipt, null, 2) + "\n";
if (WRITE) writeFileSync(OUTPUT, rendered);
else if (readFileSync(OUTPUT, "utf8") !== rendered) throw new Error(`Stale ${relative(ROOT, OUTPUT)}; run with --write`);
console.log(JSON.stringify(receipt.summary));
