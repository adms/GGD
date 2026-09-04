#!/usr/bin/env node
import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { classifyVisualAcceptanceIssues } from "../../apps/editor/src/vfx-forge/visualAcceptanceIssues.ts";
import { mergeAcceptanceFixtureVisualGaps } from "../../apps/editor/src/vfx-forge/acceptanceVisualGaps.ts";

const SCHEMA = "ggd-editor-basic-visual-proof@1";
const MANIFEST_SCHEMA = "ggd-editor-basic-visual-proof-manifest@1";

function fail(message) {
  throw new Error(`[editor-proof-merge] ${message}`);
}

function validateProof(value, label, acceptedSchemas = [SCHEMA]) {
  if (!value || typeof value !== "object" || !acceptedSchemas.includes(value.schema)) {
    fail(`${label}: schema 必須是 ${acceptedSchemas.join(" 或 ")}`);
  }
  if (!Array.isArray(value.cases)) fail(`${label}: cases 必須是陣列`);
  const ids = new Set();
  for (const row of value.cases) {
    const id = typeof row?.id === "string" ? row.id.trim() : "";
    if (!id) fail(`${label}: case 缺少 id`);
    if (ids.has(id)) fail(`${label}: case id 重複：${id}`);
    ids.add(id);
  }
  return ids;
}

export function mergeVisualProof(base, patch) {
  const baseIds = validateProof(base, "base");
  const patchIds = validateProof(patch, "patch");
  if (patchIds.size === 0) fail("patch 沒有案例");
  for (const id of patchIds) if (!baseIds.has(id)) fail(`patch 含有 base 沒有的案例：${id}`);
  const replacements = new Map(patch.cases.map((row) => [row.id, row]));
  const cases = refreshDerivedCases(base.cases.map((row) => replacements.get(row.id) ?? row));
  return {
    ...base,
    generatedAt: patch.generatedAt ?? base.generatedAt,
    cases,
    mergeReceipt: {
      schema: "ggd-editor-basic-visual-proof-merge@1",
      baseGeneratedAt: base.generatedAt ?? null,
      patchGeneratedAt: patch.generatedAt ?? null,
      replacedIds: [...patchIds].sort(),
    },
  };
}

/**
 * Recompute only deterministic annotations. Frame bytes, audit measurements
 * and human verdicts remain untouched, so a classifier/brick catalogue change
 * never forces another 46-case GPU capture.
 */
export function refreshVisualProofDerivedData(base) {
  validateProof(base, "base", [SCHEMA, MANIFEST_SCHEMA]);
  return { ...base, cases: refreshDerivedCases(base.cases) };
}

function refreshDerivedCases(cases) {
  return cases.map((row) => {
    const blockers = mergeAcceptanceFixtureVisualGaps(
      row.id,
      Array.isArray(row.blockers) ? row.blockers.map(String) : [],
    );
    return {
      ...row,
      blockers,
      machineIssues: classifyVisualAcceptanceIssues({ ...row, blockers }),
    };
  });
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv.includes("--self-test")) {
  const base = { schema: SCHEMA, generatedAt: "base", cases: [
    { id: "a", n: 1, status: "failed", blockers: ["unclassified gpu error"] },
    { id: "b", n: 2, status: "captured", blockers: ["Main 缺少連續實心光束視覺積木"] },
  ] };
  const patch = { schema: SCHEMA, generatedAt: "patch", cases: [
    { id: "b", n: 3, status: "captured", blockers: ["Main 缺少連續實心光束視覺積木"] },
  ] };
  const merged = mergeVisualProof(base, patch);
  assert.equal(merged.cases[0].n, 1);
  assert.equal(merged.cases[0].machineIssues[0].code, "GPU_CAPTURE");
  assert.equal(merged.cases[1].n, 3);
  assert.deepEqual(merged.cases[1].machineIssues.map((issue) => issue.code), ["MISSING_VISUAL_BRICK"]);
  assert.equal(merged.cases[1].machineIssues[0].brickId, "solid-beam");
  assert.deepEqual(merged.mergeReceipt.replacedIds, ["b"]);
  const refreshed = refreshVisualProofDerivedData(base);
  assert.equal(refreshed.cases[1].machineIssues[0].brickId, "solid-beam");
  console.log("[editor-proof-merge] self-test passed");
} else {
  const basePath = arg("--base");
  const patchPath = arg("--patch");
  const outPath = arg("--out");
  if (process.argv.includes("--refresh-derived")) {
    if (!basePath || !outPath) {
      fail("用法：pnpm editor:proof:merge -- --refresh-derived --base <full.json> --out <refreshed.json>");
    }
    const base = JSON.parse(readFileSync(resolve(basePath), "utf8"));
    const refreshed = refreshVisualProofDerivedData(base);
    writeFileSync(resolve(outPath), `${JSON.stringify(refreshed, null, 2)}\n`, "utf8");
    console.log(`[editor-proof-merge] 已重算 ${refreshed.cases.length} 份 deterministic machineIssues：${resolve(outPath)}`);
    process.exit(0);
  }
  if (!basePath || !patchPath || !outPath) {
    fail("用法：pnpm editor:proof:merge -- --base <full.json> --patch <focused.json> --out <merged.json>");
  }
  const base = JSON.parse(readFileSync(resolve(basePath), "utf8"));
  const patch = JSON.parse(readFileSync(resolve(patchPath), "utf8"));
  const merged = mergeVisualProof(base, patch);
  writeFileSync(resolve(outPath), `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  console.log(`[editor-proof-merge] ${patch.cases.length} 份聚焦證據已合併，完整案例 ${merged.cases.length} 份：${resolve(outPath)}`);
}
