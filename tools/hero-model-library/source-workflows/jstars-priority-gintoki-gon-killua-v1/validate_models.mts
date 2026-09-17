/** Validate the already-materialized model candidates used by the priority-three audit. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';

const repo = resolve(process.argv[2] ?? '.');
const output = resolve(process.argv[3] ?? join(repo,
  'materials/hero-model-library/source-inventories/jstars-priority-gintoki-gon-killua-v1/model-validation.json'));
const workspace = dirname(repo);
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const require = createRequire(join(repo, 'packages/shared/package.json'));
const validator = require('gltf-validator');
const {inspectModelUpload} = await import(join(repo, 'packages/shared/src/content/modelUpload/inspect.ts'));
const {heroModelBudgetIssues} = await import(join(repo, 'packages/shared/src/content/modelUpload/heroModel.ts'));

const targets = [
  {
    id: 'gintoki-current-300-exact', character: '坂田銀時', sourceGame: '300英雄', sourceClass: '300heroes',
    path: join(repo, 'content/assets/models/community/versions/02b6cd26cdd988632f0d79a282b48d2f7f29603911654ba25c2fd5fbcf814d5d.glb'),
    modelDocument: join(repo, 'content/models/version.body.e034a4c068c9d6936a97d6d3b879cd38fd9c54b8c9a3887a.json'),
    registered: true, expectedClipMap: ['single_idle', 'single_run', 'single_attack_attcom_1', 'single_skill_05', 'dead'],
  },
  {
    id: 'gon-thunderstore-static', character: '小傑·富力士', sourceGame: 'community mod', sourceClass: 'community-mod',
    path: join(workspace, 'GGD-Asset-Library/conversions/jumpforce-gon-thunderstore-v1/optimized-256/body.glb'),
    modelDocument: null,
    registered: false, expectedClipMap: [],
  },
  {
    id: 'killua-current-300-exact', character: '奇犽·揍敵客', sourceGame: '300英雄', sourceClass: '300heroes',
    path: join(repo, 'content/assets/models/community/versions/0c1d193db34f4e4fe24f58128a5a93f4028879ccf8f3a905a399220ab8c804e2.glb'),
    modelDocument: join(repo, 'content/models/version.body.78a22a94f2785d3bcd6e0ef32d8220dc88f398167a46ea8f.json'),
    registered: true, expectedClipMap: ['bat_idle', 'single_run', 'single_attack_attcom_1', 'single_skill_01', 'dead'],
  },
] as const;

const rows = [];
for (const target of targets) {
  const bytes = readFileSync(target.path);
  const khronos = await validator.validateBytes(new Uint8Array(bytes), {
    uri: target.path, maxIssues: 0, writeTimestamp: false,
    externalResourceFunction: async () => { throw Error('external resources prohibited'); },
  });
  const inspection = await inspectModelUpload(new Uint8Array(bytes));
  const clipNames = inspection.clips.map((clip: {name: string}) => clip.name);
  const document = target.modelDocument ? JSON.parse(readFileSync(target.modelDocument, 'utf8')) : null;
  if (document) {
    assert.equal(resolve(repo, 'content', document.glbPath), target.path, `${target.id}: model document points elsewhere`);
    assert.deepEqual([...new Set(Object.values(document.clipMap))].sort(), [...target.expectedClipMap].sort(), `${target.id}: clip map changed`);
  }
  assert.equal(khronos.issues.numErrors, 0, `${target.id}: Khronos errors`);
  assert.equal(khronos.issues.truncated, false, `${target.id}: Khronos result truncated`);
  for (const name of target.expectedClipMap) assert(clipNames.includes(name), `${target.id}: missing ${name}`);
  const budget = heroModelBudgetIssues(inspection);
  rows.push({
    id: target.id, character: target.character, sourceGame: target.sourceGame,
    sourceClass: target.sourceClass, absolutePath: target.path, bytes: bytes.length, sha256: digest(bytes),
    metrics: {
      triangles: inspection.triangles, drawPrimitives: inspection.meshes,
      textureCount: inspection.textures.length, clipCount: inspection.clips.length,
      clipNames, skinCount: inspection.json.skins?.length ?? 0,
      joints: inspection.json.skins?.map((skin: {joints: number[]}) => skin.joints.length) ?? [],
    },
    khronos: khronos.issues,
    currentBudget: budget,
    modelDocument: target.modelDocument,
    stateMap: document?.clipMap ?? null,
    registeredAsExistingOption: target.registered,
    isJStarsAsset: false,
  });
}

const result = {
  schema: 'ggd.jstars-priority-three-model-validation@1',
  workflowId: 'jstars-priority-gintoki-gon-killua-v1',
  note: 'These are reusable existing candidates. None is evidence of a converted J-Stars model.',
  models: rows,
  summary: {
    checked: rows.length,
    khronosZeroError: rows.filter((row) => row.khronos.numErrors === 0).length,
    registeredExistingOptions: rows.filter((row) => row.registeredAsExistingOption).length,
    jstarsConverted: 0,
  },
};
mkdirSync(dirname(output), {recursive: true});
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result.summary));
