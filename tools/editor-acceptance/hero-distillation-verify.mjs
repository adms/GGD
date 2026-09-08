import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {catalogIndex, catalogLookup} from './hero-distillation-catalog.mjs';

const [pairs, indexed, python, out] = process.argv.slice(2).map(x => path.resolve(x));
assert(pairs && indexed && python && out && process.argv.length === 6, 'USAGE: PAIRS_DIR INDEXED_DIR PYTHON NEW_JSON');
assert(!fs.existsSync(out), 'OUTPUT_ALREADY_EXISTS');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file));
const catalogBytes = fs.readFileSync(path.join(pairs, 'catalogs.json'));
const catalogs = JSON.parse(catalogBytes), bundle = read(path.join(indexed, 'catalog-indexes.json'));
assert.equal(bundle.sourceCatalogsSha256, hash(catalogBytes), 'CATALOG_SOURCE_DRIFT');
let bricks = 0, capabilities = 0;
for (const [revision, catalog] of Object.entries(catalogs)) {
  const index = bundle.indexes[revision]; assert.deepEqual(index, catalogIndex(catalog));
  for (const brick of catalog.bricks) {
    assert.deepEqual(catalogLookup(catalog, index, {bricks: [[brick.layer, brick.id]], capabilities: []}).bricks, [brick]);
    bricks++;
  }
  for (const capability of catalog.constraints.planned ?? []) {
    assert.deepEqual(catalogLookup(catalog, index, {bricks: [], capabilities: [capability.key]}).capabilities, [capability]);
    capabilities++;
  }
}
const projectionPath = path.join(indexed, 'projection-verified/report.json');
const projection = read(projectionPath);
assert.equal(projection.scriptSha256, hash(fs.readFileSync('tools/editor-acceptance/hero-distillation-compile.mts')));
assert.equal(projection.projection.scriptSha256, hash(fs.readFileSync('tools/editor-acceptance/hero-distillation-adapter.mjs')));
const commands = [
  [process.execPath, ['--import', 'tsx', '--test', 'tools/editor-acceptance/hero-distillation-pairs.test.mjs',
    'tools/editor-acceptance/hero-distillation-catalog.test.mjs', 'tools/editor-acceptance/hero-distillation-adapter.test.mts']],
  [python, ['tools/editor-acceptance/test_hero_distillation_tokens.py']],
];
const tests = commands.map(([command, args]) => {
  const result = spawnSync(command, args, {encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
    env: {...process.env, DISTILLATION_PROJECTION_REPORT: projectionPath}});
  assert(!result.error && result.status === 0, result.error?.message ?? result.stdout + result.stderr);
  return {command, args, exitCode: result.status, stdout: result.stdout, stderr: result.stderr};
});
const files = ['catalog-indexes.json', 'token-preflight.json', 'projection-verified/report.json',
  'projection-verified/compiled.json', 'projection-verified/projected.json', 'projection-verified/models.json'];
const result = {schema: 'ggd-distillation-preflight-verification@1', nodeVersion: process.version,
  catalogLookup: {revisions: Object.keys(catalogs).length, exactBricks: bricks, exactCapabilities: capabilities, teacherAnswersRead: false},
  outputs: Object.fromEntries(files.map(file => [file, hash(fs.readFileSync(path.join(indexed, file)))])), tests,
  trainingStarted: false, modelWeightsLoaded: false, semanticQualityApproved: false, editorE2EApproved: false};
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({catalogLookup: result.catalogLookup, testCommandsPassed: tests.length, outputs: files.length}));
