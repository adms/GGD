/** Replay a completed run in the byte-pinned engine copy; no source restoration in the live checkout. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha } from './intake.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
assert.equal(process.argv.length, 5);
const run = path.resolve(process.argv[2]), isolation = path.resolve(process.argv[3]), out = path.resolve(process.argv[4]);
for (const p of [run, isolation, out]) assert.equal(path.dirname(p), here);
assert(!fs.existsSync(out), 'REFUSE_OVERWRITE');
const state = JSON.parse(fs.readFileSync(path.join(run, 'state.json'), 'utf8'));
assert.equal(state.status, 'completed-pilot-not-promoted'); assert.equal(state.workerPid, null);
const receipt = JSON.parse(fs.readFileSync(path.join(isolation, 'COPY_RECEIPT.json'), 'utf8'));
assert.equal(receipt.root, isolation);
const remoteRun = path.join(receipt.researchDirectory, path.basename(run));
function syncNew(source, destination) {
  if (fs.statSync(source).isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const f of fs.readdirSync(source)) syncNew(path.join(source, f), path.join(destination, f));
  } else if (fs.existsSync(destination)) assert.equal(sha(fs.readFileSync(destination)), sha(fs.readFileSync(source)), 'IMMUTABLE_COPY_DRIFT');
  else fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
}
syncNew(run, remoteRun);
const isolatedAssessment = path.join(receipt.researchDirectory, path.basename(out));
const result = execFileSync(process.execPath, ['--import', 'tsx', path.join(receipt.researchDirectory, 'evaluate-lora-pilot.mts'),
  remoteRun, isolatedAssessment], { cwd: path.join(isolation, 'GGD-community-hero-forge'), timeout: 120000, maxBuffer: 10 * 1024 ** 2 });
fs.cpSync(isolatedAssessment, out, { recursive: true, errorOnExist: true, force: false });
fs.writeFileSync(path.join(out, 'ENGINE_ISOLATION.json'), JSON.stringify({ ...receipt,
  evaluatorSha256: sha(fs.readFileSync(path.join(receipt.researchDirectory, 'evaluate-lora-pilot.mts'))),
  canonicalRunManifestSha256: sha(fs.readFileSync(path.join(run, 'manifest.json'))),
  newRunCopiedByteExactly: true, baselineReplayedWithSameFrozenEngineAsAfter: true,
  installedDependenciesLinked: true, currentLiveEngineQualification: false }, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(result);
