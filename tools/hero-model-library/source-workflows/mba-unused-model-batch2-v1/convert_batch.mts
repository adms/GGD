/**
 * Produce a deterministic, six-clip GGD conversion candidate from the second
 * four-body MBA Complete Form 1.60 reserve batch.
 *
 * The source bytes stay in the shared asset-library extraction.  This script
 * runs the same normalizer, Khronos validator and budget checks used by the
 * backend importer, then retains only the six explicitly named native clips.
 * It does not register a hero, change a default, or claim that the selected
 * death surrogate has received gameplay approval.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

import {
  prepareUploadedHeroModel,
  verifyUploadedHeroModel,
} from "../../../../packages/shared/src/content/modelUpload/heroModel";
import {
  parseUploadGlb,
  readFloatAccessor,
} from "../../../../packages/shared/src/content/modelUpload/glb";

type Config = {
  slug: string;
  sourceCharacterId: string;
  characterZh: string;
  characterNative: string;
  workZh: string;
  sourceRelativePath: string;
};

const CONFIG: Config[] = [
  {
    slug: "nowel",
    sourceCharacterId: "mba:Chara02_O",
    characterZh: "諾威爾·迪亞斯塔西斯",
    characterNative: "ノウェル・ディアスタシス",
    workZh: "原創（魔法少女武鬥祭）",
    sourceRelativePath: "outputs/game-asset-library-20260907/magical-battle-arena/models/Model/Chara02_O/Nowel.glb",
  },
  {
    slug: "kukuri",
    sourceCharacterId: "mba:Chara07_02",
    characterZh: "柯柯麗",
    characterNative: "ククリ",
    workZh: "魔法陣咕嚕咕嚕（魔法少女武鬥祭）",
    sourceRelativePath: "outputs/game-asset-library-20260907/magical-battle-arena/models/Model/Chara07/KukuriMigMig.glb",
  },
  {
    slug: "naga",
    sourceCharacterId: "mba:Chara08",
    characterZh: "白蛇娜卡",
    characterNative: "白蛇のナーガ",
    workZh: "秀逗魔導士（魔法少女武鬥祭）",
    sourceRelativePath: "outputs/game-asset-library-20260907/magical-battle-arena/models/Model/Chara08/Naga.glb",
  },
  {
    slug: "gajet1",
    sourceCharacterId: "mba:Chara09",
    characterZh: "Gadget Drone I 型",
    characterNative: "ガジェットドローンⅠ型",
    workZh: "魔法少女奈葉（魔法少女武鬥祭）",
    sourceRelativePath: "outputs/game-asset-library-20260907/magical-battle-arena/models/Model/Chara09/Gajet1.glb",
  },
];

const CLIP_NAMES: Record<string, Record<"idle" | "run" | "attack" | "cast" | "hurt" | "death", string>> = {
  nowel: { idle: "wait", run: "F-Move", attack: "attack_01", cast: "maryokuwaza_01", hurt: "Damage-1", death: "D-Down" },
  kukuri: { idle: "wait", run: "F-Move", attack: "attack_01_01", cast: "sp01", hurt: "Damage-1", death: "D-Down" },
  naga: { idle: "wait", run: "F-Move", attack: "attack_01", cast: "sp01_01", hurt: "Damage-1", death: "D-Down" },
  gajet1: { idle: "wait", run: "F-Move", attack: "attack_01", cast: "sp01_01", hurt: "Damage-1", death: "D-Down" },
};

function parseArgs() {
  let workspace = "", input = "", output = "", reference = "";
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--workspace") workspace = process.argv[++i] ?? "";
    else if (arg === "--input") input = process.argv[++i] ?? "";
    else if (arg === "--output") output = process.argv[++i] ?? "";
    else if (arg === "--reference") reference = process.argv[++i] ?? "";
    else throw new Error(`unknown argument: ${arg}`);
  }
  assert(workspace && input && output, "usage: convert_batch.mts --workspace DIR --input DIR --output DIR");
  return { workspace: resolve(workspace), input: resolve(input), output: resolve(output), reference: reference ? resolve(reference) : "" };
}

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const require = createRequire(import.meta.url);
const packageVersion = (name: string) => require(`${name}/package.json`).version;

function finiteFloatValues(bytes: Uint8Array) {
  const { json, bin } = parseUploadGlb(bytes);
  let accessorCount = 0, valueCount = 0;
  for (const [index, accessor] of json.accessors.entries()) {
    if (accessor.componentType !== 5126) continue;
    const values = readFloatAccessor(json, bin, index);
    assert(values.every(Number.isFinite), `accessor ${index} contains a non-finite float`);
    accessorCount++;
    valueCount += values.length;
  }
  return { accessorCount, valueCount, allFinite: true };
}

const args = parseArgs();
const records = [];
for (const config of CONFIG) {
  const clipNames = CLIP_NAMES[config.slug];
  assert(clipNames, `${config.slug}: missing clip configuration`);
  const preparedPath = join(args.input, config.slug, "body-prepared.glb");
  const preparationPath = join(args.input, config.slug, "preparation.json");
  const preparation = JSON.parse(readFileSync(preparationPath, "utf8"));
  const sourcePath = join(args.workspace, config.sourceRelativePath);
  const rawSourceBytes = new Uint8Array(readFileSync(sourcePath));
  assert.equal(sha256(rawSourceBytes), preparation.source.sha256, `${config.slug}: raw source pin changed`);
  const sourceBytes = new Uint8Array(readFileSync(preparedPath));
  assert.equal(sha256(sourceBytes), preparation.output.sha256, `${config.slug}: prepared source pin changed`);
  const sourceSha256 = sha256(rawSourceBytes);
  const sourceDocument = parseUploadGlb(sourceBytes).json;
  const sourceNames = (sourceDocument.animations ?? []).map((clip) => clip.name ?? "");
  const selections = Object.fromEntries(Object.entries(clipNames).map(([state, name]) => {
    const matches = sourceNames.map((candidate, index) => candidate === name ? index : -1).filter((index) => index >= 0);
    assert.equal(matches.length, 1, `${config.slug}: expected one native clip named ${name}`);
    return [state, matches[0]];
  })) as Record<keyof typeof clipNames, number>;

  const sourceShaBefore = sha256(sourceBytes);
  const prepared = await prepareUploadedHeroModel(sourceBytes, selections, 0);
  assert.equal(sha256(sourceBytes), sourceShaBefore, `${config.slug}: source changed during conversion`);
  const verification = await verifyUploadedHeroModel(prepared.model, prepared.bytes);
  assert.deepEqual(verification.inspected.report.issues.numErrors, 0, `${config.slug}: Khronos errors remain`);
  assert.deepEqual(verification.inspected.report.issues.truncated, false, `${config.slug}: Khronos report truncated`);
  assert.deepEqual(Object.keys(prepared.model.clipMap), ["idle", "run", "attack", "cast", "hurt", "death"]);
  assert.equal(new Set(Object.values(prepared.model.clipMap)).size, 6, `${config.slug}: six unique native clips required`);
  assert.equal(verification.inspected.clips.length, 6, `${config.slug}: final GLB must contain exactly six clips`);
  assert.equal(verification.inspected.skins, 1, `${config.slug}: expected one preserved skin`);
  assert.equal(verification.inspected.skinnedPrimitives, verification.inspected.meshes,
    `${config.slug}: every draw primitive must remain skinned`);

  const directory = join(args.output, config.slug);
  mkdirSync(directory, { recursive: true });
  const bodyPath = join(directory, "body.glb");
  writeFileSync(bodyPath, prepared.bytes);
  const deterministicRebuild = args.reference ? (() => {
    const referencePath = join(args.reference, config.slug, "body.glb");
    const referenceBytes = new Uint8Array(readFileSync(referencePath));
    assert.deepEqual(prepared.bytes, referenceBytes, `${config.slug}: byte-identical rebuild failed`);
    return { verified: true, referencePath, sha256: sha256(referenceBytes) };
  })() : { verified: false, reason: "No independent reference build supplied" };
  const finite = finiteFloatValues(prepared.bytes);
  const receipt = {
    schema: "ggd-mba-unused-model-conversion@1",
    sourceId: "magical-battle-arena-complete-form-1.60-plus",
    sourceVersion: "Complete Form 1.60+",
    sourcePlatform: "Windows PC",
    selectionClass: "mba",
    ...config,
    identityEvidence: {
      characterDefinition: `CharacterDefinitions/${config.sourceCharacterId.slice(4)}.chr`,
      mapping: "MBA character-candidates.json directly maps the character definition and native model to this GLB",
    },
    source: {
      absolutePath: sourcePath,
      workspaceRelativePath: config.sourceRelativePath,
      bytes: rawSourceBytes.byteLength,
      sha256: sourceSha256,
      preparationReceipt: preparationPath,
      preparedBytes: sourceBytes.byteLength,
      preparedSha256: sha256(sourceBytes),
      originalAnimationCount: preparation.nativeClips.originalCount,
      originalAnimationNames: preparation.nativeClips.originalNames,
      preparedAnimationCount: sourceNames.length,
    },
    transformation: {
      tool: "packages/shared/src/content/modelUpload/heroModel.ts::prepareUploadedHeroModel",
      toolchain: {
        node: process.version,
        tsx: packageVersion("tsx"),
        gltfValidator: packageVersion("gltf-validator"),
        sharedImporter: "packages/shared/src/content/modelUpload/heroModel.ts",
      },
      selectedNativeClips: Object.fromEntries(Object.entries(clipNames).map(([state, name]) => [state, {
        name,
        preparedIndex: selections[state as keyof typeof selections],
        originalIndex: preparation.nativeClips.selected.find((row: { name: string }) => row.name === name).originalIndex,
        origin: "native-same-character",
        semanticApproval: state === "death" ? "pending-death-surrogate-playback-review" : "pending-playback-review",
      }])),
      normalizer: prepared.normalized,
      geometryDecimation: "not-required-below-10000-triangle-adoption-trigger",
      textureResize: "not-required-all-embedded-textures-at-or-below-256px",
    },
    output: {
      absolutePath: bodyPath,
      bytes: prepared.bytes.byteLength,
      sha256: prepared.model.sha256,
      triangles: verification.inspected.triangles,
      drawPrimitives: verification.inspected.meshes,
      textureCount: verification.inspected.textures.length,
      maxTextureEdge: Math.max(...verification.inspected.textures.flatMap((texture) => [texture.width, texture.height])),
      skins: verification.inspected.skins,
      skinnedPrimitives: verification.inspected.skinnedPrimitives,
      clipCount: verification.inspected.clips.length,
      clipMap: prepared.model.clipMap,
      maxChannelsPerClip: Math.max(...verification.inspected.clips.map((clip) => clip.channels)),
      khronos: verification.inspected.report.issues,
      finiteFloatValues: finite,
      budgetWarnings: verification.warnings,
      budgetErrors: [],
    },
    sourcePreserved: sha256(rawSourceBytes) === sourceSha256,
    deterministicRebuild,
    runtimeSelectable: false,
    backendRegistered: false,
    defaultChanged: false,
    productionDeploymentVerified: false,
    limitations: [
      "The source identity and GLB body relationship are direct, but these characters do not have a current GGD hero definition.",
      "The six clips are same-character native MBA motions selected by exact source names; gameplay timing and playback approval remain pending.",
      "D-Down is a native knockdown motion proposed only as a death surrogate; it is not approved as native death choreography.",
      "Original MBA shader parity is not established by the base-color WebGL review.",
      "No backend dropdown registration, default selection, gameplay binding, production switch test or deployment was performed.",
    ],
  };
  writeFileSync(join(directory, "conversion.json"), JSON.stringify(receipt, null, 2) + "\n");
  records.push({ slug: config.slug, sha256: prepared.model.sha256, bytes: prepared.bytes.byteLength,
    sourceSha256, triangles: verification.inspected.triangles, drawPrimitives: verification.inspected.meshes,
    clips: verification.inspected.clips.length, khronosErrors: verification.inspected.report.issues.numErrors });
}
writeFileSync(join(args.output, "batch.json"), JSON.stringify({
  schema: "ggd-mba-unused-model-conversion-batch@1",
  records,
  sourceCount: records.length,
  distinctSourceSha256Count: new Set(records.map((record) => record.sourceSha256)).size,
  distinctOutputSha256Count: new Set(records.map((record) => record.sha256)).size,
  defaultChanged: false,
  backendRegistered: false,
  productionDeploymentVerified: false,
}, null, 2) + "\n");
console.log(JSON.stringify({ output: args.output, records }, null, 2));
