/** Validate the two distinct Dark Sakura community-MOD GLBs against current GGD contracts. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';

const [repoArg, workspaceArg, outputArg] = process.argv.slice(2);
if (!repoArg || !workspaceArg || !outputArg) {
  throw Error('usage: validate_dark_sakura.mts <repo> <workspace-root> <output-root>');
}
const repo = resolve(repoArg);
const workspace = resolve(workspaceArg);
const output = resolve(outputArg);
const intake = join(workspace, 'GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-mod-models-batch7/dark-sakura');
const variants = [
  {candidateId: 'fuc-mod-dark-sakura-p1', label: 'sakura-p1', relativePath: 'converted/models/01-p1/body.glb', expectedSha256: 'db1038b27795660802f7701195ddf48ab8b5a520f63f7d5bc0cbacff1dd108eb'},
  {candidateId: 'fuc-mod-dark-sakura-p2', label: 'sakura-p2', relativePath: 'converted/models/02-p2/body.glb', expectedSha256: 'a60f1b30d613f16c95d20579aaadce672bddc0fe0f8d084979aa01d835eee247'},
];
const require = createRequire(join(repo, 'packages/shared/package.json'));
const validator = require('gltf-validator');
const {inspectModelUpload} = await import(join(repo, 'packages/shared/src/content/modelUpload/inspect.ts'));
const {heroModelBudgetIssues} = await import(join(repo, 'packages/shared/src/content/modelUpload/heroModel.ts'));
const {MODEL_UPLOAD_LIMITS} = await import(join(repo, 'packages/shared/src/content/modelUpload/glb.ts'));
const {HERO_MODEL_BUDGET} = await import(join(repo, 'packages/shared/src/content/modelUpload/budget.ts'));
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const rows = [];
mkdirSync(output, {recursive: true});
for (const variant of variants) {
  const path = join(intake, variant.relativePath);
  const bytes = readFileSync(path);
  assert.equal(digest(bytes), variant.expectedSha256, variant.candidateId + ' source bytes changed');
  const khronos = await validator.validateBytes(new Uint8Array(bytes), {
    uri: variant.relativePath,
    maxIssues: 0,
    writeTimestamp: false,
    externalResourceFunction: async () => { throw Error('external resources prohibited'); },
  });
  const inspection = await inspectModelUpload(new Uint8Array(bytes));
  const budget = heroModelBudgetIssues(inspection);
  assert.equal(khronos.issues.numErrors, 0, variant.candidateId + ' Khronos errors');
  assert.equal(khronos.issues.numWarnings, 0, variant.candidateId + ' Khronos warnings');
  assert.equal(khronos.issues.truncated, false, variant.candidateId + ' truncated validation');
  assert.deepEqual(budget.errors, [], variant.candidateId + ' GGD budget errors');
  assert.equal(inspection.clips.length, 0, variant.candidateId + ' must remain animation-free');
  assert.equal(inspection.json.skins?.length ?? 0, 1, variant.candidateId + ' must retain one skin');
  assert.equal(inspection.json.skins?.[0]?.joints?.length ?? 0, 57, variant.candidateId + ' joint count changed');
  const row = {
    ...variant,
    absolutePath: path,
    bytes: bytes.length,
    sha256: digest(bytes),
    khronos,
    ggdInspection: {
      triangles: inspection.triangles,
      drawPrimitives: inspection.meshes,
      clips: inspection.clips,
      textures: inspection.textures,
      nodes: inspection.json.nodes?.length ?? 0,
      skins: inspection.json.skins?.map((skin: {joints?: unknown[]}) => ({joints: skin.joints?.length ?? 0})) ?? [],
      report: inspection.report,
      budget,
    },
  };
  const directory = join(output, variant.label);
  mkdirSync(directory, {recursive: true});
  writeFileSync(join(directory, 'contract-validation.json'), JSON.stringify(row, null, 2) + '\n');
  rows.push(row);
}
const summary = {
  schema: 'ggd.fuc-dark-sakura-current-contract-validation@1',
  contractCommit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim(),
  validator: 'gltf-validator@2.0.0-dev.3.10',
  actualLimits: {upload: MODEL_UPLOAD_LIMITS, hero: HERO_MODEL_BUDGET},
  records: rows.map(row => ({
    candidateId: row.candidateId,
    label: row.label,
    relativePath: row.relativePath,
    sha256: row.sha256,
    bytes: row.bytes,
    khronosIssues: row.khronos.issues,
    triangles: row.ggdInspection.triangles,
    drawPrimitives: row.ggdInspection.drawPrimitives,
    textureCount: row.ggdInspection.textures.length,
    nodeCount: row.ggdInspection.nodes,
    skinJointCounts: row.ggdInspection.skins.map((skin: {joints: number}) => skin.joints),
    clipCount: row.ggdInspection.clips.length,
    budget: row.ggdInspection.budget,
  })),
  allKhronosErrorsZero: true,
  allKhronosWarningsZero: true,
  allGgdBudgetErrorsZero: true,
  scope: 'Current structural upload and hero-budget validation for two distinct community-MOD bodies. This does not prove original Fate/unlimited codes platform data, native animation, source shader parity, rights, backend selection, gameplay or deployment.',
};
writeFileSync(join(output, 'contract-validation.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({records: rows.length, output: join(output, 'contract-validation.json')}));
