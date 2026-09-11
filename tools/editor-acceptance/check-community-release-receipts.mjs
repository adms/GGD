import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const reports = path.join(root, "docs/_reports/community-acquired-heroes");
const read = (name) => JSON.parse(fs.readFileSync(path.join(reports, name), "utf8"));
const acquired = read("loopback-release-acquired-34-current.json");
const lolBatch2 = read("loopback-release-lol-batch2-11-current.json");
const canonical = read("loopback-release-canonical-81of81.json");
const currentService = read("loopback-release-current-service-126of126.json");
const statusTable = fs.readFileSync(path.join(root, "docs/editor-contract/社群英雄126名上架狀態.md"), "utf8");
const maxModelBytes = 64 * 1024 * 1024;
const digest = /^sha256:[0-9a-f]{64}$/;

function assertNoSecrets(value, location = "$") {
  if (Array.isArray(value)) return value.forEach((item, index) => assertNoSecrets(item, `${location}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    assert(!/(?:password|secret|access.?token|authorization|credential)/i.test(key), `${location}.${key} must not be committed`);
    assertNoSecrets(item, `${location}.${key}`);
  }
}

for (const report of [acquired, lolBatch2, canonical]) {
  assert.equal(report.schema, "ggd-community-hero-release-check@1");
  assertNoSecrets(report);
  assert.match(report.target.gameRevision, /\S/);
  assert.match(report.target.contentVersion, /^cv_[0-9a-f]+$/);
  assert.match(report.target.migrationFingerprint, /^[0-9a-f]+$/);
  assert.match(report.target.processorFingerprint, /^[0-9a-f]+$/);
}

assert.equal(acquired.status, "passed", "The 34-name run must publish every complete model package");
assert.equal(acquired.selectedIds.length, 34);
assert.equal(acquired.receipts.length, 34);
assert.equal(acquired.passed, 34);
assert.equal(acquired.failed, 0);
for (const receipt of acquired.receipts) {
  assert.equal(receipt.status, "published", `${receipt.id} did not finish publication`);
  assert(receipt.packageArchiveBytes <= maxModelBytes, `${receipt.id} exceeded the complete model-package boundary`);
  assert.match(receipt.packageArchiveSha256, digest);
  assert.match(receipt.submissionId, /^hero-[0-9a-f]{59}$/);
  assert.match(receipt.packageDigest, digest);
  assert.match(receipt.snapshotDigest, digest);
  assert.equal(receipt.slots, 6);
}

assert.equal(acquired.rollback.status, "passed");
assert.equal(acquired.rollback.workId, "acquired-jetragon");
assert.equal(acquired.rollback.restoredSubmissionId, acquired.rollback.v1SubmissionId);
assert.notEqual(acquired.rollback.v2SubmissionId, acquired.rollback.v1SubmissionId);
assert.equal(acquired.rollback.unaffectedWorkId, "acquired-alice");
assert(acquired.rollback.historyCount >= 3);
assert(acquired.rollback.publicationRevision >= 3);

assert.equal(lolBatch2.status, "passed", "The second LoL batch must complete MVP publication");
assert.equal(lolBatch2.selectedIds.length, 11);
assert.equal(lolBatch2.receipts.length, 11);
assert.equal(lolBatch2.passed, 11);
assert.equal(lolBatch2.failed, 0);
for (const receipt of lolBatch2.receipts) {
  assert.equal(receipt.status, "published", `${receipt.id} did not finish publication`);
  assert(receipt.packageArchiveBytes <= maxModelBytes, `${receipt.id} exceeded the complete model-package boundary`);
  assert.match(receipt.packageArchiveSha256, digest);
  assert.match(receipt.submissionId, /^hero-[0-9a-f]{59}$/);
  assert.match(receipt.packageDigest, digest);
  assert.match(receipt.snapshotDigest, digest);
  assert.equal(receipt.slots, 6);
}
assert.equal(lolBatch2.rollback.status, "passed");
assert.equal(lolBatch2.rollback.workId, "lol-sett");
assert.equal(lolBatch2.rollback.restoredSubmissionId, lolBatch2.rollback.v1SubmissionId);
assert.notEqual(lolBatch2.rollback.v2SubmissionId, lolBatch2.rollback.v1SubmissionId);
assert.equal(lolBatch2.rollback.unaffectedWorkId, "lol-ahri");
assert(lolBatch2.rollback.historyCount >= 3);
assert(lolBatch2.rollback.publicationRevision >= 3);

assert.equal(acquired.target.gameRevision, lolBatch2.target.gameRevision);
assert.equal(acquired.target.contentVersion, lolBatch2.target.contentVersion);
assert.equal(acquired.target.migrationFingerprint, lolBatch2.target.migrationFingerprint);
assert.equal(acquired.target.processorFingerprint, lolBatch2.target.processorFingerprint);

assert.equal(canonical.status, "passed", "The canonical migration must publish all 81 existing identities");
assert.match(canonical.scope, /server-authorized canonical takeover/);
assert.equal(canonical.selectedIds.length, 81);
assert.equal(canonical.receipts.length, 81);
assert.equal(canonical.passed, 81);
assert.equal(canonical.failed, 0);
assert(Number.isInteger(canonical.importerRetries) && canonical.importerRetries >= 0);
for (const receipt of canonical.receipts) {
  assert.equal(receipt.status, "published", `${receipt.id} did not finish canonical publication`);
  assert(receipt.packageArchiveBytes <= maxModelBytes, `${receipt.id} exceeded the complete model-package boundary`);
  assert.match(receipt.packageArchiveSha256, digest);
  assert.match(receipt.submissionId, /^hero-[0-9a-f]{59}$/);
  assert.match(receipt.packageDigest, digest);
  assert.match(receipt.snapshotDigest, digest);
  assert.equal(receipt.slots, 6);
}
assert.equal(canonical.rollback.status, "passed");
assert.equal(canonical.rollback.workId, "community-review-01-20260907");
assert.equal(canonical.rollback.restoredSubmissionId, canonical.rollback.v1SubmissionId);
assert.notEqual(canonical.rollback.v2SubmissionId, canonical.rollback.v1SubmissionId);
assert.notEqual(canonical.rollback.unaffectedWorkId, canonical.rollback.workId);
assert(canonical.rollback.historyCount >= 3);
assert(canonical.rollback.publicationRevision >= 3);

function idsInSection(title) {
  const start = statusTable.indexOf(`## ${title}`);
  assert(start >= 0, `Missing status section: ${title}`);
  const end = statusTable.indexOf("\n## ", start + 4);
  const section = statusTable.slice(start, end < 0 ? undefined : end);
  return [...section.matchAll(/\|\s*\d+\s*\|\s*`([^`]+)`\s*\|/g)].map((match) => match[1]);
}
const groups = [
  ["第一批社群英雄（37）", 37],
  ["第二批社群英雄（37）", 37],
  ["LoL 第一批（7）", 7],
  ["LoL 第二批（11）", 11],
  ["已取得模型／重上架舊角（34）", 34],
];
const allIds = groups.flatMap(([title, expected]) => {
  const ids = idsInSection(title);
  assert.equal(ids.length, expected, `${title} count drifted`);
  return ids;
});
const canonicalIds = allIds.slice(0, 81);
const lolBatch2Ids = allIds.slice(81, 92);
const acquiredIds = allIds.slice(92);
assert.equal(canonicalIds.length, 81);
assert.deepEqual(new Set(canonical.selectedIds), new Set(canonicalIds));
assert.deepEqual(new Set(acquired.selectedIds), new Set(acquiredIds));
assert.deepEqual(new Set(lolBatch2.selectedIds), new Set(lolBatch2Ids));
assert.equal(allIds.length, 126);
assert.equal(new Set(allIds).size, 126);
for (const id of canonicalIds) {
  assert(fs.existsSync(path.join(root, "content/champions", `${id}.json`)), `${id} is not in the shipped champion catalog`);
}

assertNoSecrets(currentService);
assert.equal(currentService.schema, "ggd-community-hero-current-service-release@1");
assert.equal(currentService.status, "passed");
assert.equal(currentService.expected, 126);
assert.equal(currentService.published, 126);
assert.deepEqual(currentService.missing, []);
assert.deepEqual(currentService.extra, []);
assert.equal(currentService.batches.canonical81.passed, 81);
assert.equal(currentService.batches.acquired34.passed, 34);
assert.equal(currentService.batches.lolBatch2.passed, 11);
assert.equal(currentService.batches.canonical81.rollback.status, "passed");
assert.equal(currentService.batches.acquired34.rollback.status, "passed");
assert.equal(currentService.batches.lolBatch2.rollback.status, "passed");
assert.deepEqual(new Set(currentService.ids), new Set(allIds));

console.log(JSON.stringify({
  status: "passed",
  loopbackPublished: acquired.passed + lolBatch2.passed + canonical.passed,
  failed: acquired.failed + lolBatch2.failed + canonical.failed,
  acquiredRollback: acquired.rollback.status,
  lolBatch2Rollback: lolBatch2.rollback.status,
  canonicalRollback: canonical.rollback.status,
  canonicalTakeover: canonical.passed,
  catalogIds: allIds.length,
}));
