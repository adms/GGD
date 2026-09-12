import test from "node:test";
import assert from "node:assert/strict";
import { unchangedHistoricalReceipt } from "./editor-form-receipt-history.mjs";

function fixture() {
  return {
    schema: "ggd-coord-packet@1", dedupeKey: "claim.editor-form-receipts", kind: "claim",
    baseCommit: "main-base", contractFingerprint: "a".repeat(16),
    claims: [{ commit: "measurement-commit", repro: { command: "node tools/check.mjs", expectedExit: 0 } }],
    source: { bricks: "docs/editor-contract/ggd-bricks.json", brickInputSha256: "b".repeat(64),
      typeCatalog: "docs/editor-contract/ggd-type-catalog.json", typeCatalogSha256: "a".repeat(64),
      capabilityFingerprint: "dbeac382" },
    summary: { total: 2, renderable: 1, missing: 1 },
    measurementLimits: ["headless React, not a browser verdict"],
    receipts: [{ id: "damage", layer: "effect", renderable: true, parameterEdited: true },
      { id: "test-unavailable", layer: "effect", renderable: false, reason: "missing control" }],
  };
}

test("asset-only capability change preserves exact historical bytes and attribution", () => {
  const historical = fixture();
  const text = JSON.stringify(historical, null, 4) + "\n\n";
  const measured = structuredClone(historical);
  measured.source.capabilityFingerprint = "600485a2";
  const before = structuredClone(measured);
  assert.equal(unchangedHistoricalReceipt(text, measured), text);
  assert.deepEqual(measured, before);
  assert.equal(JSON.parse(text).source.capabilityFingerprint, "dbeac382");
});

test("fully unchanged measurement also preserves exact history", () => {
  const p = fixture(); const text = JSON.stringify(p) + "\n";
  assert.equal(unchangedHistoricalReceipt(text, structuredClone(p)), text);
});

for (const [name, mutate] of [
  ["actual renderability", p => { p.receipts[1].renderable = true; }],
  ["actual parameter editing", p => { p.receipts[0].parameterEdited = false; }],
  ["added measured control", p => { p.receipts.push({ id: "recast", layer: "effect", renderable: true }); }],
  ["brick input SHA", p => { p.source.brickInputSha256 = "c".repeat(64); }],
  ["type catalog SHA", p => { p.source.typeCatalogSha256 = "d".repeat(64); }],
  ["input source path", p => { p.source.bricks = "docs/other.json"; }],
  ["measurement limit", p => { p.measurementLimits = ["browser verified"]; }],
  ["claim attribution", p => { p.claims[0].commit = "different-commit"; }],
  ["base commit", p => { p.baseCommit = "different-base"; }],
  ["repro expectation", p => { p.claims[0].repro.expectedExit = 1; }],
  ["claim identity", p => { p.dedupeKey = "claim.different"; }],
  ["new source evidence", p => { p.source.newEvidenceSha256 = "e".repeat(64); }],
  ["count summary", p => { p.summary.renderable = 2; }],
]) test(`rejects changed ${name} even with an unrelated fingerprint change`, () => {
  const old = fixture(); const current = structuredClone(old);
  current.source.capabilityFingerprint = "600485a2"; mutate(current);
  assert.equal(unchangedHistoricalReceipt(JSON.stringify(old), current), null);
});

for (const [name, transform] of [
  ["missing brick hash", p => { delete p.source.brickInputSha256; }],
  ["malformed catalog hash", p => { p.source.typeCatalogSha256 = "unverified"; }],
  ["empty receipts", p => { p.receipts = []; }],
  ["missing capability fingerprint", p => { delete p.source.capabilityFingerprint; }],
]) test(`incomplete historical/current evidence fails closed: ${name}`, () => {
  const p = fixture(); transform(p);
  assert.equal(unchangedHistoricalReceipt(JSON.stringify(p), structuredClone(p)), null);
});

test("unavailable or malformed origin/main evidence cannot authorize historical reuse", () => {
  for (const old of [null, undefined, "", "{", "null", "[]"]) {
    assert.equal(unchangedHistoricalReceipt(old, fixture()), null);
  }
});
