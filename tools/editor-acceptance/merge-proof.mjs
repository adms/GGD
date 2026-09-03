#!/usr/bin/env node
import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SCHEMA = "ggd-editor-basic-visual-proof@1";

function fail(message) {
  throw new Error(`[editor-proof-merge] ${message}`);
}

function validateProof(value, label) {
  if (!value || typeof value !== "object" || value.schema !== SCHEMA) fail(`${label}: schema 必須是 ${SCHEMA}`);
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
  return {
    ...base,
    generatedAt: patch.generatedAt ?? base.generatedAt,
    cases: base.cases.map((row) => replacements.get(row.id) ?? row),
    mergeReceipt: {
      schema: "ggd-editor-basic-visual-proof-merge@1",
      baseGeneratedAt: base.generatedAt ?? null,
      patchGeneratedAt: patch.generatedAt ?? null,
      replacedIds: [...patchIds].sort(),
    },
  };
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv.includes("--self-test")) {
  const base = { schema: SCHEMA, generatedAt: "base", cases: [{ id: "a", n: 1 }, { id: "b", n: 2 }] };
  const patch = { schema: SCHEMA, generatedAt: "patch", cases: [{ id: "b", n: 3 }] };
  const merged = mergeVisualProof(base, patch);
  assert.deepEqual(merged.cases, [{ id: "a", n: 1 }, { id: "b", n: 3 }]);
  assert.deepEqual(merged.mergeReceipt.replacedIds, ["b"]);
  console.log("[editor-proof-merge] self-test passed");
} else {
  const basePath = arg("--base");
  const patchPath = arg("--patch");
  const outPath = arg("--out");
  if (!basePath || !patchPath || !outPath) {
    fail("用法：pnpm editor:proof:merge -- --base <full.json> --patch <focused.json> --out <merged.json>");
  }
  const base = JSON.parse(readFileSync(resolve(basePath), "utf8"));
  const patch = JSON.parse(readFileSync(resolve(patchPath), "utf8"));
  const merged = mergeVisualProof(base, patch);
  writeFileSync(resolve(outPath), `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  console.log(`[editor-proof-merge] ${patch.cases.length} 份聚焦證據已合併，完整案例 ${merged.cases.length} 份：${resolve(outPath)}`);
}
