/** Validate the exact content-addressed Infinity Strash backdrop-repair bytes. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const [repoArg, receiptArg, outputArg] = process.argv.slice(2);
if (!outputArg) throw Error('usage: node --import tsx validate_texture_backdrop_repairs.mts <repo> <receipt.json> <validation.json>');
const repo = resolve(repoArg), receiptPath = resolve(receiptArg), outputPath = resolve(outputArg);
const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
const imp = (path: string) => import(pathToFileURL(join(repo, path)).href);
const [{inspectModelUpload}, {heroModelBudgetIssues}, {HERO_MODEL_ADOPTION_POLICY}] = await Promise.all([
  imp('packages/shared/src/content/modelUpload/inspect.ts'),
  imp('packages/shared/src/content/modelUpload/heroModel.ts'),
  imp('packages/shared/src/content/modelUpload/budget.ts'),
]);
const validator = createRequire(join(repo, 'packages/shared/package.json'))('gltf-validator');
const records = [];
for (const row of receipt.records) {
  const base = readFileSync(resolve(repo, row.output.basePath));
  const frozen = readFileSync(resolve(repo, row.output.frozenPath));
  assert.deepEqual(base, frozen, `${row.candidateId}: base/frozen differ`);
  const khronos = await validator.validateBytes(new Uint8Array(base), {
    format: 'glb', maxIssues: 10000, writeTimestamp: false,
    externalResourceFunction: async () => { throw Error('external GLB resource rejected'); },
  });
  assert.equal(khronos.issues.numErrors, 0, `${row.candidateId}: Khronos errors`);
  assert.equal(khronos.issues.truncated, false, `${row.candidateId}: Khronos report truncated`);
  const inspected = await inspectModelUpload(new Uint8Array(base), 'model');
  assert.equal(inspected.sha256, row.output.sha256, `${row.candidateId}: inspected SHA drift`);
  assert.equal(inspected.report.issues.numErrors, 0, `${row.candidateId}: GGD upload errors`);
  const budget = heroModelBudgetIssues(inspected);
  assert.ok(inspected.triangles > HERO_MODEL_ADOPTION_POLICY.decimateWhenTrianglesAbove);
  assert.equal(budget.errors.length, 1, `${row.candidateId}: expected only formal decimation blocker: ${budget.errors}`);
  records.push({
    candidateId: row.candidateId, sha256: inspected.sha256, bytes: base.length,
    khronos: {errors: khronos.issues.numErrors, warnings: khronos.issues.numWarnings, infos: khronos.issues.numInfos},
    ggdUpload: {errors: inspected.report.issues.numErrors, warnings: inspected.report.issues.numWarnings,
                meshes: inspected.meshes, triangles: inspected.triangles, textures: inspected.textures,
                clips: inspected.clips, skins: inspected.skins, skinnedPrimitives: inspected.skinnedPrimitives},
    runtimeHardLimitsPassed: budget.errors.every((message: string) => message.includes('素材正式採用門檻')),
    formalAdoption: {status: 'needs-decimation', ...HERO_MODEL_ADOPTION_POLICY, errors: budget.errors, warnings: budget.warnings},
    baseFrozenByteIdentical: true,
  });
}
const result = {
  schema: 'ggd.infinity-strash-texture-backdrop-validation@1',
  receipt: receiptPath,
  tools: {khronos: 'gltf-validator@2.0.0-dev.3.10', ggdUpload: 'packages/shared/src/content/modelUpload/inspect.ts',
          adoption: 'packages/shared/src/content/modelUpload/heroModel.ts'},
  records,
  summary: {models: records.length, khronosErrors: records.reduce((n, r) => n + r.khronos.errors, 0),
            ggdUploadErrors: records.reduce((n, r) => n + r.ggdUpload.errors, 0),
            runtimeHardLimitsPassed: records.every(r => r.runtimeHardLimitsPassed),
            formalAdoptionStatus: 'needs-decimation'},
};
const encoded = JSON.stringify(result, null, 2) + '\n';
try {
  writeFileSync(outputPath, encoded, {flag: 'wx'});
} catch (error: any) {
  if (error?.code !== 'EEXIST' || readFileSync(outputPath, 'utf8') !== encoded) throw error;
}
console.log(JSON.stringify(result.summary));
