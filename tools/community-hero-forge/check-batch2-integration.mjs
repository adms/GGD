// Check immutable intake sources and, optionally, their real service receipts.
// This never substitutes receipt inspection for rerunning the service or SimWorld.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const base = resolve(root, 'materials/community-batch2-integration');
const { values } = parseArgs({ options: {
  'service-proof': { type: 'string' }, 'publication-proof': { type: 'string' },
} });
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const lock = read(resolve(base, 'source-lock.json'));
assert.equal(lock.heroCount, 37); assert.equal(lock.slotCount, 222);
assert.equal(lock.heroes.length, 37);
assert.equal(new Set(lock.heroes.map(h => h.id)).size, 37);
for (const s of lock.auxiliarySources) {
  assert(['decisions.json', 'identity-sources.json'].includes(s.path));
  assert.equal(sha(readFileSync(resolve(base, s.path))), s.sha256);
}
for (const h of lock.heroes) {
  assert.match(h.path, /^projects\/b2-[a-z]+\.project\.json$/);
  const raw = readFileSync(resolve(base, h.path)), p = JSON.parse(raw);
  assert.equal(sha(raw), h.sha256, `Original source changed: ${h.id}`);
  assert.equal(p.projectId, h.id); assert.equal(p.brief.name, h.name);
  assert.equal(p.presentation.modelKey, h.modelKey);
  assert.deepEqual(Object.keys(p.acceptedPlan.slots).sort(), ['E', 'EX', 'PASSIVE', 'Q', 'R', 'W']);
}
let service;
if (values['service-proof']) {
  service = read(resolve(root, values['service-proof']));
  assert.equal(service.schema, 'ggd-handoff-service-proof@1');
  assert.equal(service.status, 'passed'); assert.equal(service.passed, 37); assert.equal(service.failed, 0);
  assert.equal(service.results.length, 37);
  assert.equal(new Set(service.results.map(r => r.projectId)).size, 37);
  assert.match(service.origin, /^http:\/\/127\.0\.0\.1:\d+\/api\/v1$/);
  assert(Object.values(service.target).every(value => typeof value === 'string' && value.length > 0 && !value.includes('offline')));
  for (const row of service.results) {
    const h = lock.heroes.find(h => h.id === row.projectId);
    assert(h); assert.equal(row.status, 'passed'); assert.equal(row.slots, 6);
    assert.equal(row.name, h.name); assert.equal(row.modelKey, h.modelKey);
    assert.equal(row.sourceFileSha256, 'sha256:' + h.sha256);
    assert(row.runtimeDocuments > 0 && row.validationDocuments > 0 && row.assets > 0);
    assert.match(row.packageDigest, /^sha256:[a-f0-9]{64}$/);
    assert.match(row.archiveSha256, /^sha256:[a-f0-9]{64}$/);
  }
}
if (values['publication-proof']) {
  assert(service, 'Publication receipts require their matching service proof.');
  const p = read(resolve(root, values['publication-proof']));
  assert.equal(p.schema, 'ggd-handoff-publication-proof@1');
  assert.equal(p.status, 'passed'); assert.equal(p.passed, 37); assert.equal(p.results.length, 37);
  assert.equal(new Set(p.results.map(r => r.workId)).size, 37);
  assert.equal(p.serviceProofSha256, sha(readFileSync(resolve(root, values['service-proof']))));
  assert.deepEqual(p.target, service.target); assert.equal(p.buildOrigin, service.origin);
  assert.match(p.origin, /^http:\/\/127\.0\.0\.1:\d+\/api\/v1$/);
  for (const r of p.results) {
    const s = service.results.find(s => s.projectId === r.workId);
    assert(s); assert.equal(r.status, 'passed'); assert.equal(r.name, s.name);
    assert.equal(r.packageDigest, s.packageDigest); assert.equal(r.sourceDigest, s.sourceDigest);
    assert.equal('sha256:' + r.archiveSha256, s.archiveSha256);
    assert.equal(r.attributedSourceRestored, true);
    assert(r.submissionId && r.versionId && r.publicationRevision > 0);
  }
}
console.log(JSON.stringify({ heroes: 37, slots: 222, sourceFilesUnchanged: true,
  serviceReceipts: service ? 37 : 0, localPublicationReceipts: values['publication-proof'] ? 37 : 0,
  productionDeploymentVerified: false, modelReplacementDeferred: true }));
