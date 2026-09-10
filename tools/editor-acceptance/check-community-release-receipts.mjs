import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const reports = path.join(root, "docs/_reports/community-acquired-heroes");
const read = (name) => JSON.parse(fs.readFileSync(path.join(reports, name), "utf8"));
const batch = read("loopback-release-27of34.json");
const rollback = read("loopback-release-rollback.json");
const canonical = read("loopback-release-canonical-id-blocker.json");
const statusTable = fs.readFileSync(path.join(root, "docs/editor-contract/社群英雄126名上架狀態.md"), "utf8");
const maxGeneralBytes = 4 * 1024 * 1024;
const digest = /^sha256:[0-9a-f]{64}$/;

function assertNoSecrets(value, location = "$") {
  if (Array.isArray(value)) return value.forEach((item, index) => assertNoSecrets(item, `${location}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    assert(!/(?:password|secret|access.?token|authorization|credential)/i.test(key), `${location}.${key} must not be committed`);
    assertNoSecrets(item, `${location}.${key}`);
  }
}

for (const report of [batch, rollback, canonical]) {
  assert.equal(report.schema, "ggd-community-hero-release-check@1");
  assertNoSecrets(report);
  assert.equal(report.target.gameRevision, batch.target.gameRevision, "Receipts must use one checked-out target");
  assert.equal(report.target.contentVersion, batch.target.contentVersion, "Receipts must use one content target");
}

assert.equal(batch.status, "failed", "The 34-name run must preserve its seven policy failures");
assert.equal(batch.selectedIds.length, 34);
assert.equal(batch.receipts.length, 34);
assert.equal(batch.passed, 27);
assert.equal(batch.failed, 7);
const expectedOversize = new Set([
  "acquired-alice",
  "acquired-astralym",
  "acquired-cattiva",
  "acquired-inuyasha",
  "acquired-jetragon",
  "godie-e00q",
  "godie-hlgr",
]);
const oversize = batch.receipts.filter((receipt) => receipt.status === "failed");
assert.deepEqual(new Set(oversize.map((receipt) => receipt.id)), expectedOversize);
for (const receipt of oversize) {
  assert(receipt.packageArchiveBytes > maxGeneralBytes, `${receipt.id} must exceed the measured 4 MiB policy boundary`);
  assert.match(receipt.packageArchiveSha256, digest);
  assert.match(receipt.error, /英雄 ZIP 超過目前投稿政策的大小上限/);
}
for (const receipt of batch.receipts.filter((item) => item.status === "published")) {
  assert(receipt.packageArchiveBytes <= maxGeneralBytes, `${receipt.id} unexpectedly exceeded the configured boundary`);
  assert.match(receipt.packageArchiveSha256, digest);
  assert.match(receipt.submissionId, /^hero-[0-9a-f]{59}$/);
  assert.match(receipt.packageDigest, digest);
  assert.match(receipt.snapshotDigest, digest);
  assert.equal(receipt.slots, 6);
}

assert.equal(rollback.status, "passed");
assert.equal(rollback.passed, 2);
assert.equal(rollback.failed, 0);
assert.equal(rollback.rollback.status, "passed");
assert.equal(rollback.rollback.workId, "acquired-dio");
assert.equal(rollback.rollback.restoredSubmissionId, rollback.rollback.v1SubmissionId);
assert.notEqual(rollback.rollback.v2SubmissionId, rollback.rollback.v1SubmissionId);
assert.equal(rollback.rollback.unaffectedWorkId, "acquired-saya");
assert(rollback.rollback.historyCount >= 3);
assert(rollback.rollback.publicationRevision >= 3);

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
  oversize: batch.failed,
  rollback: rollback.rollback.status,
  canonicalBlocked: canonical.failed,
  canonicalCatalogIds: canonicalIds.length,
}));
