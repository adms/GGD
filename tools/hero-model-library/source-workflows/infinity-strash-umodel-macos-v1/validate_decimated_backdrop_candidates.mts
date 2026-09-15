/** Validate exact <=8,000-triangle Strash candidates and their A/B evidence. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const [repoArg, generationArg, visualArg, outputArg] = process.argv.slice(2);
if (!outputArg) throw Error('usage: node --import tsx validate_decimated_backdrop_candidates.mts <repo> <generation.json> <visual.json> <validation.json>');
const repo = path.resolve(repoArg), generationPath = path.resolve(generationArg), visualPath = path.resolve(visualArg), outputPath = path.resolve(outputArg);
const generation = JSON.parse(fs.readFileSync(generationPath, 'utf8'));
const visual = JSON.parse(fs.readFileSync(visualPath, 'utf8'));
const imp = (name: string) => import(pathToFileURL(path.join(repo, name)).href);
const [{inspectModelUpload}, {heroModelBudgetIssues}, {HERO_MODEL_ADOPTION_POLICY}, {checkRig}, glb] = await Promise.all([
  imp('packages/shared/src/content/modelUpload/inspect.ts'), imp('packages/shared/src/content/modelUpload/heroModel.ts'),
  imp('packages/shared/src/content/modelUpload/budget.ts'), imp('tools/model-budget/rig.ts'), imp('tools/model-budget/glb.ts'),
]);
const validator = createRequire(path.join(repo, 'packages/shared/package.json'))('gltf-validator');
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const pin = (file: string) => ({path: file, bytes: fs.statSync(file).size, sha256: digest(fs.readFileSync(file))});
const COMPONENT_BYTES: Record<number, number> = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4};
const COMPONENTS: Record<string, number> = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16};
function accessorDigest(model: any, index: number): string {
  const accessor = model.json.accessors[index];
  assert(accessor && accessor.bufferView !== undefined && !accessor.sparse, `unsupported accessor ${index}`);
  const view = model.json.bufferViews[accessor.bufferView];
  const elementBytes = COMPONENT_BYTES[accessor.componentType] * COMPONENTS[accessor.type];
  const stride = view.byteStride ?? elementBytes;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const logical = Buffer.alloc(accessor.count * elementBytes);
  for (let row = 0; row < accessor.count; row++) {
    model.bin.copy(logical, row * elementBytes, start + row * stride, start + row * stride + elementBytes);
  }
  return digest(logical);
}
function semanticPreservation(sourceFile: string, candidateFile: string) {
  const before = glb.readGlb(sourceFile), after = glb.readGlb(candidateFile);
  assert.deepEqual(after.json.scenes, before.json.scenes, 'scenes changed');
  assert.equal(after.json.scene, before.json.scene, 'default scene changed');
  assert.deepEqual(after.json.skins, before.json.skins, 'skin definitions changed');
  assert.deepEqual(after.json.animations, before.json.animations, 'animation definitions changed');
  const primitiveRows = [];
  assert.equal(after.json.meshes.length, before.json.meshes.length, 'mesh count changed');
  for (let mesh = 0; mesh < before.json.meshes.length; mesh++) {
    const left = before.json.meshes[mesh].primitives, right = after.json.meshes[mesh].primitives;
    assert.equal(right.length, left.length, `mesh ${mesh}: primitive count changed`);
    for (let primitive = 0; primitive < left.length; primitive++) {
      assert.deepEqual(Object.keys(right[primitive].attributes).sort(), Object.keys(left[primitive].attributes).sort(), 'attribute semantics changed');
      const exactAttributes = [];
      for (const semantic of Object.keys(left[primitive].attributes)) {
        assert.equal(accessorDigest(after, right[primitive].attributes[semantic]), accessorDigest(before, left[primitive].attributes[semantic]), `${semantic} values changed`);
        exactAttributes.push(semantic);
      }
      primitiveRows.push({mesh, primitive, materialBefore: before.json.materials[left[primitive].material]?.name,
        materialAfter: after.json.materials[right[primitive].material]?.name,
        trianglesBefore: before.json.accessors[left[primitive].indices].count / 3,
        trianglesAfter: after.json.accessors[right[primitive].indices].count / 3, exactAttributes});
      assert.equal(primitiveRows.at(-1).materialAfter, primitiveRows.at(-1).materialBefore, 'material assignment changed');
    }
  }
  const imageRows = (model: any) => glb.readImages(model).map((image: any) => ({width: image.w, height: image.h, format: image.format, sha256: digest(glb.imageBytes(model, image))}));
  assert.deepEqual(imageRows(after), imageRows(before), 'embedded images changed');
  for (let skin = 0; skin < before.json.skins.length; skin++) {
    assert.equal(accessorDigest(after, after.json.skins[skin].inverseBindMatrices), accessorDigest(before, before.json.skins[skin].inverseBindMatrices), 'inverse bind matrices changed');
  }
  for (let animation = 0; animation < before.json.animations.length; animation++) {
    for (let sampler = 0; sampler < before.json.animations[animation].samplers.length; sampler++) {
      const left = before.json.animations[animation].samplers[sampler], right = after.json.animations[animation].samplers[sampler];
      assert.equal(accessorDigest(after, right.input), accessorDigest(before, left.input), 'animation times changed');
      assert.equal(accessorDigest(after, right.output), accessorDigest(before, left.output), 'animation values changed');
    }
  }
  return {sceneDefinitionsExact: true, skinDefinitionsAndInverseBindMatricesExact: true,
    animationDefinitionsTimesAndValuesExact: true, allNonIndexVertexAttributesExact: true,
    embeddedImagesExact: true, materialAssignmentsExactByName: true, primitiveRows};
}

const records = [];
for (const row of generation.records) {
  const sourceFile = row.source.base.path, candidateFile = row.output.base.path;
  assert.equal(pin(sourceFile).sha256, row.sourceSha256);
  assert.equal(pin(candidateFile).sha256, row.outputSha256);
  assert.deepEqual(fs.readFileSync(candidateFile), fs.readFileSync(row.output.frozen.path), 'base/frozen differ');
  assert.deepEqual(fs.readFileSync(candidateFile), fs.readFileSync(row.output.local.path), 'Git/local differ');
  const [source, candidate] = await Promise.all([inspectModelUpload(fs.readFileSync(sourceFile)), inspectModelUpload(fs.readFileSync(candidateFile))]);
  const khronos = await validator.validateBytes(new Uint8Array(fs.readFileSync(candidateFile)), {format: 'glb', maxIssues: 10000, writeTimestamp: false,
    externalResourceFunction: async () => { throw Error('external resource rejected'); }});
  assert.equal(khronos.issues.numErrors, 0, `${row.candidateId}: Khronos errors`);
  assert.equal(khronos.issues.truncated, false, `${row.candidateId}: Khronos truncated`);
  assert.equal(candidate.report.issues.numErrors, 0, `${row.candidateId}: GGD upload errors`);
  const budget = heroModelBudgetIssues(candidate);
  assert.deepEqual(budget.errors, [], `${row.candidateId}: budget errors`);
  assert(candidate.triangles <= HERO_MODEL_ADOPTION_POLICY.decimatedTargetTrianglesMax, `${row.candidateId}: target missed`);
  assert.deepEqual(candidate.clips, source.clips, `${row.candidateId}: native clip metadata changed`);
  const rig = checkRig(sourceFile, candidateFile, 'fewer');
  assert.equal(rig.ok, true, `${row.candidateId}: ${rig.reasons.join('; ')}`);
  const visualRow = visual.records.find((item: any) => item.candidateId === row.candidateId);
  assert(visualRow && visualRow.candidate.sha256 === row.outputSha256, `${row.candidateId}: visual candidate drift`);
  assert.equal(visualRow.metricGatePassed, true, `${row.candidateId}: visual metric failed`);
  assert.equal(visualRow.humanReview.result, 'accepted', `${row.candidateId}: human review pending`);
  records.push({candidateId: row.candidateId, heroId: row.heroId, character: row.character, form: row.form,
    source: pin(sourceFile), candidate: pin(candidateFile), metrics: {triangles: candidate.triangles, meshes: candidate.meshes,
      maxTextureEdge: Math.max(...candidate.textures.flatMap((texture: any) => [texture.width, texture.height])),
      skins: candidate.skins, joints: rig.after.joints, clips: candidate.clips},
    khronos: {errors: khronos.issues.numErrors, warnings: khronos.issues.numWarnings, infos: khronos.issues.numInfos},
    ggdUploadErrors: candidate.report.issues.numErrors, ggdBudget: budget, rig,
    preservation: semanticPreservation(sourceFile, candidateFile),
    animationProvenance: {kind: 'native-source-clips-preserved', nativeClipCount: candidate.clips.length,
      nativeClips: candidate.clips.map((clip: any) => clip.name), generatedClips: 0, retargetedClips: 0},
    visualEvidence: {path: visualPath, maxChangedPixelPctAtChannelDeltaGt10: visualRow.maxChangedPixelPctAtChannelDeltaGt10,
      conservativeChangedPixelDiagnosticUnder5: visualRow.conservativeChangedPixelDiagnosticUnder5,
      maxLitClassificationXorPctAtLuma128: visualRow.maxLitClassificationXorPctAtLuma128,
      contractMaxPct: 5, metricGatePassed: true, humanReview: visualRow.humanReview},
    formalHeroAdoptionEligible: true, runtimeSelectable: false, productionDeploymentVerified: false});
}
const result = {schema: 'ggd.infinity-strash-texture-backdrop-decimation-validation@1', generation: pin(generationPath), visual: pin(visualPath), records,
  summary: {candidates: records.length, allFormalAdoptionEligible: records.every((row: any) => row.formalHeroAdoptionEligible),
    khronosErrors: records.reduce((sum: number, row: any) => sum + row.khronos.errors, 0),
    ggdUploadErrors: records.reduce((sum: number, row: any) => sum + row.ggdUploadErrors, 0),
    allRigChecksPassed: records.every((row: any) => row.rig.ok), allVisualReviewsAccepted: true},
  boundaries: {centralIndexesModified: false, championPointersModified: false, runtimeSelectable: false, productionDeploymentVerified: false}};
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result.summary));
