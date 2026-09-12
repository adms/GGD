/** Revalidate exact GLBs recovered from an earlier Git commit against current contracts. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';

const repo = resolve(process.argv[2] ?? '.');
const output = resolve(process.argv[3] ?? join(repo, 'materials/hero-model-library/priority-evidence/historical-model-recovery/validation.json'));
const historicalCommit = '7bc2fa3f8';
const deliveryPath = 'docs/_reports/community-acquired-heroes/model-delivery-summary.json';
const targets = new Map([
  ['jetragon', {id: 'historical-jetragon-7bc2fa3f8', nameZh: '空渦龍', expectedSha256: '0d9eed3ab4e8246e20a12e2f0ee03786931aeacfe4976e2c1a07c3bbf9106fa6'}],
  ['astralym', {id: 'historical-astralym-7bc2fa3f8', nameZh: '枯星龍', expectedSha256: '618a52817f4fe563ddf339563856180c3acb27106d5fdb839fb469c642495ea8'}],
  ['oyaji', {id: 'historical-kita-kita-7bc2fa3f8', nameZh: '吉他吉他老伯', expectedSha256: '2bbff051c41157f9c9abdf9e9ca6c0b930e15687380f109eefdf208af5d4eb8c'}],
  ['lord-of-nightmares', {id: 'historical-lord-nightmares-7bc2fa3f8', nameZh: '金色魔王／惡夢之王', expectedSha256: 'd5cf4ff0969a21787bfcdd1fabf787339e91c37e266231602004fc2edb5993c8'}],
]);
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const gitShow = (spec: string) => execFileSync('git', ['show', spec], {cwd: repo, maxBuffer: 32 * 1024 * 1024});
const deliveryBytes = gitShow(`${historicalCommit}:${deliveryPath}`);
const delivery = JSON.parse(deliveryBytes.toString('utf8'));
const require = createRequire(join(repo, 'packages/shared/package.json'));
const validator = require('gltf-validator');
const {inspectModelUpload} = await import(join(repo, 'packages/shared/src/content/modelUpload/inspect.ts'));
const {heroModelBudgetIssues} = await import(join(repo, 'packages/shared/src/content/modelUpload/heroModel.ts'));

const contractPaths = [
  'packages/shared/src/content/modelUpload/normalize.ts',
  'packages/shared/src/content/modelUpload/inspect.ts',
  'packages/shared/src/content/modelUpload/glb.ts',
  'packages/shared/src/content/modelUpload/heroModel.ts',
  'packages/shared/src/content/modelUpload/budget.ts',
  'apps/content-api/src/resizeImage.node.ts',
];
const records = [];
for (const historical of delivery.heroes) {
  const target = targets.get(historical.hero);
  if (!target) continue;
  const file = historical.files.find((row: {gitPath: string}) => row.gitPath.endsWith('.glb'));
  assert(file, `${historical.hero}: historical GLB missing from delivery report`);
  assert.equal(file.sha256, target.expectedSha256);
  const bytes = readFileSync(join(repo, file.gitPath));
  assert.equal(digest(bytes), file.sha256, `${historical.hero}: recovered bytes changed`);
  assert.equal(bytes.length, file.bytes, `${historical.hero}: recovered size changed`);
  assert.deepEqual(gitShow(`${historicalCommit}:${file.gitPath}`), bytes, `${historical.hero}: not byte-identical to Git history`);
  const khronos = await validator.validateBytes(new Uint8Array(bytes), {
    uri: file.gitPath, maxIssues: 0, writeTimestamp: false,
    externalResourceFunction: async () => { throw Error('external resources prohibited'); },
  });
  const inspection = await inspectModelUpload(new Uint8Array(bytes));
  const budget = heroModelBudgetIssues(inspection);
  assert.equal(khronos.issues.numErrors, 0, `${historical.hero}: Khronos errors`);
  assert.equal(khronos.issues.truncated, false, `${historical.hero}: truncated Khronos report`);
  assert.deepEqual(budget.errors, [], `${historical.hero}: current GGD budget errors`);
  assert(inspection.clips.length > 0, `${historical.hero}: historical native clips missing`);
  const currentModelPath = join(repo, 'content/models', `${historical.defaultModelKey}.json`);
  const currentModelBytes = readFileSync(currentModelPath);
  const currentModel = JSON.parse(currentModelBytes.toString('utf8'));
  const currentGlbPath = join(repo, 'content', currentModel.glbPath);
  const currentGlbBytes = readFileSync(currentGlbPath);
  assert.notEqual(digest(currentGlbBytes), file.sha256, `${historical.hero}: historical model unexpectedly remains current`);
  records.push({
    id: target.id,
    character: historical.hero,
    nameZh: target.nameZh,
    identityIds: historical.identityIds,
    historicalAcceptanceId: `acquired-${historical.hero === 'lord-of-nightmares' ? 'lord-nightmares' : historical.hero === 'oyaji' ? 'kita-kita' : historical.hero}`,
    historicalModelKey: historical.defaultModelKey,
    gitPath: file.gitPath,
    sha256: file.sha256,
    bytes: file.bytes,
    byteIdenticalToHistoricalGitBlob: true,
    selectedClips: historical.selectedClips,
    fallbacks: historical.fallbacks,
    khronosIssues: khronos.issues,
    ggdInspection: {
      triangles: inspection.triangles,
      drawPrimitives: inspection.meshes,
      textureCount: inspection.textures.length,
      clips: inspection.clips,
      clipCount: inspection.clips.length,
      skinCount: inspection.json.skins?.length ?? 0,
      joints: inspection.json.skins?.map((skin: {joints: number[]}) => skin.joints.length) ?? [],
      budget,
      uploadReport: inspection.report,
    },
    historicalMetrics: historical.metrics,
    historicalWarnings: historical.warnings,
    historicalMaterialLimitations: historical.materialLimitations,
    currentReplacement: {
      modelDocumentGitPath: `content/models/${historical.defaultModelKey}.json`,
      modelDocumentSha256: digest(currentModelBytes),
      glbGitPath: `content/${currentModel.glbPath}`,
      glbSha256: digest(currentGlbBytes),
      glbBytes: currentGlbBytes.length,
    },
    runtimeSelectable: false,
    runtimeDropdownRegistered: false,
    defaultEligible: false,
    heroDefinitionInvented: false,
    deploymentVerified: false,
  });
}
assert.equal(records.length, targets.size, 'Not every historical target was found');
records.sort((a, b) => a.id.localeCompare(b.id));
const result = {
  schema: 'ggd-historical-model-recovery-validation@1',
  historicalCommit,
  historicalDeliveryReport: {
    gitPath: deliveryPath,
    gitObject: `${historicalCommit}:${deliveryPath}`,
    sha256: digest(deliveryBytes),
    bytes: deliveryBytes.length,
  },
  currentContractPins: contractPaths.map(path => {
    const bytes = readFileSync(join(repo, path));
    return {path, sha256: digest(bytes), bytes: bytes.length};
  }),
  validator: 'gltf-validator@2.0.0-dev.3.10',
  records,
  allRecoveredBytesMatchHistoricalGit: true,
  allKhronosErrorsZero: true,
  allCurrentGgdBudgetErrorsZero: true,
  scope: 'Exact historical GLB recovery plus current structural and budget validation. Models remain independent historical body components until a real GGD hero definition, immutable option registration, runtime switching, visual review and deployment are completed.',
};
mkdirSync(dirname(output), {recursive: true});
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({output, records: records.length}));
