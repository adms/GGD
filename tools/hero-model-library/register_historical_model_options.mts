import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ACQUIRED_MODEL_OPTIONS } from "../../packages/shared/src/content/heroForge/communityAcquired";
import { heroModelBudgetIssues } from "../../packages/shared/src/content/modelUpload/heroModel";
import { inspectModelUpload } from "../../packages/shared/src/content/modelUpload/inspect";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CHECK = process.argv.includes("--check");
const VALIDATION = path.join(ROOT, "materials/hero-model-library/priority-evidence/historical-model-recovery/validation-normalized-accessors-v3.json");
const POLICY = path.join(ROOT, "materials/hero-model-library/priority-evidence/current-component-policy-audit.json");
const RECEIPT = path.join(ROOT, "materials/hero-model-library/priority-evidence/historical-model-recovery/model-option-registration.json");
const ASTRALYM_DECIMATION_VALIDATION = path.join(ROOT, "materials/hero-model-library/priority-evidence/historical-model-recovery/historical-astralym-decimation-v1/validation.json");

const OPTIONS = [
  {
    componentId: "historical-jetragon-7bc2fa3f8",
    validationComponentId: "historical-jetragon-7bc2fa3f8",
    heroId: "acquired-jetragon",
    modelKey: "community.body.0d9eed3ab4e8246e20a12e2f0ee03786931aeacfe4976e2c",
    label: "空渦龍／7bc2fa3f8 歷史復原版",
  },
  {
    componentId: "historical-astralym-decimated-c45f111d",
    validationComponentId: "historical-astralym-7bc2fa3f8",
    heroId: "acquired-astralym",
    modelKey: "community.body.c45f111dfef172872db990ee8c40161bfba4a9e38f36a959",
    label: "枯星龍／7bc2fa3f8 發光紋理保護減面版",
  },
  {
    componentId: "historical-kita-kita-7bc2fa3f8",
    validationComponentId: "historical-kita-kita-7bc2fa3f8",
    heroId: "acquired-kita-kita",
    modelKey: "community.body.be6148045377a8207a09f7bb5834f4e9104eaadc6822d8a9",
    label: "吉他吉他老伯／7bc2fa3f8 歷史復原版",
  },
  {
    componentId: "historical-lord-nightmares-7bc2fa3f8",
    validationComponentId: "historical-lord-nightmares-7bc2fa3f8",
    heroId: "acquired-lord-nightmares",
    modelKey: "community.body.98ba248a71e17db1bc3ac783d89d4f6aa1c683cd659ad0bd",
    label: "惡夢之王／7bc2fa3f8 歷史復原版",
  },
] as const;

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function sha256(file: string): string { return sha256Bytes(fs.readFileSync(file)); }
function rel(file: string): string { return path.relative(ROOT, file).split(path.sep).join("/"); }
function pin(file: string) { return { gitPath: rel(file), bytes: fs.statSync(file).size, sha256: sha256(file) }; }
function encoded(value: unknown): string { return JSON.stringify(value, null, 2) + "\n"; }

