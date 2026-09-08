import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), run = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
assert.equal(path.dirname(run), here); assert.equal(path.dirname(out), here); assert(!fs.existsSync(out));
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
async function digest(p) { const h = crypto.createHash('sha256'); for await (const b of fs.createReadStream(p)) h.update(b); return h.digest('hex'); }
const p = read(path.join(run, 'manifest.json')), state = read(path.join(run, 'state.json')), result = read(path.join(run, 'result.json'));
assert.equal(state.status, 'completed-pilot-not-promoted'); assert.equal(state.workerPid, null);
assert.equal(result.steps, p.steps); assert(result.adapterReloadVerified && !result.modelPromoted && !result.releaseQualified);
assert.equal(await digest(path.join(here, 'lora-facts-pilot.py')), p.workerSha256);
assert.equal(await digest(path.join(here, 'gpu-smoke.py')), p.baseSupervisorSha256);
assert.equal(await digest(path.join(run, 'manifest.json')), result.manifestSha256);
for (const [f, h] of Object.entries(p.checkerPins)) assert.equal(await digest(path.join(here, f)), h);
const preflight = read(path.join(here, 'gpu-preflight-v1.json')), originals = [];
for (const f of preflight.files) {
  assert.equal(await digest(path.join(p.modelDirectory, f.name)), f.sha256, `BASE_MODEL_CHANGED:${f.name}`);
  originals.push({ name: f.name, unchanged: true });
}
const checkpoints = read(path.join(run, 'checkpoints.json'));
assert.deepEqual(checkpoints.map(c => c.step), [6, 12, 18, 24]);
for (const c of checkpoints) assert.equal(await digest(path.join(run, c.path, 'adapters.safetensors')), c.sha256);
const rows = [];
for (const [kind, count] of [['facts', 16], ['whole_hero', 4]]) {
  const raw = read(path.join(run, `${kind}-raw.json`)); assert(raw.complete); assert.equal(raw.results.length, count);
  for (const row of raw.results) {
    assert.equal(row.adapterSha256, result.checkpoint.sha256);
    rows.push({ kind, id: row.id, seconds: row.seconds, promptTokens: row.promptTokens,
      generationTokens: row.generationTokens, peakMetalGiB: row.peakMetalBytes / 1024 ** 3, finishReason: row.envelope.finishReason });
  }
}
const samples = [state.preflight, ...state.samples], gib = 1024 ** 3;
assert(samples.every(s => s.acPower && s.availableBytes >= p.guard.minAvailableGiB * gib));
assert(Math.max(...samples.map(s => s.swapUsedBytes - state.preflight.swapUsedBytes)) <= p.guard.maxSwapGrowthGiB * gib);
assert(state.preflight.batteryPercent - Math.min(...samples.map(s => s.batteryPercent)) < p.guard.maxBatteryDropPoints);
const receipt = { schema: 'ggd-hero12b-lora-pilot-verification@1', createdAt: new Date().toISOString(),
  run: path.basename(run), allElevenBaseFilesUnchanged: originals, checkerPinsVerified: true,
  ownWorkerFinished: true, sharedGpuLockAbsentAtVerification: !fs.existsSync('/private/tmp/ggd-forge-training-runtime/gpu.lock'),
  supervisedSeconds: state.finishedAt - state.startedAt,
  resources: { samples: samples.length, acAllSamples: true, minimumBatteryPercent: Math.min(...samples.map(s => s.batteryPercent)),
    minimumAvailableGiB: Math.min(...samples.map(s => s.availableBytes)) / gib,
    initialSwapGiB: state.preflight.swapUsedBytes / gib,
    maxSwapGrowthGiB: Math.max(...samples.map(s => s.swapUsedBytes - state.preflight.swapUsedBytes)) / gib },
  checkpoints, result, inference: rows, modelPromoted: false, releaseQualified: false };
fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ ...receipt, allElevenBaseFilesUnchanged: originals.length, inference: rows.length }, null, 2));
