/** Run the bounded Kirei preflight through GGD's official normalizer and verifier. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join, resolve} from 'node:path';

const [repoArg, stageArg] = process.argv.slice(2);
if (!repoArg || !stageArg) throw Error('usage: prepare_kirei_candidate.mts <repo> <stage>');
const repo = resolve(repoArg), stage = resolve(stageArg);
const inputPath = join(stage, 'preflight.glb'), outputPath = join(stage, 'body.glb');
const sourceSha256 = 'cf5f5d84cf6c8419c8d8a006771d5ce1d6206ddbb97701cb24b8ef4450190ac3';
const expected = [
  ['idle', 'idle'], ['run', 'run2'], ['attack', '2handshoot'],
  ['cast', 'action_wave'], ['hurt', 'gutshot'], ['death', 'die_simple'],
] as const;
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const require = createRequire(join(repo, 'packages/shared/package.json'));
const validator = require('gltf-validator');
const {inspectModelUpload} = await import(join(repo, 'packages/shared/src/content/modelUpload/inspect.ts'));
const {prepareUploadedHeroModel, verifyUploadedHeroModel, heroModelBudgetIssues} = await import(join(repo, 'packages/shared/src/content/modelUpload/heroModel.ts'));
const {MODEL_UPLOAD_LIMITS} = await import(join(repo, 'packages/shared/src/content/modelUpload/glb.ts'));
const {HERO_MODEL_BUDGET} = await import(join(repo, 'packages/shared/src/content/modelUpload/budget.ts'));

mkdirSync(stage, {recursive: true});
const input = new Uint8Array(readFileSync(inputPath));
const before = await inspectModelUpload(input);
assert.deepEqual(before.clips.map((clip: {name: string}) => clip.name), expected.map(([, name]) => name));
assert.equal(before.meshes, 8);
assert.equal(before.json.skins?.length, 1);
assert.equal(before.json.skins?.[0]?.joints.length, 17);
const selections = Object.fromEntries(expected.map(([role], index) => [role, index]));
// The source faces +X (the WebGL proof's +X camera is frontal); GGD's shared
// facing contract uses +90 degrees for +X-authored bodies.
const prepared = await prepareUploadedHeroModel(input, selections, 90);
const verified = await verifyUploadedHeroModel(prepared.model, prepared.bytes);
assert.equal(prepared.normalized.drawCalls.before, 8);
assert.equal(prepared.normalized.drawCalls.after, 4);
assert.deepEqual(prepared.normalized.droppedZeroClips, []);
assert.deepEqual(prepared.model.clipMap, Object.fromEntries(expected));
assert.equal(prepared.model.yawOffsetDeg, 90);
assert.deepEqual(verified.inspected.clips.map((clip: {name: string}) => clip.name), expected.map(([, name]) => name));
assert.deepEqual(heroModelBudgetIssues(verified.inspected).errors, []);
const khronos = await validator.validateBytes(prepared.bytes, {
  uri: 'body.glb', maxIssues: 0, writeTimestamp: false,
  externalResourceFunction: async () => { throw Error('external resources prohibited'); },
});
assert.equal(khronos.issues.numErrors, 0);
assert.equal(khronos.issues.numWarnings, 0);
assert.equal(khronos.issues.truncated, false);
writeFileSync(outputPath, prepared.bytes);
const preflight = JSON.parse(readFileSync(join(stage, 'conversion-preflight.json'), 'utf8'));
assert.equal(preflight.source.sha256, sourceSha256);
const report = {
  schema: 'ggd.fuc-kotomine-kirei-ggd-candidate@1',
  contractCommit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim(),
  tools: {officialPreparation: 'prepareUploadedHeroModel', officialVerification: 'verifyUploadedHeroModel', validator: 'gltf-validator@2.0.0-dev.3.10'},
  actualLimits: {upload: MODEL_UPLOAD_LIMITS, hero: HERO_MODEL_BUDGET},
  source: preflight.source,
  preflight: {path: inputPath, bytes: input.length, sha256: sha256(input), clips: before.clips, triangles: before.triangles, drawPrimitives: before.meshes, textures: before.textures, skinJoints: before.json.skins?.[0]?.joints.length},
  output: {path: outputPath, bytes: prepared.bytes.length, sha256: sha256(prepared.bytes), model: prepared.model, document: prepared.document},
  roleMapping: expected.map(([role, sourceName], selectedIndex) => ({role, selectedIndex, sourceName, origin: 'Sven/GoldSrc community-MOD sequence', fateNative: false, semanticStatus: 'provisional-pending-gameplay-review'})),
  officialNormalization: prepared.normalized,
  ggdInspection: {triangles: verified.inspected.triangles, drawPrimitives: verified.inspected.meshes, textures: verified.inspected.textures, clips: verified.inspected.clips, report: verified.inspected.report, budget: heroModelBudgetIssues(verified.inspected)},
  khronos,
  preservation: {fullSourceAnimationEntries: 349, candidateAnimationEntries: 6, omittedEntriesStillPreservedInFullSource: 343},
  result: {currentGgdContractAccepted: true, khronosErrorsZero: true, khronosWarningsZero: true, fateNativeMotion: false, semanticRoleMappingAccepted: false, gameplayAccepted: false, runtimeRegistered: false, backendSelectable: false, deployed: false},
};
writeFileSync(join(stage, 'preparation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({output: outputPath, sha256: report.output.sha256, bytes: report.output.bytes, clips: report.ggdInspection.clips.map((clip: {name: string}) => clip.name), drawPrimitives: report.ggdInspection.drawPrimitives, triangles: report.ggdInspection.triangles}));
