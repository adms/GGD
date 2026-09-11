/** Validate the bounded FateUBW static batch against Khronos and GGD contracts. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join, resolve} from 'node:path';

const [repoArg, rootArg] = process.argv.slice(2);
if (!repoArg || !rootArg) throw Error('usage: validate_static_batch.mts <repo> <batch-root>');
const repo = resolve(repoArg), root = resolve(rootArg);
const manifest = JSON.parse(readFileSync(join(root, 'batch-manifest.json'), 'utf8'));
const require = createRequire(join(repo, 'packages/shared/package.json'));
const validator = require('gltf-validator');
const {inspectModelUpload} = await import(join(repo, 'packages/shared/src/content/modelUpload/inspect.ts'));
const {heroModelBudgetIssues} = await import(join(repo, 'packages/shared/src/content/modelUpload/heroModel.ts'));
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const rows = [];
for (const record of manifest.records) {
  const path = join(root, record.candidateId, 'body.glb');
  const bytes = readFileSync(path);
  const khronos = await validator.validateBytes(new Uint8Array(bytes), {
    uri: `${record.candidateId}/body.glb`, maxIssues: 0, writeTimestamp: false,
    externalResourceFunction: async () => { throw Error('external resources prohibited'); },
  });
  const inspection = await inspectModelUpload(new Uint8Array(bytes));
  const budget = heroModelBudgetIssues(inspection);
  assert.equal(khronos.issues.numErrors, 0, record.candidateId + ' Khronos errors');
  assert.equal(khronos.issues.numWarnings, 0, record.candidateId + ' Khronos warnings');
  assert.equal(khronos.issues.truncated, false, record.candidateId + ' truncated validation');
  assert.deepEqual(budget.errors, [], record.candidateId + ' GGD budget errors');
  assert.equal(inspection.clips.length, 0, record.candidateId + ' must remain static');
  assert.equal(inspection.json.skins?.length ?? 0, 0, record.candidateId + ' must remain static mesh only');
  const result = {candidateId: record.candidateId, path, sha256: digest(bytes), bytes: bytes.length,
    khronos, ggdInspection: {triangles: inspection.triangles, meshes: inspection.meshes,
      clips: inspection.clips.length, textures: inspection.textures, report: inspection.report, budget}};
  writeFileSync(join(root, record.candidateId, 'contract-validation.json'), JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
  rows.push(result);
}
const summary = {schema: 'ggd-fateubw-static-batch-contract-validation@1',
  contractCommit: require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim(),
  validator: 'gltf-validator@2.0.0-dev.3.10', records: rows.map(row => ({candidateId: row.candidateId, sha256: row.sha256, bytes: row.bytes,
    khronosIssues: row.khronos.issues, triangles: row.ggdInspection.triangles, drawPrimitives: row.ggdInspection.meshes,
    clipCount: row.ggdInspection.clips, budget: row.ggdInspection.budget})),
  allKhronosErrorsZero: true, allKhronosWarningsZero: true, allGgdBudgetErrorsZero: true,
  scope: 'Structural contract validation of complete static meshes only. Source rigs and native animation remain separate reserves; rendered visual review, rights clearance, rig conversion, backend registration, selection and deployment remain false.'};
writeFileSync(join(root, 'contract-validation.json'), JSON.stringify(summary, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({records: rows.length, output: join(root, 'contract-validation.json')}));