async function build() {
  const validation = JSON.parse(fs.readFileSync(VALIDATION, "utf8"));
  const policy = JSON.parse(fs.readFileSync(POLICY, "utf8"));
  const validationById = new Map(validation.records.map((row: any) => [row.id, row]));
  const policyById = new Map(policy.records.map((row: any) => [row.id, row]));
  const docs = new Map<string, string>();
  const registrations = [];
  for (const option of OPTIONS) {
    const source: any = validationById.get(option.validationComponentId);
    const current: any = policyById.get(option.componentId);
    if (!source || !current) throw new Error(`missing historical evidence: ${option.componentId}`);
    if (source.historicalAcceptanceId !== option.heroId) throw new Error(`hero identity mismatch: ${option.componentId}`);
    if (current.formalHeroAdoption?.eligible !== true || current.runtimeBudget?.pass !== true) {
      throw new Error(`current model policy blocks registration: ${option.componentId}`);
    }
    const glbPath = path.join(ROOT, current.gitPath);
    const bytes = fs.readFileSync(glbPath);
    if (sha256Bytes(bytes) !== current.sha256 || bytes.length !== current.bytes) throw new Error(`changed GLB: ${option.componentId}`);
    const inspected = await inspectModelUpload(bytes);
    const budget = heroModelBudgetIssues(inspected);
    if (budget.errors.length) throw new Error(`${option.componentId}: ${budget.errors.join("; ")}`);
    const selectedClips = source.selectedClips;
    const selected = new Set(Object.values(selectedClips));
    const actual = new Set(inspected.clips.map((clip) => clip.name));
    if (selected.size !== actual.size || [...selected].some((name) => !actual.has(String(name)))) {
      throw new Error(`selected clips do not cover exact GLB clips: ${option.componentId}`);
    }
    const modelDoc = {
      id: option.modelKey,
      schema: "model@1",
      glbPath: current.gitPath.replace(/^content\//, ""),
      scale: 1,
      collisionRadius: 0.6,
      clipMap: selectedClips,
      yawOffsetDeg: 0,
      heroBody: true,
    };
    const modelPath = path.join(ROOT, "content/models", `${option.modelKey}.json`);
    docs.set(modelPath, encoded(modelDoc));
    const options = ACQUIRED_MODEL_OPTIONS[option.heroId] ?? [];
    if (options[0] === option.modelKey || !options.includes(option.modelKey)) {
      throw new Error(`historical option must be retained after the existing default: ${option.heroId}`);
    }
    registrations.push({
      ...option,
      modelDocument: { gitPath: rel(modelPath), bytes: Buffer.byteLength(docs.get(modelPath)!), sha256: sha256Bytes(Buffer.from(docs.get(modelPath)!)) },
      modelGlb: pin(glbPath),
      selectedClips,
      nativeClipCount: inspected.clips.length,
      metrics: {
        triangles: inspected.triangles,
        drawPrimitives: inspected.meshes,
        maxTextureEdge: Math.max(0, ...inspected.textures.flatMap((texture) => [texture.width, texture.height])),
        maxAnimationChannels: Math.max(0, ...inspected.clips.map((clip) => clip.channels)),
        skins: inspected.skins,
        joints: Math.max(0, ...(inspected.json.skins ?? []).map((skin: any) => skin.joints?.length ?? 0)),
      },
      deathPresentation: selectedClips.death === selectedClips.hurt
        ? "native-hurt-clip-plus-authorized-runtime-fade"
        : "native-death-clip",
      runtimeDropdownRegistered: true,
      productionDeploymentVerified: false,
    });
  }
  const receipt = {
    schema: "ggd-historical-model-option-registration@1",
    scope: "Four current-policy-eligible recovered or validated-decimated GLBs registered as non-default Hero Forge model options. This is local authoring evidence, not Main merge or production deployment proof.",
    generatedFrom: [
      pin(VALIDATION), pin(ASTRALYM_DECIMATION_VALIDATION), pin(POLICY), pin(path.join(ROOT, "packages/shared/src/content/heroForge/communityAcquired.ts")), pin(fileURLToPath(import.meta.url)),
    ],
    blocked: [],
    registrations,
    summary: { registered: registrations.length, blockedPendingDecimation: 0, productionDeploymentVerified: false },
  };
  return { docs, receipt: encoded(receipt) };
}

async function main(): Promise<void> {
  const built = await build();
  const outputs = [...built.docs.entries(), [RECEIPT, built.receipt] as [string, string]];
  if (CHECK) {
    const stale = outputs.filter(([file, expected]) => !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== expected);
    if (stale.length) throw new Error(`stale historical option registration: ${stale.map(([file]) => rel(file)).join(", ")}`);
    process.stdout.write(`historical model options current (${OPTIONS.length} registered, 0 blocked)\n`);
    return;
  }
  for (const [file, value] of outputs) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value);
  }
  process.stdout.write(`wrote ${OPTIONS.length} historical model options and registration receipt\n`);
}

await main();
