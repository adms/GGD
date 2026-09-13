/** Prepare one reviewed Infinity Strash candidate with GGD's production upload contract. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash as hash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

const [repoArg, candidateId, inputArg, outputArg] = process.argv.slice(2);
if (!outputArg) throw Error('usage: prepare_runtime_candidate.mts <repo> <candidate-id> <input GLB> <new output directory>');
const repo = resolve(repoArg), inputPath = resolve(inputArg), output = resolve(outputArg);

const specifications: Record<string, {mapping: Record<string, string>; roleNotes: Record<string, string>; limitations: string[]}> = {
  'dai-pn010-02': {
    mapping: {idle: 'GGD_native_idle', run: 'GGD_native_run', attack: 'GGD_native_attack', cast: 'GGD_native_special02', hurt: 'GGD_native_down', death: 'GGD_native_down'},
    roleNotes: {
      idle: 'Infinity Strash native N_Idle loop', run: 'Infinity Strash native forward run', attack: 'Infinity Strash native attack',
      cast: 'Infinity Strash native Special02; provisional GGD cast mapping', hurt: 'Native down pose reused as hurt', death: 'Native down pose reused as death; no distinct Dai death sequence acquired',
    },
    limitations: ['GGD hurt and death both reuse the acquired one-frame native down pose.', 'Native Special01 stays in the preserved conversion/archive set but is not referenced by the six-state runtime document.', 'Weapon switching, animation events, original toon shader parity, gameplay acceptance and deployment remain pending.'],
  },
  'vearn-en801-pre-transformation': {
    mapping: {idle: 'GGD_native_idle', run: 'GGD_native_run', attack: 'GGD_native_attack', cast: 'GGD_native_special01', hurt: 'GGD_native_death', death: 'GGD_native_death'},
    roleNotes: {
      idle: 'Infinity Strash native idle loop', run: 'Infinity Strash native forward movement', attack: 'Infinity Strash native attack',
      cast: 'Infinity Strash native Special01; provisional GGD cast mapping', hurt: 'Native death sequence reused as hurt', death: 'Infinity Strash native death sequence',
    },
    limitations: ['This is EN801 old Vearn before transformation; no post-transformation Vearn body was located in either primary PAK.', 'GGD hurt reuses the native death sequence.', 'Kaizer Phoenix remains in the preserved conversion/archive set and is excluded from runtime because the source PSA references 100 absent effect/helper bones.', 'Original effect systems, toon shader parity, animation events, gameplay acceptance and deployment remain pending.'],
  },
  'popp-pn020-00': {
    mapping: {idle: 'GGD_native_idle', run: 'GGD_native_run', attack: 'GGD_native_attack', cast: 'GGD_native_special03', hurt: 'GGD_native_down', death: 'GGD_native_down'},
    roleNotes: {
      idle: 'Infinity Strash native battle idle loop', run: 'Infinity Strash native forward battle run', attack: 'Infinity Strash native attack',
      cast: 'Infinity Strash native Special03 phase 01; provisional GGD cast mapping', hurt: 'Native down loop reused as hurt', death: 'Native down loop reused as death; no distinct PN020 death AnimSequence was acquired',
    },
    limitations: ['GGD hurt and death both reuse the acquired native down loop because PN020 has no distinct death AnimSequence in the extracted package set.', 'Native Special01 and Special02 remain embedded and preserved but are not referenced by the six-state runtime document.', 'The original 8x8 hair base texture relies on game shader parameters; the runtime candidate preserves the exported texture and simplified PBR material, so toon shader and hair-colour parity require visual review.', 'Weapon attachment and switching, animation events, original effects, gameplay acceptance and deployment remain pending.'],
  },
};
const spec = specifications[candidateId];
if (!spec) throw Error(`unknown candidate: ${candidateId}`);
mkdirSync(output, {recursive: false});
const input = new Uint8Array(readFileSync(inputPath));
const digest = (value: Uint8Array) => hash('sha256').update(value).digest('hex');
const imp = (path: string) => import(join(repo, path));
const [{inspectModelUpload}, {prepareUploadedHeroModel, verifyUploadedHeroModel, heroModelBudgetIssues}, {resizeImageWithFfmpeg}] = await Promise.all([
  imp('packages/shared/src/content/modelUpload/inspect.ts'), imp('packages/shared/src/content/modelUpload/heroModel.ts'), imp('apps/content-api/src/resizeImage.node.ts'),
]);
const before = await inspectModelUpload(input);
const selections = Object.fromEntries(Object.entries(spec.mapping).map(([state, name]) => {
  const index = before.clips.findIndex((clip: {name: string}) => clip.name === name);
  assert.notEqual(index, -1, `missing ${state} source clip ${name}`);
  return [state, index];
}));
const prepared = await prepareUploadedHeroModel(input, selections, 0, {resizeImage: resizeImageWithFfmpeg});
const verified = await verifyUploadedHeroModel(prepared.model, prepared.bytes);
const require = createRequire(join(repo, 'packages/shared/package.json'));
const validator = require('gltf-validator');
const khronos = await validator.validateBytes(prepared.bytes, {uri: 'body.glb', maxIssues: 10000, writeTimestamp: false, externalResourceFunction: async () => { throw Error('external GLB resource rejected'); }});
assert.equal(khronos.issues.numErrors, 0);
assert.deepEqual(prepared.model.clipMap, spec.mapping);
assert.deepEqual(heroModelBudgetIssues(verified.inspected).errors, []);
writeFileSync(join(output, 'body.glb'), prepared.bytes, {flag: 'wx'});
writeFileSync(join(output, 'model.json'), JSON.stringify(prepared.document, null, 2) + '\n', {flag: 'wx'});
writeFileSync(join(output, 'uploaded-model.json'), JSON.stringify(prepared.model, null, 2) + '\n', {flag: 'wx'});
const receipt = {
  schema: 'ggd.infinity-strash-runtime-candidate@1', candidateId, contract: {preparation: 'prepareUploadedHeroModel', verification: 'verifyUploadedHeroModel'},
  input: {path: inputPath, bytes: input.length, sha256: digest(input), clips: before.clips},
  output: {path: join(output, 'body.glb'), bytes: prepared.bytes.length, sha256: digest(prepared.bytes), document: prepared.document, uploadedModel: prepared.model},
  roleMapping: Object.entries(spec.mapping).map(([state, sourceName]) => ({state, sourceName, sourceIndex: before.clips.findIndex((clip: {name: string}) => clip.name === sourceName), origin: spec.roleNotes[state]})),
  inspection: {triangles: verified.inspected.triangles, meshes: verified.inspected.meshes, textures: verified.inspected.textures, clips: verified.inspected.clips, report: verified.inspected.report},
  normalization: prepared.normalized, budget: heroModelBudgetIssues(verified.inspected), warnings: prepared.warnings, khronos,
  limitations: spec.limitations,
  result: {currentGgdContractAccepted: true, runtimeRegistered: false, backendSelectable: false, deployed: false},
};
writeFileSync(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({candidateId, modelKey: prepared.document.id, sha256: digest(prepared.bytes), bytes: prepared.bytes.length, clipMap: prepared.model.clipMap, warnings: prepared.warnings}));
