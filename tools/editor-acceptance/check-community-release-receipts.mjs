import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const reports = path.join(root, "docs/_reports/community-acquired-heroes");
const read = (name) => JSON.parse(fs.readFileSync(path.join(reports, name), "utf8"));
const batch = read("loopback-release-34of34.json");
const canonical = read("loopback-release-canonical-id-blocker.json");
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

for (const report of [batch, canonical]) {
  assert.equal(report.schema, "ggd-community-hero-release-check@1");
  assertNoSecrets(report);
  assert.equal(report.target.gameRevision, batch.target.gameRevision, "Receipts must use one checked-out target");
  assert.equal(report.target.contentVersion, batch.target.contentVersion, "Receipts must use one content target");
}

assert.equal(batch.status, "passed", "The 34-name run must publish every complete model package");
assert.equal(batch.selectedIds.length, 34);
assert.equal(batch.receipts.length, 34);
assert.equal(batch.passed, 34);
assert.equal(batch.failed, 0);
for (const receipt of batch.receipts) {
  assert.equal(receipt.status, "published", `${receipt.id} did not finish publication`);
  assert(receipt.packageArchiveBytes <= maxModelBytes, `${receipt.id} exceeded the complete model-package boundary`);
  assert.match(receipt.packageArchiveSha256, digest);
  assert.match(receipt.submissionId, /^hero-[0-9a-f]{59}$/);
  assert.match(receipt.packageDigest, digest);
  assert.match(receipt.snapshotDigest, digest);
  assert.equal(receipt.slots, 6);
}

assert.equal(batch.rollback.status, "passed");
assert.equal(batch.rollback.workId, "acquired-dio");
assert.equal(batch.rollback.restoredSubmissionId, batch.rollback.v1SubmissionId);
assert.notEqual(batch.rollback.v2SubmissionId, batch.rollback.v1SubmissionId);
assert.equal(batch.rollback.unaffectedWorkId, "acquired-alice");
assert(batch.rollback.historyCount >= 3);
assert(batch.rollback.publicationRevision >= 3);

assert.equal(canonical.status, "failed");
assert.equal(canonical.selectedIds.length, 2);
assert.equal(canonical.passed, 0);
assert.equal(canonical.failed, 2);
for (const receipt of canonical.receipts) {
  assert.equal(receipt.status, "failed");
  assert.match(receipt.error, /社群作品不能佔用既有官方英雄的身分，請建立改作草稿/);
}

function idsInSection(title) {
  const start = statusTable.indexOf(`## ${title}`);
  assert(start >= 0, `Missing status section: ${title}`);
  const end = statusTable.indexOf("\n## ", start + 4);
  const section = statusTable.slice(start, end < 0 ? undefined : end);
  return [...section.matchAll(/\|\s*\d+\s*\|\s*`([^`]+)`\s*\|/g)].map((match) => match[1]);
}
const canonicalGroups = [
  ["第一批社群英雄（37）", 37],
  ["第二批社群英雄（37）", 37],
  ["LoL 第一批（7）", 7],
];
const canonicalIds = canonicalGroups.flatMap(([title, expected]) => {
  const ids = idsInSection(title);
  assert.equal(ids.length, expected, `${title} count drifted`);
  return ids;
});
assert.equal(canonicalIds.length, 81);
for (const id of canonicalIds) {
  assert(fs.existsSync(path.join(root, "content/champions", `${id}.json`)), `${id} is not in the shipped champion catalog`);
}

console.log(JSON.stringify({
  status: "passed",
  published: batch.passed,
  failed: batch.failed,
  rollback: batch.rollback.status,
  canonicalBlocked: canonical.failed,
  canonicalCatalogIds: canonicalIds.length,
}));
