#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BRICKS = join(ROOT, "docs/editor-contract/ggd-bricks.json");
const TYPE_CATALOG = join(ROOT, "docs/editor-contract/ggd-type-catalog.json");
const OUTPUT = join(ROOT, "docs/editor-contract/coordination/claim.editor-form-receipts.json");
const CHECK = process.argv.includes("--check");
const { buildEditorFormReceipts } = await tsImport(
  "../../apps/editor/src/form/editorFormReceipts.ts",
  import.meta.url,
);

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : null;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function fail(message) {
  console.error(`FAIL editor form receipts: ${message}`);
  process.exit(1);
}

const existing = existsSync(OUTPUT)
  ? JSON.parse(readFileSync(OUTPUT, "utf8"))
  : null;
const commit = option("--commit") ?? existing?.claims?.[0]?.commit ?? null;
const baseCommit = option("--base-commit") ?? existing?.baseCommit ?? (CHECK ? null : git("rev-parse", "origin/main"));
if (!commit) fail("首次產生要帶 --commit <包含量測器的 commit>");
if (!baseCommit) fail("首次產生要帶 --base-commit <origin/main sha>");

const contract = JSON.parse(readFileSync(BRICKS, "utf8"));
if (contract.schema !== "ggd-bricks@1") fail(`不支援 ${contract.schema}`);

const receipts = buildEditorFormReceipts(contract.bricks);
const countByLayer = Object.fromEntries(
  [...new Set(receipts.map((row) => row.layer))].sort().map((layer) => {
    const rows = receipts.filter((row) => row.layer === layer);
    return [layer, {
      total: rows.length,
      renderable: rows.filter((row) => row.renderable).length,
      missing: rows.filter((row) => !row.renderable).length,
    }];
  }),
);
const renderable = receipts.filter((row) => row.renderable).length;
const missing = receipts.length - renderable;
const proxyByKey = new Map(
  contract.bricks.map((brick) => [`${brick.layer}/${brick.id}`, brick.editorForm]),
);
const proxyDifferences = receipts
  .filter((row) => proxyByKey.get(`${row.layer}/${row.id}`) !== row.renderable)
  .map((row) => ({
    id: row.id,
    layer: row.layer,
    proxy: proxyByKey.get(`${row.layer}/${row.id}`) ?? null,
    measured: row.renderable,
  }));

const packet = {
  schema: "ggd-coord-packet@1",
  dedupeKey: "claim.editor-form-receipts",
  kind: "claim",
  from: "codex",
  to: "main",
  baseCommit,
  contractFingerprint: sha256(TYPE_CATALOG).slice(0, 16),
  title: `Editor 已逐顆量測 ${receipts.length} 顆積木表單：${renderable} 可操作、${missing} fail-closed`,
  claims: [
    {
      kind: "confirmed",
      text:
        `直接執行 Editor 出貨的 schema walker、ConditionEditor 詞彙與 type-catalog ` +
        `選用閘後，${receipts.length} 顆積木中 ${renderable} 顆有真實表單入口、${missing} 顆不可用；` +
        `每一列附實際 React 元件路徑，沒有讀取 ggd-bricks.json 的 editorForm 代理值。` +
        `代理值與量值共有 ${proxyDifferences.length} 列不同。`,
      repro: {
        command: "node tools/skill-forge/build-editor-form-receipts.mjs --check",
        expectedExit: 0,
      },
      commit,
      evidence: [
        "apps/editor/src/form/editorFormReceipts.ts",
        "apps/editor/src/form/editorFormReceipts.test.ts",
        "tools/skill-forge/build-editor-form-receipts.mjs",
        "docs/editor-contract/ggd-bricks.json",
      ],
    },
  ],
  source: {
    bricks: relative(ROOT, BRICKS),
    bricksSha256: sha256(BRICKS),
    capabilityFingerprint: contract.capabilityFingerprint,
    typeCatalog: relative(ROOT, TYPE_CATALOG),
    typeCatalogSha256: sha256(TYPE_CATALOG),
  },
  summary: {
    total: receipts.length,
    renderable,
    missing,
    proxyDifferences: proxyDifferences.length,
    byLayer: countByLayer,
  },
  proxyDifferences,
  receipts,
};

const content = `${JSON.stringify(packet, null, 2)}\n`;
if (CHECK) {
  if (!existsSync(OUTPUT)) fail(`${relative(ROOT, OUTPUT)} 不存在`);
  if (readFileSync(OUTPUT, "utf8") !== content) fail(`${relative(ROOT, OUTPUT)} 已過期`);
  console.log(
    `PASS editor form receipts · ${receipts.length} total · ${renderable} renderable · ${missing} missing`,
  );
} else {
  writeFileSync(OUTPUT, content);
  console.log(
    `WROTE ${relative(ROOT, OUTPUT)} · ${receipts.length} total · ${renderable} renderable · ${missing} missing`,
  );
}
